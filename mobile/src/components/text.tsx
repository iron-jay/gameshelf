import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts } from '@/theme';

const variants = {
  // Shelf names, page titles: the wide, heavy cut.
  display: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, letterSpacing: -0.3, color: colors.ink },
  heading: { fontFamily: fonts.display, fontSize: 20, lineHeight: 23, color: colors.ink },
  // A game's name beside its cover.
  name: { fontFamily: fonts.display, fontSize: 24, lineHeight: 27, color: colors.ink },
  // A book's title beside its cover.
  bookTitle: { fontFamily: fonts.serif, fontSize: 28, lineHeight: 32, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.ink },
  strong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.ink },
  meta: { fontFamily: fonts.narrow, fontSize: 15, lineHeight: 20, color: colors.inkDim },
  small: { fontFamily: fonts.narrow, fontSize: 13, lineHeight: 17, color: colors.inkDim },
  serif: { fontFamily: fonts.serifRegular, fontSize: 17, lineHeight: 25, color: colors.ink },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 17, color: colors.inkDim },
} satisfies Record<string, TextStyle>;

export type Variant = keyof typeof variants;

export function T({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  return <Text {...props} style={[variants[variant], style]} />;
}
