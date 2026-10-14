import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Cover } from '@/components/cover';
import { PushedScreen, Section, useRouteKind } from '@/components/screen';
import { Plank } from '@/components/shelf';
import { Loading, Problem } from '@/components/state';
import { T } from '@/components/text';
import { useBookWork, useGameWork, useMeta } from '@/lib/api';
import { entryHref, versionHref, workHref } from '@/lib/routes';
import type { BookWork, GameWork } from '@/lib/types';
import { colors, gutter, type AppKind } from '@/theme';

/** A work: its cover, summary and series, then every edition or version with your shelf beside it. */
export default function WorkScreen() {
  const kind = useRouteKind();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const book = useBookWork(kind === 'books' ? slug : undefined);
  const game = useGameWork(kind === 'games' ? slug : undefined);
  const q = kind === 'books' ? book : game;

  return (
    <PushedScreen kind={kind}>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <Problem error={q.error} retry={() => q.refetch()} />
      ) : kind === 'books' ? (
        <BookWorkView work={book.data!} />
      ) : (
        <GameWorkView work={game.data!} />
      )}
    </PushedScreen>
  );
}

function Hero({ kind, title, creator, lines, cover }: { kind: AppKind; title: string; creator: string | null; lines: (string | null)[]; cover: string | null }) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16, paddingHorizontal: 8 }}>
        <Cover kind={kind} url={cover} title={title} creator={creator} width={120} />
        <View style={{ flex: 1, paddingBottom: 6 }}>
          <T variant={kind === 'books' ? 'bookTitle' : 'name'} accessibilityRole="header">
            {title}
          </T>
          {creator ? (
            <T variant="body" style={{ marginTop: 6 }}>
              {creator}
            </T>
          ) : null}
          {lines.filter(Boolean).map((l, i) => (
            <T key={i} variant="meta" style={{ marginTop: 2 }}>
              {l}
            </T>
          ))}
        </View>
      </View>
      <Plank />
    </View>
  );
}

function shelfLabel(shelves: { key: string; label: string }[] | undefined, key: string | null) {
  if (!key) return null;
  return shelves?.find((s) => s.key === key)?.label ?? key;
}

function BookWorkView({ work }: { work: BookWork }) {
  const meta = useMeta('books');
  return (
    <View>
      <Hero
        kind="books"
        title={work.title}
        creator={work.authors.join(', ') || null}
        cover={work.coverUrl}
        lines={[
          work.subtitle,
          work.series ? `${work.series.name}${work.series.position !== null ? ` #${work.series.position}` : ''}` : null,
          work.collection && work.collection.name !== work.series?.name ? work.collection.name : null,
          work.firstPublishedYear ? `First published ${work.firstPublishedYear}` : null,
        ]}
      />
      {work.summary ? (
        <Section title="Summary">
          <T variant="serif">{work.summary}</T>
        </Section>
      ) : null}
      <Section title="Editions">
        {work.editions.map((e) => (
          <ListRow
            key={e.id}
            title={e.name}
            detail={[e.format === 'audiobook' ? 'Audiobook' : 'Book', e.language, e.credit ? `read by ${e.credit}` : null, e.isbn13 ?? e.isbn10]
              .filter(Boolean)
              .join(' · ')}
            state={e.entryId ? [shelfLabel(meta.data?.shelves, e.shelf), e.rating ? `${e.rating}/10` : null].filter(Boolean).join(' · ') : 'Add'}
            onPress={() => router.push(e.entryId ? entryHref('books', e.entryId) : versionHref('books', e.id))}
          />
        ))}
      </Section>
    </View>
  );
}

function GameWorkView({ work }: { work: GameWork }) {
  return (
    <View>
      <Hero
        kind="games"
        title={work.title}
        creator={null}
        cover={work.coverUrl}
        lines={[work.series, work.firstReleaseDate ? `Released ${work.firstReleaseDate.slice(0, 4)}` : null]}
      />
      {work.parent ? (
        <Pressable onPress={() => router.push(workHref('games', work.parent!.slug))} style={{ paddingHorizontal: gutter, marginTop: 14 }}>
          <T variant="meta" style={{ color: colors.ink, textDecorationLine: 'underline' }}>
            Part of {work.parent.title}
          </T>
        </Pressable>
      ) : null}
      {work.summary ? (
        <Section title="Summary">
          <T variant="body" style={{ lineHeight: 24 }}>
            {work.summary}
          </T>
        </Section>
      ) : null}
      <Section title="Versions">
        {work.versions.map((v) => (
          <ListRow
            key={v.id}
            title={v.community ? v.name : (v.platform ?? v.name)}
            detail={[v.community ? v.platform : null, v.community ? v.kind.replace('_', ' ') : null, v.author ? `by ${v.author}` : null, v.versionLabel]
              .filter(Boolean)
              .join(' · ')}
            state={v.entryId ? 'On your shelf' : 'Add'}
            onPress={() => router.push(v.entryId ? entryHref('games', v.entryId) : versionHref('games', v.id))}
          />
        ))}
      </Section>
      {work.children.length ? (
        <Section title="Expansions and DLC">
          {work.children.map((c) => (
            <ListRow key={c.slug} title={c.title} detail={c.workKind.replace('_', ' ')} onPress={() => router.push(workHref('games', c.slug))} />
          ))}
        </Section>
      ) : null}
    </View>
  );
}

function ListRow({ title, detail, state, onPress }: { title: string; detail?: string; state?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.band }]}>
      <View style={{ flex: 1 }}>
        <T variant="strong">{title}</T>
        {detail ? <T variant="small">{detail}</T> : null}
      </View>
      {state ? (
        <T variant="meta" style={state === 'Add' ? { color: colors.ink, textDecorationLine: 'underline' } : undefined}>
          {state}
        </T>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
});
