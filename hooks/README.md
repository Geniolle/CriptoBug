# ProjetoUniversidade - Webhook Multi-Exchange

API em FastAPI para consultar mercados spot e devolver:
- `valor_atual` (último preço)
- `taxa_compra` (`ask`)
- `taxa_venda` (`bid`)

Exchanges suportadas:
- Binance
- Bybit
- OKX
- Kraken
- Coinbase Exchange

## 1) Instalação

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2) Configuração

```bash
cp .env.example .env
```

Variáveis principais no `.env`:
- `INCOMING_WEBHOOK_TOKEN`: token opcional para proteger `POST /webhooks/{exchange}`
- `OUTBOUND_WEBHOOK_URL`: URL para envio automático de snapshots
- `OUTBOUND_EXCHANGE`: `binance`, `bybit`, `okx`, `kraken`, `coinbase`
- `POLL_INTERVAL_SECONDS`: intervalo do envio automático
- `DEFAULT_QUOTE_ASSET`: filtro padrão por moeda de cotação (ex.: `USDT`)
- `DEFAULT_MAX_PAIRS`: limite padrão de pares
- `DEFAULT_TOP_ASSETS_ONLY`: se `true`, retorna apenas as 30 moedas alvo

## 3) Rodar

Com venv ativado:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Ou direto do PC (sem ativar venv manualmente):

```bash
./start.sh
```

## 4) Endpoints

### Health

```bash
curl http://127.0.0.1:8000/health
```

### Exchanges suportadas

```bash
curl http://127.0.0.1:8000/exchanges
```

### Consulta genérica por exchange

```bash
curl "http://127.0.0.1:8000/markets/binance?quote_asset=USDT&max_pairs=100"
curl "http://127.0.0.1:8000/markets/bybit?quote_asset=USDT&max_pairs=100"
curl "http://127.0.0.1:8000/markets/okx?quote_asset=USDT&max_pairs=100"
curl "http://127.0.0.1:8000/markets/kraken?quote_asset=USD&max_pairs=100"
curl "http://127.0.0.1:8000/markets/coinbase?quote_asset=USD&max_pairs=100"
curl "http://127.0.0.1:8000/markets/binance?quote_asset=USDT&top_assets_only=true"
```

### Rotas curtas por exchange

```bash
curl "http://127.0.0.1:8000/binance/markets?quote_asset=USDT"
curl "http://127.0.0.1:8000/bybit/markets?quote_asset=USDT"
curl "http://127.0.0.1:8000/okx/markets?quote_asset=USDT"
curl "http://127.0.0.1:8000/kraken/markets?quote_asset=USD"
curl "http://127.0.0.1:8000/coinbase/markets?quote_asset=USD"
curl "http://127.0.0.1:8000/binance/markets?quote_asset=USDT&top_assets_only=true"
```

### Webhook local (entrada)

```bash
curl -X POST "http://127.0.0.1:8000/webhooks/binance" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Token: SEU_TOKEN" \
  -d '{"quote_asset":"USDT","max_pairs":100,"top_assets_only":true}'
```

Troque `binance` por `bybit`, `okx`, `kraken` ou `coinbase`.

## 5) Exemplo de resposta

```json
{
  "exchange": "binance",
  "generated_at": "2026-02-13T18:00:00Z",
  "quote_asset_filtrado": "USDT",
  "total_pares": 1,
  "mercados": [
    {
      "symbol": "BTCUSDT",
      "base_asset": "BTC",
      "quote_asset": "USDT",
      "valor_atual": "97850.12",
      "taxa_compra": "97850.13",
      "taxa_venda": "97850.12",
      "spread": "0.01",
      "spread_percentual": "0.00001022"
    }
  ]
}
```

## 6) Deploy no Railway

1. Suba o código para GitHub.
2. No Railway: `New Project` -> `Deploy from GitHub Repo`.
3. Configure variáveis de ambiente conforme necessidade.
4. Railway iniciará com `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
5. Teste com: `https://SEU_APP.up.railway.app/health`.

## Observação de performance

`Coinbase` não expõe ticker spot em lote no endpoint usado aqui, então a consulta de "todos os pares" nela pode ser mais lenta que nas outras exchanges.
