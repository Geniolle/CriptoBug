"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { X } from "lucide-react"

import { AccountConnectionsPanel } from "@/components/account-connections-modal"
import { useAuth } from "@/components/auth-provider"

type ProfileTab = "perfil" | "apis"

interface ProfileModalProps {
  open: boolean
  initialTab?: ProfileTab
  onClose: () => void
}

export function ProfileModal({ open, initialTab, onClose }: ProfileModalProps) {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState<ProfileTab>("perfil")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const overlayRef = useRef<HTMLDivElement>(null)

  const displayName = useMemo(() => user?.displayName ?? "Usuario", [user])
  const email = useMemo(() => user?.email ?? "sem-email", [user])

  useEffect(() => {
    if (!open) return
    setTab(initialTab ?? "perfil")
    setError(null)
    setPending(false)
  }, [open, initialTab])

  useEffect(() => {
    if (!open) return

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleEsc)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleEsc)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  if (!open || !user) return null

  async function handleLogout() {
    setPending(true)
    setError(null)
    try {
      await logout()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao sair.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(event) => {
        if (event.target === overlayRef.current) onClose()
      }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-border p-5">
            <div className="flex items-center gap-3 min-w-0">
              {user.photoURL ? (
                <img src={user.photoURL} alt={displayName} className="h-10 w-10 rounded-full" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-primary/20 border border-primary/25" />
              )}
              <div className="min-w-0">
                <div className="text-foreground font-bold text-lg truncate">{displayName}</div>
                <div className="text-muted-foreground text-xs truncate">{email}</div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="h-9 w-9 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              aria-label="Fechar"
              type="button"
            >
              <X className="mx-auto h-4 w-4" />
            </button>
          </div>

          <div className="p-5 overflow-auto">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTab("perfil")}
                className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                  tab === "perfil"
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border bg-background/50 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                Perfil
              </button>
              <button
                type="button"
                onClick={() => setTab("apis")}
                className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                  tab === "apis"
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border bg-background/50 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                APIs
              </button>
            </div>

            {tab === "perfil" ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-border bg-background/30 p-4">
                  <div className="text-xs text-muted-foreground">Conta</div>
                  <div className="mt-1 text-sm text-foreground">
                    Conecte suas exchanges na aba <span className="font-semibold">APIs</span> para habilitar BUY/SELL e historico.
                  </div>
                </div>

                {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}

                <button
                  onClick={handleLogout}
                  disabled={pending}
                  className="w-full rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 transition-colors disabled:opacity-60"
                  type="button"
                >
                  {pending ? "Saindo..." : "Logout"}
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <div className="rounded-xl border border-border bg-background/30 p-4">
                  <div className="text-sm text-foreground font-semibold">APIs</div>
                  <div className="mt-1 text-xs text-muted-foreground">Vincule suas exchanges para habilitar BUY/SELL e historico.</div>
                </div>

                <AccountConnectionsPanel userEmail={email} enabled={open && tab === "apis"} />
              </div>
            )}
          </div>
        </div>
    </div>
  )
}
