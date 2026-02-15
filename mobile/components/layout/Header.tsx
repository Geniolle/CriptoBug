import * as React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { useRouter } from 'expo-router';

import { theme } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/providers/auth-provider';

export function Header({ title }: { title?: string }) {
  const router = useRouter();
  const { user, loading, loginWithGoogle } = useAuth();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleLogin() {
    setPending(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao autenticar com Google.');
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <FontAwesome6 name="bug" size={18} color="#07120b" />
          </View>
          <Text style={styles.brandText} numberOfLines={1}>
            Crypto<Text style={styles.brandAccent}>Bug</Text>
          </Text>
        </View>

        {title ? <Text style={styles.title}>{title}</Text> : null}

        <View style={styles.actions}>
          {loading ? (
            <Text style={styles.muted}>Carregando...</Text>
          ) : user ? (
            <Pressable
              onPress={() => router.push('/profile')}
              style={({ pressed }) => [styles.profileBtn, pressed ? styles.pressed : null]}
            >
              {user.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback} />
              )}
              <Text style={styles.profileText} numberOfLines={1}>
                {user.displayName ?? 'Usuario'}
              </Text>
            </Pressable>
          ) : (
            <Button
              label="Login"
              onPress={handleLogin}
              loading={pending}
              variant="primary"
              style={{ paddingVertical: 10, paddingHorizontal: 14 }}
            />
          )}
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  logo: {
    height: 36,
    width: 36,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  brandAccent: {
    color: theme.colors.primary,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  actions: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  muted: {
    color: theme.colors.muted2,
    fontSize: 12,
    fontWeight: '600',
  },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.18)',
    maxWidth: 220,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  avatar: {
    height: 26,
    width: 26,
    borderRadius: 13,
  },
  avatarFallback: {
    height: 26,
    width: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  profileText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  error: {
    marginTop: 10,
    color: '#FDA4AF',
    fontSize: 12,
    fontWeight: '600',
  },
});

