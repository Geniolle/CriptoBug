import * as React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path as SvgPath, Rect as SvgRect, Stop } from 'react-native-svg';

import { GlassCard } from '@/components/ui/GlassCard';
import { theme } from '@/constants/theme';
import type { RankedAsset } from '@/lib/types';
import { fetchChartData, type ChartCandle } from '@/lib/chart-data';
import { getSkia } from '@/lib/optional-skia';

const PERIOD_OPTIONS = [
  { key: '1minuto', label: '1m' },
  { key: '5minutos', label: '5m' },
  { key: '30minutos', label: '30m' },
  { key: 'hr', label: '1h' },
  { key: 'dia', label: '1d' },
  { key: 'semana', label: '1w' },
  { key: 'mes', label: '1M' },
  { key: 'ano', label: '1Y' },
] as const;

function formatPercent(value: number): string {
  const signal = value > 0 ? '+' : '';
  return `${signal}${value.toFixed(3)}%`;
}

function computeCoords(points: number[], width: number, height: number, padding: number): Array<{ x: number; y: number }> {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1e-9, max - min);

  const usableW = Math.max(1, safeW - padding * 2);
  const usableH = Math.max(1, safeH - padding * 2);

  return points.map((yVal, idx) => {
    const x = padding + (idx / Math.max(1, points.length - 1)) * usableW;
    const y = padding + (1 - (yVal - min) / range) * usableH;
    return { x, y };
  });
}

function downsampleCandles(candles: ChartCandle[], maxPoints = 220): ChartCandle[] {
  if (candles.length <= maxPoints) return candles;
  const step = Math.ceil(candles.length / maxPoints);
  const out: ChartCandle[] = [];
  for (let i = 0; i < candles.length; i += step) {
    out.push(candles[i]);
  }
  return out;
}

export function AssetChartCard({
  asset,
  period,
  onChangePeriod,
  onOpenDetails,
}: {
  asset: RankedAsset | null;
  period: string;
  onChangePeriod: (period: string) => void;
  onOpenDetails: () => void;
}) {
  const [candles, setCandles] = React.useState<ChartCandle[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [chartWidth, setChartWidth] = React.useState(320);

  const points = React.useMemo(() => {
    const sampled = downsampleCandles(candles);
    return sampled.map((c) => c.close).filter((v) => Number.isFinite(v) && v > 0);
  }, [candles]);

  const last = points.length > 0 ? points[points.length - 1] : null;
  const first = points.length > 0 ? points[0] : null;
  const changePct = last && first ? ((last - first) / Math.max(1e-9, first)) * 100 : 0;

  React.useEffect(() => {
    if (!asset) {
      setCandles([]);
      setError(null);
      return;
    }

    let cancelled = false;
    const target = asset;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchChartData({
          coin: target.symbol,
          period,
          exchange: target.bestExchangeKey || 'binance',
          quote: target.quoteAsset || 'USDT',
        });

        if (cancelled) return;
        if (result.data?.error) {
          throw new Error(result.data.error);
        }

        const incoming = Array.isArray(result.data.candles) ? result.data.candles : [];
        const mapped = incoming
          .map((c) => ({
            timestamp: Number(c.timestamp),
            datetime_utc: String(c.datetime_utc ?? ''),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume),
          }))
          .filter((c) => Number.isFinite(c.timestamp) && Number.isFinite(c.close))
          .sort((a, b) => a.timestamp - b.timestamp);

        setCandles(mapped);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Erro desconhecido');
        setCandles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [asset?.id, period]);

  const chartColor = changePct >= 0 ? theme.colors.primary : '#FB7185';

  return (
    <GlassCard style={styles.card} intensity={24}>
      <Pressable onPress={onOpenDetails} style={styles.inner}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {asset ? `${asset.name} (${asset.symbol})` : 'Selecione um ativo'}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {asset ? `Corretora: ${asset.bestExchange || asset.bestExchangeKey || '-'} | Par: ${asset.marketSymbol}` : 'Top 30 arbitragem'}
            </Text>
          </View>

          <View style={styles.rightMeta}>
            {loading ? (
              <ActivityIndicator size="small" color={theme.colors.muted} />
            ) : (
              <>
                <Text style={styles.price}>{last ? last.toFixed(last < 1 ? 6 : 2) : '-'}</Text>
                <Text style={[styles.delta, { color: chartColor }]}>{formatPercent(changePct)}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.chart}>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : points.length < 2 ? (
            <Text style={styles.muted}>Sem dados de grafico.</Text>
          ) : (
            <View
              onLayout={(event) => {
                const w = Math.floor(event.nativeEvent.layout.width);
                if (w > 0) setChartWidth(w);
              }}
              style={{ alignItems: 'center' }}
            >
              <LineChart points={points} color={chartColor} width={chartWidth} height={160} />
            </View>
          )}
        </View>

        <View style={styles.periodRow}>
          {PERIOD_OPTIONS.map((opt) => {
            const active = opt.key === period;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onChangePeriod(opt.key);
                }}
                style={({ pressed }) => [
                  styles.periodChip,
                  active ? styles.periodChipActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={[styles.periodText, active ? styles.periodTextActive : null]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </GlassCard>
  );
}

function LineChart({
  points,
  color,
  width,
  height,
}: {
  points: number[];
  color: string;
  width: number;
  height: number;
}) {
  const padding = 10;
  const skia = getSkia();

  const coords = React.useMemo(() => computeCoords(points, width, height, padding), [points, width, height]);
  const d = React.useMemo(() => {
    if (coords.length === 0) return '';
    let out = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      out += ` L ${coords[i].x} ${coords[i].y}`;
    }
    return out;
  }, [coords]);

  // Fill under curve: close the path to bottom.
  const fillD = React.useMemo(() => {
    if (!d || coords.length === 0) return '';
    const last = coords[coords.length - 1];
    const first = coords[0];
    const bottom = height - padding;
    return `${d} L ${last.x} ${bottom} L ${first.x} ${bottom} Z`;
  }, [d, coords, height]);

  return skia ? (
    <SkiaLineChart coords={coords} color={color} width={width} height={height} padding={padding} />
  ) : (
    <SvgLineChart d={d} fillD={fillD} color={color} width={width} height={height} />
  );
}

function SkiaLineChart({
  coords,
  color,
  width,
  height,
  padding,
}: {
  coords: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  height: number;
  padding: number;
}) {
  const skia = getSkia();
  if (!skia) {
    return <SvgLineChart d="" fillD="" color={color} width={width} height={height} />;
  }

  const { Canvas, LinearGradient, Path, Rect, Skia, vec } = skia;

  const path = React.useMemo(() => {
    const p = Skia.Path.Make();
    coords.forEach((pt, idx) => {
      if (idx === 0) p.moveTo(pt.x, pt.y);
      else p.lineTo(pt.x, pt.y);
    });
    return p;
  }, [coords, Skia]);

  const fillPath = React.useMemo(() => {
    const p = path.copy();
    p.lineTo(width - padding, height - padding);
    p.lineTo(padding, height - padding);
    p.close();
    return p;
  }, [path, width, height, padding]);

  return (
    <Canvas style={{ width, height }}>
      <Rect x={0} y={0} width={width} height={height} color="rgba(255,255,255,0.02)" />

      <Path path={fillPath} style="fill" opacity={0.55}>
        <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={[`${color}66`, 'rgba(0,0,0,0)']} />
      </Path>

      <Path path={path} style="stroke" strokeWidth={2.5} color={color} />
    </Canvas>
  );
}

function SvgLineChart({
  d,
  fillD,
  color,
  width,
  height,
}: {
  d: string;
  fillD: string;
  color: string;
  width: number;
  height: number;
}) {
  const gradId = 'grad';

  return (
    <Svg width={width} height={height}>
      <SvgRect x={0} y={0} width={width} height={height} fill="rgba(255,255,255,0.02)" />
      <Defs>
        <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2={String(height)}>
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      {fillD ? <SvgPath d={fillD} fill={`url(#${gradId})`} opacity={0.65} /> : null}
      {d ? <SvgPath d={d} fill="none" stroke={color} strokeWidth={2.5} /> : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: theme.space.md,
  },
  inner: {
    padding: theme.space.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 4,
    color: theme.colors.muted2,
    fontSize: 11,
    fontWeight: '600',
  },
  rightMeta: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 78,
  },
  price: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  delta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
  },
  chart: {
    marginTop: theme.space.md,
    alignItems: 'stretch',
    justifyContent: 'center',
    minHeight: 160,
  },
  error: {
    color: '#FDA4AF',
    fontSize: 12,
    fontWeight: '600',
  },
  muted: {
    color: theme.colors.muted2,
    fontSize: 12,
    fontWeight: '600',
  },
  periodRow: {
    marginTop: theme.space.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  periodChip: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  periodChipActive: {
    borderColor: 'rgba(34,197,94,0.45)',
    backgroundColor: 'rgba(34,197,94,0.14)',
  },
  periodText: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  periodTextActive: {
    color: theme.colors.primary,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});
