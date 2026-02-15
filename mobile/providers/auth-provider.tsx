import * as React from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signOut, type User } from 'firebase/auth';

import { auth, isFirebaseConfigured } from '@/lib/firebase';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

const FALLBACK_CLIENT_ID = 'MISSING_GOOGLE_CLIENT_ID';

function isPlaceholderClientId(value: string | undefined): boolean {
  return !value || value === FALLBACK_CLIENT_ID;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(isFirebaseConfigured);

  const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? FALLBACK_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  const anyGoogleIdConfigured = !(
    isPlaceholderClientId(googleClientId) &&
    isPlaceholderClientId(iosClientId) &&
    isPlaceholderClientId(androidClientId) &&
    isPlaceholderClientId(webClientId)
  );

  const [, , promptAsync] = Google.useIdTokenAuthRequest({
    // `clientId` is used as a fallback; we set a placeholder so the hook doesn't crash
    // if env vars aren't configured yet. We'll block login in that case.
    clientId: googleClientId,
    iosClientId: iosClientId ?? googleClientId,
    androidClientId: androidClientId ?? googleClientId,
    webClientId: webClientId ?? googleClientId,
  });

  React.useEffect(() => {
    if (!auth || !isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      loginWithGoogle: async () => {
        if (!auth || !isFirebaseConfigured) {
          throw new Error('Firebase nao configurado. Preencha as variaveis EXPO_PUBLIC_FIREBASE_* no .env.');
        }

        if (!anyGoogleIdConfigured) {
          throw new Error('Google OAuth nao configurado. Preencha EXPO_PUBLIC_GOOGLE_* no .env.');
        }

        const result = await promptAsync();
        if (result.type !== 'success') {
          throw new Error('Login cancelado.');
        }

        const idToken = (result.params as { id_token?: string }).id_token;
        const accessToken = (result.params as { access_token?: string }).access_token;

        if (!idToken) {
          throw new Error('Google nao retornou id_token. Verifique EXPO_PUBLIC_GOOGLE_*.');
        }

        const credential = GoogleAuthProvider.credential(idToken, accessToken);
        await signInWithCredential(auth, credential);
      },
      logout: async () => {
        if (!auth || !isFirebaseConfigured) return;
        await signOut(auth);
      },
      getIdToken: async () => {
        if (!user) {
          throw new Error('Usuario nao autenticado');
        }
        return await user.getIdToken();
      },
    }),
    [anyGoogleIdConfigured, loading, promptAsync, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  }
  return context;
}

