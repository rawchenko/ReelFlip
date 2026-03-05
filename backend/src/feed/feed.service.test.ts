import assert from 'node:assert/strict'
import test from 'node:test'
import { FeedCache } from './feed.cache.js'
import { CompositeFeedProvider, FeedLabel, FeedProvider, SeedFeedProvider, TokenFeedItem } from './feed.provider.js'
import { DEFAULT_SEEDED_FEED } from './feed.seed.js'
import { FeedRankingService, FeedService, FeedUnavailableError, InvalidFeedRequestError } from './feed.service.js'
import { FeedRepository } from '../storage/feed.repository.js'
import { TokenRepository } from '../storage/token.repository.js'

const logger = {
  info: () => undefined,
  warn: () => undefined,
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
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
  pairCreatedAtMs?: number | null
  recentVolume5m?: number
  recentTxns5m?: number
  sparklineMeta?: TokenFeedItem['sparklineMeta']
}): TokenFeedItem {
  const normalizedSparklineMeta =
    input.sparklineMeta === null || input.sparklineMeta === undefined
      ? null
      : {
          ...input.sparklineMeta,
          ...(typeof input.sparklineMeta.lastPointTimeSec === 'number'
            ? {}
            : { lastPointTimeSec: Math.floor(Date.now() / 1000) }),
        }

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
    sparklineMeta: normalizedSparklineMeta,
    pairAddress: input.pairAddress,
    pairCreatedAtMs: input.pairCreatedAtMs,
    tags: {
      trust,
      discovery,
    },
    labels: discovery,
    sources: {
      price: 'dexscreener',
      liquidity: 'dexscreener',
      volume: 'dexscreener',
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

class SequenceLiveProvider implements FeedProvider {
  readonly name = 'sequence_live'
  private index = 0

  constructor(private readonly sequence: Array<TokenFeedItem[] | Error>) { }

  async fetchFeed(_signal: AbortSignal): Promise<TokenFeedItem[]> {
    const entry = this.sequence[Math.min(this.index, this.sequence.length - 1)]
    this.index += 1

    if (!entry) {
      return []
    }

    if (entry instanceof Error) {
      throw entry
    }

    return entry
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

test('cursor enforces minLifetimeHours consistency', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const provider = new CompositeFeedProvider([], new SeedFeedProvider(seededItems), logger)
  const service = new FeedService(cache, provider, new FeedRankingService(), 10)

  const firstPage = await service.getPage({ limit: 2, minLifetimeHours: 0 })
  assert.notEqual(firstPage.nextCursor, null)

  await assert.rejects(
    () =>
      service.getPage({
        cursor: firstPage.nextCursor ?? undefined,
        minLifetimeHours: 6,
      }),
    (error: unknown) =>
      error instanceof InvalidFeedRequestError && error.message === 'Cursor and minLifetimeHours must match.',
  )
})

test('cursor pages remain valid when latest snapshot rotates within cursor ttl', async () => {
  const cache = new FeedCache({
    ttlSeconds: 1,
    staleTtlSeconds: 1,
    cursorTtlSeconds: 300,
    logger,
  })

  const provider = new CompositeFeedProvider([], new SeedFeedProvider(seededItems), logger)
  const service = new FeedService(cache, provider, new FeedRankingService(), 10)

  const firstPage = await service.getPage({ limit: 2 })
  assert.notEqual(firstPage.nextCursor, null)

  await delay(1_100)
  await service.getPage({ limit: 2 })

  const secondPage = await service.getPage({
    cursor: firstPage.nextCursor ?? undefined,
  })
  assert.equal(secondPage.items.length, 1)
})

test('cursor pages expire after cursor ttl', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    cursorTtlSeconds: 1,
    logger,
  })

  const provider = new CompositeFeedProvider([], new SeedFeedProvider(seededItems), logger)
  const service = new FeedService(cache, provider, new FeedRankingService(), 10)

  const firstPage = await service.getPage({ limit: 2 })
  assert.notEqual(firstPage.nextCursor, null)

  await delay(1_100)

  await assert.rejects(
    () =>
      service.getPage({
        cursor: firstPage.nextCursor ?? undefined,
      }),
    (error: unknown) =>
      error instanceof InvalidFeedRequestError &&
      error.message === 'Cursor snapshot is no longer valid. Start from the first page.',
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

test('trending category includes items with trending discovery label from providers', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const providerItems: TokenFeedItem[] = [
    buildItem({
      mint: 'label-trending-provider',
      name: 'Label Trending',
      symbol: 'LTP',
      priceUsd: 1,
      priceChange24h: 3,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: 'pair-label-trending',
      pairCreatedAtMs: Date.now() - 7 * 60 * 60 * 1000,
      category: 'gainer',
      riskTier: 'allow',
      labels: ['gainer', 'trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
  ]

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([providerItems])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    {
      enableSeedFallback: false,
    },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: false,
  })

  const trendingPage = await service.getPage({
    category: 'trending',
    limit: 20,
  })

  assert.equal(trendingPage.items.length, 1)
  assert.equal(trendingPage.items[0]?.mint, 'label-trending-provider')
})

test('trending enforces minimum lifetime on backend and ignores client minLifetimeHours tuning', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const now = Date.now()
  const providerItems: TokenFeedItem[] = [
    buildItem({
      mint: 'older-than-6h',
      name: 'Older',
      symbol: 'OLD',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 50_000,
      liquidity: 40_000,
      marketCap: 200_000,
      pairAddress: 'pair-old',
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
    buildItem({
      mint: 'younger-than-6h',
      name: 'Younger',
      symbol: 'YNG',
      priceUsd: 1,
      priceChange24h: 3,
      volume24h: 80_000,
      liquidity: 60_000,
      marketCap: 300_000,
      pairAddress: 'pair-young',
      pairCreatedAtMs: now - 2 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
    buildItem({
      mint: 'missing-pair-created-at',
      name: 'Unknown Age',
      symbol: 'UNK',
      priceUsd: 1,
      priceChange24h: 4,
      volume24h: 120_000,
      liquidity: 80_000,
      marketCap: 400_000,
      pairAddress: 'pair-unknown',
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
  ]

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([providerItems])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    {
      enableSeedFallback: false,
    },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: false,
  })

  const filteredDefault = await service.getPage({
    category: 'trending',
    limit: 20,
  })

  assert.equal(filteredDefault.items.length, 1)
  assert.equal(filteredDefault.items[0]?.mint, 'older-than-6h')

  const filteredWithZero = await service.getPage({
    category: 'trending',
    minLifetimeHours: 0,
    limit: 20,
  })

  assert.equal(filteredWithZero.items.length, 1)
  assert.equal(filteredWithZero.items[0]?.mint, 'older-than-6h')
})

test('trending excludes risk_block tokens and reports policy filter stats', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const now = Date.now()
  const providerItems: TokenFeedItem[] = [
    buildItem({
      mint: 'risk-blocked',
      name: 'Risk Blocked',
      symbol: 'BLK',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 120_000,
      liquidity: 80_000,
      marketCap: 700_000,
      pairAddress: 'pair-risk-blocked',
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'block',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
    buildItem({
      mint: 'risk-allowed',
      name: 'Risk Allowed',
      symbol: 'RAL',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 100_000,
      liquidity: 90_000,
      marketCap: 650_000,
      pairAddress: 'pair-risk-allowed',
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
  ]

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([providerItems])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    {
      enableSeedFallback: false,
    },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: false,
  })

  const page = await service.getPage({
    category: 'trending',
    limit: 20,
  })

  assert.equal(page.items.length, 1)
  assert.equal(page.items[0]?.mint, 'risk-allowed')
  assert.equal(page.eligibilityStats?.reasons.risk_block, 1)
})

test('trending cursor pagination remains consistent with enforced backend lifetime', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const now = Date.now()
  const providerItems: TokenFeedItem[] = [
    buildItem({
      mint: 'older-a',
      name: 'Older A',
      symbol: 'OA',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 90_000,
      liquidity: 80_000,
      marketCap: 900_000,
      pairAddress: 'pair-older-a',
      pairCreatedAtMs: now - 9 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
    buildItem({
      mint: 'older-b',
      name: 'Older B',
      symbol: 'OB',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 80_000,
      liquidity: 70_000,
      marketCap: 800_000,
      pairAddress: 'pair-older-b',
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
    buildItem({
      mint: 'young-c',
      name: 'Young C',
      symbol: 'YC',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 95_000,
      liquidity: 85_000,
      marketCap: 950_000,
      pairAddress: 'pair-young-c',
      pairCreatedAtMs: now - 2 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
  ]

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([providerItems])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    {
      enableSeedFallback: false,
    },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: false,
  })

  const firstPage = await service.getPage({
    category: 'trending',
    limit: 1,
    minLifetimeHours: 0,
  })
  assert.equal(firstPage.items.length, 1)
  assert.notEqual(firstPage.nextCursor, null)

  const secondPage = await service.getPage({
    category: 'trending',
    cursor: firstPage.nextCursor ?? undefined,
    minLifetimeHours: 0,
  })
  assert.equal(secondPage.items.length, 1)
  assert.equal(secondPage.nextCursor, null)

  const returnedMints = [firstPage.items[0]?.mint, secondPage.items[0]?.mint]
  assert.ok(returnedMints.includes('older-a'))
  assert.ok(returnedMints.includes('older-b'))
  assert.ok(!returnedMints.includes('young-c'))
})

test('trending requires provider source and does not serve seed fallback snapshots', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([new Error('provider outage')])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    {
      enableSeedFallback: true,
    },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: true,
  })

  await assert.rejects(
    () =>
      service.getPage({
        category: 'trending',
        limit: 20,
      }),
    (error: unknown) =>
      error instanceof FeedUnavailableError &&
      error.message === 'Live feed providers are temporarily unavailable. Please try again soon.',
  )
})

test('trending serves stale provider snapshot instead of seed fallback', async () => {
  const cache = new FeedCache({
    ttlSeconds: 1,
    staleTtlSeconds: 60,
    logger,
  })

  const now = Date.now()
  const liveItem = buildItem({
    mint: 'mint-live-min-age',
    name: 'Live Min Age',
    symbol: 'LMN',
    priceUsd: 1.5,
    priceChange24h: 5,
    volume24h: 700_000,
    liquidity: 400_000,
    marketCap: 1_500_000,
    pairAddress: 'pair-live-min-age',
    pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
    category: 'trending',
    riskTier: 'allow',
    labels: ['trending'],
    sparklineMeta: {
      window: '6h',
      interval: '5m',
      source: 'historical_provider',
      points: 72,
      generatedAt: '2026-03-03T12:00:00.000Z',
      historyQuality: 'real_backfill',
      pointCount1m: 360,
    },
  })

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([[liveItem], new Error('provider outage')])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    {
      enableSeedFallback: true,
    },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: true,
  })

  const first = await service.getPage({
    category: 'trending',
    limit: 20,
  })
  assert.equal(first.cacheStatus, 'MISS')
  assert.equal(first.source, 'providers')
  assert.equal(first.items.length, 1)

  await delay(1_100)

  const second = await service.getPage({
    category: 'trending',
    limit: 20,
  })
  assert.equal(second.cacheStatus, 'STALE')
  assert.equal(second.source, 'providers')
  assert.equal(second.items.length, 1)
  assert.equal(second.items[0]?.mint, 'mint-live-min-age')
})

test('returns FeedUnavailableError when providers fail and seed fallback is disabled with no stale provider snapshot', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([new Error('provider outage')])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    {
      enableSeedFallback: false,
    },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: false,
    enforceRenderableTokens: true,
    minChartCandles: 120,
    requireFullChartHistory: true,
  })

  await assert.rejects(() => service.getPage({}), (error: unknown) => error instanceof FeedUnavailableError)
})

test('serves stale providers snapshot when providers fail after cache rotation and seed fallback is disabled', async () => {
  const cache = new FeedCache({
    ttlSeconds: 1,
    staleTtlSeconds: 60,
    logger,
  })
  const liveItem = buildItem({
    mint: 'mint-live',
    name: 'Live Token',
    symbol: 'LIVE',
    priceUsd: 1,
    priceChange24h: 2,
    volume24h: 500_000,
    liquidity: 300_000,
    marketCap: 1_000_000,
    pairAddress: 'pair-live',
    category: 'trending',
    riskTier: 'allow',
    sparklineMeta: {
      window: '6h',
      interval: '5m',
      source: 'historical_provider',
      points: 72,
      generatedAt: '2026-03-03T12:00:00.000Z',
      historyQuality: 'real_backfill',
      pointCount1m: 360,
    },
  })

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([[liveItem], new Error('provider outage')])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    {
      enableSeedFallback: false,
    },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: false,
    enforceRenderableTokens: true,
    minChartCandles: 120,
    requireFullChartHistory: true,
  })

  const first = await service.getPage({ limit: 10 })
  assert.equal(first.cacheStatus, 'MISS')
  assert.equal(first.source, 'providers')
  assert.equal(first.items.length, 1)

  await delay(1_100)

  const second = await service.getPage({ limit: 10 })
  assert.equal(second.cacheStatus, 'STALE')
  assert.equal(second.source, 'providers')
  assert.equal(second.items.length, 1)
  assert.equal(second.items[0]?.mint, 'mint-live')
})

test('filters ineligible trending items by pair and chart quality before ranking', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const providerItems: TokenFeedItem[] = [
    buildItem({
      mint: 'missing-pair',
      name: 'Missing Pair',
      symbol: 'MSP',
      priceUsd: 1,
      priceChange24h: 1,
      volume24h: 1_000,
      liquidity: 1_000,
      marketCap: 10_000,
      pairAddress: null,
      category: 'trending',
      riskTier: 'allow',
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 24,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
    buildItem({
      mint: 'short-history',
      name: 'Short History',
      symbol: 'SHT',
      priceUsd: 1,
      priceChange24h: 1,
      volume24h: 1_000,
      liquidity: 1_000,
      marketCap: 10_000,
      pairAddress: 'pair-short',
      category: 'trending',
      riskTier: 'allow',
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 24,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 60,
      },
    }),
    buildItem({
      mint: 'partial-history',
      name: 'Partial History',
      symbol: 'PRT',
      priceUsd: 1,
      priceChange24h: 1,
      volume24h: 1_000,
      liquidity: 1_000,
      marketCap: 10_000,
      pairAddress: 'pair-partial',
      category: 'trending',
      riskTier: 'allow',
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 24,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'partial',
        pointCount1m: 360,
        lastPointTimeSec: Math.floor(Date.now() / 1000) - 600,
      },
    }),
    buildItem({
      mint: 'eligible',
      name: 'Eligible',
      symbol: 'OK',
      priceUsd: 1,
      priceChange24h: 1,
      volume24h: 3_000,
      liquidity: 5_000,
      marketCap: 20_000,
      pairAddress: 'pair-eligible',
      category: 'trending',
      riskTier: 'allow',
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
  ]

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([providerItems])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    {
      enableSeedFallback: false,
    },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: false,
    enforceRenderableTokens: true,
    minChartCandles: 120,
    requireFullChartHistory: true,
  })

  const page = await service.getPage({ limit: 20 })
  assert.equal(page.items.length, 1)
  assert.equal(page.items[0]?.mint, 'eligible')
  assert.deepEqual(page.eligibilityStats, {
    filteredTotal: 3,
    reasons: {
      missing_pair: 1,
      insufficient_chart_history: 1,
      chart_stale: 1,
      risk_block: 0,
    },
  })
})

test('trending category still includes items with trending discovery label after eligibility filter', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const providerItems: TokenFeedItem[] = [
    buildItem({
      mint: 'risk-block-trending',
      name: 'Risk Block Trending',
      symbol: 'RBT',
      priceUsd: 1.2,
      priceChange24h: 1.5,
      volume24h: 45_000,
      liquidity: 45_000,
      marketCap: 450_000,
      pairAddress: 'pair-risk-block-trending',
      pairCreatedAtMs: Date.now() - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'block',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
    buildItem({
      mint: 'label-trending',
      name: 'Labeled',
      symbol: 'LBL',
      priceUsd: 1,
      priceChange24h: 1,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: 'pair-labeled',
      pairCreatedAtMs: Date.now() - 8 * 60 * 60 * 1000,
      category: 'gainer',
      riskTier: 'allow',
      labels: ['gainer', 'trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
    buildItem({
      mint: 'direct-trending',
      name: 'Direct',
      symbol: 'DRC',
      priceUsd: 2,
      priceChange24h: 2,
      volume24h: 70_000,
      liquidity: 70_000,
      marketCap: 700_000,
      pairAddress: 'pair-direct',
      pairCreatedAtMs: Date.now() - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
  ]

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([providerItems])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    {
      enableSeedFallback: false,
    },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: false,
    enforceRenderableTokens: true,
    minChartCandles: 120,
    requireFullChartHistory: true,
  })

  const trendingPage = await service.getPage({
    category: 'trending',
    limit: 20,
  })

  const mints = trendingPage.items.map((item) => item.mint)
  assert.equal(trendingPage.items.length, 2)
  assert.ok(mints.includes('label-trending'))
  assert.ok(mints.includes('direct-trending'))
  assert.ok(!mints.includes('risk-block-trending'))
  assert.equal(trendingPage.eligibilityStats?.reasons.risk_block, 1)
})

test('read-through loads latest snapshot from repository when cache is empty', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const provider = new CompositeFeedProvider([], new SeedFeedProvider([]), logger)
  const expectedItem = buildItem({
    mint: 'persisted-a',
    name: 'Persisted',
    symbol: 'PRS',
    priceUsd: 1.5,
    priceChange24h: 4,
    volume24h: 2000,
    liquidity: 5000,
    marketCap: 10000,
    pairAddress: 'pair-persisted',
    category: 'trending',
    riskTier: 'allow',
  })

  const fakeFeedRepository = {
    isEnabled: () => true,
    readLatestSnapshot: async () => ({
      id: 'snapshot-persisted',
      generatedAt: '2026-03-03T00:00:00.000Z',
      source: 'providers' as const,
      items: [expectedItem],
    }),
    readSnapshotById: async () => null,
    createSnapshot: async () => undefined,
  }

  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    readThroughEnabled: true,
    feedRepository: fakeFeedRepository as unknown as FeedRepository,
  })

  const page = await service.getPage({ limit: 10 })
  assert.equal(page.items.length, 1)
  assert.equal(page.items[0]?.mint, 'persisted-a')
  assert.equal(page.source, 'providers')
})

test('preferSupabaseRead loads latest snapshot from repository before fresh cache', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const cachedItem = buildItem({
    mint: 'cached-a',
    name: 'Cached',
    symbol: 'CHD',
    priceUsd: 1,
    priceChange24h: 1,
    volume24h: 1000,
    liquidity: 4000,
    marketCap: 8000,
    pairAddress: 'pair-cached',
    category: 'trending',
    riskTier: 'allow',
  })

  await cache.writeSnapshot({
    id: 'snapshot-cache',
    generatedAt: '2026-03-03T00:00:00.000Z',
    source: 'providers',
    items: [cachedItem],
  })

  const provider = new CompositeFeedProvider([], new SeedFeedProvider([]), logger)
  const persistedItem = buildItem({
    mint: 'persisted-preferred',
    name: 'Persisted Preferred',
    symbol: 'PRF',
    priceUsd: 2,
    priceChange24h: 6,
    volume24h: 3000,
    liquidity: 9000,
    marketCap: 15000,
    pairAddress: 'pair-persisted',
    category: 'trending',
    riskTier: 'allow',
  })

  let readLatestSnapshotCalls = 0
  const fakeFeedRepository = {
    isEnabled: () => true,
    readLatestSnapshot: async () => {
      readLatestSnapshotCalls += 1
      return {
        id: 'snapshot-persisted',
        generatedAt: '2026-03-04T00:00:00.000Z',
        source: 'providers' as const,
        items: [persistedItem],
      }
    },
    readSnapshotById: async () => null,
    createSnapshot: async () => undefined,
  }

  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    readThroughEnabled: true,
    preferSupabaseRead: true,
    feedRepository: fakeFeedRepository as unknown as FeedRepository,
  })

  const page = await service.getPage({ limit: 10 })
  assert.equal(readLatestSnapshotCalls, 1)
  assert.equal(page.items[0]?.mint, 'persisted-preferred')
  assert.equal(page.cacheStatus, 'MISS')
})

test('write-through persists token and snapshot rows when enabled', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const provider = new CompositeFeedProvider(
    [
      new SequenceLiveProvider([
        [
          buildItem({
            mint: 'persist-w',
            name: 'Persist Write',
            symbol: 'PWR',
            priceUsd: 2,
            priceChange24h: 8,
            volume24h: 10000,
            liquidity: 30000,
            marketCap: 500000,
            pairAddress: 'pair-w',
            category: 'trending',
            riskTier: 'allow',
          }),
        ],
      ]),
    ],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
  )

  let tokenPersistCalls = 0
  let snapshotPersistCalls = 0
  const fakeTokenRepository = {
    isEnabled: () => true,
    upsertTokenDomainBatch: async () => {
      tokenPersistCalls += 1
    },
  }
  const fakeFeedRepository = {
    isEnabled: () => true,
    readLatestSnapshot: async () => null,
    readSnapshotById: async () => null,
    createSnapshot: async () => {
      snapshotPersistCalls += 1
    },
  }

  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    writeThroughEnabled: true,
    tokenRepository: fakeTokenRepository as unknown as TokenRepository,
    feedRepository: fakeFeedRepository as unknown as FeedRepository,
  })

  const page = await service.getPage({ limit: 10 })
  assert.equal(page.items.length, 1)
  assert.equal(tokenPersistCalls, 1)
  assert.equal(snapshotPersistCalls, 1)
})

test('refreshSnapshotWithOutcome reports skipped persistence when write-through is disabled', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const provider = new CompositeFeedProvider(
    [
      new SequenceLiveProvider([
        [
          buildItem({
            mint: 'persist-skip',
            name: 'Persist Skip',
            symbol: 'PSK',
            priceUsd: 1,
            priceChange24h: 5,
            volume24h: 9000,
            liquidity: 25000,
            marketCap: 450000,
            pairAddress: 'pair-skip',
            category: 'trending',
            riskTier: 'allow',
          }),
        ],
      ]),
    ],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
  )

  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    writeThroughEnabled: false,
  })

  const outcome = await service.refreshSnapshotWithOutcome()
  assert.equal(outcome.persistence.status, 'skipped')
  assert.notEqual(outcome.snapshot, null)

  const snapshot = await service.refreshSnapshot()
  assert.notEqual(snapshot, null)
})

test('refreshSnapshotWithOutcome reports failed persistence without throwing when Supabase write fails', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const provider = new CompositeFeedProvider(
    [
      new SequenceLiveProvider([
        [
          buildItem({
            mint: 'persist-fail',
            name: 'Persist Fail',
            symbol: 'PFL',
            priceUsd: 1,
            priceChange24h: 5,
            volume24h: 9000,
            liquidity: 25000,
            marketCap: 450000,
            pairAddress: 'pair-fail',
            category: 'trending',
            riskTier: 'allow',
          }),
        ],
      ]),
    ],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
  )

  const fakeTokenRepository = {
    isEnabled: () => true,
    upsertTokenDomainBatch: async () => undefined,
  }
  const fakeFeedRepository = {
    isEnabled: () => true,
    readLatestSnapshot: async () => null,
    readSnapshotById: async () => null,
    createSnapshot: async () => {
      throw new Error('forced snapshot persist failure')
    },
  }

  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    writeThroughEnabled: true,
    tokenRepository: fakeTokenRepository as unknown as TokenRepository,
    feedRepository: fakeFeedRepository as unknown as FeedRepository,
  })

  const outcome = await service.refreshSnapshotWithOutcome()
  assert.equal(outcome.persistence.status, 'failed')
  assert.ok((outcome.persistence.errorMessage ?? '').includes('forced snapshot persist failure'))
  assert.notEqual(outcome.snapshot, null)

  const page = await service.getPage({ limit: 10 })
  assert.equal(page.cacheStatus, 'HIT')
  assert.equal(page.items[0]?.mint, 'persist-fail')
})

test('empty data window returns deterministic empty page without crashing', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const provider = new CompositeFeedProvider([], new SeedFeedProvider([]), logger)
  const service = new FeedService(cache, provider, new FeedRankingService(), 10)

  const first = await service.getPage({ limit: 10 })
  assert.equal(first.items.length, 0)
  assert.equal(first.nextCursor, null)
  assert.equal(first.source, 'seed')

  const second = await service.getPage({ limit: 10 })
  assert.equal(second.items.length, 0)
  assert.equal(second.nextCursor, null)
})

test('when sync refresh is disabled, cache miss does not trigger provider fetch in request path', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const provider = new CompositeFeedProvider([], new SeedFeedProvider(seededItems), logger)
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    allowSyncRefreshOnMiss: false,
  })

  await assert.rejects(() => service.getPage({ limit: 2 }), (error: unknown) => error instanceof FeedUnavailableError)

  await service.refreshSnapshot()
  const page = await service.getPage({ limit: 2 })
  assert.equal(page.cacheStatus, 'HIT')
  assert.equal(page.items.length, 2)
})

test('trending filters out items with pointCount1m < 120 at query time', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const now = Date.now()
  const providerItems: TokenFeedItem[] = [
    buildItem({
      mint: 'low-candles',
      name: 'Low Candles',
      symbol: 'LOW',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: 'pair-low-candles',
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 24,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 60,
      },
    }),
    buildItem({
      mint: 'enough-candles',
      name: 'Enough Candles',
      symbol: 'OK',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: 'pair-enough-candles',
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
  ]

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([providerItems])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    { enableSeedFallback: false },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: false,
  })

  const page = await service.getPage({ category: 'trending', limit: 20 })
  assert.equal(page.items.length, 1)
  assert.equal(page.items[0]?.mint, 'enough-candles')
  assert.equal(page.eligibilityStats?.reasons.insufficient_chart_history, 1)
})

test('trending filters out items with stale chart points at query time', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const now = Date.now()
  const providerItems: TokenFeedItem[] = [
    buildItem({
      mint: 'runtime-only',
      name: 'Runtime Only',
      symbol: 'RTO',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: 'pair-runtime',
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'runtime_only',
        pointCount1m: 360,
        lastPointTimeSec: Math.floor(now / 1000) - 600,
      },
    }),
    buildItem({
      mint: 'full-backfill',
      name: 'Full Backfill',
      symbol: 'FBF',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: 'pair-full',
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
  ]

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([providerItems])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    { enableSeedFallback: false },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: false,
  })

  const page = await service.getPage({ category: 'trending', limit: 20 })
  assert.equal(page.items.length, 1)
  assert.equal(page.items[0]?.mint, 'full-backfill')
  assert.equal(page.eligibilityStats?.reasons.chart_stale, 1)
})

test('trending chart filtering works even when enforceRenderableTokens is false', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const now = Date.now()
  const providerItems: TokenFeedItem[] = [
    buildItem({
      mint: 'no-pair-trending',
      name: 'No Pair',
      symbol: 'NOP',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: null,
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
    }),
    buildItem({
      mint: 'eligible-trending',
      name: 'Eligible',
      symbol: 'ELG',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: 'pair-eligible',
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
  ]

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([providerItems])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    { enableSeedFallback: false },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: false,
    enforceRenderableTokens: false,
  })

  const page = await service.getPage({ category: 'trending', limit: 20 })
  assert.equal(page.items.length, 1)
  assert.equal(page.items[0]?.mint, 'eligible-trending')
  assert.equal(page.eligibilityStats?.reasons.missing_pair, 1)
})

test('non-trending categories are not affected by trending chart policy', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const providerItems: TokenFeedItem[] = [
    buildItem({
      mint: 'no-chart-gainer',
      name: 'No Chart Gainer',
      symbol: 'NCG',
      priceUsd: 1,
      priceChange24h: 10,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: null,
      category: 'gainer',
      riskTier: 'allow',
      labels: ['gainer'],
    }),
  ]

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([providerItems])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    { enableSeedFallback: false },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: false,
    enforceRenderableTokens: false,
  })

  const page = await service.getPage({ category: 'gainer', limit: 20 })
  assert.equal(page.items.length, 1)
  assert.equal(page.items[0]?.mint, 'no-chart-gainer')
})

test('trending eligibilityStats counts all chart rejection reasons', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const now = Date.now()
  const providerItems: TokenFeedItem[] = [
    buildItem({
      mint: 'missing-pair-t',
      name: 'Missing Pair',
      symbol: 'MP',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: null,
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
    }),
    buildItem({
      mint: 'low-candles-t',
      name: 'Low Candles',
      symbol: 'LC',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: 'pair-low',
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 24,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 50,
      },
    }),
    buildItem({
      mint: 'partial-quality-t',
      name: 'Partial',
      symbol: 'PQ',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: 'pair-partial',
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'partial',
        pointCount1m: 360,
        lastPointTimeSec: Math.floor(now / 1000) - 600,
      },
    }),
    buildItem({
      mint: 'risk-blocked-t',
      name: 'Risk Blocked',
      symbol: 'RB',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: 'pair-risk-blocked',
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'block',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
    buildItem({
      mint: 'eligible-t',
      name: 'Eligible',
      symbol: 'EL',
      priceUsd: 1,
      priceChange24h: 2,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: 'pair-ok',
      pairCreatedAtMs: now - 8 * 60 * 60 * 1000,
      category: 'trending',
      riskTier: 'allow',
      labels: ['trending'],
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        pointCount1m: 360,
      },
    }),
  ]

  const provider = new CompositeFeedProvider(
    [new SequenceLiveProvider([providerItems])],
    new SeedFeedProvider(DEFAULT_SEEDED_FEED),
    logger,
    { enableSeedFallback: false },
  )
  const service = new FeedService(cache, provider, new FeedRankingService(), 10, {
    enableSeedFallback: false,
  })

  const page = await service.getPage({ category: 'trending', limit: 20 })
  assert.equal(page.items.length, 1)
  assert.equal(page.items[0]?.mint, 'eligible-t')
  assert.deepEqual(page.eligibilityStats, {
    filteredTotal: 4,
    reasons: {
      missing_pair: 1,
      insufficient_chart_history: 1,
      chart_stale: 1,
      risk_block: 1,
    },
  })
})
