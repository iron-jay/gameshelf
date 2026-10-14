import * as Haptics from 'expo-haptics';
import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, fonts } from '@/theme';

import { useAccent } from './accent';
import { T } from './text';

function tick() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  kind?: 'primary' | 'secondary' | 'danger' | 'quiet';
  pressed?: boolean;
  busy?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The web's `.btn` pill: something to press, not a box to fill in. */
export function Button({ children, kind = 'secondary', pressed, busy, small, style, disabled, onPress, ...rest }: ButtonProps) {
  const { accent, accentInk } = useAccent();
  const filled = kind === 'primary' || kind === 'danger';
  const bg = kind === 'primary' ? accent : kind === 'danger' ? colors.danger : 'transparent';
  const fg = kind === 'primary' ? accentInk : colors.ink;
  const border = filled || kind === 'quiet' ? 'transparent' : pressed ? accent : colors.lineStrong;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || busy, selected: pressed }}
      disabled={disabled || busy}
      onPress={(e) => {
        tick();
        onPress?.(e);
      }}
      style={({ pressed: down }) => [
        styles.btn,
        small && styles.btnSmall,
        kind === 'quiet' && styles.btnQuiet,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : down ? 0.8 : 1 },
        style,
      ]}
      {...rest}>
      {busy ? (
        <ActivityIndicator color={fg} size="small" />
      ) : typeof children === 'string' ? (
        <T
          style={{
            color: kind === 'quiet' ? colors.inkDim : fg,
            fontFamily: filled || pressed ? fonts.narrowBold : fonts.narrow,
            fontSize: small ? 14 : 16,
            textDecorationLine: kind === 'quiet' ? 'underline' : 'none',
          }}>
          {children}
        </T>
      ) : (
        children
      )}
    </Pressable>
  );
}

/** One of many: the shelf something is on. Scrolls sideways rather than wrapping. */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  scroll,
}: {
  options: { key: K; label: string }[];
  value: K | null;
  onChange: (key: K) => void;
  scroll?: boolean;
}) {
  const { accent, accentInk } = useAccent();
  const items = options.map((o) => {
    const on = o.key === value;
    return (
      <Pressable
        key={o.key}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => {
          if (!on) tick();
          onChange(o.key);
        }}
        style={[styles.segment, !scroll && { flex: 1 }, on && { backgroundColor: accent }]}>
        <T
          numberOfLines={1}
          style={{
            fontFamily: on ? fonts.narrowBold : fonts.narrow,
            fontSize: 15,
            color: on ? accentInk : colors.inkDim,
          }}>
          {o.label}
        </T>
      </Pressable>
    );
  });

  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmented}>
        {items}
      </ScrollView>
    );
  }
  return <View style={styles.segmented}>{items}</View>;
}

export const Field = forwardRef<TextInput, TextInputProps & { multiline?: boolean }>(function Field(
  { style, ...props },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.inkDim}
      selectionColor={colors.ink}
      style={[styles.field, props.multiline && styles.fieldMulti, style]}
      {...props}
    />
  );
});

/** A small removable or pressable label: a tag, a filter. */
export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  const { accent } = useAccent();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        tick();
        onPress?.();
      }}
      style={[styles.chip, on && { borderColor: accent }]}>
      <T style={{ fontFamily: on ? fonts.narrowSemibold : fonts.narrow, fontSize: 14, color: on ? colors.ink : colors.inkDim }}>
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnSmall: { minHeight: 34, paddingHorizontal: 12 },
  btnQuiet: { paddingHorizontal: 4 },
  segmented: {
    flexDirection: 'row',
    gap: 2,
    padding: 4,
    borderRadius: 26,
    backgroundColor: colors.well,
  },
  segment: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.well,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  fieldMulti: { minHeight: 140, textAlignVertical: 'top', fontFamily: fonts.serifRegular, fontSize: 17, lineHeight: 24 },
  chip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
  },
});
