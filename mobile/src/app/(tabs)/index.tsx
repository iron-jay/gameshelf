import { useQueryClient } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useKind } from '@/components/accent';
import { Button } from '@/components/controls';
import { Cover } from '@/components/cover';
import { Header } from '@/components/header';
import { ServerSetup } from '@/components/server-setup';
import { communityBand, entryHref, ShelfStrip } from '@/components/shelf';
import { Loading, Problem } from '@/components/state';
import { T } from '@/components/text';
import { useShelf, useUpdateEntry } from '@/lib/api';
import { useServers } from '@/lib/servers';
import { layouts } from '@/lib/shelves';
import type { BookExtra, Card, GameExtra } from '@/lib/types';
import { colors, gutter, type AppKind } from '@/theme';

/** A strip is a glimpse; "See all" is the whole shelf. */
const STRIP_LENGTH = 24;

/** The shelf resolves once, on arrival; coming back to it later is quiet. */
const arrived = new Set<AppKind>();

export default function ShelvesScreen() {
  const kind = useKind();
  const { servers } = useServers();
  const client = useQueryClient();

  if (!servers.books.url && !servers.games.url) {
    return (
      <View style={{ flex: 1 }}>
        <Header />
        <ScrollView contentContainerStyle={{ padding: gutter, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <T variant="display" style={{ marginTop: 12 }}>
            Where are your shelves?
          </T>
          <T variant="meta" style={{ marginTop: 8, marginBottom: 20 }}>
            The address you open bookshelf or gameshelf at in a browser at home. Start with either; the other can be added later under More.
          </T>
          <ServerSetup />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Header />
      <ScrollView
        key={kind}
        refreshControl={
          <RefreshControl
            refreshing={false}
            tintColor={colors.inkDim}
            onRefresh={() => client.invalidateQueries({ queryKey: [kind] })}
          />
        }
        contentContainerStyle={{ paddingBottom: 40 }}>
        <Shelves kind={kind} />
      </ScrollView>
    </View>
  );
}

function Shelves({ kind }: { kind: AppKind }) {
  const layout = layouts[kind];
  const band = useShelf(kind, { shelf: layout.band.shelf, sort: 'added', limit: 20 });
  const [animate] = useState(() => !arrived.has(kind));
  useEffect(() => {
    if (band.data) arrived.add(kind);
  }, [band.data, kind]);

  if (band.isPending) return <Loading />;
  if (band.isError) return <Problem error={band.error} retry={() => band.refetch()} />;

  return (
    <>
      <InHand kind={kind} cards={band.data.items} />
      {layout.strips.map((strip) => (
        <Strip key={strip.shelf} kind={kind} {...strip} animate={animate} />
      ))}
      {kind === 'books' ? <FinishedThisYear /> : <ShelfCount kind={kind} />}
    </>
  );
}

function Strip({ kind, shelf, title, sort, animate }: { kind: AppKind; shelf: string; title: string; sort?: string; animate: boolean }) {
  const q = useShelf(kind, { shelf, sort: sort ?? 'added', limit: STRIP_LENGTH });
  if (!q.data) return null;
  return (
    <ShelfStrip
      kind={kind}
      title={title}
      total={q.data.total}
      items={q.data.items}
      animate={animate}
      seeAll={() => router.navigate({ pathname: '/all', params: { shelf } })}
    />
  );
}

/** What you are reading or playing, large, with the two things you do to it one press away. */
function InHand({ kind, cards }: { kind: AppKind; cards: Card[] }) {
  const { band } = layouts[kind];
  return (
    <View style={styles.band}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
        <T variant="display">{band.title}</T>
        <T variant="meta">
          {cards.length === 0 ? 'Nothing on the go' : `${cards.length} ${band.noun[cards.length === 1 ? 0 : 1]}`}
        </T>
      </View>
      {cards.length === 0 ? <T variant="meta">{band.empty}</T> : null}
      <View style={{ gap: 18 }}>
        {cards.map((card) => (
          <InHandItem key={card.id} kind={kind} card={card} />
        ))}
      </View>
    </View>
  );
}

function InHandItem({ kind, card }: { kind: AppKind; card: Card }) {
  const update = useUpdateEntry(kind);
  const { band } = layouts[kind];
  const detail =
    kind === 'books'
      ? [card.creator, (card.extra as BookExtra).format === 'audiobook' ? 'Audiobook' : null]
      : [(card.extra as GameExtra).platform, (card.extra as GameExtra).community ? card.subtitle : null];

  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      <Link href={entryHref(kind, card.id)} asChild>
        <Pressable accessibilityLabel={card.title}>
          <Cover kind={kind} url={card.coverUrl} title={card.title} creator={card.creator} width={84} band={communityBand(kind, card)} />
        </Pressable>
      </Link>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Link href={entryHref(kind, card.id)} asChild>
          <Pressable>
            <T
              variant={kind === 'books' ? 'bookTitle' : 'heading'}
              style={kind === 'books' ? { fontSize: 21, lineHeight: 24 } : undefined}
              numberOfLines={2}>
              {card.title}
            </T>
          </Pressable>
        </Link>
        <T variant="meta" numberOfLines={1} style={{ marginTop: 4 }}>
          {detail.filter(Boolean).join(' · ')}
        </T>
        <View style={{ flex: 1, minHeight: 10 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {band.actions.map((action) => (
            <Button
              key={action.label}
              small
              kind={action.primary ? 'primary' : 'secondary'}
              busy={update.isPending && update.variables?.change === action.change}
              disabled={update.isPending}
              onPress={() => update.mutate({ id: card.id, change: action.change })}>
              {action.label}
            </Button>
          ))}
        </View>
      </View>
    </View>
  );
}

/** "31 finished in 2026": the whole of the stats feature, as on the web. */
function FinishedThisYear() {
  const year = new Date().getFullYear();
  const q = useShelf('books', { sort: 'finished', limit: 500 });
  const all = useShelf('books', { limit: 1 });
  if (!q.data) return null;
  const finished = q.data.items.filter((c) => c.lastFinishedOn?.startsWith(String(year))).length;
  return (
    <T variant="meta" style={styles.footer}>
      {finished > 0 ? `${finished} finished in ${year}. ` : ''}
      {all.data ? `${all.data.total} books on your shelves.` : ''}
    </T>
  );
}

function ShelfCount({ kind }: { kind: AppKind }) {
  const all = useShelf(kind, { limit: 1 });
  if (!all.data) return null;
  return (
    <T variant="meta" style={styles.footer}>
      {all.data.total} games on your shelves.
    </T>
  );
}

const styles = StyleSheet.create({
  band: { backgroundColor: colors.band, paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 24 },
  footer: { paddingHorizontal: gutter, marginTop: 32 },
});
