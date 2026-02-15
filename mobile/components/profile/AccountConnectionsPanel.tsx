import * as React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/theme';
import { DB_API_BASE_URL } from '@/lib/endpoints';
import {
  deleteConnection,
  getConnections,
  getEgressIp,
  upsertConnection,
  type ConnectionStatus,
  type ExchangeKey,
} from '@/lib/db-api';
import { useAuth } from '@/providers/auth-provider';

interface ExchangeConnection {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
}

type ConnectionsState = Record<ExchangeKey, ExchangeConnection>;
type LinkedState = Record<ExchangeKey, { linked: boolean; apiKeyHint: string; hasPassphrase: boolean }>;

const EXCHANGES: Array<{ key: ExchangeKey; label: string; needsPassphrase: boolean }> = [
  { key: 'binance', label: 'Binance', needsPassphrase: false },
  { key: 'kraken', label: 'Kraken', needsPassphrase: false },
  { key: 'okx', label: 'OKX', needsPassphrase: true },
  { key: 'bybit', label: 'Bybit', needsPassphrase: false },
];

function emptyConnections(): ConnectionsState {
  return {
    binance: { apiKey: '', apiSecret: '', passphrase: '' },
    kraken: { apiKey: '', apiSecret: '', passphrase: '' },
    okx: { apiKey: '', apiSecret: '', passphrase: '' },
    bybit: { apiKey: '', apiSecret: '', passphrase: '' },
  };
}

function emptyLinked(): LinkedState {
  return {
    binance: { linked: false, apiKeyHint: '', hasPassphrase: false },
    kraken: { linked: false, apiKeyHint: '', hasPassphrase: false },
    okx: { linked: false, apiKeyHint: '', hasPassphrase: false },
    bybit: { linked: false, apiKeyHint: '', hasPassphrase: false },
  };
}

function mapLinked(connections: ConnectionStatus[]): LinkedState {
  const next = emptyLinked();
  for (const item of connections ?? []) {
    next[item.exchange] = {
      linked: Boolean(item.linked),
      apiKeyHint: item.apiKeyHint ?? '',
      hasPassphrase: Boolean(item.hasPassphrase),
    };
  }
  return next;
}

export function AccountConnectionsPanel({ enabled = true }: { enabled?: boolean }) {
  const { user, getIdToken } = useAuth();

  const [connections, setConnections] = React.useState<ConnectionsState>(emptyConnections());
  const [linked, setLinked] = React.useState<LinkedState>(emptyLinked());
  const [savedMessage, setSavedMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [egressIp, setEgressIp] = React.useState<string | null>(null);
  const [egressLoading, setEgressLoading] = React.useState(false);
  const [egressError, setEgressError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!savedMessage) return;
    const timer = setTimeout(() => setSavedMessage(null), 2400);
    return () => clearTimeout(timer);
  }, [savedMessage]);

  const loadStatus = React.useCallback(async () => {
    if (!enabled) return;
    if (!user) return;

    setLoading(true);
    setError(null);
    setSavedMessage(null);
    setConnections(emptyConnections());

    try {
      if (!DB_API_BASE_URL) {
        throw new Error('DB API nao configurada (EXPO_PUBLIC_DB_API_BASE_URL).');
      }
      const token = await getIdToken();
      const status = await getConnections(token);
      setLinked(mapLinked(status));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [enabled, user?.uid, getIdToken]);

  React.useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  function updateField(exchange: ExchangeKey, field: keyof ExchangeConnection, value: string) {
    setConnections((prev) => ({
      ...prev,
      [exchange]: {
        ...prev[exchange],
        [field]: value,
      },
    }));
  }

  async function handleSave() {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      if (!DB_API_BASE_URL) {
        throw new Error('DB API nao configurada (EXPO_PUBLIC_DB_API_BASE_URL).');
      }
      const token = await getIdToken();

      for (const exchange of EXCHANGES) {
        const values = connections[exchange.key];
        const hasKey = values.apiKey.trim() !== '' && values.apiSecret.trim() !== '';
        if (!hasKey) continue;
        if (exchange.needsPassphrase && values.passphrase.trim() === '') {
          throw new Error(`Passphrase obrigatoria para ${exchange.label}`);
        }

        await upsertConnection(token, {
          exchange: exchange.key,
          apiKey: values.apiKey.trim(),
          apiSecret: values.apiSecret.trim(),
          passphrase: values.passphrase.trim() || undefined,
        });
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSavedMessage('Configuracoes salvas no servidor.');
      setConnections(emptyConnections());

      const status = await getConnections(token);
      setLinked(mapLinked(status));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  async function handleClear(exchange?: ExchangeKey) {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      if (!DB_API_BASE_URL) {
        throw new Error('DB API nao configurada (EXPO_PUBLIC_DB_API_BASE_URL).');
      }
      const token = await getIdToken();

      if (!exchange) {
        for (const ex of EXCHANGES) {
          await deleteConnection(token, ex.key);
        }
        setSavedMessage('Conexoes removidas do servidor.');
        setLinked(emptyLinked());
      } else {
        await deleteConnection(token, exchange);
        setSavedMessage('Conexao removida.');
        setLinked((prev) => ({ ...prev, [exchange]: { linked: false, apiKeyHint: '', hasPassphrase: false } }));
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConnections(emptyConnections());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  async function loadEgressIp() {
    if (!user) return;

    setEgressLoading(true);
    setEgressError(null);
    try {
      if (!DB_API_BASE_URL) throw new Error('DB API nao configurada (EXPO_PUBLIC_DB_API_BASE_URL).');
      const token = await getIdToken();
      const ip = await getEgressIp(token);
      setEgressIp(ip || null);
    } catch (e) {
      setEgressError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setEgressLoading(false);
    }
  }

  if (!user) {
    return (
      <GlassCard style={styles.card} intensity={18}>
        <View style={{ padding: theme.space.lg }}>
          <Text style={[styles.subText, { marginTop: 0 }]}>Faça login para vincular suas exchanges.</Text>
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
    <View style={{ gap: theme.space.md }}>
      <GlassCard style={styles.card} intensity={18}>
        <View style={{ padding: theme.space.lg, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Binance: IP whitelist</Text>
              <Text style={styles.subText}>
                Para operar (Trading habilitado), a Binance exige restringir por IP. Voce deve colocar o IP publico de saida do
                servico /DB. Em hosts como Railway, esse IP pode mudar em redeploy.
              </Text>
            </View>
            <Button
              label={egressLoading ? 'Carregando...' : 'Mostrar IP'}
              onPress={loadEgressIp}
              disabled={!enabled || egressLoading}
              variant="primary"
              style={{ paddingVertical: 10, paddingHorizontal: 12 }}
            />
          </View>

          {egressError ? <Text style={styles.error}>{egressError}</Text> : null}
          {egressIp ? (
            <View style={styles.monoBox}>
              <Text style={styles.mono}>{egressIp}</Text>
            </View>
          ) : null}
        </View>
      </GlassCard>

      <View style={{ gap: theme.space.md }}>
        {EXCHANGES.map((exchange) => {
          const values = connections[exchange.key];
          const isLinked = linked[exchange.key].linked;

          return (
            <GlassCard key={exchange.key} style={styles.card} intensity={18}>
              <View style={{ padding: theme.space.lg }}>
                <View style={styles.exchangeHeader}>
                  <Text style={styles.exchangeTitle}>{exchange.label}</Text>
                  <View style={[styles.badge, isLinked ? styles.badgeOk : styles.badgeOff]}>
                    <Text style={[styles.badgeText, isLinked ? styles.badgeTextOk : styles.badgeTextOff]}>
                      {isLinked ? 'Vinculada' : 'Nao vinculada'}
                    </Text>
                  </View>
                </View>

                {linked[exchange.key].apiKeyHint ? (
                  <Text style={styles.hint}>API Key: {linked[exchange.key].apiKeyHint}</Text>
                ) : (
                  <Text style={styles.subText}>Nenhuma chave salva.</Text>
                )}

                <View style={{ gap: 10, marginTop: 12 }}>
                  <TextInput
                    value={values.apiKey}
                    onChangeText={(text) => updateField(exchange.key, 'apiKey', text)}
                    placeholder="API Key"
                    placeholderTextColor={theme.colors.muted2}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                  <TextInput
                    value={values.apiSecret}
                    onChangeText={(text) => updateField(exchange.key, 'apiSecret', text)}
                    placeholder="API Secret"
                    placeholderTextColor={theme.colors.muted2}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    style={styles.input}
                  />
                  {exchange.needsPassphrase ? (
                    <TextInput
                      value={values.passphrase}
                      onChangeText={(text) => updateField(exchange.key, 'passphrase', text)}
                      placeholder="Passphrase"
                      placeholderTextColor={theme.colors.muted2}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                      style={styles.input}
                    />
                  ) : null}
                </View>

                <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                  {isLinked ? (
                    <Button
                      label="Remover"
                      onPress={() => handleClear(exchange.key)}
                      disabled={loading}
                      variant="danger"
                      style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                    />
                  ) : null}
                </View>
              </View>
            </GlassCard>
          );
        })}
      </View>

      <GlassCard style={styles.card} intensity={18}>
        <View style={{ padding: theme.space.lg, gap: 10 }}>
          <Text style={styles.subText}>
            As chaves sao criptografadas no servidor antes de salvar no Postgres.
            {error ? `\nErro: ${error}` : ''}
          </Text>

          <View style={styles.footerRow}>
            {savedMessage ? <Text style={styles.saved}>{savedMessage}</Text> : <View style={{ flex: 1 }} />}
            {loading ? <ActivityIndicator size="small" color={theme.colors.muted} /> : null}
            <Button
              label="Limpar"
              onPress={() => handleClear()}
              disabled={loading}
              variant="secondary"
              style={{ paddingVertical: 10, paddingHorizontal: 12 }}
            />
            <Button
              label={loading ? 'Salvando...' : 'Salvar'}
              onPress={handleSave}
              disabled={loading}
              variant="primary"
              style={{ paddingVertical: 10, paddingHorizontal: 12 }}
            />
          </View>

          <Pressable onPress={loadStatus} style={({ pressed }) => [styles.refreshBtn, pressed ? styles.pressed : null]}>
            <Text style={styles.refreshText}>Recarregar status</Text>
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
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  subText: {
    marginTop: 6,
    color: theme.colors.muted2,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  error: {
    marginTop: 8,
    color: '#FDA4AF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  monoBox: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  mono: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  exchangeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  exchangeTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  badge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  badgeOk: {
    borderColor: 'rgba(34,197,94,0.35)',
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  badgeOff: {
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  badgeTextOk: {
    color: theme.colors.primary,
  },
  badgeTextOff: {
    color: theme.colors.muted2,
  },
  hint: {
    marginTop: 10,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  input: {
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
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  saved: {
    flex: 1,
    color: 'rgba(34,197,94,0.95)',
    fontSize: 11,
    fontWeight: '800',
  },
  refreshBtn: {
    marginTop: 6,
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
