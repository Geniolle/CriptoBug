"use client"

import type { RankedAsset } from "@/lib/types"

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
  return (
    <div className="rounded-2xl border border-border bg-card p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-foreground font-bold text-base">Top Assets</h3>
        <span className="text-muted-foreground text-xs">Clique 1x: grafico | 2x: IA</span>
      </div>

      <div className="overflow-auto pr-1">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left pb-3 text-muted-foreground text-xs font-semibold uppercase tracking-wider">#</th>
              <th className="text-left pb-3 text-muted-foreground text-xs font-semibold uppercase tracking-wider">Asset</th>
              <th className="text-right pb-3 text-muted-foreground text-xs font-semibold uppercase tracking-wider">Price</th>
              <th className="text-right pb-3 text-muted-foreground text-xs font-semibold uppercase tracking-wider">Best Exchange</th>
              <th className="text-right pb-3 text-muted-foreground text-xs font-semibold uppercase tracking-wider">Net Profit</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const selected = selectedAssetId === asset.id
              return (
                <tr
                  key={asset.id}
                  onClick={() => onSelect(asset)}
                  className={`border-b border-border last:border-0 cursor-pointer transition-colors ${
                    selected ? "bg-primary/10" : "hover:bg-secondary/50"
                  } ${asset.available ? "" : "opacity-55"}`}
                >
                  <td className="py-4 text-xs font-mono text-muted-foreground">{asset.rank}</td>
                  <td className="py-4">
                    <div className="flex flex-col">
                      <span className="text-foreground font-medium text-sm">{asset.name}</span>
                      <span className="text-muted-foreground text-xs">{asset.symbol}/{asset.quoteAsset}</span>
                    </div>
                  </td>
                  <td className="py-4 text-right text-foreground font-medium text-sm font-mono">
                    {formatPrice(asset.latestPrice)}
                  </td>
                  <td className="py-4 text-right text-foreground text-sm">{asset.bestExchange}</td>
                  <td
                    className={`py-4 text-right font-semibold text-sm font-mono ${
                      asset.netProfitPercent >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {asset.available ? formatPercent(asset.netProfitPercent) : "N/A"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
