import Link from "next/link";

import type { Removal } from "@/lib/works/removal";

/**
 * Says what a delete takes with it. Shared by the version and work confirmation
 * pages so the two cannot describe the same cascade differently.
 */
export function RemovalSummary({ removal }: { removal: Removal }) {
  const lines: string[] = [];

  if (removal.works.length > 0) {
    lines.push(`${removal.works.length} ${removal.works.length === 1 ? "work" : "works"}`);
  }
  lines.push(`${removal.versionCount} ${removal.versionCount === 1 ? "version" : "versions"}`);
  lines.push(
    `${removal.entryCount} shelf ${removal.entryCount === 1 ? "entry" : "entries"}`,
  );
  if (removal.playCount > 0) {
    lines.push(`${removal.playCount} recorded ${removal.playCount === 1 ? "play" : "plays"}`);
  }
  if (removal.shelfLinkCount > 0) {
    lines.push(
      `${removal.shelfLinkCount} shelf ${removal.shelfLinkCount === 1 ? "tag" : "tags"}`,
    );
  }
  if (removal.coverFiles.length > 0) {
    lines.push(
      `${removal.coverFiles.length} cover ${removal.coverFiles.length === 1 ? "file" : "files"}`,
    );
  }

  return (
    <div className="max-w-2xl">
      <p className="font-narrow">This removes {lines.join(", ")}.</p>

      {removal.works.length > 1 ? (
        <ul className="mt-3 flex flex-col border-t border-line">
          {removal.works.map((work) => (
            <li key={work.id} className="border-b border-line py-2 font-narrow">
              {work.title}
            </li>
          ))}
        </ul>
      ) : null}

      {/* base_version_id is ON DELETE SET NULL, so these survive but stop
          recording what they were built on. Worth saying before, not after. */}
      {removal.dependentVersions.length > 0 ? (
        <div className="mt-4 border-l-2 border-ink-dim pl-3">
          <p className="font-narrow">
            {removal.dependentVersions.length === 1 ? "One version is" : "These versions are"} built
            on what you are deleting. {removal.dependentVersions.length === 1 ? "It" : "They"} will
            stay, but stop recording what {removal.dependentVersions.length === 1 ? "it patches" : "they patch"}.
          </p>
          <ul className="mt-2 flex flex-col">
            {removal.dependentVersions.map((version) => (
              <li key={version.id} className="font-narrow text-ink-dim">
                <Link href={`/version/${version.id}`} className="underline hover:text-ink">
                  {version.name}
                </Link>{" "}
                — {version.workTitle}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 font-narrow text-ink-dim">This cannot be undone.</p>
    </div>
  );
}
