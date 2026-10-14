import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { entryHref } from '@/lib/routes';
import type { Card, GameExtra } from '@/lib/types';
import { colors, coverAspect, gutter, type AppKind } from '@/theme';

import { Cover } from './cover';
import { T } from './text';

/** The board a row of covers stands on: a lit front edge, the plank, and its shadow on the wall. */
export function Plank({ style }: { style?: object }) {
  return (
    <View style={style} pointerEvents="none">
      <View style={{ height: 2, backgroundColor: colors.plankEdge }} />
      <View style={{ height: 12, backgroundColor: colors.plank }} />
      <View style={{ height: 6, backgroundColor: colors.plankShadow, opacity: 0.7 }} />
    </View>
  );
}

export { entryHref };

export function communityBand(kind: AppKind, card: Card) {
  if (kind !== 'games') return null;
  const extra = card.extra as GameExtra;
  return extra.community ? { name: card.subtitle, author: card.creator } : null;
}

/** One cover on a shelf, tappable through to its entry. */
export function ShelfItem({
  kind,
  card,
  width,
  index = 0,
  animate,
}: {
  kind: AppKind;
  card: Card;
  width: number;
  index?: number;
  animate?: boolean;
}) {
  const cover = (
    <Cover
      kind={kind}
      url={card.coverUrl}
      title={card.title}
      creator={kind === 'books' ? card.creator : (card.extra as GameExtra).platform}
      width={width}
      rating={card.rating}
      band={communityBand(kind, card)}
    />
  );
  return (
    <Link href={entryHref(kind, card.id)} asChild>
      <Pressable accessibilityLabel={card.title} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        {animate ? (
          // The one orchestrated moment: the shelf resolving as you arrive.
          <Animated.View entering={FadeIn.delay(Math.min(index, 12) * 45).duration(320)}>{cover}</Animated.View>
        ) : (
          cover
        )}
      </Pressable>
    </Link>
  );
}

/** A sideways strip of one shelf, standing on a plank, with "See all". */
export function ShelfStrip({
  kind,
  title,
  total,
  items,
  seeAll,
  animate,
}: {
  kind: AppKind;
  title: string;
  total: number;
  items: Card[];
  seeAll: () => void;
  animate?: boolean;
}) {
  const width = kind === 'books' ? 104 : 112;
  const height = width / coverAspect[kind];
  if (items.length === 0) return null;
  return (
    <View style={styles.strip}>
      <View style={styles.stripHead}>
        <T variant="display" style={{ fontSize: 24, lineHeight: 28 }}>
          {title}
        </T>
        <T variant="meta" style={{ marginLeft: 8 }}>
          {total}
        </T>
        <View style={{ flex: 1 }} />
        <Pressable onPress={seeAll} hitSlop={10} accessibilityRole="link">
          <T variant="meta" style={styles.seeAll}>
            See all {total}
          </T>
        </Pressable>
      </View>
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: gutter + 8, gap: 10, height }}>
          {items.map((card, i) => (
            <ShelfItem key={card.id} kind={kind} card={card} width={width} index={i} animate={animate} />
          ))}
        </ScrollView>
        <Plank style={{ marginHorizontal: gutter }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { marginTop: 28 },
  stripHead: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: gutter, marginBottom: 12 },
  seeAll: { textDecorationLine: 'underline', color: colors.ink },
});
