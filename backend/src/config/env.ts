import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

loadLocalEnvFile()

export interface BackendEnv {
  host: string
  port: number
  supabaseUrl?: string
  supabaseServiceRoleKey?: string
  supabaseRequestTimeoutMs: number
  supabaseReadEnabled: boolean
  supabaseDualWriteEnabled: boolean
  tokenIngestIntervalSeconds: number
  tokenCandleRetentionDays: number
  alertWebhookUrl?: string
  alertWebhookTimeoutMs: number
  alertWebhookRetryCount: number
  alertWebhookCooldownSeconds: number
  alertFeedSeedRateThreshold: number
  alertSupabaseFailureRateThreshold: number
  alertMinRequests: number
  redisUrl?: string
  feedCacheTtlSeconds: number
  feedCacheStaleTtlSeconds: number
  feedCursorTtlSeconds: number
  feedSnapshotHistoryMax: number
  feedEnableSeedFallback: boolean
  feedMinChartCandles: number
  feedRequireFullChartHistory: boolean
  feedDefaultLimit: number
  feedMaxLimit: number
  dexScreenerTimeoutMs: number
  dexScreenerSearchQuery: string
  dexScreenerTokenMints?: string
  birdeyeApiKey?: string
  birdeyeTimeoutMs: number
  heliusApiKey?: string
  heliusDasUrl: string
  heliusTimeoutMs: number
  jupiterTagsTtlMs: number
  feedEnrichmentMaxItems: number
  feedEnrichmentConcurrency: number
  feedSparklineWindowMinutes: number
  feedSparklinePoints: number
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
  chartHistoryCacheTtlSeconds: number
  chartHistoryProvider: 'public' | 'none'
  chartHistoryProviderTimeoutMs: number
  chartHistoryBackfillConcurrency: number
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
}

function loadLocalEnvFile(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'backend/.env')]
  const envPath = candidates.find((candidate) => existsSync(candidate))
  if (!envPath) {
    return
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue
    }

    const raw = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed
    const eqIndex = raw.indexOf('=')
    if (eqIndex <= 0) {
      continue
    }

    const key = raw.slice(0, eqIndex).trim()
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      continue
    }
    if (process.env[key] !== undefined) {
      continue
    }

    const rawValue = raw.slice(eqIndex + 1).trim()
    process.env[key] = parseEnvValue(rawValue)
  }
}

function parseEnvValue(rawValue: string): string {
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1)
  }

  return rawValue
}

const DEFAULTS = {
  host: '0.0.0.0',
  port: 3001,
  supabaseRequestTimeoutMs: 10_000,
  supabaseReadEnabled: false,
  supabaseDualWriteEnabled: false,
  tokenIngestIntervalSeconds: 300,
  tokenCandleRetentionDays: 14,
  alertWebhookTimeoutMs: 3000,
  alertWebhookRetryCount: 2,
  alertWebhookCooldownSeconds: 300,
  alertFeedSeedRateThreshold: 0.4,
  alertSupabaseFailureRateThreshold: 0.2,
  alertMinRequests: 20,
  feedCacheTtlSeconds: 5,
  feedCacheStaleTtlSeconds: 30,
  feedCursorTtlSeconds: 300,
  feedSnapshotHistoryMax: 500,
  feedMinChartCandles: 120,
  feedRequireFullChartHistory: true,
  feedDefaultLimit: 10,
  feedMaxLimit: 20,
  dexScreenerTimeoutMs: 5000,
  dexScreenerSearchQuery: 'solana,bonk,wif,jup',
  birdeyeTimeoutMs: 2500,
  heliusDasUrl: 'https://mainnet.helius-rpc.com',
  heliusTimeoutMs: 2500,
  jupiterTagsTtlMs: 900000,
  feedEnrichmentMaxItems: 80,
  feedEnrichmentConcurrency: 8,
  feedSparklineWindowMinutes: 360,
  feedSparklinePoints: 72,
  chartEnabled: true,
  chartIntervalMs: 1000,
  chartHistoryLimit: 360,
  chartStaleAfterMs: 3000,
  chartPairIdleTtlMs: 15000,
  chartMaxPairsPerStream: 3,
  chartMaxActivePairsGlobal: 256,
  chartBatchMaxPairs: 8,
  chartBootstrapLimit: 60,
  chartHistoryBackfillEnabled: true,
  chartHistoryWarmupTopPairs: 10,
  chartHistoryCacheTtlSeconds: 43_200,
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

function parseFloatEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw === undefined) {
    return fallback
  }

  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid ${name}: expected number between ${min} and ${max}`)
  }

  return parsed
}

export function loadEnv(): BackendEnv {
  const chartHistoryProvider = (process.env.CHART_HISTORY_PROVIDER ?? DEFAULTS.chartHistoryProvider).trim().toLowerCase()
  if (chartHistoryProvider !== 'public' && chartHistoryProvider !== 'none') {
    throw new Error(`Invalid CHART_HISTORY_PROVIDER: ${chartHistoryProvider}`)
  }
  const isProduction = (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production'

  return {
    host: process.env.HOST ?? DEFAULTS.host,
    port: parseIntEnv('PORT', DEFAULTS.port, 1),
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseRequestTimeoutMs: parseIntEnv(
      'SUPABASE_REQUEST_TIMEOUT_MS',
      DEFAULTS.supabaseRequestTimeoutMs,
      500,
    ),
    supabaseReadEnabled: parseBoolEnv('SUPABASE_READ_ENABLED', DEFAULTS.supabaseReadEnabled),
    supabaseDualWriteEnabled: parseBoolEnv('SUPABASE_DUAL_WRITE_ENABLED', DEFAULTS.supabaseDualWriteEnabled),
    tokenIngestIntervalSeconds: parseIntEnv(
      'TOKEN_INGEST_INTERVAL_SECONDS',
      DEFAULTS.tokenIngestIntervalSeconds,
      5,
    ),
    tokenCandleRetentionDays: parseIntEnv('TOKEN_CANDLE_RETENTION_DAYS', DEFAULTS.tokenCandleRetentionDays, 1),
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL,
    alertWebhookTimeoutMs: parseIntEnv(
      'ALERT_WEBHOOK_TIMEOUT_MS',
      DEFAULTS.alertWebhookTimeoutMs,
      200,
    ),
    alertWebhookRetryCount: parseIntEnv(
      'ALERT_WEBHOOK_RETRY_COUNT',
      DEFAULTS.alertWebhookRetryCount,
      0,
    ),
    alertWebhookCooldownSeconds: parseIntEnv(
      'ALERT_WEBHOOK_COOLDOWN_SECONDS',
      DEFAULTS.alertWebhookCooldownSeconds,
      0,
    ),
    alertFeedSeedRateThreshold: parseFloatEnv(
      'ALERT_FEED_SEED_RATE_THRESHOLD',
      DEFAULTS.alertFeedSeedRateThreshold,
      0,
      1,
    ),
    alertSupabaseFailureRateThreshold: parseFloatEnv(
      'ALERT_SUPABASE_FAILURE_RATE_THRESHOLD',
      DEFAULTS.alertSupabaseFailureRateThreshold,
      0,
      1,
    ),
    alertMinRequests: parseIntEnv('ALERT_MIN_REQUESTS', DEFAULTS.alertMinRequests, 1),
    redisUrl: process.env.REDIS_URL,
    feedCacheTtlSeconds: parseIntEnv('FEED_CACHE_TTL_SECONDS', DEFAULTS.feedCacheTtlSeconds, 1),
    feedCacheStaleTtlSeconds: parseIntEnv('FEED_CACHE_STALE_TTL_SECONDS', DEFAULTS.feedCacheStaleTtlSeconds, 1),
    feedCursorTtlSeconds: parseIntEnv('FEED_CURSOR_TTL_SECONDS', DEFAULTS.feedCursorTtlSeconds, 1),
    feedSnapshotHistoryMax: parseIntEnv('FEED_SNAPSHOT_HISTORY_MAX', DEFAULTS.feedSnapshotHistoryMax, 1),
    feedEnableSeedFallback: parseBoolEnv('FEED_ENABLE_SEED_FALLBACK', !isProduction),
    feedMinChartCandles: parseIntEnv('FEED_MIN_CHART_CANDLES', DEFAULTS.feedMinChartCandles, 0),
    feedRequireFullChartHistory: parseBoolEnv(
      'FEED_REQUIRE_FULL_CHART_HISTORY',
      DEFAULTS.feedRequireFullChartHistory,
    ),
    feedDefaultLimit: parseIntEnv('FEED_DEFAULT_LIMIT', DEFAULTS.feedDefaultLimit, 1),
    feedMaxLimit: parseIntEnv('FEED_MAX_LIMIT', DEFAULTS.feedMaxLimit, 1),
    dexScreenerTimeoutMs: parseIntEnv('DEXSCREENER_TIMEOUT_MS', DEFAULTS.dexScreenerTimeoutMs, 200),
    dexScreenerSearchQuery: process.env.DEXSCREENER_SEARCH_QUERY ?? DEFAULTS.dexScreenerSearchQuery,
    dexScreenerTokenMints: process.env.DEXSCREENER_TOKEN_MINTS,
    birdeyeApiKey: process.env.BIRDEYE_API_KEY,
    birdeyeTimeoutMs: parseIntEnv('BIRDEYE_TIMEOUT_MS', DEFAULTS.birdeyeTimeoutMs, 200),
    heliusApiKey: process.env.HELIUS_API_KEY,
    heliusDasUrl: process.env.HELIUS_DAS_URL ?? DEFAULTS.heliusDasUrl,
    heliusTimeoutMs: parseIntEnv('HELIUS_TIMEOUT_MS', DEFAULTS.heliusTimeoutMs, 200),
    jupiterTagsTtlMs: parseIntEnv('JUPITER_TAGS_TTL_MS', DEFAULTS.jupiterTagsTtlMs, 1),
    feedEnrichmentMaxItems: parseIntEnv('FEED_ENRICHMENT_MAX_ITEMS', DEFAULTS.feedEnrichmentMaxItems, 1),
    feedEnrichmentConcurrency: parseIntEnv('FEED_ENRICHMENT_CONCURRENCY', DEFAULTS.feedEnrichmentConcurrency, 1),
    feedSparklineWindowMinutes: parseIntEnv(
      'FEED_SPARKLINE_WINDOW_MINUTES',
      DEFAULTS.feedSparklineWindowMinutes,
      1,
    ),
    feedSparklinePoints: parseIntEnv('FEED_SPARKLINE_POINTS', DEFAULTS.feedSparklinePoints, 2),
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
    chartHistoryCacheTtlSeconds: parseIntEnv(
      'CHART_HISTORY_CACHE_TTL_SECONDS',
      DEFAULTS.chartHistoryCacheTtlSeconds,
      1,
    ),
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
