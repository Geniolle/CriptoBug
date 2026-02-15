import { DB_API_BASE_URL } from '@/lib/endpoints';
import { fetchJson } from '@/lib/fetch';
import type { TradeActionItem } from '@/lib/types';

export type ExchangeKey = 'binance' | 'kraken' | 'okx' | 'bybit';

export interface ConnectionStatus {
  exchange: ExchangeKey;
  linked: boolean;
  apiKeyHint?: string;
  hasPassphrase?: boolean;
}

export interface TradeOrderResponse {
  ok?: boolean;
  id?: string;
  status?: string;
  exchangeOrderId?: string | null;
  error?: string;
}

function requireBaseUrl(): string {
  if (!DB_API_BASE_URL) {
    throw new Error('DB API nao configurada (EXPO_PUBLIC_DB_API_BASE_URL).');
  }
  return DB_API_BASE_URL;
}

export async function getConnections(token: string): Promise<ConnectionStatus[]> {
  const baseUrl = requireBaseUrl();
  const res = await fetchJson<{ connections?: ConnectionStatus[]; error?: string }>(`${baseUrl}/account/connections`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    timeoutMs: 20_000,
  });
  if (!res.ok) {
    throw new Error(res.data?.error || 'Falha ao carregar conexoes');
  }
  return Array.isArray(res.data?.connections) ? res.data!.connections! : [];
}

export async function upsertConnection(
  token: string,
  payload: { exchange: ExchangeKey; apiKey: string; apiSecret: string; passphrase?: string }
): Promise<void> {
  const baseUrl = requireBaseUrl();
  const res = await fetchJson<{ ok?: boolean; error?: string }>(`${baseUrl}/account/connections`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: payload,
    timeoutMs: 25_000,
  });
  if (!res.ok) {
    throw new Error(res.data?.error || 'Falha ao salvar conexao');
  }
}

export async function deleteConnection(token: string, exchange: ExchangeKey): Promise<void> {
  const baseUrl = requireBaseUrl();
  const url = `${baseUrl}/account/connections?exchange=${encodeURIComponent(exchange)}`;
  const res = await fetchJson<{ ok?: boolean; error?: string }>(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 20_000,
  });
  if (!res.ok) {
    throw new Error(res.data?.error || 'Falha ao remover conexao');
  }
}

export async function getEgressIp(token: string): Promise<string> {
  const baseUrl = requireBaseUrl();
  const res = await fetchJson<{ ip?: string; error?: string }>(`${baseUrl}/account/egress-ip`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    timeoutMs: 10_000,
  });
  if (!res.ok) {
    throw new Error(res.data?.error || 'Falha ao obter IP do servidor');
  }
  return res.data?.ip ? String(res.data.ip) : '';
}

export async function getTradeActions(token: string, limit: number): Promise<TradeActionItem[]> {
  const baseUrl = requireBaseUrl();
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit || 50)));
  const res = await fetchJson<{ actions?: TradeActionItem[]; error?: string }>(`${baseUrl}/trade/actions?limit=${safeLimit}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    timeoutMs: 20_000,
  });
  if (!res.ok) {
    throw new Error(res.data?.error || 'Falha ao carregar acoes');
  }
  return Array.isArray(res.data?.actions) ? res.data!.actions! : [];
}

export async function placeTradeOrder(
  token: string,
  payload: {
    exchange: ExchangeKey;
    symbol: string;
    side: 'BUY' | 'SELL';
    orderType: 'market' | 'limit';
    amount: number;
    price?: number;
  }
): Promise<TradeOrderResponse> {
  const baseUrl = requireBaseUrl();
  const res = await fetchJson<TradeOrderResponse>(`${baseUrl}/trade/order`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: payload,
    timeoutMs: 35_000,
  });
  if (!res.ok) {
    throw new Error(res.data?.error || 'Falha ao enviar ordem');
  }
  return res.data ?? {};
}

