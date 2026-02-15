export interface RankedAsset {
  id: string;
  rank: number;
  name: string;
  symbol: string;
  quoteAsset: string;
  marketSymbol: string;
  bestExchangeKey: string;
  bestExchange: string;
  buyExchangeKey: string;
  buyExchange: string;
  sellExchangeKey: string;
  sellExchange: string;
  latestPrice: number;
  grossArbitragePercent: number;
  netProfitPercent: number;
  guaranteedProfitPercent: number;
  guaranteedProfit: boolean;
  estimatedCostsPercent: number;
  averageSpreadPercent: number;
  score: number;
  coverage: number;
  reason: string;
  available: boolean;
}

export interface DecisionPayload {
  exchange: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  generated_at: string;
  horizonte?: string;
  acao: 'BUY' | 'SELL' | 'HOLD';
  confianca: number;
  score: number;
  resumo: string;
  motivos: string[];
}

export interface TradeActionItem {
  id: string;
  exchange: string;
  symbol: string;
  side: string;
  orderType: string;
  amount: string;
  status: string;
  exchangeOrderId?: string | null;
  createdAt: string;
  updatedAt: string;
  error?: string | null;
}

