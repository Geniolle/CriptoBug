import * as React from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { useRouter } from 'expo-router';

import type { DecisionPayload, RankedAsset } from '@/lib/types';
import { fetchDecision } from '@/lib/decision';
import { getConnections, placeTradeOrder, type ExchangeKey } from '@/lib/db-api';
import { DB_API_BASE_URL } from '@/lib/endpoints';
import { labelSidePt, labelSideShortPt } from '@/lib/pt';
import { useAuth } from '@/providers/auth-provider';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/theme';

export function AssetDetailsModal({
  asset,
  onClose,
}: {
  asset: RankedAsset | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { user, loginWithGoogle, getIdToken } = useAuth();

  const [decision, setDecision] = React.useState<DecisionPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [tradeAmount, setTradeAmount] = React.useState<string>('');
  const [tradePending, setTradePending] = React.useState(false);
  const [tradePendingSide, setTradePendingSide] = React.useState<'BUY' | 'SELL' | null>(null);
  const [tradeMessage, setTradeMessage] = React.useState<string | null>(null);
  const [linkedExchanges, setLinkedExchanges] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!asset) return;
    let cancelled = false;
    const target = asset;

    async function load() {
      setLoading(true);
      setError(null);
      setDecision(null);
      try {
        const payload = await fetchDecision({
          exchange: target.bestExchangeKey,
          symbol: target.symbol,
          quoteAsset: target.quoteAsset,
        });
        if (cancelled) return;
        setDecision(payload);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Erro desconhecido');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [asset?.id]);

  React.useEffect(() => {
    if (!asset) return;
    let cancelled = false;

    async function loadLinked() {
      try {
        if (!DB_API_BASE_URL) return;
        if (!user) return;
        const token = await getIdToken();
        const connections = await getConnections(token);
        const linked = connections.filter((c) => c.linked).map((c) => c.exchange);
        if (!cancelled) setLinkedExchanges(linked);
      } catch {
        // ignore
      }
    }

    void loadLinked();
    return () => {
      cancelled = true;
    };
  }, [asset?.id, user?.uid]);

  if (!asset) return null;
  const targetAsset = asset;

  const action = decision?.acao ?? 'HOLD';
  const actionColor = action === 'BUY' ? theme.colors.primary : action === 'SELL' ? '#FB7185' : theme.colors.warning;
  const recommendedSide = action === 'BUY' || action === 'SELL' ? action : null;

  const buyExchange = {
    key: (asset.buyExchangeKey || asset.bestExchangeKey) as ExchangeKey,
    label: asset.buyExchange || asset.bestExchange || asset.buyExchangeKey || asset.bestExchangeKey || 'Sem dados',
  };

  const sellExchange = {
    key: (asset.sellExchangeKey || asset.bestExchangeKey) as ExchangeKey,
    label: asset.sellExchange || asset.bestExchange || asset.sellExchangeKey || asset.bestExchangeKey || 'Sem dados',
  };

  const buyLinked = Boolean(buyExchange.key) && linkedExchanges.includes(buyExchange.key);
  const sellLinked = Boolean(sellExchange.key) && linkedExchanges.includes(sellExchange.key);

  function openApisAndClose() {
    try {
      router.push('/profile?tab=apis');
    } finally {
      onClose();
    }
  }

  async function submitTrade(side: 'BUY' | 'SELL') {
    setTradePending(true);
    setTradePendingSide(side);
    setTradeMessage(null);
    setError(null);

    try {
      if (!user) throw new Error('Faca login para operar e vincular suas APIs.');
      if (!DB_API_BASE_URL) throw new Error('DB API nao configurada (EXPO_PUBLIC_DB_API_BASE_URL).');

      const ex = side === 'BUY' ? buyExchange : sellExchange;
      if (!ex.key) throw new Error('Corretora recomendada indisponivel para este ativo.');
      if (!linkedExchanges.includes(ex.key)) {
        throw new Error(`Voce nao vinculou ${ex.label}. Abra Perfil > APIs e vincule para operar.`);
      }

      const amount = Number.parseFloat(tradeAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Quantidade invalida');

      const ok = await new Promise<boolean>((resolve) => {
        const title = side === 'BUY' ? 'Confirmar compra' : 'Confirmar venda';
        const sideLabel = side === 'BUY' ? 'compra' : 'venda';
        Alert.alert(
          title,
          `Enviar ordem de ${sideLabel} a mercado de ${amount} ${targetAsset.symbol} em ${ex.label}?`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Confirmar', style: 'default', onPress: () => resolve(true) },
          ],
          { cancelable: true }
        );
      });
      if (!ok) return;

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const token = await getIdToken();
      const symbol = `${targetAsset.symbol}/${targetAsset.quoteAsset}`;

      const payload = await placeTradeOrder(token, {
        exchange: ex.key,
        symbol,
        side,
        orderType: 'market',
        amount,
      });

      const status = payload?.status ?? 'OK';
      if (status === 'DRY_RUN') {
        setTradeMessage('SIMULACAO: ordem registrada apenas no historico (nao enviada a corretora).');
      } else if (status === 'EXECUTED') {
        const extra = payload?.exchangeOrderId ? ` | ordem: ${payload.exchangeOrderId}` : '';
        setTradeMessage(`EXECUTADA: ${payload?.id ?? '-'}${extra}`);
      } else {
        setTradeMessage(`Ordem registrada: ${status} (${payload?.id ?? '-'})`);
      }
      setTradeAmount('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setTradePending(false);
      setTradePendingSide(null);
    }
  }

  return (
    <Modal transparent animationType="fade" visible={Boolean(asset)} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <GlassCard style={styles.panel} intensity={28}>
          <View style={styles.panelHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hTitle} numberOfLines={1}>
                IA: {asset.name} ({asset.symbol})
              </Text>
              <Text style={styles.hSub} numberOfLines={1}>
                Corretora: {asset.bestExchange} | Par: {asset.marketSymbol}
              </Text>
            </View>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed ? styles.pressed : null]}>
              <FontAwesome6 name="xmark" size={16} color={theme.colors.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {loading ? <Text style={styles.muted}>Consultando IA...</Text> : null}

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {decision ? (
              <>
                <View style={styles.metrics}>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Acao</Text>
                    <Text style={[styles.metricValue, { color: actionColor }]}>{labelSidePt(decision.acao)}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Confianca</Text>
                    <Text style={styles.metricValue}>{decision.confianca}%</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Score</Text>
                    <Text style={styles.metricValue}>{decision.score.toFixed(3)}</Text>
                  </View>
                </View>

                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Resumo</Text>
                  <Text style={styles.blockText}>{decision.resumo}</Text>
                </View>

                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Motivos</Text>
                  <View style={{ marginTop: 8, gap: 6 }}>
                    {(decision.motivos ?? []).slice(0, 8).map((reason, idx) => (
                      <Text key={`${decision.symbol}-${idx}`} style={styles.bullet}>
                        • {reason}
                      </Text>
                    ))}
                  </View>
                </View>

                <View style={styles.tradeBox}>
                  <Text style={styles.blockTitle}>Acoes (COMPRAR/VENDER)</Text>
                  <Text style={styles.tradeHint}>
                    Isso registra e tenta executar a ordem via suas credenciais vinculadas. O servico /DB pode estar em SIMULACAO.
                  </Text>

                  <View style={styles.exchangeBox}>
                    <Text style={styles.smallLabel}>Corretora (auto)</Text>
                    <View style={styles.exchangeRow}>
                      <Text
                        style={[
                          styles.exchangeSide,
                          recommendedSide === 'BUY' ? { color: theme.colors.primary } : null,
                        ]}
                      >
                        {labelSideShortPt('BUY')}
                      </Text>
                      <Text style={styles.exchangeName} numberOfLines={1}>
                        {buyExchange.label}
                      </Text>
                      <Text style={[styles.exchangeLinked, { color: buyLinked ? theme.colors.primary : '#FDA4AF' }]}>
                        {buyLinked ? 'Vinculada' : 'Nao vinculada'}
                      </Text>
                    </View>
                    <View style={styles.exchangeRow}>
                      <Text style={[styles.exchangeSide, recommendedSide === 'SELL' ? { color: '#FB7185' } : null]}>
                        {labelSideShortPt('SELL')}
                      </Text>
                      <Text style={styles.exchangeName} numberOfLines={1}>
                        {sellExchange.label}
                      </Text>
                      <Text style={[styles.exchangeLinked, { color: sellLinked ? theme.colors.primary : '#FDA4AF' }]}>
                        {sellLinked ? 'Vinculada' : 'Nao vinculada'}
                      </Text>
                    </View>

                    {!user ? (
                      <View style={styles.warnBox}>
                        <Text style={styles.warnText}>Faca login para vincular APIs e operar.</Text>
                        <Button
                          label="Login com Google"
                          onPress={async () => {
                            try {
                              await loginWithGoogle();
                            } catch (e) {
                              setError(e instanceof Error ? e.message : 'Falha ao autenticar');
                            }
                          }}
                          variant="secondary"
                          style={{ marginTop: 10 }}
                        />
                      </View>
                    ) : linkedExchanges.length === 0 || (recommendedSide === 'BUY' && !buyLinked) || (recommendedSide === 'SELL' && !sellLinked) ? (
                      <View style={styles.warnBoxDanger}>
                        <Text style={styles.warnText}>
                          {linkedExchanges.length === 0
                            ? 'Nenhuma corretora vinculada. Vincule suas APIs para habilitar compra/venda.'
                            : recommendedSide === 'BUY'
                              ? `Compra recomendada na ${buyExchange.label}. Vincule para operar.`
                              : recommendedSide === 'SELL'
                                ? `Venda recomendada na ${sellExchange.label}. Vincule para operar.`
                                : 'Vincule a corretora recomendada para operar.'}
                        </Text>
                        <Button label="Abrir APIs" onPress={openApisAndClose} variant="danger" style={{ marginTop: 10 }} />
                      </View>
                    ) : null}
                  </View>

                  <View style={{ marginTop: 14 }}>
                    <Text style={styles.smallLabel}>Quantidade (base)</Text>
                    <TextInput
                      value={tradeAmount}
                      onChangeText={setTradeAmount}
                      placeholder={`Ex: 0.01 ${asset.symbol}`}
                      placeholderTextColor={theme.colors.muted2}
                      keyboardType="decimal-pad"
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.tradeRow}>
                    <Button
                      label="COMPRAR"
                      onPress={() => submitTrade('BUY')}
                      disabled={!user || !buyLinked}
                      loading={tradePending && tradePendingSide === 'BUY'}
                      variant="primary"
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="VENDER"
                      onPress={() => submitTrade('SELL')}
                      disabled={!user || !sellLinked}
                      loading={tradePending && tradePendingSide === 'SELL'}
                      variant="danger"
                      style={{ flex: 1 }}
                    />
                  </View>

                  {tradeMessage ? <Text style={styles.tradeMsg}>{tradeMessage}</Text> : null}
                </View>
              </>
            ) : null}
          </ScrollView>
        </GlassCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    padding: theme.space.lg,
    justifyContent: 'center',
  },
  panel: {
    maxHeight: '85%',
  },
  panelHeader: {
    padding: theme.space.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  hTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  hSub: {
    marginTop: 4,
    color: theme.colors.muted2,
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    height: 34,
    width: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  body: {
    padding: theme.space.lg,
    gap: 12,
  },
  muted: {
    color: theme.colors.muted2,
    fontSize: 12,
    fontWeight: '700',
  },
  errorBox: {
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.35)',
    backgroundColor: 'rgba(244,63,94,0.10)',
    borderRadius: theme.radius.md,
    padding: theme.space.md,
  },
  errorText: {
    color: '#FDA4AF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
  },
  metric: {
    flex: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  metricLabel: {
    color: theme.colors.muted2,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  metricValue: {
    marginTop: 6,
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  block: {
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  blockTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  blockText: {
    marginTop: 8,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  bullet: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  tradeBox: {
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  tradeHint: {
    marginTop: 6,
    color: theme.colors.muted2,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  exchangeBox: {
    marginTop: 12,
    padding: theme.space.md,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  smallLabel: {
    color: theme.colors.muted2,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  exchangeRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exchangeSide: {
    width: 64,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  exchangeName: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  exchangeLinked: {
    fontSize: 11,
    fontWeight: '800',
  },
  warnBox: {
    marginTop: 12,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    backgroundColor: 'rgba(251,191,36,0.10)',
  },
  warnBoxDanger: {
    marginTop: 12,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.35)',
    backgroundColor: 'rgba(244,63,94,0.10)',
  },
  warnText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  input: {
    marginTop: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  tradeRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  tradeMsg: {
    marginTop: 10,
    color: 'rgba(34,197,94,0.95)',
    fontSize: 11,
    fontWeight: '800',
  },
});
