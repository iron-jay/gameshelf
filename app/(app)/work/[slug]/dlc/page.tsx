import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { dlcChoices } from "@/lib/dlc-add";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/status";

import { addHref } from "../../../add/igdb/[id]/href";
import { addDlcByHand } from "../dlc-actions";
import type { Metadata } from "next";
import { workTitle } from "../../../page-titles";

export const dynamic = "force-dynamic";

/**
 * Door B for DLC: the game is known, so what IGDB hangs off it is listed to
 * add straight onto the shelf, under the game. Anything it does not list is
 * made by hand below, the same as any local release.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return workTitle((await params).slug, "Add DLC for");
}

export default async function AddDlcPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;

  const choices = await dlcChoices(user.id, slug);
  if (!choices) notFound();
  const { game, notice, groups } = choices;

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

      {choices.noneListed ? (
        <p className="mb-6 font-narrow text-ink-dim">IGDB lists no DLC for {game.title}.</p>
      ) : null}

      {groups.map((group) => (
        <section key={group.title} className="mb-8">
          <h2 className="mb-1 font-display text-xl">{group.title}</h2>
          <ul className="flex flex-col">
            {group.items.map(({ result, name, kindLabel, platformId, known }) => {
              return (
                <li
                  key={result.id}
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
                    <p className="truncate font-semibold">{name}</p>
                    <p className="font-narrow text-ink-dim">
                      {[kindLabel, result.year].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {known ? (
                    <Link
                      href={`/version/${known.versionId}`}
                      className="font-narrow text-ink-dim underline underline-offset-4 hover:text-ink"
                    >
                      {known.status
                        ? `On your shelf: ${STATUS_LABELS[known.status]}`
                        : "Here, not on your shelf"}
                    </Link>
                  ) : (
                    <Link
                      href={addHref(result.id, {
                        back: `/work/${game.slug}/dlc`,
                        platformId,
                      })}
                      className="btn btn-primary"
                    >
                      Add
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="max-w-xl">
        <h2 className="mb-1 font-display text-xl">{groups.length ? "Not listed?" : "Add it by hand"}</h2>
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
