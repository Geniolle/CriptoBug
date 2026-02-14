from typing import Iterable, List, Set

from app.schemas import MarketSnapshotItem

# Top 30 ativos solicitados no projeto (normalizados para UPPERCASE).
TOP_30_BASE_ASSETS: Set[str] = {
    "BTC",
    "ETH",
    "USDT",
    "BNB",
    "XRP",
    "USDC",
    "SOL",
    "TRX",
    "DOGE",
    "ADA",
    "BCH",
    "LINK",
    "XMR",
    "HYPE",
    "LEO",
    "ZEC",
    "XLM",
    "USDE",
    "LTC",
    "SUI",
    "DAI",
    "AVAX",
    "HBAR",
    "SHIB",
    "UNI",
    "PYUSD",
    "MNT",
    "CRO",
    "CC",
    "TON",
}


def filter_top_assets(markets: Iterable[MarketSnapshotItem]) -> List[MarketSnapshotItem]:
    return [market for market in markets if market.base_asset.upper() in TOP_30_BASE_ASSETS]
