import { NextRequest, NextResponse } from "next/server"

import { REMOTE_ENDPOINTS } from "@/lib/endpoints"
import { labelSidePt } from "@/lib/pt"

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

    // Keep the raw action (BUY/SELL/HOLD) for compatibility, but also expose a PT label
    // so the network payload is fully PT-friendly for the client.
    const anyPayload = payload as Record<string, unknown>
    const acaoRaw = typeof anyPayload.acao === "string" ? anyPayload.acao : ""
    const acao_pt = acaoRaw ? labelSidePt(acaoRaw) : ""

    return NextResponse.json({ ...anyPayload, acao_pt }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json({ error: `Falha na comunicacao com IA: ${message}` }, { status: 502 })
  }
}
