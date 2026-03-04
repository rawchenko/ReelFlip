import assert from 'node:assert/strict'
import test from 'node:test'
import { BackendMetrics } from './backend.metrics.js'

test('records supabase, ingest, and feed counters', () => {
  const metrics = new BackendMetrics()

  metrics.recordSupabaseRequest({
    tableOrView: 'tokens',
    method: 'POST',
    attempt: 1,
    durationMs: 20,
    status: 200,
    success: true,
    retried: false,
  })
  metrics.recordSupabaseRequest({
    tableOrView: 'tokens',
    method: 'POST',
    attempt: 2,
    durationMs: 50,
    status: 503,
    success: false,
    retried: true,
    errorType: 'http',
  })

  metrics.recordIngestSuccess()
  metrics.recordIngestDuration(450)
  metrics.recordIngestFailure()
  metrics.recordIngestDuration(150)
  metrics.recordIngestSkippedOverlap()
  metrics.recordSupabaseRowsWritten('tokens', 10)
  metrics.recordSupabaseRowsWritten('token_market_latest', 10)

  metrics.recordFeedPage({ source: 'providers', cacheStatus: 'HIT' })
  metrics.recordFeedPage({ source: 'seed', cacheStatus: 'MISS' })
  metrics.recordFeedPage({ source: 'providers', cacheStatus: 'STALE' })
  metrics.recordFeedUnavailable()

  const snapshot = metrics.snapshot() as {
    supabase: {
      totalRequests: number
      failedRequests: number
      retriedAttempts: number
      rowsWrittenTotal: number
      rowsWrittenByTable: Record<string, number>
    }
    ingest: { successCount: number; failureCount: number; overlapSkipCount: number; avgDurationMs: number; lastDurationMs: number }
    feed: { totalRequests: number; sourceProviders: number; sourceSeed: number; unavailable: number; seedRate: number; staleRate: number }
  }

  assert.equal(snapshot.supabase.totalRequests, 2)
  assert.equal(snapshot.supabase.failedRequests, 1)
  assert.equal(snapshot.supabase.retriedAttempts, 1)
  assert.equal(snapshot.supabase.rowsWrittenTotal, 20)
  assert.equal(snapshot.supabase.rowsWrittenByTable.tokens, 10)
  assert.equal(snapshot.supabase.rowsWrittenByTable.token_market_latest, 10)
  assert.equal(snapshot.ingest.successCount, 1)
  assert.equal(snapshot.ingest.failureCount, 1)
  assert.equal(snapshot.ingest.overlapSkipCount, 1)
  assert.equal(snapshot.ingest.avgDurationMs, 300)
  assert.equal(snapshot.ingest.lastDurationMs, 150)
  assert.equal(snapshot.feed.totalRequests, 3)
  assert.equal(snapshot.feed.sourceProviders, 2)
  assert.equal(snapshot.feed.sourceSeed, 1)
  assert.equal(snapshot.feed.seedRate, 0.333333)
  assert.equal(snapshot.feed.staleRate, 0.333333)
  assert.equal(snapshot.feed.unavailable, 1)
})

test('emits seed-rate alert only after threshold and request minimum', () => {
  const metrics = new BackendMetrics()

  for (let index = 0; index < 10; index += 1) {
    metrics.recordFeedPage({ source: 'seed', cacheStatus: 'MISS' })
  }
  for (let index = 0; index < 10; index += 1) {
    metrics.recordFeedPage({ source: 'providers', cacheStatus: 'HIT' })
  }

  const first = metrics.maybeFeedSeedRateAlert(0.4, 20)
  assert.equal(first.shouldAlert, true)
  assert.ok(first.seedRate >= 0.4)

  const second = metrics.maybeFeedSeedRateAlert(0.4, 20)
  assert.equal(second.shouldAlert, false)
})

test('emits supabase failure-rate alert only after threshold and request minimum', () => {
  const metrics = new BackendMetrics()

  for (let index = 0; index < 10; index += 1) {
    metrics.recordSupabaseRequest({
      tableOrView: 'tokens',
      method: 'POST',
      attempt: 1,
      durationMs: 10,
      status: 200,
      success: true,
      retried: false,
    })
  }
  for (let index = 0; index < 10; index += 1) {
    metrics.recordSupabaseRequest({
      tableOrView: 'tokens',
      method: 'POST',
      attempt: 1,
      durationMs: 12,
      status: 503,
      success: false,
      retried: true,
      errorType: 'http',
    })
  }

  const first = metrics.maybeSupabaseFailureRateAlert(0.4, 20)
  assert.equal(first.shouldAlert, true)
  assert.ok(first.failureRate >= 0.4)

  const second = metrics.maybeSupabaseFailureRateAlert(0.4, 20)
  assert.equal(second.shouldAlert, false)
})
