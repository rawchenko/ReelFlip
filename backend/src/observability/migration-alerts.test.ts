import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildFeedSeedRateAlert,
  buildIngestDurableFailureThresholdAlert,
  buildIngestFailureThresholdAlert,
  buildIngestMissedIntervalsAlert,
  buildSupabaseFailureRateAlert,
} from './migration-alerts.js'

const context = {
  service: 'reelflip-backend',
  environment: 'test',
}

test('buildFeedSeedRateAlert maps fields into webhook payload schema', () => {
  const alert = buildFeedSeedRateAlert(context, { seedRate: 0.51234, totalRequests: 100 }, '2026-03-04T00:00:00.000Z')

  assert.equal(alert.type, 'feed_seed_rate_high')
  assert.equal(alert.severity, 'warning')
  assert.equal(alert.detectedAt, '2026-03-04T00:00:00.000Z')
  assert.equal(alert.service, 'reelflip-backend')
  assert.equal(alert.environment, 'test')
  assert.equal(alert.metrics.seedRate, 0.51234)
  assert.equal(alert.metrics.totalRequests, 100)
})

test('buildSupabaseFailureRateAlert maps fields into webhook payload schema', () => {
  const alert = buildSupabaseFailureRateAlert(
    context,
    {
      failureRate: 0.25,
      totalRequests: 200,
      failedRequests: 50,
    },
    '2026-03-04T00:00:00.000Z',
  )

  assert.equal(alert.type, 'supabase_failure_rate_high')
  assert.equal(alert.severity, 'critical')
  assert.equal(alert.metrics.failureRate, 0.25)
  assert.equal(alert.metrics.totalRequests, 200)
  assert.equal(alert.metrics.failedRequests, 50)
})

test('buildIngestFailureThresholdAlert maps fields into webhook payload schema', () => {
  const alert = buildIngestFailureThresholdAlert(
    context,
    {
      consecutiveFailures: 3,
      cycle: 14,
      intervalSeconds: 300,
    },
    '2026-03-04T00:00:00.000Z',
  )

  assert.equal(alert.type, 'ingest_failure_threshold')
  assert.equal(alert.severity, 'critical')
  assert.equal(alert.metrics.consecutiveFailures, 3)
  assert.equal(alert.metrics.cycle, 14)
  assert.equal(alert.metrics.intervalSeconds, 300)
})

test('buildIngestMissedIntervalsAlert maps fields into webhook payload schema', () => {
  const alert = buildIngestMissedIntervalsAlert(
    context,
    {
      missedIntervals: 4,
      lagMs: 1_800_000,
      intervalSeconds: 300,
    },
    '2026-03-04T00:00:00.000Z',
  )

  assert.equal(alert.type, 'ingest_missed_intervals')
  assert.equal(alert.severity, 'warning')
  assert.equal(alert.metrics.missedIntervals, 4)
  assert.equal(alert.metrics.lagMs, 1_800_000)
  assert.equal(alert.metrics.intervalSeconds, 300)
})

test('buildIngestDurableFailureThresholdAlert maps fields into webhook payload schema', () => {
  const alert = buildIngestDurableFailureThresholdAlert(
    context,
    {
      consecutiveDurableFailures: 4,
      cycle: 22,
      intervalSeconds: 300,
    },
    '2026-03-04T00:00:00.000Z',
  )

  assert.equal(alert.type, 'ingest_durable_failure_threshold')
  assert.equal(alert.severity, 'critical')
  assert.equal(alert.metrics.consecutiveDurableFailures, 4)
  assert.equal(alert.metrics.cycle, 22)
  assert.equal(alert.metrics.intervalSeconds, 300)
})
