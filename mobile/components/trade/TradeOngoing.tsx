import * as React from 'react';
import { Alert, ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/theme';
import { DB_API_BASE_URL } from '@/lib/endpoints';
import { getTradeActions, placeTradeOrder, type ExchangeKey } from '@/lib/db-api';
import type { TradeActionItem } from '@/lib/types';
import { formatDateTimePt, labelModePt, labelOrderTypePt, labelSideShortPt, labelStatusPt } from '@/lib/pt';
import { useAuth } from '@/providers/auth-provider';

const ONGOING_STATUSES = new Set(['PENDING', 'DRY_RUN']);
const POSITION_STATUSES = new Set(['EXECUTED', 'DRY_RUN']);

interface OpenPositionItem {
  key: string;
  mode: 'REAL' | 'DRY_RUN';
  exchange: string;
  symbol: string;
  openAmount: number;
  lastUpdatedAt: string;
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value === 0) return '0';
  if (Math.abs(value) >= 1) return value.toFixed(6);
  return value.toFixed(8);
}

function formatWhen(value: string): string {
  return formatDateTimePt(value);
}

export function TradeOngoing() {
  const { user, getIdToken } = useAuth();

  const [actions, setActions] = React.useState<TradeActionItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [actionPending, setActionPending] = React.useState<string | null>(null);

  const loadActions = React.useCallback(async () => {
    if (!user) return;
    if (!DB_API_BASE_URL) return;

    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      const all = await getTradeActions(token, 200);
      setActions(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [user?.uid, getIdToken]);

  React.useEffect(() => {
    if (!user) return;
    if (!DB_API_BASE_URL) return;

    void loadActions();
    const timer = setInterval(loadActions, 10_000);
    return () => clearInterval(timer);
  }, [user?.uid, loadActions]);

  const pendingActions = React.useMemo(() => actions.filter((x) => ONGOING_STATUSES.has(x.status)), [actions]);

  const openPositions = React.useMemo<OpenPositionItem[]>(() => {
    const map = new Map<string, OpenPositionItem>();

    for (const item of actions) {
      if (!POSITION_STATUSES.has(item.status)) continue;

      const mode: OpenPositionItem['mode'] = item.status === 'DRY_RUN' ? 'DRY_RUN' : 'REAL';
      const key = `${mode}|${item.exchange}|${item.symbol}`;
      const signed = (item.side === 'BUY' ? 1 : -1) * toNumber(item.amount);

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          mode,
          exchange: item.exchange,
          symbol: item.symbol,
          openAmount: signed,
          lastUpdatedAt: item.updatedAt || item.createdAt,
        });
      } else {
        existing.openAmount += signed;
        const existingTs = new Date(existing.lastUpdatedAt).getTime();
        const nextTs = new Date(item.updatedAt || item.createdAt).getTime();
        if (Number.isFinite(nextTs) && nextTs > existingTs) {
          existing.lastUpdatedAt = item.updatedAt || item.createdAt;
        }
      }
    }

    return Array.from(map.values())
      .map((p) => ({ ...p, openAmount: Math.max(0, p.openAmount) }))
      .filter((p) => p.openAmount > 0)
      .sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());
  }, [actions]);

  const stopPosition = React.useCallback(
    async (position: OpenPositionItem) => {
      if (!user) return;
      if (!DB_API_BASE_URL) return;

      const ok = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Confirmar venda',
          `Vender (mercado) ${formatAmount(position.openAmount)} do par ${position.symbol} na ${position.exchange}?`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Confirmar', style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true }
        );
      });
      if (!ok) return;

      setActionPending(position.key);
      setError(null);

      try {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const token = await getIdToken();
        await placeTradeOrder(token, {
          exchange: position.exchange as ExchangeKey,
          symbol: position.symbol,
          side: 'SELL',
          orderType: 'market',
          amount: position.openAmount,
        });
        await loadActions();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro desconhecido');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setActionPending(null);
      }
    },
    [user?.uid, getIdToken, loadActions]
  );

  if (!user) {
    return (
      <GlassCard style={styles.card} intensity={18}>
        <View style={{ padding: theme.space.lg }}>
          <Text style={styles.muted}>Faça login para ver em andamento.</Text>
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
    <View style={{ gap: theme.space.md, marginTop: theme.space.md }}>
      <GlassCard style={styles.card} intensity={20}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Em andamento</Text>
            <Text style={styles.subTitle}>
              Posições abertas sao calculadas a partir das ultimas 200 acoes (EXECUTADA/SIMULACAO). Atualiza a cada 10s.
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {loading ? (
              <ActivityIndicator size="small" color={theme.colors.muted} />
            ) : (
              <Text style={styles.mono}>
                {openPositions.length} posicoes | {pendingActions.length} pendentes
              </Text>
            )}
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Posições abertas</Text>
          {openPositions.length === 0 && !loading ? (
            <Text style={styles.muted}>Nenhuma posição aberta.</Text>
          ) : (
            <View style={{ gap: 10, marginTop: 10 }}>
              {openPositions.map((pos) => (
                <View key={pos.key} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {pos.symbol} <Text style={styles.rowSub}>({pos.exchange})</Text>
                    </Text>
                    <Text style={styles.rowMeta}>
                      <Text
                        style={{
                          color: pos.mode === 'REAL' ? theme.colors.primary : theme.colors.warning,
                          fontWeight: '900',
                        }}
                      >
                        {labelModePt(pos.mode)}
                      </Text>{' '}
                      • atualizado {formatWhen(pos.lastUpdatedAt)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <Text style={styles.amount}>{formatAmount(pos.openAmount)}</Text>
                    <Button
                      label={actionPending === pos.key ? 'Enviando...' : 'Vender (Stop)'}
                      onPress={() => stopPosition(pos)}
                      disabled={actionPending === pos.key}
                      variant="danger"
                      style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ordens pendentes / SIMULACAO</Text>
          <Text style={styles.subTitle}>Aqui ficam suas acoes ainda nao finalizadas (PENDENTE/SIMULACAO).</Text>

          {pendingActions.length === 0 && !loading ? (
            <Text style={[styles.muted, { marginTop: 10 }]}>Nenhuma ordem pendente.</Text>
          ) : (
            <View style={{ gap: 10, marginTop: 10 }}>
              {pendingActions.map((item) => (
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
            </View>
          )}
        </View>

        <View style={{ padding: theme.space.lg, paddingTop: 0 }}>
          <Pressable onPress={loadActions} style={({ pressed }) => [styles.refreshBtn, pressed ? styles.pressed : null]}>
            <Text style={styles.refreshText}>Atualizar agora</Text>
          </Pressable>
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
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
  section: {
    paddingHorizontal: theme.space.lg,
    paddingBottom: theme.space.lg,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
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
  amount: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
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
