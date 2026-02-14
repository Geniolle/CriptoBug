import ccxt from "ccxt"

import type { ExchangeKey } from "./repository.js"
import { getExchangeCredentials } from "./repository.js"

export type OrderSide = "BUY" | "SELL"
export type OrderType = "market" | "limit"

function normalizeExchange(key: ExchangeKey): keyof typeof ccxt {
  // ccxt ids are usually the same as our keys.
  return key as keyof typeof ccxt
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
  if (args.orderType === "market") {
    return await client.createOrder(args.symbol, "market", side, args.amount)
  }
  if (!args.price || args.price <= 0) {
    throw new Error("Preco obrigatorio para ordem limit")
  }
  return await client.createOrder(args.symbol, "limit", side, args.amount, args.price)
}
