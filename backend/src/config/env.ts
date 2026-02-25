export interface BackendEnv {
  host: string
  port: number
  redisUrl?: string
  feedCacheTtlSeconds: number
  feedCacheStaleTtlSeconds: number
  feedDefaultLimit: number
  feedMaxLimit: number
  dexScreenerTimeoutMs: number
  dexScreenerSearchQuery: string
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
}

const DEFAULTS = {
  host: '0.0.0.0',
  port: 3001,
  feedCacheTtlSeconds: 5,
  feedCacheStaleTtlSeconds: 30,
  feedDefaultLimit: 10,
  feedMaxLimit: 20,
  dexScreenerTimeoutMs: 1500,
  dexScreenerSearchQuery: 'solana',
  logLevel: 'info',
} as const

function parseIntEnv(name: string, fallback: number, min: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`Invalid ${name}: expected integer >= ${min}`)
  }

  return value
}

function parseLogLevel(): BackendEnv['logLevel'] {
  const raw = process.env.LOG_LEVEL?.toLowerCase()
  if (!raw) {
    return DEFAULTS.logLevel
  }

  const levels: BackendEnv['logLevel'][] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
  if (!levels.includes(raw as BackendEnv['logLevel'])) {
    throw new Error(`Invalid LOG_LEVEL: ${raw}`)
  }

  return raw as BackendEnv['logLevel']
}

export function loadEnv(): BackendEnv {
  return {
    host: process.env.HOST ?? DEFAULTS.host,
    port: parseIntEnv('PORT', DEFAULTS.port, 1),
    redisUrl: process.env.REDIS_URL,
    feedCacheTtlSeconds: parseIntEnv('FEED_CACHE_TTL_SECONDS', DEFAULTS.feedCacheTtlSeconds, 1),
    feedCacheStaleTtlSeconds: parseIntEnv('FEED_CACHE_STALE_TTL_SECONDS', DEFAULTS.feedCacheStaleTtlSeconds, 1),
    feedDefaultLimit: parseIntEnv('FEED_DEFAULT_LIMIT', DEFAULTS.feedDefaultLimit, 1),
    feedMaxLimit: parseIntEnv('FEED_MAX_LIMIT', DEFAULTS.feedMaxLimit, 1),
    dexScreenerTimeoutMs: parseIntEnv('DEXSCREENER_TIMEOUT_MS', DEFAULTS.dexScreenerTimeoutMs, 200),
    dexScreenerSearchQuery: process.env.DEXSCREENER_SEARCH_QUERY ?? DEFAULTS.dexScreenerSearchQuery,
    logLevel: parseLogLevel(),
  }
}
