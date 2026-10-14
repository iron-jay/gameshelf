import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gutter, type AppKind } from '@/theme';

import { KindProvider } from './accent';
import { T } from './text';

export function useRouteKind(): AppKind {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  return kind === 'games' ? 'games' : 'books';
}

/**
 * A screen pushed over the tabs: a book, a game, a work, the add sheet. It
 * takes its colour from its route, and "Back" sits at the top as on the web.
 */
export function PushedScreen({
  kind,
  children,
  back = 'Back',
  modal,
  scroll = true,
  ...scrollProps
}: {
  kind: AppKind;
  children: ReactNode;
  back?: string;
  modal?: boolean;
  scroll?: boolean;
} & ScrollViewProps) {
  const insets = useSafeAreaInsets();
  const top = modal ? 14 : insets.top + 8;
  return (
    <KindProvider kind={kind}>
      <View style={{ flex: 1, backgroundColor: colors.ground }}>
        <View style={[styles.bar, { paddingTop: top }]}>
          <Pressable
            hitSlop={14}
            accessibilityRole="button"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <T variant="meta" style={{ color: colors.ink, textDecorationLine: 'underline' }}>
              {modal ? 'Cancel' : back}
            </T>
          </Pressable>
        </View>
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            {...scrollProps}>
            {children}
          </ScrollView>
        ) : (
          children
        )}
      </View>
    </KindProvider>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <T variant="heading">{title}</T>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: gutter, paddingBottom: 10 },
  section: { paddingHorizontal: gutter, marginTop: 30 },
});
