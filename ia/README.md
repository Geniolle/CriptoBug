# IA Bot (separado do hooks)

Este modulo roda separado da pasta `hooks`.

## Rodar

```bash
cd ia
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8010 --reload
```

## Endpoints

- `GET /health`
- `GET /decision/{exchange}/{symbol}?quote_asset=USDT`
- `POST /webhook/decision`

Exemplo POST:

```bash
curl -X POST "http://127.0.0.1:8010/webhook/decision" \
  -H "Content-Type: application/json" \
  -d '{"exchange":"binance","symbol":"BTCUSDT","quote_asset":"USDT"}'
```

O bot consulta:
- dados de mercado via API do `hooks` (`HOOKS_BASE_URL`)
- noticias (Google News)
- variacao de preco (CoinGecko)
- sentimento macro (Fear & Greed)
