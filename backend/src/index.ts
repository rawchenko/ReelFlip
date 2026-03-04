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
import { registerImageProxyRoute } from './feed/image-proxy.route.js'
import { registerFeedRoutes } from './feed/feed.route.js'
import { CompositeFeedProvider, DexScreenerFeedProvider, SeedFeedProvider } from './feed/feed.provider.js'
import { DEFAULT_SEEDED_FEED } from './feed/feed.seed.js'
import { FeedRankingService, FeedService } from './feed/feed.service.js'
import { TokenIngestJob } from './ingest/token.ingest.job.js'
import { errorEnvelope } from './lib/error-envelope.js'
import { BackendMetrics } from './observability/backend.metrics.js'
import {
  buildFeedSeedRateAlert,
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
})
const metrics = new BackendMetrics()
const alertContext = {
  service: 'reelflip-backend',
  environment: (process.env.NODE_ENV ?? 'development').trim() || 'development',
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
const tokenRepository = new TokenRepository(supabaseClient, app.log)
const feedRepository = new FeedRepository(supabaseClient, app.log)
const chartRepository = new ChartRepository(supabaseClient, app.log)

const feedCache = new FeedCache({
  redisUrl: env.redisUrl,
  ttlSeconds: env.feedCacheTtlSeconds,
  staleTtlSeconds: env.feedCacheStaleTtlSeconds,
  cursorTtlSeconds: env.feedCursorTtlSeconds,
  snapshotHistoryMax: env.feedSnapshotHistoryMax,
  logger: app.log,
})

await feedCache.initialize()

const chartHistoryCache = new ChartHistoryCache({
  redisUrl: env.redisUrl,
  ttlSeconds: env.chartHistoryCacheTtlSeconds,
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
    chartRepository,
    readThroughEnabled: env.supabaseReadEnabled,
    writeThroughEnabled: env.supabaseDualWriteEnabled,
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
  {
    enableSeedFallback: env.feedEnableSeedFallback,
  },
)

const feedService = new FeedService(feedCache, feedProvider, new FeedRankingService(), env.feedDefaultLimit, {
  enableSeedFallback: env.feedEnableSeedFallback,
  minChartCandles: env.feedMinChartCandles,
  requireFullChartHistory: env.feedRequireFullChartHistory,
  enforceRenderableTokens: !env.feedEnableSeedFallback,
  tokenRepository,
  feedRepository,
  readThroughEnabled: env.supabaseReadEnabled,
  writeThroughEnabled: env.supabaseDualWriteEnabled,
  logger: app.log,
})

const tokenIngestJob = new TokenIngestJob(
  feedService,
  chartRepository.isEnabled() ? chartRepository : null,
  {
    intervalSeconds: env.tokenIngestIntervalSeconds,
    candleRetentionDays: env.tokenCandleRetentionDays,
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
  },
)

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
  onFeedPageServed: (result) => {
    metrics.recordFeedPage({
      source: result.source,
      cacheStatus: result.cacheStatus,
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
await registerImageProxyRoute(app)

await registerChartRoutes(app, {
  chartRegistry,
  chartHistoryService,
})

app.get('/health', async () => {
  return {
    status: 'ok',
    cacheMode: feedCache.cacheMode(),
    chartHistoryCacheMode: chartHistoryCache.cacheMode(),
    supabaseEnabled: supabaseClient.isEnabled(),
    supabaseReadEnabled: env.supabaseReadEnabled,
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

if (env.supabaseDualWriteEnabled && supabaseClient.isEnabled()) {
  tokenIngestJob.start()
}

app.log.info(
  {
    host: env.host,
    port: env.port,
    cacheMode: feedCache.cacheMode(),
    chartHistoryCacheMode: chartHistoryCache.cacheMode(),
    supabaseEnabled: supabaseClient.isEnabled(),
    supabaseReadEnabled: env.supabaseReadEnabled,
    supabaseDualWriteEnabled: env.supabaseDualWriteEnabled,
  },
  'Feed backend started',
)
