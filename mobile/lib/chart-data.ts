import { fetchWithTimeout } from '@/lib/fetch';
import { REMOTE_ENDPOINTS } from '@/lib/endpoints';

export interface ChartCandle {
  timestamp: number;
  datetime_utc: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RemoteChartData {
  timeframe?: string;
  candles?: ChartCandle[];
  requested_exchange?: string;
  resolved_exchange?: string;
  error?: string;
  detail?: unknown;
}

const FALLBACK_EXCHANGES = ['binance', 'bybit', 'okx', 'kraken', 'coinbase'] as const;

export async function fetchChartData(params: {
  coin: string;
  period: string;
  exchange: string;
  quote: string;
}): Promise<{ data: RemoteChartData; resolvedExchange: string | null }> {
  const orderedExchanges = Array.from(new Set([params.exchange.toLowerCase(), ...FALLBACK_EXCHANGES]));

  let lastFailure: { exchange: string; status?: number; payload?: unknown; error?: string } | null = null;

  for (const candidateExchange of orderedExchanges) {
    const remoteUrl = `${REMOTE_ENDPOINTS.api}/chart-data/${encodeURIComponent(params.coin)}?period=${encodeURIComponent(
      params.period
    )}&exchange=${encodeURIComponent(candidateExchange)}&quote=${encodeURIComponent(params.quote)}`;

    try {
      const response = await fetchWithTimeout(remoteUrl, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        timeoutMs: 30_000,
      });

      const payload = (await response.json().catch(() => null)) as unknown;

      if (response.ok) {
        const data = payload && typeof payload === 'object' ? (payload as RemoteChartData) : ({ candles: [] } as RemoteChartData);
        return {
          data: {
            ...data,
            requested_exchange: params.exchange.toLowerCase(),
            resolved_exchange: candidateExchange,
          },
          resolvedExchange: candidateExchange,
        };
      }

      lastFailure = { exchange: candidateExchange, status: response.status, payload };
    } catch (error) {
      lastFailure = {
        exchange: candidateExchange,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  return {
    data: {
      error: 'Falha ao buscar dados do grafico em todas as corretoras de fallback.',
      detail: lastFailure,
    },
    resolvedExchange: null,
  };
}

export async function fetchChartPng(params: {
  coin: string;
  period: string;
  exchange: string;
  quote: string;
}): Promise<string> {
  const remoteUrl = `${REMOTE_ENDPOINTS.api}/chart/${encodeURIComponent(params.coin)}?period=${encodeURIComponent(
    params.period
  )}&exchange=${encodeURIComponent(params.exchange)}&quote=${encodeURIComponent(params.quote)}`;

  // Just return the URL; RN <Image> will fetch it.
  // Keeping this helper to avoid spreading URL building everywhere.
  return remoteUrl;
}
