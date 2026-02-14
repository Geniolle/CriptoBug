import asyncio
import os
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from email.utils import parsedate_to_datetime
from typing import Any, Literal, Optional
from xml.etree import ElementTree

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


POSITIVE_NEWS_TERMS = (
    "surge",
    "rally",
    "jumps",
    "jump",
    "bullish",
    "approval",
    "adoption",
    "partnership",
    "inflow",
    "record high",
    "breakout",
    "gain",
    "up",
)

NEGATIVE_NEWS_TERMS = (
    "hack",
    "lawsuit",
    "ban",
    "drop",
    "crash",
    "bearish",
    "outflow",
    "exploit",
    "fraud",
    "bankrupt",
    "selloff",
    "down",
    "liquidation",
)


class Settings:
    hooks_base_url = os.getenv("HOOKS_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    request_timeout_seconds = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "20"))
    news_max_headlines = int(os.getenv("NEWS_MAX_HEADLINES", "8"))
    symbol_lookup_max_pairs = int(os.getenv("AI_SYMBOL_LOOKUP_MAX_PAIRS", "4000"))
    incoming_webhook_token = os.getenv("INCOMING_WEBHOOK_TOKEN")

    coingecko_base_url = os.getenv("COINGECKO_BASE_URL", "https://api.coingecko.com").rstrip("/")
    google_news_base_url = os.getenv("GOOGLE_NEWS_BASE_URL", "https://news.google.com").rstrip("/")
    fear_greed_api_url = os.getenv("FEAR_GREED_API_URL", "https://api.alternative.me").rstrip("/")


class DecisionRequest(BaseModel):
    exchange: str = Field(..., description="binance, bybit, okx, kraken, coinbase")
    symbol: str = Field(..., description="Ex.: BTCUSDT, BTC-USD, ETHUSDT")
    quote_asset: Optional[str] = Field(default=None, description="Ex.: USDT, USD")


class MarketNewsItem(BaseModel):
    titulo: str
    url: str
    fonte: str
    publicado_em: Optional[datetime] = None
    sentimento: Literal["positivo", "negativo", "neutro"]
    score_sentimento: float


class DecisionMetrics(BaseModel):
    valor_atual: str
    spread_percentual: str
    variacao_24h_percentual: Optional[float] = None
    variacao_7d_percentual: Optional[float] = None


class MacroSentiment(BaseModel):
    fear_greed_valor: Optional[int] = None
    fear_greed_classificacao: Optional[str] = None
    news_score_medio: float


class DecisionResponse(BaseModel):
    exchange: str
    symbol: str
    base_asset: str
    quote_asset: str
    generated_at: datetime
    acao: Literal["BUY", "SELL", "HOLD"]
    confianca: int = Field(..., ge=0, le=100)
    score: float
    resumo: str
    motivos: list[str]
    metricas: DecisionMetrics
    sentimento_macro: MacroSentiment
    noticias: list[MarketNewsItem]
    aviso: str = "Conteudo informativo e nao constitui recomendacao financeira."


app = FastAPI(title="Crypto IA Bot", version="1.0.0")
settings = Settings()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/decision/{exchange}/{symbol}", response_model=DecisionResponse)
async def decision_get(
    exchange: str,
    symbol: str,
    quote_asset: Optional[str] = None,
) -> DecisionResponse:
    return await analyze_symbol(exchange=exchange, symbol=symbol, quote_asset=quote_asset)


@app.post("/webhook/decision", response_model=DecisionResponse)
async def decision_webhook(
    body: DecisionRequest,
    x_webhook_token: Optional[str] = Header(default=None),
) -> DecisionResponse:
    if settings.incoming_webhook_token and x_webhook_token != settings.incoming_webhook_token:
        raise HTTPException(status_code=401, detail="Token de webhook invalido")

    return await analyze_symbol(
        exchange=body.exchange,
        symbol=body.symbol,
        quote_asset=body.quote_asset,
    )


async def analyze_symbol(exchange: str, symbol: str, quote_asset: Optional[str]) -> DecisionResponse:
    market = await fetch_market_from_hooks(exchange, symbol, quote_asset)
    coingecko_data, fear_greed_data, news = await gather_context(market["base_asset"])

    decision = build_decision(
        symbol=market["symbol"],
        spread_percentual=market["spread_percentual"],
        change_24h=(coingecko_data or {}).get("change_24h"),
        change_7d=(coingecko_data or {}).get("change_7d"),
        fear_greed_data=fear_greed_data,
        news=news,
    )

    return DecisionResponse(
        exchange=exchange.lower().strip(),
        symbol=market["symbol"],
        base_asset=market["base_asset"],
        quote_asset=market["quote_asset"],
        generated_at=datetime.now(timezone.utc),
        acao=decision["acao"],
        confianca=decision["confianca"],
        score=decision["score"],
        resumo=decision["resumo"],
        motivos=decision["motivos"],
        metricas=DecisionMetrics(
            valor_atual=market["valor_atual"],
            spread_percentual=market["spread_percentual"],
            variacao_24h_percentual=decision["variacao_24h_percentual"],
            variacao_7d_percentual=decision["variacao_7d_percentual"],
        ),
        sentimento_macro=MacroSentiment(
            fear_greed_valor=decision["fear_greed_valor"],
            fear_greed_classificacao=decision["fear_greed_classificacao"],
            news_score_medio=decision["news_score_medio"],
        ),
        noticias=news,
    )


async def fetch_market_from_hooks(exchange: str, symbol: str, quote_asset: Optional[str]) -> dict:
    timeout = httpx.Timeout(settings.request_timeout_seconds)
    normalized_exchange = exchange.strip().lower()
    symbol_query = normalize_symbol(symbol)

    params: dict[str, Any] = {"max_pairs": settings.symbol_lookup_max_pairs}
    if quote_asset:
        params["quote_asset"] = quote_asset.upper()

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(
            f"{settings.hooks_base_url}/markets/{normalized_exchange}",
            params=params,
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=400,
            detail=f"Falha ao consultar hooks em {normalized_exchange}: {response.status_code}",
        )

    payload = response.json()
    markets = payload.get("mercados", []) if isinstance(payload, dict) else []

    for market in markets:
        if normalize_symbol(str(market.get("symbol", ""))) == symbol_query:
            return market

    for market in markets:
        if normalize_symbol(str(market.get("base_asset", ""))) == symbol_query:
            if quote_asset and str(market.get("quote_asset", "")).upper() != quote_asset.upper():
                continue
            return market

    raise HTTPException(status_code=404, detail=f"Simbolo '{symbol}' nao encontrado em {normalized_exchange}")


async def gather_context(base_asset: str) -> tuple[Optional[dict], Optional[dict], list[MarketNewsItem]]:
    results = await asyncio.gather(
        fetch_coingecko_data(base_asset),
        fetch_fear_and_greed(),
        fetch_news(base_asset),
        return_exceptions=True,
    )

    coingecko_data = None if isinstance(results[0], Exception) else results[0]
    fear_greed_data = None if isinstance(results[1], Exception) else results[1]
    news = [] if isinstance(results[2], Exception) else results[2]
    return coingecko_data, fear_greed_data, news


async def fetch_coingecko_data(base_asset: str) -> Optional[dict]:
    timeout = httpx.Timeout(settings.request_timeout_seconds)
    symbol = base_asset.lower()

    async with httpx.AsyncClient(base_url=settings.coingecko_base_url, timeout=timeout) as client:
        search = await client.get("/api/v3/search", params={"query": symbol})
        search.raise_for_status()
        search_payload = search.json()
        coins = search_payload.get("coins", []) if isinstance(search_payload, dict) else []
        if not coins:
            return None

        selected = None
        for coin in coins:
            if str(coin.get("symbol", "")).lower() == symbol:
                selected = coin
                break
        if selected is None:
            selected = coins[0]

        coin_id = selected.get("id")
        if not coin_id:
            return None

        markets = await client.get(
            "/api/v3/coins/markets",
            params={
                "vs_currency": "usd",
                "ids": coin_id,
                "price_change_percentage": "24h,7d",
            },
        )
        markets.raise_for_status()
        market_payload = markets.json()
        if not isinstance(market_payload, list) or not market_payload:
            return None

        coin_data = market_payload[0]
        return {
            "change_24h": safe_float(coin_data.get("price_change_percentage_24h")),
            "change_7d": safe_float(coin_data.get("price_change_percentage_7d_in_currency")),
        }


async def fetch_fear_and_greed() -> Optional[dict]:
    timeout = httpx.Timeout(settings.request_timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(f"{settings.fear_greed_api_url}/fng/", params={"limit": 1})
        response.raise_for_status()

    payload = response.json()
    records = payload.get("data", []) if isinstance(payload, dict) else []
    if not records:
        return None

    record = records[0]
    value = record.get("value")
    if value is None:
        return None

    return {
        "value": int(value),
        "classification": record.get("value_classification"),
    }


async def fetch_news(base_asset: str) -> list[MarketNewsItem]:
    timeout = httpx.Timeout(settings.request_timeout_seconds)
    query = f'"{base_asset}" crypto market'

    async with httpx.AsyncClient(base_url=settings.google_news_base_url, timeout=timeout) as client:
        response = await client.get(
            "/rss/search",
            params={"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"},
        )
        response.raise_for_status()

    try:
        root = ElementTree.fromstring(response.text)
    except ElementTree.ParseError:
        return []

    items: list[MarketNewsItem] = []
    for entry in root.findall(".//item"):
        title = (entry.findtext("title") or "").strip()
        link = (entry.findtext("link") or "").strip()
        source = (entry.findtext("source") or "Google News").strip()

        if not title or not link:
            continue

        published_at = None
        published_raw = entry.findtext("pubDate")
        if published_raw:
            try:
                published_at = parsedate_to_datetime(published_raw).astimezone(timezone.utc)
            except Exception:
                published_at = None

        score = headline_sentiment_score(title)
        label: Literal["positivo", "negativo", "neutro"] = "neutro"
        if score > 0:
            label = "positivo"
        if score < 0:
            label = "negativo"

        items.append(
            MarketNewsItem(
                titulo=title,
                url=link,
                fonte=source,
                publicado_em=published_at,
                sentimento=label,
                score_sentimento=score,
            )
        )

        if len(items) >= settings.news_max_headlines:
            break

    return items


def build_decision(
    symbol: str,
    spread_percentual: str,
    change_24h: Optional[float],
    change_7d: Optional[float],
    fear_greed_data: Optional[dict],
    news: list[MarketNewsItem],
) -> dict:
    reasons: list[str] = []
    score = 0.0

    if change_24h is not None:
        if change_24h >= 2.5:
            score += 1.6
            reasons.append(f"Preco em alta nas ultimas 24h ({change_24h:.2f}%).")
        elif change_24h <= -2.5:
            score -= 1.6
            reasons.append(f"Preco em queda nas ultimas 24h ({change_24h:.2f}%).")

    if change_7d is not None:
        if change_7d >= 6:
            score += 1.0
            reasons.append(f"Tendencia semanal positiva ({change_7d:.2f}% em 7 dias).")
        elif change_7d <= -6:
            score -= 1.0
            reasons.append(f"Tendencia semanal negativa ({change_7d:.2f}% em 7 dias).")

    news_score = 0.0
    if news:
        news_score = sum(item.score_sentimento for item in news) / len(news)
        if news_score >= 0.2:
            score += 0.9
            reasons.append("Noticiario recente com vies positivo para a moeda.")
        elif news_score <= -0.2:
            score -= 0.9
            reasons.append("Noticiario recente com vies negativo para a moeda.")

    fear_greed_value = None
    fear_greed_classification = None
    if fear_greed_data:
        fear_greed_value = fear_greed_data.get("value")
        fear_greed_classification = fear_greed_data.get("classification")
        if fear_greed_value is not None:
            if fear_greed_value <= 25:
                score -= 0.6
                reasons.append("Mercado cripto global em medo extremo.")
            elif fear_greed_value >= 75:
                score += 0.4
                reasons.append("Mercado cripto global em ganancia.")

    spread = safe_float(spread_percentual) or 0.0
    if spread >= 0.35:
        score -= 0.8
        reasons.append(f"Spread alto ({spread:.4f}%), risco de execucao pior.")

    if not reasons:
        reasons.append("Sinais mistos no momento; melhor manter postura neutra.")

    acao: Literal["BUY", "SELL", "HOLD"] = "HOLD"
    if score >= 1.6:
        acao = "BUY"
    elif score <= -1.6:
        acao = "SELL"

    confianca = max(55, min(95, int(55 + abs(score) * 12)))
    resumo = build_summary(acao, symbol, reasons)

    return {
        "acao": acao,
        "confianca": confianca,
        "score": round(score, 4),
        "resumo": resumo,
        "motivos": reasons,
        "variacao_24h_percentual": change_24h,
        "variacao_7d_percentual": change_7d,
        "fear_greed_valor": fear_greed_value,
        "fear_greed_classificacao": fear_greed_classification,
        "news_score_medio": round(news_score, 4),
    }


def build_summary(action: str, symbol: str, reasons: list[str]) -> str:
    headline = "Manter posicao"
    if action == "BUY":
        headline = "Vies de compra"
    if action == "SELL":
        headline = "Vies de venda"

    return f"{headline} para {symbol}. Motivo principal: {reasons[0]}"


def normalize_symbol(symbol: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", symbol.upper())


def safe_float(value: Any) -> Optional[float]:
    try:
        return float(Decimal(str(value)))
    except (InvalidOperation, ValueError, TypeError):
        return None


def headline_sentiment_score(title: str) -> float:
    text = title.lower()
    score = 0.0

    for term in POSITIVE_NEWS_TERMS:
        if term in text:
            score += 1.0
    for term in NEGATIVE_NEWS_TERMS:
        if term in text:
            score -= 1.0

    return max(-2.0, min(2.0, score))
