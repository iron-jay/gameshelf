import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';

import { useKind } from '@/components/accent';
import { Button, Field, Segmented } from '@/components/controls';
import { Cover } from '@/components/cover';
import { Header } from '@/components/header';
import { Empty, Loading, Problem } from '@/components/state';
import { T } from '@/components/text';
import { useBookSearch, useComicSearch, useGameSearch } from '@/lib/api';
import { addHref, versionHref, workHref } from '@/lib/routes';
import type { BookSearch, BookSearchResult, ComicVolume, GameSearch, IgdbResult } from '@/lib/types';
import { colors, gutter, type AppKind } from '@/theme';

function useDebounced(value: string, ms = 450) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * One box. Books search this server, Open Library and Hardcover together, and
 * an ISBN typed, pasted or scanned goes straight to its edition; comics search
 * Comic Vine. Games search this server and IGDB. Each result says where it is
 * from, and one already on your shelf opens it rather than adding it again.
 */
export default function SearchScreen() {
  const kind = useKind();
  const params = useLocalSearchParams<{ q?: string }>();
  const [text, setText] = useState(params.q ?? '');
  const [mode, setMode] = useState<'books' | 'comics'>('books');
  const q = useDebounced(text);

  // A scanned barcode comes back here as ?q=.
  const [seenQ, setSeenQ] = useState(params.q);
  if (params.q !== seenQ) {
    setSeenQ(params.q);
    if (params.q) {
      setText(params.q);
      setMode('books');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Header />
      <View style={{ paddingHorizontal: gutter, paddingTop: 14, gap: 10 }}>
        {kind === 'books' ? (
          <Segmented
            options={[
              { key: 'books', label: 'Books' },
              { key: 'comics', label: 'Comics' },
            ]}
            value={mode}
            onChange={setMode}
          />
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Field
            value={text}
            onChangeText={setText}
            placeholder={kind === 'games' ? 'Find or add a game' : mode === 'comics' ? 'Find a comic series' : 'Title, author or ISBN'}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={{ flex: 1 }}
            accessibilityLabel="Search"
          />
          {kind === 'books' && mode === 'books' ? <Button onPress={() => router.push('/scan')}>Scan</Button> : null}
        </View>
      </View>
      {q.trim().length < 2 ? (
        <Empty
          title={kind === 'games' ? 'Find a game' : mode === 'comics' ? 'Find a comic' : 'Find a book'}
          body={
            kind === 'games'
              ? 'Your own games come first, then IGDB.'
              : mode === 'comics'
                ? 'Searches Comic Vine for a series, then you pick the issue.'
                : 'Your own books come first, then Open Library and Hardcover. Scan a barcode to go straight to that edition.'
          }
        />
      ) : kind === 'games' ? (
        <GameResults q={q} />
      ) : mode === 'comics' ? (
        <ComicResults q={q} />
      ) : (
        <BookResults q={q} />
      )}
    </View>
  );
}

function Row({
  kind,
  cover,
  title,
  lines,
  label,
  onPress,
}: {
  kind: AppKind;
  cover: string | null;
  title: string;
  lines: (string | null | undefined)[];
  label?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.band }]}>
      <Cover kind={kind} url={cover} title={title} width={56} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant={kind === 'books' ? 'serif' : 'strong'} style={kind === 'books' ? { fontFamily: 'Newsreader_500Medium', fontSize: 18 } : undefined} numberOfLines={2}>
          {title}
        </T>
        {lines.filter(Boolean).map((line, i) => (
          <T key={i} variant="meta" numberOfLines={1}>
            {line}
          </T>
        ))}
      </View>
      {label ? <Provenance label={label} /> : null}
    </Pressable>
  );
}

function Provenance({ label }: { label: string }) {
  const mine = label === 'On your shelf';
  return (
    <View style={[styles.prov, mine && { borderColor: colors.inkDim }]}>
      <T variant="small" style={mine ? { color: colors.ink } : undefined}>
        {label}
      </T>
    </View>
  );
}

const bookLabel: Record<BookSearchResult['provenance'], string> = {
  saved: 'Here',
  local: 'Here',
  comic: 'Here',
  openlibrary: 'Open Library',
  hardcover: 'Hardcover',
};

function openBookResult(r: BookSearchResult) {
  const edition = r.webPath.match(/^\/edition\/(.+)$/);
  if (edition) return router.push(versionHref('books', edition[1]));
  const work = r.webPath.match(/^\/work\/(.+)$/);
  if (work) return router.push(workHref('books', work[1]));
  const subtitle = [r.authors.join(', '), r.year].filter(Boolean).join(' · ');
  if (r.olWorkKey) return router.push(addHref('books', { source: 'ol', olWorkKey: r.olWorkKey, title: r.title, subtitle, cover: r.coverUrl ?? '' }));
  if (r.hardcoverId) return router.push(addHref('books', { source: 'hardcover', hardcoverId: String(r.hardcoverId), title: r.title, subtitle, cover: r.coverUrl ?? '' }));
}

function BookResults({ q }: { q: string }) {
  const search = useBookSearch(q);
  if (search.isPending) return <Loading />;
  if (search.isError) return <Problem error={search.error} retry={() => search.refetch()} />;
  const data: BookSearch = search.data;

  if (data.isbn) return <IsbnResult data={data} />;

  return (
    <FlatList
      data={data.results}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      keyExtractor={(r, i) => `${r.provenance}-${r.workId ?? r.olWorkKey ?? r.hardcoverId}-${i}`}
      ListHeaderComponent={
        data.catalogueError ? (
          <T variant="meta" style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
            Open Library didn’t answer ({data.catalogueError}), so only what is here is shown.
          </T>
        ) : null
      }
      ListEmptyComponent={<Empty title="Nothing found" body="Nothing here or in the catalogues by that name. You can make it by hand on the web." />}
      renderItem={({ item: r }) => (
        <Row
          kind="books"
          cover={r.coverUrl}
          title={r.title}
          lines={[r.subtitle, [r.authors.join(', '), r.year].filter(Boolean).join(' · ')]}
          label={r.onShelf ? 'On your shelf' : bookLabel[r.provenance]}
          onPress={() => openBookResult(r)}
        />
      )}
      contentContainerStyle={{ paddingVertical: 8 }}
    />
  );
}

function IsbnResult({ data }: { data: BookSearch }) {
  const isbn = data.isbn!;
  if (isbn.editionId) {
    return (
      <View style={{ paddingTop: 8 }}>
        <Row kind="books" cover={null} title={isbn.editionName ?? data.q} lines={[`ISBN ${data.q}`]} label="Here" onPress={() => router.push(versionHref('books', isbn.editionId!))} />
      </View>
    );
  }
  if (isbn.remote) {
    const r = isbn.remote;
    return (
      <View style={{ paddingTop: 8 }}>
        <Row
          kind="books"
          cover={null}
          title={r.title}
          lines={[`ISBN ${r.isbn}`, r.format === 'audiobook' ? 'Audiobook' : 'Book']}
          label="Open Library"
          onPress={() =>
            router.push(
              addHref('books', { source: 'ol', olWorkKey: r.olWorkKey, olEditionKey: r.olEditionKey, format: r.format, isbn: r.isbn, title: r.title, cover: '' }),
            )
          }
        />
      </View>
    );
  }
  return <Empty title="No book with that ISBN" body={data.catalogueError ? `Open Library didn’t answer (${data.catalogueError}).` : 'Open Library doesn’t know it. Try the title instead.'} />;
}

function ComicResults({ q }: { q: string }) {
  const search = useComicSearch(q);
  if (search.isPending) return <Loading />;
  if (search.isError) {
    if (search.error.status === 404 || search.error.code === 'upstream') return <Problem error={search.error} />;
    return <Problem error={search.error} retry={() => search.refetch()} />;
  }
  return (
    <FlatList
      data={search.data.results}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(v: ComicVolume) => String(v.volumeId)}
      ListEmptyComponent={<Empty title="Nothing found" />}
      ListFooterComponent={<ComicVineCredit />}
      renderItem={({ item: v }) => (
        <Row
          kind="books"
          cover={v.coverUrl}
          title={v.name}
          lines={[[v.publisher, v.startYear].filter(Boolean).join(' · '), `${v.issueCount} ${v.issueCount === 1 ? 'issue' : 'issues'}`]}
          onPress={() => router.push({ pathname: '/comics/[volumeId]', params: { volumeId: String(v.volumeId) } })}
        />
      )}
      contentContainerStyle={{ paddingVertical: 8 }}
    />
  );
}

/** Comic Vine's terms ask for a link back wherever its data is shown. */
export function ComicVineCredit() {
  return (
    <Pressable onPress={() => Linking.openURL('https://comicvine.gamespot.com/')} style={{ padding: gutter }}>
      <T variant="small">
        Comic data from <T variant="small" style={{ textDecorationLine: 'underline' }}>Comic Vine</T>.
      </T>
    </Pressable>
  );
}

function GameResults({ q }: { q: string }) {
  const search = useGameSearch(q);
  if (search.isPending) return <Loading />;
  if (search.isError) return <Problem error={search.error} retry={() => search.refetch()} />;
  const data: GameSearch = search.data;
  type Item = { type: 'local'; local: GameSearch['local'][number] } | { type: 'igdb'; igdb: IgdbResult };
  const localIgdb = new Set(data.local.map((l) => l.title.toLowerCase()));
  const items: Item[] = [
    ...data.local.map((local) => ({ type: 'local' as const, local })),
    // A game already here is shown once, as ours.
    ...data.igdb.filter((g) => !localIgdb.has(g.title.toLowerCase())).map((igdb) => ({ type: 'igdb' as const, igdb })),
  ];
  return (
    <FlatList
      data={items}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      keyExtractor={(i) => (i.type === 'local' ? `l-${i.local.id}` : `i-${i.igdb.id}`)}
      ListHeaderComponent={
        data.igdbError ? (
          <T variant="meta" style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
            IGDB didn’t answer, so only what is here is shown.
          </T>
        ) : null
      }
      ListEmptyComponent={<Empty title="Nothing found" body="Nothing here or on IGDB by that name." />}
      renderItem={({ item }) =>
        item.type === 'local' ? (
          <Row
            kind="games"
            cover={item.local.coverUrl}
            title={item.local.title}
            lines={[item.local.year ? String(item.local.year) : null]}
            label={item.local.shelvedVersionIds.length ? 'On your shelf' : 'Here'}
            onPress={() => router.push(workHref('games', item.local.slug))}
          />
        ) : (
          <Row
            kind="games"
            cover={item.igdb.coverUrl}
            title={item.igdb.title}
            lines={[[item.igdb.year, item.igdb.platforms].filter(Boolean).join(' · ')]}
            label="IGDB"
            onPress={() =>
              router.push(
                addHref('games', {
                  source: 'igdb',
                  igdbId: String(item.igdb.id),
                  title: item.igdb.title,
                  subtitle: item.igdb.year ? String(item.igdb.year) : '',
                  cover: item.igdb.coverUrl ?? '',
                  platforms: JSON.stringify(item.igdb.platformOptions),
                  platformId: item.igdb.defaultPlatformId ? String(item.igdb.defaultPlatformId) : '',
                  shelf: item.igdb.defaultStatus,
                }),
              )
            }
          />
        )
      }
      contentContainerStyle={{ paddingVertical: 8 }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: gutter, paddingVertical: 10, alignItems: 'center' },
  prov: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'center' },
});
