import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';

import type { AppKind } from '@/theme';

import { useServers, type Server } from './servers';
import type {
  BookSearch,
  BookWork,
  Card,
  ComicVolume,
  ComicVolumeDetail,
  Edition,
  Entry,
  EntryChange,
  GameSearch,
  GameWork,
  Meta,
  OlWork,
  Page,
  Read,
  Tag,
  User,
  Version,
} from './types';

/** The server's own `{ error: { code, message } }`, or a network failure as `offline`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(server: Server, method: string, path: string, body?: unknown): Promise<T> {
  if (!server.url) throw new ApiError(0, 'not_set_up', 'No server address yet.');
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (server.token) headers.authorization = `Bearer ${server.token}`;

  let response: Response;
  try {
    response = await fetch(`${server.url}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline', `Can't reach ${server.url}.`);
  }

  if (response.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // An HTML error page from a proxy, or a server that is not one of ours.
    throw new ApiError(response.status, 'not_shelf', `${server.url} didn't answer like a shelf server.`);
  }
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } })?.error;
    throw new ApiError(response.status, error?.code ?? 'internal', error?.message ?? 'Something went wrong.');
  }
  return data as T;
}

/** A server path like `/covers/x.jpg` against its server; catalogue URLs pass through. */
export function coverSource(server: Server, url: string | null) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return { uri: url };
  if (!server.url) return null;
  return {
    uri: `${server.url}${url}`,
    // Covers on the server accept the same device token as the API.
    headers: server.token ? { authorization: `Bearer ${server.token}` } : undefined,
  };
}

export function useServer(kind: AppKind): Server {
  return useServers().servers[kind];
}

function useApiQuery<T>(
  kind: AppKind,
  key: unknown[],
  path: string | null,
  options: Partial<UseQueryOptions<T, ApiError>> = {},
) {
  const server = useServer(kind);
  return useQuery<T, ApiError>({
    queryKey: [kind, server.url, ...key],
    queryFn: () => request<T>(server, 'GET', path ?? ''),
    enabled: !!server.url && path !== null && (options.enabled ?? true),
    ...options,
  });
}

// --- reads -----------------------------------------------------------------

export const useMeta = (kind: AppKind) => useApiQuery<Meta>(kind, ['meta'], '/meta', { staleTime: 60 * 60 * 1000 });

export const useMe = (kind: AppKind) => useApiQuery<User>(kind, ['me'], '/me');

export type ShelfQuery = { shelf?: string; tag?: string; platform?: string; sort?: string; limit?: number };

export function shelfPath(q: ShelfQuery, offset = 0): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params.set(k, String(v));
  if (offset) params.set('offset', String(offset));
  const s = params.toString();
  return `/shelf${s ? `?${s}` : ''}`;
}

export const useShelf = (kind: AppKind, q: ShelfQuery) =>
  useApiQuery<Page<Card>>(kind, ['shelf', q], shelfPath(q));

export const useEntry = (kind: AppKind, id: string) => useApiQuery<Entry>(kind, ['entry', id], `/entries/${id}`);

export const useEdition = (id: string | undefined) =>
  useApiQuery<Edition & { work: { slug: string; title: string; authors: string[] }; entryId: string | null }>(
    'books',
    ['edition', id],
    id ? `/editions/${id}` : null,
  );

export const useVersion = (id: string | undefined) =>
  useApiQuery<Version & { notes: string | null; work: { slug: string; title: string }; baseVersion: Version | null }>(
    'games',
    ['version', id],
    id ? `/versions/${id}` : null,
  );

export const useBookWork = (slug: string | undefined) =>
  useApiQuery<BookWork>('books', ['work', slug], slug ? `/works/${encodeURIComponent(slug)}` : null);

export const useGameWork = (slug: string | undefined) =>
  useApiQuery<GameWork>('games', ['work', slug], slug ? `/works/${encodeURIComponent(slug)}` : null);

export const useTags = (kind: AppKind) =>
  useApiQuery<{ items: (Tag & { count: number })[] }>(kind, ['tags'], '/tags');

export const usePlatforms = () => useApiQuery<{ items: string[] }>('games', ['platforms'], '/platforms');

const searchPath = (q: string) => (q.trim().length >= 2 ? `/search?q=${encodeURIComponent(q.trim())}` : null);

// Catalogue searches are slow and rate-limited upstream; keep answers a while.
export const useBookSearch = (q: string) =>
  useApiQuery<BookSearch>('books', ['search', q.trim()], searchPath(q), { staleTime: 5 * 60 * 1000 });

export const useGameSearch = (q: string) =>
  useApiQuery<GameSearch>('games', ['search', q.trim()], searchPath(q), { staleTime: 5 * 60 * 1000 });

export const useOlWork = (key: string | undefined) =>
  useApiQuery<OlWork>('books', ['ol', key], key ? `/catalogue/openlibrary/${key}` : null, { staleTime: 30 * 60 * 1000 });

export const useComicSearch = (q: string) =>
  useApiQuery<{ q: string; results: ComicVolume[] }>(
    'books',
    ['comics', q.trim()],
    q.trim().length >= 2 ? `/catalogue/comics?q=${encodeURIComponent(q.trim())}` : null,
    { staleTime: 5 * 60 * 1000 },
  );

export const useComicVolume = (id: string | undefined) =>
  useApiQuery<ComicVolumeDetail>('books', ['comic', id], id ? `/catalogue/comics/${id}` : null);

// --- writes ----------------------------------------------------------------

/**
 * Every write refreshes everything for that shelf. One person's shelf is small,
 * and a stale count on the shelves page is worse than a refetch.
 */
function useApiMutation<V, T>(kind: AppKind, run: (server: Server, vars: V) => Promise<T>) {
  const server = useServer(kind);
  const client = useQueryClient();
  return useMutation<T, ApiError, V>({
    mutationFn: (vars) => run(server, vars),
    onSuccess: () => client.invalidateQueries({ queryKey: [kind] }),
  });
}

export const useUpdateEntry = (kind: AppKind) =>
  useApiMutation(kind, (s, v: { id: string; change: EntryChange }) =>
    request<Entry>(s, 'PATCH', `/entries/${v.id}`, v.change),
  );

export const useRemoveEntry = (kind: AppKind) =>
  useApiMutation(kind, (s, id: string) => request<void>(s, 'DELETE', `/entries/${id}`));

export const useAddEntry = (kind: AppKind) =>
  useApiMutation(kind, (s, body: Record<string, unknown>) => request<Card>(s, 'POST', '/entries', body));

export const useTagEntry = (kind: AppKind) =>
  useApiMutation(kind, (s, v: { id: string; name: string; on: boolean }) =>
    request<{ tags: Tag[] }>(s, v.on ? 'PUT' : 'DELETE', `/entries/${v.id}/tags/${encodeURIComponent(v.name)}`),
  );

export const useReadAgain = () =>
  useApiMutation('books', (s, entryId: string) => request<Read>(s, 'POST', `/entries/${entryId}/reads`));

export const useUpdateRead = () =>
  useApiMutation('books', (s, v: { id: string; startedOn?: string | null; finishedOn?: string | null }) => {
    const { id, ...change } = v;
    return request<Read>(s, 'PATCH', `/reads/${id}`, change);
  });

export const useDeleteRead = () =>
  useApiMutation('books', (s, id: string) => request<void>(s, 'DELETE', `/reads/${id}`));
