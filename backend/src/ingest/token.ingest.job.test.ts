import assert from 'node:assert/strict'
import test from 'node:test'
import { FeedService } from '../feed/feed.service.js'
import { TokenIngestJob } from './token.ingest.job.js'

class FakeFeedService {
  calls = 0
  shouldThrow = false

  async refreshSnapshot(): Promise<{ id: string; source: 'providers'; items: unknown[] }> {
    this.calls += 1
    if (this.shouldThrow) {
      throw new Error('boom')
    }

    return {
      id: `snap-${this.calls}`,
      source: 'providers',
      items: [1, 2, 3],
    }
  }
}

class FakeChartRepository {
  pruneCalls = 0

  async pruneOldCandles(_cutoffIso: string): Promise<number> {
    this.pruneCalls += 1
    return 5
  }
}

test('runCycle success records prune and metrics', async () => {
  const feed = new FakeFeedService()
  const chartRepo = new FakeChartRepository()

  const metrics = {
    success: 0,
    failure: 0,
    skip: 0,
    recordIngestSuccess() {
      this.success += 1
    },
    recordIngestFailure() {
      this.failure += 1
    },
    recordIngestSkippedOverlap() {
      this.skip += 1
    },
  }

  const logs: Array<{ level: 'info' | 'warn'; msg?: string }> = []
  const job = new TokenIngestJob(
    feed as unknown as FeedService,
    chartRepo as any,
    {
      intervalSeconds: 300,
      candleRetentionDays: 14,
    },
    {
      info: (_obj, msg) => logs.push({ level: 'info', msg }),
      warn: (_obj, msg) => logs.push({ level: 'warn', msg }),
    },
    metrics,
  )

  await (job as any).runCycle('startup')

  assert.equal(feed.calls, 1)
  assert.equal(chartRepo.pruneCalls, 1)
  assert.equal(metrics.success, 1)
  assert.equal(metrics.failure, 0)
  assert.ok(logs.some((entry) => entry.msg === 'Token ingest cycle completed'))
})

test('runCycle failure increments consecutive failures and emits threshold warning', async () => {
  const feed = new FakeFeedService()
  feed.shouldThrow = true

  const metrics = {
    success: 0,
    failure: 0,
    skip: 0,
    recordIngestSuccess() {
      this.success += 1
    },
    recordIngestFailure() {
      this.failure += 1
    },
    recordIngestSkippedOverlap() {
      this.skip += 1
    },
  }

  const logs: Array<{ level: 'info' | 'warn'; msg?: string }> = []
  const job = new TokenIngestJob(
    feed as unknown as FeedService,
    null,
    {
      intervalSeconds: 300,
      candleRetentionDays: 14,
    },
    {
      info: (_obj, msg) => logs.push({ level: 'info', msg }),
      warn: (_obj, msg) => logs.push({ level: 'warn', msg }),
    },
    metrics,
  )

  await (job as any).runCycle('startup')
  await (job as any).runCycle('interval')

  assert.equal(feed.calls, 2)
  assert.equal(metrics.failure, 2)
  assert.ok(logs.some((entry) => entry.msg === 'Token ingest cycle failed'))
  assert.ok(logs.some((entry) => entry.msg === 'Token ingest failure threshold reached'))
})

test('runCycle warns when ingest lags beyond two intervals since last success', async () => {
  const feed = new FakeFeedService()
  const logs: Array<{ level: 'info' | 'warn'; msg?: string }> = []
  const events: Array<{ type: 'missed'; missedIntervals: number }> = []

  const job = new TokenIngestJob(
    feed as unknown as FeedService,
    null,
    {
      intervalSeconds: 5,
      candleRetentionDays: 14,
    },
    {
      info: (_obj, msg) => logs.push({ level: 'info', msg }),
      warn: (_obj, msg) => logs.push({ level: 'warn', msg }),
    },
    undefined,
    {
      onMissedIntervals: (event) => events.push({ type: 'missed', missedIntervals: event.missedIntervals }),
    },
  )

  ;(job as any).lastSuccessAtMs = Date.now() - 11_000
  await (job as any).runCycle('interval')

  assert.ok(logs.some((entry) => entry.msg === 'Token ingest job appears to have missed scheduled intervals'))
  assert.equal(events.length, 1)
  assert.equal(events[0]?.type, 'missed')
})

test('runCycle emits failure threshold callback on repeated failures', async () => {
  const feed = new FakeFeedService()
  feed.shouldThrow = true
  const events: Array<{ type: 'threshold'; consecutiveFailures: number }> = []

  const job = new TokenIngestJob(
    feed as unknown as FeedService,
    null,
    {
      intervalSeconds: 60,
      candleRetentionDays: 14,
    },
    {
      warn: () => undefined,
    },
    undefined,
    {
      onFailureThreshold: (event) => events.push({ type: 'threshold', consecutiveFailures: event.consecutiveFailures }),
    },
  )

  await (job as any).runCycle('startup')
  await (job as any).runCycle('interval')

  assert.equal(events.length, 1)
  assert.equal(events[0]?.type, 'threshold')
  assert.equal(events[0]?.consecutiveFailures, 2)
})
