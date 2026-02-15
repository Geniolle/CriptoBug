import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const ALLOWED_EXCHANGES = ["binance", "bybit", "okx", "kraken"] as const
type AllowedExchange = (typeof ALLOWED_EXCHANGES)[number]

function normalizeExchange(value: unknown): AllowedExchange | null {
  if (typeof value !== "string") return null
  const ex = value.trim().toLowerCase()
  return (ALLOWED_EXCHANGES as readonly string[]).includes(ex) ? (ex as AllowedExchange) : null
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

type OrderResult = {
  ok: boolean
  exchange: AllowedExchange
  side: "BUY" | "SELL"
  id?: string
  status?: string
  exchangeOrderId?: string | null
  error?: string
}

async function callTradeOrder(args: {
  baseUrl: string
  authorization: string
  exchange: AllowedExchange
  symbol: string
  side: "BUY" | "SELL"
  amount: number
}): Promise<OrderResult> {
  const response = await fetch(`${args.baseUrl}/trade/order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: args.authorization,
    },
    body: JSON.stringify({
      exchange: args.exchange,
      symbol: args.symbol,
      side: args.side,
      orderType: "market",
      amount: args.amount,
    }),
    signal: AbortSignal.timeout(40_000),
  })

  const payload = (await response.json().catch(() => null)) as any
  if (!response.ok) {
    return {
      ok: false,
      exchange: args.exchange,
      side: args.side,
      id: payload?.id,
      status: payload?.status,
      exchangeOrderId: payload?.exchangeOrderId ?? null,
      error: payload?.error || payload?.message || "Falha ao enviar ordem",
    }
  }

  return {
    ok: true,
    exchange: args.exchange,
    side: args.side,
    id: payload?.id,
    status: payload?.status,
    exchangeOrderId: payload?.exchangeOrderId ?? null,
  }
}

export async function POST(request: NextRequest) {
  const baseUrl = (process.env.NEXT_PUBLIC_DB_API_BASE_URL ?? "").replace(/\/+$/, "")
  if (!baseUrl) {
    return NextResponse.json({ error: "DB API nao configurada (NEXT_PUBLIC_DB_API_BASE_URL)." }, { status: 500 })
  }

  const authorization = request.headers.get("authorization") ?? ""
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Token ausente (Authorization: Bearer ...)." }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as any
  const buyExchange = normalizeExchange(body?.buyExchange)
  const sellExchange = normalizeExchange(body?.sellExchange)
  const symbol = typeof body?.symbol === "string" ? body.symbol.trim() : ""
  const amount = toNumber(body?.amount)

  if (!buyExchange || !sellExchange) {
    return NextResponse.json({ error: "buyExchange/sellExchange invalidos." }, { status: 400 })
  }
  if (buyExchange === sellExchange) {
    return NextResponse.json({ error: "buyExchange e sellExchange devem ser diferentes." }, { status: 400 })
  }
  if (!symbol || symbol.length < 3 || !symbol.includes("/")) {
    return NextResponse.json({ error: "symbol invalido. Use formato BASE/QUOTE (ex: BTC/USDT)." }, { status: 400 })
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "amount invalido." }, { status: 400 })
  }

  const groupId = crypto.randomUUID()

  // Execute in parallel to reduce market risk.
  const [buyRes, sellRes] = await Promise.allSettled([
    callTradeOrder({ baseUrl, authorization, exchange: buyExchange, symbol, side: "BUY", amount }),
    callTradeOrder({ baseUrl, authorization, exchange: sellExchange, symbol, side: "SELL", amount }),
  ])

  const buy = buyRes.status === "fulfilled" ? buyRes.value : ({ ok: false, exchange: buyExchange, side: "BUY", error: "Falha ao enviar ordem" } satisfies OrderResult)
  const sell = sellRes.status === "fulfilled" ? sellRes.value : ({ ok: false, exchange: sellExchange, side: "SELL", error: "Falha ao enviar ordem" } satisfies OrderResult)

  const ok = Boolean(buy.ok && sell.ok)
  return NextResponse.json(
    {
      ok,
      groupId,
      buy,
      sell,
      note:
        "As ordens foram submetidas em paralelo. Em spot, arbitragem real depende de saldo em ambas as corretoras (base e/ou quote) e pode sofrer slippage.",
    },
    { status: ok ? 200 : 207 },
  )
}

