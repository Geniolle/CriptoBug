from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    binance_base_url: str = "https://api.binance.com"
    bybit_base_url: str = "https://api.bybit.com"
    okx_base_url: str = "https://www.okx.com"
    kraken_base_url: str = "https://api.kraken.com"
    coinbase_base_url: str = "https://api.exchange.coinbase.com"
    request_timeout_seconds: int = 20
    kraken_ticker_batch_size: int = 40
    coinbase_ticker_concurrency: int = 15

    # Segurança do endpoint de webhook local (opcional)
    incoming_webhook_token: Optional[str] = None

    # Envio automático de snapshots para webhook externo (opcional)
    outbound_webhook_url: Optional[str] = None
    outbound_exchange: str = "binance"
    outbound_webhook_timeout_seconds: int = 15
    poll_interval_seconds: int = 30

    # Filtros padrão
    default_quote_asset: Optional[str] = None
    default_max_pairs: Optional[int] = None
    default_top_assets_only: bool = True

    # Cache (em memoria) para acelerar /markets/{exchange}
    snapshot_cache_ttl_seconds: int = 20
    snapshot_cache_swr_seconds: int = 120


@lru_cache
def get_settings() -> Settings:
    return Settings()
