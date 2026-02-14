# DB Service

Serviço separado para armazenar credenciais de exchanges por usuário (Firebase UID) no Postgres, com criptografia no servidor.

## Endpoints

- `GET /health`
- `GET /account/connections` (Bearer Firebase ID token)
- `POST /account/connections` (Bearer Firebase ID token)
- `DELETE /account/connections?exchange=binance|kraken|okx|bybit` (Bearer Firebase ID token)

## Env vars (server)

- `PORT` (default `8080`)
- `DATABASE_URL`
- `SECRETS_ENCRYPTION_KEY` (32 bytes; base64 recomendado)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (com `\\n` escapado)
- `CORS_ORIGINS` (opcional, lista separada por virgula; default `*`)
- `TRADING_DRY_RUN` (opcional; default `true`. Use `false` para executar ordens reais)

## Schema

Execute `schema.sql` no seu Postgres para criar as tabelas.
