import * as React from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type MarqueeProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Pixels per second.
   */
  speed?: number;
  /**
   * Extra spacing between each repeated copy.
   */
  spacing?: number;
  reverse?: boolean;
};

export default function Marquee({ children, style, speed = 60, spacing = 28, reverse = false }: MarqueeProps) {
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [contentWidth, setContentWidth] = React.useState(0);

  const translateX = useSharedValue(0);

  const onContainerLayout = (event: LayoutChangeEvent) => {
    const w = Math.floor(event.nativeEvent.layout.width);
    if (w > 0 && w !== containerWidth) setContainerWidth(w);
  };

  const onContentLayout = (event: LayoutChangeEvent) => {
    const w = Math.floor(event.nativeEvent.layout.width);
    if (w > 0 && w !== contentWidth) setContentWidth(w);
  };

  const canAnimate = containerWidth > 0 && contentWidth > 0 && speed > 0;

  React.useEffect(() => {
    cancelAnimation(translateX);

    if (!canAnimate) return;

    const durationMs = Math.max(1500, Math.round((contentWidth / speed) * 1000));
    const start = reverse ? -contentWidth : 0;
    const end = reverse ? 0 : -contentWidth;
    translateX.value = start;
    translateX.value = withRepeat(
      withTiming(end, { duration: durationMs, easing: Easing.linear }),
      -1,
      false
    );

    return () => cancelAnimation(translateX);
  }, [canAnimate, contentWidth, speed, reverse, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const clones = React.useMemo(() => {
    if (!canAnimate) return 1;
    // Ensure we always have enough tiles to cover the screen while moving.
    return Math.max(2, Math.ceil(containerWidth / contentWidth) + 2);
  }, [canAnimate, containerWidth, contentWidth]);

  return (
    <View style={[styles.container, style]} onLayout={onContainerLayout}>
      {/* measure a single tile (includes spacing) */}
      <View style={styles.measure} pointerEvents="none">
        <View style={[styles.row, { paddingRight: spacing }]} onLayout={onContentLayout}>
          {children}
        </View>
      </View>

      {!canAnimate ? (
        <View style={[styles.row, { paddingRight: spacing }]}>{children}</View>
      ) : (
        <Animated.View style={[styles.track, animatedStyle]}>
          {Array.from({ length: clones }).map((_, idx) => (
            <View key={`tile-${idx}`} style={[styles.row, { paddingRight: spacing }]}>
              {children}
            </View>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    width: '100%',
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  measure: {
    position: 'absolute',
    opacity: 0,
    left: -10_000,
  },
});
