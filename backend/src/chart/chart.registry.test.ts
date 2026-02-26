import assert from 'node:assert/strict'
import test from 'node:test'
import { ChartRegistry } from './chart.registry.js'
import { ChartProvider, ChartStreamEvent, ChartTickSample } from './chart.types.js'

class QueueChartProvider implements ChartProvider {
  constructor(private readonly queue: Array<ChartTickSample[] | Error>) {}

  async fetchPairSnapshots(_pairAddresses: string[], _signal: AbortSignal): Promise<ChartTickSample[]> {
    const next = this.queue.shift()
    if (next instanceof Error) {
      throw next
    }

    return next ?? []
  }
}

const logger = {
  info: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(predicate: () => boolean, timeoutMs = 250): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms`)
    }
    await delay(5)
  }
}

test('subscribers receive live status and candle updates, and snapshot can be built', async () => {
  const pairAddress = 'pair-live'
  const sample: ChartTickSample = {
    pairAddress,
    observedAtMs: Date.now(),
    priceUsd: 1.11,
  }

  const registry = new ChartRegistry(
    new QueueChartProvider([[sample]]),
    {
      enabled: true,
      pollIntervalMs: 60_000,
      historyLimit: 10,
      staleAfterMs: 1_000,
      pairIdleTtlMs: 5_000,
      maxPairsPerStream: 3,
      maxActivePairsGlobal: 10,
    },
    logger,
  )

  const events: ChartStreamEvent[] = []
  const unsubscribe = registry.subscribe([pairAddress], (event) => {
    events.push(event)
  })

  await waitFor(
    () =>
      events.some((event) => event.type === 'status' && event.pairAddress === pairAddress && event.status === 'live') &&
      events.some((event) => event.type === 'candle_update' && event.pairAddress === pairAddress),
  )

  const snapshot = registry.buildSnapshotEvent(pairAddress, 10)
  assert.ok(snapshot)
  assert.equal(snapshot?.type, 'snapshot')
  assert.equal(snapshot?.pairAddress, pairAddress)
  assert.equal(snapshot?.candles.length, 1)

  unsubscribe()
  await registry.close()
})

test('pair transitions to delayed after stale threshold', async () => {
  const pairAddress = 'pair-delayed'
  const sample: ChartTickSample = {
    pairAddress,
    observedAtMs: Date.now(),
    priceUsd: 2.22,
  }

  const registry = new ChartRegistry(
    new QueueChartProvider([[sample]]),
    {
      enabled: true,
      pollIntervalMs: 60_000,
      historyLimit: 10,
      staleAfterMs: 25,
      pairIdleTtlMs: 5_000,
      maxPairsPerStream: 3,
      maxActivePairsGlobal: 10,
    },
    logger,
  )

  const unsubscribe = registry.subscribe([pairAddress], () => undefined)
  await waitFor(() => {
    const event = registry.buildStatusEvent(pairAddress)
    return event.type === 'status' && event.status === 'live'
  })

  await delay(35)
  const snapshot = registry.getPairSnapshot(pairAddress, 10)
  const statusEvent = registry.buildStatusEvent(pairAddress)
  assert.equal(statusEvent.type, 'status')

  assert.equal(snapshot.delayed, true)
  if (statusEvent.type === 'status') {
    assert.equal(statusEvent.status, 'delayed')
  }

  unsubscribe()
  await registry.close()
})

test('seeding with no snapshot marks pair reconnecting', async () => {
  const pairAddress = 'pair-missing'
  const registry = new ChartRegistry(
    new QueueChartProvider([[]]),
    {
      enabled: true,
      pollIntervalMs: 60_000,
      historyLimit: 10,
      staleAfterMs: 1_000,
      pairIdleTtlMs: 5_000,
      maxPairsPerStream: 3,
      maxActivePairsGlobal: 10,
    },
    logger,
  )

  await registry.ensurePairSeeded(pairAddress)
  const statusEvent = registry.buildStatusEvent(pairAddress)
  assert.equal(statusEvent.type, 'status')

  if (statusEvent.type === 'status') {
    assert.equal(statusEvent.status, 'reconnecting')
    assert.equal(statusEvent.reason, 'no_snapshot')
  }

  await registry.close()
})
