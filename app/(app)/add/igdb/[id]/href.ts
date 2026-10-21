/**
 * Where an IGDB result's Add goes: its review page, told where Cancel and
 * "Back" return to and, from a game's DLC list, the platform to start on.
 */
export function addHref(igdbId: number, opts: { back?: string; platformId?: number | null } = {}): string {
  const query = new URLSearchParams();
  if (opts.back) query.set("back", opts.back);
  if (opts.platformId) query.set("platform", String(opts.platformId));
  const qs = query.toString();
  return `/add/igdb/${igdbId}${qs ? `?${qs}` : ""}`;
}

/** Only a path on this site, so the page cannot be made to send anyone elsewhere. */
export function safeBack(value: string | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/search";
}
