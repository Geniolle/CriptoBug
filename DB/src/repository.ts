import { getDbPool } from "./db.js"
import { decryptSecret, encryptSecret } from "./crypto.js"

export type ExchangeKey = "binance" | "kraken" | "okx" | "bybit"

export interface ExchangeCredential {
  exchange: ExchangeKey
  apiKey: string
  apiSecret: string
  passphrase?: string
}

export async function upsertExchangeCredential(userId: string, cred: ExchangeCredential): Promise<void> {
  const pool = getDbPool()
  const apiKeyEnc = encryptSecret(cred.apiKey)
  const apiSecretEnc = encryptSecret(cred.apiSecret)
  const passphraseEnc = cred.passphrase ? encryptSecret(cred.passphrase) : null

  await pool.query(
    `
      insert into user_exchange_credentials
        (user_id, exchange, api_key_enc, api_secret_enc, passphrase_enc)
      values
        ($1, $2, $3, $4, $5)
      on conflict (user_id, exchange) do update set
        api_key_enc = excluded.api_key_enc,
        api_secret_enc = excluded.api_secret_enc,
        passphrase_enc = excluded.passphrase_enc,
        updated_at = now()
    `,
    [userId, cred.exchange, apiKeyEnc, apiSecretEnc, passphraseEnc],
  )
}

export async function deleteExchangeCredential(userId: string, exchange: ExchangeKey): Promise<void> {
  const pool = getDbPool()
  await pool.query(`delete from user_exchange_credentials where user_id = $1 and exchange = $2`, [userId, exchange])
}

export async function getExchangeCredentials(userId: string): Promise<ExchangeCredential[]> {
  const pool = getDbPool()
  const result = await pool.query(
    `
      select exchange, api_key_enc, api_secret_enc, passphrase_enc
      from user_exchange_credentials
      where user_id = $1
    `,
    [userId],
  )

  return result.rows.map((row) => ({
    exchange: row.exchange as ExchangeKey,
    apiKey: decryptSecret(String(row.api_key_enc)),
    apiSecret: decryptSecret(String(row.api_secret_enc)),
    passphrase: row.passphrase_enc ? decryptSecret(String(row.passphrase_enc)) : "",
  }))
}

