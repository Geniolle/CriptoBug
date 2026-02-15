"use client"

import { useEffect, useMemo, useState } from "react"

import { useAuth } from "@/components/auth-provider"
import { labelSidePt, labelStatusPt } from "@/lib/pt"

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

export function TradeHistory() {
  const { user, getIdToken } = useAuth()
  const [items, setItems] = useState<TradeActionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const baseUrl = useMemo(() => (process.env.NEXT_PUBLIC_DB_API_BASE_URL ?? "").replace(/\/+$/, ""), [])

  useEffect(() => {
    if (!user) return
    if (!baseUrl) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const token = await getIdToken()
        const response = await fetch(`${baseUrl}/trade/actions?limit=80`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        const payload = (await response.json()) as { actions?: TradeActionItem[]; error?: string }
        if (!response.ok) throw new Error(payload?.error || "Falha ao carregar historico")
        if (!cancelled) setItems(Array.isArray(payload.actions) ? payload.actions : [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro desconhecido")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const timer = window.setInterval(load, 15_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [user, getIdToken, baseUrl])

  if (!user) {
    return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Faça login para ver o historico.</div>
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
          <h2 className="text-xl font-bold text-foreground">Historico de Acoes</h2>
          <p className="text-xs text-muted-foreground mt-1">Atualiza automaticamente a cada 15s.</p>
        </div>
        <div className="text-xs text-muted-foreground font-mono">{loading ? "Carregando..." : `${items.length} registros`}</div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}

      <div className="mt-4 overflow-auto">
        <table className="w-full text-sm">
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
            {items.map((item) => (
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
            {items.length === 0 && !loading ? (
              <tr>
                <td className="py-4 text-muted-foreground" colSpan={7}>
                  Nenhuma acao registrada ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
