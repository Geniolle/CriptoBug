import { NextRequest, NextResponse } from "next/server"

import { REMOTE_ENDPOINTS } from "@/lib/endpoints"

export const dynamic = "force-dynamic"

const FALLBACK_EXCHANGES = ["binance", "bybit", "okx", "kraken", "coinbase"] as const

export async function GET(request: NextRequest) {
  const coin = request.nextUrl.searchParams.get("coin")
  const period = request.nextUrl.searchParams.get("period") ?? "dia"
  const exchange = request.nextUrl.searchParams.get("exchange") ?? "binance"
  const quote = request.nextUrl.searchParams.get("quote") ?? "USDT"

  if (!coin) {
    return NextResponse.json({ error: "Parametro 'coin' e obrigatorio." }, { status: 400 })
  }

  const orderedExchanges = Array.from(new Set([exchange.toLowerCase(), ...FALLBACK_EXCHANGES]))

  let lastFailure: { exchange: string; status?: number; payload?: unknown; error?: string } | null = null

  for (const candidateExchange of orderedExchanges) {
    const remoteUrl = `${REMOTE_ENDPOINTS.api}/chart-data/${encodeURIComponent(coin)}?period=${encodeURIComponent(period)}&exchange=${encodeURIComponent(candidateExchange)}&quote=${encodeURIComponent(quote)}`

    try {
      const response = await fetch(remoteUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      })

      const payload = await response.json().catch(() => null)

      if (response.ok) {
        if (payload && typeof payload === "object") {
          return NextResponse.json(
            {
              ...(payload as object),
              requested_exchange: exchange.toLowerCase(),
              resolved_exchange: candidateExchange,
            },
            { status: 200 },
          )
        }
        return NextResponse.json(payload, { status: 200 })
      }

      lastFailure = { exchange: candidateExchange, status: response.status, payload }
    } catch (error) {
      lastFailure = {
        exchange: candidateExchange,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }
    }
  }

  return NextResponse.json(
    {
      error: "Falha ao buscar dados do grafico em todas as corretoras de fallback.",
      detail: lastFailure,
    },
    { status: 502 },
  )
}
