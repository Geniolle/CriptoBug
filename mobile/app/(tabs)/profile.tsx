import * as React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { Header } from '@/components/layout/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { AccountConnectionsPanel } from '@/components/profile/AccountConnectionsPanel';
import { theme } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';

type ProfileTab = 'perfil' | 'apis';

export default function ProfileScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const { user, loading, loginWithGoogle, logout } = useAuth();

  const [tab, setTab] = React.useState<ProfileTab>('perfil');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (params?.tab === 'apis') {
      setTab('apis');
    } else if (params?.tab === 'perfil') {
      setTab('perfil');
    }
  }, [params?.tab]);

  async function handleLogout() {
    setPending(true);
    setError(null);
    try {
      await logout();
      setTab('perfil');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao sair.');
    } finally {
      setPending(false);
    }
  }

  async function handleLogin() {
    setPending(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao autenticar.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <Header title="Perfil" />

      <GlassCard style={styles.card} intensity={18}>
        <View style={{ padding: theme.space.lg, gap: 12 }}>
          <View style={styles.userRow}>
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.displayName ?? (user ? 'Usuario' : 'Sem login')}
              </Text>
              <Text style={styles.userEmail} numberOfLines={1}>
                {user?.email ?? 'Faça login para continuar.'}
              </Text>
            </View>
          </View>

          <View style={styles.segment}>
            <Pressable
              onPress={() => setTab('perfil')}
              style={({ pressed }) => [
                styles.segBtn,
                tab === 'perfil' ? styles.segBtnActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={[styles.segText, tab === 'perfil' ? styles.segTextActive : null]}>Perfil</Text>
            </Pressable>
            <Pressable
              onPress={() => setTab('apis')}
              style={({ pressed }) => [
                styles.segBtn,
                tab === 'apis' ? styles.segBtnActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={[styles.segText, tab === 'apis' ? styles.segTextActive : null]}>APIs</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {!user ? (
            <Button
              label={loading || pending ? 'Carregando...' : 'Login com Google'}
              onPress={handleLogin}
              disabled={loading || pending}
              loading={pending}
              variant="primary"
            />
          ) : tab === 'perfil' ? (
            <>
              <Text style={styles.subText}>
                Conecte suas exchanges na aba <Text style={{ fontWeight: '900', color: theme.colors.text }}>APIs</Text> para
                habilitar BUY/SELL e historico.
              </Text>
              <Button
                label={pending ? 'Saindo...' : 'Logout'}
                onPress={handleLogout}
                disabled={pending}
                loading={pending}
                variant="danger"
              />
            </>
          ) : (
            <AccountConnectionsPanel enabled={tab === 'apis'} />
          )}
        </View>
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: theme.space.md,
    borderRadius: theme.radius.lg,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    height: 44,
    width: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  userName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  userEmail: {
    marginTop: 4,
    color: theme.colors.muted2,
    fontSize: 12,
    fontWeight: '700',
  },
  segment: {
    flexDirection: 'row',
    gap: 10,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  segBtnActive: {
    borderColor: 'rgba(34,197,94,0.42)',
    backgroundColor: 'rgba(34,197,94,0.14)',
  },
  segText: {
    color: theme.colors.muted2,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  segTextActive: {
    color: theme.colors.primary,
  },
  subText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  error: {
    color: '#FDA4AF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});

