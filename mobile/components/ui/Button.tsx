import * as React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

import { theme } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'danger';

export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
  haptics = true,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  haptics?: boolean;
}) {
  const isDisabled = Boolean(disabled || loading);
  const palette = variantStyles[variant];

  return (
    <Pressable
      onPress={async () => {
        if (isDisabled) return;
        if (haptics) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        await onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        palette.container,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={palette.text.color} /> : <Text style={[styles.text, palette.text]}>{label}</Text>}
    </Pressable>
  );
}

const variantStyles: Record<Variant, { container: ViewStyle; text: { color: string } }> = {
  primary: {
    container: { backgroundColor: 'rgba(34,197,94,0.18)', borderColor: 'rgba(34,197,94,0.42)' },
    text: { color: theme.colors.primary },
  },
  secondary: {
    container: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.10)' },
    text: { color: theme.colors.text },
  },
  danger: {
    container: { backgroundColor: 'rgba(244,63,94,0.14)', borderColor: 'rgba(244,63,94,0.40)' },
    text: { color: '#FDA4AF' },
  },
};

const styles = StyleSheet.create({
  base: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.55,
  },
});

