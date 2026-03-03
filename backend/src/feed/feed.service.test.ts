import assert from 'node:assert/strict'
import test from 'node:test'
import { FeedCache } from './feed.cache.js'
import { CompositeFeedProvider, FeedLabel, SeedFeedProvider, TokenFeedItem } from './feed.provider.js'
import { FeedRankingService, FeedService, InvalidFeedRequestError } from './feed.service.js'

const logger = {
  info: () => undefined,
  warn: () => undefined,
}

function buildItem(input: {
  mint: string
  name: string
  symbol: string
  priceUsd: number
  priceChange24h: number
  volume24h: number
  liquidity: number
  marketCap: number | null
  pairAddress: string | null
  category: TokenFeedItem['category']
  riskTier: TokenFeedItem['riskTier']
  labels?: FeedLabel[]
  recentVolume5m?: number
  recentTxns5m?: number
}): TokenFeedItem {
  const discovery = input.labels ?? (input.category === 'memecoin' ? ['meme'] : [input.category])
  const trust = input.riskTier === 'block' ? ['risk_block'] : input.riskTier === 'warn' ? ['risk_warn'] : []

  return {
    mint: input.mint,
    name: input.name,
    symbol: input.symbol,
    description: null,
    imageUri: null,
    priceUsd: input.priceUsd,
    priceChange24h: input.priceChange24h,
    volume24h: input.volume24h,
    liquidity: input.liquidity,
    marketCap: input.marketCap,
    sparkline: [],
    sparklineMeta: null,
    pairAddress: input.pairAddress,
    tags: {
      trust,
      discovery,
    },
    labels: discovery,
    sources: {
      price: 'dexscreener',
      marketCap: input.marketCap !== null ? 'dexscreener_market_cap' : 'unavailable',
      metadata: 'dexscreener',
      tags: trust.length > 0 ? ['internal_risk'] : [],
    },
    recentVolume5m: input.recentVolume5m,
    recentTxns5m: input.recentTxns5m,
    category: input.category,
    riskTier: input.riskTier,
  }
}

const seededItems: TokenFeedItem[] = [
  buildItem({
    mint: 'mint-1',
    name: 'Token A',
    symbol: 'TKA',
    priceUsd: 1,
    priceChange24h: 2,
    volume24h: 10_000,
    liquidity: 10_000,
    marketCap: 20_000,
    pairAddress: null,
    category: 'trending',
    riskTier: 'allow',
  }),
  buildItem({
    mint: 'mint-2',
    name: 'Token B',
    symbol: 'TKB',
    priceUsd: 2,
    priceChange24h: 8,
    volume24h: 20_000,
    liquidity: 15_000,
    marketCap: 25_000,
    pairAddress: null,
    category: 'gainer',
    riskTier: 'warn',
  }),
  buildItem({
    mint: 'mint-3',
    name: 'Token C',
    symbol: 'TKC',
    priceUsd: 3,
    priceChange24h: -1,
    volume24h: 30_000,
    liquidity: 20_000,
    marketCap: 30_000,
    pairAddress: null,
    category: 'new',
    riskTier: 'allow',
  }),
]

test('returns cursor pages and enforces cursor consistency', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const provider = new CompositeFeedProvider([], new SeedFeedProvider(seededItems), logger)
  const service = new FeedService(cache, provider, new FeedRankingService(), 10)

  const firstPage = await service.getPage({ limit: 2 })
  assert.equal(firstPage.items.length, 2)
  assert.equal(firstPage.cacheStatus, 'MISS')
  assert.notEqual(firstPage.nextCursor, null)

  const secondPage = await service.getPage({
    cursor: firstPage.nextCursor ?? undefined,
  })
  assert.equal(secondPage.items.length, 1)

  await assert.rejects(
    () =>
      service.getPage({
        cursor: firstPage.nextCursor ?? undefined,
        limit: 3,
      }),
    (error: unknown) => error instanceof InvalidFeedRequestError,
  )
})

test('ranking deduplicates duplicate mints', () => {
  const ranking = new FeedRankingService()
  const duplicated = ranking.rank([
    buildItem({
      mint: 'dup-mint',
      name: 'Token One',
      symbol: 'DUP',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 100_000,
      liquidity: 100_000,
      marketCap: 1_000_000,
      pairAddress: 'pair-a',
      category: 'trending',
      riskTier: 'allow',
    }),
    buildItem({
      mint: 'dup-mint',
      name: 'Token One',
      symbol: 'DUP',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 100_000,
      liquidity: 200_000,
      marketCap: 1_000_000,
      pairAddress: 'pair-b',
      category: 'trending',
      riskTier: 'allow',
    }),
  ])

  assert.equal(duplicated.length, 1)
  assert.equal(duplicated[0]?.pairAddress, 'pair-b')
})

test('ranking keeps distinct mints even when symbols match and ranks by activity/liquidity', () => {
  const ranking = new FeedRankingService()
  const ranked = ranking.rank([
    buildItem({
      mint: 'mint-a',
      name: 'Token One',
      symbol: 'SOL',
      priceUsd: 143,
      priceChange24h: 1,
      volume24h: 10_000,
      recentVolume5m: 0,
      recentTxns5m: 0,
      liquidity: 10_000,
      marketCap: 1_000_000,
      pairAddress: 'pair-a',
      category: 'trending',
      riskTier: 'allow',
    }),
    buildItem({
      mint: 'mint-b',
      name: 'Token Two',
      symbol: 'SOL',
      priceUsd: 144,
      priceChange24h: 1,
      volume24h: 500_000,
      recentVolume5m: 20_000,
      recentTxns5m: 50,
      liquidity: 300_000,
      marketCap: 2_000_000,
      pairAddress: 'pair-b',
      category: 'trending',
      riskTier: 'allow',
    }),
  ])

  assert.equal(ranked.length, 2)
  assert.equal(ranked[0]?.pairAddress, 'pair-b')
  assert.equal(ranked[1]?.pairAddress, 'pair-a')
})
