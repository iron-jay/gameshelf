import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { isFormKind, KIND_LABELS, type FormKind } from "@/lib/versions/types";

import { VersionForm } from "../version-form";

export const dynamic = "force-dynamic";

/**
 * Door A. The type selector decides which shape of thing is being added; a
 * plain commercial game is just the existing IGDB search, so that option links
 * there rather than duplicating it.
 */
const CHOICES: ReadonlyArray<{ kind: FormKind | "game"; label: string; hint: string }> = [
  { kind: "game", label: "Game", hint: "A commercial release. Search IGDB and add it." },
  { kind: "romhack", label: KIND_LABELS.romhack, hint: "A community modification of an existing game." },
  { kind: "decomp_port", label: KIND_LABELS.decomp_port, hint: "A native port built from a decompilation." },
  { kind: "recomp", label: KIND_LABELS.recomp, hint: "A static recompilation." },
  { kind: "translation", label: KIND_LABELS.translation, hint: "A fan translation." },
  { kind: "mod", label: KIND_LABELS.mod, hint: "A PC mod or total conversion." },
  { kind: "homebrew", label: KIND_LABELS.homebrew, hint: "An original game that is not based on anything." },
];

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  await requireUser();
  const { kind } = await searchParams;

  if (isFormKind(kind)) {
    return (
      <main className="flex-1 p-6">
        <p className="mb-1 font-narrow text-ink-dim">
          <Link href="/add" className="underline">
            Add
          </Link>
        </p>
        <h1 className="mb-6 text-xl font-medium">Add a {KIND_LABELS[kind].toLowerCase()}</h1>
        <VersionForm kind={kind} />
      </main>
    );
  }

  return (
    <main className="flex-1 p-6">
      <h1 className="mb-6 text-xl font-medium">What are you adding?</h1>

      <ul className="flex max-w-xl flex-col">
        {CHOICES.map((choice) => (
          <li key={choice.kind}>
            <Link
              href={choice.kind === "game" ? "/search" : `/add?kind=${choice.kind}`}
              className="block border-b border-line py-3 hover:bg-panel"
            >
              <p className="font-medium">{choice.label}</p>
              <p className="font-narrow text-ink-dim">{choice.hint}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
