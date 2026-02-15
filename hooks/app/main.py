import asyncio
import contextlib
import logging
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Dict, Optional

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Path

from app.config import Settings, get_settings
from app.exchange_clients import SUPPORTED_EXCHANGES, create_exchange_client, normalize_exchange
from app.schemas import MarketSnapshotResponse, OutboundWebhookPayload, SnapshotParams
from app.top_assets import filter_top_assets

logger = logging.getLogger("market-webhook")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Crypto Multi-Exchange Webhook Snapshot", version="2.0.0")

_polling_task: Optional[asyncio.Task] = None


@dataclass
class SnapshotCacheEntry:
    created_at: float
    expires_at: float
    value: MarketSnapshotResponse


_snapshot_cache: Dict[str, SnapshotCacheEntry] = {}
_snapshot_inflight: Dict[str, asyncio.Task] = {}


def _snapshot_cache_key(
    exchange: str,
    quote_asset: Optional[str],
    max_pairs: Optional[int],
    top_assets_only: Optional[bool],
) -> str:
    return f"{exchange}|{(quote_asset or '').upper()}|{max_pairs or ''}|{str(bool(top_assets_only)).lower()}"


async def _refresh_snapshot(
    *,
    key: str,
    exchange: str,
    settings: Settings,
    quote_asset: Optional[str],
    max_pairs: Optional[int],
    top_assets_only: Optional[bool],
) -> MarketSnapshotResponse:
    response = await build_response(
        exchange=exchange,
        settings=settings,
        quote_asset=quote_asset,
        max_pairs=max_pairs,
        top_assets_only=top_assets_only,
    )

    now = asyncio.get_running_loop().time()
    ttl = max(1, int(settings.snapshot_cache_ttl_seconds))
    _snapshot_cache[key] = SnapshotCacheEntry(
        created_at=now,
        expires_at=now + ttl,
        value=response,
    )
    return response


def _normalize_exchange_or_400(exchange: str) -> str:
    try:
        return normalize_exchange(exchange)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def build_response(
    exchange: str,
    settings: Settings,
    quote_asset: Optional[str],
    max_pairs: Optional[int],
    top_assets_only: Optional[bool],
) -> MarketSnapshotResponse:
    resolved_quote_asset = quote_asset if quote_asset is not None else settings.default_quote_asset
    resolved_max_pairs = max_pairs if max_pairs is not None else settings.default_max_pairs
    resolved_top_assets_only = (
        top_assets_only if top_assets_only is not None else settings.default_top_assets_only
    )
    client_max_pairs = None if resolved_top_assets_only else resolved_max_pairs

    client = create_exchange_client(exchange, settings)
    markets = await client.build_market_snapshot(
        quote_asset=resolved_quote_asset,
        max_pairs=client_max_pairs,
    )
    if resolved_top_assets_only:
        markets = filter_top_assets(markets)
        if resolved_max_pairs:
            markets = markets[:resolved_max_pairs]

    return MarketSnapshotResponse(
        exchange=exchange,
        generated_at=datetime.now(timezone.utc),
        quote_asset_filtrado=resolved_quote_asset,
        total_pares=len(markets),
        mercados=markets,
    )


async def get_markets_for_exchange(
    exchange: str,
    quote_asset: Optional[str],
    max_pairs: Optional[int],
    top_assets_only: Optional[bool],
    settings: Settings,
) -> MarketSnapshotResponse:
    normalized_exchange = _normalize_exchange_or_400(exchange)
    key = _snapshot_cache_key(
        exchange=normalized_exchange,
        quote_asset=quote_asset,
        max_pairs=max_pairs,
        top_assets_only=top_assets_only,
    )

    now = asyncio.get_running_loop().time()
    entry = _snapshot_cache.get(key)
    if entry and entry.expires_at > now:
        return entry.value

    # Serve stale-while-revalidate to keep the UI responsive.
    swr = max(0, int(settings.snapshot_cache_swr_seconds))
    if entry and (now - entry.created_at) <= swr:
        if key not in _snapshot_inflight:
            task = asyncio.create_task(
                _refresh_snapshot(
                    key=key,
                    exchange=normalized_exchange,
                    settings=settings,
                    quote_asset=quote_asset,
                    max_pairs=max_pairs,
                    top_assets_only=top_assets_only,
                )
            )

            def _done(t: asyncio.Task) -> None:
                _snapshot_inflight.pop(key, None)
                with contextlib.suppress(Exception):
                    t.result()

            task.add_done_callback(_done)
            _snapshot_inflight[key] = task

        return entry.value

    # No cache (or too old): block until we refresh.
    if key in _snapshot_inflight:
        return await _snapshot_inflight[key]

    task = asyncio.create_task(
        _refresh_snapshot(
            key=key,
            exchange=normalized_exchange,
            settings=settings,
            quote_asset=quote_asset,
            max_pairs=max_pairs,
            top_assets_only=top_assets_only,
        )
    )
    _snapshot_inflight[key] = task
    try:
        return await task
    finally:
        _snapshot_inflight.pop(key, None)


@app.get("/health")
def healthcheck() -> dict:
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/exchanges")
def list_exchanges() -> dict:
    return {"exchanges": list(SUPPORTED_EXCHANGES)}


@app.get("/markets/{exchange}", response_model=MarketSnapshotResponse)
async def get_markets(
    exchange: str = Path(..., description="binance, bybit, okx, kraken, coinbase"),
    quote_asset: Optional[str] = None,
    max_pairs: Optional[int] = None,
    top_assets_only: Optional[bool] = None,
    settings: Settings = Depends(get_settings),
) -> MarketSnapshotResponse:
    return await get_markets_for_exchange(exchange, quote_asset, max_pairs, top_assets_only, settings)


@app.get("/binance/markets", response_model=MarketSnapshotResponse)
async def get_binance_markets(
    quote_asset: Optional[str] = None,
    max_pairs: Optional[int] = None,
    top_assets_only: Optional[bool] = None,
    settings: Settings = Depends(get_settings),
) -> MarketSnapshotResponse:
    return await get_markets_for_exchange("binance", quote_asset, max_pairs, top_assets_only, settings)


@app.get("/bybit/markets", response_model=MarketSnapshotResponse)
async def get_bybit_markets(
    quote_asset: Optional[str] = None,
    max_pairs: Optional[int] = None,
    top_assets_only: Optional[bool] = None,
    settings: Settings = Depends(get_settings),
) -> MarketSnapshotResponse:
    return await get_markets_for_exchange("bybit", quote_asset, max_pairs, top_assets_only, settings)


@app.get("/okx/markets", response_model=MarketSnapshotResponse)
async def get_okx_markets(
    quote_asset: Optional[str] = None,
    max_pairs: Optional[int] = None,
    top_assets_only: Optional[bool] = None,
    settings: Settings = Depends(get_settings),
) -> MarketSnapshotResponse:
    return await get_markets_for_exchange("okx", quote_asset, max_pairs, top_assets_only, settings)


@app.get("/kraken/markets", response_model=MarketSnapshotResponse)
async def get_kraken_markets(
    quote_asset: Optional[str] = None,
    max_pairs: Optional[int] = None,
    top_assets_only: Optional[bool] = None,
    settings: Settings = Depends(get_settings),
) -> MarketSnapshotResponse:
    return await get_markets_for_exchange("kraken", quote_asset, max_pairs, top_assets_only, settings)


@app.get("/coinbase/markets", response_model=MarketSnapshotResponse)
async def get_coinbase_markets(
    quote_asset: Optional[str] = None,
    max_pairs: Optional[int] = None,
    top_assets_only: Optional[bool] = None,
    settings: Settings = Depends(get_settings),
) -> MarketSnapshotResponse:
    return await get_markets_for_exchange("coinbase", quote_asset, max_pairs, top_assets_only, settings)


@app.post("/webhooks/{exchange}", response_model=MarketSnapshotResponse)
async def receive_webhook(
    exchange: str,
    params: SnapshotParams,
    x_webhook_token: Optional[str] = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> MarketSnapshotResponse:
    if settings.incoming_webhook_token and x_webhook_token != settings.incoming_webhook_token:
        raise HTTPException(status_code=401, detail="Token de webhook inválido")

    return await get_markets_for_exchange(
        exchange=exchange,
        quote_asset=params.quote_asset,
        max_pairs=params.max_pairs,
        top_assets_only=params.top_assets_only,
        settings=settings,
    )


async def outbound_webhook_loop(settings: Settings) -> None:
    if not settings.outbound_webhook_url:
        logger.info("Outbound webhook desabilitado (OUTBOUND_WEBHOOK_URL não definido)")
        return

    try:
        normalized_exchange = normalize_exchange(settings.outbound_exchange)
    except ValueError as exc:
        logger.error("OUTBOUND_EXCHANGE inválida: %s", exc)
        return

    logger.info(
        "Outbound webhook habilitado. exchange=%s destino=%s intervalo=%ss",
        normalized_exchange,
        settings.outbound_webhook_url,
        settings.poll_interval_seconds,
    )

    while True:
        try:
            response = await build_response(
                exchange=normalized_exchange,
                settings=settings,
                quote_asset=settings.default_quote_asset,
                max_pairs=settings.default_max_pairs,
                top_assets_only=settings.default_top_assets_only,
            )

            payload = OutboundWebhookPayload(
                event=f"{normalized_exchange}.market.snapshot",
                exchange=normalized_exchange,
                generated_at=response.generated_at,
                total_pares=response.total_pares,
                quote_asset_filtrado=response.quote_asset_filtrado,
                mercados=response.mercados,
            )

            timeout = httpx.Timeout(settings.outbound_webhook_timeout_seconds)
            async with httpx.AsyncClient(timeout=timeout) as http_client:
                webhook_response = await http_client.post(
                    settings.outbound_webhook_url,
                    json=payload.model_dump(mode="json"),
                )
                webhook_response.raise_for_status()

            logger.info(
                "Snapshot enviado com sucesso: exchange=%s pares=%s",
                normalized_exchange,
                response.total_pares,
            )
        except Exception as exc:  # pragma: no cover
            logger.exception("Falha no envio de snapshot para webhook externo: %s", exc)

        await asyncio.sleep(settings.poll_interval_seconds)


@app.on_event("startup")
async def on_startup() -> None:
    global _polling_task
    settings = get_settings()
    _polling_task = asyncio.create_task(outbound_webhook_loop(settings))


@app.on_event("shutdown")
async def on_shutdown() -> None:
    global _polling_task
    if _polling_task:
        _polling_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _polling_task
