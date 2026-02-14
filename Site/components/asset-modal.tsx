"use client"

import { useEffect, useRef, useState } from "react"
import { gsap } from "gsap"

import type { DecisionPayload, RankedAsset } from "@/lib/types"
import { useAuth } from "@/components/auth-provider"

interface AssetModalProps {
  asset: RankedAsset | null
  onClose: () => void
}

export function AssetModal({ asset, onClose }: AssetModalProps) {
  const { getIdToken } = useAuth()
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [decision, setDecision] = useState<DecisionPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tradeAmount, setTradeAmount] = useState<string>("")
  const [tradeExchange, setTradeExchange] = useState<string>("")
  const [tradePending, setTradePending] = useState(false)
  const [tradeMessage, setTradeMessage] = useState<string | null>(null)
  const [linkedExchanges, setLinkedExchanges] = useState<string[]>([])

  const baseUrl = (process.env.NEXT_PUBLIC_DB_API_BASE_URL ?? "").replace(/\/+$/, "")

  useEffect(() => {
    if (!asset) return
    const targetAsset = asset

    const controller = new AbortController()

    async function loadDecision() {
      setLoading(true)
      setError(null)
      setDecision(null)

      try {
        const response = await fetch(
          `/api/decision?exchange=${encodeURIComponent(targetAsset.bestExchangeKey)}&symbol=${encodeURIComponent(targetAsset.symbol)}&quote_asset=${encodeURIComponent(targetAsset.quoteAsset)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        )

        const payload = await response.json().catch(() => null)

        if (!response.ok) {
          const detail = payload?.detail ? JSON.stringify(payload.detail) : payload?.error ?? "Erro ao consultar IA"
          throw new Error(detail)
        }

        setDecision(payload as DecisionPayload)
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") return
        setError(fetchError instanceof Error ? fetchError.message : "Erro desconhecido")
      } finally {
        setLoading(false)
      }
    }

    loadDecision()

    return () => controller.abort()
  }, [asset])

  useEffect(() => {
    if (!asset) return
    const targetAsset = asset
    let cancelled = false

    async function loadLinked() {
      try {
        if (!baseUrl) return
        const token = await getIdToken()
        const response = await fetch(`${baseUrl}/account/connections`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        const payload = (await response.json()) as { connections?: Array<{ exchange: string; linked: boolean }>; error?: string }
        if (!response.ok) return

        const linked = (payload.connections ?? []).filter((c) => c.linked).map((c) => c.exchange)
        if (cancelled) return

        setLinkedExchanges(linked)
        const preferred = [targetAsset.bestExchangeKey, targetAsset.buyExchangeKey, targetAsset.sellExchangeKey].find((x) => x && linked.includes(x))
        setTradeExchange(preferred || linked[0] || "")
      } catch {
        // ignore
      }
    }

    void loadLinked()
    return () => {
      cancelled = true
    }
  }, [asset, getIdToken, baseUrl])

  useEffect(() => {
    if (!asset) return

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleEsc)
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", handleEsc)
      document.body.style.overflow = ""
    }
  }, [asset, onClose])

  useEffect(() => {
    if (!asset || !panelRef.current) return
    gsap.fromTo(panelRef.current, { opacity: 0, y: 16, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "power2.out" })
  }, [asset])

  if (!asset) return null

  const action = decision?.acao ?? "HOLD"
  const actionColor = action === "BUY" ? "text-emerald-400" : action === "SELL" ? "text-rose-400" : "text-amber-300"
  const recommendedSide = action === "BUY" || action === "SELL" ? action : null

  async function submitTrade(side: "BUY" | "SELL") {
    setTradePending(true)
    setTradeMessage(null)
    setError(null)

    try {
      if (!asset) throw new Error("Ativo nao selecionado")
      if (!baseUrl) throw new Error("DB API nao configurada (NEXT_PUBLIC_DB_API_BASE_URL).")
      if (!tradeExchange) throw new Error("Selecione uma exchange vinculada")
      const amount = Number.parseFloat(tradeAmount)
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Quantidade invalida")

      const token = await getIdToken()
      const symbol = `${asset.symbol}/${asset.quoteAsset}`

      const response = await fetch(`${baseUrl}/trade/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exchange: tradeExchange,
          symbol,
          side,
          orderType: "market",
          amount,
        }),
      })

      const payload = (await response.json().catch(() => null)) as { ok?: boolean; id?: string; status?: string; error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || "Falha ao enviar ordem")
      }

      setTradeMessage(`Ordem registrada: ${payload?.status ?? "OK"} (${payload?.id ?? "-"})`)
      setTradeAmount("")
    } catch (tradeError) {
      setError(tradeError instanceof Error ? tradeError.message : "Erro desconhecido")
    } finally {
      setTradePending(false)
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
      <div ref={panelRef} className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-foreground font-bold text-xl">IA - {asset.name} ({asset.symbol})</h2>
            <p className="text-muted-foreground text-xs mt-1">Corretora analisada: {asset.bestExchange} | Par: {asset.marketSymbol}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Fechar"
          >
            X
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? <p className="text-muted-foreground text-sm">Consultando IA para decisao de compra/venda...</p> : null}

          {error ? (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
              Erro: {error}
            </div>
          ) : null}

          {decision ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl bg-secondary/50 p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Acao</div>
                  <div className={`text-xl font-bold mt-1 ${actionColor}`}>{decision.acao}</div>
                </div>
                <div className="rounded-xl bg-secondary/50 p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Confianca</div>
                  <div className="text-xl font-bold mt-1 text-foreground">{decision.confianca}%</div>
                </div>
                <div className="rounded-xl bg-secondary/50 p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Score</div>
                  <div className="text-xl font-bold mt-1 text-foreground">{decision.score.toFixed(3)}</div>
                </div>
              </div>

              <div className="rounded-xl bg-secondary/30 p-4">
                <h3 className="text-foreground font-semibold mb-2">Resumo da IA</h3>
                <p className="text-sm text-secondary-foreground leading-relaxed">{decision.resumo}</p>
              </div>

              <div className="rounded-xl bg-secondary/30 p-4">
                <h3 className="text-foreground font-semibold mb-2">Motivos</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-secondary-foreground">
                  {decision.motivos?.map((reason, idx) => (
                    <li key={`${decision.symbol}-${idx}`}>{reason}</li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-muted-foreground">Resultado informativo. Sempre valide risco e custos antes de operar.</p>

              <div className="rounded-xl border border-border bg-secondary/20 p-4">
                <h3 className="text-foreground font-semibold mb-2">Acoes (BUY/SELL)</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Isso registra e tenta executar a ordem via suas credenciais vinculadas. Por seguranca, o servico /DB pode estar em modo DRY_RUN.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="md:col-span-1">
                    <div className="text-[11px] text-muted-foreground mb-1">Exchange</div>
                    <select
                      value={tradeExchange}
                      onChange={(e) => setTradeExchange(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                    >
                      <option value="">Selecione...</option>
                      {linkedExchanges.map((ex) => (
                        <option key={ex} value={ex}>
                          {ex}
                        </option>
                      ))}
                    </select>
                    {linkedExchanges.length === 0 ? (
                      <div className="mt-1 text-[11px] text-rose-200">Nenhuma exchange vinculada. Abra Conta e vincule.</div>
                    ) : null}
                  </div>

                  <div className="md:col-span-1">
                    <div className="text-[11px] text-muted-foreground mb-1">Quantidade (base)</div>
                    <input
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      placeholder={`Ex: 0.01 ${asset.symbol}`}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                    />
                  </div>

                  <div className="md:col-span-1 flex items-end gap-2">
                    <button
                      disabled={tradePending || linkedExchanges.length === 0}
                      onClick={() => submitTrade("BUY")}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold border ${
                        recommendedSide === "BUY" ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200" : "border-border bg-secondary/40 text-foreground"
                      } disabled:opacity-60`}
                      type="button"
                    >
                      BUY
                    </button>
                    <button
                      disabled={tradePending || linkedExchanges.length === 0}
                      onClick={() => submitTrade("SELL")}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold border ${
                        recommendedSide === "SELL" ? "border-rose-400/60 bg-rose-500/20 text-rose-200" : "border-border bg-secondary/40 text-foreground"
                      } disabled:opacity-60`}
                      type="button"
                    >
                      SELL
                    </button>
                  </div>
                </div>

                {tradeMessage ? <div className="mt-3 text-xs text-emerald-200 font-mono">{tradeMessage}</div> : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
