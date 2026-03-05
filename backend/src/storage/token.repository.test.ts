import assert from 'node:assert/strict'
import test from 'node:test'
import { TokenFeedItem } from '../feed/feed.provider.js'
import { SupabaseClient } from './supabase.client.js'
import { TokenRepository } from './token.repository.js'

interface RpcCall {
  fn: string
  args: Record<string, unknown>
}

class FakeSupabaseClient {
  enabled = true
  calls: RpcCall[] = []
  failFunction?: string

  isEnabled(): boolean {
    return this.enabled
  }

  async invokeRpc(fn: string, args: Record<string, unknown>): Promise<void> {
    if (this.failFunction === fn) {
      throw new Error(`forced failure for ${fn}`)
    }

    this.calls.push({ fn, args })
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
      pointCount1m: 360,
      lastPointTimeSec: 1_704_460_800,
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
      liquidity: 'dexscreener',
      volume: 'dexscreener',
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

  assert.equal(fake.calls.length, 5)
  assert.deepEqual(fake.calls.map((call) => call.fn), [
    'upsert_tokens_diff',
    'upsert_token_pairs_diff',
    'upsert_token_market_latest_diff',
    'upsert_token_labels_latest_diff',
    'upsert_token_sparklines_latest_diff',
  ])

  const tokenRows = rowsForFunction(fake.calls, 'upsert_tokens_diff')
  assert.equal(tokenRows.length, 2)

  const pairRows = rowsForFunction(fake.calls, 'upsert_token_pairs_diff')
  assert.equal(pairRows.length, 1)
  assert.equal(pairRows[0]?.pair_address, 'pair-a')

  const marketRows = rowsForFunction(fake.calls, 'upsert_token_market_latest_diff')
  const dedupedMintA = marketRows.find((row) => row.mint === 'mint-a')
  assert.equal(dedupedMintA?.price_usd, 99)
  assert.equal(dedupedMintA?.primary_pair_address, 'pair-a')
  assert.equal(dedupedMintA?.source_price, 'dexscreener')
  assert.equal(dedupedMintA?.source_liquidity, 'dexscreener')
  assert.equal(dedupedMintA?.source_volume, 'dexscreener')

  const sparklineRows = rowsForFunction(fake.calls, 'upsert_token_sparklines_latest_diff')
  assert.equal(sparklineRows.length, 1)
  assert.equal(sparklineRows[0]?.mint, 'mint-a')
})

test('upsertTokenDomainBatch propagates write failures', async () => {
  const fake = new FakeSupabaseClient()
  fake.failFunction = 'upsert_token_market_latest_diff'
  const repository = new TokenRepository(fake as unknown as SupabaseClient, logger)

  await assert.rejects(
    () => repository.upsertTokenDomainBatch([buildItem('mint-a')]),
    /forced failure for upsert_token_market_latest_diff/,
  )
})

test('upsertTokenDomainBatch is no-op when supabase is disabled', async () => {
  const fake = new FakeSupabaseClient()
  fake.enabled = false
  const repository = new TokenRepository(fake as unknown as SupabaseClient, logger)

  await repository.upsertTokenDomainBatch([buildItem('mint-a')])
  assert.equal(fake.calls.length, 0)
})

test('upsertTokenDomainBatch stores null for invalid nullable numerics', async () => {
  const fake = new FakeSupabaseClient()
  const repository = new TokenRepository(fake as unknown as SupabaseClient, logger)

  await repository.upsertTokenDomainBatch([
    buildItem('mint-a', {
      marketCap: 'abc' as unknown as TokenFeedItem['marketCap'],
      recentVolume5m: { invalid: true } as unknown as number,
    }),
  ])

  const marketRows = rowsForFunction(fake.calls, 'upsert_token_market_latest_diff')
  assert.equal(marketRows.length, 1)
  assert.equal(marketRows[0]?.market_cap, null)
  assert.equal(marketRows[0]?.recent_volume_5m, null)
})

test('upsertTokenDomainBatch keeps 0 fallback for required numerics', async () => {
  const fake = new FakeSupabaseClient()
  const repository = new TokenRepository(fake as unknown as SupabaseClient, logger)

  await repository.upsertTokenDomainBatch([
    buildItem('mint-a', {
      priceUsd: 'abc' as unknown as number,
      priceChange24h: Number.NaN,
      volume24h: Number.POSITIVE_INFINITY,
      liquidity: { invalid: true } as unknown as number,
    }),
  ])

  const marketRows = rowsForFunction(fake.calls, 'upsert_token_market_latest_diff')
  assert.equal(marketRows.length, 1)
  assert.equal(marketRows[0]?.price_usd, 0)
  assert.equal(marketRows[0]?.price_change_24h, 0)
  assert.equal(marketRows[0]?.volume_24h, 0)
  assert.equal(marketRows[0]?.liquidity, 0)
})

test('upsertTokenDomainBatch accepts numeric strings for required and nullable numerics', async () => {
  const fake = new FakeSupabaseClient()
  const repository = new TokenRepository(fake as unknown as SupabaseClient, logger)

  await repository.upsertTokenDomainBatch([
    buildItem('mint-a', {
      priceUsd: '123.45' as unknown as number,
      priceChange24h: '7.8' as unknown as number,
      volume24h: '900.01' as unknown as number,
      liquidity: '456.78' as unknown as number,
      marketCap: '0' as unknown as TokenFeedItem['marketCap'],
      recentVolume5m: '0' as unknown as number,
    }),
  ])

  const marketRows = rowsForFunction(fake.calls, 'upsert_token_market_latest_diff')
  assert.equal(marketRows.length, 1)
  assert.equal(marketRows[0]?.price_usd, 123.45)
  assert.equal(marketRows[0]?.price_change_24h, 7.8)
  assert.equal(marketRows[0]?.volume_24h, 900.01)
  assert.equal(marketRows[0]?.liquidity, 456.78)
  assert.equal(marketRows[0]?.market_cap, 0)
  assert.equal(marketRows[0]?.recent_volume_5m, 0)
})

test('upsertTokenDomainBatch canonicalizes label and source tag arrays before persistence', async () => {
  const fake = new FakeSupabaseClient()
  const repository = new TokenRepository(fake as unknown as SupabaseClient, logger)

  await repository.upsertTokenDomainBatch([
    buildItem('mint-a', {
      tags: {
        trust: ['zeta', 'alpha', 'zeta', ' '],
        discovery: ['trending', 'new', 'trending'],
      },
      sources: {
        price: 'dexscreener',
        liquidity: 'dexscreener',
        volume: 'dexscreener',
        marketCap: 'dexscreener_market_cap',
        metadata: 'helius',
        tags: ['internal', 'jupiter', 'internal', ' '],
      },
    }),
  ])

  const labelsRows = rowsForFunction(fake.calls, 'upsert_token_labels_latest_diff')
  assert.equal(labelsRows.length, 1)
  assert.deepEqual(labelsRows[0]?.trust_tags, ['alpha', 'zeta'])
  assert.deepEqual(labelsRows[0]?.discovery_labels, ['new', 'trending'])
  assert.deepEqual(labelsRows[0]?.source_tags, ['internal', 'jupiter'])
})

test('upsertTokenDomainBatch persists liquidity and volume provenance independently from price', async () => {
  const fake = new FakeSupabaseClient()
  const repository = new TokenRepository(fake as unknown as SupabaseClient, logger)

  await repository.upsertTokenDomainBatch([
    buildItem('mint-liq-vol', {
      sources: {
        price: 'birdeye',
        liquidity: 'dexscreener',
        volume: 'dexscreener',
        marketCap: 'birdeye',
        metadata: 'helius',
        tags: ['internal'],
      },
    }),
  ])

  const marketRows = rowsForFunction(fake.calls, 'upsert_token_market_latest_diff')
  assert.equal(marketRows.length, 1)
  assert.equal(marketRows[0]?.source_price, 'birdeye')
  assert.equal(marketRows[0]?.source_liquidity, 'dexscreener')
  assert.equal(marketRows[0]?.source_volume, 'dexscreener')

  const pairRows = rowsForFunction(fake.calls, 'upsert_token_pairs_diff')
  assert.equal(pairRows.length, 1)
  assert.equal(pairRows[0]?.dex, 'dexscreener')
  assert.equal(pairRows[0]?.source_discovery, 'dexscreener')
})

function rowsForFunction(calls: RpcCall[], fn: string): Record<string, unknown>[] {
  const rows = calls.find((call) => call.fn === fn)?.args.rows
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
}
