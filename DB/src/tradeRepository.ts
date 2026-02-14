import { getDbPool } from "./db.js"

export type TradeStatus = "PENDING" | "EXECUTED" | "FAILED" | "DRY_RUN"

export interface TradeActionRow {
  id: string
  user_id: string
  exchange: string
  symbol: string
  side: string
  order_type: string
  amount: string
  status: TradeStatus
  request_json: unknown
  result_json: unknown | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export async function insertTradeAction(args: {
  id: string
  userId: string
  exchange: string
  symbol: string
  side: string
  orderType: string
  amount: number
  status: TradeStatus
  request: unknown
}): Promise<void> {
  const pool = getDbPool()
  await pool.query(
    `
      insert into trade_actions
        (id, user_id, exchange, symbol, side, order_type, amount, status, request_json)
      values
        ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [args.id, args.userId, args.exchange, args.symbol, args.side, args.orderType, String(args.amount), args.status, JSON.stringify(args.request)],
  )
}

export async function updateTradeAction(args: {
  id: string
  status: TradeStatus
  result?: unknown
  errorMessage?: string
}): Promise<void> {
  const pool = getDbPool()
  await pool.query(
    `
      update trade_actions
      set
        status = $2,
        result_json = $3::jsonb,
        error_message = $4,
        updated_at = now()
      where id = $1
    `,
    [args.id, args.status, args.result ? JSON.stringify(args.result) : null, args.errorMessage ?? null],
  )
}

export async function listTradeActions(userId: string, limit: number): Promise<TradeActionRow[]> {
  const pool = getDbPool()
  const result = await pool.query(
    `
      select
        id,
        user_id,
        exchange,
        symbol,
        side,
        order_type,
        amount::text as amount,
        status,
        request_json,
        result_json,
        error_message,
        created_at::text as created_at,
        updated_at::text as updated_at
      from trade_actions
      where user_id = $1
      order by created_at desc
      limit $2
    `,
    [userId, limit],
  )
  return result.rows as TradeActionRow[]
}

