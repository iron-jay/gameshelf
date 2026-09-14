export type IgdbCover = {
  id: number;
  image_id: string;
};

export type IgdbPlatform = {
  id: number;
  name: string;
  abbreviation?: string;
};

export type IgdbReleaseDate = {
  id: number;
  /** Unix seconds. */
  date?: number;
  /** Platform id, matching an entry in the game's platforms array. */
  platform?: number;
};

export type IgdbGame = {
  id: number;
  name: string;
  slug: string;
  summary?: string;
  /** Unix seconds. IGDB has no notion of a date without a time. */
  first_release_date?: number;
  cover?: IgdbCover;
  platforms?: IgdbPlatform[];
  release_dates?: IgdbReleaseDate[];
  /** IGDB's game category. Maps onto work_kind. */
  category?: number;
  parent_game?: number;
};

export class IgdbError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "IgdbError";
  }
}

/** Thrown when the credentials are absent, so it can be told apart from an API failure. */
export class IgdbNotConfiguredError extends IgdbError {
  constructor() {
    super("IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are not set");
    this.name = "IgdbNotConfiguredError";
  }
}

const IMAGE_BASE = "https://images.igdb.com/igdb/image/upload";

export type IgdbImageSize = "cover_small" | "cover_big" | "720p" | "1080p";

export function igdbImageUrl(imageId: string, size: IgdbImageSize = "cover_big"): string {
  return `${IMAGE_BASE}/t_${size}/${imageId}.jpg`;
}
