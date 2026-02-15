"use client"

import { useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"

import { useAuth } from "@/components/auth-provider"

export type ExchangeKey = "binance" | "kraken" | "okx" | "bybit"

interface ExchangeConnection {
  apiKey: string
  apiSecret: string
  passphrase: string
}

type ConnectionsState = Record<ExchangeKey, ExchangeConnection>
type LinkedState = Record<ExchangeKey, { linked: boolean; apiKeyHint: string; hasPassphrase: boolean }>

interface AccountConnectionsModalProps {
  open: boolean
  userName: string
  userEmail: string
  onClose: () => void
}

const EXCHANGES: Array<{ key: ExchangeKey; label: string; needsPassphrase: boolean }> = [
  { key: "binance", label: "Binance", needsPassphrase: false },
  { key: "kraken", label: "Kraken", needsPassphrase: false },
  { key: "okx", label: "OKX", needsPassphrase: true },
  { key: "bybit", label: "Bybit", needsPassphrase: false },
]

function emptyConnections(): ConnectionsState {
  return {
    binance: { apiKey: "", apiSecret: "", passphrase: "" },
    kraken: { apiKey: "", apiSecret: "", passphrase: "" },
    okx: { apiKey: "", apiSecret: "", passphrase: "" },
    bybit: { apiKey: "", apiSecret: "", passphrase: "" },
  }
}

function emptyLinked(): LinkedState {
  return {
    binance: { linked: false, apiKeyHint: "", hasPassphrase: false },
    kraken: { linked: false, apiKeyHint: "", hasPassphrase: false },
    okx: { linked: false, apiKeyHint: "", hasPassphrase: false },
    bybit: { linked: false, apiKeyHint: "", hasPassphrase: false },
  }
}

function useAccountConnections(options: { userEmail: string; enabled: boolean }) {
  const { getIdToken } = useAuth()
  const [connections, setConnections] = useState<ConnectionsState>(emptyConnections())
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linked, setLinked] = useState<LinkedState>(emptyLinked())

  const baseUrl = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_DB_API_BASE_URL ?? ""
    return raw.replace(/\/+$/, "")
  }, [])

  useEffect(() => {
    if (!options.enabled) return
    let cancelled = false

    async function loadStatus() {
      setLoading(true)
      setError(null)
      setSavedMessage(null)
      setConnections(emptyConnections())

      try {
        if (!baseUrl) {
          throw new Error("DB API nao configurada (NEXT_PUBLIC_DB_API_BASE_URL).")
        }
        const token = await getIdToken()
        const response = await fetch(`${baseUrl}/account/connections`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })

        const payload = (await response.json()) as {
          connections?: Array<{ exchange: ExchangeKey; linked: boolean; apiKeyHint?: string; hasPassphrase?: boolean }>
          error?: string
        }

        if (!response.ok) {
          throw new Error(payload?.error || "Falha ao carregar conexoes")
        }

        const next = emptyLinked()

        for (const item of payload.connections ?? []) {
          next[item.exchange] = {
            linked: Boolean(item.linked),
            apiKeyHint: item.apiKeyHint ?? "",
            hasPassphrase: Boolean(item.hasPassphrase),
          }
        }

        if (!cancelled) setLinked(next)
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Erro desconhecido")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadStatus()
    return () => {
      cancelled = true
    }
  }, [options.enabled, options.userEmail, getIdToken, baseUrl])

  useEffect(() => {
    if (!savedMessage) return
    const timer = setTimeout(() => setSavedMessage(null), 2400)
    return () => clearTimeout(timer)
  }, [savedMessage])

  function updateField(exchange: ExchangeKey, field: keyof ExchangeConnection, value: string) {
    setConnections((prev) => ({
      ...prev,
      [exchange]: {
        ...prev[exchange],
        [field]: value,
      },
    }))
  }

  async function handleSave() {
    setLoading(true)
    setError(null)

    try {
      if (!baseUrl) {
        throw new Error("DB API nao configurada (NEXT_PUBLIC_DB_API_BASE_URL).")
      }
      const token = await getIdToken()
      for (const exchange of EXCHANGES) {
        const values = connections[exchange.key]
        const hasKey = values.apiKey.trim() !== "" && values.apiSecret.trim() !== ""
        if (!hasKey) continue
        if (exchange.needsPassphrase && values.passphrase.trim() === "") {
          throw new Error(`Passphrase obrigatoria para ${exchange.label}`)
        }

        const response = await fetch(`${baseUrl}/account/connections`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            exchange: exchange.key,
            apiKey: values.apiKey.trim(),
            apiSecret: values.apiSecret.trim(),
            passphrase: values.passphrase.trim() || undefined,
          }),
        })

        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        if (!response.ok) {
          throw new Error(payload?.error || `Falha ao salvar ${exchange.label}`)
        }
      }

      setSavedMessage("Configuracoes salvas no servidor.")
      setConnections(emptyConnections())

      // reload linked status
      const response = await fetch(`${baseUrl}/account/connections`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      const payload = (await response.json()) as { connections?: Array<{ exchange: ExchangeKey; linked: boolean; apiKeyHint?: string; hasPassphrase?: boolean }> }
      const next = { ...linked }
      for (const item of payload.connections ?? []) {
        next[item.exchange] = {
          linked: Boolean(item.linked),
          apiKeyHint: item.apiKeyHint ?? "",
          hasPassphrase: Boolean(item.hasPassphrase),
        }
      }
      setLinked(next)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  async function handleClear(exchange?: ExchangeKey) {
    setLoading(true)
    setError(null)

    try {
      if (!baseUrl) {
        throw new Error("DB API nao configurada (NEXT_PUBLIC_DB_API_BASE_URL).")
      }
      const token = await getIdToken()
      if (!exchange) {
        for (const ex of EXCHANGES) {
          await fetch(`${baseUrl}/account/connections?exchange=${encodeURIComponent(ex.key)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          })
        }
        setSavedMessage("Conexoes removidas do servidor.")
        setLinked(emptyLinked())
      } else {
        const response = await fetch(`${baseUrl}/account/connections?exchange=${encodeURIComponent(exchange)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        })
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        if (!response.ok) throw new Error(payload?.error || "Falha ao remover conexao")

        setSavedMessage("Conexao removida.")
        setLinked((prev) => ({ ...prev, [exchange]: { linked: false, apiKeyHint: "", hasPassphrase: false } }))
      }

      setConnections(emptyConnections())
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  return {
    connections,
    linked,
    loading,
    error,
    savedMessage,
    updateField,
    handleSave,
    handleClear,
  }
}

export function AccountConnectionsPanel({ userEmail, enabled = true }: { userEmail: string; enabled?: boolean }) {
  const { getIdToken } = useAuth()
  const { connections, linked, loading, error, savedMessage, updateField, handleSave, handleClear } = useAccountConnections({
    userEmail,
    enabled,
  })

  const baseUrl = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_DB_API_BASE_URL ?? ""
    return raw.replace(/\/+$/, "")
  }, [])

  const [egressIp, setEgressIp] = useState<string | null>(null)
  const [egressLoading, setEgressLoading] = useState(false)
  const [egressError, setEgressError] = useState<string | null>(null)

  async function loadEgressIp() {
    setEgressLoading(true)
    setEgressError(null)
    try {
      if (!baseUrl) throw new Error("DB API nao configurada (NEXT_PUBLIC_DB_API_BASE_URL).")
      const token = await getIdToken()
      const response = await fetch(`${baseUrl}/account/egress-ip`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      const payload = (await response.json().catch(() => null)) as { ip?: string; error?: string } | null
      if (!response.ok) throw new Error(payload?.error || "Falha ao obter IP do servidor")
      setEgressIp(payload?.ip ? String(payload.ip) : null)
    } catch (e) {
      setEgressError(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setEgressLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-4 rounded-xl border border-border bg-background/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-foreground font-semibold">Binance: IP whitelist</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Para operar (Trading habilitado), a Binance exige restringir por IP. Voce deve colocar o IP publico de saida do servico <span className="font-semibold">/DB</span>.
              Em hosts como Railway, esse IP pode mudar em redeploy.
            </div>
          </div>
          <button
            type="button"
            onClick={loadEgressIp}
            disabled={!enabled || egressLoading || !baseUrl}
            className="shrink-0 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
          >
            {egressLoading ? "Carregando..." : "Mostrar IP"}
          </button>
        </div>

        {egressError ? <div className="mt-3 text-xs text-rose-200">{egressError}</div> : null}
        {egressIp ? (
          <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground">{egressIp}</div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {EXCHANGES.map((exchange) => {
          const values = connections[exchange.key]
          const isLinked = linked[exchange.key].linked

          return (
            <div key={exchange.key} className="rounded-xl border border-border bg-background/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-foreground">{exchange.label}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    isLinked ? "bg-emerald-500/20 text-emerald-300" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {isLinked ? "Vinculada" : "Nao vinculada"}
                </span>
              </div>

              {linked[exchange.key].apiKeyHint ? (
                <div className="mb-3 text-[11px] text-muted-foreground font-mono">API Key: {linked[exchange.key].apiKeyHint}</div>
              ) : (
                <div className="mb-3 text-[11px] text-muted-foreground">Nenhuma chave salva.</div>
              )}

              <div className="space-y-2.5">
                <input
                  value={values.apiKey}
                  onChange={(event) => updateField(exchange.key, "apiKey", event.target.value)}
                  placeholder="API Key"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                />
                <input
                  value={values.apiSecret}
                  onChange={(event) => updateField(exchange.key, "apiSecret", event.target.value)}
                  placeholder="API Secret"
                  type="password"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                />
                {exchange.needsPassphrase ? (
                  <input
                    value={values.passphrase}
                    onChange={(event) => updateField(exchange.key, "passphrase", event.target.value)}
                    placeholder="Passphrase"
                    type="password"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                  />
                ) : null}
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                {isLinked ? (
                  <button
                    onClick={() => handleClear(exchange.key)}
                    type="button"
                    disabled={loading}
                    className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="text-xs text-muted-foreground">
          <div>As chaves sao criptografadas no servidor antes de salvar no Postgres.</div>
          {error ? <div className="mt-1 text-rose-200">Erro: {error}</div> : null}
        </div>

        <div className="flex items-center gap-2">
          {savedMessage ? <span className="text-xs text-emerald-300">{savedMessage}</span> : null}
          <button
            onClick={() => handleClear()}
            type="button"
            disabled={loading}
            className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Limpar
          </button>
          <button
            onClick={handleSave}
            type="button"
            disabled={loading}
            className="rounded-lg border border-primary/40 bg-primary/20 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/30"
          >
            {loading ? "Salvando..." : "Salvar configuracoes"}
          </button>
        </div>
      </div>
    </div>
  )
}

export function AccountConnectionsModal({ open, userName, userEmail, onClose }: AccountConnectionsModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex w-full max-w-4xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-xl font-bold text-foreground">Configuracao da Conta</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {userName} ({userEmail})
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Vincule Binance, Kraken, OKX e Bybit para uso futuro no painel.
            </p>
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

        <div className="min-h-0 overflow-y-auto p-5">
          <AccountConnectionsPanel userEmail={userEmail} enabled={open} />
        </div>
      </div>
    </div>
  )
}
