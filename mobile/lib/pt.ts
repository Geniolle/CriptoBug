export function labelSidePt(side: string): string {
  if (side === 'BUY') return 'COMPRAR';
  if (side === 'SELL') return 'VENDER';
  if (side === 'HOLD') return 'MANTER';
  return side;
}

export function labelSideShortPt(side: string): string {
  if (side === 'BUY') return 'COMPRA';
  if (side === 'SELL') return 'VENDA';
  if (side === 'HOLD') return 'MANTER';
  return side;
}

export function labelStatusPt(status: string): string {
  if (status === 'PENDING') return 'PENDENTE';
  if (status === 'EXECUTED') return 'EXECUTADA';
  if (status === 'DRY_RUN') return 'SIMULACAO';
  if (status === 'FAILED') return 'FALHOU';
  return status;
}

export function labelModePt(mode: string): string {
  if (mode === 'REAL') return 'REAL';
  if (mode === 'DRY_RUN') return 'SIMULACAO';
  return mode;
}

export function labelOrderTypePt(orderType: string): string {
  if (orderType === 'market') return 'mercado';
  if (orderType === 'limit') return 'limite';
  return orderType;
}

export function formatDateTimePt(value: string): string {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString('pt-BR');
}

