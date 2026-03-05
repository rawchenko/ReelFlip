import assert from 'node:assert/strict'
import test from 'node:test'
import { FallbackHistoricalCandleProvider } from './chart.history-provider.composite.js'
import { HistoricalCandleProvider, HistoricalCandleProviderFetchParams } from './chart.history-provider.js'
import { OhlcCandle } from './chart.types.js'

class StaticProvider implements HistoricalCandleProvider {
  callCount = 0

  constructor(
    readonly name: string,
    private readonly candles: OhlcCandle[],
  ) {}

  async fetch1mCandles(_params: HistoricalCandleProviderFetchParams): Promise<OhlcCandle[]> {
    this.callCount += 1
    return this.candles
  }
}

const logger = {
  info: () => undefined,
  warn: () => undefined,
}

test('FallbackHistoricalCandleProvider returns primary candles when available', async () => {
  const primary = new StaticProvider('primary', [{ timeSec: 1, open: 1, high: 1, low: 1, close: 1 }])
  const fallback = new StaticProvider('fallback', [{ timeSec: 2, open: 2, high: 2, low: 2, close: 2 }])
  const provider = new FallbackHistoricalCandleProvider(primary, fallback, logger)

  const candles = await provider.fetch1mCandles({
    pairAddress: 'pair-a',
    limit: 10,
    signal: new AbortController().signal,
  })

  assert.equal(candles.length, 1)
  assert.equal(candles[0]?.timeSec, 1)
  assert.equal(primary.callCount, 1)
  assert.equal(fallback.callCount, 0)
})

test('FallbackHistoricalCandleProvider falls back when primary is empty', async () => {
  const primary = new StaticProvider('primary', [])
  const fallback = new StaticProvider('fallback', [{ timeSec: 2, open: 2, high: 2, low: 2, close: 2 }])
  const provider = new FallbackHistoricalCandleProvider(primary, fallback, logger)

  const candles = await provider.fetch1mCandles({
    pairAddress: 'pair-a',
    limit: 10,
    signal: new AbortController().signal,
  })

  assert.equal(candles.length, 1)
  assert.equal(candles[0]?.timeSec, 2)
  assert.equal(primary.callCount, 1)
  assert.equal(fallback.callCount, 1)
})
