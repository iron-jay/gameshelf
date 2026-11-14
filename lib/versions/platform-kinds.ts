/**
 * How a game gets onto a platform it was never released on (Jay, 2026-11-14:
 * "with all these recomps coming, a lot of older games are unofficially on
 * PC"). Each is a version kind the schema already has.
 */
export const PLATFORM_KINDS = ["recomp", "decomp_port", "other"] as const;
export type PlatformKind = (typeof PLATFORM_KINDS)[number];

export const PLATFORM_KIND_LABELS: Readonly<Record<PlatformKind, string>> = {
  recomp: "Recompilation",
  decomp_port: "Decomp port",
  other: "Something else",
};

export function isPlatformKind(value: unknown): value is PlatformKind {
  return typeof value === "string" && (PLATFORM_KINDS as readonly string[]).includes(value);
}

/**
 * What a way to play goes by, for the "PC via banjo-recompiled" line.
 *
 * The "via" is the version's own name: it is what the port or recomp is
 * called, which is what a version's name already is for every community
 * release (and what its art is looked up by, §4a). So it needs no column of
 * its own. Only the kinds that put a game somewhere new read this way; a
 * translation or a mod is not how a game got onto a platform. A version
 * named after its platform, as one added with no "via" is, has none.
 */
export function viaOf(version: { kind: string; name: string; platform: string | null }): string | null {
  if (!isPlatformKind(version.kind)) return null;
  if (!version.platform) return null;
  if (version.name.trim().toLowerCase() === version.platform.trim().toLowerCase()) return null;
  return version.name;
}
