import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useServers } from '@/lib/servers';
import { colors, gutter, type AppKind } from '@/theme';

import { T } from './text';

const names: Record<AppKind, string> = { books: 'bookshelf', games: 'gameshelf' };

/**
 * The two wordmarks side by side: the room you are in, and the door to the
 * other. One tap switches every tab across. A shelf with no server set up is
 * left out, so someone with only one of the two never sees the other.
 */
export function Header({ right }: { right?: React.ReactNode }) {
  const { current, setCurrent, servers } = useServers();
  const insets = useSafeAreaInsets();
  const other: AppKind = current === 'books' ? 'games' : 'books';

  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <T variant="display" style={{ fontSize: 26 }} accessibilityRole="header">
        {names[current]}
      </T>
      {servers[other].url ? (
        <Pressable
          onPress={() => setCurrent(other)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Switch to ${names[other]}`}>
          <T variant="meta" style={{ fontSize: 16, color: colors.inkDim }}>
            {names[other]}
          </T>
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 14,
    paddingHorizontal: gutter,
    paddingBottom: 12,
    backgroundColor: colors.band,
  },
});
