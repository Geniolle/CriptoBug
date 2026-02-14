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

