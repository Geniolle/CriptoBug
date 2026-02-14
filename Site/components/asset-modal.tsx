"use client"

import { useEffect, useRef, useState } from "react"
import { gsap } from "gsap"

import type { DecisionPayload, RankedAsset } from "@/lib/types"

interface AssetModalProps {
  asset: RankedAsset | null
  onClose: () => void
}

export function AssetModal({ asset, onClose }: AssetModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [decision, setDecision] = useState<DecisionPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!asset) return

    const controller = new AbortController()

    async function loadDecision() {
      setLoading(true)
      setError(null)
      setDecision(null)

      try {
        const response = await fetch(
          `/api/decision?exchange=${encodeURIComponent(asset.bestExchangeKey)}&symbol=${encodeURIComponent(asset.symbol)}&quote_asset=${encodeURIComponent(asset.quoteAsset)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        )

        const payload = await response.json().catch(() => null)

        if (!response.ok) {
          const detail = payload?.detail ? JSON.stringify(payload.detail) : payload?.error ?? "Erro ao consultar IA"
          throw new Error(detail)
        }

        setDecision(payload as DecisionPayload)
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") return
        setError(fetchError instanceof Error ? fetchError.message : "Erro desconhecido")
      } finally {
        setLoading(false)
      }
    }

    loadDecision()

    return () => controller.abort()
  }, [asset])

  useEffect(() => {
    if (!asset) return

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleEsc)
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", handleEsc)
      document.body.style.overflow = ""
    }
  }, [asset, onClose])

  useEffect(() => {
    if (!asset || !panelRef.current) return
    gsap.fromTo(panelRef.current, { opacity: 0, y: 16, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "power2.out" })
  }, [asset])

  if (!asset) return null

  const action = decision?.acao ?? "HOLD"
  const actionColor = action === "BUY" ? "text-emerald-400" : action === "SELL" ? "text-rose-400" : "text-amber-300"

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(event) => {
        if (event.target === overlayRef.current) onClose()
      }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div ref={panelRef} className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-foreground font-bold text-xl">IA - {asset.name} ({asset.symbol})</h2>
            <p className="text-muted-foreground text-xs mt-1">Corretora analisada: {asset.bestExchange} | Par: {asset.marketSymbol}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Fechar"
          >
            X
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? <p className="text-muted-foreground text-sm">Consultando IA para decisao de compra/venda...</p> : null}

          {error ? (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
              Falha ao consultar IA: {error}
            </div>
          ) : null}

          {decision ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl bg-secondary/50 p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Acao</div>
                  <div className={`text-xl font-bold mt-1 ${actionColor}`}>{decision.acao}</div>
                </div>
                <div className="rounded-xl bg-secondary/50 p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Confianca</div>
                  <div className="text-xl font-bold mt-1 text-foreground">{decision.confianca}%</div>
                </div>
                <div className="rounded-xl bg-secondary/50 p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Score</div>
                  <div className="text-xl font-bold mt-1 text-foreground">{decision.score.toFixed(3)}</div>
                </div>
              </div>

              <div className="rounded-xl bg-secondary/30 p-4">
                <h3 className="text-foreground font-semibold mb-2">Resumo da IA</h3>
                <p className="text-sm text-secondary-foreground leading-relaxed">{decision.resumo}</p>
              </div>

              <div className="rounded-xl bg-secondary/30 p-4">
                <h3 className="text-foreground font-semibold mb-2">Motivos</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-secondary-foreground">
                  {decision.motivos?.map((reason, idx) => (
                    <li key={`${decision.symbol}-${idx}`}>{reason}</li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-muted-foreground">Resultado informativo. Sempre valide risco e custos antes de operar.</p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
