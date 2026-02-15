import { NextRequest, NextResponse } from "next/server"

import { SUPPORTED_EXCHANGES, type SupportedExchange } from "@/lib/endpoints"

export const dynamic = "force-dynamic"

type OrderBookLevel = [number, number] // [price, amount]

interface NormalizedOrderBook {
  exchange: SupportedExchange
  symbol: string
  limit: number
  updatedAt: string
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  bestBid: number | null
  bestAsk: number | null
  mid: number | null
}

type CacheEntry = { expiresAt: number; payload: NormalizedOrderBook }
const orderbookCache = new Map<string, CacheEntry>()

function normalizeExchange(value: string): SupportedExchange | null {
  const ex = value.trim().toLowerCase() as SupportedExchange
  return (SUPPORTED_EXCHANGES as readonly string[]).includes(ex) ? ex : null
}

function parseLimit(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) return 20
  return Math.max(5, Math.min(50, parsed))
}

function toLevels(input: unknown, max: number): OrderBookLevel[] {
  if (!Array.isArray(input)) return []
  const out: OrderBookLevel[] = []
  for (const row of input) {
    if (!Array.isArray(row) || row.length < 2) continue
    const price = Number(row[0])
    const amount = Number(row[1])
    if (!Number.isFinite(price) || !Number.isFinite(amount) || price <= 0 || amount <= 0) continue
    out.push([price, amount])
    if (out.length >= max) break
  }
  return out
}

async function fetchOrderbook(exchange: SupportedExchange, symbol: string, limit: number): Promise<{ bids: OrderBookLevel[]; asks: OrderBookLevel[] }> {
  if (exchange === "binance") {
    const url = `https://api.binance.com/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000) })
    const payload = (await response.json().catch(() => null)) as any
    if (!response.ok) throw new Error(payload ? JSON.stringify(payload) : "Falha ao buscar order book (Binance)")
    return {
      bids: toLevels(payload?.bids, limit),
      asks: toLevels(payload?.asks, limit),
    }
  }

  if (exchange === "bybit") {
    const url = `https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${encodeURIComponent(symbol)}&limit=${limit}`
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000) })
    const payload = (await response.json().catch(() => null)) as any
    if (!response.ok || payload?.retCode !== 0) throw new Error(payload ? JSON.stringify(payload) : "Falha ao buscar order book (Bybit)")
    return {
      bids: toLevels(payload?.result?.b, limit),
      asks: toLevels(payload?.result?.a, limit),
    }
  }

  if (exchange === "okx") {
    const url = `https://www.okx.com/api/v5/market/books?instId=${encodeURIComponent(symbol)}&sz=${limit}`
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000) })
    const payload = (await response.json().catch(() => null)) as any
    if (!response.ok || payload?.code !== "0") throw new Error(payload ? JSON.stringify(payload) : "Falha ao buscar order book (OKX)")
    const book = Array.isArray(payload?.data) ? payload.data[0] : null
    return {
      bids: toLevels(book?.bids, limit),
      asks: toLevels(book?.asks, limit),
    }
  }

  if (exchange === "kraken") {
    const url = `https://api.kraken.com/0/public/Depth?pair=${encodeURIComponent(symbol)}&count=${limit}`
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) })
    const payload = (await response.json().catch(() => null)) as any
    if (!response.ok || (Array.isArray(payload?.error) && payload.error.length > 0)) {
      throw new Error(payload ? JSON.stringify(payload) : "Falha ao buscar order book (Kraken)")
    }

    const result = payload?.result ?? {}
    const firstKey = result && typeof result === "object" ? Object.keys(result)[0] : null
    const book = firstKey ? result[firstKey] : null
    // Kraken: each row is [price, volume, timestamp]
    const bids = toLevels(book?.bids, limit)
    const asks = toLevels(book?.asks, limit)
    return { bids, asks }
  }

  throw new Error("Exchange nao suportada para order book")
}

export async function GET(request: NextRequest) {
  const exchangeRaw = request.nextUrl.searchParams.get("exchange") ?? ""
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim()
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"))

  const exchange = normalizeExchange(exchangeRaw)
  if (!exchange) {
    return NextResponse.json({ error: "Parametro 'exchange' invalido." }, { status: 400 })
  }
  if (exchange === "coinbase") {
    return NextResponse.json({ error: "Coinbase desativada para order book neste MVP." }, { status: 400 })
  }
  if (!symbol) {
    return NextResponse.json({ error: "Parametro 'symbol' e obrigatorio." }, { status: 400 })
  }

  const now = Date.now()
  const cacheKey = `${exchange}|${symbol}|${limit}`
  const cached = orderbookCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, { status: 200 })
  }

  try {
    const { bids, asks } = await fetchOrderbook(exchange, symbol, limit)
    const bestBid = bids.length > 0 ? bids[0][0] : null
    const bestAsk = asks.length > 0 ? asks[0][0] : null
    const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : null

    const payload: NormalizedOrderBook = {
      exchange,
      symbol,
      limit,
      updatedAt: new Date().toISOString(),
      bids,
      asks,
      bestBid,
      bestAsk,
      mid,
    }

    // Very small TTL: reduces outgoing load while still being "real-time".
    orderbookCache.set(cacheKey, { expiresAt: now + 650, payload })
    if (orderbookCache.size > 350) orderbookCache.clear()

    return NextResponse.json(payload, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json({ error: `Falha ao buscar order book: ${message}` }, { status: 502 })
  }
}

