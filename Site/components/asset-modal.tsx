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
  const { user, loginWithGoogle, getIdToken } = useAuth()
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [decision, setDecision] = useState<DecisionPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tradeAmount, setTradeAmount] = useState<string>("")
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

  const buyExchange = {
    key: asset.buyExchangeKey || asset.bestExchangeKey,
    label: asset.buyExchange || asset.bestExchange || asset.buyExchangeKey || asset.bestExchangeKey || "Sem dados",
  }

  const sellExchange = {
    key: asset.sellExchangeKey || asset.bestExchangeKey,
    label: asset.sellExchange || asset.bestExchange || asset.sellExchangeKey || asset.bestExchangeKey || "Sem dados",
  }

  const buyLinked = Boolean(buyExchange.key) && linkedExchanges.includes(buyExchange.key)
  const sellLinked = Boolean(sellExchange.key) && linkedExchanges.includes(sellExchange.key)

  function openApisAndClose() {
    try {
      window.dispatchEvent(new CustomEvent("cryptobug:open-profile", { detail: { tab: "apis" } }))
    } finally {
      onClose()
    }
  }

  async function submitTrade(side: "BUY" | "SELL") {
    setTradePending(true)
    setTradeMessage(null)
    setError(null)

    try {
      if (!asset) throw new Error("Ativo nao selecionado")
      if (!user) throw new Error("Faca login para operar e vincular suas APIs.")
      if (!baseUrl) throw new Error("DB API nao configurada (NEXT_PUBLIC_DB_API_BASE_URL).")
      const ex = side === "BUY" ? buyExchange : sellExchange
      if (!ex.key) throw new Error("Exchange recomendada indisponivel para este ativo.")
      if (!linkedExchanges.includes(ex.key)) {
        throw new Error(`Voce nao vinculou ${ex.label}. Abra Perfil > APIs e vincule para operar.`)
      }
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
          exchange: ex.key,
          symbol,
          side,
          orderType: "market",
          amount,
        }),
      })

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean
        id?: string
        status?: string
        exchangeOrderId?: string | null
        error?: string
      } | null
      if (!response.ok) {
        throw new Error(payload?.error || "Falha ao enviar ordem")
      }

      const status = payload?.status ?? "OK"
      if (status === "DRY_RUN") {
        setTradeMessage("DRY_RUN: ordem registrada apenas no historico (nao enviada a exchange). Configure TRADING_DRY_RUN=false no servico /DB e reinicie.")
      } else if (status === "EXECUTED") {
        const extra = payload?.exchangeOrderId ? ` | order: ${payload.exchangeOrderId}` : ""
        setTradeMessage(`EXECUTED: ${payload?.id ?? "-"}${extra}`)
      } else {
        setTradeMessage(`Ordem registrada: ${status} (${payload?.id ?? "-"})`)
      }
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
                    <div className="text-[11px] text-muted-foreground mb-1">Exchange (auto)</div>
                    <div className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <div className={`flex items-center justify-between gap-2 ${recommendedSide === "BUY" ? "text-emerald-200" : "text-foreground"}`}>
                        <span className="font-semibold">BUY</span>
                        <span className="truncate">{buyExchange.label}</span>
                        <span className={`text-[11px] ${buyLinked ? "text-emerald-300" : "text-rose-200"}`}>{buyLinked ? "Vinculada" : "Nao vinculada"}</span>
                      </div>
                      <div className={`mt-1 flex items-center justify-between gap-2 ${recommendedSide === "SELL" ? "text-rose-200" : "text-foreground"}`}>
                        <span className="font-semibold">SELL</span>
                        <span className="truncate">{sellExchange.label}</span>
                        <span className={`text-[11px] ${sellLinked ? "text-emerald-300" : "text-rose-200"}`}>{sellLinked ? "Vinculada" : "Nao vinculada"}</span>
                      </div>
                    </div>

                    {!user ? (
                      <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-100">
                        Faca login para vincular APIs e operar.
                        <button
                          type="button"
                          className="ml-2 underline underline-offset-2 hover:text-amber-50"
                          onClick={() => {
                            void loginWithGoogle().catch((e) => setError(e instanceof Error ? e.message : "Falha ao autenticar"))
                          }}
                        >
                          Login com Google
                        </button>
                      </div>
                    ) : linkedExchanges.length === 0 || (recommendedSide === "BUY" && !buyLinked) || (recommendedSide === "SELL" && !sellLinked) ? (
                      <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-100">
                        {linkedExchanges.length === 0
                          ? "Nenhuma exchange vinculada. Vincule suas APIs para habilitar BUY/SELL."
                          : recommendedSide === "BUY"
                            ? `BUY recomendado na ${buyExchange.label}. Vincule para operar.`
                            : recommendedSide === "SELL"
                              ? `SELL recomendado na ${sellExchange.label}. Vincule para operar.`
                              : "Vincule a exchange recomendada para operar."}
                        <button
                          type="button"
                          className="ml-2 underline underline-offset-2 hover:text-rose-50"
                          onClick={openApisAndClose}
                        >
                          Abrir APIs
                        </button>
                      </div>
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
                      disabled={tradePending || !user || !buyLinked}
                      onClick={() => submitTrade("BUY")}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold border ${
                        recommendedSide === "BUY" ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200" : "border-border bg-secondary/40 text-foreground"
                      } disabled:opacity-60`}
                      type="button"
                    >
                      BUY
                    </button>
                    <button
                      disabled={tradePending || !user || !sellLinked}
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
