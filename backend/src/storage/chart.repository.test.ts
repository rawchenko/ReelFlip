import assert from 'node:assert/strict'
import test from 'node:test'
import { SupabaseClient } from './supabase.client.js'
import { ChartRepository, toPersistedCandles } from './chart.repository.js'

class FakeSupabaseClient {
  enabled = true
  upsertCalls: Array<{ table: string; rows: Record<string, unknown>[]; onConflict: string[] }> = []
  selectResponse: Record<string, unknown>[] = []
  deleteResponse: Record<string, unknown>[] = []

  isEnabled(): boolean {
    return this.enabled
  }

  async upsertRows(table: string, rows: Record<string, unknown>[], onConflict: string[]): Promise<void> {
    this.upsertCalls.push({ table, rows, onConflict })
  }

  selectCalls: Array<Record<string, string | undefined>> = []

  async selectRows<T>(_table: string, query: Record<string, string | undefined>): Promise<T[]> {
    this.selectCalls.push(query)
    return this.selectResponse as T[]
  }

  async deleteRows<T>(): Promise<T[]> {
    return this.deleteResponse as T[]
  }
}

const logger = {
  warn: () => undefined,
  debug: () => undefined,
}

test('toPersistedCandles normalizes pair and timestamps', () => {
  const rows = toPersistedCandles(' pair-a ', [
    {
      timeSec: 1_700_000_000,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 9,
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.pair_address, 'pair-a')
  assert.equal(rows[0]?.sample_count, 1)
  assert.equal(rows[0]?.bucket_start, '2023-11-14T22:13:20.000Z')
})

test('upsertCandles writes expected table with conflict keys', async () => {
  const fake = new FakeSupabaseClient()
  const repository = new ChartRepository(fake as unknown as SupabaseClient, logger)

  await repository.upsertCandles([
    {
      pair_address: 'pair-a',
      bucket_start: '2026-03-03T00:00:00.000Z',
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
      sample_count: 1,
    },
  ])

  assert.equal(fake.upsertCalls.length, 1)
  assert.equal(fake.upsertCalls[0]?.table, 'token_candles_1m')
  assert.deepEqual(fake.upsertCalls[0]?.onConflict, ['pair_address', 'bucket_start'])
})

test('getCandles sorts ascending and parses numeric strings', async () => {
  const fake = new FakeSupabaseClient()
  fake.selectResponse = [
    {
      pair_address: 'pair-a',
      bucket_start: '2026-03-03T00:02:00.000Z',
      open: '3.2',
      high: '3.5',
      low: '3.0',
      close: '3.1',
      volume: '10',
      sample_count: 1,
    },
    {
      pair_address: 'pair-a',
      bucket_start: '2026-03-03T00:01:00.000Z',
      open: 2.2,
      high: 2.5,
      low: 2.0,
      close: 2.1,
      volume: 5,
      sample_count: 1,
    },
  ]

  const repository = new ChartRepository(fake as unknown as SupabaseClient, logger)
  const candles = await repository.getCandles('pair-a', 10)

  assert.equal(candles.length, 2)
  assert.ok((candles[0]?.timeSec ?? 0) < (candles[1]?.timeSec ?? 0))
  assert.equal(candles[1]?.close, 3.1)
})

test('pruneOldCandles returns deleted row count', async () => {
  const fake = new FakeSupabaseClient()
  fake.deleteResponse = [{ id: 1 }, { id: 2 }]
  const repository = new ChartRepository(fake as unknown as SupabaseClient, logger)

  const deleted = await repository.pruneOldCandles('2026-03-01T00:00:00.000Z')
  assert.equal(deleted, 2)
})

test('getCandlesByRange uses range query and returns parsed candles', async () => {
  const fake = new FakeSupabaseClient()
  fake.selectResponse = [
    {
      pair_address: 'pair-a',
      bucket_start: '2026-03-03T00:01:00.000Z',
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 9,
      sample_count: 1,
    },
  ]
  const repository = new ChartRepository(fake as unknown as SupabaseClient, logger)

  const candles = await repository.getCandlesByRange('pair-a', {
    fromIso: '2026-03-03T00:00:00.000Z',
    toIso: '2026-03-03T00:10:00.000Z',
    limit: 50,
  })

  assert.equal(candles.length, 1)
  assert.equal(fake.selectCalls.length, 1)
  assert.equal(
    fake.selectCalls[0]?.and,
    '(bucket_start.gte.2026-03-03T00:00:00.000Z,bucket_start.lte.2026-03-03T00:10:00.000Z)',
  )
})
