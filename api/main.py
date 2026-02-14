import io
import os
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import ccxt
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel


@dataclass(frozen=True)
class PeriodConfig:
    key: str
    label: str
    timeframe: str
    lookback: Optional[timedelta]
    max_points: int


PERIOD_CONFIGS: dict[str, PeriodConfig] = {
    "1minuto": PeriodConfig("1minuto", "1 Minuto", "1m", timedelta(hours=6), 360),
    "5minutos": PeriodConfig("5minutos", "5 Minutos", "5m", timedelta(days=2), 576),
    "30minutos": PeriodConfig("30minutos", "30 Minutos", "30m", timedelta(days=14), 672),
    "hr": PeriodConfig("hr", "1 Hora", "1h", timedelta(days=60), 1440),
    "dia": PeriodConfig("dia", "1 Dia", "1d", timedelta(days=365), 365),
    "semana": PeriodConfig("semana", "1 Semana", "1w", timedelta(days=365 * 5), 260),
    "mes": PeriodConfig("mes", "1 Mes", "1M", timedelta(days=365 * 10), 120),
    "ano": PeriodConfig("ano", "1 Ano", "1d", timedelta(days=365), 365),
    "5anos": PeriodConfig("5anos", "5 Anos", "1d", timedelta(days=365 * 5), 1825),
    "full": PeriodConfig("full", "Full", "1d", None, int(os.getenv("MAX_POINTS_FULL", "6000"))),
}

PERIOD_ALIASES: dict[str, str] = {
    "1m": "1minuto",
    "1min": "1minuto",
    "1minuto": "1minuto",
    "5m": "5minutos",
    "5min": "5minutos",
    "5minutos": "5minutos",
    "30m": "30minutos",
    "30min": "30minutos",
    "30minutos": "30minutos",
    "1h": "hr",
    "hr": "hr",
    "hora": "hr",
    "dia": "dia",
    "1d": "dia",
    "semana": "semana",
    "1w": "semana",
    "mes": "mes",
    "1mo": "mes",
    "1mth": "mes",
    "ano": "ano",
    "1y": "ano",
    "5anos": "5anos",
    "5y": "5anos",
    "full": "full",
    "all": "full",
}


class CandlePoint(BaseModel):
    timestamp: int
    datetime_utc: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class ChartDataResponse(BaseModel):
    exchange: str
    symbol: str
    period: str
    timeframe: str
    total_pontos: int
    candles: list[CandlePoint]


app = FastAPI(title="Crypto Chart API (CCXT)", version="1.0.0")

DEFAULT_EXCHANGE = os.getenv("DEFAULT_EXCHANGE", "binance").strip().lower()
DEFAULT_QUOTE = os.getenv("DEFAULT_QUOTE", "USDT").strip().upper()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/chart-data/{coin}", response_model=ChartDataResponse)
def get_chart_data(
    coin: str,
    period: str = Query(default="dia", description="1minuto, 5minutos, 30minutos, hr, dia, semana, mes, ano, 5anos, full"),
    exchange: str = Query(default=DEFAULT_EXCHANGE),
    quote: str = Query(default=DEFAULT_QUOTE),
) -> ChartDataResponse:
    config = resolve_period(period)
    symbol = to_exchange_symbol(coin, quote)
    market = fetch_market_ohlcv(exchange, symbol, config)
    candles = [to_candle_point(item) for item in market]

    return ChartDataResponse(
        exchange=exchange.lower().strip(),
        symbol=symbol,
        period=config.key,
        timeframe=config.timeframe,
        total_pontos=len(candles),
        candles=candles,
    )


@app.get("/chart/{coin}")
def get_chart_png(
    coin: str,
    period: str = Query(default="dia", description="1minuto, 5minutos, 30minutos, hr, dia, semana, mes, ano, 5anos, full"),
    exchange: str = Query(default=DEFAULT_EXCHANGE),
    quote: str = Query(default=DEFAULT_QUOTE),
    width: int = Query(default=1400, ge=600, le=2600),
    height: int = Query(default=700, ge=300, le=1600),
) -> Response:
    config = resolve_period(period)
    symbol = to_exchange_symbol(coin, quote)
    ohlcv = fetch_market_ohlcv(exchange, symbol, config)

    if not ohlcv:
        raise HTTPException(status_code=404, detail=f"Sem dados para {symbol} em {exchange}")

    png = build_chart_png(symbol=symbol, exchange=exchange, period=config, ohlcv=ohlcv, width=width, height=height)
    return Response(content=png, media_type="image/png")


def resolve_period(period_raw: str) -> PeriodConfig:
    normalized = normalize_key(period_raw)
    key = PERIOD_ALIASES.get(normalized)
    if not key:
        allowed = ", ".join(PERIOD_CONFIGS.keys())
        raise HTTPException(status_code=400, detail=f"Periodo invalido '{period_raw}'. Use: {allowed}")

    return PERIOD_CONFIGS[key]


def normalize_key(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    return text.replace(" ", "").replace("_", "").replace("-", "")


def to_exchange_symbol(coin: str, quote: str) -> str:
    clean_quote = quote.strip().upper()
    token = coin.strip().upper().replace("-", "/")

    if "/" in token:
        return token

    if token.endswith(clean_quote) and len(token) > len(clean_quote):
        base = token[: -len(clean_quote)]
        return f"{base}/{clean_quote}"

    return f"{token}/{clean_quote}"


def get_exchange(exchange_name: str) -> ccxt.Exchange:
    normalized = exchange_name.strip().lower()
    exchange_cls = getattr(ccxt, normalized, None)
    if exchange_cls is None:
        raise HTTPException(status_code=400, detail=f"Exchange '{exchange_name}' nao suportada pelo ccxt")

    exchange = exchange_cls({"enableRateLimit": True})
    if not exchange.has.get("fetchOHLCV"):
        raise HTTPException(status_code=400, detail=f"Exchange '{exchange_name}' nao suporta OHLCV")
    return exchange


def fetch_market_ohlcv(exchange_name: str, symbol: str, config: PeriodConfig) -> list[list[float]]:
    exchange = get_exchange(exchange_name)
    try:
        markets = exchange.load_markets()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao carregar markets da exchange: {exc}") from exc

    if symbol not in markets:
        raise HTTPException(status_code=404, detail=f"Par '{symbol}' nao encontrado em {exchange_name}")

    now_ms = exchange.milliseconds()
    since_ms = None
    if config.lookback is not None:
        since_dt = datetime.now(timezone.utc) - config.lookback
        since_ms = int(since_dt.timestamp() * 1000)

    try:
        data = fetch_ohlcv_paginated(
            exchange=exchange,
            symbol=symbol,
            timeframe=config.timeframe,
            since_ms=since_ms,
            max_points=config.max_points,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao buscar OHLCV: {exc}") from exc

    if config.lookback is None:
        # full: garante dados desde o inicio disponivel ate o limite maximo
        return data[-config.max_points :]

    # janela normal: remove candles muito antigos (se exchange retornou extra)
    if since_ms is not None:
        data = [c for c in data if c[0] >= since_ms]

    # fallback se nao houver nada na janela
    if not data:
        try:
            data = exchange.fetch_ohlcv(symbol, timeframe=config.timeframe, limit=min(300, config.max_points))
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Sem dados na janela solicitada: {exc}") from exc

    return data[-config.max_points :]


def fetch_ohlcv_paginated(
    exchange: ccxt.Exchange,
    symbol: str,
    timeframe: str,
    since_ms: Optional[int],
    max_points: int,
) -> list[list[float]]:
    limit = min(1000, max_points)

    if since_ms is None:
        return exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)

    timeframe_ms = exchange.parse_timeframe(timeframe) * 1000
    cursor = since_ms
    now_ms = exchange.milliseconds()
    all_rows: list[list[float]] = []

    while cursor < now_ms and len(all_rows) < max_points:
        request_limit = min(1000, max_points - len(all_rows))
        batch = exchange.fetch_ohlcv(symbol, timeframe=timeframe, since=cursor, limit=request_limit)

        if not batch:
            break

        if all_rows:
            last_ts = all_rows[-1][0]
            batch = [row for row in batch if row[0] > last_ts]
            if not batch:
                break

        all_rows.extend(batch)

        cursor = int(batch[-1][0] + timeframe_ms)
        if len(batch) < request_limit:
            break

    return all_rows[-max_points:]


def to_candle_point(row: list[float]) -> CandlePoint:
    ts = int(row[0])
    dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).isoformat()

    return CandlePoint(
        timestamp=ts,
        datetime_utc=dt,
        open=float(row[1]),
        high=float(row[2]),
        low=float(row[3]),
        close=float(row[4]),
        volume=float(row[5]),
    )


def build_chart_png(
    symbol: str,
    exchange: str,
    period: PeriodConfig,
    ohlcv: list[list[float]],
    width: int,
    height: int,
) -> bytes:
    closes = [float(row[4]) for row in ohlcv]
    min_price = min(closes)
    max_price = max(closes)
    price_range = max(max_price - min_price, 1e-9)

    img = Image.new("RGB", (width, height), "#f8fafc")
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()

    margin_left = 90
    margin_right = 40
    margin_top = 70
    margin_bottom = 80

    chart_left = margin_left
    chart_top = margin_top
    chart_right = width - margin_right
    chart_bottom = height - margin_bottom
    chart_w = max(1, chart_right - chart_left)
    chart_h = max(1, chart_bottom - chart_top)

    draw.rectangle([(chart_left, chart_top), (chart_right, chart_bottom)], outline="#cbd5e1", width=2)

    points: list[tuple[float, float]] = []
    total = len(closes)
    for idx, price in enumerate(closes):
        x = chart_left + (idx / max(1, total - 1)) * chart_w
        y = chart_bottom - ((price - min_price) / price_range) * chart_h
        points.append((x, y))

    if len(points) > 1:
        fill_poly = points + [(points[-1][0], chart_bottom), (points[0][0], chart_bottom)]
        draw.polygon(fill_poly, fill="#bfdbfe")
        draw.line(points, fill="#1d4ed8", width=3)
    elif points:
        p = points[0]
        draw.ellipse((p[0] - 3, p[1] - 3, p[0] + 3, p[1] + 3), fill="#1d4ed8")

    title = f"{symbol} | {exchange.upper()} | {period.label}"
    draw.text((margin_left, 20), title, fill="#0f172a", font=font)
    draw.text((margin_left, 40), f"Pontos: {total} | Timeframe: {period.timeframe}", fill="#334155", font=font)

    last_price = closes[-1]
    draw.text((margin_left, chart_bottom + 30), f"Inicio: {format_ts(ohlcv[0][0], period.timeframe)}", fill="#334155", font=font)
    draw.text((chart_right - 210, chart_bottom + 30), f"Fim: {format_ts(ohlcv[-1][0], period.timeframe)}", fill="#334155", font=font)
    draw.text((10, chart_top), f"Max\n{max_price:.4f}", fill="#334155", font=font)
    draw.text((10, chart_bottom - 20), f"Min\n{min_price:.4f}", fill="#334155", font=font)
    draw.text((chart_right - 180, chart_top + 10), f"Ultimo\n{last_price:.4f}", fill="#0f172a", font=font)

    out = io.BytesIO()
    img.save(out, format="PNG")
    out.seek(0)
    return out.read()


def format_ts(timestamp_ms: float, timeframe: str) -> str:
    dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
    if timeframe in ("1m", "5m", "30m", "1h"):
        return dt.strftime("%d/%m/%Y %H:%M UTC")
    return dt.strftime("%d/%m/%Y")
