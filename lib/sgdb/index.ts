import SGDB from "steamgriddb";

import { createSerialiser } from "@/lib/rate-limit";

import { confidenceFor, type MatchConfidence } from "./match";

export class SgdbError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SgdbError";
  }
}

export class SgdbNotConfiguredError extends SgdbError {
  constructor() {
    super("SGDB_API_KEY is not set");
    this.name = "SgdbNotConfiguredError";
  }
}

const serialise = createSerialiser(250);

let client: SGDB | undefined;

function sgdb(): SGDB {
  const key = process.env.SGDB_API_KEY;
  if (!key) throw new SgdbNotConfiguredError();
  client ??= new SGDB(key);
  return client;
}

export type ArtCandidate = {
  sgdbGameId: number;
  gameName: string;
  imageUrl: string;
  thumbUrl: string;
  score: number;
  /** upvotes minus downvotes. See the sort in lookupArt for why this matters. */
  votes: number;
  width: number;
  height: number;
};

/**
 * SteamGridDB grids come in Steam's 460x215 banner shape as well as portrait
 * box art. The shelf is a wall of covers, so portrait is what we want; a banner
 * stretched into a 3:4 tile looks broken.
 */
const PORTRAIT_DIMENSIONS = ["600x900", "342x482", "660x930"];

export type ArtLookup = {
  confidence: MatchConfidence;
  /** The game SteamGridDB matched, whether or not the match was good enough. */
  matchedName: string | null;
  sgdbGameId: number | null;
  candidates: ArtCandidate[];
};

const EMPTY: ArtLookup = { confidence: "none", matchedName: null, sgdbGameId: null, candidates: [] };

/**
 * Look up cover art by title.
 *
 * The caller decides what to search with, and that choice matters: an official
 * work searches on its own title, but a community version searches on the
 * version's name — "Ship of Harkinian", never "Ocarina of Time". Searching the
 * parent title returns the original's boxart, which looks correct and is wrong.
 *
 * `includeAdult` is for the manual picker only. Automatic selection filters
 * nsfw and humor out.
 */
export async function lookupArt(title: string, includeAdult = false): Promise<ArtLookup> {
  const term = title.trim();
  if (!term) return EMPTY;

  try {
    const games = await serialise(() => sgdb().searchGame(term));
    const top = games[0];
    if (!top) return EMPTY;

    const flag = includeAdult ? "any" : "false";
    const fetchGrids = (dimensions?: string[]) =>
      serialise(() =>
        sgdb().getGridsById(top.id, undefined, dimensions, undefined, undefined, flag, flag),
      );

    // Some releases only have banners. Art in the wrong shape still beats no
    // art, so fall back rather than returning nothing.
    let grids = await fetchGrids(PORTRAIT_DIMENSIONS);
    if (grids.length === 0) {
      grids = await fetchGrids();
    }

    const candidates = grids
      .map(
        (grid): ArtCandidate => ({
          sgdbGameId: top.id,
          gameName: top.name,
          imageUrl: String(grid.url),
          thumbUrl: String(grid.thumb),
          score: grid.score,
          votes: grid.upvotes - grid.downvotes,
          width: grid.width,
          height: grid.height,
        }),
      )
      // The API returns score 0 for everything in practice, so votes are what
      // actually order "highest-scoring" here.
      .sort((a, b) => b.score - a.score || b.votes - a.votes);

    return {
      confidence: confidenceFor(term, top.name),
      matchedName: top.name,
      sgdbGameId: top.id,
      candidates,
    };
  } catch (err) {
    if (err instanceof SgdbNotConfiguredError) throw err;
    throw new SgdbError("SteamGridDB lookup failed", err);
  }
}

export { confidenceFor, normaliseTitle } from "./match";
export type { MatchConfidence } from "./match";
