export const REMOTE_ENDPOINTS = {
  api: process.env.CRYPTO_API_BASE_URL ?? "https://api-production-51fe.up.railway.app",
  hooks: process.env.CRYPTO_HOOKS_BASE_URL ?? "https://hooks-production-c2fd.up.railway.app",
  ia: process.env.CRYPTO_IA_BASE_URL ?? "https://ia-bot-production.up.railway.app",
}

export const SUPPORTED_EXCHANGES = ["binance", "bybit", "okx", "kraken", "coinbase"] as const

export type SupportedExchange = (typeof SUPPORTED_EXCHANGES)[number]
