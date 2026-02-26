import assert from 'node:assert/strict'
import test from 'node:test'
import { ChartAggregator } from './chart.aggregator.js'

test('same-minute sample updates existing candle', () => {
  const aggregator = new ChartAggregator(10)
  const pairAddress = 'pair-1'
  const baseMs = Date.UTC(2026, 1, 26, 12, 0, 10)

  const first = aggregator.applySample({
    pairAddress,
    observedAtMs: baseMs,
    priceUsd: 1.25,
  })
  const second = aggregator.applySample({
    pairAddress,
    observedAtMs: baseMs + 15_000,
    priceUsd: 1.4,
  })

  assert.equal(first?.isNewCandle, true)
  assert.equal(second?.isNewCandle, false)

  const candles = aggregator.getCandles(pairAddress)
  assert.equal(candles.length, 1)
  assert.equal(candles[0]?.open, 1.25)
  assert.equal(candles[0]?.high, 1.4)
  assert.equal(candles[0]?.low, 1.25)
  assert.equal(candles[0]?.close, 1.4)
})

test('next-minute sample creates a new candle', () => {
  const aggregator = new ChartAggregator(10)
  const pairAddress = 'pair-1'
  const baseMs = Date.UTC(2026, 1, 26, 12, 0, 10)

  aggregator.applySample({
    pairAddress,
    observedAtMs: baseMs,
    priceUsd: 2,
  })
  const next = aggregator.applySample({
    pairAddress,
    observedAtMs: baseMs + 61_000,
    priceUsd: 2.3,
  })

  assert.equal(next?.isNewCandle, true)
  const candles = aggregator.getCandles(pairAddress)
  assert.equal(candles.length, 2)
  assert.equal(candles[1]?.open, 2.3)
  assert.equal(candles[1]?.close, 2.3)
})

test('out-of-order sample is ignored', () => {
  const aggregator = new ChartAggregator(10)
  const pairAddress = 'pair-1'
  const baseMs = Date.UTC(2026, 1, 26, 12, 0, 30)

  aggregator.applySample({
    pairAddress,
    observedAtMs: baseMs,
    priceUsd: 5,
  })
  const ignored = aggregator.applySample({
    pairAddress,
    observedAtMs: baseMs - 1_000,
    priceUsd: 4.9,
  })

  assert.equal(ignored, null)
  const candles = aggregator.getCandles(pairAddress)
  assert.equal(candles.length, 1)
  assert.equal(candles[0]?.close, 5)
})
