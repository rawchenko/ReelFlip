import websocket from '@fastify/websocket'
import { FastifyInstance } from 'fastify'
import { ChartHistoryService } from './chart.history-service.js'
import { ChartRegistry } from './chart.registry.js'
import { ChartStreamService } from './chart.stream.service.js'
import { registerChartWebSocketTransport } from './chart.transport.ws.js'
import { ChartInterval, ChartStreamEvent } from './chart.types.js'
import { errorEnvelope } from '../lib/error-envelope.js'

interface ChartRouteDependencies {
  chartRegistry: ChartRegistry
  chartHistoryService: ChartHistoryService
  chartStreamService: ChartStreamService
  rateLimitChartHistoryPerMinute: number
  rateLimitChartStreamPerMinute: number
  onStreamEventConsumed?: (event: ChartStreamEvent) => void
  onStreamQueueSample?: (pairAddress: string, interval: ChartInterval, queueSize: number) => void
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

interface ChartBatchBody {
  pairs?: unknown
  interval?: unknown
  limit?: unknown
}

const SUPPORTED_INTERVALS: ChartInterval[] = ['1s', '1m']
const MAX_HISTORY_LIMIT = 360
const MAX_BATCH_LIMIT = 360
const HEARTBEAT_MS = 15_000

export async function registerChartRoutes(app: FastifyInstance, dependencies: ChartRouteDependencies): Promise<void> {
  await app.register(websocket)
  registerChartWebSocketTransport(app, dependencies)

  app.get<{ Params: ChartHistoryParams; Querystring: ChartHistoryQuery }>(
    '/v1/chart/:pairAddress',
    {
      config: {
        rateLimit: {
          max: dependencies.rateLimitChartHistoryPerMinute,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      if (!dependencies.chartRegistry.isEnabled()) {
        return reply.code(503).send(errorEnvelope('UNAVAILABLE', 'Chart service is disabled'))
      }

      try {
        const pairAddress = parsePairAddress(request.params.pairAddress)
        const interval = parseInterval(request.query.interval)
        const limit = parseLimit(request.query.limit)
        return await dependencies.chartHistoryService.getPairHistory(pairAddress, limit, interval)
      } catch (error) {
        if (error instanceof ChartRouteError) {
          return reply.code(400).send(errorEnvelope('BAD_REQUEST', error.message))
        }

        request.log.warn({ error, pairAddress: request.params.pairAddress }, 'Chart history request failed')
        return reply.code(502).send(errorEnvelope('UPSTREAM_ERROR', 'Unable to fetch chart history'))
      }
    },
  )

  app.post<{ Body: ChartBatchBody }>('/v1/chart/batch', async (request, reply) => {
    if (!dependencies.chartRegistry.isEnabled()) {
      return reply.code(503).send(errorEnvelope('UNAVAILABLE', 'Chart service is disabled'))
    }

    try {
      const interval = parseInterval(asOptionalString(request.body?.interval))
      const limit = parseBatchLimit(request.body?.limit, dependencies.chartHistoryService.getDefaultBootstrapLimit())
      const pairs = parsePairsArray(request.body?.pairs, dependencies.chartHistoryService.getBatchMaxPairs())
      return await dependencies.chartHistoryService.getBatchHistory(pairs, limit, interval)
    } catch (error) {
      const message = error instanceof ChartRouteError ? error.message : 'Invalid chart batch request'
      return reply.code(400).send(errorEnvelope('BAD_REQUEST', message))
    }
  })

  app.get<{ Querystring: ChartStreamQuery }>(
    '/v1/chart/stream',
    {
      config: {
        rateLimit: {
          max: dependencies.rateLimitChartStreamPerMinute,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      if (!dependencies.chartRegistry.isEnabled()) {
        return reply.code(503).send(errorEnvelope('UNAVAILABLE', 'Chart service is disabled'))
      }

      if (!dependencies.chartStreamService.isAvailable()) {
        return reply.code(503).send(errorEnvelope('UNAVAILABLE', 'Chart stream backend is unavailable'))
      }

      try {
        const interval = parseInterval(request.query.interval)
        const pairs = parsePairs(request.query.pairs, dependencies.chartRegistry.getOptions().maxPairsPerStream)
        const requestedLastId = parseLastEventId(request.headers['last-event-id'])

        reply.hijack()
        const response = reply.raw

        response.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        })

        response.write(': connected\n\n')

        for (const pairAddress of pairs) {
          const history = await dependencies.chartHistoryService.getPairHistory(pairAddress, 360, interval)
          const snapshotEvent: ChartStreamEvent = {
            type: 'snapshot',
            pairAddress,
            interval,
            delayed: history.delayed,
            points: history.points,
            serverTime: new Date().toISOString(),
          }
          response.write(formatSseEvent('snapshot', snapshotEvent))
          response.write(
            formatSseEvent('status', {
              type: 'status',
              pairAddress,
              interval,
              status: history.delayed ? 'delayed' : history.points.length > 0 ? 'live' : 'reconnecting',
              serverTime: new Date().toISOString(),
            }),
          )
        }

        const lastIds = new Map<string, string>()
        for (const pairAddress of pairs) {
          lastIds.set(pairAddress, requestedLastId ?? '$')
        }

        let closed = false
        const heartbeatTimer = setInterval(() => {
          if (closed) {
            return
          }
          response.write(
            formatSseEvent('heartbeat', {
              type: 'heartbeat',
              serverTime: new Date().toISOString(),
            }),
          )
        }, HEARTBEAT_MS)
        heartbeatTimer.unref?.()

        const cleanup = () => {
          closed = true
          clearInterval(heartbeatTimer)
          request.raw.removeListener('close', cleanup)
          request.raw.removeListener('end', cleanup)
        }

        request.raw.once('close', cleanup)
        request.raw.once('end', cleanup)

        while (!closed) {
          const subscriptions = pairs.map((pairAddress) => ({
            pairAddress,
            interval,
            lastId: lastIds.get(pairAddress) ?? '$',
          }))

          const events = await dependencies.chartStreamService.read(subscriptions, true)
          if (closed || events.length === 0) {
            continue
          }

          for (const event of events) {
            if (!('pairAddress' in event)) {
              continue
            }
            const sseName = mapEventTypeToSseName(event.type)
            response.write(formatSseEvent(sseName, event))
            dependencies.onStreamEventConsumed?.(event)
            if (event.streamId) {
              const queueSize = await dependencies.chartStreamService.getQueueLength(event.pairAddress, interval)
              dependencies.onStreamQueueSample?.(event.pairAddress, interval, queueSize)
            }
            if (event.streamId) {
              lastIds.set(event.pairAddress, event.streamId)
            }
          }
        }

        return
      } catch (error) {
        const message = error instanceof ChartRouteError ? error.message : 'Invalid chart stream request'
        return reply.code(400).send(errorEnvelope('BAD_REQUEST', message))
      }
    },
  )
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

function parsePairsArray(raw: unknown, maxPairs: number): string[] {
  if (!Array.isArray(raw)) {
    throw new ChartRouteError('pairs is required and must be an array')
  }

  const values = raw
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0)
  const deduped = Array.from(new Set(values))

  if (deduped.length === 0) {
    throw new ChartRouteError('pairs must include at least one pair address')
  }

  if (deduped.length > maxPairs) {
    throw new ChartRouteError(`pairs supports up to ${maxPairs} addresses`)
  }

  return deduped
}

function parseInterval(raw: string | undefined): ChartInterval {
  if (raw === undefined) {
    return '1m'
  }

  if (raw === '1s' || raw === '1m') {
    return raw
  }

  throw new ChartRouteError(`interval must be one of: ${SUPPORTED_INTERVALS.join(', ')}`)
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

function parseBatchLimit(raw: unknown, fallback: number): number {
  if (raw === undefined) {
    return Math.max(1, Math.min(fallback, MAX_BATCH_LIMIT))
  }

  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number.parseInt(raw, 10)
        : Number.NaN
  if (!Number.isInteger(value)) {
    throw new ChartRouteError('limit must be an integer')
  }

  if (value < 1 || value > MAX_BATCH_LIMIT) {
    throw new ChartRouteError(`limit must be between 1 and ${MAX_BATCH_LIMIT}`)
  }

  return value
}

function parseLastEventId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function mapEventTypeToSseName(type: ChartStreamEvent['type']): string {
  switch (type) {
    case 'point_update':
      return 'point_update'
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
  const lines: string[] = []
  if (payload.streamId) {
    lines.push(`id: ${payload.streamId}`)
  }
  lines.push(`event: ${eventName}`)
  lines.push(`data: ${JSON.stringify(payload)}`)
  return `${lines.join('\n')}\n\n`
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
