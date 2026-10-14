import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KindProvider, useAccent } from '@/components/accent';
import { T } from '@/components/text';
import { useServers } from '@/lib/servers';
import { colors, fonts } from '@/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const labels: Record<string, string> = { index: 'Shelves', all: 'All', search: 'Search', more: 'More' };

/** Words, not icons: the same four as the web's bar on a phone. */
function WordTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { accent } = useAccent();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
            style={styles.tab}>
            <T
              style={{
                fontFamily: focused ? fonts.narrowBold : fonts.narrow,
                fontSize: 16,
                color: focused ? colors.ink : colors.inkDim,
              }}>
              {labels[route.name] ?? route.name}
            </T>
            <View style={[styles.mark, { backgroundColor: focused ? accent : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  const { current } = useServers();
  return (
    <KindProvider kind={current}>
      <Tabs
        tabBar={(props) => <WordTabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.ground } }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="all" />
        <Tabs.Screen name="search" />
        <Tabs.Screen name="more" />
      </Tabs>
    </KindProvider>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.band,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: 6 },
  mark: { height: 3, width: 22, borderRadius: 2 },
});
