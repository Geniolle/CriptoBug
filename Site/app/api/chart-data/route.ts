import { NextRequest, NextResponse } from "next/server"

import { REMOTE_ENDPOINTS } from "@/lib/endpoints"

export const dynamic = "force-dynamic"

type CacheEntry = { expiresAt: number; payload: unknown }
const chartCache = new Map<string, CacheEntry>()
const MAX_CHART_CACHE_ENTRIES = 250

function normalizePeriod(value: string): string {
  return value.trim().toLowerCase()
}

function isIntraday(period: string): boolean {
  return ["1minuto", "5minutos", "30minutos", "hr"].includes(normalizePeriod(period))
}

function chartCacheTtlMs(period: string): number {
  const p = normalizePeriod(period)
  if (["full"].includes(p)) return 5 * 60_000
  if (isIntraday(p)) return 8_000
  return 45_000
}

function parseLimit(raw: string | null): number | null {
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.max(10, Math.min(6000, parsed))
}

export async function GET(request: NextRequest) {
  const coin = request.nextUrl.searchParams.get("coin")
  const period = request.nextUrl.searchParams.get("period") ?? "dia"
  const exchange = request.nextUrl.searchParams.get("exchange") ?? "binance"
  const quote = request.nextUrl.searchParams.get("quote") ?? "USDT"
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"))

  if (!coin) {
    return NextResponse.json({ error: "Parametro 'coin' e obrigatorio." }, { status: 400 })
  }

  const cacheKey = `${coin.toUpperCase()}|${normalizePeriod(period)}|${exchange.toLowerCase()}|${quote.toUpperCase()}|${limit ?? "all"}`
  const now = Date.now()
  const cached = chartCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, { status: 200 })
  }

  const remoteUrl = `${REMOTE_ENDPOINTS.api}/chart-data/${encodeURIComponent(coin)}?period=${encodeURIComponent(period)}&exchange=${encodeURIComponent(exchange)}&quote=${encodeURIComponent(quote)}`

  try {
    const response = await fetch(remoteUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(typeof payload === "object" && payload ? JSON.stringify(payload) : "Falha ao buscar dados do grafico.")
    }

    if (!payload || typeof payload !== "object") {
      chartCache.set(cacheKey, { expiresAt: now + chartCacheTtlMs(period), payload })
      return NextResponse.json(payload, { status: 200 })
    }

    // Light slicing on the edge to reduce payload size for the browser.
    const anyPayload = payload as Record<string, unknown>
    const candles = Array.isArray(anyPayload.candles) ? (anyPayload.candles as unknown[]) : null
    const slicedCandles = limit && candles ? candles.slice(-limit) : candles

    const resolved = typeof anyPayload.exchange === "string" ? anyPayload.exchange : exchange.toLowerCase()
    const finalPayload = {
      ...anyPayload,
      candles: slicedCandles ?? undefined,
      total_pontos: slicedCandles ? slicedCandles.length : anyPayload.total_pontos,
      requested_exchange: exchange.toLowerCase(),
      resolved_exchange: resolved,
    }

    if (chartCache.size >= MAX_CHART_CACHE_ENTRIES) {
      chartCache.clear()
    }
    chartCache.set(cacheKey, { expiresAt: now + chartCacheTtlMs(period), payload: finalPayload })
    return NextResponse.json(finalPayload, { status: 200 })
  } catch (error) {
    // If we have a stale cache, serve it to keep the UI responsive.
    if (cached) {
      return NextResponse.json(cached.payload, { status: 200 })
    }

    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json(
      {
        error: `Falha ao buscar dados do grafico: ${message}`,
      },
      { status: 502 },
    )
  }
}
