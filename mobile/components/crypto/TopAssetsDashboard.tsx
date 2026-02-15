import * as React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import type { RankedAsset } from '@/lib/types';
import { fetchTopAssets } from '@/lib/top-assets';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/theme';
import { AssetChartCard } from '@/components/crypto/AssetChartCard';

const DEFAULT_PERIOD = 'dia';

function formatPct(value: number): string {
  const signal = value > 0 ? '+' : '';
  return `${signal}${value.toFixed(3)}%`;
}

export function TopAssetsDashboard({ onOpenAsset }: { onOpenAsset: (asset: RankedAsset) => void }) {
  const [assets, setAssets] = React.useState<RankedAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = React.useState<string | null>(null);
  const [period, setPeriod] = React.useState(DEFAULT_PERIOD);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = React.useState<string | null>(null);

  const selectedAsset = React.useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );

  const loadTopAssets = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchTopAssets();
      const ranked = Array.isArray(payload.assets) ? payload.assets : [];
      setAssets(ranked);
      setGeneratedAt(payload.generatedAt ?? null);

      setSelectedAssetId((currentId) => {
        if (currentId && ranked.some((item) => item.id === currentId)) {
          return currentId;
        }
        const top = ranked.find((item) => item.available) ?? ranked[0];
        return top?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadTopAssets();
  }, [loadTopAssets]);

  function handleAssetPress(asset: RankedAsset) {
    if (selectedAssetId === asset.id) {
      if (asset.available && asset.bestExchangeKey) {
        void Haptics.selectionAsync();
        onOpenAsset(asset);
      }
      return;
    }

    void Haptics.selectionAsync();
    setSelectedAssetId(asset.id);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.meta}>
            Ranking calculado pelos hooks (lucro conservador com custos reais + buffer).
            {generatedAt ? ` Atualizado em ${new Date(generatedAt).toLocaleString()}.` : ''}
          </Text>
        </View>
        <Button
          label="Recarregar"
          onPress={loadTopAssets}
          variant="primary"
          loading={loading}
          style={{ paddingVertical: 10, paddingHorizontal: 12 }}
        />
      </View>

      {error ? (
        <GlassCard style={styles.errorCard} intensity={18}>
          <View style={{ padding: theme.space.md }}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        </GlassCard>
      ) : null}

      <AssetChartCard
        asset={selectedAsset}
        period={period}
        onChangePeriod={setPeriod}
        onOpenDetails={() => {
          if (selectedAsset && selectedAsset.available) onOpenAsset(selectedAsset);
        }}
      />

      <GlassCard style={styles.tableCard} intensity={20}>
        <View style={styles.tableHeader}>
          <Text style={styles.tableTitle}>Top 30</Text>
          <Text style={styles.tableMeta}>{loading ? 'Carregando...' : `${assets.length} ativos`}</Text>
        </View>

        {loading && assets.length === 0 ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={theme.colors.muted} />
            <Text style={styles.muted}>Carregando mercado...</Text>
          </View>
        ) : (
          <View style={styles.rows}>
            {assets.map((asset) => {
              const active = asset.id === selectedAssetId;
              const profit = asset.guaranteedProfit ? asset.guaranteedProfitPercent : asset.netProfitPercent;
              const profitColor = profit >= 0 ? theme.colors.primary : '#FB7185';

              return (
                <Pressable
                  key={asset.id}
                  onPress={() => handleAssetPress(asset)}
                  style={({ pressed }) => [
                    styles.row,
                    active ? styles.rowActive : null,
                    pressed ? styles.rowPressed : null,
                  ]}
                >
                  <View style={styles.rank}>
                    <Text style={styles.rankText}>{asset.rank}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.symbol} numberOfLines={1}>
                      {asset.symbol}
                      <Text style={styles.name}>  {asset.name}</Text>
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {asset.bestExchange || asset.bestExchangeKey || '-'} | {asset.marketSymbol}
                    </Text>
                  </View>

                  <View style={styles.right}>
                    <Text style={[styles.profit, { color: profitColor }]}>{formatPct(profit)}</Text>
                    <Text style={styles.coverage}>{asset.coverage}x</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: theme.space.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  meta: {
    color: theme.colors.muted2,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  errorCard: {
    marginTop: theme.space.md,
    borderColor: 'rgba(244,63,94,0.30)',
  },
  errorText: {
    color: '#FDA4AF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  tableCard: {
    marginTop: theme.space.md,
  },
  tableHeader: {
    padding: theme.space.lg,
    paddingBottom: theme.space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tableTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  tableMeta: {
    color: theme.colors.muted2,
    fontSize: 12,
    fontWeight: '700',
  },
  loadingRow: {
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  muted: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  rows: {
    paddingBottom: theme.space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  rowActive: {
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  rowPressed: {
    opacity: 0.9,
  },
  rank: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  rankText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  symbol: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  name: {
    color: theme.colors.muted2,
    fontSize: 12,
    fontWeight: '700',
  },
  sub: {
    marginTop: 3,
    color: theme.colors.muted2,
    fontSize: 11,
    fontWeight: '600',
  },
  right: {
    alignItems: 'flex-end',
  },
  profit: {
    fontSize: 12,
    fontWeight: '900',
  },
  coverage: {
    marginTop: 2,
    color: theme.colors.muted2,
    fontSize: 11,
    fontWeight: '700',
  },
});

