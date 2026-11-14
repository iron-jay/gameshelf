import { json, withUser } from "@/lib/api";
import { foldedShelfRows } from "@/lib/dlc";
import { seriesInUse, seriesOnShelf } from "@/lib/series";

export const dynamic = "force-dynamic";

/**
 * The series your shelf touches, for the Series strip on the shelves page
 * (`items`, alphabetical, folded from the same rows the web's strip uses), and
 * every series name in use (`names`), for a series box to suggest.
 */
export const GET = withUser(async (_request, { user }) => {
  const { rows } = await foldedShelfRows(user.id);
  return json({ items: seriesOnShelf(rows), names: await seriesInUse() });
});
