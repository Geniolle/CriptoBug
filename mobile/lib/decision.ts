import { fetchWithTimeout } from '@/lib/fetch';
import { REMOTE_ENDPOINTS } from '@/lib/endpoints';
import type { DecisionPayload } from '@/lib/types';

export async function fetchDecision(params: {
  exchange: string;
  symbol: string;
  quoteAsset: string;
}): Promise<DecisionPayload> {
  const remoteUrl = `${REMOTE_ENDPOINTS.ia}/decision/${encodeURIComponent(params.exchange)}/${encodeURIComponent(
    params.symbol
  )}?quote_asset=${encodeURIComponent(params.quoteAsset)}`;

  const response = await fetchWithTimeout(remoteUrl, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    timeoutMs: 30_000,
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const text = payload ? JSON.stringify(payload) : '';
    throw new Error(text || 'Falha ao consultar IA.');
  }

  return payload as DecisionPayload;
}

