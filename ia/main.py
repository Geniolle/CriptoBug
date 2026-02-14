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
    "upgrade",
    "outperform",
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
    "downgrade",
    "liquidation",
)

TRUSTED_SOURCE_TARGETS: tuple[dict[str, str], ...] = (
    {"nome": "Glassnode", "dominio": "glassnode.com", "grupo": "onchain"},
    {"nome": "CryptoQuant", "dominio": "cryptoquant.com", "grupo": "onchain"},
    {"nome": "IntoTheBlock", "dominio": "intotheblock.com", "grupo": "onchain"},
    {"nome": "Santiment", "dominio": "santiment.net", "grupo": "onchain"},
    {"nome": "Nansen", "dominio": "nansen.ai", "grupo": "onchain"},
    {"nome": "Standard Chartered", "dominio": "sc.com", "grupo": "institucional"},
    {"nome": "JPMorgan", "dominio": "jpmorgan.com", "grupo": "institucional"},
    {"nome": "Goldman Sachs", "dominio": "goldmansachs.com", "grupo": "institucional"},
    {
        "nome": "Fidelity Digital Assets",
        "dominio": "fidelitydigitalassets.com",
        "grupo": "institucional",
    },
    {"nome": "ARK Invest", "dominio": "ark-invest.com", "grupo": "institucional"},
    {"nome": "Messari", "dominio": "messari.io", "grupo": "research"},
    {"nome": "CoinShares", "dominio": "coinshares.com", "grupo": "research"},
    {"nome": "Delphi Digital", "dominio": "delphidigital.io", "grupo": "research"},
)

SOURCE_GROUP_WEIGHT = {
    "onchain": 1.2,
    "research": 1.1,
    "institucional": 1.0,
}


class Settings:
    hooks_base_url = os.getenv("HOOKS_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    request_timeout_seconds = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "20"))
    news_max_headlines = int(os.getenv("NEWS_MAX_HEADLINES", "30"))
    news_max_per_source = int(os.getenv("NEWS_MAX_PER_SOURCE", "3"))
    news_fetch_concurrency = int(os.getenv("NEWS_FETCH_CONCURRENCY", "6"))
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
    dominio: str
    grupo: Literal["onchain", "institucional", "research"]
    publicado_em: Optional[datetime] = None
    sentimento: Literal["positivo", "negativo", "neutro"]
    score_sentimento: float


class SourceCoverageItem(BaseModel):
    fonte: str
    dominio: str
    grupo: Literal["onchain", "institucional", "research"]
    status: Literal["ok", "sem_resultado", "erro"]
    noticias_encontradas: int


class DecisionMetrics(BaseModel):
    valor_atual: str
    spread_percentual: str
    variacao_24h_percentual: Optional[float] = None
    variacao_7d_percentual: Optional[float] = None
    variacao_30d_percentual: Optional[float] = None
    variacao_1y_percentual: Optional[float] = None


class MacroSentiment(BaseModel):
    fear_greed_valor: Optional[int] = None
    fear_greed_classificacao: Optional[str] = None
    news_score_medio: float
    fontes_cobertas: int
    fontes_totais: int


class DecisionResponse(BaseModel):
    exchange: str
    symbol: str
    base_asset: str
    quote_asset: str
    generated_at: datetime
    horizonte: Literal["longo_prazo"] = "longo_prazo"
    acao: Literal["BUY", "SELL", "HOLD"]
    confianca: int = Field(..., ge=0, le=100)
    score: float
    resumo: str
    motivos: list[str]
    metricas: DecisionMetrics
    sentimento_macro: MacroSentiment
    noticias: list[MarketNewsItem]
    fontes_consultadas: list[SourceCoverageItem]
    aviso: str = "Conteudo informativo e nao constitui recomendacao financeira."


app = FastAPI(title="Crypto IA Bot", version="1.1.0")
settings = Settings()


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "horizonte": "longo_prazo",
    }


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
    coingecko_data, fear_greed_data, news, coverage = await gather_context(market["base_asset"])

    decision = build_decision(
        symbol=market["symbol"],
        spread_percentual=market["spread_percentual"],
        change_24h=(coingecko_data or {}).get("change_24h"),
        change_7d=(coingecko_data or {}).get("change_7d"),
        change_30d=(coingecko_data or {}).get("change_30d"),
        change_1y=(coingecko_data or {}).get("change_1y"),
        fear_greed_data=fear_greed_data,
        news=news,
        coverage=coverage,
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
            variacao_30d_percentual=decision["variacao_30d_percentual"],
            variacao_1y_percentual=decision["variacao_1y_percentual"],
        ),
        sentimento_macro=MacroSentiment(
            fear_greed_valor=decision["fear_greed_valor"],
            fear_greed_classificacao=decision["fear_greed_classificacao"],
            news_score_medio=decision["news_score_medio"],
            fontes_cobertas=decision["fontes_cobertas"],
            fontes_totais=decision["fontes_totais"],
        ),
        noticias=news,
        fontes_consultadas=coverage,
    )


async def fetch_market_from_hooks(exchange: str, symbol: str, quote_asset: Optional[str]) -> dict:
    timeout = httpx.Timeout(settings.request_timeout_seconds)
    normalized_exchange = exchange.strip().lower()
    symbol_query = normalize_symbol(symbol)

    params: dict[str, Any] = {"max_pairs": settings.symbol_lookup_max_pairs}
    if quote_asset:
        params["quote_asset"] = quote_asset.upper()

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{settings.hooks_base_url}/markets/{normalized_exchange}",
                params=params,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Nao foi possivel conectar no hooks. "
                f"Verifique HOOKS_BASE_URL='{settings.hooks_base_url}'."
            ),
        ) from exc

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


async def gather_context(
    base_asset: str,
) -> tuple[Optional[dict], Optional[dict], list[MarketNewsItem], list[SourceCoverageItem]]:
    results = await asyncio.gather(
        fetch_coingecko_data(base_asset),
        fetch_fear_and_greed(),
        fetch_news_by_trusted_sources(base_asset),
        return_exceptions=True,
    )

    coingecko_data = None if isinstance(results[0], Exception) else results[0]
    fear_greed_data = None if isinstance(results[1], Exception) else results[1]

    if isinstance(results[2], Exception):
        return coingecko_data, fear_greed_data, [], default_source_coverage_error()

    news, coverage = results[2]
    return coingecko_data, fear_greed_data, news, coverage


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
                "price_change_percentage": "24h,7d,30d,1y",
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
            "change_30d": safe_float(coin_data.get("price_change_percentage_30d_in_currency")),
            "change_1y": safe_float(coin_data.get("price_change_percentage_1y_in_currency")),
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


async def fetch_news_by_trusted_sources(
    base_asset: str,
) -> tuple[list[MarketNewsItem], list[SourceCoverageItem]]:
    timeout = httpx.Timeout(settings.request_timeout_seconds)
    semaphore = asyncio.Semaphore(max(1, settings.news_fetch_concurrency))

    async with httpx.AsyncClient(base_url=settings.google_news_base_url, timeout=timeout) as client:

        async def fetch_one_source(target: dict[str, str]) -> tuple[list[MarketNewsItem], SourceCoverageItem]:
            query = f'"{base_asset}" crypto site:{target["dominio"]}'
            params = {"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"}

            try:
                async with semaphore:
                    response = await client.get("/rss/search", params=params)
                response.raise_for_status()
            except Exception:
                return [], SourceCoverageItem(
                    fonte=target["nome"],
                    dominio=target["dominio"],
                    grupo=target["grupo"],
                    status="erro",
                    noticias_encontradas=0,
                )

            try:
                items = parse_google_news_rss(
                    rss_text=response.text,
                    fallback_source=target["nome"],
                    dominio=target["dominio"],
                    grupo=target["grupo"],
                    max_items=settings.news_max_per_source,
                )
            except Exception:
                return [], SourceCoverageItem(
                    fonte=target["nome"],
                    dominio=target["dominio"],
                    grupo=target["grupo"],
                    status="erro",
                    noticias_encontradas=0,
                )

            status: Literal["ok", "sem_resultado", "erro"] = "ok"
            if not items:
                status = "sem_resultado"

            return items, SourceCoverageItem(
                fonte=target["nome"],
                dominio=target["dominio"],
                grupo=target["grupo"],
                status=status,
                noticias_encontradas=len(items),
            )

        tasks = [fetch_one_source(target) for target in TRUSTED_SOURCE_TARGETS]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    all_news: list[MarketNewsItem] = []
    all_coverage: list[SourceCoverageItem] = []

    for idx, result in enumerate(results):
        target = TRUSTED_SOURCE_TARGETS[idx]
        if isinstance(result, Exception):
            all_coverage.append(
                SourceCoverageItem(
                    fonte=target["nome"],
                    dominio=target["dominio"],
                    grupo=target["grupo"],
                    status="erro",
                    noticias_encontradas=0,
                )
            )
            continue

        news_items, coverage = result
        all_news.extend(news_items)
        all_coverage.append(coverage)

    all_news.sort(key=lambda x: x.publicado_em or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    if settings.news_max_headlines > 0:
        all_news = all_news[: settings.news_max_headlines]

    all_coverage.sort(key=lambda item: item.fonte)
    return all_news, all_coverage


def parse_google_news_rss(
    rss_text: str,
    fallback_source: str,
    dominio: str,
    grupo: Literal["onchain", "institucional", "research"],
    max_items: int,
) -> list[MarketNewsItem]:
    try:
        root = ElementTree.fromstring(rss_text)
    except ElementTree.ParseError:
        return []

    items: list[MarketNewsItem] = []
    for entry in root.findall(".//item"):
        title = (entry.findtext("title") or "").strip()
        link = (entry.findtext("link") or "").strip()
        source = (entry.findtext("source") or fallback_source).strip()

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
                dominio=dominio,
                grupo=grupo,
                publicado_em=published_at,
                sentimento=label,
                score_sentimento=score,
            )
        )

        if max_items > 0 and len(items) >= max_items:
            break

    return items


def default_source_coverage_error() -> list[SourceCoverageItem]:
    return [
        SourceCoverageItem(
            fonte=target["nome"],
            dominio=target["dominio"],
            grupo=target["grupo"],
            status="erro",
            noticias_encontradas=0,
        )
        for target in TRUSTED_SOURCE_TARGETS
    ]


def build_decision(
    symbol: str,
    spread_percentual: str,
    change_24h: Optional[float],
    change_7d: Optional[float],
    change_30d: Optional[float],
    change_1y: Optional[float],
    fear_greed_data: Optional[dict],
    news: list[MarketNewsItem],
    coverage: list[SourceCoverageItem],
) -> dict:
    reasons: list[str] = []
    score = 0.0

    if change_30d is not None:
        if change_30d >= 15:
            score += 1.9
            reasons.append(f"Tendencia de longo prazo positiva em 30 dias ({change_30d:.2f}%).")
        elif change_30d <= -15:
            score -= 1.9
            reasons.append(f"Tendencia de longo prazo negativa em 30 dias ({change_30d:.2f}%).")

    if change_1y is not None:
        if change_1y >= 60:
            score += 1.3
            reasons.append(f"Estrutura anual forte ({change_1y:.2f}% em 1 ano).")
        elif change_1y <= -40:
            score -= 1.3
            reasons.append(f"Estrutura anual fraca ({change_1y:.2f}% em 1 ano).")

    if change_7d is not None:
        if change_7d >= 8:
            score += 0.4
        elif change_7d <= -8:
            score -= 0.4

    if change_24h is not None:
        if change_24h >= 8:
            score += 0.2
        elif change_24h <= -8:
            score -= 0.2

    weighted_sentiment = 0.0
    weighted_count = 0.0
    fontes_positivas: set[str] = set()
    fontes_negativas: set[str] = set()

    for item in news:
        weight = SOURCE_GROUP_WEIGHT.get(item.grupo, 1.0)
        weighted_sentiment += item.score_sentimento * weight
        weighted_count += weight

        if item.score_sentimento > 0:
            fontes_positivas.add(item.dominio)
        elif item.score_sentimento < 0:
            fontes_negativas.add(item.dominio)

    news_score = 0.0
    if weighted_count > 0:
        news_score = weighted_sentiment / weighted_count

    if news_score >= 0.15:
        score += 1.0
        reasons.append("Fontes especializadas com vies majoritariamente positivo.")
    elif news_score <= -0.15:
        score -= 1.0
        reasons.append("Fontes especializadas com vies majoritariamente negativo.")

    if len(fontes_positivas) >= 4:
        score += 0.4
        reasons.append("Consenso positivo entre multiplas fontes confiaveis.")
    if len(fontes_negativas) >= 4:
        score -= 0.4
        reasons.append("Consenso negativo entre multiplas fontes confiaveis.")

    fear_greed_value = None
    fear_greed_classification = None
    if fear_greed_data:
        fear_greed_value = fear_greed_data.get("value")
        fear_greed_classification = fear_greed_data.get("classification")
        if fear_greed_value is not None:
            if fear_greed_value <= 20:
                if (change_30d or 0) > 0 or (change_1y or 0) > 0:
                    score += 0.3
                    reasons.append("Mercado em medo extremo com tendencia positiva (cenario de acumulacao).")
                else:
                    score -= 0.3
                    reasons.append("Mercado em medo extremo sem tendencia de alta confirmada.")
            elif fear_greed_value >= 80:
                score -= 0.2
                reasons.append("Mercado em euforia; risco de correcao em longo prazo.")

    spread = safe_float(spread_percentual) or 0.0
    if spread >= 0.35:
        score -= 0.4
        reasons.append(f"Spread alto ({spread:.4f}%), piora execucao de entrada/saida.")

    fontes_totais = len(coverage)
    fontes_cobertas = len([item for item in coverage if item.status == "ok"])
    cobertura_ratio = (fontes_cobertas / fontes_totais) if fontes_totais > 0 else 0.0

    if cobertura_ratio < 0.3:
        reasons.append("Baixa cobertura de fontes nesta consulta; confianca reduzida.")

    if not reasons:
        reasons.append("Sinais mistos no horizonte de longo prazo; manter postura neutra.")

    acao: Literal["BUY", "SELL", "HOLD"] = "HOLD"
    if score >= 1.8:
        acao = "BUY"
    elif score <= -1.8:
        acao = "SELL"

    data_points = sum(1 for x in [change_24h, change_7d, change_30d, change_1y] if x is not None)
    base_confidence = 50 + (abs(score) * 10) + (cobertura_ratio * 18) + (data_points * 2)
    if fear_greed_value is not None:
        base_confidence += 2
    confidence = int(max(40, min(96, base_confidence)))

    if cobertura_ratio < 0.3:
        confidence = max(40, confidence - 12)

    resumo = build_summary(acao, symbol, reasons)

    return {
        "acao": acao,
        "confianca": confidence,
        "score": round(score, 4),
        "resumo": resumo,
        "motivos": reasons,
        "variacao_24h_percentual": change_24h,
        "variacao_7d_percentual": change_7d,
        "variacao_30d_percentual": change_30d,
        "variacao_1y_percentual": change_1y,
        "fear_greed_valor": fear_greed_value,
        "fear_greed_classificacao": fear_greed_classification,
        "news_score_medio": round(news_score, 4),
        "fontes_cobertas": fontes_cobertas,
        "fontes_totais": fontes_totais,
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
