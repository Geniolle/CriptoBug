import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { GlassCard } from '@/components/ui/GlassCard';
import { theme } from '@/constants/theme';
import Marquee from '@/components/base/marquee';

const exchanges = [
  {
    name: 'Binance',
    logo: (
      <Svg width={28} height={28} viewBox="0 0 32 32" fill="none">
        <Rect width="32" height="32" rx="6" fill="#F0B90B" />
        <Path
          d="M16 6l3.09 3.09L13.18 15l-3.09-3.09L16 6zm5.91 5.91L25 15l-3.09 3.09-5.91-5.91 3.09-3.09v-.18zM7 15l3.09-3.09 3.09 3.09L10.09 18.09 7 15zm8.91 2.91L19.09 21.09 16 24.18l-3.09-3.09 3.09-3.09-.09-.09zM16 13.18L18.82 16 16 18.82 13.18 16 16 13.18z"
          fill="#1E2026"
        />
      </Svg>
    ),
  },
  {
    name: 'Kraken',
    logo: (
      <Svg width={28} height={28} viewBox="0 0 32 32" fill="none">
        <Rect width="32" height="32" rx="6" fill="#7B61FF" />
        <Path
          d="M16 7c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 14.5c-3.04 0-5.5-2.46-5.5-5.5S12.96 10.5 16 10.5s5.5 2.46 5.5 5.5-2.46 5.5-5.5 5.5zm0-8a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"
          fill="white"
        />
      </Svg>
    ),
  },
  {
    name: 'OKX',
    logo: (
      <Svg width={28} height={28} viewBox="0 0 32 32" fill="none">
        <Rect width="32" height="32" rx="6" fill="#000000" />
        <Rect x="8" y="8" width="5" height="5" rx="1" fill="white" />
        <Rect x="13.5" y="8" width="5" height="5" rx="1" fill="white" />
        <Rect x="19" y="8" width="5" height="5" rx="1" fill="white" />
        <Rect x="8" y="13.5" width="5" height="5" rx="1" fill="white" />
        <Rect x="19" y="13.5" width="5" height="5" rx="1" fill="white" />
        <Rect x="8" y="19" width="5" height="5" rx="1" fill="white" />
        <Rect x="13.5" y="19" width="5" height="5" rx="1" fill="white" />
        <Rect x="19" y="19" width="5" height="5" rx="1" fill="white" />
      </Svg>
    ),
  },
  {
    name: 'Bybit',
    logo: (
      <Svg width={28} height={28} viewBox="0 0 32 32" fill="none">
        <Rect width="32" height="32" rx="6" fill="#F7A600" />
        <Path
          d="M10 10h4v4h-4v-4zm0 8h4v4h-4v-4zm8-8h4v4h-4v-4zm-4 4h4v4h-4v-4zm8 4h4v4h-4v-4z"
          fill="#1E2026"
        />
      </Svg>
    ),
  },
] as const;

export function ExchangeCarousel() {
  return (
    <GlassCard style={styles.card} intensity={22}>
      <Marquee speed={35} spacing={36} style={{ paddingVertical: theme.space.md }}>
        {exchanges.map((ex) => (
          <View key={ex.name} style={styles.item}>
            {ex.logo}
            <Text style={styles.label}>{ex.name}</Text>
          </View>
        ))}
      </Marquee>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: theme.space.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: theme.space.md,
  },
  label: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
});
