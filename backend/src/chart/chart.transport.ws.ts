import type { FastifyInstance } from 'fastify'
import WebSocket from 'ws'
import { ChartHistoryService } from './chart.history-service.js'
import { ChartRegistry } from './chart.registry.js'
import { ChartStreamService } from './chart.stream.service.js'
import { ChartInterval, ChartStreamEvent } from './chart.types.js'

interface ChartWsTransportDependencies {
  chartRegistry: ChartRegistry
  chartHistoryService: ChartHistoryService
  chartStreamService: ChartStreamService
  onStreamEventConsumed?: (event: ChartStreamEvent) => void
  onStreamQueueSample?: (pairAddress: string, interval: ChartInterval, queueSize: number) => void
}

const SUPPORTED_INTERVALS: ChartInterval[] = ['1s', '1m']
const SNAPSHOT_LIMIT = 360
const HEARTBEAT_MS = 15_000

export function registerChartWebSocketTransport(
  app: FastifyInstance,
  dependencies: ChartWsTransportDependencies,
): void {
  app.get('/v1/chart/ws', { websocket: true } as any, (connection: unknown, request) => {
    if (!dependencies.chartRegistry.isEnabled()) {
      closeWithError(connection, 1013, 'Chart service is disabled')
      return
    }

    if (!dependencies.chartStreamService.isAvailable()) {
      closeWithError(connection, 1013, 'Chart stream backend is unavailable')
      return
    }

    const socket = resolveSocket(connection)
    if (!socket) {
      request.log.warn('Chart WS connection missing socket handle')
      return
    }

    let closed = false
    let subscribedPairs: string[] = []
    let interval: ChartInterval = '1m'
    let subscriptionVersion = 0
    const lastIds = new Map<string, string>()
    let applyQueue = Promise.resolve()

    const sendEvent = (event: ChartStreamEvent) => {
      if (closed || socket.readyState !== 1) {
        return
      }

      try {
        socket.send(JSON.stringify(event))
      } catch (error) {
        request.log.warn({ error, eventType: event.type }, 'Chart WS send failed')
      }
    }

    const heartbeatTimer = setInterval(() => {
      sendEvent({
        type: 'heartbeat',
        serverTime: new Date().toISOString(),
      })
    }, HEARTBEAT_MS)
    heartbeatTimer.unref?.()

    const cleanup = () => {
      if (closed) {
        return
      }
      closed = true
      clearInterval(heartbeatTimer)
    }

    const runStreamLoop = (version: number) =>
      (async () => {
        while (!closed && version === subscriptionVersion && subscribedPairs.length > 0) {
          const subscriptions = subscribedPairs.map((pairAddress) => ({
            pairAddress,
            interval,
            lastId: lastIds.get(pairAddress) ?? '$',
          }))

          const events = await dependencies.chartStreamService.read(subscriptions, true)
          if (closed || version !== subscriptionVersion || events.length === 0) {
            continue
          }

          for (const event of events) {
            if (!('pairAddress' in event)) {
              continue
            }
            sendEvent(event)
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
      })().catch((error) => {
        request.log.warn({ error }, 'Chart WS stream read loop failed')
        cleanup()
        safeClose(socket, 1011, 'stream_failure')
      })

    socket.on('close', cleanup)
    socket.on('error', (error: unknown) => {
      request.log.warn({ error }, 'Chart WS socket error')
      cleanup()
    })

    socket.on('message', (payload: unknown) => {
      applyQueue = applyQueue
        .then(async () => {
          const message = parseClientMessage(
            payload,
            dependencies.chartRegistry.getOptions().maxPairsPerStream,
            subscribedPairs,
          )

          if (!message) {
            return
          }

          const version = ++subscriptionVersion
          interval = message.interval
          subscribedPairs = message.nextPairs

          for (const pairAddress of subscribedPairs) {
            if (!lastIds.has(pairAddress)) {
              lastIds.set(pairAddress, '$')
            }
          }
          for (const known of Array.from(lastIds.keys())) {
            if (!subscribedPairs.includes(known)) {
              lastIds.delete(known)
            }
          }

          if (subscribedPairs.length === 0) {
            return
          }

          for (const pairAddress of subscribedPairs) {
            const history = await dependencies.chartHistoryService.getPairHistory(pairAddress, SNAPSHOT_LIMIT, interval)
            sendEvent({
              type: 'snapshot',
              pairAddress,
              interval,
              delayed: history.delayed,
              points: history.points,
              serverTime: new Date().toISOString(),
            })
            sendEvent({
              type: 'status',
              pairAddress,
              interval,
              status: history.delayed ? 'delayed' : history.points.length > 0 ? 'live' : 'reconnecting',
              serverTime: new Date().toISOString(),
            })
          }

          void runStreamLoop(version)

          request.log.debug?.(
            {
              pairCount: subscribedPairs.length,
              pairs: subscribedPairs,
              interval,
            },
            'Chart WS subscription updated',
          )
        })
        .catch((error) => {
          request.log.warn({ error }, 'Chart WS message handling failed')
          cleanup()
          safeClose(socket, 1008, 'invalid_message')
        })
    })
  })
}

function parseClientMessage(
  payload: unknown,
  maxPairsPerStream: number,
  existingPairs: string[],
): { nextPairs: string[]; interval: ChartInterval } | null {
  const raw = rawDataToString(payload)?.trim()
  if (!raw) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('message must be valid JSON')
  }

  if (!isRecord(parsed)) {
    throw new Error('message must be an object')
  }

  const op = parsed.op
  if (op !== 'subscribe' && op !== 'unsubscribe') {
    throw new Error('op must be subscribe or unsubscribe')
  }

  const interval = parseInterval(parsed.interval)
  const pairs = parsePairs(parsed.pairs, maxPairsPerStream)
  const existingSet = new Set(existingPairs)

  if (op === 'subscribe') {
    return { nextPairs: pairs, interval }
  }

  for (const pair of pairs) {
    existingSet.delete(pair)
  }

  return { nextPairs: Array.from(existingSet), interval }
}

function parsePairs(raw: unknown, maxPairsPerStream: number): string[] {
  if (!Array.isArray(raw)) {
    throw new Error('pairs must be an array')
  }

  const values = raw
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0)
  const deduped = Array.from(new Set(values))

  if (deduped.length === 0) {
    throw new Error('pairs must include at least one pair address')
  }

  if (deduped.length > maxPairsPerStream) {
    throw new Error(`pairs supports up to ${maxPairsPerStream} addresses per stream`)
  }

  return deduped
}

function parseInterval(raw: unknown): ChartInterval {
  if (raw === undefined) {
    return '1m'
  }

  if (raw === '1s' || raw === '1m') {
    return raw
  }

  throw new Error(`interval must be one of: ${SUPPORTED_INTERVALS.join(', ')}`)
}

function rawDataToString(payload: unknown): string | null {
  if (typeof payload === 'string') {
    return payload
  }

  if (payload instanceof Buffer) {
    return payload.toString('utf8')
  }

  if (Array.isArray(payload)) {
    const chunks = payload
      .map((chunk) => {
        if (typeof chunk === 'string') {
          return Buffer.from(chunk)
        }

        if (chunk instanceof Buffer) {
          return chunk
        }

        if (chunk instanceof ArrayBuffer) {
          return Buffer.from(chunk)
        }

        if (ArrayBuffer.isView(chunk)) {
          return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
        }

        return null
      })
      .filter((chunk): chunk is Buffer => chunk !== null)

    return chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : null
  }

  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString('utf8')
  }

  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).toString('utf8')
  }

  return null
}

function resolveSocket(connection: unknown): WebSocket | null {
  if (isRecord(connection) && 'socket' in connection && isWebSocketLike(connection.socket)) {
    return connection.socket
  }

  if (isWebSocketLike(connection)) {
    return connection
  }

  return null
}

function closeWithError(connection: unknown, code: number, message: string): void {
  const socket = resolveSocket(connection)
  if (!socket) {
    return
  }

  safeClose(socket, code, message)
}

function safeClose(socket: WebSocket, code: number, reason: string): void {
  try {
    socket.close(code, reason)
  } catch {
    // no-op
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isWebSocketLike(value: unknown): value is WebSocket {
  return isRecord(value) && typeof value.send === 'function' && typeof value.close === 'function'
}
