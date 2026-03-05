import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BirdeyeMarketSnapshot,
  ChartHistoryBatchReader,
  FeedEnrichmentService,
  HeliusMetadataClient,
  TokenMarketDataClient,
  TokenMetadataClient,
  TokenMetadataSnapshot,
  TokenTrustTagsClient,
} from './feed.enrichment.js'
import { FeedLabel, TokenFeedItem } from './feed.provider.js'

const FIVE_MINUTES_SEC = 5 * 60

function chartAnchorNowSec(): number {
  return Math.floor(Math.floor(Date.now() / 1000) / FIVE_MINUTES_SEC) * FIVE_MINUTES_SEC
}

function bucketCloseTimeSec(bucketStartSec: number): number {
  return bucketStartSec + 240
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
      liquidity: 'dexscreener',
      volume: 'dexscreener',
      marketCap: input.marketCap !== null ? 'dexscreener_market_cap' : 'unavailable',
      metadata: 'dexscreener',
      tags: trust.length > 0 ? ['internal_risk'] : [],
    },
    category: input.category,
    riskTier: input.riskTier,
  }
}

class StaticMarketClient implements TokenMarketDataClient {
  constructor(private readonly dataByMint: Record<string, BirdeyeMarketSnapshot | null>) {}

  async fetchTokenMarket(mint: string, _signal: AbortSignal): Promise<BirdeyeMarketSnapshot | null> {
    return this.dataByMint[mint] ?? null
  }
}

class StaticMetadataClient implements TokenMetadataClient {
  constructor(private readonly dataByMint: Record<string, TokenMetadataSnapshot | null>) {}

  async fetchTokenMetadata(mint: string, _signal: AbortSignal): Promise<TokenMetadataSnapshot | null> {
    return this.dataByMint[mint] ?? null
  }
}

class StaticTrustTagsClient implements TokenTrustTagsClient {
  constructor(private readonly tagsByMint: Record<string, string[]>) {}

  async fetchTrustTags(mint: string, _signal: AbortSignal): Promise<string[]> {
    return this.tagsByMint[mint] ?? []
  }
}

class CountingMarketClient implements TokenMarketDataClient {
  calls = 0

  constructor(
    private readonly resolver: (mint: string, call: number) => Promise<BirdeyeMarketSnapshot | null> | BirdeyeMarketSnapshot | null,
  ) {}

  async fetchTokenMarket(mint: string, _signal: AbortSignal): Promise<BirdeyeMarketSnapshot | null> {
    this.calls += 1
    return this.resolver(mint, this.calls)
  }
}

class CountingMetadataClient implements TokenMetadataClient {
  calls = 0

  constructor(
    private readonly resolver: (mint: string, call: number) => Promise<TokenMetadataSnapshot | null> | TokenMetadataSnapshot | null,
  ) {}

  async fetchTokenMetadata(mint: string, _signal: AbortSignal): Promise<TokenMetadataSnapshot | null> {
    this.calls += 1
    return this.resolver(mint, this.calls)
  }
}

class CountingTrustTagsClient implements TokenTrustTagsClient {
  calls = 0

  constructor(private readonly resolver: (mint: string, call: number) => Promise<string[]> | string[]) {}

  async fetchTrustTags(mint: string, _signal: AbortSignal): Promise<string[]> {
    this.calls += 1
    return this.resolver(mint, this.calls)
  }
}

class CountingMarketClientByMint implements TokenMarketDataClient {
  readonly callsByMint = new Map<string, number>()

  constructor(
    private readonly resolver: (
      mint: string,
      call: number,
    ) => Promise<BirdeyeMarketSnapshot | null> | BirdeyeMarketSnapshot | null,
  ) {}

  async fetchTokenMarket(mint: string, _signal: AbortSignal): Promise<BirdeyeMarketSnapshot | null> {
    const calls = (this.callsByMint.get(mint) ?? 0) + 1
    this.callsByMint.set(mint, calls)
    return this.resolver(mint, calls)
  }
}

class StaticChartReader implements ChartHistoryBatchReader {
  constructor(
    private readonly candlesByPair: Record<
      string,
      Array<{ time: number; open: number; high: number; low: number; close: number }>
    >,
  ) {}

  getBatchMaxPairs(): number {
    return 8
  }

  async getBatchHistory(pairAddresses: string[]) {
    return {
      interval: '1m' as const,
      generatedAt: '2026-03-02T12:00:00.000Z',
      results: pairAddresses.map((pairAddress) => ({
        pairAddress,
        delayed: false,
        status: 'live' as const,
        source: 'historical_provider',
        historyQuality: 'real_backfill' as const,
        points: (this.candlesByPair[pairAddress] ?? []).map((candle) => ({
          time: candle.time,
          value: candle.close,
        })),
      })),
    }
  }
}

async function withMockedNow<T>(callback: (setNow: (value: number) => void) => Promise<T>): Promise<T> {
  const originalNow = Date.now
  let now = 0
  Date.now = () => now

  try {
    return await callback((value) => {
      now = value
    })
  } finally {
    Date.now = originalNow
  }
}

test('enrichment uses source precedence and builds two-tier tags', async () => {
  const anchor = chartAnchorNowSec()
  const service = new FeedEnrichmentService(
    new StaticMarketClient({
      'mint-1': { priceUsd: 2, priceChange24h: 10, marketCap: 999_000 },
    }),
    new StaticMetadataClient({
      'mint-1': { name: 'Helius Name', description: 'Helius Description', imageUri: 'https://img.example/a.png' },
    }),
    new StaticTrustTagsClient({
      'mint-1': ['verified', 'lst'],
    }),
    new StaticChartReader({
      'pair-1': [
        { time: bucketCloseTimeSec(anchor - 3 * FIVE_MINUTES_SEC), open: 1, high: 1, low: 1, close: 1 },
        { time: bucketCloseTimeSec(anchor - 2 * FIVE_MINUTES_SEC), open: 1.5, high: 1.5, low: 1.5, close: 1.5 },
        { time: bucketCloseTimeSec(anchor - 1 * FIVE_MINUTES_SEC), open: 2, high: 2, low: 2, close: 2 },
      ],
    }),
    {
      maxItems: 80,
      concurrency: 4,
      sparklineWindowMinutes: 360,
      sparklinePoints: 72,
    },
    {
      warn: () => undefined,
      info: () => undefined,
    },
  )

  const [item] = await service.enrich(
    [
      buildItem({
        mint: 'mint-1',
        name: 'Dex Name',
        symbol: 'AAA',
        priceUsd: 1,
        priceChange24h: 5,
        volume24h: 100_000,
        liquidity: 100_000,
        marketCap: 100_000,
        pairAddress: 'pair-1',
        category: 'gainer',
        riskTier: 'warn',
        labels: ['gainer'],
      }),
    ],
    new AbortController().signal,
  )

  assert.equal(item?.name, 'Helius Name')
  assert.equal(item?.description, 'Helius Description')
  assert.equal(item?.priceUsd, 2)
  assert.equal(item?.priceChange24h, 10)
  assert.equal(item?.marketCap, 999_000)
  assert.deepEqual(item?.tags.discovery, ['gainer'])
  assert.deepEqual(item?.labels, ['gainer'])
  assert.deepEqual(item?.tags.trust, ['risk_warn', 'verified', 'lst'])
  assert.deepEqual(item?.sources, {
    price: 'birdeye',
    liquidity: 'dexscreener',
    volume: 'dexscreener',
    marketCap: 'birdeye',
    metadata: 'helius',
    tags: ['internal_risk', 'jupiter'],
  })
  assert.equal(item?.sparkline.length, 72)
  assert.equal(item?.sparkline[0], 1)
  assert.equal(item?.sparkline[item.sparkline.length - 1], 2)
  assert.equal(item?.sparklineMeta?.window, '6h')
  assert.equal(item?.sparklineMeta?.interval, '5m')
  assert.equal(item?.sparklineMeta?.source, 'historical_provider')
  assert.equal(item?.sparklineMeta?.points, 72)
  assert.equal(item?.sparklineMeta?.generatedAt, '2026-03-02T12:00:00.000Z')
  assert.equal(item?.sparklineMeta?.historyQuality, 'real_backfill')
  assert.equal(item?.sparklineMeta?.pointCount1m, 3)
  assert.equal(item?.sparklineMeta?.lastPointTimeSec, bucketCloseTimeSec(anchor - 1 * FIVE_MINUTES_SEC))
})

test('market cap remains null when unavailable from all providers', async () => {
  const service = new FeedEnrichmentService(
    new StaticMarketClient({
      'mint-2': { priceUsd: null, priceChange24h: null, marketCap: null },
    }),
    new StaticMetadataClient({
      'mint-2': null,
    }),
    new StaticTrustTagsClient({
      'mint-2': [],
    }),
    null,
    {
      maxItems: 10,
      concurrency: 2,
      sparklineWindowMinutes: 360,
      sparklinePoints: 72,
    },
    {
      warn: () => undefined,
      info: () => undefined,
    },
  )

  const [item] = await service.enrich(
    [
      buildItem({
        mint: 'mint-2',
        name: 'No MC',
        symbol: 'NMC',
        priceUsd: 0.1,
        priceChange24h: 1,
        volume24h: 100,
        liquidity: 100,
        marketCap: null,
        pairAddress: null,
        category: 'new',
        riskTier: 'allow',
      }),
    ],
    new AbortController().signal,
  )

  assert.equal(item?.marketCap, null)
  assert.equal(item?.sources.marketCap, 'unavailable')
  assert.deepEqual(item?.sparkline, [])
  assert.equal(item?.sparklineMeta, null)
})

test('sparkline buckets 1m history into real 5m points', async () => {
  const anchor = chartAnchorNowSec()
  const candles = Array.from({ length: 72 }, (_, index) => {
    const value = index + 1
    const bucketStart = anchor - (71 - index) * FIVE_MINUTES_SEC
    return { time: bucketCloseTimeSec(bucketStart), open: value, high: value, low: value, close: value }
  })

  const service = new FeedEnrichmentService(
    new StaticMarketClient({}),
    new StaticMetadataClient({}),
    new StaticTrustTagsClient({}),
    new StaticChartReader({
      'pair-3': candles,
    }),
    {
      maxItems: 10,
      concurrency: 2,
      sparklineWindowMinutes: 360,
      sparklinePoints: 72,
    },
    {
      warn: () => undefined,
      info: () => undefined,
    },
  )

  const [item] = await service.enrich(
    [
      buildItem({
        mint: 'mint-3',
        name: 'Sparkline',
        symbol: 'SPK',
        priceUsd: 1,
        priceChange24h: 0,
        volume24h: 1_000,
        liquidity: 1_000,
        marketCap: 1_000,
        pairAddress: 'pair-3',
        category: 'trending',
        riskTier: 'allow',
      }),
    ],
    new AbortController().signal,
  )

  assert.equal(item?.sparkline.length, 72)
  assert.equal(item?.sparkline[0], 1)
  assert.equal(item?.sparkline[item.sparkline.length - 1], 72)
  assert.equal(item?.sparklineMeta?.points, 72)
  assert.equal(item?.sparklineMeta?.interval, '5m')
})

test('sparkline fills sparse bucket gaps and keeps fixed 72-point output', async () => {
  const anchor = chartAnchorNowSec()
  const firstBucketStart = anchor - 61 * FIVE_MINUTES_SEC
  const secondBucketStart = anchor - 28 * FIVE_MINUTES_SEC
  const candles = [
    { time: bucketCloseTimeSec(firstBucketStart), open: 10, high: 10, low: 10, close: 10 },
    { time: bucketCloseTimeSec(secondBucketStart), open: 40, high: 40, low: 40, close: 40 },
  ]

  const service = new FeedEnrichmentService(
    new StaticMarketClient({}),
    new StaticMetadataClient({}),
    new StaticTrustTagsClient({}),
    new StaticChartReader({
      'pair-partial': candles,
    }),
    {
      maxItems: 10,
      concurrency: 2,
      sparklineWindowMinutes: 360,
      sparklinePoints: 72,
    },
    {
      warn: () => undefined,
      info: () => undefined,
    },
  )

  const [item] = await service.enrich(
    [
      buildItem({
        mint: 'mint-partial',
        name: 'Partial',
        symbol: 'PRTL',
        priceUsd: 1,
        priceChange24h: 0,
        volume24h: 1_000,
        liquidity: 1_000,
        marketCap: 1_000,
        pairAddress: 'pair-partial',
        category: 'trending',
        riskTier: 'allow',
      }),
    ],
    new AbortController().signal,
  )

  assert.equal(item?.sparkline.length, 72)
  assert.equal(item?.sparkline[0], 10)
  assert.equal(item?.sparkline[42], 10)
  assert.equal(item?.sparkline[43], 40)
  assert.equal(item?.sparkline[item.sparkline.length - 1], 40)
  assert.equal(item?.sparklineMeta?.interval, '5m')
  assert.equal(item?.sparklineMeta?.points, 72)
})

test('sparkline stays empty when no valid candles exist in the 6h window', async () => {
  const service = new FeedEnrichmentService(
    new StaticMarketClient({}),
    new StaticMetadataClient({}),
    new StaticTrustTagsClient({}),
    new StaticChartReader({
      'pair-empty': [],
    }),
    {
      maxItems: 10,
      concurrency: 2,
      sparklineWindowMinutes: 360,
      sparklinePoints: 72,
    },
    {
      warn: () => undefined,
      info: () => undefined,
    },
  )

  const [item] = await service.enrich(
    [
      buildItem({
        mint: 'mint-empty',
        name: 'Empty',
        symbol: 'EMPT',
        priceUsd: 1,
        priceChange24h: 0,
        volume24h: 1_000,
        liquidity: 1_000,
        marketCap: 1_000,
        pairAddress: 'pair-empty',
        category: 'trending',
        riskTier: 'allow',
      }),
    ],
    new AbortController().signal,
  )

  assert.deepEqual(item?.sparkline, [])
  assert.equal(item?.sparklineMeta?.points, 0)
})

test('HeliusMetadataClient does not call upstream when disabled by config', async () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  try {
    const client = new HeliusMetadataClient(
      {
        enabled: false,
        apiKey: 'test-key',
        timeoutMs: 2500,
        dasUrl: 'https://mainnet.helius-rpc.com',
      },
      {
        warn: () => undefined,
      },
    )

    const result = await client.fetchTokenMetadata('mint-disabled', new AbortController().signal)
    assert.equal(result, null)
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('enrichment uses ttl cache to avoid repeated upstream calls across refresh cycles', async () => {
  const market = new CountingMarketClient(() => ({ priceUsd: 2, priceChange24h: 3, marketCap: 4 }))
  const metadata = new CountingMetadataClient(() => ({
    name: 'Cached Name',
    description: 'Cached Description',
    imageUri: 'https://cdn.example/cached.png',
  }))
  const tags = new CountingTrustTagsClient(() => ['verified'])
  const service = new FeedEnrichmentService(
    market,
    metadata,
    tags,
    null,
    {
      maxItems: 20,
      concurrency: 4,
      marketTtlMs: 60_000,
      metadataTtlMs: 60_000,
      trustTagsTtlMs: 60_000,
      failureCooldownMs: 300_000,
      sparklineWindowMinutes: 360,
      sparklinePoints: 72,
    },
    {
      warn: () => undefined,
      info: () => undefined,
    },
  )

  const input = [
    buildItem({
      mint: 'mint-cache',
      name: 'Original',
      symbol: 'CCH',
      priceUsd: 1,
      priceChange24h: 0,
      volume24h: 1000,
      liquidity: 1000,
      marketCap: 1000,
      pairAddress: null,
      category: 'trending',
      riskTier: 'allow',
    }),
  ]

  await service.enrich(input, new AbortController().signal)
  await service.enrich(input, new AbortController().signal)

  assert.equal(market.calls, 1)
  assert.equal(metadata.calls, 1)
  assert.equal(tags.calls, 1)
})

test('enrichment failure cooldown suppresses repeated upstream retries', async () => {
  const market = new CountingMarketClient(() => {
    throw new Error('market unavailable')
  })
  const metadata = new CountingMetadataClient(() => {
    throw new Error('metadata unavailable')
  })
  const tags = new CountingTrustTagsClient(() => {
    throw new Error('tags unavailable')
  })
  const service = new FeedEnrichmentService(
    market,
    metadata,
    tags,
    null,
    {
      maxItems: 20,
      concurrency: 4,
      marketTtlMs: 60_000,
      metadataTtlMs: 60_000,
      trustTagsTtlMs: 60_000,
      failureCooldownMs: 300_000,
      sparklineWindowMinutes: 360,
      sparklinePoints: 72,
    },
    {
      warn: () => undefined,
      info: () => undefined,
    },
  )

  const input = [
    buildItem({
      mint: 'mint-cooldown',
      name: 'Original',
      symbol: 'CDN',
      priceUsd: 1,
      priceChange24h: 0,
      volume24h: 1000,
      liquidity: 1000,
      marketCap: null,
      pairAddress: null,
      category: 'trending',
      riskTier: 'allow',
    }),
  ]

  await service.enrich(input, new AbortController().signal)
  await service.enrich(input, new AbortController().signal)

  assert.equal(market.calls, 1)
  assert.equal(metadata.calls, 1)
  assert.equal(tags.calls, 1)
})

test('enrichment serves stale cached values when upstream fails after ttl expiry', async () => {
  const market = new CountingMarketClient((_mint, call) => {
    if (call === 1) {
      return { priceUsd: 5, priceChange24h: 7, marketCap: 1234 }
    }
    throw new Error('upstream down')
  })
  const service = new FeedEnrichmentService(
    market,
    new StaticMetadataClient({}),
    new StaticTrustTagsClient({}),
    null,
    {
      maxItems: 20,
      concurrency: 4,
      marketTtlMs: 5,
      metadataTtlMs: 60_000,
      trustTagsTtlMs: 60_000,
      failureCooldownMs: 300_000,
      sparklineWindowMinutes: 360,
      sparklinePoints: 72,
    },
    {
      warn: () => undefined,
      info: () => undefined,
    },
  )

  const input = [
    buildItem({
      mint: 'mint-stale',
      name: 'Original',
      symbol: 'STL',
      priceUsd: 1,
      priceChange24h: 0,
      volume24h: 1000,
      liquidity: 1000,
      marketCap: null,
      pairAddress: null,
      category: 'trending',
      riskTier: 'allow',
    }),
  ]

  const [first] = await service.enrich(input, new AbortController().signal)
  await new Promise((resolve) => setTimeout(resolve, 10))
  const [second] = await service.enrich(input, new AbortController().signal)

  assert.equal(first?.priceUsd, 5)
  assert.equal(second?.priceUsd, 5)
  assert.equal(second?.marketCap, 1234)
  assert.equal(market.calls, 2)
})

test('integration: 10 refresh cycles keep upstream calls bounded by ttl', async () => {
  const market = new CountingMarketClient(() => ({ priceUsd: 3, priceChange24h: 1, marketCap: 900 }))
  const metadata = new CountingMetadataClient(() => ({
    name: 'Bounded',
    description: null,
    imageUri: null,
  }))
  const tags = new CountingTrustTagsClient(() => ['verified'])
  const service = new FeedEnrichmentService(
    market,
    metadata,
    tags,
    null,
    {
      maxItems: 20,
      concurrency: 4,
      marketTtlMs: 60_000,
      metadataTtlMs: 60_000,
      trustTagsTtlMs: 60_000,
      failureCooldownMs: 300_000,
      sparklineWindowMinutes: 360,
      sparklinePoints: 72,
    },
    {
      warn: () => undefined,
      info: () => undefined,
    },
  )

  const input = [
    buildItem({
      mint: 'mint-integration',
      name: 'Original',
      symbol: 'INT',
      priceUsd: 1,
      priceChange24h: 0,
      volume24h: 1000,
      liquidity: 1000,
      marketCap: null,
      pairAddress: null,
      category: 'trending',
      riskTier: 'allow',
    }),
  ]

  for (let index = 0; index < 10; index += 1) {
    await service.enrich(input, new AbortController().signal)
  }

  assert.equal(market.calls, 1)
  assert.equal(metadata.calls, 1)
  assert.equal(tags.calls, 1)
})

test('cache cap evicts least recently used entry after a ttl hit refreshes recency', async () => {
  await withMockedNow(async (setNow) => {
    const market = new CountingMarketClientByMint((mint) => ({
      priceUsd: Number(mint.slice(-1)),
      priceChange24h: 0,
      marketCap: 100,
    }))
    const service = new FeedEnrichmentService(
      market,
      new StaticMetadataClient({}),
      new StaticTrustTagsClient({}),
      null,
      {
        maxItems: 20,
        concurrency: 4,
        marketTtlMs: 60_000,
        marketCacheMaxKeys: 2,
        metadataTtlMs: 60_000,
        trustTagsTtlMs: 60_000,
        failureCooldownMs: 300_000,
        sparklineWindowMinutes: 360,
        sparklinePoints: 72,
      },
      {
        warn: () => undefined,
        info: () => undefined,
      },
    )

    const signal = new AbortController().signal
    setNow(1_000)
    await service.enrich([buildItemForCacheTest('mint-1')], signal)
    setNow(1_001)
    await service.enrich([buildItemForCacheTest('mint-2')], signal)
    setNow(1_002)
    await service.enrich([buildItemForCacheTest('mint-1')], signal)
    setNow(1_003)
    await service.enrich([buildItemForCacheTest('mint-3')], signal)
    setNow(1_004)
    await service.enrich([buildItemForCacheTest('mint-1')], signal)
    await service.enrich([buildItemForCacheTest('mint-2')], signal)

    assert.equal(market.callsByMint.get('mint-1'), 1)
    assert.equal(market.callsByMint.get('mint-2'), 2)
    assert.equal(market.callsByMint.get('mint-3'), 1)
  })
})

test('cache cap removes expired entries before evicting still-valid entries', async () => {
  await withMockedNow(async (setNow) => {
    const market = new CountingMarketClientByMint((mint) => ({
      priceUsd: Number(mint.slice(-1)),
      priceChange24h: 0,
      marketCap: 100,
    }))
    const service = new FeedEnrichmentService(
      market,
      new StaticMetadataClient({}),
      new StaticTrustTagsClient({}),
      null,
      {
        maxItems: 20,
        concurrency: 4,
        marketTtlMs: 10,
        marketCacheMaxKeys: 2,
        metadataTtlMs: 60_000,
        trustTagsTtlMs: 60_000,
        failureCooldownMs: 300_000,
        sparklineWindowMinutes: 360,
        sparklinePoints: 72,
      },
      {
        warn: () => undefined,
        info: () => undefined,
      },
    )

    const signal = new AbortController().signal
    setNow(0)
    await service.enrich([buildItemForCacheTest('mint-1')], signal)
    setNow(8)
    await service.enrich([buildItemForCacheTest('mint-2')], signal)
    setNow(12)
    await service.enrich([buildItemForCacheTest('mint-3')], signal)
    await service.enrich([buildItemForCacheTest('mint-2')], signal)
    await service.enrich([buildItemForCacheTest('mint-1')], signal)

    assert.equal(market.callsByMint.get('mint-1'), 2)
    assert.equal(market.callsByMint.get('mint-2'), 1)
    assert.equal(market.callsByMint.get('mint-3'), 1)
  })
})

test('cooldown entries count toward cache cap and remain reusable until evicted', async () => {
  await withMockedNow(async (setNow) => {
    const market = new CountingMarketClientByMint((mint) => {
      if (mint === 'mint-1') {
        throw new Error('market unavailable')
      }
      return { priceUsd: Number(mint.slice(-1)), priceChange24h: 0, marketCap: 100 }
    })
    const service = new FeedEnrichmentService(
      market,
      new StaticMetadataClient({}),
      new StaticTrustTagsClient({}),
      null,
      {
        maxItems: 20,
        concurrency: 4,
        marketTtlMs: 60_000,
        marketCacheMaxKeys: 2,
        metadataTtlMs: 60_000,
        trustTagsTtlMs: 60_000,
        failureCooldownMs: 300_000,
        sparklineWindowMinutes: 360,
        sparklinePoints: 72,
      },
      {
        warn: () => undefined,
        info: () => undefined,
      },
    )

    const signal = new AbortController().signal
    setNow(0)
    await service.enrich([buildItemForCacheTest('mint-1')], signal)
    setNow(1)
    await service.enrich([buildItemForCacheTest('mint-2')], signal)
    setNow(2)
    await service.enrich([buildItemForCacheTest('mint-1')], signal)
    setNow(3)
    await service.enrich([buildItemForCacheTest('mint-3')], signal)
    setNow(4)
    await service.enrich([buildItemForCacheTest('mint-1')], signal)
    await service.enrich([buildItemForCacheTest('mint-2')], signal)

    assert.equal(market.callsByMint.get('mint-1'), 1)
    assert.equal(market.callsByMint.get('mint-2'), 2)
    assert.equal(market.callsByMint.get('mint-3'), 1)
  })
})

test('ttl hits, stale-on-error, and cooldown reuse still work with cache caps enabled', async () => {
  await withMockedNow(async (setNow) => {
    const market = new CountingMarketClientByMint((_mint, call) => {
      if (call === 1) {
        return { priceUsd: 5, priceChange24h: 7, marketCap: 1234 }
      }
      throw new Error('upstream down')
    })
    const service = new FeedEnrichmentService(
      market,
      new StaticMetadataClient({}),
      new StaticTrustTagsClient({}),
      null,
      {
        maxItems: 20,
        concurrency: 4,
        marketTtlMs: 10,
        marketCacheMaxKeys: 1,
        metadataTtlMs: 60_000,
        trustTagsTtlMs: 60_000,
        failureCooldownMs: 300_000,
        sparklineWindowMinutes: 360,
        sparklinePoints: 72,
      },
      {
        warn: () => undefined,
        info: () => undefined,
      },
    )

    const signal = new AbortController().signal
    const input = [buildItemForCacheTest('mint-1')]

    setNow(0)
    const [first] = await service.enrich(input, signal)
    setNow(1)
    const [ttlHit] = await service.enrich(input, signal)
    setNow(11)
    const [stale] = await service.enrich(input, signal)
    setNow(12)
    const [cooldown] = await service.enrich(input, signal)

    assert.equal(first?.priceUsd, 5)
    assert.equal(ttlHit?.priceUsd, 5)
    assert.equal(stale?.priceUsd, 5)
    assert.equal(cooldown?.priceUsd, 5)
    assert.equal(market.callsByMint.get('mint-1'), 2)
  })
})

function buildItemForCacheTest(mint: string): TokenFeedItem {
  return buildItem({
    mint,
    name: mint,
    symbol: mint.toUpperCase(),
    priceUsd: 1,
    priceChange24h: 0,
    volume24h: 1000,
    liquidity: 1000,
    marketCap: 1000,
    pairAddress: null,
    category: 'trending',
    riskTier: 'allow',
  })
}
