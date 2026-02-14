"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { gsap } from "gsap"
import type { CandlestickData, HistogramData, IChartApi, ISeriesApi, Time } from "lightweight-charts"

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
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface RemoteChartData {
  timeframe: string
  candles: ChartCandle[]
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
  const [candles, setCandles] = useState<ChartCandle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chartReady, setChartReady] = useState(false)

  const headerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartApiRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const latestPoint = useMemo(() => (candles.length > 0 ? candles[candles.length - 1] : null), [candles])

  const latestVariation = useMemo(() => {
    if (!latestPoint || latestPoint.open <= 0) return 0
    return ((latestPoint.close - latestPoint.open) / latestPoint.open) * 100
  }, [latestPoint])

  const isIntraday = useMemo(() => ["1minuto", "5minutos", "30minutos", "hr"].includes(period), [period])

  function destroyChart() {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect()
      resizeObserverRef.current = null
    }
    chartApiRef.current?.remove()
    chartApiRef.current = null
    candleSeriesRef.current = null
    volumeSeriesRef.current = null
    setChartReady(false)
  }

  useEffect(() => {
    if (!asset) {
      setCandles([])
      return
    }
    const targetAsset = asset

    const controller = new AbortController()

    async function loadChartData() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `/api/chart-data?coin=${encodeURIComponent(targetAsset.symbol)}&period=${encodeURIComponent(period)}&exchange=${encodeURIComponent(targetAsset.bestExchangeKey || "binance")}&quote=${encodeURIComponent(targetAsset.quoteAsset)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        )

        const payload = (await response.json()) as RemoteChartData & { error?: string }

        if (!response.ok) {
          throw new Error(payload?.error || "Falha ao carregar grafico")
        }

        const incomingCandles = Array.isArray(payload.candles) ? payload.candles : []
        const mapped = incomingCandles
          .map((c) => ({
            timestamp: Number(c.timestamp),
            datetime_utc: c.datetime_utc,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume),
          }))
          .filter(
            (c) =>
              Number.isFinite(c.timestamp) &&
              Number.isFinite(c.open) &&
              Number.isFinite(c.high) &&
              Number.isFinite(c.low) &&
              Number.isFinite(c.close) &&
              Number.isFinite(c.volume),
          )
          .sort((a, b) => a.timestamp - b.timestamp)

        setCandles(mapped)
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") return
        setError(fetchError instanceof Error ? fetchError.message : "Erro desconhecido")
        setCandles([])
      } finally {
        setLoading(false)
      }
    }

    loadChartData()
    return () => controller.abort()
  }, [asset, period])

  useEffect(() => {
    let cancelled = false

    async function buildClientChart() {
      if (!asset || !chartContainerRef.current || candles.length === 0) {
        destroyChart()
        return
      }

      destroyChart()

      try {
        const { createChart, ColorType } = await import("lightweight-charts")
        if (cancelled || !chartContainerRef.current) return

        const container = chartContainerRef.current
        const width = Math.max(320, container.clientWidth)
        const height = Math.max(320, container.clientHeight)

        const chart = createChart(container, {
          width,
          height,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "hsl(0 0% 62%)",
            fontFamily: "var(--font-space-mono), monospace",
          },
          grid: {
            vertLines: { color: "rgba(148, 163, 184, 0.10)" },
            horzLines: { color: "rgba(148, 163, 184, 0.10)" },
          },
          rightPriceScale: {
            borderVisible: false,
            scaleMargins: { top: 0.08, bottom: 0.2 },
          },
          timeScale: {
            borderVisible: false,
            timeVisible: isIntraday,
            secondsVisible: false,
          },
          crosshair: {
            vertLine: { color: "rgba(52, 211, 153, 0.42)" },
            horzLine: { color: "rgba(52, 211, 153, 0.42)" },
          },
        })

        const candleSeries = chart.addCandlestickSeries({
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderUpColor: "#16a34a",
          borderDownColor: "#dc2626",
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
        })

        const volumeSeries = chart.addHistogramSeries({
          priceScaleId: "",
          priceFormat: { type: "volume" },
        })

        chart.priceScale("").applyOptions({
          scaleMargins: { top: 0.82, bottom: 0 },
          borderVisible: false,
        })

        const candleData: CandlestickData<Time>[] = candles.map((item) => ({
          time: Math.floor(item.timestamp / 1000) as Time,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
        }))

        const volumeData: HistogramData<Time>[] = candles.map((item) => ({
          time: Math.floor(item.timestamp / 1000) as Time,
          value: item.volume,
          color: item.close >= item.open ? "rgba(34, 197, 94, 0.45)" : "rgba(239, 68, 68, 0.45)",
        }))

        candleSeries.setData(candleData)
        volumeSeries.setData(volumeData)
        chart.timeScale().fitContent()

        const resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0]
          if (!entry) return
          const nextWidth = Math.max(320, Math.floor(entry.contentRect.width))
          const nextHeight = Math.max(320, Math.floor(entry.contentRect.height))
          chart.applyOptions({ width: nextWidth, height: nextHeight })
        })

        resizeObserver.observe(container)

        chartApiRef.current = chart
        candleSeriesRef.current = candleSeries
        volumeSeriesRef.current = volumeSeries
        resizeObserverRef.current = resizeObserver
        setChartReady(true)
      } catch {
        setError("Falha ao renderizar grafico no navegador.")
      }
    }

    buildClientChart()

    return () => {
      cancelled = true
      destroyChart()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id, candles, isIntraday])

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
  }, [asset?.id, period, candles.length])

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
              {latestPoint
                ? `Ultimo: ${formatPrice(latestPoint.close)} | ${formatPercent(latestVariation)}`
                : `Preco: ${formatPrice(asset.latestPrice)}`}
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
        ) : candles.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados para este periodo.</div>
        ) : (
          <div className="h-full w-full relative">
            <div ref={chartContainerRef} className="h-full w-full" />
            {!chartReady ? (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm bg-background/35">
                Preparando grafico...
              </div>
            ) : null}
          </div>
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
