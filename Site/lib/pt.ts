export type TradeSide = "BUY" | "SELL" | "HOLD"

export function labelSidePt(side: string): string {
  if (side === "BUY") return "COMPRAR"
  if (side === "SELL") return "VENDER"
  if (side === "HOLD") return "MANTER"
  return side
}

export function labelSideShortPt(side: string): string {
  if (side === "BUY") return "COMPRA"
  if (side === "SELL") return "VENDA"
  if (side === "HOLD") return "MANTER"
  return side
}

export function labelStatusPt(status: string): string {
  if (status === "PENDING") return "PENDENTE"
  if (status === "EXECUTED") return "EXECUTADA"
  if (status === "FAILED") return "FALHOU"
  if (status === "DRY_RUN") return "SIMULACAO"
  return status
}

export function labelModePt(mode: string): string {
  if (mode === "REAL") return "REAL"
  if (mode === "DRY_RUN") return "SIMULACAO"
  return mode
}

export function formatUsdPt(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-"
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value)
}

export function formatPercentPt(value: number, fractionDigits = 3): string {
  if (!Number.isFinite(value)) return "-"
  const sign = value > 0 ? "+" : ""
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
  return `${sign}${formatted}%`
}

