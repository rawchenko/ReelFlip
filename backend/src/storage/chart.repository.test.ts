import assert from 'node:assert/strict'
import test from 'node:test'
import { SupabaseClient, SupabaseClientError } from './supabase.client.js'
import { ChartRepository, toPersistedCandles } from './chart.repository.js'

class FakeSupabaseClient {
  enabled = true
  upsertCalls: Array<{ table: string; rows: Record<string, unknown>[]; onConflict: string[] }> = []
  selectResponse: Record<string, unknown>[] = []
  deleteResponse: Record<string, unknown>[] = []
  upsertError: unknown = null

  isEnabled(): boolean {
    return this.enabled
  }

  async upsertRows(table: string, rows: Record<string, unknown>[], onConflict: string[]): Promise<void> {
    this.upsertCalls.push({ table, rows, onConflict })
    if (this.upsertError) {
      throw this.upsertError
    }
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
  assert.equal(rows[0]?.time_sec, 1_700_000_000)
  assert.equal(rows[0]?.source, 'runtime_aggregator')
})

test('upsertCandles writes expected table with conflict keys', async () => {
  const fake = new FakeSupabaseClient()
  const repository = new ChartRepository(fake as unknown as SupabaseClient, logger)

  await repository.upsertCandles([
    {
      pair_address: 'pair-a',
      time_sec: 1_709_424_000,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
      sample_count: 1,
      source: 'runtime_aggregator',
      updated_at: '2026-03-03T00:00:00.000Z',
      ingested_at: '2026-03-03T00:00:00.000Z',
    },
  ])

  assert.equal(fake.upsertCalls.length, 1)
  assert.equal(fake.upsertCalls[0]?.table, 'token_candles_1m')
  assert.deepEqual(fake.upsertCalls[0]?.onConflict, ['pair_address', 'time_sec'])
})

test('upsertCandles ignores pair FK violations and logs warning context', async () => {
  const fake = new FakeSupabaseClient()
  fake.upsertError = new SupabaseClientError(
    'Supabase request failed (409): insert or update on table "token_candles_1m" violates foreign key constraint "token_candles_1m_pair_address_fkey" (SQLSTATE 23503)',
    409,
  )
  const warnings: Array<{ obj: unknown; msg?: string }> = []
  const repository = new ChartRepository(fake as unknown as SupabaseClient, {
    warn: (obj, msg) => warnings.push({ obj, msg }),
    debug: () => undefined,
  })

  await repository.upsertCandles([
    {
      pair_address: 'missing-pair',
      time_sec: 1_709_424_000,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
      sample_count: 1,
      source: 'runtime_aggregator',
      updated_at: '2026-03-03T00:00:00.000Z',
      ingested_at: '2026-03-03T00:00:00.000Z',
    },
  ])

  assert.equal(fake.upsertCalls.length, 1)
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0]?.msg, 'Skipped candle upsert due to missing token_pairs parent row')
})

test('upsertCandles rethrows non-FK write failures', async () => {
  const fake = new FakeSupabaseClient()
  fake.upsertError = new SupabaseClientError('Supabase request failed (503): temporary outage', 503)
  const repository = new ChartRepository(fake as unknown as SupabaseClient, logger)

  await assert.rejects(() =>
    repository.upsertCandles([
      {
        pair_address: 'pair-a',
        time_sec: 1_709_424_000,
        open: 1,
        high: 1,
        low: 1,
        close: 1,
        volume: 1,
        sample_count: 1,
        source: 'runtime_aggregator',
        updated_at: '2026-03-03T00:00:00.000Z',
        ingested_at: '2026-03-03T00:00:00.000Z',
      },
    ]),
  )
})

test('getCandles sorts ascending and parses numeric strings', async () => {
  const fake = new FakeSupabaseClient()
  fake.selectResponse = [
    {
      pair_address: 'pair-a',
      time_sec: 1_709_424_120,
      open: '3.2',
      high: '3.5',
      low: '3.0',
      close: '3.1',
      volume: '10',
      sample_count: 1,
    },
    {
      pair_address: 'pair-a',
      time_sec: 1_709_424_060,
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
      time_sec: 1_709_424_060,
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
    '(time_sec.gte.1772496000,time_sec.lte.1772496600)',
  )
})
