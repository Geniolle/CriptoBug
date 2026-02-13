import asyncio
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional

import httpx

from app.schemas import MarketSnapshotItem


class BinanceClient:
    def __init__(self, base_url: str, timeout_seconds: int = 20):
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def _get(self, endpoint: str) -> dict | list:
        timeout = httpx.Timeout(self.timeout_seconds)
        async with httpx.AsyncClient(base_url=self.base_url, timeout=timeout) as client:
            response = await client.get(endpoint)
            response.raise_for_status()
            return response.json()

    async def get_exchange_info(self) -> dict:
        data = await self._get("/api/v3/exchangeInfo")
        if not isinstance(data, dict):
            raise ValueError("Resposta inválida de exchangeInfo")
        return data

    async def get_ticker_24h(self) -> list:
        data = await self._get("/api/v3/ticker/24hr")
        if not isinstance(data, list):
            raise ValueError("Resposta inválida de ticker/24hr")
        return data

    async def build_market_snapshot(
        self,
        quote_asset: Optional[str] = None,
        max_pairs: Optional[int] = None,
    ) -> List[MarketSnapshotItem]:
        exchange_info, ticker_24h = await asyncio.gather(
            self.get_exchange_info(),
            self.get_ticker_24h(),
        )

        quote_filter = quote_asset.upper() if quote_asset else None

        symbols: Dict[str, dict] = {}
        for symbol_info in exchange_info.get("symbols", []):
            if symbol_info.get("status") != "TRADING":
                continue
            symbol_name = symbol_info.get("symbol")
            if not symbol_name:
                continue
            if quote_filter and symbol_info.get("quoteAsset") != quote_filter:
                continue
            symbols[symbol_name] = {
                "base_asset": symbol_info.get("baseAsset", ""),
                "quote_asset": symbol_info.get("quoteAsset", ""),
            }

        snapshot: List[MarketSnapshotItem] = []

        for ticker in ticker_24h:
            symbol_name = ticker.get("symbol")
            if not symbol_name or symbol_name not in symbols:
                continue

            last_price = self._safe_decimal(ticker.get("lastPrice"))
            bid_price = self._safe_decimal(ticker.get("bidPrice"))
            ask_price = self._safe_decimal(ticker.get("askPrice"))

            spread = ask_price - bid_price
            spread_percent = Decimal("0")
            if bid_price > 0:
                spread_percent = (spread / bid_price) * Decimal("100")

            symbol_meta = symbols[symbol_name]
            snapshot.append(
                MarketSnapshotItem(
                    symbol=symbol_name,
                    base_asset=symbol_meta["base_asset"],
                    quote_asset=symbol_meta["quote_asset"],
                    valor_atual=str(last_price),
                    taxa_compra=str(ask_price),
                    taxa_venda=str(bid_price),
                    spread=str(spread),
                    spread_percentual=str(spread_percent),
                )
            )

        snapshot.sort(key=lambda item: item.symbol)
        if max_pairs:
            return snapshot[:max_pairs]
        return snapshot

    @staticmethod
    def _safe_decimal(value: object) -> Decimal:
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return Decimal("0")
