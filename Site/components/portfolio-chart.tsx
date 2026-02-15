"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { gsap } from "gsap"
import type { BusinessDay, CandlestickData, HistogramData, IChartApi, ISeriesApi, Time } from "lightweight-charts"

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

const AUTO_ZOOM_BARS = 40
const REALTIME_POLL_MS_INTRADAY = 10_000
const REALTIME_POLL_MS_SLOW = 60_000
const MAX_RENDER_BARS_INTRADAY = 900

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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return "erro desconhecido"
}

function mergeCandles(prev: ChartCandle[], incoming: ChartCandle[]): ChartCandle[] {
  if (incoming.length === 0) return prev

  const map = new Map<number, ChartCandle>()
  for (const candle of prev) map.set(candle.timestamp, candle)
  for (const candle of incoming) map.set(candle.timestamp, candle)

  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp)
}

function toChartTime(candle: ChartCandle, intraday: boolean): Time | null {
  if (intraday) {
    const utcSeconds = Math.floor(candle.timestamp / 1000)
    return Number.isFinite(utcSeconds) ? (utcSeconds as Time) : null
  }

  const isoDate = candle.datetime_utc?.slice(0, 10)
  const [yearStr, monthStr, dayStr] = isoDate.split("-")
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  return { year, month, day } as BusinessDay
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
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)

  const headerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartApiRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const didAutoZoomRef = useRef(false)
  const realtimeTimerRef = useRef<number | null>(null)

  // novo: timestamp (ms) do último candle que foi renderizado/aplicado ao chart
  const lastRenderedTimestampRef = useRef<number | null>(null)

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
    if (realtimeTimerRef.current) {
      window.clearInterval(realtimeTimerRef.current)
      realtimeTimerRef.current = null
    }
    chartApiRef.current?.remove()
    chartApiRef.current = null
    candleSeriesRef.current = null
    volumeSeriesRef.current = null
    setChartReady(false)
    didAutoZoomRef.current = false
    lastRenderedTimestampRef.current = null
  }

  useEffect(() => {
    if (!asset) {
      setCandles([])
      return
    }
    const targetAsset = asset

    const controller = new AbortController()
    didAutoZoomRef.current = false

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

        // Inicializa totalmente quando carregamos histórico (substitui)
        setCandles(mapped)
        // atualiza o último render timestamp para forçar setData inicial no chart
        lastRenderedTimestampRef.current = null
        setLastUpdatedAt(Date.now())
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
      if (!asset || !chartContainerRef.current) {
        destroyChart()
        return
      }

      if (chartApiRef.current) {
        return
      }

      if (candles.length === 0) {
        return
      }

      try {
        const chartsModule = await import("lightweight-charts")
        const createChartFn =
          chartsModule.createChart ??
          (chartsModule as unknown as { default?: { createChart?: typeof chartsModule.createChart } }).default?.createChart

        const colorType =
          chartsModule.ColorType ??
          (chartsModule as unknown as { default?: { ColorType?: typeof chartsModule.ColorType } }).default?.ColorType

        if (!createChartFn) {
          throw new Error("createChart indisponivel no pacote lightweight-charts")
        }

        if (colorType?.Solid === undefined) {
          throw new Error("ColorType.Solid indisponivel no pacote lightweight-charts")
        }

        if (cancelled || !chartContainerRef.current) return

        const container = chartContainerRef.current
        const width = Math.max(320, container.clientWidth)
        const height = Math.max(320, container.clientHeight)

        const chart = createChartFn(container, {
          width,
          height,
          layout: {
            background: { type: colorType.Solid, color: "transparent" },
            textColor: "#9ca3af",
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
            barSpacing: 10,
            minBarSpacing: 6,
            rightOffset: 4,
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
      } catch (renderError) {
        const detail = toErrorMessage(renderError)
        console.error("Erro ao renderizar grafico:", renderError)
        setError(`Falha ao renderizar grafico no navegador (${detail}).`)
      }
    }

    buildClientChart()

    return () => {
      cancelled = true
      destroyChart()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id, period, isIntraday, candles.length])

  // novo: efeito que aplica dados incrementalmente ao chart usando update quando possível
  useEffect(() => {
    if (!chartApiRef.current || !candleSeriesRef.current || !volumeSeriesRef.current) return
    if (candles.length === 0) return

    // limitar se intraday
    const renderCandles = isIntraday ? candles.slice(-MAX_RENDER_BARS_INTRADAY) : candles

    // transforma em estruturas prontas para chart
    const candleData: Array<{ time: Time | number; open: number; high: number; low: number; close: number; __ts: number }> = []
    const volumeData: Array<{ time: Time | number; value: number; color: string; __ts: number }> = []

    for (const item of renderCandles) {
      const time = toChartTime(item, isIntraday)
      if (!time) continue

      const high = Math.max(item.high, item.open, item.close)
      const low = Math.min(item.low, item.open, item.close)

      candleData.push({
        time,
        open: item.open,
        high,
        low,
        close: item.close,
        __ts: item.timestamp, // guardamos timestamp ms para comparacoes
      })

      volumeData.push({
        time,
        value: item.volume,
        color: item.close >= item.open ? "rgba(34, 197, 94, 0.45)" : "rgba(239, 68, 68, 0.45)",
        __ts: item.timestamp,
      })
    }

    if (candleData.length === 0) return

    const lastRendered = lastRenderedTimestampRef.current
    // se nao renderizamos nada ainda, usar setData completo (inicial)
    if (!lastRendered) {
      candleSeriesRef.current.setData(candleData as CandlestickData<Time>[])
      volumeSeriesRef.current.setData(volumeData as HistogramData<Time>[])
      lastRenderedTimestampRef.current = candleData[candleData.length - 1].__ts
    } else {
      // encontrar novos candles que tem timestamp > lastRendered
      const newCandles = candleData.filter((c) => c.__ts > (lastRendered ?? 0))
      const newVolumes = volumeData.filter((v) => v.__ts > (lastRendered ?? 0))

      // se houver atualizacao do ultimo candle (mesmo timestamp), atualizamos via update
      const maybeLastIncoming = candleData[candleData.length - 1]
      if (maybeLastIncoming.__ts === lastRendered) {
        // atualizar o ultimo candle (em caso de candle em andamento ter mudado)
        candleSeriesRef.current.update({
          time: maybeLastIncoming.time,
          open: maybeLastIncoming.open,
          high: maybeLastIncoming.high,
          low: maybeLastIncoming.low,
          close: maybeLastIncoming.close,
        } as CandlestickData<Time>)
        const vol = volumeData[volumeData.length - 1]
        volumeSeriesRef.current.update({ time: vol.time, value: vol.value, color: vol.color } as HistogramData<Time>)
      }

      // adicionar novos candles (se houver)
      if (newCandles.length > 0) {
        for (const nc of newCandles) {
          candleSeriesRef.current.update({
            time: nc.time,
            open: nc.open,
            high: nc.high,
            low: nc.low,
            close: nc.close,
          } as CandlestickData<Time>)
        }
      }

      if (newVolumes.length > 0) {
        for (const nv of newVolumes) {
          volumeSeriesRef.current.update({ time: nv.time, value: nv.value, color: nv.color } as HistogramData<Time>)
        }
      }

      // avançar lastRenderedTimestampRef para o timestamp do último candle processado
      lastRenderedTimestampRef.current = candleData[candleData.length - 1].__ts
    }

    if (!didAutoZoomRef.current) {
      // ajustar visible range com base na versao renderizada
      const total = candleData.length
      const from = Math.max(0, total - AUTO_ZOOM_BARS)
      const to = Math.max(AUTO_ZOOM_BARS, total + 1)
      chartApiRef.current!.timeScale().setVisibleLogicalRange({ from, to })
      didAutoZoomRef.current = true
    }
  }, [candles, isIntraday])

  // otimizado: poll que evita re-substituir todo o array - apenas anexa/atualiza
  useEffect(() => {
    if (!asset) return
    if (realtimeTimerRef.current) {
      window.clearInterval(realtimeTimerRef.current)
      realtimeTimerRef.current = null
    }

    const targetAsset = asset
    const intervalMs = isIntraday ? REALTIME_POLL_MS_INTRADAY : REALTIME_POLL_MS_SLOW
    const controller = new AbortController()

    async function poll() {
      try {
        const response = await fetch(
          `/api/chart-data?coin=${encodeURIComponent(targetAsset.symbol)}&period=${encodeURIComponent(period)}&exchange=${encodeURIComponent(targetAsset.bestExchangeKey || "binance")}&quote=${encodeURIComponent(targetAsset.quoteAsset)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        )
        const payload = (await response.json()) as RemoteChartData & { error?: string }
        if (!response.ok) return

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

        if (mapped.length === 0) return

        // estrategia incremental:
        setCandles((prev) => {
          if (prev.length === 0) {
            // se nao tinhamos nada, simplesmente setamos o array recebido (histórico inicial)
            return mapped
          }

          const prevLastTs = prev[prev.length - 1].timestamp
          const incomingLastTs = mapped[mapped.length - 1].timestamp

          // se o ultimo timestamp do mapeado for igual ao nosso ultimo -> possivel atualização do candle em andamento
          if (incomingLastTs === prevLastTs) {
            // substitui apenas o último candle
            const copy = prev.slice()
            copy[copy.length - 1] = mapped[mapped.length - 1]
            return copy
          }

          // se houver candles totalmente novos (timestamp maior que prevLastTs), apendamos apenas estes
          const newItems = mapped.filter((m) => m.timestamp > prevLastTs)
          if (newItems.length === 0) {
            // nada novo
            return prev
          }

          // append novos itens (mantendo ordenação)
          const next = prev.concat(newItems)
          // opcional: limitar crescimento (por exemplo se quiser manter apenas últimos N em memória)
          return next
        })

        setLastUpdatedAt(Date.now())
      } catch (pollError) {
        if ((pollError as Error).name === "AbortError") return
        // silêncio intencional: tempo real nao deve travar UI
      }
    }

    // start quickly
    void poll()
    realtimeTimerRef.current = window.setInterval(poll, intervalMs)

    return () => {
      controller.abort()
      if (realtimeTimerRef.current) {
        window.clearInterval(realtimeTimerRef.current)
        realtimeTimerRef.current = null
      }
    }
  }, [asset?.id, period, isIntraday])

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
                asset.guaranteedProfitPercent >= 0 ? "bg-emerald-500/20" : "bg-rose-500/20"
              }`}
            >
              <span className={`font-bold text-sm font-mono ${asset.guaranteedProfitPercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {formatPercent(asset.guaranteedProfitPercent)}
              </span>
            </div>
            <span className="text-muted-foreground text-xs">
              {asset.guaranteedProfit ? "Lucro garantido (conservador) | " : "Lucro conservador | "}
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
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground leading-5">
          <div>
            <span className="text-foreground">Rota sugerida:</span> comprar em {asset.buyExchange} e vender em {asset.sellExchange}. Custo estimado{" "}
            {asset.estimatedCostsPercent.toFixed(3)}%.
          </div>
          <div className="shrink-0 font-mono">
            Tempo real: {isIntraday ? "ON" : "LENTO"} {lastUpdatedAt ? `| ${new Date(lastUpdatedAt).toLocaleTimeString()}` : ""}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// memoiza o componente para evitar re-renders desnecessários
export default React.memo(PortfolioChart)
