import { NextRequest, NextResponse } from "next/server"

import { REMOTE_ENDPOINTS } from "@/lib/endpoints"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const exchange = request.nextUrl.searchParams.get("exchange")
  const symbol = request.nextUrl.searchParams.get("symbol")
  const quoteAsset = request.nextUrl.searchParams.get("quote_asset") ?? "USDT"

  if (!exchange || !symbol) {
    return NextResponse.json({ error: "Parametros 'exchange' e 'symbol' sao obrigatorios." }, { status: 400 })
  }

  const remoteUrl = `${REMOTE_ENDPOINTS.ia}/decision/${encodeURIComponent(exchange)}/${encodeURIComponent(symbol)}?quote_asset=${encodeURIComponent(quoteAsset)}`

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
          error: "Falha ao consultar IA.",
          detail: payload,
        },
        { status: response.status },
      )
    }

    return NextResponse.json(payload, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json({ error: `Falha na comunicacao com IA: ${message}` }, { status: 502 })
  }
}
