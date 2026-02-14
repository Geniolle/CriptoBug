"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { gsap } from "gsap"

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

interface ChartCandle {
  timestamp: number
  datetime_utc: string
  close: number
}

interface RemoteChartData {
  timeframe: string
  candles: ChartCandle[]
}

interface ChartPoint {
  timestamp: number
  label: string
  fullLabel: string
  close: number
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

function formatAxisLabel(timestamp: number, period: string): string {
  const date = new Date(timestamp)
  if (["1minuto", "5minutos", "30minutos", "hr"].includes(period)) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  if (["dia", "semana", "mes"].includes(period)) {
    return date.toLocaleDateString([], { day: "2-digit", month: "2-digit" })
  }
  return date.toLocaleDateString([], { month: "short", year: "2-digit" })
}

function formatFullLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const point = payload[0].payload
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-xl shadow-black/40">
      <p className="text-muted-foreground text-xs mb-1">{point.fullLabel}</p>
      <p className="text-foreground font-bold text-base font-mono">{formatPrice(point.close)}</p>
    </div>
  )
}

export function PortfolioChart({ asset, period, onChangePeriod }: PortfolioChartProps) {
  const [data, setData] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const headerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  const latestPoint = useMemo(() => (data.length > 0 ? data[data.length - 1] : null), [data])

  useEffect(() => {
    if (!asset) {
      setData([])
      return
    }

    const controller = new AbortController()

    async function loadChartData() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `/api/chart-data?coin=${encodeURIComponent(asset.symbol)}&period=${encodeURIComponent(period)}&exchange=${encodeURIComponent(asset.bestExchangeKey || "binance")}&quote=${encodeURIComponent(asset.quoteAsset)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        )

        const payload = (await response.json()) as RemoteChartData & { error?: string }

        if (!response.ok) {
          throw new Error(payload?.error || "Falha ao carregar grafico")
        }

        const candles = Array.isArray(payload.candles) ? payload.candles : []
        const mapped = candles
          .filter((c) => Number.isFinite(c.close) && Number.isFinite(c.timestamp))
          .map((c) => ({
            timestamp: c.timestamp,
            label: formatAxisLabel(c.timestamp, period),
            fullLabel: formatFullLabel(c.timestamp),
            close: c.close,
          }))

        setData(mapped)
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") return
        setError(fetchError instanceof Error ? fetchError.message : "Erro desconhecido")
        setData([])
      } finally {
        setLoading(false)
      }
    }

    loadChartData()
    return () => controller.abort()
  }, [asset, period])

  useEffect(() => {
    if (!asset) return

    if (headerRef.current) {
      gsap.fromTo(
        headerRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
      )
    }

    if (chartRef.current) {
      gsap.fromTo(
        chartRef.current,
        { opacity: 0, scale: 0.985 },
        { opacity: 1, scale: 1, duration: 0.45, ease: "power2.out" },
      )
    }
  }, [asset?.id, period, data.length])

  return (
    <div className="rounded-2xl border border-border bg-card p-6 flex flex-col h-full min-h-[580px]">
      <div ref={headerRef} className="flex items-start justify-between mb-3 gap-4">
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
            <span className="text-muted-foreground text-xs">
              {latestPoint ? `Ultimo: ${formatPrice(latestPoint.close)}` : `Preco: ${formatPrice(asset.latestPrice)}`}
            </span>
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

      <div ref={chartRef} className="flex-1 rounded-xl border border-border bg-background/40 overflow-hidden p-3">
        {!asset ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Aguardando selecao de ativo para carregar grafico...
          </div>
        ) : loading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Carregando grafico...</div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-rose-300 text-sm">{error}</div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados para este periodo.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 8 }}>
              <defs>
                <linearGradient id="assetChartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(145 80% 42%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(145 80% 42%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="hsl(0 0% 14%)" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "hsl(0 0% 56%)", fontSize: 11 }} minTickGap={18} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(0 0% 56%)", fontSize: 11 }}
                width={92}
                tickFormatter={(value) => formatPrice(Number(value))}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(145 80% 42%)", strokeDasharray: "4 4" }} />
              <Area
                type="monotone"
                dataKey="close"
                stroke="hsl(145 80% 42%)"
                strokeWidth={2.5}
                fill="url(#assetChartGradient)"
                dot={false}
                activeDot={{ r: 4, fill: "hsl(145 80% 42%)", stroke: "hsl(0 0% 4%)", strokeWidth: 2 }}
                isAnimationActive
                animationDuration={650}
              />
            </AreaChart>
          </ResponsiveContainer>
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
