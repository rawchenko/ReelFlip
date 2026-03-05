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

test('loadEnv uses default chart history providers when env is absent', () => {
  withEnv({ CHART_HISTORY_PROVIDER: undefined, CHART_HISTORY_PROVIDER_FALLBACK: undefined }, () => {
    const env = loadEnv()
    assert.equal(env.chartHistoryProvider, 'public')
    assert.equal(env.chartHistoryProviderFallback, 'none')
  })
})

test('loadEnv parses chart history provider and fallback', () => {
  withEnv({ CHART_HISTORY_PROVIDER: 'birdeye', CHART_HISTORY_PROVIDER_FALLBACK: 'public' }, () => {
    const env = loadEnv()
    assert.equal(env.chartHistoryProvider, 'birdeye')
    assert.equal(env.chartHistoryProviderFallback, 'public')
  })
})

test('loadEnv rejects invalid CHART_HISTORY_PROVIDER_FALLBACK', () => {
  withEnv({ CHART_HISTORY_PROVIDER_FALLBACK: 'invalid' }, () => {
    assert.throws(() => loadEnv(), /Invalid CHART_HISTORY_PROVIDER_FALLBACK/)
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

test('loadEnv uses aggressive enrichment defaults when env is absent', () => {
  withEnv(
    {
      FEED_REFRESH_INTERVAL_SECONDS: undefined,
      FEED_ENRICHMENT_MAX_ITEMS: undefined,
      FEED_ENRICHMENT_CONCURRENCY: undefined,
      FEED_HELIUS_METADATA_ENABLED: undefined,
      FEED_MARKET_TTL_SECONDS: undefined,
      FEED_MARKET_CACHE_MAX_KEYS: undefined,
      FEED_METADATA_TTL_SECONDS: undefined,
      FEED_METADATA_CACHE_MAX_KEYS: undefined,
      FEED_TRUST_TAGS_CACHE_MAX_KEYS: undefined,
      FEED_ENRICHMENT_FAILURE_COOLDOWN_SECONDS: undefined,
    },
    () => {
      const env = loadEnv()
      assert.equal(env.feedRefreshIntervalSeconds, 30)
      assert.equal(env.feedEnrichmentMaxItems, 20)
      assert.equal(env.feedEnrichmentConcurrency, 4)
      assert.equal(env.feedHeliusMetadataEnabled, false)
      assert.equal(env.feedMarketTtlSeconds, 60)
      assert.equal(env.feedMarketCacheMaxKeys, 2000)
      assert.equal(env.feedMetadataTtlSeconds, 43_200)
      assert.equal(env.feedMetadataCacheMaxKeys, 2000)
      assert.equal(env.feedTrustTagsCacheMaxKeys, 2000)
      assert.equal(env.feedEnrichmentFailureCooldownSeconds, 300)
    },
  )
})

test('loadEnv parses enrichment ttl and cooldown controls', () => {
  withEnv(
    {
      FEED_HELIUS_METADATA_ENABLED: 'true',
      FEED_MARKET_TTL_SECONDS: '120',
      FEED_MARKET_CACHE_MAX_KEYS: '2500',
      FEED_METADATA_TTL_SECONDS: '86400',
      FEED_METADATA_CACHE_MAX_KEYS: '2600',
      FEED_TRUST_TAGS_CACHE_MAX_KEYS: '2700',
      FEED_ENRICHMENT_FAILURE_COOLDOWN_SECONDS: '30',
    },
    () => {
      const env = loadEnv()
      assert.equal(env.feedHeliusMetadataEnabled, true)
      assert.equal(env.feedMarketTtlSeconds, 120)
      assert.equal(env.feedMarketCacheMaxKeys, 2500)
      assert.equal(env.feedMetadataTtlSeconds, 86_400)
      assert.equal(env.feedMetadataCacheMaxKeys, 2600)
      assert.equal(env.feedTrustTagsCacheMaxKeys, 2700)
      assert.equal(env.feedEnrichmentFailureCooldownSeconds, 30)
    },
  )
})

test('loadEnv rejects enrichment cache max keys below 1', () => {
  withEnv({ FEED_MARKET_CACHE_MAX_KEYS: '0' }, () => {
    assert.throws(() => loadEnv(), /Invalid FEED_MARKET_CACHE_MAX_KEYS/)
  })

  withEnv({ FEED_METADATA_CACHE_MAX_KEYS: '0' }, () => {
    assert.throws(() => loadEnv(), /Invalid FEED_METADATA_CACHE_MAX_KEYS/)
  })

  withEnv({ FEED_TRUST_TAGS_CACHE_MAX_KEYS: '0' }, () => {
    assert.throws(() => loadEnv(), /Invalid FEED_TRUST_TAGS_CACHE_MAX_KEYS/)
  })
})

test('loadEnv uses default trending policy settings when env is absent', () => {
  withEnv(
    {
      FEED_TRENDING_MIN_LIFETIME_HOURS: undefined,
      FEED_TRENDING_EXCLUDE_RISK_BLOCK: undefined,
      FEED_TRENDING_REQUIRE_PROVIDER_SOURCE: undefined,
    },
    () => {
      const env = loadEnv()
      assert.equal(env.feedTrendingMinLifetimeHours, 6)
      assert.equal(env.feedTrendingExcludeRiskBlock, true)
      assert.equal(env.feedTrendingRequireProviderSource, true)
    },
  )
})

test('loadEnv parses trending policy settings', () => {
  withEnv(
    {
      FEED_TRENDING_MIN_LIFETIME_HOURS: '12',
      FEED_TRENDING_EXCLUDE_RISK_BLOCK: 'false',
      FEED_TRENDING_REQUIRE_PROVIDER_SOURCE: '0',
    },
    () => {
      const env = loadEnv()
      assert.equal(env.feedTrendingMinLifetimeHours, 12)
      assert.equal(env.feedTrendingExcludeRiskBlock, false)
      assert.equal(env.feedTrendingRequireProviderSource, false)
    },
  )
})

test('loadEnv rejects invalid FEED_TRENDING_MIN_LIFETIME_HOURS', () => {
  withEnv({ FEED_TRENDING_MIN_LIFETIME_HOURS: '-1' }, () => {
    assert.throws(() => loadEnv(), /Invalid FEED_TRENDING_MIN_LIFETIME_HOURS/)
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
