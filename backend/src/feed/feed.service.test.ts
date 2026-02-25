import assert from 'node:assert/strict'
import test from 'node:test'
import { FeedCache } from './feed.cache.js'
import { CompositeFeedProvider, SeedFeedProvider, TokenFeedItem } from './feed.provider.js'
import { FeedRankingService, FeedService, InvalidFeedRequestError } from './feed.service.js'

const logger = {
  info: () => undefined,
  warn: () => undefined,
}

const seededItems: TokenFeedItem[] = [
  {
    mint: 'mint-1',
    name: 'Token A',
    symbol: 'TKA',
    imageUri: null,
    priceUsd: 1,
    priceChange24h: 2,
    volume24h: 10_000,
    liquidity: 10_000,
    marketCap: 20_000,
    sparkline: [],
    pairAddress: null,
    category: 'trending',
    riskTier: 'allow',
  },
  {
    mint: 'mint-2',
    name: 'Token B',
    symbol: 'TKB',
    imageUri: null,
    priceUsd: 2,
    priceChange24h: 8,
    volume24h: 20_000,
    liquidity: 15_000,
    marketCap: 25_000,
    sparkline: [],
    pairAddress: null,
    category: 'gainer',
    riskTier: 'warn',
  },
  {
    mint: 'mint-3',
    name: 'Token C',
    symbol: 'TKC',
    imageUri: null,
    priceUsd: 3,
    priceChange24h: -1,
    volume24h: 30_000,
    liquidity: 20_000,
    marketCap: 30_000,
    sparkline: [],
    pairAddress: null,
    category: 'new',
    riskTier: 'allow',
  },
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
    {
      mint: 'dup-mint',
      name: 'Token One',
      symbol: 'DUP',
      imageUri: null,
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 100_000,
      liquidity: 100_000,
      marketCap: 1_000_000,
      sparkline: [],
      pairAddress: 'pair-a',
      category: 'trending',
      riskTier: 'allow',
    },
    {
      mint: 'dup-mint',
      name: 'Token One',
      symbol: 'DUP',
      imageUri: null,
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 100_000,
      liquidity: 200_000,
      marketCap: 1_000_000,
      sparkline: [],
      pairAddress: 'pair-b',
      category: 'trending',
      riskTier: 'allow',
    },
  ])

  assert.equal(duplicated.length, 1)
  assert.equal(duplicated[0]?.pairAddress, 'pair-b')
})
