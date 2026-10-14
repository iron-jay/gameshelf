import type { EntryChange } from './types';
import type { AppKind } from '@/theme';

/**
 * How each shelves page is laid out, matching the web's home page: the shelf
 * in hand as a band across the top with its two one-press actions, then a
 * strip per shelf. The shelf keys and names come from /meta; this is only the
 * arrangement, which /meta does not describe.
 */
export type ShelvesLayout = {
  band: {
    shelf: string;
    title: string;
    noun: [string, string];
    empty: string;
    actions: { label: string; change: EntryChange; primary?: boolean }[];
  };
  strips: { shelf: string; title: string; sort?: string }[];
};

export const layouts: Record<AppKind, ShelvesLayout> = {
  books: {
    band: {
      shelf: 'reading',
      title: 'Reading now',
      noun: ['book', 'books'],
      empty: 'Start a book and it waits for you here.',
      // Finishing closes the open read today, as on the book's own page.
      actions: [
        { label: 'Finished it', change: { shelf: 'finished' }, primary: true },
        { label: 'Did not finish', change: { shelf: 'dnf' } },
      ],
    },
    strips: [
      { shelf: 'tbr', title: 'To read' },
      { shelf: 'finished', title: 'Recently finished', sort: 'finished' },
      { shelf: 'dnf', title: 'Did not finish' },
    ],
  },
  games: {
    band: {
      shelf: 'playing',
      title: 'Now playing',
      noun: ['game', 'games'],
      empty: 'Start a game and it waits for you here.',
      // Finished defaults to credits, the same pair the web's button sends.
      actions: [
        { label: 'Finished it', change: { shelf: 'played', completion: 'credits' }, primary: true },
        { label: 'Drop', change: { shelf: 'dropped' } },
      ],
    },
    strips: [
      { shelf: 'wishlist', title: 'Wishlist' },
      { shelf: 'backlog', title: 'Backlog' },
      { shelf: 'played', title: 'Recently played', sort: 'finished' },
      { shelf: 'dropped', title: 'Dropped' },
    ],
  },
};

export const completions = [
  { key: 'credits', label: 'Credits' },
  { key: 'completed', label: 'Completed' },
  { key: 'mastered', label: 'Mastered' },
] as const;
