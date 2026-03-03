import assert from 'node:assert/strict'
import test from 'node:test'
import { FeedCache } from './feed.cache.js'
import { CompositeFeedProvider, FeedLabel, FeedProvider, SeedFeedProvider, TokenFeedItem } from './feed.provider.js'
import { DEFAULT_SEEDED_FEED } from './feed.seed.js'
import { FeedRankingService, FeedService, FeedUnavailableError, InvalidFeedRequestError } from './feed.service.js'

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
  recentVolume5m?: number
  recentTxns5m?: number
  sparklineMeta?: TokenFeedItem['sparklineMeta']
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
    sparklineMeta: input.sparklineMeta ?? null,
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

class SequenceLiveProvider implements FeedProvider {
  readonly name = 'sequence_live'
  private index = 0

  constructor(private readonly sequence: Array<TokenFeedItem[] | Error>) {}

  async fetchFeed(_signal: AbortSignal): Promise<TokenFeedItem[]> {
    const entry = this.sequence[Math.min(this.index, this.sequence.length - 1)]
    this.index += 1

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

test('trending category includes items with trending discovery label', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    logger,
  })

  const provider = new CompositeFeedProvider([], new SeedFeedProvider(DEFAULT_SEEDED_FEED), logger)
  const service = new FeedService(cache, provider, new FeedRankingService(), 10)

  const trendingPage = await service.getPage({
    category: 'trending',
    limit: 20,
  })

  assert.equal(trendingPage.items.length, 6)
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
      candleCount1m: 360,
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
        candleCount1m: 360,
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
        candleCount1m: 60,
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
        candleCount1m: 360,
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
        candleCount1m: 360,
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
      chart_quality_not_full: 1,
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
      mint: 'label-trending',
      name: 'Labeled',
      symbol: 'LBL',
      priceUsd: 1,
      priceChange24h: 1,
      volume24h: 50_000,
      liquidity: 50_000,
      marketCap: 500_000,
      pairAddress: 'pair-labeled',
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
        candleCount1m: 360,
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
      category: 'trending',
      riskTier: 'allow',
      sparklineMeta: {
        window: '6h',
        interval: '5m',
        source: 'historical_provider',
        points: 72,
        generatedAt: '2026-03-03T12:00:00.000Z',
        historyQuality: 'real_backfill',
        candleCount1m: 360,
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
})
