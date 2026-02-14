import Fastify from "fastify"
import cors from "@fastify/cors"
import { z } from "zod"
import { randomUUID } from "node:crypto"

import { optionalEnv, requireEnv } from "./env.js"
import { getFirebaseAdminAuth } from "./firebaseAdmin.js"
import { deleteExchangeCredential, getExchangeCredentials, type ExchangeKey, upsertExchangeCredential } from "./repository.js"
import { insertTradeAction, listTradeActions, updateTradeAction } from "./tradeRepository.js"
import { placeOrder } from "./trading.js"

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

const OrderSchema = z.object({
  exchange: ExchangeKeySchema,
  symbol: z.string().min(3), // ETH/USDT
  side: z.enum(["BUY", "SELL"]),
  orderType: z.enum(["market", "limit"]).default("market"),
  amount: z.number().positive(),
  price: z.number().positive().optional(),
})

function isDryRunEnabled(): boolean {
  const raw = optionalEnv("TRADING_DRY_RUN")
  if (!raw) return true
  return raw.toLowerCase() !== "false"
}

app.get("/trade/actions", async (request, reply) => {
  try {
    const userId = await requireUserId(request.headers.authorization)
    const limitRaw = (request.query as { limit?: string } | undefined)?.limit
    const limit = Math.max(1, Math.min(200, Number.parseInt(limitRaw ?? "50", 10) || 50))
    const rows = await listTradeActions(userId, limit)

    return reply.code(200).send({
      actions: rows.map((row) => ({
        id: row.id,
        exchange: row.exchange,
        symbol: row.symbol,
        side: row.side,
        orderType: row.order_type,
        amount: row.amount,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        error: row.error_message,
      })),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido"
    return reply.code(401).send({ error: message })
  }
})

app.post("/trade/order", async (request, reply) => {
  const requestBody = request.body
  const id = randomUUID()

  try {
    const userId = await requireUserId(request.headers.authorization)
    const parsed = OrderSchema.parse(requestBody)
    const dryRun = isDryRunEnabled()

    await insertTradeAction({
      id,
      userId,
      exchange: parsed.exchange,
      symbol: parsed.symbol,
      side: parsed.side,
      orderType: parsed.orderType,
      amount: parsed.amount,
      status: dryRun ? "DRY_RUN" : "PENDING",
      request: { ...parsed, dryRun },
    })

    if (dryRun) {
      return reply.code(200).send({ ok: true, id, status: "DRY_RUN" })
    }

    try {
      const result = await placeOrder({
        userId,
        exchange: parsed.exchange,
        symbol: parsed.symbol,
        side: parsed.side,
        orderType: parsed.orderType,
        amount: parsed.amount,
        price: parsed.price,
      })

      await updateTradeAction({ id, status: "EXECUTED", result })
      return reply.code(200).send({ ok: true, id, status: "EXECUTED" })
    } catch (execError) {
      const msg = execError instanceof Error ? execError.message : "Falha ao executar ordem"
      await updateTradeAction({ id, status: "FAILED", errorMessage: msg })
      return reply.code(500).send({ ok: false, id, status: "FAILED", error: msg })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido"
    // best-effort record
    try {
      const authHeader = request.headers.authorization
      const userId = authHeader ? await requireUserId(authHeader) : "unknown"
      await insertTradeAction({
        id,
        userId,
        exchange: "binance",
        symbol: "unknown",
        side: "BUY",
        orderType: "market",
        amount: 0.0001,
        status: "FAILED",
        request: { raw: requestBody },
      })
      await updateTradeAction({ id, status: "FAILED", errorMessage: message })
    } catch {
      // ignore
    }

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
