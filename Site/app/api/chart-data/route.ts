import { NextRequest, NextResponse } from "next/server"

import { REMOTE_ENDPOINTS } from "@/lib/endpoints"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const coin = request.nextUrl.searchParams.get("coin")
  const period = request.nextUrl.searchParams.get("period") ?? "dia"
  const exchange = request.nextUrl.searchParams.get("exchange") ?? "binance"
  const quote = request.nextUrl.searchParams.get("quote") ?? "USDT"

  if (!coin) {
    return NextResponse.json({ error: "Parametro 'coin' e obrigatorio." }, { status: 400 })
  }

  const remoteUrl = `${REMOTE_ENDPOINTS.api}/chart-data/${encodeURIComponent(coin)}?period=${encodeURIComponent(period)}&exchange=${encodeURIComponent(exchange)}&quote=${encodeURIComponent(quote)}`

  try {
    const response = await fetch(remoteUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Falha ao buscar dados do grafico.",
          detail: payload,
        },
        { status: response.status },
      )
    }

    return NextResponse.json(payload, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json({ error: `Falha na comunicacao com API de grafico: ${message}` }, { status: 502 })
  }
}
