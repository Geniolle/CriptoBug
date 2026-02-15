import * as React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { theme } from '@/constants/theme';
import { getSkia } from '@/lib/optional-skia';

export function SkiaBackground() {
  const { width, height } = useWindowDimensions();
  const skia = getSkia();

  if (!skia) {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.fallbackBase, { width, height }]} />
        <View style={[styles.fallbackGlow, styles.glow1]} />
        <View style={[styles.fallbackGlow, styles.glow2]} />
        <View style={[styles.fallbackGlow, styles.glow3]} />
      </View>
    );
  }

  const { BlurMask, Canvas, Circle, LinearGradient, Rect, vec } = skia;

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient start={vec(0, 0)} end={vec(width, height)} colors={['#07120b', '#0A0A0A', '#0A0A0A']} />
      </Rect>

      <Circle cx={width * 0.18} cy={height * 0.18} r={220} color="rgba(34,197,94,0.16)">
        <BlurMask blur={60} style="normal" />
      </Circle>

      <Circle cx={width * 0.92} cy={height * 0.26} r={160} color="rgba(56,189,248,0.10)">
        <BlurMask blur={70} style="normal" />
      </Circle>

      <Circle cx={width * 0.55} cy={height * 0.92} r={260} color="rgba(244,63,94,0.06)">
        <BlurMask blur={90} style="normal" />
      </Circle>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  fallbackBase: {
    backgroundColor: theme.colors.bg,
  },
  fallbackGlow: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 999,
  },
  glow1: {
    left: -180,
    top: -170,
    backgroundColor: 'rgba(34,197,94,0.18)',
  },
  glow2: {
    right: -210,
    top: -120,
    backgroundColor: 'rgba(56,189,248,0.10)',
  },
  glow3: {
    left: -40,
    bottom: -260,
    backgroundColor: 'rgba(244,63,94,0.08)',
  },
});
