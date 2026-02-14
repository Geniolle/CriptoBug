"use client"

import { useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"

type ExchangeKey = "binance" | "kraken" | "okx" | "bybit"

interface ExchangeConnection {
  apiKey: string
  apiSecret: string
  passphrase: string
}

type ConnectionsState = Record<ExchangeKey, ExchangeConnection>

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

export function AccountConnectionsModal({ open, userName, userEmail, onClose }: AccountConnectionsModalProps) {
  const [connections, setConnections] = useState<ConnectionsState>(emptyConnections())
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const storageKey = useMemo(() => `cryptobug.exchange.connections.${userEmail.toLowerCase()}`, [userEmail])

  useEffect(() => {
    if (!open) return

    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      setConnections(emptyConnections())
      return
    }

    try {
      const parsed = JSON.parse(raw) as Partial<ConnectionsState>
      setConnections({
        binance: { ...emptyConnections().binance, ...(parsed.binance ?? {}) },
        kraken: { ...emptyConnections().kraken, ...(parsed.kraken ?? {}) },
        okx: { ...emptyConnections().okx, ...(parsed.okx ?? {}) },
        bybit: { ...emptyConnections().bybit, ...(parsed.bybit ?? {}) },
      })
    } catch {
      setConnections(emptyConnections())
    }
  }, [open, storageKey])

  useEffect(() => {
    if (!savedMessage) return
    const timer = setTimeout(() => setSavedMessage(null), 2400)
    return () => clearTimeout(timer)
  }, [savedMessage])

  if (!open) return null

  function updateField(exchange: ExchangeKey, field: keyof ExchangeConnection, value: string) {
    setConnections((prev) => ({
      ...prev,
      [exchange]: {
        ...prev[exchange],
        [field]: value,
      },
    }))
  }

  function handleSave() {
    window.localStorage.setItem(storageKey, JSON.stringify(connections))
    setSavedMessage("Configuracoes salvas.")
  }

  function handleClear() {
    const cleared = emptyConnections()
    setConnections(cleared)
    window.localStorage.setItem(storageKey, JSON.stringify(cleared))
    setSavedMessage("Configuracoes limpas.")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-4xl rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
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

        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          {EXCHANGES.map((exchange) => {
            const values = connections[exchange.key]
            const isLinked = values.apiKey.trim() !== "" && values.apiSecret.trim() !== ""

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
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border p-5">
          <p className="text-xs text-muted-foreground">
            As chaves ficam salvas localmente no navegador deste dispositivo.
          </p>

          <div className="flex items-center gap-2">
            {savedMessage ? <span className="text-xs text-emerald-300">{savedMessage}</span> : null}
            <button
              onClick={handleClear}
              type="button"
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Limpar
            </button>
            <button
              onClick={handleSave}
              type="button"
              className="rounded-lg border border-primary/40 bg-primary/20 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/30"
            >
              Salvar configuracoes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
