"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { entries, platforms, versions, works } from "@/lib/db/schema";
import { getGameById } from "@/lib/igdb/games";
import {
  primaryPlatformFor,
  releaseDateFor,
  slugify,
  sortTitleFor,
  workKindFor,
} from "@/lib/igdb/mapping";
import { igdbImageUrl, IgdbError } from "@/lib/igdb/types";

export type AddState = { ok: boolean; message: string } | null;

export async function addToShelf(_prev: AddState, formData: FormData): Promise<AddState> {
  const user = await requireUser();

  const igdbId = Number(formData.get("igdbId"));
  if (!Number.isInteger(igdbId) || igdbId <= 0) {
    return { ok: false, message: "Bad request." };
  }

  let game;
  try {
    // Refetched rather than passed through the form: this is the payload stored
    // in igdb_payload, and a client-supplied copy is not something to trust.
    game = await getGameById(igdbId);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof IgdbError ? `IGDB request failed (${err.status ?? "no response"}).` : "IGDB request failed.",
    };
  }

  if (!game) {
    return { ok: false, message: "IGDB no longer has that game." };
  }

  const outcome = await db.transaction(async (tx) => {
    const igdbPlatform = primaryPlatformFor(game);
    let platformId: number | null = null;

    if (igdbPlatform) {
      const [row] = await tx
        .insert(platforms)
        .values({
          igdbId: igdbPlatform.id,
          name: igdbPlatform.name,
          abbreviation: igdbPlatform.abbreviation ?? null,
          source: "igdb",
        })
        .onConflictDoUpdate({
          target: platforms.igdbId,
          set: { name: igdbPlatform.name, abbreviation: igdbPlatform.abbreviation ?? null },
        })
        .returning({ id: platforms.id });
      platformId = row.id;
    }

    let [work] = await tx
      .select({ id: works.id, coverUrl: works.coverUrl })
      .from(works)
      .where(eq(works.igdbId, game.id));

    if (!work) {
      const base = game.slug ? slugify(game.slug) : slugify(game.name);
      const [clash] = await tx.select({ id: works.id }).from(works).where(eq(works.slug, base));

      // DLC and expansions hang off the base game, but only if that game is
      // already here — we do not fetch parents uninvited. A main_game never has
      // a parent, which the works_parent_required check also enforces.
      const kind = workKindFor(game);
      let parentWorkId: string | null = null;

      if (kind !== "main_game" && game.parent_game) {
        const [parent] = await tx
          .select({ id: works.id })
          .from(works)
          .where(eq(works.igdbId, game.parent_game));
        parentWorkId = parent?.id ?? null;
      }

      [work] = await tx
        .insert(works)
        .values({
          igdbId: game.id,
          // IGDB slugs are unique upstream, but a local work may already hold
          // this one. The IGDB id is the tiebreak that cannot collide.
          slug: clash ? `${base}-${game.id}` : base,
          title: game.name,
          sortTitle: sortTitleFor(game.name),
          summary: game.summary ?? null,
          firstReleaseDate: releaseDateFor(game),
          workKind: kind,
          parentWorkId,
          igdbPayload: game,
          igdbSyncedAt: new Date(),
          source: "igdb",
          createdBy: user.id,
        })
        .returning({ id: works.id, coverUrl: works.coverUrl });
    }

    // One 'original' version per work from this flow. Ports, romhacks and the
    // rest arrive through "add version", which is a different door.
    let [version] = await tx
      .select({ id: versions.id })
      .from(versions)
      .where(and(eq(versions.workId, work.id), eq(versions.kind, "original")));

    if (!version) {
      [version] = await tx
        .insert(versions)
        .values({
          workId: work.id,
          name: igdbPlatform?.abbreviation ?? igdbPlatform?.name ?? "Original release",
          kind: "original",
          platformId,
          releaseDate: releaseDateFor(game),
          igdbId: game.id,
          source: "igdb",
          createdBy: user.id,
        })
        .returning({ id: versions.id });
    }

    const inserted = await tx
      .insert(entries)
      .values({ userId: user.id, versionId: version.id, status: "backlog" })
      .onConflictDoNothing()
      .returning({ id: entries.id });

    return {
      workId: work.id,
      added: inserted.length > 0,
      needsCover: !work.coverUrl && Boolean(game.cover),
    };
  });

  // Outside the transaction on purpose: this is network I/O that should not
  // hold a database transaction open, and a failed download must not roll back
  // an otherwise correct shelf row.
  if (outcome.needsCover && game.cover) {
    const filename = await downloadCover(igdbImageUrl(game.cover.image_id, "cover_big"), outcome.workId);
    if (filename) {
      await db
        .update(works)
        .set({ coverUrl: `/covers/${filename}`, coverSource: "igdb" })
        .where(eq(works.id, outcome.workId));
    }
  }

  revalidatePath("/");

  return outcome.added
    ? { ok: true, message: "Added to shelf" }
    : { ok: true, message: "Already on your shelf" };
}
