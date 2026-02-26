import { FastifyInstance } from 'fastify'
import { ChartRegistry } from './chart.registry.js'
import { ChartHistoryResponse, ChartStreamEvent } from './chart.types.js'
import { errorEnvelope } from '../lib/error-envelope.js'

interface ChartRouteDependencies {
  chartRegistry: ChartRegistry
}

interface ChartHistoryParams {
  pairAddress: string
}

interface ChartHistoryQuery {
  interval?: string
  limit?: string | number
}

interface ChartStreamQuery {
  pairs?: string
  interval?: string
}

const SUPPORTED_INTERVAL = '1m'
const MAX_HISTORY_LIMIT = 240
const HEARTBEAT_MS = 15_000

export async function registerChartRoutes(app: FastifyInstance, dependencies: ChartRouteDependencies): Promise<void> {
  app.get<{ Params: ChartHistoryParams; Querystring: ChartHistoryQuery }>('/v1/chart/:pairAddress', async (request, reply) => {
    if (!dependencies.chartRegistry.isEnabled()) {
      return reply.code(503).send(errorEnvelope('UNAVAILABLE', 'Chart service is disabled'))
    }

    try {
      const pairAddress = parsePairAddress(request.params.pairAddress)
      const interval = parseInterval(request.query.interval)
      const limit = parseLimit(request.query.limit)
      await dependencies.chartRegistry.ensurePairSeeded(pairAddress)
      const snapshot = dependencies.chartRegistry.getPairSnapshot(pairAddress, limit)

      const response: ChartHistoryResponse = {
        pairAddress,
        interval,
        generatedAt: new Date().toISOString(),
        source: 'dexscreener',
        delayed: snapshot.delayed,
        candles: snapshot.candles,
      }

      return response
    } catch (error) {
      if (error instanceof ChartRouteError) {
        return reply.code(400).send(errorEnvelope('BAD_REQUEST', error.message))
      }

      request.log.warn({ error, pairAddress: request.params.pairAddress }, 'Chart history request failed')
      return reply.code(502).send(errorEnvelope('UPSTREAM_ERROR', 'Unable to fetch chart history'))
    }
  })

  app.get<{ Querystring: ChartStreamQuery }>('/v1/chart/stream', async (request, reply) => {
    if (!dependencies.chartRegistry.isEnabled()) {
      return reply.code(503).send(errorEnvelope('UNAVAILABLE', 'Chart service is disabled'))
    }

    try {
      parseInterval(request.query.interval)
      const pairs = parsePairs(request.query.pairs, dependencies.chartRegistry.getOptions().maxPairsPerStream)

      reply.hijack()
      const response = reply.raw

      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      const writeEvent = (eventName: string, event: ChartStreamEvent) => {
        response.write(formatSseEvent(eventName, event))
      }

      response.write(': connected\n\n')

      for (const pairAddress of pairs) {
        try {
          await dependencies.chartRegistry.ensurePairSeeded(pairAddress)
        } catch (error) {
          request.log.warn({ error, pairAddress }, 'Failed to seed pair for SSE bootstrap')
        }

        const snapshotEvent = dependencies.chartRegistry.buildSnapshotEvent(pairAddress, 120)
        if (snapshotEvent) {
          writeEvent('snapshot', snapshotEvent)
        }

        writeEvent('status', dependencies.chartRegistry.buildStatusEvent(pairAddress))
      }

      const unsubscribe = dependencies.chartRegistry.subscribe(pairs, (event) => {
        writeEvent(mapEventTypeToSseName(event.type), event)
      })

      const heartbeatTimer = setInterval(() => {
        writeEvent('heartbeat', {
          type: 'heartbeat',
          serverTime: new Date().toISOString(),
        })
      }, HEARTBEAT_MS)
      heartbeatTimer.unref?.()

      const cleanup = () => {
        clearInterval(heartbeatTimer)
        unsubscribe()
        request.raw.removeListener('close', cleanup)
        request.raw.removeListener('end', cleanup)
      }

      request.raw.once('close', cleanup)
      request.raw.once('end', cleanup)
      return
    } catch (error) {
      const message = error instanceof ChartRouteError ? error.message : 'Invalid chart stream request'
      return reply.code(400).send(errorEnvelope('BAD_REQUEST', message))
    }
  })
}

class ChartRouteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChartRouteError'
  }
}

function parsePairAddress(pairAddress: string | undefined): string {
  const value = pairAddress?.trim()
  if (!value) {
    throw new ChartRouteError('pairAddress is required')
  }

  return value
}

function parsePairs(raw: string | undefined, maxPairsPerStream: number): string[] {
  if (!raw || raw.trim().length === 0) {
    throw new ChartRouteError('pairs query param is required')
  }

  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  const deduped = Array.from(new Set(values))

  if (deduped.length === 0) {
    throw new ChartRouteError('pairs query param is required')
  }

  if (deduped.length > maxPairsPerStream) {
    throw new ChartRouteError(`pairs supports up to ${maxPairsPerStream} addresses per stream`)
  }

  return deduped
}

function parseInterval(raw: string | undefined): '1m' {
  if (raw === undefined || raw === SUPPORTED_INTERVAL) {
    return SUPPORTED_INTERVAL
  }

  throw new ChartRouteError(`interval must be ${SUPPORTED_INTERVAL}`)
}

function parseLimit(raw: string | number | undefined): number {
  if (raw === undefined) {
    return 120
  }

  const value = typeof raw === 'number' ? raw : Number.parseInt(raw, 10)
  if (!Number.isInteger(value)) {
    throw new ChartRouteError('limit must be an integer')
  }

  if (value < 1 || value > MAX_HISTORY_LIMIT) {
    throw new ChartRouteError(`limit must be between 1 and ${MAX_HISTORY_LIMIT}`)
  }

  return value
}

function mapEventTypeToSseName(type: ChartStreamEvent['type']): string {
  switch (type) {
    case 'candle_update':
      return 'candle_update'
    case 'status':
      return 'status'
    case 'snapshot':
      return 'snapshot'
    case 'heartbeat':
      return 'heartbeat'
    default:
      return 'message'
  }
}

function formatSseEvent(eventName: string, payload: ChartStreamEvent): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
}
