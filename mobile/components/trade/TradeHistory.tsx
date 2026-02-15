import * as React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ui/GlassCard';
import { theme } from '@/constants/theme';
import { DB_API_BASE_URL } from '@/lib/endpoints';
import { getTradeActions } from '@/lib/db-api';
import type { TradeActionItem } from '@/lib/types';
import { formatDateTimePt, labelOrderTypePt, labelSideShortPt, labelStatusPt } from '@/lib/pt';
import { useAuth } from '@/providers/auth-provider';

function formatWhen(value: string): string {
  return formatDateTimePt(value);
}

export function TradeHistory() {
  const { user, getIdToken } = useAuth();
  const [items, setItems] = React.useState<TradeActionItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!user) return;
    if (!DB_API_BASE_URL) return;

    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      const list = await getTradeActions(token, 80);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [user?.uid, getIdToken]);

  React.useEffect(() => {
    if (!user) return;
    if (!DB_API_BASE_URL) return;

    void load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [user?.uid, load]);

  if (!user) {
    return (
      <GlassCard style={styles.card} intensity={18}>
        <View style={{ padding: theme.space.lg }}>
          <Text style={styles.muted}>Faça login para ver o historico.</Text>
        </View>
      </GlassCard>
    );
  }

  if (!DB_API_BASE_URL) {
    return (
      <GlassCard style={[styles.card, { borderColor: 'rgba(244,63,94,0.30)' }]} intensity={18}>
        <View style={{ padding: theme.space.lg }}>
          <Text style={styles.error}>DB API nao configurada (EXPO_PUBLIC_DB_API_BASE_URL).</Text>
        </View>
      </GlassCard>
    );
  }

  return (
    <GlassCard style={styles.card} intensity={20}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Historico de Acoes</Text>
          <Text style={styles.subTitle}>Atualiza automaticamente a cada 15s.</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {loading ? (
            <ActivityIndicator size="small" color={theme.colors.muted} />
          ) : (
            <Text style={styles.mono}>{items.length} registros</Text>
          )}
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: theme.space.lg, paddingBottom: theme.space.lg, gap: 10 }}>
        {items.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.symbol} <Text style={styles.rowSub}>({item.exchange})</Text>
              </Text>
              <Text style={styles.rowMeta}>
                {formatWhen(item.createdAt)} •{' '}
                <Text style={{ color: item.side === 'BUY' ? theme.colors.primary : '#FB7185', fontWeight: '900' }}>
                  {labelSideShortPt(item.side)}
                </Text>{' '}
                • {labelOrderTypePt(item.orderType)} • qtd {item.amount}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={2}>
                {labelStatusPt(item.status)}
                {item.exchangeOrderId ? ` (ordem: ${item.exchangeOrderId})` : ''}
                {item.error ? ` (${item.error})` : ''}
              </Text>
            </View>
          </View>
        ))}

        {items.length === 0 && !loading ? <Text style={styles.muted}>Nenhuma acao registrada ainda.</Text> : null}
      </View>

      <View style={{ padding: theme.space.lg, paddingTop: 0 }}>
        <Pressable onPress={load} style={({ pressed }) => [styles.refreshBtn, pressed ? styles.pressed : null]}>
          <Text style={styles.refreshText}>Atualizar agora</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    marginTop: theme.space.md,
  },
  header: {
    padding: theme.space.lg,
    paddingBottom: theme.space.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  subTitle: {
    marginTop: 6,
    color: theme.colors.muted2,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  mono: {
    color: theme.colors.muted2,
    fontSize: 11,
    fontWeight: '800',
  },
  errorBox: {
    marginHorizontal: theme.space.lg,
    marginBottom: theme.space.sm,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.35)',
    backgroundColor: 'rgba(244,63,94,0.10)',
    borderRadius: theme.radius.md,
    padding: theme.space.md,
  },
  error: {
    color: '#FDA4AF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  muted: {
    color: theme.colors.muted2,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  row: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.20)',
    padding: theme.space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  rowSub: {
    color: theme.colors.muted2,
    fontWeight: '800',
    fontSize: 12,
  },
  rowMeta: {
    marginTop: 6,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  refreshBtn: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  refreshText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});
