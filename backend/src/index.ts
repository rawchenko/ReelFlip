import cors from '@fastify/cors'
import Fastify from 'fastify'
import { ChartHistoryCache } from './chart/chart.history-cache.js'
import { ChartHistoryService } from './chart/chart.history-service.js'
import { GeckoTerminalHistoricalCandleProvider } from './chart/chart.history-provider.geckoterminal.js'
import { NoopHistoricalCandleProvider } from './chart/chart.history-provider.js'
import { DexScreenerChartProvider } from './chart/chart.provider.dexscreener.js'
import { ChartRegistry } from './chart/chart.registry.js'
import { registerChartRoutes } from './chart/chart.route.js'
import { loadEnv } from './config/env.js'
import { FeedCache } from './feed/feed.cache.js'
import {
  BirdeyeMarketDataClient,
  FeedEnrichmentService,
  HeliusMetadataClient,
  JupiterTrustTagsClient,
} from './feed/feed.enrichment.js'
import { registerFeedRoutes } from './feed/feed.route.js'
import { CompositeFeedProvider, DexScreenerFeedProvider, SeedFeedProvider } from './feed/feed.provider.js'
import { DEFAULT_SEEDED_FEED } from './feed/feed.seed.js'
import { FeedRankingService, FeedService } from './feed/feed.service.js'
import { errorEnvelope } from './lib/error-envelope.js'

const env = loadEnv()

if (env.feedDefaultLimit > env.feedMaxLimit) {
  throw new Error('FEED_DEFAULT_LIMIT must be <= FEED_MAX_LIMIT')
}

const app = Fastify({
  logger: {
    level: env.logLevel,
  },
})

const feedCache = new FeedCache({
  redisUrl: env.redisUrl,
  ttlSeconds: env.feedCacheTtlSeconds,
  staleTtlSeconds: env.feedCacheStaleTtlSeconds,
  logger: app.log,
})

await feedCache.initialize()

const chartHistoryCache = new ChartHistoryCache({
  redisUrl: env.redisUrl,
  maxCandles: env.chartHistoryLimit,
  logger: app.log,
})

await chartHistoryCache.initialize()

const chartHistoricalProvider =
  env.chartHistoryProvider === 'public'
    ? new GeckoTerminalHistoricalCandleProvider(
        {
          timeoutMs: env.chartHistoryProviderTimeoutMs,
        },
        app.log,
      )
    : new NoopHistoricalCandleProvider()

const chartRegistry = new ChartRegistry(
  new DexScreenerChartProvider(
    {
      timeoutMs: env.dexScreenerTimeoutMs,
    },
    app.log,
  ),
  {
    enabled: env.chartEnabled,
    pollIntervalMs: env.chartIntervalMs,
    historyLimit: env.chartHistoryLimit,
    staleAfterMs: env.chartStaleAfterMs,
    pairIdleTtlMs: env.chartPairIdleTtlMs,
    maxPairsPerStream: env.chartMaxPairsPerStream,
    maxActivePairsGlobal: env.chartMaxActivePairsGlobal,
  },
  app.log,
  chartHistoryCache,
)

const chartHistoryService = new ChartHistoryService(
  chartRegistry,
  chartHistoryCache,
  chartHistoricalProvider,
  {
    historyLimit: env.chartHistoryLimit,
    bootstrapLimit: env.chartBootstrapLimit,
    batchMaxPairs: env.chartBatchMaxPairs,
    backfillEnabled: env.chartHistoryBackfillEnabled,
    backfillConcurrency: env.chartHistoryBackfillConcurrency,
    warmupTopPairs: env.chartHistoryWarmupTopPairs,
  },
  app.log,
)

const feedEnrichmentService = new FeedEnrichmentService(
  new BirdeyeMarketDataClient(
    {
      apiKey: env.birdeyeApiKey,
      timeoutMs: env.birdeyeTimeoutMs,
    },
    app.log,
  ),
  new HeliusMetadataClient(
    {
      apiKey: env.heliusApiKey,
      timeoutMs: env.heliusTimeoutMs,
      dasUrl: env.heliusDasUrl,
    },
    app.log,
  ),
  new JupiterTrustTagsClient(
    {
      ttlMs: env.jupiterTagsTtlMs,
    },
    app.log,
  ),
  chartHistoryService,
  {
    maxItems: env.feedEnrichmentMaxItems,
    concurrency: env.feedEnrichmentConcurrency,
    sparklineWindowMinutes: env.feedSparklineWindowMinutes,
    sparklinePoints: env.feedSparklinePoints,
  },
  app.log,
)

const feedProvider = new CompositeFeedProvider(
  [
    new DexScreenerFeedProvider(
      {
        timeoutMs: env.dexScreenerTimeoutMs,
        searchQuery: env.dexScreenerSearchQuery,
        tokenMints: env.dexScreenerTokenMints,
      },
      app.log,
      feedEnrichmentService,
    ),
  ],
  new SeedFeedProvider(DEFAULT_SEEDED_FEED),
  app.log,
)

const feedService = new FeedService(feedCache, feedProvider, new FeedRankingService(), env.feedDefaultLimit)

await app.register(cors, {
  origin: true,
})

await registerFeedRoutes(app, {
  feedService,
  feedDefaultLimit: env.feedDefaultLimit,
  feedMaxLimit: env.feedMaxLimit,
  onFeedItemsServed: (items) => {
    if (env.chartHistoryWarmupTopPairs <= 0) {
      return
    }

    const pairAddresses = items.map((item) => item.pairAddress ?? '').filter((pair) => pair.length > 0)
    chartHistoryService.warmupPairs(pairAddresses)
  },
})

await registerChartRoutes(app, {
  chartRegistry,
  chartHistoryService,
})

app.get('/health', async () => {
  return {
    status: 'ok',
    cacheMode: feedCache.cacheMode(),
    chartHistoryCacheMode: chartHistoryCache.cacheMode(),
  }
})

app.setErrorHandler((error, _request, reply) => {
  reply.code(500).send(errorEnvelope('INTERNAL', 'Unexpected server error'))

  app.log.error({ error }, 'Unhandled server error')
})

const closeGracefully = async () => {
  await app.close()
  await chartRegistry.close()
  await chartHistoryCache.close()
  await feedCache.close()
}

process.once('SIGINT', () => {
  void closeGracefully().finally(() => process.exit(0))
})

process.once('SIGTERM', () => {
  void closeGracefully().finally(() => process.exit(0))
})

await app.listen({
  host: env.host,
  port: env.port,
})

app.log.info(
  {
    host: env.host,
    port: env.port,
    cacheMode: feedCache.cacheMode(),
    chartHistoryCacheMode: chartHistoryCache.cacheMode(),
  },
  'Feed backend started',
)
