import { FastifyInstance } from 'fastify'
import { errorEnvelope } from '../lib/error-envelope.js'
import { AuthService, AuthServiceError } from './auth.service.js'
import type { ChallengeRequest, VerifyRequest } from './auth.types.js'

interface AuthRouteDependencies {
  authService: AuthService
  rateLimitAuthPerMinute: number
}

export async function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDependencies): Promise<void> {
  app.post<{ Body: Partial<ChallengeRequest> }>(
    '/v1/auth/challenge',
    {
      config: {
        rateLimit: {
          max: deps.rateLimitAuthPerMinute,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body ?? {}
        const wallet = parseRequiredString(body.wallet, 'wallet')
        return await deps.authService.createChallenge(wallet)
      } catch (error) {
        return handleAuthRouteError(request.log, reply, error)
      }
    },
  )

  app.post<{ Body: Partial<VerifyRequest> }>(
    '/v1/auth/verify',
    {
      config: {
        rateLimit: {
          max: deps.rateLimitAuthPerMinute,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body ?? {}
        return await deps.authService.verifyChallenge({
          wallet: parseRequiredString(body.wallet, 'wallet'),
          signature: parseRequiredString(body.signature, 'signature'),
          nonce: parseRequiredString(body.nonce, 'nonce'),
        })
      } catch (error) {
        return handleAuthRouteError(request.log, reply, error)
      }
    },
  )
}

function parseRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AuthServiceError('BAD_REQUEST', 400, `${label} is required`)
  }
  return value.trim()
}

function handleAuthRouteError(
  log: { error: (obj: unknown, msg?: string) => void },
  reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } },
  error: unknown,
) {
  if (error instanceof AuthServiceError) {
    return reply.code(error.statusCode).send(errorEnvelope(error.code, error.message))
  }

  log.error(error, 'Unexpected auth route error')
  return reply.code(500).send(errorEnvelope('INTERNAL', 'Unexpected auth server error'))
}
