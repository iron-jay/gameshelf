/**
 * Reads a Grouvee export and reports what an import would do. Writes nothing.
 *
 *     npm run probe:grouvee -- ~/Downloads/grouvee_export.json
 */
import { readFile } from "node:fs/promises";

import { parseGrouvee } from "@/lib/import/grouvee";

async function main(): Promise<number> {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npm run probe:grouvee -- <grouvee_export.json>");
    return 2;
  }

  const parse = parseGrouvee(JSON.parse(await readFile(path, "utf8")));

  console.log(`\naccount     ${parse.account ?? "unknown"}`);
  console.log(`exported    ${parse.exportedAt ?? "unknown"}`);
  console.log(`games       ${parse.items.length}`);
  console.log(`unmatched   ${parse.unmatched.length}`);

  const statuses = new Map<string, number>();
  const shelves = new Map<string, number>();
  let rated = 0;
  let reviewed = 0;
  let dated = 0;

  for (const item of parse.items) {
    statuses.set(item.status, (statuses.get(item.status) ?? 0) + 1);
    for (const shelf of item.shelves) {
      shelves.set(shelf, (shelves.get(shelf) ?? 0) + 1);
    }
    if (item.rating !== null) rated += 1;
    if (item.review) reviewed += 1;
    if (item.addedAt) dated += 1;
  }

  console.log("\nstatus");
  for (const [status, count] of [...statuses].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(10)} ${count}`);
  }

  if (shelves.size > 0) {
    console.log("\nshelves kept as tags");
    for (const [shelf, count] of [...shelves].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${shelf.padEnd(24)} ${count}`);
    }
  }

  console.log(`\nratings     ${rated}`);
  console.log(`reviews     ${reviewed}`);
  console.log(`with dates  ${dated}`);

  console.log("\nfirst few");
  for (const item of parse.items.slice(0, 5)) {
    const bits = [
      item.status,
      item.rating ? `${item.rating / 2}/5` : null,
      item.addedAt?.slice(0, 10),
    ].filter(Boolean);
    console.log(`  ${item.name.slice(0, 44).padEnd(46)} igdb ${String(item.igdbId).padEnd(7)} ${bits.join(" · ")}`);
  }

  if (parse.unmatched.length > 0) {
    console.log("\nno IGDB id, cannot be imported");
    for (const name of parse.unmatched.slice(0, 10)) console.log(`  ${name}`);
  }

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
