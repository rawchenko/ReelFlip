import assert from 'node:assert/strict'
import test from 'node:test'
import { BirdeyeHistoricalCandleProvider } from './chart.history-provider.birdeye.js'

const logger = {
  warn: () => undefined,
  debug: () => undefined,
}

function withMockFetch(
  fn: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const previous = globalThis.fetch
  globalThis.fetch = fn
  return run().finally(() => {
    globalThis.fetch = previous
  })
}

test('BirdeyeHistoricalCandleProvider parses ohlcv payload from rows', async () => {
  await withMockFetch(
    async () =>
      new Response(
        JSON.stringify({
          data: {
            items: [
              [1_700_000_000, 1, 2, 0.5, 1.5, 10],
              [1_700_000_060, 1.5, 2.5, 1.25, 2.2, 11],
            ],
          },
        }),
        { status: 200 },
      ),
    async () => {
      const provider = new BirdeyeHistoricalCandleProvider(
        {
          apiKey: 'test-api-key',
          timeoutMs: 1000,
        },
        logger,
      )

      const candles = await provider.fetch1mCandles({
        pairAddress: 'pair-a',
        limit: 120,
        signal: new AbortController().signal,
      })

      assert.equal(candles.length, 2)
      assert.equal(candles[0]?.timeSec, 1_700_000_000)
      assert.equal(candles[0]?.close, 1.5)
      assert.equal(candles[1]?.timeSec, 1_700_000_060)
      assert.equal(candles[1]?.close, 2.2)
    },
  )
})

test('BirdeyeHistoricalCandleProvider returns empty when api key is not configured', async () => {
  const provider = new BirdeyeHistoricalCandleProvider(
    {
      timeoutMs: 1000,
    },
    logger,
  )

  const candles = await provider.fetch1mCandles({
    pairAddress: 'pair-a',
    limit: 120,
    signal: new AbortController().signal,
  })

  assert.deepEqual(candles, [])
})

test('BirdeyeHistoricalCandleProvider returns empty on upstream error', async () => {
  await withMockFetch(
    async () => new Response(JSON.stringify({ error: 'oops' }), { status: 500 }),
    async () => {
      const provider = new BirdeyeHistoricalCandleProvider(
        {
          apiKey: 'test-api-key',
          timeoutMs: 1000,
        },
        logger,
      )

      const candles = await provider.fetch1mCandles({
        pairAddress: 'pair-a',
        limit: 120,
        signal: new AbortController().signal,
      })

      assert.deepEqual(candles, [])
    },
  )
})
