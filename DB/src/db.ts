import pg from "pg"
import { requireEnv } from "./env.js"

const { Pool } = pg

declare global {
  // eslint-disable-next-line no-var
  var __cryptobugDbPool: pg.Pool | undefined
}

function buildPool(): pg.Pool {
  const connectionString = requireEnv("DATABASE_URL")
  const shouldUseSsl = !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1")

  return new Pool({
    connectionString,
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
    max: 8,
  })
}

export function getDbPool(): pg.Pool {
  if (!global.__cryptobugDbPool) global.__cryptobugDbPool = buildPool()
  return global.__cryptobugDbPool
}

