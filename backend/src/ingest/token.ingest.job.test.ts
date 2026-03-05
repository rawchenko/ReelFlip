import assert from 'node:assert/strict'
import test from 'node:test'
import { FeedService } from '../feed/feed.service.js'
import { TokenIngestJob } from './token.ingest.job.js'

class FakeFeedService {
  calls = 0
  shouldThrow = false
  persistenceStatus: 'skipped' | 'succeeded' | 'failed' = 'succeeded'
  persistenceErrorMessage?: string

  async refreshSnapshotWithOutcome(): Promise<{
    snapshot: { id: string; source: 'providers'; items: unknown[] }
    persistence: { status: 'skipped' | 'succeeded' | 'failed'; errorMessage?: string }
  }> {
    this.calls += 1
    if (this.shouldThrow) {
      throw new Error('boom')
    }

    return {
      snapshot: {
        id: `snap-${this.calls}`,
        source: 'providers',
        items: [1, 2, 3],
      },
      persistence: {
        status: this.persistenceStatus,
        ...(this.persistenceStatus === 'failed' && this.persistenceErrorMessage
          ? { errorMessage: this.persistenceErrorMessage }
          : {}),
      },
    }
  }

  async refreshSnapshot(): Promise<{ id: string; source: 'providers'; items: unknown[] }> {
    const result = await this.refreshSnapshotWithOutcome()
    return result.snapshot
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
    refreshSuccess: 0,
    durableSuccess: 0,
    recordIngestSuccess() {
      this.success += 1
    },
    recordIngestFailure() {
      this.failure += 1
    },
    recordIngestSkippedOverlap() {
      this.skip += 1
    },
    recordIngestRefreshSuccess() {
      this.refreshSuccess += 1
    },
    recordIngestDurableSuccess() {
      this.durableSuccess += 1
    },
  }

  const logs: Array<{ level: 'info' | 'warn'; msg?: string }> = []
  const job = new TokenIngestJob(
    feed as unknown as FeedService,
    chartRepo as any,
    {
      intervalSeconds: 300,
      candleRetentionDays: 14,
      requireDurablePersistence: false,
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
  assert.equal(metrics.refreshSuccess, 1)
  assert.equal(metrics.durableSuccess, 1)
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
      requireDurablePersistence: false,
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
      requireDurablePersistence: false,
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
      requireDurablePersistence: false,
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

test('durable persistence failure fails cycle when strict mode is enabled', async () => {
  const feed = new FakeFeedService()
  feed.persistenceStatus = 'failed'
  feed.persistenceErrorMessage = 'forced durable write failure'

  const metrics = {
    success: 0,
    failure: 0,
    durableFailure: 0,
    recordIngestSuccess() {
      this.success += 1
    },
    recordIngestFailure() {
      this.failure += 1
    },
    recordIngestSkippedOverlap() {
      return undefined
    },
    recordIngestDurableFailure() {
      this.durableFailure += 1
    },
  }

  const job = new TokenIngestJob(
    feed as unknown as FeedService,
    null,
    {
      intervalSeconds: 60,
      candleRetentionDays: 14,
      requireDurablePersistence: true,
    },
    {
      warn: () => undefined,
    },
    metrics,
  )

  await (job as any).runCycle('startup')

  assert.equal(metrics.success, 0)
  assert.equal(metrics.failure, 1)
  assert.equal(metrics.durableFailure, 1)
})

test('durable persistence failure keeps cycle successful when strict mode is disabled', async () => {
  const feed = new FakeFeedService()
  feed.persistenceStatus = 'failed'
  feed.persistenceErrorMessage = 'forced durable write failure'

  const metrics = {
    success: 0,
    failure: 0,
    durableFailure: 0,
    recordIngestSuccess() {
      this.success += 1
    },
    recordIngestFailure() {
      this.failure += 1
    },
    recordIngestSkippedOverlap() {
      return undefined
    },
    recordIngestDurableFailure() {
      this.durableFailure += 1
    },
  }

  const job = new TokenIngestJob(
    feed as unknown as FeedService,
    null,
    {
      intervalSeconds: 60,
      candleRetentionDays: 14,
      requireDurablePersistence: false,
    },
    {
      warn: () => undefined,
    },
    metrics,
  )

  await (job as any).runCycle('startup')

  assert.equal(metrics.success, 1)
  assert.equal(metrics.failure, 0)
  assert.equal(metrics.durableFailure, 1)
})

test('runCycle emits durable failure threshold callback on repeated durable failures', async () => {
  const feed = new FakeFeedService()
  feed.persistenceStatus = 'failed'
  feed.persistenceErrorMessage = 'forced durable write failure'
  const events: Array<{ type: 'durable-threshold'; consecutiveDurableFailures: number }> = []

  const job = new TokenIngestJob(
    feed as unknown as FeedService,
    null,
    {
      intervalSeconds: 60,
      candleRetentionDays: 14,
      requireDurablePersistence: false,
    },
    {
      warn: () => undefined,
    },
    undefined,
    {
      onDurableFailureThreshold: (event) =>
        events.push({ type: 'durable-threshold', consecutiveDurableFailures: event.consecutiveDurableFailures }),
    },
  )

  await (job as any).runCycle('startup')
  await (job as any).runCycle('interval')

  assert.equal(events.length, 1)
  assert.equal(events[0]?.type, 'durable-threshold')
  assert.equal(events[0]?.consecutiveDurableFailures, 2)
})
