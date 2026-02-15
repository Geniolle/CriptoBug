function normalizeBaseUrl(value: string | undefined): string {
  return (value ?? '').replace(/\/+$/, '');
}

export const DB_API_BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_DB_API_BASE_URL);

export const REMOTE_ENDPOINTS = {
  api: normalizeBaseUrl(process.env.EXPO_PUBLIC_CRYPTO_API_BASE_URL) || 'https://api-production-51fe.up.railway.app',
  hooks: normalizeBaseUrl(process.env.EXPO_PUBLIC_CRYPTO_HOOKS_BASE_URL) || 'https://hooks-production-c2fd.up.railway.app',
  ia: normalizeBaseUrl(process.env.EXPO_PUBLIC_CRYPTO_IA_BASE_URL) || 'https://ia-bot-production.up.railway.app',
} as const;

export const SUPPORTED_EXCHANGES = ['binance', 'bybit', 'okx', 'kraken', 'coinbase'] as const;

export type SupportedExchange = (typeof SUPPORTED_EXCHANGES)[number];

