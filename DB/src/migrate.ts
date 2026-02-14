import { getDbPool } from "./db.js"

const MIGRATIONS: string[] = [
  `
  create table if not exists user_exchange_credentials (
    user_id text not null,
    exchange text not null,
    api_key_enc text not null,
    api_secret_enc text not null,
    passphrase_enc text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, exchange)
  );
  `,
  `create index if not exists idx_user_exchange_credentials_user on user_exchange_credentials (user_id);`,
  `
  create table if not exists trade_actions (
    id text primary key,
    user_id text not null,
    exchange text not null,
    symbol text not null,
    side text not null,
    order_type text not null,
    amount numeric not null,
    status text not null,
    request_json jsonb not null,
    result_json jsonb,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  `,
  `create index if not exists idx_trade_actions_user on trade_actions (user_id, created_at desc);`,
]

export async function runMigrations(): Promise<void> {
  const pool = getDbPool()
  const client = await pool.connect()
  try {
    for (const sql of MIGRATIONS) {
      await client.query(sql)
    }
  } finally {
    client.release()
  }
}

