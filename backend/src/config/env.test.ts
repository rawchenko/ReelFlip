import assert from 'node:assert/strict'
import test from 'node:test'
import { loadEnv } from './env.js'

function withEnv(overrides: Record<string, string | undefined>, callback: () => void): void {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
      continue
    }
    process.env[key] = value
  }

  try {
    callback()
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
        continue
      }
      process.env[key] = value
    }
  }
}

test('loadEnv uses default chart history cache ttl when env is absent', () => {
  withEnv({ CHART_HISTORY_CACHE_TTL_SECONDS: undefined }, () => {
    const env = loadEnv()
    assert.equal(env.chartHistoryCacheTtlSeconds, 43_200)
  })
})

test('loadEnv parses CHART_HISTORY_CACHE_TTL_SECONDS', () => {
  withEnv({ CHART_HISTORY_CACHE_TTL_SECONDS: '12345' }, () => {
    const env = loadEnv()
    assert.equal(env.chartHistoryCacheTtlSeconds, 12_345)
  })
})

test('loadEnv rejects invalid CHART_HISTORY_CACHE_TTL_SECONDS', () => {
  withEnv({ CHART_HISTORY_CACHE_TTL_SECONDS: 'invalid' }, () => {
    assert.throws(() => loadEnv(), /Invalid CHART_HISTORY_CACHE_TTL_SECONDS/)
  })
})

test('loadEnv uses default token ingest values when env is absent', () => {
  withEnv(
    {
      TOKEN_INGEST_INTERVAL_SECONDS: undefined,
      TOKEN_CANDLE_RETENTION_DAYS: undefined,
      SUPABASE_PREFER_READ_FIRST: undefined,
    },
    () => {
      const env = loadEnv()
      assert.equal(env.tokenIngestIntervalSeconds, 300)
      assert.equal(env.tokenCandleRetentionDays, 14)
      assert.equal(env.supabasePreferReadFirst, false)
    },
  )
})

test('loadEnv parses supabase toggles', () => {
  withEnv(
    {
      SUPABASE_READ_ENABLED: 'true',
      SUPABASE_PREFER_READ_FIRST: 'true',
      SUPABASE_DUAL_WRITE_ENABLED: '1',
    },
    () => {
      const env = loadEnv()
      assert.equal(env.supabaseReadEnabled, true)
      assert.equal(env.supabasePreferReadFirst, true)
      assert.equal(env.supabaseDualWriteEnabled, true)
    },
  )
})

test('loadEnv uses default alert settings when env is absent', () => {
  withEnv(
    {
      ALERT_WEBHOOK_TIMEOUT_MS: undefined,
      ALERT_WEBHOOK_RETRY_COUNT: undefined,
      ALERT_WEBHOOK_COOLDOWN_SECONDS: undefined,
      ALERT_FEED_SEED_RATE_THRESHOLD: undefined,
      ALERT_SUPABASE_FAILURE_RATE_THRESHOLD: undefined,
      ALERT_MIN_REQUESTS: undefined,
    },
    () => {
      const env = loadEnv()
      assert.equal(env.alertWebhookTimeoutMs, 3000)
      assert.equal(env.alertWebhookRetryCount, 2)
      assert.equal(env.alertWebhookCooldownSeconds, 300)
      assert.equal(env.alertFeedSeedRateThreshold, 0.4)
      assert.equal(env.alertSupabaseFailureRateThreshold, 0.2)
      assert.equal(env.alertMinRequests, 20)
    },
  )
})

test('loadEnv parses alert settings', () => {
  withEnv(
    {
      ALERT_WEBHOOK_TIMEOUT_MS: '4500',
      ALERT_WEBHOOK_RETRY_COUNT: '3',
      ALERT_WEBHOOK_COOLDOWN_SECONDS: '120',
      ALERT_FEED_SEED_RATE_THRESHOLD: '0.5',
      ALERT_SUPABASE_FAILURE_RATE_THRESHOLD: '0.15',
      ALERT_MIN_REQUESTS: '25',
    },
    () => {
      const env = loadEnv()
      assert.equal(env.alertWebhookTimeoutMs, 4500)
      assert.equal(env.alertWebhookRetryCount, 3)
      assert.equal(env.alertWebhookCooldownSeconds, 120)
      assert.equal(env.alertFeedSeedRateThreshold, 0.5)
      assert.equal(env.alertSupabaseFailureRateThreshold, 0.15)
      assert.equal(env.alertMinRequests, 25)
    },
  )
})

test('loadEnv derives runtimeMode from NODE_ENV when RUNTIME_MODE is absent', () => {
  withEnv({ RUNTIME_MODE: undefined, NODE_ENV: 'production' }, () => {
    const env = loadEnv()
    assert.equal(env.runtimeMode, 'prod')
    assert.equal(env.cacheRequired, true)
  })
})

test('loadEnv accepts explicit runtime/cache controls', () => {
  withEnv(
    {
      RUNTIME_MODE: 'dev',
      CACHE_REQUIRED: 'true',
      ALLOW_DEGRADED_START: 'true',
      REDIS_CONNECT_TIMEOUT_MS: '2500',
      FEED_REFRESH_INTERVAL_SECONDS: '7',
      CHART_STREAM_MAX_LEN: '2222',
    },
    () => {
      const env = loadEnv()
      assert.equal(env.runtimeMode, 'dev')
      assert.equal(env.cacheRequired, true)
      assert.equal(env.allowDegradedStart, true)
      assert.equal(env.redisConnectTimeoutMs, 2500)
      assert.equal(env.feedRefreshIntervalSeconds, 7)
      assert.equal(env.chartStreamMaxLen, 2222)
    },
  )
})
