import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { coverSource, useServer } from '@/lib/api';
import { colors, coverAspect, fonts, type AppKind } from '@/theme';

import { accents } from '@/theme';
import { T } from './text';

/**
 * A whole cover, at every size: no spines, no cropping to a banner. A book or
 * game with no art gets a typeset cover (the title set large, the creator
 * beneath, a rule between), rendered here rather than stored, so it follows
 * title edits. It is not an error state; plenty of things live there for good.
 */
export function Cover({
  kind,
  url,
  title,
  creator,
  width,
  rating,
  band,
}: {
  kind: AppKind;
  url: string | null;
  title: string;
  creator?: string | null;
  width: number;
  rating?: number | null;
  /** A community version's name and author, across the lower cover (games). */
  band?: { name: string; author: string | null } | null;
}) {
  const server = useServer(kind);
  const [failed, setFailed] = useState(false);
  const source = coverSource(server, url);
  const height = width / coverAspect[kind];
  const big = width >= 140;

  return (
    <View style={{ width, height }}>
      {source && !failed ? (
        <Image
          source={source}
          alt=""
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={180}
          recyclingKey={source.uri}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder, { padding: big ? 14 : 8 }]}>
          <T
            numberOfLines={big ? 6 : 4}
            style={{
              fontFamily: kind === 'books' ? fonts.serif : fonts.display,
              fontSize: big ? 22 : width < 70 ? 11 : width < 90 ? 13 : 16,
              lineHeight: big ? 25 : width < 70 ? 13 : width < 90 ? 15 : 18,
              color: colors.ink,
            }}>
            {title}
          </T>
          {creator ? (
            <>
              <View style={[styles.rule, { marginVertical: big ? 10 : 6 }]} />
              <T numberOfLines={2} style={{ fontFamily: fonts.narrow, fontSize: big ? 14 : 11, color: colors.inkDim }}>
                {creator}
              </T>
            </>
          ) : null}
        </View>
      )}
      {band ? (
        <View style={[styles.band, { backgroundColor: accents.games.label }]}>
          <T numberOfLines={1} style={{ fontFamily: fonts.narrowBold, fontSize: big ? 14 : 11, color: colors.ground }}>
            {band.name}
          </T>
          {band.author && big ? (
            <T numberOfLines={1} style={{ fontFamily: fonts.narrow, fontSize: 12, color: colors.ground }}>
              {band.author}
            </T>
          ) : null}
        </View>
      ) : null}
      {rating ? <Sticker rating={rating} big={big} /> : null}
    </View>
  );
}

/** The rating as a small cream tag, slightly askew, on the top corner. */
export function Sticker({ rating, big }: { rating: number; big?: boolean }) {
  return (
    <View style={[styles.sticker, big && styles.stickerBig]}>
      <T style={{ fontFamily: fonts.mono, fontSize: big ? 15 : 11, color: colors.ground, lineHeight: big ? 18 : 13 }}>
        {rating}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colors.panel, justifyContent: 'flex-start' },
  rule: { height: 1, backgroundColor: colors.line, alignSelf: 'stretch' },
  band: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 4 },
  sticker: {
    position: 'absolute',
    top: 6,
    right: -4,
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignItems: 'center',
    backgroundColor: colors.sticker,
    transform: [{ rotate: '6deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  stickerBig: { top: 10, right: -6, minWidth: 28, paddingHorizontal: 7, paddingVertical: 3 },
});
