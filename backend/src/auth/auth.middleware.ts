import { FastifyReply, FastifyRequest } from 'fastify'
import { errorEnvelope } from '../lib/error-envelope.js'
import { AuthService, AuthServiceError } from './auth.service.js'

declare module 'fastify' {
  interface FastifyRequest {
    authWallet?: string
  }
}

export function createAuthPreHandler(authService: AuthService) {
  return async function authPreHandler(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send(errorEnvelope('UNAUTHORIZED', 'Authorization header is required'))
    }

    const token = authHeader.slice(7)
    if (token.length === 0) {
      return reply.code(401).send(errorEnvelope('UNAUTHORIZED', 'Bearer token is required'))
    }

    try {
      const payload = await authService.verifyToken(token)
      request.authWallet = payload.wallet
    } catch (error) {
      if (error instanceof AuthServiceError) {
        return reply.code(error.statusCode).send(errorEnvelope(error.code, error.message))
      }
      return reply.code(401).send(errorEnvelope('UNAUTHORIZED', 'Invalid token'))
    }
  }
}
