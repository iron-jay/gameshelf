/**
 * Exercise the SteamGridDB matcher against the live API.
 *
 *     npm run probe:sgdb -- "Ship of Harkinian"
 *
 * Kept as a script rather than a test because it hits the network and the
 * results change as people upload art.
 */
import { lookupArt, normaliseTitle } from "@/lib/sgdb";

const CASES = [
  "Ship of Harkinian",
  "Master of Time",
  "The Legend of Zelda: Ocarina of Time",
  "Zelda 64: Recompiled",
  "a title that certainly does not exist anywhere",
];

async function main(): Promise<number> {
  const terms = process.argv.slice(2).length > 0 ? process.argv.slice(2) : CASES;

  for (const term of terms) {
    try {
      const result = await lookupArt(term);
      console.log(`\n${term}`);
      console.log(`  normalised  ${normaliseTitle(term)}`);
      console.log(`  matched     ${result.matchedName ?? "(nothing)"}`);
      console.log(`  confidence  ${result.confidence}`);
      console.log(`  sgdb id     ${result.sgdbGameId ?? "-"}`);
      console.log(`  grids       ${result.candidates.length}`);
      const best = result.candidates[0];
      if (best) {
        console.log(`  best        ${best.width}x${best.height}, votes ${best.votes}`);
      }
    } catch (err) {
      console.log(`\n${term}\n  ERROR ${(err as Error).message}`);
    }
  }

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
