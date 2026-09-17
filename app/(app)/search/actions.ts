"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { entries, platforms, versions, works } from "@/lib/db/schema";
import { getGameById } from "@/lib/igdb/games";
import { originalVersionName, releaseDateFor } from "@/lib/igdb/mapping";
import { igdbImageUrl, IgdbError } from "@/lib/igdb/types";
import { ensureWorkFromIgdb, primaryPlatformFor, upsertPlatform } from "@/lib/works/ensure";

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
      message:
        err instanceof IgdbError
          ? `IGDB request failed (${err.status ?? "no response"}).`
          : "IGDB request failed.",
    };
  }

  if (!game) {
    return { ok: false, message: "IGDB no longer has that game." };
  }

  // Whichever release the picker was on, checked against the game IGDB just
  // returned rather than believed. Untouched, or absent with scripting off, it
  // falls back to the same earliest-release guess as before.
  const chosen = Number(formData.get("platformId"));
  const igdbPlatform =
    (game.platforms ?? []).find((platform) => platform.id === chosen) ?? primaryPlatformFor(game);

  const outcome = await db.transaction(async (tx) => {
    const platformId = await upsertPlatform(tx, igdbPlatform);
    const work = await ensureWorkFromIgdb(tx, game, user.id);

    // One 'original' version per work from this flow. Ports, romhacks and the
    // rest arrive through the version form, which is a different door.
    const [existing] = await tx
      .select({ id: versions.id, platformName: platforms.name })
      .from(versions)
      .leftJoin(platforms, eq(platforms.id, versions.platformId))
      .where(and(eq(versions.workId, work.id), eq(versions.kind, "original")));

    let versionId = existing?.id;

    if (!versionId) {
      const [created] = await tx
        .insert(versions)
        .values({
          workId: work.id,
          name: originalVersionName(igdbPlatform),
          kind: "original",
          platformId,
          releaseDate: releaseDateFor(game),
          igdbId: game.id,
          source: "igdb",
          createdBy: user.id,
        })
        .returning({ id: versions.id });
      versionId = created.id;
    }

    const inserted = await tx
      .insert(entries)
      .values({ userId: user.id, versionId, status: "backlog" })
      .onConflictDoNothing()
      .returning({ id: entries.id });

    return {
      workId: work.id,
      added: inserted.length > 0,
      // The original version already existed, so the platform picked was not
      // applied to it. Saying which one it is beats letting the choice look
      // like it took.
      keptOn:
        existing && existing.platformName !== igdbPlatform?.name ? existing.platformName : null,
      needsCover: !work.coverUrl && Boolean(game.cover),
    };
  });

  // Outside the transaction on purpose: this is network I/O that should not
  // hold a database transaction open, and a failed download must not roll back
  // an otherwise correct shelf row.
  if (outcome.needsCover && game.cover) {
    const filename = await downloadCover(
      igdbImageUrl(game.cover.image_id, "cover_big"),
      outcome.workId,
    );
    if (filename) {
      await db
        .update(works)
        .set({ coverUrl: `/covers/${filename}`, coverSource: "igdb" })
        .where(eq(works.id, outcome.workId));
    }
  }

  revalidatePath("/");

  const where = outcome.keptOn ? `, on ${outcome.keptOn}` : "";

  return outcome.added
    ? { ok: true, message: `Added to shelf${where}` }
    : { ok: true, message: `Already on your shelf${where}` };
}
