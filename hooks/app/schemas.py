from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class SnapshotParams(BaseModel):
    quote_asset: Optional[str] = Field(default=None, description="Ex.: USDT, BTC")
    max_pairs: Optional[int] = Field(default=None, ge=1, description="Limite de pares retornados")
    top_assets_only: Optional[bool] = Field(
        default=None,
        description="Se true, filtra apenas Top 30 moedas configuradas",
    )


class MarketSnapshotItem(BaseModel):
    symbol: str
    base_asset: str
    quote_asset: str
    valor_atual: str
    taxa_compra: str
    taxa_venda: str
    spread: str
    spread_percentual: str


class MarketSnapshotResponse(BaseModel):
    exchange: str
    generated_at: datetime
    quote_asset_filtrado: Optional[str]
    total_pares: int
    mercados: List[MarketSnapshotItem]


class OutboundWebhookPayload(BaseModel):
    event: str
    exchange: str
    generated_at: datetime
    total_pares: int
    quote_asset_filtrado: Optional[str]
    mercados: List[MarketSnapshotItem]
