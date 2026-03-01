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
  chartEnabled: boolean
  chartIntervalMs: number
  chartHistoryLimit: number
  chartStaleAfterMs: number
  chartPairIdleTtlMs: number
  chartMaxPairsPerStream: number
  chartMaxActivePairsGlobal: number
  chartBatchMaxPairs: number
  chartBootstrapLimit: number
  chartHistoryBackfillEnabled: boolean
  chartHistoryWarmupTopPairs: number
  chartHistoryProvider: 'public' | 'none'
  chartHistoryProviderTimeoutMs: number
  chartHistoryBackfillConcurrency: number
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
}

const DEFAULTS = {
  host: '0.0.0.0',
  port: 3001,
  feedCacheTtlSeconds: 5,
  feedCacheStaleTtlSeconds: 30,
  feedDefaultLimit: 10,
  feedMaxLimit: 20,
  dexScreenerTimeoutMs: 5000,
  dexScreenerSearchQuery: 'solana,bonk,wif,jup',
  chartEnabled: true,
  chartIntervalMs: 1000,
  chartHistoryLimit: 240,
  chartStaleAfterMs: 3000,
  chartPairIdleTtlMs: 15000,
  chartMaxPairsPerStream: 3,
  chartMaxActivePairsGlobal: 256,
  chartBatchMaxPairs: 8,
  chartBootstrapLimit: 60,
  chartHistoryBackfillEnabled: true,
  chartHistoryWarmupTopPairs: 10,
  chartHistoryProvider: 'public',
  chartHistoryProviderTimeoutMs: 3000,
  chartHistoryBackfillConcurrency: 4,
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

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined) {
    return fallback
  }

  const normalized = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }

  throw new Error(`Invalid ${name}: expected boolean`)
}

export function loadEnv(): BackendEnv {
  const chartHistoryProvider = (process.env.CHART_HISTORY_PROVIDER ?? DEFAULTS.chartHistoryProvider).trim().toLowerCase()
  if (chartHistoryProvider !== 'public' && chartHistoryProvider !== 'none') {
    throw new Error(`Invalid CHART_HISTORY_PROVIDER: ${chartHistoryProvider}`)
  }

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
    chartEnabled: parseBoolEnv('CHART_ENABLED', DEFAULTS.chartEnabled),
    chartIntervalMs: parseIntEnv('CHART_INTERVAL_MS', DEFAULTS.chartIntervalMs, 250),
    chartHistoryLimit: parseIntEnv('CHART_HISTORY_LIMIT', DEFAULTS.chartHistoryLimit, 1),
    chartStaleAfterMs: parseIntEnv('CHART_STALE_AFTER_MS', DEFAULTS.chartStaleAfterMs, 1000),
    chartPairIdleTtlMs: parseIntEnv('CHART_PAIR_IDLE_TTL_MS', DEFAULTS.chartPairIdleTtlMs, 1000),
    chartMaxPairsPerStream: parseIntEnv('CHART_MAX_PAIRS_PER_STREAM', DEFAULTS.chartMaxPairsPerStream, 1),
    chartMaxActivePairsGlobal: parseIntEnv(
      'CHART_MAX_ACTIVE_PAIRS_GLOBAL',
      DEFAULTS.chartMaxActivePairsGlobal,
      1,
    ),
    chartBatchMaxPairs: parseIntEnv('CHART_BATCH_MAX_PAIRS', DEFAULTS.chartBatchMaxPairs, 1),
    chartBootstrapLimit: parseIntEnv('CHART_BOOTSTRAP_LIMIT', DEFAULTS.chartBootstrapLimit, 1),
    chartHistoryBackfillEnabled: parseBoolEnv('CHART_HISTORY_BACKFILL_ENABLED', DEFAULTS.chartHistoryBackfillEnabled),
    chartHistoryWarmupTopPairs: parseIntEnv('CHART_HISTORY_WARMUP_TOP_PAIRS', DEFAULTS.chartHistoryWarmupTopPairs, 0),
    chartHistoryProvider: chartHistoryProvider as BackendEnv['chartHistoryProvider'],
    chartHistoryProviderTimeoutMs: parseIntEnv(
      'CHART_HISTORY_PROVIDER_TIMEOUT_MS',
      DEFAULTS.chartHistoryProviderTimeoutMs,
      200,
    ),
    chartHistoryBackfillConcurrency: parseIntEnv(
      'CHART_HISTORY_BACKFILL_CONCURRENCY',
      DEFAULTS.chartHistoryBackfillConcurrency,
      1,
    ),
    logLevel: parseLogLevel(),
  }
}
