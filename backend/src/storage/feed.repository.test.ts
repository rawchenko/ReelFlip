import assert from 'node:assert/strict'
import test from 'node:test'
import { FeedSnapshot } from '../feed/feed.cache.js'
import { SupabaseClient } from './supabase.client.js'
import { FeedRepository } from './feed.repository.js'

interface InsertCall {
  table: string
  rows: Record<string, unknown>[]
}

interface DeleteCall {
  table: string
  query: Record<string, string | undefined>
}

interface SelectCall {
  table: string
  query: Record<string, string | undefined>
}

class FakeSupabaseClient {
  enabled = true
  failInsertTable?: string
  insertCalls: InsertCall[] = []
  deleteCalls: DeleteCall[] = []
  selectCalls: SelectCall[] = []
  responses = new Map<string, unknown[]>()

  isEnabled(): boolean {
    return this.enabled
  }

  setResponse(table: string, rows: unknown[]): void {
    this.responses.set(table, rows)
  }

  async insertRows(table: string, rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    if (this.failInsertTable === table) {
      throw new Error(`forced insert failure for ${table}`)
    }

    this.insertCalls.push({ table, rows })
    return []
  }

  async selectRows<T>(table: string, query: Record<string, string | undefined>): Promise<T[]> {
    this.selectCalls.push({ table, query })
    return (this.responses.get(table) ?? []) as T[]
  }

  async deleteRows<T>(table: string, query: Record<string, string | undefined>): Promise<T[]> {
    this.deleteCalls.push({ table, query })
    return [] as T[]
  }
}

const logger = {
  warn: () => undefined,
  debug: () => undefined,
  info: () => undefined,
}

const snapshot: FeedSnapshot = {
  id: 'snap-1',
  generatedAt: '2026-03-03T00:00:00.000Z',
  source: 'providers',
  items: [],
}

test('createSnapshot writes snapshot and ordered items', async () => {
  const fake = new FakeSupabaseClient()
  const repository = new FeedRepository(fake as unknown as SupabaseClient, logger)

  await repository.createSnapshot(
    snapshot,
    [
      { mint: 'mint-a', position: 0, score: 1.1 },
      { mint: 'mint-b', position: 1, score: 0.9 },
    ],
    'MISS',
  )

  assert.equal(fake.insertCalls.length, 2)
  assert.equal(fake.insertCalls[0]?.table, 'feed_snapshots')
  assert.equal(fake.insertCalls[1]?.table, 'feed_snapshot_items')
})

test('createSnapshot rolls back header row when item insert fails', async () => {
  const fake = new FakeSupabaseClient()
  fake.failInsertTable = 'feed_snapshot_items'
  const repository = new FeedRepository(fake as unknown as SupabaseClient, logger)

  await assert.rejects(
    () =>
      repository.createSnapshot(
        snapshot,
        [{ mint: 'mint-a', position: 0, score: 1.1 }],
        'MISS',
      ),
    /forced insert failure for feed_snapshot_items/,
  )

  assert.equal(fake.deleteCalls.length, 1)
  assert.equal(fake.deleteCalls[0]?.table, 'feed_snapshots')
  assert.equal(fake.deleteCalls[0]?.query.id, 'eq.snap-1')
})

test('readLatestSnapshot returns mapped and ordered token feed items', async () => {
  const fake = new FakeSupabaseClient()
  fake.setResponse('feed_snapshots', [
    {
      id: 'snap-1',
      generated_at: '2026-03-03T00:00:00.000Z',
      source: 'providers',
    },
  ])
  fake.setResponse('feed_snapshot_items', [
    { position: 0, mint: 'mint-b' },
    { position: 1, mint: 'mint-a' },
  ])
  fake.setResponse('v_token_feed', [
    {
      mint: 'mint-a',
      name: 'Token A',
      symbol: 'A',
      description: null,
      imageUri: null,
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 3,
      liquidity: 4,
      marketCap: 5,
      sparkline: [1, 2],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 2,
        generatedAt: '2026-03-03T00:00:00.000Z',
      },
      pairAddress: null,
      pairCreatedAtMs: null,
      tags: { trust: [], discovery: ['trending'] },
      labels: ['trending'],
      sources: { price: 'seed', marketCap: 'seed', metadata: 'seed', tags: [] },
      category: 'trending',
      riskTier: 'allow',
    },
    {
      mint: 'mint-b',
      name: 'Token B',
      symbol: 'B',
      description: null,
      imageUri: null,
      priceUsd: 11,
      priceChange24h: 12,
      volume24h: 13,
      liquidity: 14,
      marketCap: 15,
      sparkline: [3, 4],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 2,
        generatedAt: '2026-03-03T00:00:00.000Z',
      },
      pairAddress: null,
      pairCreatedAtMs: null,
      tags: { trust: [], discovery: ['gainer'] },
      labels: ['gainer'],
      sources: { price: 'seed', marketCap: 'seed', metadata: 'seed', tags: [] },
      category: 'gainer',
      riskTier: 'warn',
    },
  ])

  const repository = new FeedRepository(fake as unknown as SupabaseClient, logger)
  const latest = await repository.readLatestSnapshot()

  assert.ok(latest)
  assert.equal(latest?.id, 'snap-1')
  assert.equal(latest?.items.length, 2)
  assert.equal(latest?.items[0]?.mint, 'mint-b')
  assert.equal(latest?.items[1]?.mint, 'mint-a')
})

test('createSnapshotAndPage returns created snapshot payload', async () => {
  const fake = new FakeSupabaseClient()
  fake.setResponse('feed_snapshots', [
    {
      id: 'snap-1',
      generated_at: '2026-03-03T00:00:00.000Z',
      source: 'providers',
    },
  ])
  fake.setResponse('feed_snapshot_items', [{ position: 0, mint: 'mint-a' }])
  fake.setResponse('v_token_feed', [
    {
      mint: 'mint-a',
      name: 'Token A',
      symbol: 'A',
      description: null,
      imageUri: null,
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 3,
      liquidity: 4,
      marketCap: 5,
      sparkline: [],
      sparklineMeta: null,
      pairAddress: null,
      pairCreatedAtMs: null,
      tags: { trust: [], discovery: ['trending'] },
      labels: ['trending'],
      sources: { price: 'seed', marketCap: 'seed', metadata: 'seed', tags: [] },
      category: 'trending',
      riskTier: 'allow',
    },
  ])

  const repository = new FeedRepository(fake as unknown as SupabaseClient, logger)
  const created = await repository.createSnapshotAndPage(snapshot, [{ mint: 'mint-a', position: 0, score: 1 }], 'MISS')

  assert.ok(created)
  assert.equal(created?.id, 'snap-1')
  assert.equal(created?.items.length, 1)
})
