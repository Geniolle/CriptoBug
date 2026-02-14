"use client"

import type { RankedAsset } from "@/lib/types"

const PERIOD_OPTIONS = [
  { key: "1minuto", label: "1m" },
  { key: "5minutos", label: "5m" },
  { key: "30minutos", label: "30m" },
  { key: "hr", label: "1h" },
  { key: "dia", label: "1d" },
  { key: "semana", label: "1w" },
  { key: "mes", label: "1M" },
  { key: "ano", label: "1Y" },
  { key: "5anos", label: "5Y" },
  { key: "full", label: "FULL" },
] as const

interface PortfolioChartProps {
  asset: RankedAsset | null
  period: string
  onChangePeriod: (period: string) => void
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value)
}

function formatPercent(value: number): string {
  const signal = value > 0 ? "+" : ""
  return `${signal}${value.toFixed(3)}%`
}

export function PortfolioChart({ asset, period, onChangePeriod }: PortfolioChartProps) {
  const chartUrl = asset
    ? `/api/chart?coin=${encodeURIComponent(asset.symbol)}&period=${encodeURIComponent(period)}&exchange=${encodeURIComponent(asset.bestExchangeKey || "binance")}&quote=${encodeURIComponent(asset.quoteAsset)}`
    : ""

  return (
    <div className="rounded-2xl border border-border bg-card p-6 flex flex-col h-full min-h-[580px]">
      <div className="flex items-start justify-between mb-3 gap-4">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-widest mb-1">Top Asset Selection</p>
          <h2 className="text-3xl font-bold text-foreground font-mono">
            {asset ? `${asset.name} (${asset.symbol})` : "Selecione uma moeda"}
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {asset ? `Corretora com melhor lucro liquido: ${asset.bestExchange}` : "Clique em uma moeda na tabela Top Assets"}
          </p>
        </div>

        {asset ? (
          <div className="flex flex-col items-end gap-1">
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
                asset.netProfitPercent >= 0 ? "bg-emerald-500/20" : "bg-rose-500/20"
              }`}
            >
              <span className={`font-bold text-sm font-mono ${asset.netProfitPercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {formatPercent(asset.netProfitPercent)}
              </span>
            </div>
            <span className="text-muted-foreground text-xs">Preco: {formatPrice(asset.latestPrice)}</span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.key}
            onClick={() => onChangePeriod(option.key)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              period === option.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex-1 rounded-xl border border-border bg-background/40 overflow-hidden flex items-center justify-center">
        {asset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${asset.id}-${period}-${asset.bestExchangeKey}`}
            src={chartUrl}
            alt={`Grafico ${asset.symbol}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <p className="text-muted-foreground text-sm">Aguardando selecao de ativo para carregar grafico...</p>
        )}
      </div>

      {asset ? (
        <div className="mt-3 text-xs text-muted-foreground leading-5">
          <span className="text-foreground">Rota sugerida:</span> comprar em {asset.buyExchange} e vender em {asset.sellExchange}. Custo estimado {asset.estimatedCostsPercent.toFixed(3)}%.
        </div>
      ) : null}
    </div>
  )
}
