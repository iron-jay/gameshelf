import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { useAccent } from './accent';
import { T } from './text';

/**
 * Rating out of ten as ten bars climbing left to right, filled up to the
 * rating. Tapping the current rating again takes it off.
 */
export function RatingBars({ value, onChange }: { value: number | null; onChange: (rating: number | null) => void }) {
  const { accent } = useAccent();
  return (
    <View>
      <View style={styles.head}>
        <T variant="heading">Rating</T>
        <T variant="mono" style={{ fontSize: 15 }}>
          {value ?? '–'} / 10
        </T>
      </View>
      <View style={styles.bars} accessibilityRole="adjustable" accessibilityLabel="Rating" accessibilityValue={{ min: 0, max: 10, now: value ?? 0 }}>
        {Array.from({ length: 10 }, (_, i) => {
          const n = i + 1;
          const on = value !== null && n <= value;
          return (
            <Pressable
              key={n}
              accessibilityLabel={`${n} out of 10`}
              hitSlop={{ top: 12, bottom: 12 }}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onChange(n === value ? null : n);
              }}
              style={styles.slot}>
              <View style={[styles.bar, { height: 22 + i * 4, backgroundColor: on ? accent : colors.well }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 62 },
  slot: { flex: 1, justifyContent: 'flex-end', height: '100%' },
  bar: { width: '100%' },
});
