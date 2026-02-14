-- CryptoBug DB service schema (Postgres)
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

create index if not exists idx_user_exchange_credentials_user on user_exchange_credentials (user_id);

-- Trade actions / history (records user intents and (optional) execution results)
create table if not exists trade_actions (
  id text primary key,
  user_id text not null,
  exchange text not null,
  symbol text not null,
  side text not null, -- BUY / SELL
  order_type text not null, -- market / limit
  amount numeric not null,
  status text not null, -- PENDING / EXECUTED / FAILED / DRY_RUN
  request_json jsonb not null,
  result_json jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trade_actions_user on trade_actions (user_id, created_at desc);
