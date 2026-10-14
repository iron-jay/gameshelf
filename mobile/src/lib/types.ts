/**
 * The JSON both servers answer under /api/v1 (each README, "JSON API"). The
 * card is one shape in both; what only books or only games have is under
 * `extra`, so the shelves are written once and only the detail screens differ.
 */

export type ShelfDef = { key: string; label: string };

export type Meta = {
  app: 'bookshelf' | 'gameshelf';
  apiVersion: number;
  authRequired: boolean;
  shelves: ShelfDef[];
  features: string[];
};

export type User = { id: string; username: string; displayName: string; isAdmin: boolean };

export type BookExtra = {
  authors: string[];
  format: 'book' | 'audiobook';
  editionKind: string | null;
  credit: string | null;
  language: string | null;
  collectionName: string | null;
  coverNeedsReview: boolean;
};

export type GameExtra = {
  platform: string | null;
  kind: string | null;
  community: boolean;
  workKind: string | null;
  parentWorkId: string | null;
  parentWorkTitle: string | null;
  coverNeedsReview: boolean;
};

export type Card = {
  id: string;
  /** The edition, for a book. */
  versionId: string;
  workSlug: string;
  title: string;
  subtitle: string;
  creator: string | null;
  coverUrl: string | null;
  shelf: string;
  rating: number | null;
  completion: string | null;
  isFavourite: boolean;
  year: number | null;
  addedAt: string | null;
  lastFinishedOn: string | null;
  series: { name: string; position: number | null } | null;
  extra: BookExtra | GameExtra;
};

export type Tag = { id: string; slug: string; name: string };

export type Read = { id: string; startedOn: string | null; finishedOn: string | null };

export type Entry = Card & {
  review: string | null;
  reviewHasSpoilers: boolean;
  isPrivate: boolean;
  tags: Tag[];
  /** Books only. */
  reads?: Read[];
};

export type Page<T> = { total: number; limit: number; offset: number; items: T[] };

export type EntryChange = Partial<{
  shelf: string;
  rating: number | null;
  review: string | null;
  reviewHasSpoilers: boolean;
  isFavourite: boolean;
  isPrivate: boolean;
  completion: string | null;
}>;

// --- books -----------------------------------------------------------------

export type BookSearchResult = {
  title: string;
  subtitle: string | null;
  authors: string[];
  year: number | null;
  coverUrl: string | null;
  provenance: 'openlibrary' | 'saved' | 'local' | 'comic' | 'hardcover';
  editionCount: number;
  onShelf: boolean;
  workId: string | null;
  olWorkKey: string | null;
  hardcoverId: number | null;
  /** The web page it leads to; `/edition/{id}` names the edition to open. */
  webPath: string;
};

export type BookSearch = {
  q: string;
  results: BookSearchResult[];
  isbn: {
    editionId: string | null;
    editionName: string | null;
    workSlug: string | null;
    remote: {
      olWorkKey: string;
      olEditionKey: string;
      title: string;
      format: 'book' | 'audiobook';
      isbn: string;
    } | null;
  } | null;
  catalogueError: string | null;
};

export type OlEdition = {
  olEditionKey: string;
  title: string;
  format: 'book' | 'audiobook';
  physicalFormat: string | null;
  year: number | null;
  language: string | null;
  isbn: string | null;
  pages: number | null;
  coverUrl: string | null;
  narrators: string[];
  editionId: string | null;
};

export type OlWork = {
  olWorkKey: string;
  workSlug: string | null;
  title: string;
  authors: string[];
  year: number | null;
  coverUrl: string | null;
  total: number;
  editions: OlEdition[];
};

export type ComicVolume = {
  volumeId: number;
  name: string;
  startYear: number | null;
  publisher: string | null;
  issueCount: number;
  coverUrl: string | null;
  deck: string | null;
  pageUrl: string;
};

export type ComicIssue = {
  comicvineIssueId: number;
  issueNumber: string | null;
  name: string | null;
  title: string;
  year: number | null;
  coverUrl: string | null;
  editionId: string | null;
};

export type ComicVolumeDetail = Omit<ComicVolume, 'coverUrl' | 'deck'> & { issues: ComicIssue[] };

export type Edition = {
  id: string;
  name: string;
  kind: string;
  format: 'book' | 'audiobook';
  language: string | null;
  publisher: string | null;
  publishedOn: string | null;
  pages: number | null;
  durationMinutes: number | null;
  isbn13: string | null;
  isbn10: string | null;
  credit: string | null;
  url: string | null;
  coverUrl: string | null;
};

export type BookWork = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  summary: string | null;
  firstPublishedYear: number | null;
  coverUrl: string | null;
  source: string;
  // Postgres numeric: a position can arrive as text ("2.5").
  series: { name: string; slug: string; position: number | string | null } | null;
  collection: { name: string; slug: string } | null;
  editions: (Edition & { entryId: string | null; shelf: string | null; rating: number | null })[];
};

// --- games -----------------------------------------------------------------

export type IgdbResult = {
  id: number;
  title: string;
  year: number | null;
  coverUrl: string | null;
  platforms: string;
  platformOptions: { id: number; name: string }[];
  defaultPlatformId: number | null;
  defaultStatus: string;
};

export type GameSearch = {
  q: string;
  local: {
    id: string;
    slug: string;
    title: string;
    year: number | null;
    coverUrl: string | null;
    shelvedVersionIds: string[];
  }[];
  igdb: IgdbResult[];
  igdbError: string | null;
};

export type Version = {
  id: string;
  name: string;
  kind: string;
  community: boolean;
  platform: string | null;
  author: string | null;
  versionLabel: string | null;
  releaseDate: string | null;
  url: string | null;
  coverUrl: string | null;
  baseVersionId: string | null;
  entryId: string | null;
};

export type GameWork = {
  id: string;
  slug: string;
  title: string;
  workKind: string;
  series: string | null;
  summary: string | null;
  firstReleaseDate: string | null;
  coverUrl: string | null;
  source: string;
  parent: { slug: string; title: string } | null;
  versions: Version[];
  children: { slug: string; title: string; workKind: string }[];
};
