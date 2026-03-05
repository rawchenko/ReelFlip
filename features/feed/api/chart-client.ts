import { Platform } from 'react-native'
import {
  ChartBatchHistoryResponse,
  ChartHistoryQuality,
  ChartHistoryResponse,
  ChartInterval,
  ChartStreamEvent,
} from '@/features/feed/chart/types'

interface ChartErrorEnvelope {
  error?: {
    code?: string
    message?: string
  }
}

interface FetchChartHistoryOptions {
  interval?: ChartInterval
  limit?: number
  signal?: AbortSignal
}

interface FetchChartBatchHistoryOptions {
  interval?: ChartInterval
  limit?: number
  signal?: AbortSignal
}

interface CreateChartStreamOptions {
  pairs: string[]
  interval?: ChartInterval
  onEvent: (event: ChartStreamEvent) => void
  onError?: (error: Error) => void
  onOpen?: () => void
  onClose?: () => void
}

export interface ChartStreamConnection {
  close: () => void
  transport: 'ws' | 'sse'
}

const DEFAULT_ANDROID_API_URL = 'http://10.0.2.2:3001'
const DEFAULT_IOS_API_URL = 'http://127.0.0.1:3001'

function logChartClientDiagnostic(event: string, details?: Record<string, unknown>): void {
  if (!__DEV__) {
    return
  }

  if (details) {
    console.log(`[chart-client] ${event}`, details)
    return
  }

  console.log(`[chart-client] ${event}`)
}

function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL
  if (configured && configured.length > 0) {
    return configured
  }

  return Platform.OS === 'android' ? DEFAULT_ANDROID_API_URL : DEFAULT_IOS_API_URL
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

export async function fetchChartHistory(
  pairAddress: string,
  options: FetchChartHistoryOptions = {},
): Promise<ChartHistoryResponse> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const searchParams = new URLSearchParams()
  searchParams.set('interval', options.interval ?? '1m')
  searchParams.set('limit', String(options.limit ?? 120))

  const response = await fetch(`${baseUrl}/v1/chart/${encodeURIComponent(pairAddress)}?${searchParams.toString()}`, {
    method: 'GET',
    signal: options.signal,
    headers: {
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Chart history request failed with status ${response.status}`))
  }

  const payload = (await response.json()) as Partial<ChartHistoryResponse>
  if (!Array.isArray(payload.points)) {
    throw new Error('Chart history response is missing points array')
  }

  return {
    pairAddress: typeof payload.pairAddress === 'string' ? payload.pairAddress : pairAddress,
    interval: normalizeInterval(payload.interval),
    generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date(0).toISOString(),
    source: typeof payload.source === 'string' ? payload.source : 'runtime_aggregator',
    delayed: Boolean(payload.delayed),
    ...(isHistoryQuality(payload.historyQuality) ? { historyQuality: payload.historyQuality } : {}),
    points: sanitizePoints(payload.points),
  }
}

export async function fetchChartBatchHistory(
  pairAddresses: string[],
  options: FetchChartBatchHistoryOptions = {},
): Promise<ChartBatchHistoryResponse> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const pairs = Array.from(new Set(pairAddresses.map((pair) => pair.trim()).filter((pair) => pair.length > 0)))
  if (pairs.length === 0) {
    return {
      interval: options.interval ?? '1m',
      generatedAt: new Date().toISOString(),
      results: [],
    }
  }

  const response = await fetch(`${baseUrl}/v1/chart/batch`, {
    method: 'POST',
    signal: options.signal,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      pairs,
      interval: options.interval ?? '1m',
      limit: options.limit ?? 360,
    }),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Chart batch request failed with status ${response.status}`))
  }

  const payload = (await response.json()) as Partial<ChartBatchHistoryResponse> & { results?: unknown }
  const rawResults = Array.isArray(payload.results) ? payload.results : []

  return {
    interval: normalizeInterval(payload.interval),
    generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date(0).toISOString(),
    results: rawResults
      .map((result) => normalizeBatchHistoryPairResult(result))
      .filter((result): result is ChartBatchHistoryResponse['results'][number] => result !== null),
  }
}

export function createChartStream(options: CreateChartStreamOptions): ChartStreamConnection {
  return createChartStreamSse(options)
}

export function createChartStreamWs(options: CreateChartStreamOptions): ChartStreamConnection {
  const interval = options.interval ?? '1m'
  const pairs = Array.from(new Set(options.pairs.map((pair) => pair.trim()).filter((pair) => pair.length > 0)))

  if (pairs.length === 0) {
    throw new Error('createChartStreamWs requires at least one pair address')
  }

  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const wsUrl = toWebSocketUrl(`${baseUrl}/v1/chart/ws`)
  let closed = false
  let socket: WebSocket | null = null

  const close = () => {
    if (closed) {
      return
    }
    closed = true

    try {
      socket?.close()
    } catch {
      // Ignore close errors during shutdown.
    }
  }

  try {
    socket = new WebSocket(wsUrl)
  } catch (error) {
    queueMicrotask(() => {
      if (closed) {
        return
      }
      options.onError?.(error instanceof Error ? error : new Error(String(error)))
      options.onClose?.()
    })

    return { close, transport: 'ws' }
  }

  socket.onopen = () => {
    if (closed || !socket) {
      return
    }

    logChartClientDiagnostic('ws_stream_connected', {
      pairs,
      interval,
    })
    options.onOpen?.()

    try {
      socket.send(
        JSON.stringify({
          op: 'subscribe',
          pairs,
          interval,
        }),
      )
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)))
      close()
    }
  }

  socket.onmessage = (message) => {
    if (closed) {
      return
    }

    const normalized = normalizeWsStreamMessage(message.data)
    if (normalized) {
      options.onEvent(normalized)
    }
  }

  socket.onerror = () => {
    if (closed) {
      return
    }

    logChartClientDiagnostic('ws_stream_error', {
      pairs,
      interval,
    })
    options.onError?.(new Error('WebSocket chart stream error'))
  }

  socket.onclose = () => {
    if (closed) {
      return
    }

    options.onClose?.()
  }

  return { close, transport: 'ws' }
}

export function createChartStreamSse(options: CreateChartStreamOptions): ChartStreamConnection {
  const controller = new AbortController()
  const interval = options.interval ?? '1m'
  const pairs = Array.from(new Set(options.pairs.map((pair) => pair.trim()).filter((pair) => pair.length > 0)))

  if (pairs.length === 0) {
    throw new Error('createChartStream requires at least one pair address')
  }

  let closed = false
  const close = () => {
    if (closed) {
      return
    }
    closed = true
    controller.abort()
  }

  void runFetchSse({ ...options, pairs, interval, signal: controller.signal })
    .catch((error) => {
      if (closed) {
        return
      }
      options.onError?.(error instanceof Error ? error : new Error(String(error)))
    })
    .finally(() => {
      if (!closed) {
        options.onClose?.()
      }
    })

  return { close, transport: 'sse' }
}

async function runFetchSse(
  options: CreateChartStreamOptions & { interval: ChartInterval; pairs: string[]; signal: AbortSignal },
): Promise<void> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const searchParams = new URLSearchParams()
  searchParams.set('pairs', options.pairs.join(','))
  searchParams.set('interval', options.interval)

  const response = await fetch(`${baseUrl}/v1/chart/stream?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      accept: 'text/event-stream',
      'cache-control': 'no-cache',
    },
    signal: options.signal,
  })

  if (!response.ok) {
    logChartClientDiagnostic('stream_http_error', {
      pairs: options.pairs,
      interval: options.interval,
      status: response.status,
    })
    throw new Error(await readErrorMessage(response, `Chart stream request failed with status ${response.status}`))
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    logChartClientDiagnostic('stream_body_unavailable', {
      pairs: options.pairs,
      interval: options.interval,
    })
    throw new Error('Streaming response body is not available in this runtime')
  }

  logChartClientDiagnostic('sse_stream_connected', {
    pairs: options.pairs,
    interval: options.interval,
  })
  options.onOpen?.()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEventName: string | null = null
  let dataLines: string[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    let lineBreakIndex = buffer.indexOf('\n')

    while (lineBreakIndex >= 0) {
      let line = buffer.slice(0, lineBreakIndex)
      buffer = buffer.slice(lineBreakIndex + 1)

      if (line.endsWith('\r')) {
        line = line.slice(0, -1)
      }

      if (line.length === 0) {
        emitBufferedEvent(currentEventName, dataLines, options.onEvent)
        currentEventName = null
        dataLines = []
      } else if (line.startsWith(':')) {
        // SSE comment/heartbeat line
      } else if (line.startsWith('event:')) {
        currentEventName = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }

      lineBreakIndex = buffer.indexOf('\n')
    }
  }

  if (dataLines.length > 0) {
    emitBufferedEvent(currentEventName, dataLines, options.onEvent)
  }
}

function emitBufferedEvent(
  eventName: string | null,
  dataLines: string[],
  onEvent: (event: ChartStreamEvent) => void,
): void {
  if (dataLines.length === 0) {
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(dataLines.join('\n'))
  } catch {
    return
  }

  const normalized = normalizeStreamEvent(parsed, eventName)
  if (normalized) {
    onEvent(normalized)
  }
}

function normalizeWsStreamMessage(input: unknown): ChartStreamEvent | null {
  if (typeof input !== 'string') {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch {
    return null
  }

  return normalizeStreamEvent(parsed, null)
}

function normalizeStreamEvent(input: unknown, eventName: string | null): ChartStreamEvent | null {
  if (!isRecord(input)) {
    return null
  }

  const type = typeof input.type === 'string' ? input.type : eventName
  if (type === 'heartbeat') {
    return {
      type: 'heartbeat',
      serverTime: typeof input.serverTime === 'string' ? input.serverTime : new Date().toISOString(),
    }
  }

  if (type === 'status') {
    const status = input.status
    if (
      typeof input.pairAddress !== 'string' ||
      (status !== 'live' && status !== 'delayed' && status !== 'reconnecting' && status !== 'fallback_polling')
    ) {
      return null
    }

    return {
      type: 'status',
      pairAddress: input.pairAddress,
      status,
      ...(typeof input.reason === 'string' ? { reason: input.reason } : {}),
      serverTime: typeof input.serverTime === 'string' ? input.serverTime : new Date().toISOString(),
    }
  }

  if (type === 'snapshot') {
    if (typeof input.pairAddress !== 'string' || !Array.isArray(input.points)) {
      return null
    }

    return {
      type: 'snapshot',
      pairAddress: input.pairAddress,
      interval: normalizeInterval(input.interval),
      delayed: Boolean(input.delayed),
      points: sanitizePoints(input.points),
      serverTime: typeof input.serverTime === 'string' ? input.serverTime : new Date().toISOString(),
    }
  }

  if (type === 'point_update') {
    if (typeof input.pairAddress !== 'string' || !isRecord(input.point)) {
      return null
    }

    const point = sanitizePoint(input.point)
    if (!point) {
      return null
    }

    return {
      type: 'point_update',
      pairAddress: input.pairAddress,
      interval: normalizeInterval(input.interval),
      delayed: Boolean(input.delayed),
      point,
      isNewPoint: Boolean(input.isNewPoint),
      serverTime: typeof input.serverTime === 'string' ? input.serverTime : new Date().toISOString(),
    }
  }

  return null
}

function sanitizePoints(points: unknown[]): ChartHistoryResponse['points'] {
  const normalized: ChartHistoryResponse['points'] = []
  for (const point of points) {
    const parsed = sanitizePoint(point)
    if (parsed) {
      normalized.push(parsed)
    }
  }
  return normalized
}

function normalizeBatchHistoryPairResult(input: unknown): ChartBatchHistoryResponse['results'][number] | null {
  if (!isRecord(input) || typeof input.pairAddress !== 'string' || !Array.isArray(input.points)) {
    return null
  }

  if (
    input.status !== 'live' &&
    input.status !== 'delayed' &&
    input.status !== 'reconnecting' &&
    input.status !== 'fallback_polling'
  ) {
    return null
  }

  const historyQuality = isHistoryQuality(input.historyQuality) ? input.historyQuality : 'unavailable'

  return {
    pairAddress: input.pairAddress,
    delayed: Boolean(input.delayed),
    status: input.status,
    source: typeof input.source === 'string' ? input.source : 'runtime_aggregator',
    historyQuality,
    points: sanitizePoints(input.points),
  }
}

function sanitizePoint(input: unknown): ChartHistoryResponse['points'][number] | null {
  if (!isRecord(input)) {
    return null
  }

  const time = readFiniteNumber(input.time)
  const value = readFiniteNumber(input.value)

  if (time === null || value === null || time <= 0 || value <= 0) {
    return null
  }

  return {
    time,
    value,
  }
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ChartErrorEnvelope
    if (payload.error?.message) {
      return payload.error.message
    }
  } catch {
    // Ignore non-JSON error bodies.
  }

  return fallback
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}

function isHistoryQuality(value: unknown): value is ChartHistoryQuality {
  return value === 'real_backfill' || value === 'runtime_only' || value === 'partial' || value === 'unavailable'
}

function normalizeInterval(value: unknown): ChartInterval {
  return value === '1s' ? '1s' : '1m'
}

function toWebSocketUrl(url: string): string {
  if (url.startsWith('https://')) {
    return `wss://${url.slice('https://'.length)}`
  }

  if (url.startsWith('http://')) {
    return `ws://${url.slice('http://'.length)}`
  }

  return url
}
