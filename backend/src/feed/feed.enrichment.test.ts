import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BirdeyeMarketSnapshot,
  ChartHistoryBatchReader,
  FeedEnrichmentService,
  TokenMarketDataClient,
  TokenMetadataClient,
  TokenMetadataSnapshot,
  TokenTrustTagsClient,
} from './feed.enrichment.js'
import { FeedLabel, TokenFeedItem } from './feed.provider.js'

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
        candles: this.candlesByPair[pairAddress] ?? [],
      })),
    }
  }
}

test('enrichment uses source precedence and builds two-tier tags', async () => {
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
        { time: 1, open: 1, high: 1, low: 1, close: 1 },
        { time: 301, open: 1.5, high: 1.5, low: 1.5, close: 1.5 },
        { time: 601, open: 2, high: 2, low: 2, close: 2 },
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
    marketCap: 'birdeye',
    metadata: 'helius',
    tags: ['internal_risk', 'jupiter'],
  })
  assert.deepEqual(item?.sparkline, [1, 1.5, 2])
  assert.deepEqual(item?.sparklineMeta, {
    window: '6h',
    interval: '5m',
    source: 'historical_provider',
    points: 3,
    generatedAt: '2026-03-02T12:00:00.000Z',
  })
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
  const candles = Array.from({ length: 360 }, (_, index) => {
    const value = index + 1
    return { time: 1 + index * 60, open: value, high: value, low: value, close: value }
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
  assert.equal(item?.sparkline[0], 5)
  assert.equal(item?.sparkline[item.sparkline.length - 1], 360)
  assert.equal(item?.sparklineMeta?.points, 72)
  assert.equal(item?.sparklineMeta?.interval, '5m')
})

test('sparkline keeps partial history as real bucket closes without synthetic interpolation', async () => {
  const candles = Array.from({ length: 195 }, (_, index) => {
    const value = index + 1
    return { time: 1 + index * 60, open: value, high: value, low: value, close: value }
  })

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

  assert.equal(item?.sparkline.length, 39)
  assert.equal(item?.sparkline[0], 5)
  assert.equal(item?.sparkline[item.sparkline.length - 1], 195)
  assert.equal(item?.sparklineMeta?.interval, '5m')
  assert.equal(item?.sparklineMeta?.points, 39)
})
