import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import { registerFeedRoutes } from './feed.route.js'
import { TokenFeedItem } from './feed.provider.js'
import { FeedPageResult, FeedService, FeedUnavailableError } from './feed.service.js'

function buildFeedItem(): TokenFeedItem {
  return {
    mint: 'mint-route-1',
    name: 'Route Token',
    symbol: 'RTE',
    description: 'route item',
    imageUri: 'https://example.com/token.png',
    priceUsd: 1.23,
    priceChange24h: 5.6,
    volume24h: 10_000,
    liquidity: 15_000,
    marketCap: 150_000,
    sparkline: [1.1, 1.2, 1.3],
    sparklineMeta: {
      window: '6h',
      interval: '5m',
      source: 'historical_provider',
      points: 3,
      generatedAt: '2026-03-03T00:00:00.000Z',
      historyQuality: 'real_backfill',
      pointCount1m: 180,
      lastPointTimeSec: 1_704_460_800,
    },
    pairAddress: 'pair-route-1',
    pairCreatedAtMs: 1_700_000_000_000,
    tags: {
      trust: ['verified'],
      discovery: ['trending'],
    },
    labels: ['trending'],
    sources: {
      price: 'birdeye',
      liquidity: 'dexscreener',
      volume: 'dexscreener',
      marketCap: 'birdeye',
      metadata: 'helius',
      tags: ['jupiter'],
    },
    quoteSymbol: 'USDC',
    recentVolume5m: 123.45,
    recentTxns5m: 42,
    category: 'trending',
    riskTier: 'warn',
  }
}

test('GET /v1/feed preserves response contract and headers', async () => {
  const app = Fastify()
  let callbackCalled = false
  const pageResult: FeedPageResult = {
    items: [buildFeedItem()],
    nextCursor: 'next-cursor-token',
    generatedAt: '2026-03-03T00:00:00.000Z',
    cacheStatus: 'MISS',
    stale: false,
    cacheStorage: 'redis_cache',
    source: 'providers',
  }
  const feedService = {
    getPage: async () => pageResult,
  }

  await registerFeedRoutes(app, {
    feedService: feedService as unknown as FeedService,
    feedDefaultLimit: 10,
    feedMaxLimit: 20,
    rateLimitFeedPerMinute: 120,
    onFeedPageServed: () => {
      callbackCalled = true
    },
  })

  const response = await app.inject({
    method: 'GET',
    url: '/v1/feed?limit=1&category=trending',
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['x-cache'], 'MISS')
  assert.equal(response.headers['x-feed-source'], 'providers')
  const body = response.json() as Record<string, unknown>

  assert.deepEqual(Object.keys(body).sort(), ['generatedAt', 'items', 'nextCursor', 'stale'])
  assert.equal(body.nextCursor, 'next-cursor-token')
  assert.equal(body.generatedAt, '2026-03-03T00:00:00.000Z')

  const item = (body.items as TokenFeedItem[])[0]
  assert.ok(item)
  assert.equal(item.mint, 'mint-route-1')
  assert.equal(item.imageUri, 'https://example.com/token.png')
  assert.equal(item.riskTier, 'warn')
  assert.equal(item.sparklineMeta?.interval, '5m')
  assert.equal(callbackCalled, true)
})

test('GET /v1/feed returns FEED_UNAVAILABLE envelope on provider outage', async () => {
  const app = Fastify()
  let unavailableCalled = false
  const feedService = {
    getPage: async () => {
      throw new FeedUnavailableError()
    },
  }

  await registerFeedRoutes(app, {
    feedService: feedService as unknown as FeedService,
    feedDefaultLimit: 10,
    feedMaxLimit: 20,
    rateLimitFeedPerMinute: 120,
    onFeedUnavailable: () => {
      unavailableCalled = true
    },
  })

  const response = await app.inject({
    method: 'GET',
    url: '/v1/feed?limit=10',
  })

  assert.equal(response.statusCode, 503)
  const body = response.json() as {
    error?: { code?: string; message?: string }
  }
  assert.equal(body.error?.code, 'FEED_UNAVAILABLE')
  assert.equal(unavailableCalled, true)
})
