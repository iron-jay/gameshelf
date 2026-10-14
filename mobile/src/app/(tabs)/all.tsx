import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useKind } from '@/components/accent';
import { Button, Chip, Field, Segmented } from '@/components/controls';
import { Header } from '@/components/header';
import { Plank, ShelfItem } from '@/components/shelf';
import { Empty, Loading, Problem } from '@/components/state';
import { T } from '@/components/text';
import { ApiError, request, shelfPath, useMeta, usePlatforms, useServer, useTags, type ShelfQuery } from '@/lib/api';
import type { Card, Page } from '@/lib/types';
import { colors, coverAspect, gutter, type AppKind } from '@/theme';

const sorts: Record<AppKind, { key: string; label: string }[]> = {
  books: [
    { key: 'added', label: 'Added' },
    { key: 'title', label: 'Title' },
    { key: 'author', label: 'Author' },
    { key: 'rated', label: 'Rating' },
    { key: 'finished', label: 'Finished' },
  ],
  games: [
    { key: 'added', label: 'Added' },
    { key: 'rated', label: 'Rating' },
    { key: 'finished', label: 'Finished' },
    { key: 'series', label: 'Series' },
  ],
};

const PAGE = 500;
const COLUMNS = 3;

/**
 * The wall: every cover in a grid, a plank under every row. Shelf, tag,
 * platform and sort go to the server, the same query as the web shelf; the
 * title box filters what is already here on every keystroke.
 */
export default function AllScreen() {
  const kind = useKind();
  const params = useLocalSearchParams<{ shelf?: string }>();
  const [shelf, setShelf] = useState<string>(params.shelf ?? '');
  const [sort, setSort] = useState('added');
  const [tag, setTag] = useState('');
  const [platform, setPlatform] = useState('');
  const [title, setTitle] = useState('');
  const [open, setOpen] = useState(false);

  // "See all" on the shelves page arrives here with its shelf.
  const [seenParam, setSeenParam] = useState(params.shelf);
  if (params.shelf !== seenParam) {
    setSeenParam(params.shelf);
    if (params.shelf !== undefined) setShelf(params.shelf);
  }

  // A tag or platform belongs to one app; switching apps clears them.
  const [seenKind, setSeenKind] = useState(kind);
  if (kind !== seenKind) {
    setSeenKind(kind);
    setShelf('');
    setTag('');
    setPlatform('');
    setSort('added');
  }

  const server = useServer(kind);
  const meta = useMeta(kind);
  const tags = useTags(kind);
  const platforms = usePlatforms();
  const query: ShelfQuery = { shelf: shelf || undefined, sort, tag: tag || undefined, platform: (kind === 'games' && platform) || undefined, limit: PAGE };

  const list = useInfiniteQuery<Page<Card>, ApiError>({
    queryKey: [kind, server.url, 'wall', query],
    enabled: !!server.url,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => request<Page<Card>>(server, 'GET', shelfPath(query, pageParam as number)),
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
  });

  const { width } = useWindowDimensions();
  const gap = 10;
  const coverWidth = Math.floor((width - gutter * 2 - 16 - gap * (COLUMNS - 1)) / COLUMNS);

  const items = useMemo(() => {
    const all = list.data?.pages.flatMap((p) => p.items) ?? [];
    const needle = title.trim().toLowerCase();
    return needle ? all.filter((c) => `${c.title} ${c.creator ?? ''} ${c.subtitle}`.toLowerCase().includes(needle)) : all;
  }, [list.data, title]);

  const rows = useMemo(() => {
    const out: Card[][] = [];
    for (let i = 0; i < items.length; i += COLUMNS) out.push(items.slice(i, i + COLUMNS));
    return out;
  }, [items]);

  const total = list.data?.pages[0]?.total ?? 0;
  const shelfOptions = [{ key: '', label: 'All' }, ...(meta.data?.shelves ?? [])];
  const narrowed = [tag && `#${tags.data?.items.find((t) => t.slug === tag)?.name ?? tag}`, platform, sort !== 'added' && `by ${sorts[kind].find((s) => s.key === sort)?.label.toLowerCase()}`].filter(Boolean);

  return (
    <View style={{ flex: 1 }}>
      <Header />
      <FlatList
        data={rows}
        keyExtractor={(row) => row[0].id}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={false} tintColor={colors.inkDim} onRefresh={() => list.refetch()} />}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: gutter, paddingTop: 14, gap: 10 }}>
            <Segmented scroll options={shelfOptions} value={shelf} onChange={setShelf} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field
                value={title}
                onChangeText={setTitle}
                placeholder="Filter by title"
                style={{ flex: 1 }}
                autoCorrect={false}
                clearButtonMode="while-editing"
                returnKeyType="done"
              />
              <Button pressed={open || narrowed.length > 0} onPress={() => setOpen(!open)}>
                {open ? 'Done' : 'Sort'}
              </Button>
            </View>
            {open ? (
              <View style={styles.panel}>
                <T variant="small">Sort by</T>
                <Segmented scroll options={sorts[kind]} value={sort} onChange={setSort} />
                {tags.data && tags.data.items.length > 0 ? (
                  <>
                    <T variant="small" style={{ marginTop: 6 }}>
                      Tag
                    </T>
                    <View style={styles.chips}>
                      {tags.data.items.map((t) => (
                        <Chip key={t.slug} label={`${t.name} ${t.count}`} on={tag === t.slug} onPress={() => setTag(tag === t.slug ? '' : t.slug)} />
                      ))}
                    </View>
                  </>
                ) : null}
                {kind === 'games' && platforms.data && platforms.data.items.length > 0 ? (
                  <>
                    <T variant="small" style={{ marginTop: 6 }}>
                      Platform
                    </T>
                    <View style={styles.chips}>
                      {platforms.data.items.map((p) => (
                        <Chip key={p} label={p} on={platform === p} onPress={() => setPlatform(platform === p ? '' : p)} />
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}
            <T variant="meta" style={{ marginBottom: 6 }}>
              {list.data
                ? `${title ? `${items.length} of ` : ''}${total} ${kind === 'books' ? (total === 1 ? 'book' : 'books') : total === 1 ? 'game' : 'games'}${narrowed.length ? `, ${narrowed.join(', ')}` : ''}`
                : ' '}
            </T>
          </View>
        }
        ListEmptyComponent={
          list.isPending ? (
            <Loading />
          ) : list.isError ? (
            <Problem error={list.error} retry={() => list.refetch()} />
          ) : (
            <Empty title={title ? 'Nothing by that name here' : 'Nothing on this shelf'} />
          )
        }
        renderItem={({ item: row }) => (
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', gap, paddingHorizontal: gutter + 8, height: coverWidth / coverAspect[kind] }}>
              {row.map((card) => (
                <ShelfItem key={card.id} kind={kind} card={card} width={coverWidth} />
              ))}
            </View>
            <Plank style={{ marginHorizontal: gutter }} />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.band, borderRadius: 12, padding: 12, gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
