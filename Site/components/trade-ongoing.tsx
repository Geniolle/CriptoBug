"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { useAuth } from "@/components/auth-provider"
import { labelModePt, labelSidePt, labelStatusPt } from "@/lib/pt"

interface TradeActionItem {
  id: string
  exchange: string
  symbol: string
  side: string
  orderType: string
  amount: string
  status: string
  exchangeOrderId?: string | null
  createdAt: string
  updatedAt: string
  error?: string | null
}

const ONGOING_STATUSES = new Set(["PENDING", "DRY_RUN"])
const POSITION_STATUSES = new Set(["EXECUTED", "DRY_RUN"])

interface OpenPositionItem {
  key: string
  mode: "REAL" | "DRY_RUN"
  exchange: string
  symbol: string
  openAmount: number
  lastUpdatedAt: string
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "0"
  if (value === 0) return "0"
  if (Math.abs(value) >= 1) return value.toFixed(6)
  return value.toFixed(8)
}

export function TradeOngoing() {
  const { user, getIdToken } = useAuth()
  const [actions, setActions] = useState<TradeActionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState<string | null>(null)

  const baseUrl = useMemo(() => (process.env.NEXT_PUBLIC_DB_API_BASE_URL ?? "").replace(/\/+$/, ""), [])

  const loadActions = useCallback(async () => {
    if (!user) return
    if (!baseUrl) return

    setLoading(true)
    setError(null)
    try {
      const token = await getIdToken()
      const response = await fetch(`${baseUrl}/trade/actions?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      const payload = (await response.json()) as { actions?: TradeActionItem[]; error?: string }
      if (!response.ok) throw new Error(payload?.error || "Falha ao carregar em andamento")

      const all = Array.isArray(payload.actions) ? payload.actions : []
      setActions(all)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }, [user, baseUrl, getIdToken])

  useEffect(() => {
    if (!user) return
    if (!baseUrl) return

    void loadActions()
    const timer = window.setInterval(loadActions, 10_000)
    return () => {
      window.clearInterval(timer)
    }
  }, [user, baseUrl, loadActions])

  const pendingActions = useMemo(() => actions.filter((x) => ONGOING_STATUSES.has(x.status)), [actions])

  const openPositions = useMemo<OpenPositionItem[]>(() => {
    const map = new Map<string, OpenPositionItem>()

    for (const item of actions) {
      if (!POSITION_STATUSES.has(item.status)) continue

      const mode: OpenPositionItem["mode"] = item.status === "DRY_RUN" ? "DRY_RUN" : "REAL"
      const key = `${mode}|${item.exchange}|${item.symbol}`
      const signed = (item.side === "BUY" ? 1 : -1) * toNumber(item.amount)

      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          key,
          mode,
          exchange: item.exchange,
          symbol: item.symbol,
          openAmount: signed,
          lastUpdatedAt: item.updatedAt || item.createdAt,
        })
      } else {
        existing.openAmount += signed
        const existingTs = new Date(existing.lastUpdatedAt).getTime()
        const nextTs = new Date(item.updatedAt || item.createdAt).getTime()
        if (Number.isFinite(nextTs) && nextTs > existingTs) {
          existing.lastUpdatedAt = item.updatedAt || item.createdAt
        }
      }
    }

    const list = Array.from(map.values())
      .map((p) => ({ ...p, openAmount: Math.max(0, p.openAmount) }))
      .filter((p) => p.openAmount > 0)
      .sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime())

    return list
  }, [actions])

  const stopPosition = useCallback(
    async (position: OpenPositionItem) => {
      if (!user) return
      if (!baseUrl) return

      const ok = window.confirm(
        `Vender (ordem a mercado) ${formatAmount(position.openAmount)} do par ${position.symbol} na ${position.exchange}?`,
      )
      if (!ok) return

      setActionPending(position.key)
      setError(null)

      try {
        const token = await getIdToken()
        const response = await fetch(`${baseUrl}/trade/order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            exchange: position.exchange,
            symbol: position.symbol,
            side: "SELL",
            orderType: "market",
            amount: position.openAmount,
          }),
        })

        const payload = (await response.json().catch(() => null)) as { error?: string; status?: string } | null
        if (!response.ok) throw new Error(payload?.error || "Falha ao enviar venda (stop)")

        await loadActions()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro desconhecido")
      } finally {
        setActionPending(null)
      }
    },
    [user, baseUrl, getIdToken, loadActions],
  )

  if (!user) {
    return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Faça login para ver em andamento.</div>
  }

  if (!baseUrl) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-rose-200">
        DB API nao configurada (NEXT_PUBLIC_DB_API_BASE_URL).
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Em Andamento</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Posições abertas são calculadas a partir das últimas 200 ações (executadas e simuladas). Atualiza a cada 10s.
          </p>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {loading ? "Carregando..." : `${openPositions.length} posicoes | ${pendingActions.length} pendentes`}
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}

      <div className="mt-4 overflow-auto">
        <div className="text-sm font-semibold text-foreground">Posições abertas</div>
        <table className="w-full text-sm mt-2">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 text-left font-semibold">Atualizado</th>
              <th className="py-2 text-left font-semibold">Modo</th>
              <th className="py-2 text-left font-semibold">Exchange</th>
              <th className="py-2 text-left font-semibold">Par</th>
              <th className="py-2 text-left font-semibold">Qtd aberta</th>
              <th className="py-2 text-left font-semibold">Ação</th>
            </tr>
          </thead>
          <tbody>
            {openPositions.map((pos) => (
              <tr key={pos.key} className="border-b border-border/60">
                <td className="py-2 text-muted-foreground font-mono">{new Date(pos.lastUpdatedAt).toLocaleString("pt-BR")}</td>
                <td className={`py-2 font-semibold ${pos.mode === "REAL" ? "text-emerald-300" : "text-amber-200"}`}>{labelModePt(pos.mode)}</td>
                <td className="py-2 text-foreground">{pos.exchange}</td>
                <td className="py-2 text-foreground font-mono">{pos.symbol}</td>
                <td className="py-2 text-foreground font-mono">{formatAmount(pos.openAmount)}</td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => stopPosition(pos)}
                    disabled={actionPending === pos.key}
                    className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
                  >
                    {actionPending === pos.key ? "Enviando..." : "Vender (Stop)"}
                  </button>
                </td>
              </tr>
            ))}
            {openPositions.length === 0 && !loading ? (
              <tr>
                <td className="py-4 text-muted-foreground" colSpan={6}>
                  Nenhuma posição aberta.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-auto">
        <div className="text-sm font-semibold text-foreground">Ordens pendentes / simulacao</div>
        <p className="text-xs text-muted-foreground mt-1">Aqui ficam suas acoes ainda nao finalizadas (pendentes/simulacao).</p>

        <table className="w-full text-sm mt-2">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 text-left font-semibold">Data</th>
              <th className="py-2 text-left font-semibold">Exchange</th>
              <th className="py-2 text-left font-semibold">Par</th>
              <th className="py-2 text-left font-semibold">Acao</th>
              <th className="py-2 text-left font-semibold">Tipo</th>
              <th className="py-2 text-left font-semibold">Qtd</th>
              <th className="py-2 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {pendingActions.map((item) => (
              <tr key={item.id} className="border-b border-border/60">
                <td className="py-2 text-muted-foreground font-mono">{new Date(item.createdAt).toLocaleString("pt-BR")}</td>
                <td className="py-2 text-foreground">{item.exchange}</td>
                <td className="py-2 text-foreground font-mono">{item.symbol}</td>
                <td className={`py-2 font-semibold ${item.side === "BUY" ? "text-emerald-300" : "text-rose-300"}`}>{labelSidePt(item.side)}</td>
                <td className="py-2 text-muted-foreground">{item.orderType}</td>
                <td className="py-2 text-foreground font-mono">{item.amount}</td>
                <td className="py-2 text-muted-foreground">
                  {labelStatusPt(item.status)}
                  {item.exchangeOrderId ? ` (ordem: ${item.exchangeOrderId})` : ""}
                  {item.error ? ` (${item.error})` : ""}
                </td>
              </tr>
            ))}
            {pendingActions.length === 0 && !loading ? (
              <tr>
                <td className="py-4 text-muted-foreground" colSpan={7}>
                  Nenhuma ordem pendente.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
