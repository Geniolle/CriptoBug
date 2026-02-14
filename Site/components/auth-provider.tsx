"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth"

import { auth, googleProvider, isFirebaseConfigured } from "@/lib/firebase"

interface AuthContextValue {
  user: User | null
  loading: boolean
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isFirebaseConfigured)

  useEffect(() => {
    if (!auth || !isFirebaseConfigured) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      loginWithGoogle: async () => {
        if (!auth || !isFirebaseConfigured) {
          throw new Error("Firebase nao configurado. Preencha as variaveis NEXT_PUBLIC_FIREBASE_* no .env.")
        }
        await signInWithPopup(auth, googleProvider)
      },
      logout: async () => {
        if (!auth || !isFirebaseConfigured) return
        await signOut(auth)
      },
    }),
    [loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de <AuthProvider>")
  }
  return context
}
