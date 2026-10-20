"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { entries, versions, works } from "@/lib/db/schema";
import { setDlcOnShelf } from "@/lib/dlc";
import { addFromIgdb, applySgdbArt } from "@/lib/entries/add";
import { slugify } from "@/lib/igdb/mapping";
import { IgdbError } from "@/lib/igdb/types";
import { isStatus } from "@/lib/status";

function refresh(slug: string): void {
  revalidatePath("/");
  revalidatePath(`/work/${slug}`);
  revalidatePath("/version/[id]", "page");
}

/**
 * A game's DLC under it, or on the shelf as games of their own. The game's
 * setting rather than yours, as its series is: on a server with more than one
 * of you, Destiny 2's expansions are separate games for everyone or no one.
 */
export async function setDlcShown(formData: FormData): Promise<void> {
  await requireUser();
  const workId = String(formData.get("workId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!workId) return;
  await setDlcOnShelf(workId, formData.get("show") === "true");
  refresh(slug);
}

/**
 * For DLC shelved before DLC lived under its game, whose game is not here: the
 * game is brought in from IGDB (not shelved) and the DLC attaches to it.
 */
export async function bringInGame(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const parentIgdbId = Number(formData.get("parentIgdbId"));
  if (!Number.isInteger(parentIgdbId) || parentIgdbId <= 0) return;
  try {
    await addFromIgdb(user.id, { igdbId: parentIgdbId, status: null });
  } catch (err) {
    // Offline is not an error page: the button is still there to try again.
    if (!(err instanceof IgdbError)) throw err;
    return;
  }
  refresh(slug);
}

/**
 * DLC IGDB does not list, made by hand under the game: a local work hanging
 * off it, with one version on the game's own platform, and your entry. The
 * same three rows any add makes; nothing about it is second-class.
 */
export async function addDlcByHand(formData: FormData): Promise<void> {
  const user = await requireUser();
  const gameId = String(formData.get("workId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const kind = formData.get("kind") === "expansion" ? "expansion" : "dlc";
  const asked = formData.get("status");
  const status = isStatus(asked) ? asked : "backlog";
  if (!gameId || !name) return;

  const outcome = await db.transaction(async (tx) => {
    const [game] = await tx.select({ id: works.id, slug: works.slug }).from(works).where(eq(works.id, gameId));
    if (!game) return null;

    // The DLC is played where the game is, so it starts on the game's platform.
    const [gameVersion] = await tx
      .select({ platformId: versions.platformId })
      .from(versions)
      .where(eq(versions.workId, game.id))
      .orderBy(asc(versions.createdAt))
      .limit(1);

    const base = slugify(name);
    const [clash] = await tx.select({ id: works.id }).from(works).where(eq(works.slug, base));
    const [work] = await tx
      .insert(works)
      .values({
        slug: clash ? `${base}-${Date.now().toString(36)}` : base,
        title: name,
        workKind: kind,
        parentWorkId: game.id,
        source: "local",
        createdBy: user.id,
      })
      .returning({ id: works.id });

    const [version] = await tx
      .insert(versions)
      .values({
        workId: work.id,
        name: "Original release",
        kind: "original",
        platformId: gameVersion?.platformId ?? null,
        source: "local",
        createdBy: user.id,
      })
      .returning({ id: versions.id });

    await tx.insert(entries).values({ userId: user.id, versionId: version.id, status }).onConflictDoNothing();

    return { gameSlug: game.slug, workId: work.id, versionId: version.id };
  });
  if (!outcome) return;

  // As homebrew: a local work has no IGDB cover, so SteamGridDB is asked once.
  await applySgdbArt(outcome.workId, name);

  refresh(outcome.gameSlug);
  redirect(`/version/${outcome.versionId}`);
}

