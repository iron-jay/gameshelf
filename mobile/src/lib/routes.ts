import type { AppKind } from '@/theme';

export function entryHref(kind: AppKind, id: string) {
  return { pathname: '/[kind]/entry/[id]' as const, params: { kind, id } };
}

/** An edition (books) or version (games): opens your entry for it, or offers to add it. */
export function versionHref(kind: AppKind, id: string) {
  return { pathname: '/[kind]/version/[id]' as const, params: { kind, id } };
}

export function workHref(kind: AppKind, slug: string) {
  return { pathname: '/[kind]/work/[slug]' as const, params: { kind, slug } };
}

/**
 * The add sheet. Everything it needs to show before asking the server comes
 * along as text, so it opens at once; the server fetches the real record by
 * id when you press Add.
 */
export type AddParams = {
  source: 'ol' | 'hardcover' | 'comic' | 'igdb' | 'edition' | 'version';
  title: string;
  cover?: string;
  olWorkKey?: string;
  olEditionKey?: string;
  format?: string;
  isbn?: string;
  hardcoverId?: string;
  comicvineIssueId?: string;
  igdbId?: string;
  platforms?: string;
  platformId?: string;
  shelf?: string;
  editionId?: string;
  versionId?: string;
  subtitle?: string;
};

export function addHref(kind: AppKind, params: AddParams) {
  return { pathname: '/[kind]/add' as const, params: { kind, ...params } };
}
