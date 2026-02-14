"use client"

import { useState } from "react"
import { Bug, LogIn, LogOut, Loader2 } from "lucide-react"
import Link from "next/link"

import { AccountConnectionsModal } from "@/components/account-connections-modal"
import { useAuth } from "@/components/auth-provider"

export function Navbar() {
  const { user, loading, loginWithGoogle, logout } = useAuth()
  const [pending, setPending] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [connectionsOpen, setConnectionsOpen] = useState(false)

  async function handleLogin() {
    setPending(true)
    setAuthError(null)
    try {
      await loginWithGoogle()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao autenticar com Google."
      setAuthError(message)
    } finally {
      setPending(false)
    }
  }

  async function handleLogout() {
    setPending(true)
    setAuthError(null)
    try {
      await logout()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sair."
      setAuthError(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <nav className="px-6 py-4 bg-card border-b border-border">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <Bug className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-foreground font-bold text-lg tracking-tight">
            Crypto<span className="text-primary">Bug</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <Link
              href="/history"
              className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background/60 text-foreground text-xs font-semibold hover:bg-secondary/60 transition-colors"
            >
              Historico
            </Link>
          ) : null}
          {user ? (
            <button
              type="button"
              onClick={() => setConnectionsOpen(true)}
              className="hidden md:flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-1.5 hover:bg-secondary/60 transition-colors"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName ?? "Avatar"} className="h-7 w-7 rounded-full" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-primary/20 border border-primary/25" />
              )}
              <div className="leading-tight">
                <div className="text-xs text-foreground font-semibold">{user.displayName ?? "Usuario"}</div>
                <div className="text-[11px] text-muted-foreground">{user.email}</div>
              </div>
            </button>
          ) : null}

          {user ? (
            <button
              type="button"
              onClick={() => setConnectionsOpen(true)}
              className="md:hidden rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-semibold text-foreground"
            >
              Conta
            </button>
          ) : null}

          {loading ? (
            <button
              disabled
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-primary/20 bg-primary/5 text-primary/70 text-sm font-medium tracking-wide uppercase"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando
            </button>
          ) : user ? (
            <button
              onClick={handleLogout}
              disabled={pending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors text-sm font-medium tracking-wide uppercase disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Sair
            </button>
          ) : (
            <button
              onClick={handleLogin}
              disabled={pending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium tracking-wide uppercase disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Login
            </button>
          )}
        </div>
      </div>

      {authError ? <p className="text-xs text-rose-300 mt-2">{authError}</p> : null}

      {user ? (
        <AccountConnectionsModal
          open={connectionsOpen}
          userName={user.displayName ?? "Usuario"}
          userEmail={user.email ?? "sem-email"}
          onClose={() => setConnectionsOpen(false)}
        />
      ) : null}
    </nav>
  )
}
