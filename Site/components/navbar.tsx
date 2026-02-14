"use client"

import { useState } from "react"
import { Bug, LogIn, Loader2 } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { ProfileModal } from "@/components/profile-modal"
import { useAuth } from "@/components/auth-provider"

export function Navbar() {
  const { user, loading, loginWithGoogle } = useAuth()
  const [pending, setPending] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const pathname = usePathname()

  const navItems = [
    { href: "/", label: "Analistica" },
    { href: "/ongoing", label: "Em andamento" },
    { href: "/history", label: "Historico" },
  ] as const

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

  return (
    <nav className="px-6 py-4 bg-card border-b border-border">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Bug className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-foreground font-bold text-lg tracking-tight">
              Crypto<span className="text-primary">Bug</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2">
            {navItems.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                    active
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border bg-background/50 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>

          {user ? (
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
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
        </div>

        <div className="flex items-center gap-3">

          {user ? (
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="md:hidden rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-semibold text-foreground"
            >
              Perfil
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
          ) : !user ? (
            <button
              onClick={handleLogin}
              disabled={pending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium tracking-wide uppercase disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Login
            </button>
          ) : null}
        </div>
      </div>

      {authError ? <p className="text-xs text-rose-300 mt-2">{authError}</p> : null}

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </nav>
  )
}
