import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { requireEnv } from "./env.js"

const ALGO = "aes-256-gcm"
const VERSION = "v1"

let cachedKey: Buffer | null = null

function loadEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey

  const raw = requireEnv("SECRETS_ENCRYPTION_KEY")
  let key: Buffer | null = null

  try {
    const decoded = Buffer.from(raw, "base64")
    if (decoded.length === 32) key = decoded
  } catch {
    key = null
  }

  if (!key) {
    const utf8 = Buffer.from(raw, "utf8")
    if (utf8.length === 32) key = utf8
  }

  if (!key || key.length !== 32) {
    throw new Error("SECRETS_ENCRYPTION_KEY invalida: use 32 bytes (base64 recomendado)")
  }

  cachedKey = key
  return key
}

export function encryptSecret(plain: string): string {
  const key = loadEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":")
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Payload criptografado invalido")
  }

  const key = loadEncryptionKey()
  const iv = Buffer.from(ivB64, "base64")
  const tag = Buffer.from(tagB64, "base64")
  const data = Buffer.from(dataB64, "base64")

  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(data), decipher.final()])
  return plain.toString("utf8")
}

