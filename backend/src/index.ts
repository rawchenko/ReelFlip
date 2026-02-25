import cors from '@fastify/cors'
import Fastify from 'fastify'
import { loadEnv } from './config/env.js'
import { FeedCache } from './feed/feed.cache.js'
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

const feedProvider = new CompositeFeedProvider(
  [
    new DexScreenerFeedProvider(
      {
        timeoutMs: env.dexScreenerTimeoutMs,
        searchQuery: env.dexScreenerSearchQuery,
      },
      app.log,
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
})

app.get('/health', async () => {
  return {
    status: 'ok',
    cacheMode: feedCache.cacheMode(),
  }
})

app.setErrorHandler((error, _request, reply) => {
  reply.code(500).send(errorEnvelope('INTERNAL', 'Unexpected server error'))

  app.log.error({ error }, 'Unhandled server error')
})

const closeGracefully = async () => {
  await app.close()
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

app.log.info({ host: env.host, port: env.port, cacheMode: feedCache.cacheMode() }, 'Feed backend started')
