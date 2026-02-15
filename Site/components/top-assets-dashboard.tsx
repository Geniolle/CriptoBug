"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { AssetModal } from "@/components/asset-modal"
import { AssetTable } from "@/components/asset-table"
import { PortfolioChart } from "@/components/portfolio-chart"
import type { RankedAsset } from "@/lib/types"

interface TopAssetsResponse {
  generatedAt: string
  total: number
  assets: RankedAsset[]
}

const DEFAULT_PERIOD = "dia"
const TOP_ASSETS_LOCAL_CACHE_KEY = "cryptobug:top-assets-cache:v1"

export function TopAssetsDashboard() {
  const [assets, setAssets] = useState<RankedAsset[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [modalAsset, setModalAsset] = useState<RankedAsset | null>(null)
  const [period, setPeriod] = useState(DEFAULT_PERIOD)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  )

  const loadTopAssets = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent)
    if (!silent) setLoading(true)
    setRefreshing(silent)
    setError(null)

    try {
      const response = await fetch("/api/top-assets", { cache: "no-store" })
      const payload = (await response.json()) as TopAssetsResponse

      if (!response.ok) {
        throw new Error("Falha ao carregar Top Assets")
      }

      const ranked = Array.isArray(payload.assets) ? payload.assets : []
      setAssets(ranked)
      setGeneratedAt(payload.generatedAt ?? null)

      try {
        localStorage.setItem(TOP_ASSETS_LOCAL_CACHE_KEY, JSON.stringify({ generatedAt: payload.generatedAt, assets: ranked }))
      } catch {
        // ignore
      }

      setSelectedAssetId((currentId) => {
        if (currentId && ranked.some((item) => item.id === currentId)) {
          return currentId
        }
        const top = ranked.find((item) => item.available) ?? ranked[0]
        return top?.id ?? null
      })
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Erro desconhecido")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // Show cached Top Assets immediately (best-effort), then refresh in background.
    try {
      const raw = localStorage.getItem(TOP_ASSETS_LOCAL_CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { generatedAt?: string; assets?: RankedAsset[] }
        if (Array.isArray(parsed.assets) && parsed.assets.length > 0) {
          const cachedAssets = parsed.assets
          setAssets(cachedAssets)
          setGeneratedAt(typeof parsed.generatedAt === "string" ? parsed.generatedAt : null)
          setSelectedAssetId((currentId) => currentId ?? cachedAssets[0]?.id ?? null)
          setLoading(false)
          void loadTopAssets({ silent: true })
          return
        }
      }
    } catch {
      // ignore cache
    }

    loadTopAssets()
  }, [loadTopAssets])

  const handleAssetClick = (asset: RankedAsset) => {
    if (selectedAssetId === asset.id) {
      if (asset.available && asset.bestExchangeKey) {
        setModalAsset(asset)
      }
      return
    }

    setSelectedAssetId(asset.id)
    setModalAsset(null)
  }

  return (
    <>
      <div className="px-6 pt-1 pb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Ranking calculado pelos hooks com lucro conservador (custos reais + buffer de seguranca).
          {generatedAt ? ` Atualizado em ${new Date(generatedAt).toLocaleString("pt-BR")}.` : ""}
          {refreshing ? " Atualizando..." : ""}
        </div>
        <button
          onClick={() => loadTopAssets()}
          className="px-3 py-1.5 rounded-md border border-primary/35 bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
          type="button"
        >
          Recarregar Top Assets
        </button>
      </div>

      {error ? (
        <div className="px-6 pb-3">
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
        </div>
      ) : null}

      <div className="px-6 py-2 grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <PortfolioChart asset={selectedAsset} period={period} onChangePeriod={setPeriod} />
        </div>
        <div className="lg:col-span-2 lg:h-[580px]">
          {loading && assets.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 h-full text-sm text-muted-foreground overflow-hidden">
              Carregando Top 30 com dados do hooks...
            </div>
          ) : (
            <AssetTable assets={assets} selectedAssetId={selectedAssetId} onSelect={handleAssetClick} />
          )}
        </div>
      </div>

      <AssetModal asset={modalAsset} onClose={() => setModalAsset(null)} />
    </>
  )
}
