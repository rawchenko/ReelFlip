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
  metrics.recordIngestFailure()
  metrics.recordIngestSkippedOverlap()

  metrics.recordFeedPage({ source: 'providers', cacheStatus: 'HIT' })
  metrics.recordFeedPage({ source: 'seed', cacheStatus: 'MISS' })
  metrics.recordFeedUnavailable()

  const snapshot = metrics.snapshot() as {
    supabase: { totalRequests: number; failedRequests: number; retriedAttempts: number }
    ingest: { successCount: number; failureCount: number; overlapSkipCount: number }
    feed: { totalRequests: number; sourceProviders: number; sourceSeed: number; unavailable: number }
  }

  assert.equal(snapshot.supabase.totalRequests, 2)
  assert.equal(snapshot.supabase.failedRequests, 1)
  assert.equal(snapshot.supabase.retriedAttempts, 1)
  assert.equal(snapshot.ingest.successCount, 1)
  assert.equal(snapshot.ingest.failureCount, 1)
  assert.equal(snapshot.ingest.overlapSkipCount, 1)
  assert.equal(snapshot.feed.totalRequests, 2)
  assert.equal(snapshot.feed.sourceProviders, 1)
  assert.equal(snapshot.feed.sourceSeed, 1)
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
