import asyncio
import contextlib
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Path

from app.config import Settings, get_settings
from app.exchange_clients import SUPPORTED_EXCHANGES, create_exchange_client, normalize_exchange
from app.schemas import MarketSnapshotResponse, OutboundWebhookPayload, SnapshotParams

logger = logging.getLogger("market-webhook")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Crypto Multi-Exchange Webhook Snapshot", version="2.0.0")

_polling_task: Optional[asyncio.Task] = None


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
) -> MarketSnapshotResponse:
    resolved_quote_asset = quote_asset if quote_asset is not None else settings.default_quote_asset
    resolved_max_pairs = max_pairs if max_pairs is not None else settings.default_max_pairs

    client = create_exchange_client(exchange, settings)
    markets = await client.build_market_snapshot(
        quote_asset=resolved_quote_asset,
        max_pairs=resolved_max_pairs,
    )

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
    settings: Settings,
) -> MarketSnapshotResponse:
    normalized_exchange = _normalize_exchange_or_400(exchange)
    return await build_response(
        exchange=normalized_exchange,
        settings=settings,
        quote_asset=quote_asset,
        max_pairs=max_pairs,
    )


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
    settings: Settings = Depends(get_settings),
) -> MarketSnapshotResponse:
    return await get_markets_for_exchange(exchange, quote_asset, max_pairs, settings)


@app.get("/binance/markets", response_model=MarketSnapshotResponse)
async def get_binance_markets(
    quote_asset: Optional[str] = None,
    max_pairs: Optional[int] = None,
    settings: Settings = Depends(get_settings),
) -> MarketSnapshotResponse:
    return await get_markets_for_exchange("binance", quote_asset, max_pairs, settings)


@app.get("/bybit/markets", response_model=MarketSnapshotResponse)
async def get_bybit_markets(
    quote_asset: Optional[str] = None,
    max_pairs: Optional[int] = None,
    settings: Settings = Depends(get_settings),
) -> MarketSnapshotResponse:
    return await get_markets_for_exchange("bybit", quote_asset, max_pairs, settings)


@app.get("/okx/markets", response_model=MarketSnapshotResponse)
async def get_okx_markets(
    quote_asset: Optional[str] = None,
    max_pairs: Optional[int] = None,
    settings: Settings = Depends(get_settings),
) -> MarketSnapshotResponse:
    return await get_markets_for_exchange("okx", quote_asset, max_pairs, settings)


@app.get("/kraken/markets", response_model=MarketSnapshotResponse)
async def get_kraken_markets(
    quote_asset: Optional[str] = None,
    max_pairs: Optional[int] = None,
    settings: Settings = Depends(get_settings),
) -> MarketSnapshotResponse:
    return await get_markets_for_exchange("kraken", quote_asset, max_pairs, settings)


@app.get("/coinbase/markets", response_model=MarketSnapshotResponse)
async def get_coinbase_markets(
    quote_asset: Optional[str] = None,
    max_pairs: Optional[int] = None,
    settings: Settings = Depends(get_settings),
) -> MarketSnapshotResponse:
    return await get_markets_for_exchange("coinbase", quote_asset, max_pairs, settings)


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
