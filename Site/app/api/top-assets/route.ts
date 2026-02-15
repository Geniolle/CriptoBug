import { NextResponse } from "next/server"

import { REMOTE_ENDPOINTS, SUPPORTED_EXCHANGES, type SupportedExchange } from "@/lib/endpoints"
import { TOP_30_ASSET_UNIVERSE } from "@/lib/top-assets"
import type { RankedAsset } from "@/lib/types"

export const dynamic = "force-dynamic"

interface HookMarketItem {
  symbol: string
  base_asset: string
  quote_asset: string
  valor_atual: string
  taxa_compra: string
  taxa_venda: string
  spread_percentual: string
}

interface HookSnapshotResponse {
  exchange: string
  mercados: HookMarketItem[]
}

interface ExchangeCandidate {
  exchange: SupportedExchange
  marketSymbol: string
  quoteAsset: string
  ask: number
  bid: number
  last: number
  spreadPercent: number
}

type TopAssetsCacheEntry = { expiresAt: number; payload: unknown }
let cachedTopAssets: TopAssetsCacheEntry | null = null

const TOP_ASSETS_CACHE_TTL_MS = Math.max(3_000, Number.parseInt(process.env.TOP_ASSETS_CACHE_TTL_MS ?? "15000", 10) || 15000)

const MAX_PAIRS = Number.parseInt(process.env.TOP_ASSETS_MAX_PAIRS ?? "3500", 10)
const TOP_ASSETS_EXCHANGES: SupportedExchange[] = SUPPORTED_EXCHANGES.filter((exchange) => exchange !== "coinbase")

const TAKER_FEE_PERCENT: Record<SupportedExchange, number> = {
  binance: 0.1,
  bybit: 0.1,
  okx: 0.1,
  kraken: 0.26,
  coinbase: 0.6,
}

const TRANSFER_COST_PERCENT = 0.12
const SLIPPAGE_FLOOR_PERCENT = 0.05
const GUARANTEE_SAFETY_BUFFER_PERCENT = Number.parseFloat(process.env.TOP_ASSETS_GUARANTEE_BUFFER_PERCENT ?? "0.35")
const GUARANTEE_MIN_COVERAGE = Number.parseInt(process.env.TOP_ASSETS_GUARANTEE_MIN_COVERAGE ?? "3", 10)

const QUOTE_PRIORITY: Record<string, number> = {
  USDT: 0,
  USD: 1,
  USDC: 2,
  EUR: 3,
  BTC: 4,
}

const EXCHANGE_LABEL: Record<SupportedExchange, string> = {
  binance: "Binance",
  bybit: "Bybit",
  okx: "OKX",
  kraken: "Kraken",
  coinbase: "Coinbase",
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase()
}

function getQuotePriority(quoteAsset: string): number {
  return QUOTE_PRIORITY[normalizeSymbol(quoteAsset)] ?? 99
}

function estimateSlippagePercent(spreadPercent: number): number {
  const scaled = Math.abs(spreadPercent) * 0.35
  return Math.max(SLIPPAGE_FLOOR_PERCENT, scaled)
}

function buildMarketIndex(items: HookMarketItem[]): Map<string, HookMarketItem[]> {
  const index = new Map<string, HookMarketItem[]>()
  for (const item of items) {
    const key = normalizeSymbol(item.base_asset)
    if (!index.has(key)) {
      index.set(key, [])
    }
    index.get(key)!.push(item)
  }
  return index
}

async function fetchExchangeSnapshot(exchange: SupportedExchange): Promise<HookSnapshotResponse | null> {
  const url = `${REMOTE_ENDPOINTS.hooks}/markets/${exchange}?max_pairs=${MAX_PAIRS}&top_assets_only=true`

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as HookSnapshotResponse
    if (!payload || !Array.isArray(payload.mercados)) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

function selectBestMarketForExchange(
  exchange: SupportedExchange,
  baseSymbolKeys: string[],
  index: Map<string, HookMarketItem[]>,
): ExchangeCandidate | null {
  const matches: HookMarketItem[] = []

  for (const key of baseSymbolKeys) {
    const found = index.get(key)
    if (found && found.length > 0) {
      matches.push(...found)
    }
  }

  if (matches.length === 0) {
    return null
  }

  const ranked = matches
    .map((item) => {
      const ask = toNumber(item.taxa_compra)
      const bid = toNumber(item.taxa_venda)
      const last = toNumber(item.valor_atual)
      const spreadPercent = toNumber(item.spread_percentual)

      return {
        exchange,
        marketSymbol: item.symbol,
        quoteAsset: normalizeSymbol(item.quote_asset),
        ask,
        bid,
        last,
        spreadPercent,
      }
    })
    .filter((item) => item.ask > 0 && item.bid > 0 && item.last > 0)
    .sort((a, b) => {
      const q = getQuotePriority(a.quoteAsset) - getQuotePriority(b.quoteAsset)
      if (q !== 0) return q
      if (a.spreadPercent !== b.spreadPercent) return a.spreadPercent - b.spreadPercent
      return b.bid - a.bid
    })

  return ranked[0] ?? null
}

function estimateNetProfitPercent(buy: ExchangeCandidate, sell: ExchangeCandidate): {
  netProfitPercent: number
  grossArbitragePercent: number
  estimatedCostsPercent: number
} {
  const buyFee = TAKER_FEE_PERCENT[buy.exchange]
  const sellFee = TAKER_FEE_PERCENT[sell.exchange]

  const buySlippage = estimateSlippagePercent(buy.spreadPercent)
  const sellSlippage = estimateSlippagePercent(sell.spreadPercent)

  const buyCostPercent = buyFee + buySlippage + TRANSFER_COST_PERCENT / 2
  const sellCostPercent = sellFee + sellSlippage + TRANSFER_COST_PERCENT / 2

  const grossArbitragePercent = ((sell.bid - buy.ask) / buy.ask) * 100

  const effectiveBuy = buy.ask * (1 + buyCostPercent / 100)
  const effectiveSell = sell.bid * Math.max(0, 1 - sellCostPercent / 100)

  const netProfitPercent = ((effectiveSell - effectiveBuy) / effectiveBuy) * 100
  const estimatedCostsPercent = buyCostPercent + sellCostPercent

  return {
    netProfitPercent,
    grossArbitragePercent,
    estimatedCostsPercent,
  }
}

function rankAssetFromCandidates(
  name: string,
  symbol: string,
  candidates: ExchangeCandidate[],
): Omit<RankedAsset, "rank"> {
  if (candidates.length === 0) {
    return {
      id: symbol,
      name,
      symbol,
      quoteAsset: "USDT",
      marketSymbol: `${symbol}USDT`,
      buyMarketSymbol: `${symbol}USDT`,
      sellMarketSymbol: `${symbol}USDT`,
      bestExchangeKey: "",
      bestExchange: "Sem dados",
      buyExchangeKey: "",
      buyExchange: "Sem dados",
      sellExchangeKey: "",
      sellExchange: "Sem dados",
      latestPrice: 0,
      grossArbitragePercent: 0,
      netProfitPercent: -999,
      guaranteedProfitPercent: -999,
      guaranteedProfit: false,
      estimatedCostsPercent: 0,
      averageSpreadPercent: 0,
      score: -999,
      coverage: 0,
      reason: "Sem dados suficientes nas corretoras suportadas para calcular ranking.",
      available: false,
    }
  }

  let bestBuy = candidates[0]
  let bestSell = candidates[0]
  let bestNet = -Infinity
  let bestGross = -Infinity
  let bestCosts = 0

  for (const buy of candidates) {
    for (const sell of candidates) {
      if (buy.exchange === sell.exchange) {
        continue
      }
      if (buy.quoteAsset !== sell.quoteAsset) {
        continue
      }

      const calc = estimateNetProfitPercent(buy, sell)
      if (calc.netProfitPercent > bestNet) {
        bestNet = calc.netProfitPercent
        bestGross = calc.grossArbitragePercent
        bestCosts = calc.estimatedCostsPercent
        bestBuy = buy
        bestSell = sell
      }
    }
  }

  if (!Number.isFinite(bestNet)) {
    const only = candidates[0]
    const fallbackCosts =
      TAKER_FEE_PERCENT[only.exchange] * 2 + estimateSlippagePercent(only.spreadPercent) * 2 + TRANSFER_COST_PERCENT
    bestNet = -Math.abs(fallbackCosts + only.spreadPercent)
    bestGross = -Math.abs(only.spreadPercent)
    bestCosts = fallbackCosts
    bestBuy = only
    bestSell = only
  }

  const avgSpread =
    candidates.reduce((acc, item) => acc + Math.max(0, item.spreadPercent), 0) / Math.max(1, candidates.length)

  const guaranteedProfitPercent = bestNet - GUARANTEE_SAFETY_BUFFER_PERCENT
  const guaranteedProfit = guaranteedProfitPercent > 0 && candidates.length >= GUARANTEE_MIN_COVERAGE
  const score = guaranteedProfitPercent + candidates.length * 0.35 - avgSpread * 0.35

  const reason =
    guaranteedProfit
      ? `Lucro conservador ${guaranteedProfitPercent.toFixed(3)}% apos buffer de seguranca (${GUARANTEE_SAFETY_BUFFER_PERCENT.toFixed(3)}%), comprando em ${EXCHANGE_LABEL[bestBuy.exchange]} e vendendo em ${EXCHANGE_LABEL[bestSell.exchange]}.`
      : `Sem lucro conservador garantido. Liquido estimado ${bestNet.toFixed(3)}% e conservador ${guaranteedProfitPercent.toFixed(3)}% com spread medio ${avgSpread.toFixed(4)}%.`

  return {
    id: symbol,
    name,
    symbol,
    quoteAsset: bestSell.quoteAsset,
    marketSymbol: bestSell.marketSymbol,
    buyMarketSymbol: bestBuy.marketSymbol,
    sellMarketSymbol: bestSell.marketSymbol,
    bestExchangeKey: bestSell.exchange,
    bestExchange: EXCHANGE_LABEL[bestSell.exchange],
    buyExchangeKey: bestBuy.exchange,
    buyExchange: EXCHANGE_LABEL[bestBuy.exchange],
    sellExchangeKey: bestSell.exchange,
    sellExchange: EXCHANGE_LABEL[bestSell.exchange],
    latestPrice: bestSell.last,
    grossArbitragePercent: bestGross,
    netProfitPercent: bestNet,
    guaranteedProfitPercent,
    guaranteedProfit,
    estimatedCostsPercent: bestCosts,
    averageSpreadPercent: avgSpread,
    score,
    coverage: candidates.length,
    reason,
    available: true,
  }
}

export async function GET() {
  const now = Date.now()
  if (cachedTopAssets && cachedTopAssets.expiresAt > now) {
    return NextResponse.json(cachedTopAssets.payload, { status: 200 })
  }

  const settled = await Promise.allSettled(TOP_ASSETS_EXCHANGES.map((exchange) => fetchExchangeSnapshot(exchange)))
  const snapshots = settled.map((item) => (item.status === "fulfilled" ? item.value : null))

  const indexesByExchange = new Map<SupportedExchange, Map<string, HookMarketItem[]>>()

  snapshots.forEach((snapshot, idx) => {
    if (!snapshot) return
    const exchange = TOP_ASSETS_EXCHANGES[idx]
    indexesByExchange.set(exchange, buildMarketIndex(snapshot.mercados))
  })

  const rankedBase = TOP_30_ASSET_UNIVERSE.map((asset) => {
    const keys = [asset.symbol, ...(asset.aliases ?? [])].map(normalizeSymbol)

    const candidates: ExchangeCandidate[] = []
    for (const exchange of TOP_ASSETS_EXCHANGES) {
      const index = indexesByExchange.get(exchange)
      if (!index) continue
      const candidate = selectBestMarketForExchange(exchange, keys, index)
      if (candidate) candidates.push(candidate)
    }

    return rankAssetFromCandidates(asset.name, asset.symbol, candidates)
  })

  rankedBase.sort((a, b) => {
    if (a.available !== b.available) {
      return a.available ? -1 : 1
    }
    return b.score - a.score
  })

  const rankedAssets: RankedAsset[] = rankedBase.map((item, index) => ({
    ...item,
    rank: index + 1,
  }))

  const payload = {
    generatedAt: new Date().toISOString(),
    total: rankedAssets.length,
    assets: rankedAssets,
  }

  cachedTopAssets = { expiresAt: now + TOP_ASSETS_CACHE_TTL_MS, payload }
  return NextResponse.json(payload)
}
