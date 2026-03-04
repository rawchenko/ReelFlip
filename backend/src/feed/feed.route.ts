import { FastifyInstance } from 'fastify'
import { errorEnvelope } from '../lib/error-envelope.js'
import { FeedCategory } from './feed.provider.js'
import { FeedPageResult, FeedService, FeedUnavailableError, InvalidFeedRequestError } from './feed.service.js'
import type { TokenFeedItem } from './feed.provider.js'

interface FeedRouteDependencies {
  feedService: FeedService
  feedDefaultLimit: number
  feedMaxLimit: number
  rateLimitFeedPerMinute: number
  onFeedItemsServed?: (items: TokenFeedItem[]) => void
  onFeedPageServed?: (result: FeedPageResult) => void
  onFeedUnavailable?: () => void
}

interface FeedQuerystring {
  cursor?: string
  category?: string
  minLifetimeHours?: string | number
  limit?: string | number
}

const VALID_CATEGORIES: FeedCategory[] = ['trending', 'gainer', 'new', 'memecoin']
const MAX_MIN_LIFETIME_HOURS = 24 * 365

export async function registerFeedRoutes(app: FastifyInstance, dependencies: FeedRouteDependencies): Promise<void> {
  app.get<{ Querystring: FeedQuerystring }>(
    '/v1/feed',
    {
      config: {
        rateLimit: {
          max: dependencies.rateLimitFeedPerMinute,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
    const startedAt = Date.now()

    try {
      const category = parseCategory(request.query.category)
      const minLifetimeHours = parseMinLifetimeHours(request.query.minLifetimeHours)
      const limit = parseLimit(request.query.limit, dependencies.feedMaxLimit)

      const result = await dependencies.feedService.getPage({
        cursor: request.query.cursor,
        category,
        minLifetimeHours,
        limit,
      })

      reply.header('X-Cache', result.cacheStatus)
      reply.header('X-Feed-Source', result.source)

      request.log.info(
        {
          cacheStatus: result.cacheStatus,
          source: result.source,
          feed_source_providers_count: result.source === 'providers' ? 1 : 0,
          feed_source_seed_count: result.source === 'seed' ? 1 : 0,
          feed_filtered_ineligible_count: result.eligibilityStats?.filteredTotal ?? 0,
          feed_filtered_ineligible_missing_pair: result.eligibilityStats?.reasons.missing_pair ?? 0,
          feed_filtered_ineligible_insufficient_chart_history:
            result.eligibilityStats?.reasons.insufficient_chart_history ?? 0,
          feed_filtered_ineligible_chart_quality_not_full:
            result.eligibilityStats?.reasons.chart_quality_not_full ?? 0,
          limit: limit ?? dependencies.feedDefaultLimit,
          category: category ?? 'all',
          minLifetimeHours: minLifetimeHours ?? null,
          durationMs: Date.now() - startedAt,
        },
        'Feed request completed',
      )

      dependencies.onFeedItemsServed?.(result.items)
      dependencies.onFeedPageServed?.(result)

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        generatedAt: result.generatedAt,
        stale: result.stale,
      }
    } catch (error) {
      if (error instanceof InvalidFeedRequestError) {
        return reply.code(error.statusCode).send(errorEnvelope('BAD_REQUEST', error.message))
      }

      if (error instanceof FeedUnavailableError) {
        dependencies.onFeedUnavailable?.()
        request.log.warn(
          {
            category: parseCategoryOrAll(request.query.category),
            durationMs: Date.now() - startedAt,
            feed_unavailable_count: 1,
          },
          'Feed request unavailable',
        )
        return reply.code(error.statusCode).send(errorEnvelope('FEED_UNAVAILABLE', error.message))
      }

      throw error
    }
    },
  )
}

function parseCategoryOrAll(category?: string): FeedCategory | 'all' {
  if (!category) {
    return 'all'
  }
  return VALID_CATEGORIES.includes(category as FeedCategory) ? (category as FeedCategory) : 'all'
}

function parseCategory(category?: string): FeedCategory | undefined {
  if (!category) {
    return undefined
  }

  if (VALID_CATEGORIES.includes(category as FeedCategory)) {
    return category as FeedCategory
  }

  throw new InvalidFeedRequestError(`Invalid category. Expected one of: ${VALID_CATEGORIES.join(', ')}`)
}

function parseLimit(limit: string | number | undefined, maxLimit: number): number | undefined {
  if (limit === undefined) {
    return undefined
  }

  const parsed = typeof limit === 'number' ? limit : typeof limit === 'string' ? Number.parseInt(limit, 10) : Number.NaN

  if (!Number.isInteger(parsed)) {
    throw new InvalidFeedRequestError('limit must be an integer.')
  }

  if (parsed < 1 || parsed > maxLimit) {
    throw new InvalidFeedRequestError(`limit must be between 1 and ${maxLimit}.`)
  }

  return parsed
}

function parseMinLifetimeHours(minLifetimeHours: string | number | undefined): number | undefined {
  if (minLifetimeHours === undefined) {
    return undefined
  }

  const parsed =
    typeof minLifetimeHours === 'number'
      ? minLifetimeHours
      : typeof minLifetimeHours === 'string'
        ? Number.parseInt(minLifetimeHours, 10)
        : Number.NaN

  if (!Number.isInteger(parsed)) {
    throw new InvalidFeedRequestError('minLifetimeHours must be an integer.')
  }

  if (parsed < 0 || parsed > MAX_MIN_LIFETIME_HOURS) {
    throw new InvalidFeedRequestError(`minLifetimeHours must be between 0 and ${MAX_MIN_LIFETIME_HOURS}.`)
  }

  return parsed
}
