/**
 * "Living room", the same tokens as both web apps' globals.css: a dark slate
 * room, chunky Archivo for names, covers standing on planks. The accent is
 * the only thing that changes between the two shelves, so switching from
 * books to games reads as walking into the next room, not into another app.
 */
export const colors = {
  ground: '#263034',
  band: '#2F3B40',
  well: '#1E272A',
  panel: '#33424A',
  line: '#3B474C',
  lineStrong: '#55636A',
  ink: '#F1ECE2',
  inkDim: '#A3ADB1',
  plank: '#3B474C',
  plankEdge: '#5A6970',
  plankShadow: '#1C2427',
  sticker: '#F1ECE2',
  danger: '#C0564B',
} as const;

export type AppKind = 'books' | 'games';

export const accents: Record<AppKind, { accent: string; accentInk: string; label: string }> = {
  books: { accent: '#C9D7B8', accentInk: '#263034', label: '#C9D7B8' },
  // The community band on a romhack's cover is the same amber, on purpose.
  games: { accent: '#E3A548', accentInk: '#263034', label: '#E3A548' },
};

/**
 * Archivo is one variable family on the web, used across its width axis.
 * React Native cannot reach a variable axis, so assets/fonts holds static cuts
 * made from the same file: 125% wide at 800 for names, 87.5% for metadata.
 */
export const fonts = {
  display: 'Archivo-Display',
  regular: 'Archivo-Regular',
  medium: 'Archivo-Medium',
  semibold: 'Archivo-SemiBold',
  bold: 'Archivo-Bold',
  narrow: 'Archivo-Narrow',
  narrowSemibold: 'Archivo-NarrowSemiBold',
  narrowBold: 'Archivo-NarrowBold',
  // Book titles, reviews, summaries and the typeset placeholder covers.
  serif: 'Newsreader_500Medium',
  serifRegular: 'Newsreader_400Regular',
  serifItalic: 'Newsreader_400Regular_Italic',
  // Literal codes and the number on a rating sticker. Nowhere else.
  mono: 'IBMPlexMono_500Medium',
} as const;

/** Books are 2:3 on the web, games 3:4. */
export const coverAspect: Record<AppKind, number> = { books: 2 / 3, games: 3 / 4 };

export const gutter = 16;
