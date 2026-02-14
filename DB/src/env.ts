export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} nao configurada`)
  return value
}

export function optionalEnv(name: string): string | null {
  return process.env[name] ?? null
}

