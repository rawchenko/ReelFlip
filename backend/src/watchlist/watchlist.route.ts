import { FastifyInstance } from 'fastify'
import { errorEnvelope } from '../lib/error-envelope.js'
import { WatchlistService, WatchlistServiceError } from './watchlist.service.js'

interface WatchlistRouteDependencies {
  watchlistService: WatchlistService
  rateLimitWatchlistPerMinute: number
  authPreHandler: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
}

interface AddWatchlistBody {
  mint?: string
}

interface RemoveWatchlistParams {
  mint: string
}

export async function registerWatchlistRoutes(
  app: FastifyInstance,
  dependencies: WatchlistRouteDependencies,
): Promise<void> {
  const preHandler = [dependencies.authPreHandler]
  const rateLimit = {
    max: dependencies.rateLimitWatchlistPerMinute,
    timeWindow: '1 minute',
  }

  app.get(
    '/v1/watchlist',
    {
      preHandler,
      config: { rateLimit },
    },
    async (request, reply) => {
      try {
        const wallet = request.authWallet
        if (!wallet) {
          return reply.code(401).send(errorEnvelope('UNAUTHORIZED', 'Authentication required'))
        }

        const entries = await dependencies.watchlistService.getWatchlist(wallet)
        return { mints: entries.map((e) => e.mint) }
      } catch (error) {
        if (error instanceof WatchlistServiceError) {
          return reply.code(error.statusCode).send(errorEnvelope(error.code, error.message))
        }
        throw error
      }
    },
  )

  app.post<{ Body: AddWatchlistBody }>(
    '/v1/watchlist',
    {
      preHandler,
      config: { rateLimit },
    },
    async (request, reply) => {
      try {
        const wallet = request.authWallet
        if (!wallet) {
          return reply.code(401).send(errorEnvelope('UNAUTHORIZED', 'Authentication required'))
        }

        const body = request.body ?? {}
        const mint = typeof body.mint === 'string' ? body.mint.trim() : ''
        if (mint.length === 0) {
          return reply.code(400).send(errorEnvelope('BAD_REQUEST', 'mint is required'))
        }

        const entry = await dependencies.watchlistService.addToWatchlist(wallet, mint)
        return reply.code(201).send(entry)
      } catch (error) {
        if (error instanceof WatchlistServiceError) {
          return reply.code(error.statusCode).send(errorEnvelope(error.code, error.message))
        }
        throw error
      }
    },
  )

  app.delete<{ Params: RemoveWatchlistParams }>(
    '/v1/watchlist/:mint',
    {
      preHandler,
      config: { rateLimit },
    },
    async (request, reply) => {
      try {
        const wallet = request.authWallet
        if (!wallet) {
          return reply.code(401).send(errorEnvelope('UNAUTHORIZED', 'Authentication required'))
        }

        await dependencies.watchlistService.removeFromWatchlist(wallet, request.params.mint)
        return reply.code(204).send()
      } catch (error) {
        if (error instanceof WatchlistServiceError) {
          return reply.code(error.statusCode).send(errorEnvelope(error.code, error.message))
        }
        throw error
      }
    },
  )
}
