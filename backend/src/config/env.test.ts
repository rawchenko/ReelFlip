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
  withEnv({ TOKEN_INGEST_INTERVAL_SECONDS: undefined, TOKEN_CANDLE_RETENTION_DAYS: undefined }, () => {
    const env = loadEnv()
    assert.equal(env.tokenIngestIntervalSeconds, 300)
    assert.equal(env.tokenCandleRetentionDays, 14)
  })
})

test('loadEnv parses supabase toggles', () => {
  withEnv({ SUPABASE_READ_ENABLED: 'true', SUPABASE_DUAL_WRITE_ENABLED: '1' }, () => {
    const env = loadEnv()
    assert.equal(env.supabaseReadEnabled, true)
    assert.equal(env.supabaseDualWriteEnabled, true)
  })
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
