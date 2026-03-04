import assert from 'node:assert/strict'
import test from 'node:test'
import { TokenFeedItem } from '../feed/feed.provider.js'
import { SupabaseClient } from './supabase.client.js'
import { TokenRepository } from './token.repository.js'

interface UpsertCall {
  table: string
  rows: Record<string, unknown>[]
  onConflict: string[]
}

class FakeSupabaseClient {
  enabled = true
  calls: UpsertCall[] = []
  failTable?: string

  isEnabled(): boolean {
    return this.enabled
  }

  async upsertRows(table: string, rows: Record<string, unknown>[], onConflict: string[]): Promise<void> {
    if (this.failTable === table) {
      throw new Error(`forced failure for ${table}`)
    }

    this.calls.push({ table, rows, onConflict })
  }
}

const logger = {
  info: () => undefined,
  warn: () => undefined,
}

function buildItem(mint: string, overrides: Partial<TokenFeedItem> = {}): TokenFeedItem {
  return {
    mint,
    name: `Token ${mint}`,
    symbol: mint.slice(0, 3).toUpperCase(),
    description: null,
    imageUri: null,
    priceUsd: 1,
    priceChange24h: 2,
    volume24h: 3,
    liquidity: 4,
    marketCap: 5,
    sparkline: [1, 2, 3],
    sparklineMeta: {
      window: '6h',
      interval: '5m',
      source: 'historical_provider',
      points: 3,
      generatedAt: '2026-03-03T00:00:00.000Z',
      historyQuality: 'real_backfill',
      candleCount1m: 360,
    },
    pairAddress: 'pair-a',
    pairCreatedAtMs: 1_700_000_000_000,
    tags: {
      trust: ['verified'],
      discovery: ['trending'],
    },
    labels: ['trending'],
    sources: {
      price: 'dexscreener',
      marketCap: 'dexscreener_market_cap',
      metadata: 'helius',
      tags: ['internal'],
    },
    quoteSymbol: 'SOL',
    recentVolume5m: 12,
    recentTxns5m: 5,
    category: 'trending',
    riskTier: 'allow',
    ...overrides,
  }
}

test('upsertTokenDomainBatch writes token domain tables with deduped mints', async () => {
  const fake = new FakeSupabaseClient()
  const repository = new TokenRepository(fake as unknown as SupabaseClient, logger)

  const first = buildItem('mint-a')
  const replacement = buildItem('mint-a', { priceUsd: 99 })
  const second = buildItem('mint-b', {
    sparkline: [],
    sparklineMeta: null,
    sources: undefined,
  })

  await repository.upsertTokenDomainBatch([first, replacement, second], '2026-03-03T00:00:00.000Z')

  assert.equal(fake.calls.length, 4)
  assert.deepEqual(fake.calls.map((call) => call.table), [
    'tokens',
    'token_market_latest',
    'token_labels_latest',
    'token_sparklines_latest',
  ])

  const tokenRows = fake.calls[0]?.rows ?? []
  assert.equal(tokenRows.length, 2)

  const marketRows = fake.calls[1]?.rows ?? []
  const dedupedMintA = marketRows.find((row) => row.mint === 'mint-a')
  assert.equal(dedupedMintA?.price_usd, 99)

  const sparklineRows = fake.calls[3]?.rows ?? []
  assert.equal(sparklineRows.length, 1)
  assert.equal(sparklineRows[0]?.mint, 'mint-a')
})

test('upsertTokenDomainBatch propagates write failures', async () => {
  const fake = new FakeSupabaseClient()
  fake.failTable = 'token_market_latest'
  const repository = new TokenRepository(fake as unknown as SupabaseClient, logger)

  await assert.rejects(
    () => repository.upsertTokenDomainBatch([buildItem('mint-a')]),
    /forced failure for token_market_latest/,
  )
})

test('upsertTokenDomainBatch is no-op when supabase is disabled', async () => {
  const fake = new FakeSupabaseClient()
  fake.enabled = false
  const repository = new TokenRepository(fake as unknown as SupabaseClient, logger)

  await repository.upsertTokenDomainBatch([buildItem('mint-a')])
  assert.equal(fake.calls.length, 0)
})
