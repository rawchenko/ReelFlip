import assert from 'node:assert/strict'
import test from 'node:test'
import { ChartHistoryCache } from './chart.history-cache.js'

const logger = {
  info: () => undefined,
  warn: () => undefined,
}

test('historical write + runtime upsert merges candles and preserves backfill metadata', async () => {
  const cache = new ChartHistoryCache({
    maxCandles: 10,
    logger,
  })

  const pairAddress = 'pair-cache-merge'
  await cache.writeHistorical(pairAddress, [
    { timeSec: 100, open: 1, high: 2, low: 0.5, close: 1.5 },
    { timeSec: 160, open: 1.5, high: 1.8, low: 1.4, close: 1.7 },
  ])

  await cache.upsertRuntimeCandle(pairAddress, {
    timeSec: 160,
    open: 1.5,
    high: 2.1,
    low: 1.2,
    close: 2.0,
  })

  await cache.upsertRuntimeCandle(pairAddress, {
    timeSec: 220,
    open: 2.0,
    high: 2.2,
    low: 1.9,
    close: 2.1,
  })

  const read = await cache.readPair(pairAddress)
  assert.equal(read.storage, 'memory_cache')
  assert.ok(read.entry)
  assert.equal(read.entry?.hasHistoricalBackfill, true)
  assert.equal(read.entry?.lastWriteSource, 'runtime_aggregator')
  assert.equal(read.entry?.candles.length, 3)

  const overlapping = read.entry?.candles.find((candle) => candle.timeSec === 160)
  assert.ok(overlapping)
  assert.equal(overlapping?.close, 2.0)
  assert.equal(overlapping?.high, 2.1)
  assert.equal(overlapping?.low, 1.2)

  await cache.close()
})

test('stores 1s and 1m candles in separate cache entries', async () => {
  const cache = new ChartHistoryCache({
    maxCandles: 10,
    logger,
  })

  const pairAddress = 'pair-cache-intervals'
  await cache.upsertRuntimeCandle(
    pairAddress,
    { timeSec: 100, open: 1, high: 1.1, low: 0.9, close: 1.05 },
    '1s',
  )
  await cache.upsertRuntimeCandle(
    pairAddress,
    { timeSec: 120, open: 2, high: 2.1, low: 1.9, close: 2.05 },
    '1m',
  )

  const read1s = await cache.readPair(pairAddress, '1s')
  const read1m = await cache.readPair(pairAddress, '1m')

  assert.equal(read1s.entry?.candles.length, 1)
  assert.equal(read1m.entry?.candles.length, 1)
  assert.equal(read1s.entry?.candles[0]?.open, 1)
  assert.equal(read1m.entry?.candles[0]?.open, 2)

  await cache.close()
})

test('evicts stale memory entries based on ttlSeconds configuration', async () => {
  const cache = new ChartHistoryCache({
    maxCandles: 10,
    ttlSeconds: 60,
    logger,
  })

  const pairAddress = 'pair-cache-ttl'
  await cache.upsertRuntimeCandle(pairAddress, {
    timeSec: 100,
    open: 1,
    high: 1.1,
    low: 0.9,
    close: 1.05,
  })

  const memory = (cache as unknown as { memory: Map<string, { updatedAtMs: number }> }).memory
  const key = `chart:1m:${pairAddress}`
  const entry = memory.get(key)
  assert.ok(entry)
  if (entry) {
    entry.updatedAtMs = Date.now() - 61_000
    memory.set(key, entry)
  }

  const read = await cache.readPair(pairAddress)
  assert.equal(read.storage, 'miss')
  assert.equal(read.entry, null)

  await cache.close()
})
