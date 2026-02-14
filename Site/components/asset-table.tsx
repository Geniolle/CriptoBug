"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { gsap } from "gsap"

import type { RankedAsset } from "@/lib/types"

const DEFAULT_VISIBLE_ASSETS = 7

interface AssetTableProps {
  assets: RankedAsset[]
  selectedAssetId: string | null
  onSelect: (asset: RankedAsset) => void
}

function formatPercent(value: number): string {
  const signal = value > 0 ? "+" : ""
  return `${signal}${value.toFixed(3)}%`
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value)
}

export function AssetTable({ assets, selectedAssetId, onSelect }: AssetTableProps) {
  const [expanded, setExpanded] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const visibleAssets = useMemo(() => {
    if (expanded) return assets
    return assets.slice(0, DEFAULT_VISIBLE_ASSETS)
  }, [assets, expanded])

  useEffect(() => {
    if (!listRef.current) return

    const rows = listRef.current.querySelectorAll("[data-asset-row='true']")
    gsap.fromTo(rows, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.03, ease: "power2.out" })
  }, [visibleAssets])

  return (
    <div className="rounded-2xl border border-border bg-card p-6 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="text-foreground font-bold text-base">Top Assets</h3>
        <span className="text-muted-foreground text-xs text-right">Clique 1x: grafico | 2x: IA</span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <div ref={listRef} className={`h-full space-y-2 pr-1 ${expanded ? "overflow-y-auto" : "overflow-hidden"}`}>
          {visibleAssets.map((asset) => {
            const selected = selectedAssetId === asset.id

            return (
              <button
                key={asset.id}
                data-asset-row="true"
                onClick={() => onSelect(asset)}
                className={`w-full text-left rounded-xl border px-3 py-3 transition-all ${
                  selected ? "border-primary/50 bg-primary/10" : "border-border hover:bg-secondary/50"
                } ${asset.available ? "" : "opacity-55"}`}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground font-mono">#{asset.rank}</span>
                      <span className="text-sm font-semibold text-foreground truncate">{asset.name}</span>
                      <span className="text-[11px] text-muted-foreground">({asset.symbol}/{asset.quoteAsset})</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 truncate">
                      {asset.available ? `Melhor corretora: ${asset.bestExchange}` : "Sem dados suficientes"}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`text-sm font-mono font-bold ${asset.netProfitPercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {asset.available ? formatPercent(asset.netProfitPercent) : "N/A"}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">{formatPrice(asset.latestPrice)}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {assets.length > DEFAULT_VISIBLE_ASSETS ? (
        <div className="pt-3">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="w-full rounded-lg border border-primary/35 bg-primary/10 text-primary py-2 text-xs font-semibold hover:bg-primary/20 transition-colors"
          >
            {expanded ? "Mostrar menos" : "Mostrar mais"}
          </button>
        </div>
      ) : null}
    </div>
  )
}
