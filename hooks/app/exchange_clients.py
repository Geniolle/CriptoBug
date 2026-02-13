import asyncio
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Protocol

import httpx

from app.binance_client import BinanceClient
from app.schemas import MarketSnapshotItem

SUPPORTED_EXCHANGES = ("binance", "bybit", "okx", "kraken", "coinbase")


def normalize_exchange(exchange: str) -> str:
    normalized = exchange.strip().lower()
    if normalized not in SUPPORTED_EXCHANGES:
        supported = ", ".join(SUPPORTED_EXCHANGES)
        raise ValueError(f"Exchange inválida '{exchange}'. Use: {supported}")
    return normalized


class SnapshotClient(Protocol):
    async def build_market_snapshot(
        self,
        quote_asset: Optional[str] = None,
        max_pairs: Optional[int] = None,
    ) -> List[MarketSnapshotItem]:
        ...


class BaseExchangeClient:
    def __init__(self, base_url: str, timeout_seconds: int = 20):
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.headers = {
            "User-Agent": "Mozilla/5.0 (compatible; market-webhook/1.0)",
            "Accept": "application/json",
        }

    def _create_client(self) -> httpx.AsyncClient:
        timeout = httpx.Timeout(self.timeout_seconds)
        return httpx.AsyncClient(base_url=self.base_url, timeout=timeout, headers=self.headers)

    async def _get(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        client: Optional[httpx.AsyncClient] = None,
    ) -> dict | list:
        if client is not None:
            response = await client.get(endpoint, params=params)
            response.raise_for_status()
            return response.json()

        async with self._create_client() as managed_client:
            response = await managed_client.get(endpoint, params=params)
            response.raise_for_status()
            return response.json()

    @staticmethod
    def _safe_decimal(value: object) -> Decimal:
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return Decimal("0")

    def _build_item(
        self,
        symbol: str,
        base_asset: str,
        quote_asset: str,
        last_price: object,
        bid_price: object,
        ask_price: object,
    ) -> MarketSnapshotItem:
        last = self._safe_decimal(last_price)
        bid = self._safe_decimal(bid_price)
        ask = self._safe_decimal(ask_price)
        spread = ask - bid
        spread_percent = Decimal("0")

        if bid > 0:
            spread_percent = (spread / bid) * Decimal("100")

        return MarketSnapshotItem(
            symbol=symbol,
            base_asset=base_asset,
            quote_asset=quote_asset,
            valor_atual=str(last),
            taxa_compra=str(ask),
            taxa_venda=str(bid),
            spread=str(spread),
            spread_percentual=str(spread_percent),
        )


class BybitClient(BaseExchangeClient):
    async def build_market_snapshot(
        self,
        quote_asset: Optional[str] = None,
        max_pairs: Optional[int] = None,
    ) -> List[MarketSnapshotItem]:
        quote_filter = quote_asset.upper() if quote_asset else None
        symbols: Dict[str, Dict[str, str]] = {}

        async with self._create_client() as client:
            cursor: Optional[str] = None
            visited_cursors = set()

            while True:
                params: Dict[str, Any] = {"category": "spot", "limit": 1000}
                if cursor:
                    params["cursor"] = cursor

                exchange_info = await self._get("/v5/market/instruments-info", params=params, client=client)
                if not isinstance(exchange_info, dict) or exchange_info.get("retCode") != 0:
                    raise ValueError("Resposta inválida de instruments-info da Bybit")

                result = exchange_info.get("result", {})
                for symbol_info in result.get("list", []):
                    if symbol_info.get("status") != "Trading":
                        continue

                    symbol_name = symbol_info.get("symbol")
                    base_coin = symbol_info.get("baseCoin", "")
                    quote_coin = symbol_info.get("quoteCoin", "")

                    if not symbol_name:
                        continue
                    if quote_filter and quote_coin != quote_filter:
                        continue

                    symbols[symbol_name] = {
                        "base_asset": base_coin,
                        "quote_asset": quote_coin,
                    }

                next_cursor = result.get("nextPageCursor")
                if not next_cursor or next_cursor in visited_cursors:
                    break

                visited_cursors.add(next_cursor)
                cursor = next_cursor

            ticker_data = await self._get("/v5/market/tickers", params={"category": "spot"}, client=client)
            if not isinstance(ticker_data, dict) or ticker_data.get("retCode") != 0:
                raise ValueError("Resposta inválida de tickers da Bybit")

        snapshot: List[MarketSnapshotItem] = []
        for ticker in ticker_data.get("result", {}).get("list", []):
            symbol_name = ticker.get("symbol")
            if not symbol_name or symbol_name not in symbols:
                continue

            symbol_meta = symbols[symbol_name]
            snapshot.append(
                self._build_item(
                    symbol=symbol_name,
                    base_asset=symbol_meta["base_asset"],
                    quote_asset=symbol_meta["quote_asset"],
                    last_price=ticker.get("lastPrice"),
                    bid_price=ticker.get("bid1Price"),
                    ask_price=ticker.get("ask1Price"),
                )
            )

        snapshot.sort(key=lambda item: item.symbol)
        if max_pairs:
            return snapshot[:max_pairs]
        return snapshot


class OkxClient(BaseExchangeClient):
    async def build_market_snapshot(
        self,
        quote_asset: Optional[str] = None,
        max_pairs: Optional[int] = None,
    ) -> List[MarketSnapshotItem]:
        quote_filter = quote_asset.upper() if quote_asset else None

        async with self._create_client() as client:
            instruments, tickers = await asyncio.gather(
                self._get("/api/v5/public/instruments", params={"instType": "SPOT"}, client=client),
                self._get("/api/v5/market/tickers", params={"instType": "SPOT"}, client=client),
            )

        if not isinstance(instruments, dict) or instruments.get("code") != "0":
            raise ValueError("Resposta inválida de instruments da OKX")
        if not isinstance(tickers, dict) or tickers.get("code") != "0":
            raise ValueError("Resposta inválida de tickers da OKX")

        symbols: Dict[str, Dict[str, str]] = {}
        for instrument in instruments.get("data", []):
            if instrument.get("state") != "live":
                continue

            symbol_name = instrument.get("instId")
            base_currency = instrument.get("baseCcy", "")
            quote_currency = instrument.get("quoteCcy", "")

            if not symbol_name:
                continue
            if quote_filter and quote_currency != quote_filter:
                continue

            symbols[symbol_name] = {
                "base_asset": base_currency,
                "quote_asset": quote_currency,
            }

        snapshot: List[MarketSnapshotItem] = []
        for ticker in tickers.get("data", []):
            symbol_name = ticker.get("instId")
            if not symbol_name or symbol_name not in symbols:
                continue

            symbol_meta = symbols[symbol_name]
            snapshot.append(
                self._build_item(
                    symbol=symbol_name,
                    base_asset=symbol_meta["base_asset"],
                    quote_asset=symbol_meta["quote_asset"],
                    last_price=ticker.get("last"),
                    bid_price=ticker.get("bidPx"),
                    ask_price=ticker.get("askPx"),
                )
            )

        snapshot.sort(key=lambda item: item.symbol)
        if max_pairs:
            return snapshot[:max_pairs]
        return snapshot


class KrakenClient(BaseExchangeClient):
    def __init__(self, base_url: str, timeout_seconds: int = 20, batch_size: int = 40):
        super().__init__(base_url=base_url, timeout_seconds=timeout_seconds)
        self.batch_size = batch_size

    async def build_market_snapshot(
        self,
        quote_asset: Optional[str] = None,
        max_pairs: Optional[int] = None,
    ) -> List[MarketSnapshotItem]:
        quote_filter = quote_asset.upper() if quote_asset else None

        async with self._create_client() as client:
            pairs_data = await self._get("/0/public/AssetPairs", client=client)
            if not isinstance(pairs_data, dict) or pairs_data.get("error"):
                raise ValueError("Resposta inválida de AssetPairs da Kraken")

            pairs: List[Dict[str, str]] = []
            for pair_key, pair_info in pairs_data.get("result", {}).items():
                if pair_info.get("status") != "online":
                    continue

                wsname = pair_info.get("wsname")
                if not wsname or "/" not in wsname:
                    continue

                base_asset, quote_asset_name = wsname.split("/", 1)
                if quote_filter and quote_asset_name.upper() != quote_filter:
                    continue

                pairs.append(
                    {
                        "pair_key": pair_key,
                        "symbol": wsname.replace("/", ""),
                        "base_asset": base_asset,
                        "quote_asset": quote_asset_name,
                    }
                )

            pairs.sort(key=lambda pair: pair["symbol"])
            if max_pairs:
                pairs = pairs[:max_pairs]

            ticker_by_pair: Dict[str, Dict[str, Any]] = {}
            for start in range(0, len(pairs), self.batch_size):
                batch = pairs[start : start + self.batch_size]
                if not batch:
                    continue

                pair_names = ",".join(pair["pair_key"] for pair in batch)
                ticker_data = await self._get(
                    "/0/public/Ticker",
                    params={"pair": pair_names},
                    client=client,
                )

                if not isinstance(ticker_data, dict) or ticker_data.get("error"):
                    raise ValueError("Resposta inválida de Ticker da Kraken")

                for ticker_key, ticker_value in ticker_data.get("result", {}).items():
                    ticker_by_pair[ticker_key] = ticker_value
                    ticker_by_pair[ticker_key.split(".")[0]] = ticker_value

        snapshot: List[MarketSnapshotItem] = []
        for pair in pairs:
            ticker = ticker_by_pair.get(pair["pair_key"])
            if not ticker:
                continue

            ask_data = ticker.get("a", [])
            bid_data = ticker.get("b", [])
            last_data = ticker.get("c", [])

            ask_price = ask_data[0] if ask_data else "0"
            bid_price = bid_data[0] if bid_data else "0"
            last_price = last_data[0] if last_data else "0"

            snapshot.append(
                self._build_item(
                    symbol=pair["symbol"],
                    base_asset=pair["base_asset"],
                    quote_asset=pair["quote_asset"],
                    last_price=last_price,
                    bid_price=bid_price,
                    ask_price=ask_price,
                )
            )

        snapshot.sort(key=lambda item: item.symbol)
        return snapshot


class CoinbaseClient(BaseExchangeClient):
    def __init__(self, base_url: str, timeout_seconds: int = 20, concurrency: int = 15):
        super().__init__(base_url=base_url, timeout_seconds=timeout_seconds)
        self.concurrency = concurrency

    async def build_market_snapshot(
        self,
        quote_asset: Optional[str] = None,
        max_pairs: Optional[int] = None,
    ) -> List[MarketSnapshotItem]:
        quote_filter = quote_asset.upper() if quote_asset else None

        async with self._create_client() as client:
            products_data = await self._get("/products", client=client)
            if not isinstance(products_data, list):
                raise ValueError("Resposta inválida de products da Coinbase")

            products: List[Dict[str, str]] = []
            for product in products_data:
                if product.get("status") != "online":
                    continue
                if bool(product.get("trading_disabled")):
                    continue

                symbol_name = product.get("id")
                base_asset = product.get("base_currency", "")
                quote_asset_name = product.get("quote_currency", "")

                if not symbol_name:
                    continue
                if quote_filter and quote_asset_name.upper() != quote_filter:
                    continue

                products.append(
                    {
                        "symbol": symbol_name,
                        "base_asset": base_asset,
                        "quote_asset": quote_asset_name,
                    }
                )

            products.sort(key=lambda product: product["symbol"])
            if max_pairs:
                products = products[:max_pairs]

            semaphore = asyncio.Semaphore(self.concurrency)

            async def fetch_ticker(product: Dict[str, str]) -> Optional[MarketSnapshotItem]:
                endpoint = f"/products/{product['symbol']}/ticker"

                for attempt in range(2):
                    async with semaphore:
                        response = await client.get(endpoint)

                    if response.status_code == 429 and attempt == 0:
                        await asyncio.sleep(0.25)
                        continue
                    if response.status_code >= 400:
                        return None

                    ticker = response.json()
                    return self._build_item(
                        symbol=product["symbol"],
                        base_asset=product["base_asset"],
                        quote_asset=product["quote_asset"],
                        last_price=ticker.get("price"),
                        bid_price=ticker.get("bid"),
                        ask_price=ticker.get("ask"),
                    )

                return None

            tasks = [fetch_ticker(product) for product in products]
            results = await asyncio.gather(*tasks)

        snapshot = [item for item in results if item is not None]
        snapshot.sort(key=lambda item: item.symbol)
        return snapshot


def create_exchange_client(exchange: str, settings: Any) -> SnapshotClient:
    normalized = normalize_exchange(exchange)

    if normalized == "binance":
        return BinanceClient(settings.binance_base_url, settings.request_timeout_seconds)
    if normalized == "bybit":
        return BybitClient(settings.bybit_base_url, settings.request_timeout_seconds)
    if normalized == "okx":
        return OkxClient(settings.okx_base_url, settings.request_timeout_seconds)
    if normalized == "kraken":
        return KrakenClient(
            settings.kraken_base_url,
            settings.request_timeout_seconds,
            settings.kraken_ticker_batch_size,
        )
    return CoinbaseClient(
        settings.coinbase_base_url,
        settings.request_timeout_seconds,
        settings.coinbase_ticker_concurrency,
    )
