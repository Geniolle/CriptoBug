"use client"

import { useEffect, useRef, useState } from "react"
import { gsap } from "gsap"

import type { DecisionPayload, RankedAsset } from "@/lib/types"
import { useAuth } from "@/components/auth-provider"
import { formatPercentPt, formatUsdPt, labelSidePt, labelSideShortPt, labelStatusPt } from "@/lib/pt"

type OrderBookLevel = [number, number] // [price, amount]
type OrderBookPayload = {
  exchange: string
  symbol: string
  limit: number
  updatedAt: string
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  bestBid: number | null
  bestAsk: number | null
  mid: number | null
  error?: string
}

const ORDERBOOK_LEVELS = 15
const ORDERBOOK_POLL_MS = 1_200

const TAKER_FEE_PERCENT: Record<string, number> = {
  binance: 0.1,
  bybit: 0.1,
  okx: 0.1,
  kraken: 0.26,
}

// Em arbitragem spot, custo de transferencia aparece principalmente no rebalanceamento entre corretoras.
// Mantemos esse termo para refletir o desafio (fees + slippage + transferencia).
const TRANSFER_COST_PERCENT = 0.12

function formatAmountPt(value: number, maxFractionDigits = 8): string {
  if (!Number.isFinite(value)) return "-"
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: maxFractionDigits }).format(value)
}

function computeVwap(levels: OrderBookLevel[], amountBase: number): { avgPrice: number; filled: number; total: number } | null {
  if (!Number.isFinite(amountBase) || amountBase <= 0) return null
  let remaining = amountBase
  let filled = 0
  let total = 0
  for (const [price, amount] of levels) {
    if (remaining <= 0) break
    if (!Number.isFinite(price) || !Number.isFinite(amount) || price <= 0 || amount <= 0) continue
    const take = Math.min(amount, remaining)
    total += take * price
    filled += take
    remaining -= take
  }
  if (filled <= 0) return null
  return { avgPrice: total / filled, filled, total }
}

function inferMarketSymbol(exchange: string, baseAsset: string, quoteAsset: string): string {
  const base = baseAsset.trim().toUpperCase()
  const quote = quoteAsset.trim().toUpperCase()
  if (!base || !quote) return ""
  if (exchange === "okx") return `${base}-${quote}`

  // Kraken: alguns pares usam base diferente (ex.: BTC -> XBT). Melhor usar os symbols do ranking (buy/sellMarketSymbol).
  if (exchange === "kraken" && base === "BTC") return `XBT${quote}`
  if (exchange === "kraken" && base === "DOGE") return `XDG${quote}`

  return `${base}${quote}` // binance/bybit/kraken (na maioria dos casos)
}

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

  const [buyBook, setBuyBook] = useState<OrderBookPayload | null>(null)
  const [sellBook, setSellBook] = useState<OrderBookPayload | null>(null)
  const [orderbookError, setOrderbookError] = useState<string | null>(null)
  const [orderbookUpdatedAt, setOrderbookUpdatedAt] = useState<string | null>(null)

  const [arbitragePending, setArbitragePending] = useState(false)
  const [arbitrageMessage, setArbitrageMessage] = useState<string | null>(null)

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
    // Reset realtime panels when switching assets.
    setBuyBook(null)
    setSellBook(null)
    setOrderbookError(null)
    setOrderbookUpdatedAt(null)
    setArbitrageMessage(null)
  }, [asset?.id])

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
    const targetAsset = asset

    const buyExchangeKey = targetAsset.buyExchangeKey || targetAsset.bestExchangeKey
    const sellExchangeKey = targetAsset.sellExchangeKey || targetAsset.bestExchangeKey
    const buySymbol = (targetAsset.buyMarketSymbol || inferMarketSymbol(buyExchangeKey, targetAsset.symbol, targetAsset.quoteAsset)).trim()
    const sellSymbol = (targetAsset.sellMarketSymbol || inferMarketSymbol(sellExchangeKey, targetAsset.symbol, targetAsset.quoteAsset)).trim()

    if (!buyExchangeKey || !sellExchangeKey || !buySymbol || !sellSymbol) {
      return
    }

    let cancelled = false
    let firstLoad = true

    async function fetchOne(exchange: string, symbol: string): Promise<OrderBookPayload> {
      const response = await fetch(
        `/api/orderbook?exchange=${encodeURIComponent(exchange)}&symbol=${encodeURIComponent(symbol)}&limit=${ORDERBOOK_LEVELS}`,
        { cache: "no-store" },
      )
      const payload = (await response.json().catch(() => null)) as OrderBookPayload & { error?: string }
      if (!response.ok) {
        throw new Error(payload?.error || "Falha ao buscar order book")
      }
      return payload as OrderBookPayload
    }

    async function loadOrderbooks() {
      if (firstLoad) setOrderbookError(null)
      try {
        const [buyRes, sellRes] = await Promise.allSettled([
          fetchOne(buyExchangeKey, buySymbol),
          fetchOne(sellExchangeKey, sellSymbol),
        ])

        if (cancelled) return

        let err: string | null = null
        if (buyRes.status === "fulfilled") {
          setBuyBook(buyRes.value)
        } else {
          err = `Falha no order book (compra): ${buyRes.reason instanceof Error ? buyRes.reason.message : "erro"}`
        }

        if (sellRes.status === "fulfilled") {
          setSellBook(sellRes.value)
        } else {
          const msg = sellRes.reason instanceof Error ? sellRes.reason.message : "erro"
          err = err ? `${err} | venda: ${msg}` : `Falha no order book (venda): ${msg}`
        }

        setOrderbookError(err)
        setOrderbookUpdatedAt(new Date().toISOString())
      } catch (e) {
        if (cancelled) return
        setOrderbookError(e instanceof Error ? e.message : "Erro desconhecido ao buscar order book")
      } finally {
        firstLoad = false
      }
    }

    void loadOrderbooks()
    const timer = window.setInterval(loadOrderbooks, ORDERBOOK_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [asset?.id])

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

  const buyBookSymbol = (asset.buyMarketSymbol || inferMarketSymbol(buyExchange.key, asset.symbol, asset.quoteAsset)).trim()
  const sellBookSymbol = (asset.sellMarketSymbol || inferMarketSymbol(sellExchange.key, asset.symbol, asset.quoteAsset)).trim()

  const amountParsed = Number.parseFloat(tradeAmount)
  const amountBase = Number.isFinite(amountParsed) && amountParsed > 0 ? amountParsed : null

  const buyAsk = buyBook?.bestAsk ?? (buyBook?.asks?.[0]?.[0] ?? null)
  const sellBid = sellBook?.bestBid ?? (sellBook?.bids?.[0]?.[0] ?? null)
  const topSpreadPercent = buyAsk && sellBid ? ((sellBid - buyAsk) / buyAsk) * 100 : null

  const buyFee = TAKER_FEE_PERCENT[buyExchange.key] ?? 0
  const sellFee = TAKER_FEE_PERCENT[sellExchange.key] ?? 0

  const buyVwap = amountBase && buyBook ? computeVwap(buyBook.asks, amountBase) : null
  const sellVwap = amountBase && sellBook ? computeVwap(sellBook.bids, amountBase) : null

  const netAfterFeesPercent =
    buyVwap && sellVwap
      ? ((sellVwap.avgPrice * (1 - sellFee / 100) - buyVwap.avgPrice * (1 + buyFee / 100)) / (buyVwap.avgPrice * (1 + buyFee / 100))) * 100
      : null

  const netAfterAllCostsPercent = netAfterFeesPercent != null ? netAfterFeesPercent - TRANSFER_COST_PERCENT : null

  const buySlippagePercent =
    buyVwap && buyAsk ? ((buyVwap.avgPrice - buyAsk) / Math.max(1e-12, buyAsk)) * 100 : null
  const sellSlippagePercent =
    sellVwap && sellBid ? ((sellBid - sellVwap.avgPrice) / Math.max(1e-12, sellBid)) * 100 : null

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
      if (!ex.key) throw new Error("Corretora recomendada indisponivel para este ativo.")
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
        setTradeMessage("SIMULACAO: ordem registrada apenas no historico (nao enviada a corretora). Configure TRADING_DRY_RUN=false no servico /DB e reinicie.")
      } else if (status === "EXECUTED") {
        const extra = payload?.exchangeOrderId ? ` | ordem: ${payload.exchangeOrderId}` : ""
        setTradeMessage(`EXECUTADA: ${payload?.id ?? "-"}${extra}`)
      } else {
        setTradeMessage(`Ordem registrada: ${labelStatusPt(status)} (${payload?.id ?? "-"})`)
      }
      setTradeAmount("")
    } catch (tradeError) {
      setError(tradeError instanceof Error ? tradeError.message : "Erro desconhecido")
    } finally {
      setTradePending(false)
    }
  }

  async function submitArbitrage() {
    setArbitragePending(true)
    setArbitrageMessage(null)
    setError(null)

    try {
      if (!asset) throw new Error("Ativo nao selecionado")
      if (!user) throw new Error("Faca login para operar e vincular suas APIs.")
      if (!baseUrl) throw new Error("DB API nao configurada (NEXT_PUBLIC_DB_API_BASE_URL).")

      const buyKey = (buyExchange.key || "").toLowerCase()
      const sellKey = (sellExchange.key || "").toLowerCase()
      if (!buyKey || !sellKey) throw new Error("Corretoras invalidas para arbitragem")
      if (buyKey === sellKey) throw new Error("Para arbitragem, compra e venda devem ser em corretoras diferentes.")

      if (!linkedExchanges.includes(buyKey) || !linkedExchanges.includes(sellKey)) {
        throw new Error("Vincule as duas corretoras (compra e venda) em Perfil > APIs para executar arbitragem.")
      }

      const amount = Number.parseFloat(tradeAmount)
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Quantidade invalida")

      const ok = window.confirm(
        `Executar arbitragem?\n\nComprar a mercado ${amount} ${asset.symbol} em ${buyExchange.label}\nVender a mercado ${amount} ${asset.symbol} em ${sellExchange.label}\n\nIsso envia 2 ordens em paralelo. Em spot, voce precisa de saldo nas duas corretoras.`,
      )
      if (!ok) return

      const token = await getIdToken()
      const symbol = `${asset.symbol}/${asset.quoteAsset}`

      const response = await fetch("/api/arbitrage/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          buyExchange: buyKey,
          sellExchange: sellKey,
          symbol,
          amount,
        }),
      })

      const payload = (await response.json().catch(() => null)) as any
      if (!response.ok && response.status !== 207) {
        throw new Error(payload?.error || "Falha ao executar arbitragem")
      }

      const buy = payload?.buy ?? {}
      const sell = payload?.sell ?? {}
      const buyLine = `COMPRA (${buyExchange.label}): ${labelStatusPt(String(buy.status ?? ""))} (${buy.id ?? "-"}${buy.exchangeOrderId ? ` | ordem: ${buy.exchangeOrderId}` : ""}${buy.error ? ` | erro: ${buy.error}` : ""})`
      const sellLine = `VENDA (${sellExchange.label}): ${labelStatusPt(String(sell.status ?? ""))} (${sell.id ?? "-"}${sell.exchangeOrderId ? ` | ordem: ${sell.exchangeOrderId}` : ""}${sell.error ? ` | erro: ${sell.error}` : ""})`
      const header = payload?.groupId ? `Grupo: ${payload.groupId}` : "Arbitragem"

      setArbitrageMessage([header, buyLine, sellLine].join("\n"))
    } catch (arbError) {
      setError(arbError instanceof Error ? arbError.message : "Erro desconhecido")
    } finally {
      setArbitragePending(false)
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
      <div
        ref={panelRef}
        className="relative flex w-full max-w-2xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/60"
      >
        <div className="flex shrink-0 items-center justify-between p-6 border-b border-border">
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

        <div className="min-h-0 overflow-y-auto p-6 space-y-4">
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
                  <div className={`text-xl font-bold mt-1 ${actionColor}`}>{labelSidePt(decision.acao)}</div>
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
                <h3 className="text-foreground font-semibold mb-2">Acoes (Comprar/Vender)</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Isso registra e tenta executar a ordem via suas credenciais vinculadas. Por seguranca, o servico /DB pode estar em modo simulacao.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="md:col-span-1">
                    <div className="text-[11px] text-muted-foreground mb-1">Corretora (auto)</div>
                    <div className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <div className={`flex items-center justify-between gap-2 ${recommendedSide === "BUY" ? "text-emerald-200" : "text-foreground"}`}>
                        <span className="font-semibold">{labelSideShortPt("BUY")}</span>
                        <span className="truncate">{buyExchange.label}</span>
                        <span className={`text-[11px] ${buyLinked ? "text-emerald-300" : "text-rose-200"}`}>{buyLinked ? "Vinculada" : "Nao vinculada"}</span>
                      </div>
                      <div className={`mt-1 flex items-center justify-between gap-2 ${recommendedSide === "SELL" ? "text-rose-200" : "text-foreground"}`}>
                        <span className="font-semibold">{labelSideShortPt("SELL")}</span>
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
                          ? "Nenhuma corretora vinculada. Vincule suas APIs para habilitar compra/venda."
                          : recommendedSide === "BUY"
                            ? `Compra recomendada na ${buyExchange.label}. Vincule para operar.`
                            : recommendedSide === "SELL"
                              ? `Venda recomendada na ${sellExchange.label}. Vincule para operar.`
                              : "Vincule a corretora recomendada para operar."}
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
                      COMPRAR
                    </button>
                    <button
                      disabled={tradePending || !user || !sellLinked}
                      onClick={() => submitTrade("SELL")}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold border ${
                        recommendedSide === "SELL" ? "border-rose-400/60 bg-rose-500/20 text-rose-200" : "border-border bg-secondary/40 text-foreground"
                      } disabled:opacity-60`}
                      type="button"
                    >
                      VENDER
                    </button>
                  </div>
                </div>

                {tradeMessage ? <div className="mt-3 text-xs text-emerald-200 font-mono">{tradeMessage}</div> : null}
              </div>

              <div className="rounded-xl border border-border bg-secondary/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-foreground font-semibold mb-1">Order Book (Tempo real)</h3>
                    <p className="text-xs text-muted-foreground">
                      Topo do livro para compra e venda em corretoras diferentes. Atualiza a cada {(ORDERBOOK_POLL_MS / 1000).toFixed(1)}s.
                    </p>
                  </div>
                  <div className="text-[11px] text-muted-foreground text-right">
                    {orderbookUpdatedAt ? `Atualizado: ${new Date(orderbookUpdatedAt).toLocaleTimeString("pt-BR")}` : "Carregando..."}
                  </div>
                </div>

                {orderbookError ? (
                  <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-100">
                    {orderbookError}
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-emerald-200">COMPRA ({buyExchange.label})</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{buyBookSymbol || "-"}</div>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      Melhor ask: <span className="font-semibold text-foreground">{buyAsk ? formatUsdPt(buyAsk) : "-"}</span>
                    </div>
                    <div className="mt-2 rounded-md border border-border/60 bg-background/40 p-2">
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground font-semibold">
                        <div>Preco</div>
                        <div className="text-right">Qtd</div>
                      </div>
                      <div className="mt-1 space-y-1">
                        {(buyBook?.asks ?? []).slice(0, 8).map(([px, amt], idx) => (
                          <div key={`ask-${idx}`} className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                            <div className="text-emerald-200">{formatUsdPt(px)}</div>
                            <div className="text-right text-muted-foreground">{formatAmountPt(amt)}</div>
                          </div>
                        ))}
                        {!buyBook || (buyBook.asks ?? []).length === 0 ? (
                          <div className="text-[11px] text-muted-foreground">Sem dados.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-rose-200">VENDA ({sellExchange.label})</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{sellBookSymbol || "-"}</div>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      Melhor bid: <span className="font-semibold text-foreground">{sellBid ? formatUsdPt(sellBid) : "-"}</span>
                    </div>
                    <div className="mt-2 rounded-md border border-border/60 bg-background/40 p-2">
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground font-semibold">
                        <div>Preco</div>
                        <div className="text-right">Qtd</div>
                      </div>
                      <div className="mt-1 space-y-1">
                        {(sellBook?.bids ?? []).slice(0, 8).map(([px, amt], idx) => (
                          <div key={`bid-${idx}`} className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                            <div className="text-rose-200">{formatUsdPt(px)}</div>
                            <div className="text-right text-muted-foreground">{formatAmountPt(amt)}</div>
                          </div>
                        ))}
                        {!sellBook || (sellBook.bids ?? []).length === 0 ? (
                          <div className="text-[11px] text-muted-foreground">Sem dados.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <div className="text-[11px] text-muted-foreground">Spread bruto (topo do livro)</div>
                    <div className={`mt-1 text-lg font-bold ${topSpreadPercent != null && topSpreadPercent > 0 ? "text-emerald-300" : "text-rose-200"}`}>
                      {topSpreadPercent != null ? formatPercentPt(topSpreadPercent) : "-"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <div className="text-[11px] text-muted-foreground">Lucro liquido (taxas + slippage do livro)</div>
                    <div className={`mt-1 text-lg font-bold ${netAfterFeesPercent != null && netAfterFeesPercent > 0 ? "text-emerald-300" : "text-rose-200"}`}>
                      {netAfterFeesPercent != null ? formatPercentPt(netAfterFeesPercent) : "-"}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Taxas: {formatPercentPt(buyFee + sellFee)} | Slippage:{" "}
                      {buySlippagePercent != null ? formatPercentPt(buySlippagePercent) : "-"} / {sellSlippagePercent != null ? formatPercentPt(sellSlippagePercent) : "-"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <div className="text-[11px] text-muted-foreground">Lucro liquido (inclui transferencia)</div>
                    <div className={`mt-1 text-lg font-bold ${netAfterAllCostsPercent != null && netAfterAllCostsPercent > 0 ? "text-emerald-300" : "text-rose-200"}`}>
                      {netAfterAllCostsPercent != null ? formatPercentPt(netAfterAllCostsPercent) : "-"}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">Transferencia (rebalanceamento): {formatPercentPt(-TRANSFER_COST_PERCENT)}</div>
                  </div>
                </div>

                {!amountBase ? (
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    Digite uma <span className="font-semibold text-foreground">quantidade</span> para calcular slippage e lucro liquido usando a profundidade do livro.
                  </div>
                ) : buyVwap && sellVwap && (buyVwap.filled < amountBase || sellVwap.filled < amountBase) ? (
                  <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-100">
                    Profundidade insuficiente para preencher {formatAmountPt(amountBase)} {asset.symbol}. Preenchido: compra {formatAmountPt(buyVwap.filled)} / venda {formatAmountPt(sellVwap.filled)}.
                  </div>
                ) : null}

                <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="text-[11px] text-muted-foreground">
                    Compra: {buyExchange.label} | Venda: {sellExchange.label} | Par padrao: <span className="font-mono">{asset.symbol}/{asset.quoteAsset}</span>
                  </div>
                  <button
                    type="button"
                    onClick={submitArbitrage}
                    disabled={
                      arbitragePending ||
                      tradePending ||
                      !user ||
                      !amountBase ||
                      !buyLinked ||
                      !sellLinked ||
                      !buyExchange.key ||
                      !sellExchange.key ||
                      buyExchange.key === sellExchange.key
                    }
                    className="rounded-lg px-3 py-2 text-xs font-semibold border border-primary/40 bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-60"
                  >
                    {arbitragePending ? "Enviando..." : "EXECUTAR ARBITRAGEM (SIMULTANEO)"}
                  </button>
                </div>

                {arbitrageMessage ? (
                  <pre className="mt-3 rounded-lg border border-border bg-background/40 p-3 text-[11px] text-foreground font-mono whitespace-pre-wrap">
                    {arbitrageMessage}
                  </pre>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
