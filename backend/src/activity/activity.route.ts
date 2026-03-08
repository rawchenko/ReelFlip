import { FastifyInstance } from 'fastify'
import { errorEnvelope } from '../lib/error-envelope.js'
import { ActivityService, ActivityServiceError, InvalidActivityRequestError } from './activity.service.js'

interface ActivityRouteDependencies {
  activityService: ActivityService
  rateLimitActivityPerMinute: number
}

interface ActivityQuerystring {
  walletAddress?: string
  days?: string | number
  cursor?: string
}

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const MAX_DAYS = 90
const DEFAULT_DAYS = 30

export async function registerActivityRoutes(
  app: FastifyInstance,
  dependencies: ActivityRouteDependencies,
): Promise<void> {
  app.get<{ Querystring: ActivityQuerystring }>(
    '/v1/activity',
    {
      config: {
        rateLimit: {
          max: dependencies.rateLimitActivityPerMinute,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const startedAt = Date.now()

      try {
        const walletAddress = parseWalletAddress(request.query.walletAddress)
        const days = parseDays(request.query.days)
        const cursor = request.query.cursor

        const result = await dependencies.activityService.list(walletAddress, days, cursor)

        request.log.info(
          {
            walletAddress: walletAddress.slice(0, 8) + '...',
            days,
            eventCount: result.events.length,
            hasCursor: Boolean(cursor),
            durationMs: Date.now() - startedAt,
          },
          'Activity request completed',
        )

        return {
          events: result.events,
          nextCursor: result.nextCursor,
        }
      } catch (error) {
        if (error instanceof InvalidActivityRequestError) {
          return reply.code(error.statusCode).send(errorEnvelope('BAD_REQUEST', error.message))
        }

        if (error instanceof ActivityServiceError) {
          request.log.warn(
            { durationMs: Date.now() - startedAt },
            'Activity service error',
          )
          return reply.code(error.statusCode).send(errorEnvelope('ACTIVITY_UNAVAILABLE', error.message))
        }

        throw error
      }
    },
  )
}

function parseWalletAddress(walletAddress?: string): string {
  if (!walletAddress || walletAddress.trim().length === 0) {
    throw new InvalidActivityRequestError('walletAddress query parameter is required')
  }

  const trimmed = walletAddress.trim()
  if (!BASE58_REGEX.test(trimmed)) {
    throw new InvalidActivityRequestError('walletAddress must be a valid Solana public key')
  }

  return trimmed
}

function parseDays(days?: string | number): number {
  if (days === undefined) return DEFAULT_DAYS

  const parsed = typeof days === 'number' ? days : typeof days === 'string' ? Number.parseInt(days, 10) : Number.NaN

  if (!Number.isInteger(parsed)) {
    throw new InvalidActivityRequestError('days must be an integer')
  }

  if (parsed < 1 || parsed > MAX_DAYS) {
    throw new InvalidActivityRequestError(`days must be between 1 and ${MAX_DAYS}`)
  }

  return parsed
}
