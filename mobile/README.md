# Mobile (Expo)

## Rodar

```bash
cd mobile
npm install
npm start
```

## Variaveis de ambiente

Crie um `.env` baseado em `.env.example`.

- `EXPO_PUBLIC_DB_API_BASE_URL`: URL do servico `/DB` (Fastify) para conexoes de exchange e ordens/historico.
- `EXPO_PUBLIC_FIREBASE_*` e `EXPO_PUBLIC_GOOGLE_*`: necessario para Login com Google/Firebase.

## Observacoes

- O app funciona no Expo Go, mas os efeitos Skia ficam desativados automaticamente se o modulo nativo nao estiver disponivel. Para usar Skia no device, use dev build/EAS build.

