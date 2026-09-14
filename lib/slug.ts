/**
 * Shared by works and by shelf names. Lived in lib/igdb/mapping while IGDB was
 * the only caller; a user-typed shelf name has nothing to do with IGDB.
 */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "untitled"
  );
}
