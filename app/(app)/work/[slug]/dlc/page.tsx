import { and, asc, eq, inArray } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { entries, platforms, versions, works } from "@/lib/db/schema";
import { shortDlcTitle } from "@/lib/dlc";
import { workKindFor } from "@/lib/igdb/mapping";
import { dlcOfGame } from "@/lib/igdb/search";
import { IgdbError, IgdbNotConfiguredError, type IgdbGame } from "@/lib/igdb/types";
import { igdbResultFor } from "@/lib/search";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/status";

import { AddButton } from "../../../search/add-button";
import { addDlcByHand } from "../dlc-actions";

export const dynamic = "force-dynamic";

/**
 * Door B for DLC: the game is known, so what IGDB hangs off it is listed to
 * add straight onto the shelf, under the game. Anything it does not list is
 * made by hand below, the same as any local release.
 */
export default async function AddDlcPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;

  const [game] = await db
    .select({ id: works.id, slug: works.slug, title: works.title, igdbId: works.igdbId })
    .from(works)
    .where(eq(works.slug, slug));
  if (!game) notFound();

  // DLC is played where the game is, so the picker starts on the game's
  // platform when the DLC came out there too, not on IGDB's earliest release.
  const [gamePlatform] = await db
    .select({ igdbId: platforms.igdbId })
    .from(versions)
    .innerJoin(platforms, eq(platforms.id, versions.platformId))
    .where(eq(versions.workId, game.id))
    .orderBy(asc(versions.createdAt))
    .limit(1);

  let listed: IgdbGame[] = [];
  let notice: string | null = null;
  if (game.igdbId) {
    try {
      listed = await dlcOfGame(game.igdbId);
    } catch (err) {
      notice =
        err instanceof IgdbNotConfiguredError
          ? "IGDB credentials are not set, so its DLC cannot be listed. You can still add it by hand."
          : err instanceof IgdbError
            ? `IGDB could not be reached (${err.status ?? "no response"}). You can still add DLC by hand.`
            : "IGDB could not be reached. You can still add DLC by hand.";
    }
  }

  // Which of those are here already, and which of those you have shelved, so
  // each opens rather than offering to add it twice.
  const here = listed.length
    ? await db
        .select({ igdbId: works.igdbId, versionId: versions.id, status: entries.status })
        .from(works)
        .innerJoin(versions, eq(versions.workId, works.id))
        .leftJoin(entries, and(eq(entries.versionId, versions.id), eq(entries.userId, user.id)))
        .where(
          inArray(
            works.igdbId,
            listed.map((item) => item.id),
          ),
        )
    : [];
  const hereById = new Map<number, { versionId: string; status: string | null }>();
  for (const row of here) {
    if (row.igdbId === null) continue;
    const known = hereById.get(row.igdbId);
    if (!known || (!known.status && row.status)) hereById.set(row.igdbId, { versionId: row.versionId, status: row.status });
  }

  // Destiny 2 has more seasons than expansions. They are DLC too, but a list
  // that leads with twenty of them buries the four you came for.
  const isSeason = (item: IgdbGame) => ["season", "episode"].includes(workKindFor(item));
  const groups = [
    { title: "Expansions and DLC", items: listed.filter((item) => !isSeason(item)) },
    { title: "Seasons and episodes", items: listed.filter(isSeason) },
  ].filter((group) => group.items.length > 0);

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={`/work/${game.slug}`} className="underline">
          {game.title}
        </Link>
      </p>
      <h1 className="mb-6 font-display text-3xl">Add DLC</h1>

      {notice ? (
        <p role="status" className="mb-6 border-l-2 border-ink-dim pl-3 font-narrow">
          {notice}
        </p>
      ) : null}

      {game.igdbId && !notice && listed.length === 0 ? (
        <p className="mb-6 font-narrow text-ink-dim">IGDB lists no DLC for {game.title}.</p>
      ) : null}

      {groups.map((group) => (
        <section key={group.title} className="mb-8">
          <h2 className="mb-1 font-display text-xl">{group.title}</h2>
          <ul className="flex flex-col">
            {group.items.map((item) => {
              const result = igdbResultFor(item);
              const known = hereById.get(item.id);
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3"
                >
                  <div className="h-16 w-12 shrink-0 bg-panel">
                    {result.coverUrl ? (
                      <Image
                        src={result.coverUrl}
                        alt=""
                        width={48}
                        height={64}
                        className="h-16 w-12 object-cover"
                        unoptimized
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{shortDlcTitle(item.name, game.title)}</p>
                    <p className="font-narrow text-ink-dim">
                      {[workKindFor(item).replace(/_/g, " "), result.year].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {known ? (
                    <Link
                      href={`/version/${known.versionId}`}
                      className="font-narrow text-ink-dim underline underline-offset-4 hover:text-ink"
                    >
                      {known.status
                        ? `On your shelf: ${STATUS_LABELS[known.status as keyof typeof STATUS_LABELS]}`
                        : "Here, not on your shelf"}
                    </Link>
                  ) : (
                    <AddButton
                      igdbId={result.id}
                      platforms={result.platformOptions}
                      defaultPlatformId={
                        result.platformOptions.some((option) => option.id === gamePlatform?.igdbId)
                          ? (gamePlatform?.igdbId ?? null)
                          : result.defaultPlatformId
                      }
                      statuses={STATUS_ORDER}
                      defaultStatus={result.defaultStatus}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="max-w-xl">
        <h2 className="mb-1 font-display text-xl">{listed.length ? "Not listed?" : "Add it by hand"}</h2>
        <p className="mb-3 font-narrow text-ink-dim">
          It goes under {game.title}, with its own shelf, rating and review.
        </p>
        <form action={addDlcByHand} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="workId" value={game.id} />
          <label className="min-w-0 flex-1 basis-60">
            <span className="sr-only">Name</span>
            <input name="name" required maxLength={200} placeholder="Name of the DLC" className="field" />
          </label>
          <label>
            <span className="sr-only">Kind</span>
            <select name="kind" defaultValue="dlc" className="field">
              <option value="dlc">DLC</option>
              <option value="expansion">Expansion</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Shelf</span>
            <select name="status" defaultValue="backlog" className="field">
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </form>
      </section>
    </main>
  );
}
