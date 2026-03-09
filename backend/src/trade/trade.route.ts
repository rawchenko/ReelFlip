import { FastifyInstance } from 'fastify'
import { errorEnvelope } from '../lib/error-envelope.js'
import { BuildTradeRequest, QuoteRequest, SubmitTradeRequest, TradeStatusResponse } from './trade.types.js'
import {
  QuoteService,
  TradeBuildService,
  TradeServiceError,
  TradeStatusService,
  TradeSubmitService,
} from './trade.jupiter.js'

interface TradeRouteDependencies {
  quoteService: QuoteService
  rateLimitTradesPerMinute: number
  tradeBuildService: TradeBuildService
  tradeStatusService: TradeStatusService
  tradeSubmitService: TradeSubmitService
  authPreHandler?: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
}

interface TradeStatusParams {
  tradeId: string
}

export async function registerTradeRoutes(app: FastifyInstance, dependencies: TradeRouteDependencies): Promise<void> {
  const preHandler = dependencies.authPreHandler ? [dependencies.authPreHandler] : undefined

  app.post<{ Body: Partial<QuoteRequest> }>(
    '/v1/quotes',
    {
      config: {
        rateLimit: {
          max: dependencies.rateLimitTradesPerMinute,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body ?? {}
        return await dependencies.quoteService.createQuote({
          payAssetSymbol: parsePayAssetSymbol(body.payAssetSymbol),
          side: parseTradeSide(body.side),
          slippageBps: parseInteger(body.slippageBps, 'slippageBps'),
          tokenMint: parseRequiredString(body.tokenMint, 'tokenMint'),
          uiAmount: parseRequiredString(body.uiAmount, 'uiAmount'),
          wallet: parseRequiredString(body.wallet, 'wallet'),
        })
      } catch (error) {
        return handleTradeRouteError(request.log, reply, error)
      }
    },
  )

  app.post<{ Body: Partial<BuildTradeRequest> }>(
    '/v1/trades/build',
    {
      ...(preHandler ? { preHandler } : {}),
      config: {
        rateLimit: {
          max: dependencies.rateLimitTradesPerMinute,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body ?? {}
        return await dependencies.tradeBuildService.buildTrade({
          quoteId: parseRequiredString(body.quoteId, 'quoteId'),
          wallet: parseRequiredString(body.wallet, 'wallet'),
        })
      } catch (error) {
        return handleTradeRouteError(request.log, reply, error)
      }
    },
  )

  app.post<{ Body: Partial<SubmitTradeRequest> }>(
    '/v1/trades/submit',
    {
      ...(preHandler ? { preHandler } : {}),
      config: {
        rateLimit: {
          max: dependencies.rateLimitTradesPerMinute,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body ?? {}
        return await dependencies.tradeSubmitService.submitTrade({
          idempotencyKey: parseRequiredString(body.idempotencyKey, 'idempotencyKey'),
          signedTxBase64: parseRequiredString(body.signedTxBase64, 'signedTxBase64'),
          tradeIntentId: parseRequiredString(body.tradeIntentId, 'tradeIntentId'),
        })
      } catch (error) {
        return handleTradeRouteError(request.log, reply, error)
      }
    },
  )

  app.get<{ Params: TradeStatusParams }>(
    '/v1/trades/:tradeId/status',
    async (request, reply) => {
      try {
        return (await dependencies.tradeStatusService.getTradeStatus(parseRequiredString(request.params.tradeId, 'tradeId'))) satisfies TradeStatusResponse
      } catch (error) {
        return handleTradeRouteError(request.log, reply, error)
      }
    },
  )
}

function parseRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TradeServiceError('BAD_REQUEST', 400, `${label} is required`)
  }
  return value.trim()
}

function parsePayAssetSymbol(value: unknown): QuoteRequest['payAssetSymbol'] {
  if (value === 'SOL' || value === 'USDC' || value === 'SKR') {
    return value
  }
  throw new TradeServiceError('BAD_REQUEST', 400, 'payAssetSymbol must be one of SOL, USDC, SKR')
}

function parseTradeSide(value: unknown): QuoteRequest['side'] {
  if (value === 'buy' || value === 'sell') {
    return value
  }
  throw new TradeServiceError('BAD_REQUEST', 400, 'side must be buy or sell')
}

function parseInteger(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10)
  }
  throw new TradeServiceError('BAD_REQUEST', 400, `${label} must be an integer`)
}

function handleTradeRouteError(
  log: { error: (obj: unknown, msg?: string) => void },
  reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } },
  error: unknown,
) {
  if (error instanceof TradeServiceError) {
    return reply.code(error.statusCode).send(errorEnvelope(error.code, error.message))
  }

  log.error(error, 'Unexpected trade route error')
  return reply.code(500).send(errorEnvelope('INTERNAL', 'Unexpected trade server error'))
}
