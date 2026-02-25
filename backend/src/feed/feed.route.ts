import { FastifyInstance } from 'fastify'
import { errorEnvelope } from '../lib/error-envelope.js'
import { FeedCategory } from './feed.provider.js'
import { FeedService, InvalidFeedRequestError } from './feed.service.js'

interface FeedRouteDependencies {
  feedService: FeedService
  feedDefaultLimit: number
  feedMaxLimit: number
}

interface FeedQuerystring {
  cursor?: string
  category?: string
  limit?: string | number
}

const VALID_CATEGORIES: FeedCategory[] = ['trending', 'gainer', 'new', 'memecoin']

export async function registerFeedRoutes(app: FastifyInstance, dependencies: FeedRouteDependencies): Promise<void> {
  app.get<{ Querystring: FeedQuerystring }>('/v1/feed', async (request, reply) => {
    const startedAt = Date.now()

    try {
      const category = parseCategory(request.query.category)
      const limit = parseLimit(request.query.limit, dependencies.feedMaxLimit)

      const result = await dependencies.feedService.getPage({
        cursor: request.query.cursor,
        category,
        limit,
      })

      reply.header('X-Cache', result.cacheStatus)
      reply.header('X-Feed-Source', result.source)

      request.log.info(
        {
          cacheStatus: result.cacheStatus,
          source: result.source,
          limit: limit ?? dependencies.feedDefaultLimit,
          category: category ?? 'all',
          durationMs: Date.now() - startedAt,
        },
        'Feed request completed',
      )

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        generatedAt: result.generatedAt,
      }
    } catch (error) {
      if (error instanceof InvalidFeedRequestError) {
        return reply.code(error.statusCode).send(errorEnvelope('BAD_REQUEST', error.message))
      }

      throw error
    }
  })
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
