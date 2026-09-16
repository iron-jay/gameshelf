import type { ArtCandidate, MatchConfidence } from "@/lib/sgdb";

/**
 * The platform select's escape hatch. Picking it swaps the select for a text
 * box; the action treats it as no platform, so with scripting off it submits
 * harmlessly instead of creating a platform by that name.
 */
export const OTHER_PLATFORM = "__other__";

/** The version kinds the community form can produce. */
export const COMMUNITY_KINDS = [
  "romhack",
  "translation",
  "decomp_port",
  "recomp",
  "mod",
] as const;

export type CommunityKind = (typeof COMMUNITY_KINDS)[number];

/**
 * Homebrew is not a version kind here. It modifies nothing, so there is no
 * parent to attach to: the homebrew door creates a local work with its own
 * 'original' version. Section 5.
 */
export type FormKind = CommunityKind | "homebrew";

export const KIND_LABELS: Readonly<Record<FormKind, string>> = {
  romhack: "Romhack",
  translation: "Translation",
  decomp_port: "Decomp port",
  recomp: "Recompilation",
  mod: "Mod",
  homebrew: "Homebrew",
};

export function isCommunityKind(value: string): value is CommunityKind {
  return (COMMUNITY_KINDS as readonly string[]).includes(value);
}

export function isFormKind(value: string | undefined): value is FormKind {
  return Boolean(value) && (value === "homebrew" || isCommunityKind(value!));
}

export type CreateVersionState = {
  ok: boolean;
  message: string;
  /** Set on success so the page can link onward to what was created. */
  workSlug?: string;
} | null;

export type ArtLookupState = {
  confidence: MatchConfidence;
  matchedName: string | null;
  sgdbGameId: number | null;
  candidates: ArtCandidate[];
  error: string | null;
};

export type BaseGameOption = {
  igdbId: number;
  title: string;
  year: number | null;
};

export type ArtActionState = { ok: boolean; message: string } | null;

export type ArtTarget = { kind: "work" | "version"; id: string };
