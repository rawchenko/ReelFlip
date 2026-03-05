import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { ChartHistoryCache } from './chart/chart.history-cache.js'
import { ChartHistoryService } from './chart/chart.history-service.js'
import { BirdeyeHistoricalCandleProvider } from './chart/chart.history-provider.birdeye.js'
import { FallbackHistoricalCandleProvider } from './chart/chart.history-provider.composite.js'
import { GeckoTerminalHistoricalCandleProvider } from './chart/chart.history-provider.geckoterminal.js'
import { HistoricalCandleProvider, NoopHistoricalCandleProvider } from './chart/chart.history-provider.js'
import { DexScreenerChartProvider } from './chart/chart.provider.dexscreener.js'
import { ChartRegistry } from './chart/chart.registry.js'
import { registerChartRoutes } from './chart/chart.route.js'
import { CachePollLock, ChartStreamService } from './chart/chart.stream.service.js'
import { loadEnv } from './config/env.js'
import { MemoryCacheStore } from './cache/cache.memory.js'
import { RedisCacheStore } from './cache/cache.redis.js'
import { CacheStore } from './cache/cache.types.js'
import { FeedCache } from './feed/feed.cache.js'
import {
  BirdeyeMarketDataClient,
  FeedEnrichmentService,
  HeliusMetadataClient,
  JupiterTrustTagsClient,
} from './feed/feed.enrichment.js'
import { registerImageProxyRoute } from './feed/image-proxy.route.js'
import { registerFeedRoutes } from './feed/feed.route.js'
import { CompositeFeedProvider, DexScreenerFeedProvider, SeedFeedProvider } from './feed/feed.provider.js'
import { DEFAULT_SEEDED_FEED } from './feed/feed.seed.js'
import { FeedSnapshotRefresher } from './feed/feed.snapshot-refresher.js'
import { FeedRankingService, FeedService } from './feed/feed.service.js'
import { TokenIngestJob } from './ingest/token.ingest.job.js'
import { errorEnvelope } from './lib/error-envelope.js'
import { BackendMetrics } from './observability/backend.metrics.js'
import {
  buildFeedSeedRateAlert,
  buildIngestDurableFailureThresholdAlert,
  buildIngestFailureThresholdAlert,
  buildIngestMissedIntervalsAlert,
  buildSupabaseFailureRateAlert,
} from './observability/migration-alerts.js'
import { WebhookAlertNotifier } from './observability/webhook.alert-notifier.js'
import { ChartRepository } from './storage/chart.repository.js'
import { FeedRepository } from './storage/feed.repository.js'
import { SupabaseClient } from './storage/supabase.client.js'
import { TokenRepository } from './storage/token.repository.js'

const env = loadEnv()

if (env.feedDefaultLimit > env.feedMaxLimit) {
  throw new Error('FEED_DEFAULT_LIMIT must be <= FEED_MAX_LIMIT')
}

const app = Fastify({
  logger: {
    level: env.logLevel,
  },
  requestIdHeader: 'x-correlation-id',
})
const metrics = new BackendMetrics()

app.addHook('onRequest', async (request, reply) => {
  const correlationIdHeader = request.headers['x-correlation-id']
  const correlationId =
    typeof correlationIdHeader === 'string' && correlationIdHeader.trim().length > 0
      ? correlationIdHeader.trim()
      : request.id
  reply.header('x-correlation-id', correlationId)
  ;(request as unknown as { log: typeof request.log }).log = request.log.child({ correlationId })
})

app.addHook('onResponse', async (_request, reply) => {
  if (reply.statusCode === 429) {
    metrics.recordRateLimitHit()
  }
})

const alertContext = {
  service: 'reelflip-backend',
  environment: env.runtimeMode,
}
const alertNotifier = new WebhookAlertNotifier({
  url: env.alertWebhookUrl,
  timeoutMs: env.alertWebhookTimeoutMs,
  retryCount: env.alertWebhookRetryCount,
  cooldownSeconds: env.alertWebhookCooldownSeconds,
  logger: app.log,
})

const supabaseClient = new SupabaseClient({
  url: env.supabaseUrl,
  serviceRoleKey: env.supabaseServiceRoleKey,
  requestTimeoutMs: env.supabaseRequestTimeoutMs,
  onRequestComplete: (event) => {
    metrics.recordSupabaseRequest(event)
    const alert = metrics.maybeSupabaseFailureRateAlert(env.alertSupabaseFailureRateThreshold, env.alertMinRequests)
    if (alert.shouldAlert) {
      app.log.warn(
        {
          totalRequests: alert.totalRequests,
          failedRequests: alert.failedRequests,
          failureRate: Number(alert.failureRate.toFixed(3)),
        },
        'Supabase request failure rate is above threshold',
      )
      void alertNotifier.notify(
        buildSupabaseFailureRateAlert(alertContext, {
          failureRate: alert.failureRate,
          totalRequests: alert.totalRequests,
          failedRequests: alert.failedRequests,
        }),
      )
    }
  },
})

const tokenRepository = new TokenRepository(supabaseClient, app.log, {
  onRowsWritten: (tableOrView, rowCount) => {
    metrics.recordSupabaseRowsWritten(tableOrView, rowCount)
  },
})
const feedRepository = new FeedRepository(supabaseClient, app.log, {
  onRowsWritten: (tableOrView, rowCount) => {
    metrics.recordSupabaseRowsWritten(tableOrView, rowCount)
  },
})
const chartRepository = new ChartRepository(supabaseClient, app.log, {
  onRowsWritten: (tableOrView, rowCount) => {
    metrics.recordSupabaseRowsWritten(tableOrView, rowCount)
  },
})

let redisCacheStore: RedisCacheStore | null = null
let cacheStore: CacheStore
let degraded = false

if (env.redisUrl) {
  const candidate = new RedisCacheStore({
    redisUrl: env.redisUrl,
    connectTimeoutMs: env.redisConnectTimeoutMs,
    logger: app.log,
  })
  const connected = await candidate.connect()

  if (connected) {
    redisCacheStore = candidate
    cacheStore = candidate
  } else if (env.cacheRequired && !env.allowDegradedStart) {
    throw new Error('Redis is required but unavailable. Refusing startup.')
  } else {
    degraded = env.runtimeMode === 'prod'
    cacheStore = new MemoryCacheStore()
  }
} else if (env.cacheRequired && !env.allowDegradedStart) {
  throw new Error('CACHE_REQUIRED=true but REDIS_URL is missing. Refusing startup.')
} else {
  degraded = env.runtimeMode === 'prod' && env.cacheRequired
  cacheStore = new MemoryCacheStore()
}

await app.register(cors, {
  origin: true,
})

await app.register(rateLimit, {
  global: false,
  max: 1000,
  timeWindow: '1 minute',
  ...(redisCacheStore?.getClient() ? { redis: redisCacheStore.getClient() } : {}),
})

const feedCache = new FeedCache({
  store: cacheStore,
  ttlSeconds: env.feedCacheTtlSeconds,
  staleTtlSeconds: env.feedCacheStaleTtlSeconds,
  cursorTtlSeconds: env.feedCursorTtlSeconds,
  snapshotHistoryMax: env.feedSnapshotHistoryMax,
  logger: app.log,
})

await feedCache.initialize()

const chartHistoryCache = new ChartHistoryCache({
  store: cacheStore,
  ttlSeconds: env.chartHistoryCacheTtlSeconds,
  maxCandles: env.chartHistoryLimit,
  logger: app.log,
})

await chartHistoryCache.initialize()

const chartStreamService = new ChartStreamService(redisCacheStore?.getClient() ?? null, {
  maxLen: env.chartStreamMaxLen,
})

function buildHistoricalProvider(
  provider: typeof env.chartHistoryProvider,
): HistoricalCandleProvider {
  if (provider === 'public') {
    return new GeckoTerminalHistoricalCandleProvider(
      {
        timeoutMs: env.chartHistoryProviderTimeoutMs,
      },
      app.log,
    )
  }

  if (provider === 'birdeye') {
    return new BirdeyeHistoricalCandleProvider(
      {
        apiKey: env.birdeyeApiKey,
        timeoutMs: env.chartHistoryProviderTimeoutMs,
        onRequestComplete: (event) => metrics.recordUpstreamRequest(event),
      },
      app.log,
    )
  }

  return new NoopHistoricalCandleProvider()
}

const primaryHistoricalProvider = buildHistoricalProvider(env.chartHistoryProvider)
const fallbackHistoricalProvider = buildHistoricalProvider(env.chartHistoryProviderFallback)
const chartHistoricalProvider =
  env.chartHistoryProviderFallback !== 'none' &&
  env.chartHistoryProviderFallback !== env.chartHistoryProvider
    ? new FallbackHistoricalCandleProvider(primaryHistoricalProvider, fallbackHistoricalProvider, app.log)
    : primaryHistoricalProvider

const chartRegistry = new ChartRegistry(
  new DexScreenerChartProvider(
    {
      timeoutMs: env.dexScreenerTimeoutMs,
      onRequestComplete: (event) => metrics.recordUpstreamRequest(event),
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
  {
    streamSink: chartStreamService,
    pollLock: redisCacheStore?.isAvailable() ? new CachePollLock(cacheStore) : undefined,
    onStreamPublished: (event) => {
      if (!('pairAddress' in event) || !('interval' in event) || !event.interval) {
        return
      }
      metrics.recordChartStreamPublished(event.pairAddress, event.interval)
    },
  },
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
    chartRepository,
    readThroughEnabled: env.supabaseReadEnabled,
    preferSupabaseRead: env.supabasePreferReadFirst,
    writeThroughEnabled: env.supabaseDualWriteEnabled,
  },
  app.log,
)

const feedEnrichmentService = new FeedEnrichmentService(
  new BirdeyeMarketDataClient(
    {
      apiKey: env.birdeyeApiKey,
      timeoutMs: env.birdeyeTimeoutMs,
      onRequestComplete: (event) => metrics.recordUpstreamRequest(event),
    },
    app.log,
  ),
  new HeliusMetadataClient(
    {
      apiKey: env.heliusApiKey,
      enabled: env.feedHeliusMetadataEnabled,
      timeoutMs: env.heliusTimeoutMs,
      dasUrl: env.heliusDasUrl,
      onRequestComplete: (event) => metrics.recordUpstreamRequest(event),
    },
    app.log,
  ),
  new JupiterTrustTagsClient(
    {
      ttlMs: env.jupiterTagsTtlMs,
      onRequestComplete: (event) => metrics.recordUpstreamRequest(event),
    },
    app.log,
  ),
  chartHistoryService,
  {
    maxItems: env.feedEnrichmentMaxItems,
    concurrency: env.feedEnrichmentConcurrency,
    marketTtlMs: env.feedMarketTtlSeconds * 1000,
    marketCacheMaxKeys: env.feedMarketCacheMaxKeys,
    metadataTtlMs: env.feedMetadataTtlSeconds * 1000,
    metadataCacheMaxKeys: env.feedMetadataCacheMaxKeys,
    trustTagsTtlMs: env.jupiterTagsTtlMs,
    trustTagsCacheMaxKeys: env.feedTrustTagsCacheMaxKeys,
    failureCooldownMs: env.feedEnrichmentFailureCooldownSeconds * 1000,
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
        onRequestComplete: (event) => metrics.recordUpstreamRequest(event),
      },
      app.log,
      feedEnrichmentService,
    ),
  ],
  new SeedFeedProvider(DEFAULT_SEEDED_FEED),
  app.log,
  {
    enableSeedFallback: env.feedEnableSeedFallback,
  },
)

const feedService = new FeedService(feedCache, feedProvider, new FeedRankingService(), env.feedDefaultLimit, {
  enableSeedFallback: env.feedEnableSeedFallback,
  minChartCandles: env.feedMinChartCandles,
  requireFullChartHistory: env.feedRequireFullChartHistory,
  trendingMinLifetimeHours: env.feedTrendingMinLifetimeHours,
  trendingExcludeRiskBlock: env.feedTrendingExcludeRiskBlock,
  trendingRequireProviderSource: env.feedTrendingRequireProviderSource,
  enforceRenderableTokens: !env.feedEnableSeedFallback,
  tokenRepository,
  feedRepository,
  readThroughEnabled: env.supabaseReadEnabled,
  preferSupabaseRead: env.supabasePreferReadFirst,
  writeThroughEnabled: env.supabaseDualWriteEnabled,
  allowSyncRefreshOnMiss: false,
  logger: app.log,
})

const feedSnapshotRefresher = new FeedSnapshotRefresher(feedService, cacheStore, app.log, {
  intervalSeconds: env.feedRefreshIntervalSeconds,
})

const tokenIngestJob = new TokenIngestJob(
  feedService,
  chartRepository.isEnabled() ? chartRepository : null,
  {
    intervalSeconds: env.tokenIngestIntervalSeconds,
    candleRetentionDays: env.tokenCandleRetentionDays,
    requireDurablePersistence: env.supabaseDualWriteEnabled,
  },
  app.log,
  metrics,
  {
    onFailureThreshold: (event) => {
      void alertNotifier.notify(
        buildIngestFailureThresholdAlert(alertContext, {
          cycle: event.cycle,
          consecutiveFailures: event.consecutiveFailures,
          intervalSeconds: event.intervalSeconds,
        }),
      )
    },
    onMissedIntervals: (event) => {
      void alertNotifier.notify(
        buildIngestMissedIntervalsAlert(alertContext, {
          missedIntervals: event.missedIntervals,
          lagMs: event.lagMs,
          intervalSeconds: event.intervalSeconds,
        }),
      )
    },
    onDurableFailureThreshold: (event) => {
      void alertNotifier.notify(
        buildIngestDurableFailureThresholdAlert(alertContext, {
          cycle: event.cycle,
          consecutiveDurableFailures: event.consecutiveDurableFailures,
          intervalSeconds: event.intervalSeconds,
        }),
      )
    },
  },
)

await registerFeedRoutes(app, {
  feedService,
  feedDefaultLimit: env.feedDefaultLimit,
  feedMaxLimit: env.feedMaxLimit,
  rateLimitFeedPerMinute: env.rateLimitFeedPerMinute,
  onFeedItemsServed: (items) => {
    if (env.chartHistoryWarmupTopPairs <= 0) {
      return
    }

    const pairAddresses = items.map((item) => item.pairAddress ?? '').filter((pair) => pair.length > 0)
    chartHistoryService.warmupPairs(pairAddresses)
  },
  onFeedPageServed: (result) => {
    metrics.recordFeedPage({
      source: result.source,
      cacheStatus: result.cacheStatus,
      cacheStorage: result.cacheStorage,
    })
    const alert = metrics.maybeFeedSeedRateAlert(env.alertFeedSeedRateThreshold, env.alertMinRequests)
    if (alert.shouldAlert) {
      app.log.warn(
        {
          totalRequests: alert.totalRequests,
          seedRate: Number(alert.seedRate.toFixed(3)),
        },
        'Feed source seed ratio is above threshold',
      )
      void alertNotifier.notify(
        buildFeedSeedRateAlert(alertContext, {
          seedRate: alert.seedRate,
          totalRequests: alert.totalRequests,
        }),
      )
    }
  },
  onFeedUnavailable: () => {
    metrics.recordFeedUnavailable()
  },
})

await registerImageProxyRoute(app, {
  rateLimitImageProxyPerMinute: env.rateLimitImageProxyPerMinute,
})

await registerChartRoutes(app, {
  chartRegistry,
  chartHistoryService,
  chartStreamService,
  rateLimitChartHistoryPerMinute: env.rateLimitChartHistoryPerMinute,
  rateLimitChartStreamPerMinute: env.rateLimitChartStreamPerMinute,
  onStreamEventConsumed: (event) => {
    if (!('pairAddress' in event) || !('interval' in event) || !event.interval) {
      return
    }
    const lagMs =
      typeof event.observedAtMs === 'number' && Number.isFinite(event.observedAtMs)
        ? Math.max(0, Date.now() - event.observedAtMs)
        : undefined
    metrics.recordChartStreamConsumed(event.pairAddress, event.interval, lagMs)
  },
  onStreamQueueSample: (pairAddress, interval, queueSize) => {
    metrics.recordChartStreamQueueSize(pairAddress, interval, queueSize)
  },
})

app.get('/health', async () => {
  return {
    status: 'ok',
    runtimeMode: env.runtimeMode,
    cacheRequired: env.cacheRequired,
    degraded,
    redisConnected: redisCacheStore?.isAvailable() ?? false,
    streamBackend: chartStreamService.isAvailable() ? 'redis-streams' : 'unavailable',
    cacheMode: feedCache.cacheMode(),
    chartHistoryCacheMode: chartHistoryCache.cacheMode(),
    supabaseEnabled: supabaseClient.isEnabled(),
    supabaseReadEnabled: env.supabaseReadEnabled,
    supabasePreferReadFirst: env.supabasePreferReadFirst,
    supabaseDualWriteEnabled: env.supabaseDualWriteEnabled,
    metrics: metrics.snapshot(),
  }
})

app.get('/metrics', async () => {
  return metrics.snapshot()
})

app.setErrorHandler((error, _request, reply) => {
  reply.code(500).send(errorEnvelope('INTERNAL', 'Unexpected server error'))

  app.log.error({ error }, 'Unhandled server error')
})

const closeGracefully = async () => {
  feedSnapshotRefresher.stop()
  tokenIngestJob.stop()
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

feedSnapshotRefresher.start()

if (env.supabaseDualWriteEnabled && supabaseClient.isEnabled()) {
  tokenIngestJob.start()
}

app.log.info(
  {
    host: env.host,
    port: env.port,
    runtimeMode: env.runtimeMode,
    cacheRequired: env.cacheRequired,
    degraded,
    redisConnected: redisCacheStore?.isAvailable() ?? false,
    streamBackend: chartStreamService.isAvailable() ? 'redis-streams' : 'unavailable',
    cacheMode: feedCache.cacheMode(),
    chartHistoryCacheMode: chartHistoryCache.cacheMode(),
    supabaseEnabled: supabaseClient.isEnabled(),
    supabaseReadEnabled: env.supabaseReadEnabled,
    supabasePreferReadFirst: env.supabasePreferReadFirst,
    supabaseDualWriteEnabled: env.supabaseDualWriteEnabled,
  },
  'Feed backend started',
)
