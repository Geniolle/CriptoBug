import ccxt from "ccxt"

import type { ExchangeKey } from "./repository.js"
import { getExchangeCredentials } from "./repository.js"

export type OrderSide = "BUY" | "SELL"
export type OrderType = "market" | "limit"

function normalizeExchange(key: ExchangeKey): keyof typeof ccxt {
  // ccxt ids are usually the same as our keys.
  return key as keyof typeof ccxt
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function extractMinNotional(market: any): number | null {
  const fromLimits = toNumber(market?.limits?.cost?.min)
  if (fromLimits && fromLimits > 0) return fromLimits

  const filters = market?.info?.filters
  if (!Array.isArray(filters)) return null
  const filter = filters.find((f: any) => f?.filterType === "MIN_NOTIONAL" || f?.filterType === "NOTIONAL")
  const fromInfo = toNumber(filter?.minNotional)
  return fromInfo && fromInfo > 0 ? fromInfo : null
}

async function preflightBinanceNotionalCheck(args: {
  client: any
  symbol: string
  side: OrderSide
  amount: number
}): Promise<void> {
  const market = args.client.market(args.symbol)
  const minNotional = extractMinNotional(market)
  if (!minNotional) return

  // For market orders, estimate cost using public ticker.
  const ticker = await args.client.fetchTicker(args.symbol)
  const pxRaw = args.side === "BUY" ? (ticker?.ask ?? ticker?.last ?? ticker?.close) : (ticker?.bid ?? ticker?.last ?? ticker?.close)
  const px = toNumber(pxRaw)
  if (!px || px <= 0) return

  const estCost = args.amount * px
  if (estCost + 1e-12 < minNotional) {
    const quote = market?.quote ?? "quote"
    throw new Error(
      `Binance: ordem abaixo do minimo (NOTIONAL). Minimo: ${minNotional} ${quote}. Estimado: ${estCost.toFixed(8)} ${quote}. Aumente a quantidade.`,
    )
  }
}

export async function placeOrder(args: {
  userId: string
  exchange: ExchangeKey
  symbol: string // e.g. ETH/USDT
  side: OrderSide
  orderType: OrderType
  amount: number // base amount
  price?: number // for limit
}): Promise<unknown> {
  const exId = normalizeExchange(args.exchange)
  const ExchangeClass = (ccxt as unknown as Record<string, any>)[exId]
  if (!ExchangeClass) {
    throw new Error(`Exchange nao suportada: ${args.exchange}`)
  }

  const creds = await getExchangeCredentials(args.userId)
  const cred = creds.find((c) => c.exchange === args.exchange)
  if (!cred) {
    throw new Error(`Credenciais nao encontradas para ${args.exchange}`)
  }

  if (!cred.apiKey || !cred.apiSecret) {
    throw new Error(`Credenciais incompletas para ${args.exchange}`)
  }

  const client = new ExchangeClass({
    apiKey: cred.apiKey,
    secret: cred.apiSecret,
    enableRateLimit: true,
  })

  // OKX requires password/passphrase field.
  if (args.exchange === "okx") {
    if (!cred.passphrase) throw new Error("Passphrase obrigatoria para OKX")
    ;(client as any).password = cred.passphrase
  }

  await client.loadMarkets()

  const side = args.side.toLowerCase() // buy/sell
  const amountPrecRaw = client.amountToPrecision(args.symbol, args.amount)
  const amountPrec = Number.parseFloat(String(amountPrecRaw))
  if (!Number.isFinite(amountPrec) || amountPrec <= 0) {
    throw new Error("Quantidade invalida (precision)")
  }

  if (args.exchange === "binance") {
    // Binance rejects orders below MIN_NOTIONAL/NOTIONAL. Pre-check to return a clearer message.
    await preflightBinanceNotionalCheck({ client, symbol: args.symbol, side: args.side, amount: amountPrec })
  }

  if (args.orderType === "market") {
    return await client.createOrder(args.symbol, "market", side, amountPrec)
  }
  if (!args.price || args.price <= 0) {
    throw new Error("Preco obrigatorio para ordem limit")
  }
  const pricePrecRaw = client.priceToPrecision(args.symbol, args.price)
  const pricePrec = Number.parseFloat(String(pricePrecRaw))
  if (!Number.isFinite(pricePrec) || pricePrec <= 0) {
    throw new Error("Preco invalido (precision)")
  }
  return await client.createOrder(args.symbol, "limit", side, amountPrec, pricePrec)
}
