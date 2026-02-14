# API de Graficos (CCXT)

Servico separado para gerar grafico por moeda usando `ccxt`.

## Rodar

```bash
cd api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8020 --reload
```

## Periodos suportados

- `1minuto`
- `5minutos`
- `30minutos`
- `hr`
- `dia`
- `semana`
- `mes`
- `ano`
- `5anos`
- `full`

Tambem aceita aliases: `1m`, `5m`, `30m`, `1h`, `1d`, `1w`, `1y`, `5y`, `all`.

## Endpoints

- `GET /health`
- `GET /chart-data/{coin}` retorna candles em JSON
- `GET /chart/{coin}` retorna imagem PNG do grafico

## Exemplos

### Dados JSON

```bash
curl "http://127.0.0.1:8020/chart-data/btc?period=dia&exchange=binance&quote=USDT"
```

### Grafico PNG

```bash
curl -o btc_dia.png "http://127.0.0.1:8020/chart/btc?period=dia&exchange=binance&quote=USDT"
```

### Full (historico maximo dentro do limite)

```bash
curl -o btc_full.png "http://127.0.0.1:8020/chart/btc?period=full"
```
