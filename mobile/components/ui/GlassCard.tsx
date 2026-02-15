import * as React from 'react';
import { BlurView } from 'expo-blur';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { theme } from '@/constants/theme';

export function GlassCard({
  children,
  style,
  intensity = 26,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}) {
  return (
    <BlurView intensity={intensity} tint="dark" style={[styles.card, style]}>
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(17,17,17,0.55)',
  },
});

