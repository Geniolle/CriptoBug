import Fastify from "fastify"
import cors from "@fastify/cors"
import { z } from "zod"

import { optionalEnv, requireEnv } from "./env.js"
import { getFirebaseAdminAuth } from "./firebaseAdmin.js"
import { deleteExchangeCredential, getExchangeCredentials, type ExchangeKey, upsertExchangeCredential } from "./repository.js"

const app = Fastify({ logger: true })

const ExchangeKeySchema = z.enum(["binance", "kraken", "okx", "bybit"])
const UpsertSchema = z.object({
  exchange: ExchangeKeySchema,
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  passphrase: z.string().optional(),
})

function parseCorsOrigins(): string[] {
  const raw = optionalEnv("CORS_ORIGINS")
  if (!raw) return ["*"]
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

await app.register(cors, {
  origin: parseCorsOrigins(),
  credentials: false,
})

async function requireUserId(authorizationHeader: string | undefined): Promise<string> {
  const authHeader = authorizationHeader ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : ""
  if (!token) throw new Error("Token ausente")
  const decoded = await getFirebaseAdminAuth().verifyIdToken(token)
  return decoded.uid
}

app.get("/health", async () => {
  return { status: "ok" }
})

app.get("/account/connections", async (request, reply) => {
  try {
    const userId = await requireUserId(request.headers.authorization)
    const creds = await getExchangeCredentials(userId)
    return reply.code(200).send({
      connections: creds.map((c) => ({
        exchange: c.exchange,
        linked: Boolean(c.apiKey && c.apiSecret),
        hasPassphrase: Boolean(c.passphrase),
        apiKeyHint: c.apiKey ? `****${c.apiKey.slice(-4)}` : "",
      })),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido"
    return reply.code(401).send({ error: message })
  }
})

app.post("/account/connections", async (request, reply) => {
  try {
    const userId = await requireUserId(request.headers.authorization)
    const parsed = UpsertSchema.parse(request.body)
    await upsertExchangeCredential(userId, parsed)
    return reply.code(200).send({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido"
    return reply.code(400).send({ error: message })
  }
})

app.delete("/account/connections", async (request, reply) => {
  try {
    const userId = await requireUserId(request.headers.authorization)
    const exchange = (request.query as { exchange?: string } | undefined)?.exchange
    const parsed = ExchangeKeySchema.safeParse(exchange)
    if (!parsed.success) {
      return reply.code(400).send({ error: "Parametro exchange invalido" })
    }
    await deleteExchangeCredential(userId, parsed.data as ExchangeKey)
    return reply.code(200).send({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido"
    return reply.code(400).send({ error: message })
  }
})

const port = Number.parseInt(process.env.PORT ?? "8080", 10)

// Validate required envs on boot (fail fast).
requireEnv("DATABASE_URL")
requireEnv("SECRETS_ENCRYPTION_KEY")
requireEnv("FIREBASE_PROJECT_ID")
requireEnv("FIREBASE_CLIENT_EMAIL")
requireEnv("FIREBASE_PRIVATE_KEY")

await app.listen({ port, host: "0.0.0.0" })

