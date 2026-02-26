import { Platform } from 'react-native'
import { ChartHistoryResponse, ChartStreamEvent } from '@/features/feed/chart/types'

interface ChartErrorEnvelope {
  error?: {
    code?: string
    message?: string
  }
}

interface FetchChartHistoryOptions {
  interval?: '1m'
  limit?: number
  signal?: AbortSignal
}

interface CreateChartStreamOptions {
  pairs: string[]
  interval?: '1m'
  onEvent: (event: ChartStreamEvent) => void
  onError?: (error: Error) => void
  onOpen?: () => void
  onClose?: () => void
}

export interface ChartStreamConnection {
  close: () => void
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
  if (!Array.isArray(payload.candles)) {
    throw new Error('Chart history response is missing candles array')
  }

  return {
    pairAddress: typeof payload.pairAddress === 'string' ? payload.pairAddress : pairAddress,
    interval: payload.interval === '1m' ? '1m' : '1m',
    generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date(0).toISOString(),
    source: 'dexscreener',
    delayed: Boolean(payload.delayed),
    candles: sanitizeCandles(payload.candles),
  }
}

export function createChartStream(options: CreateChartStreamOptions): ChartStreamConnection {
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

  return { close }
}

async function runFetchSse(
  options: CreateChartStreamOptions & { interval: '1m'; pairs: string[]; signal: AbortSignal },
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

  logChartClientDiagnostic('stream_connected', {
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
      (status !== 'live' && status !== 'delayed' && status !== 'reconnecting')
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
    if (typeof input.pairAddress !== 'string' || !Array.isArray(input.candles)) {
      return null
    }

    return {
      type: 'snapshot',
      pairAddress: input.pairAddress,
      interval: '1m',
      delayed: Boolean(input.delayed),
      candles: sanitizeCandles(input.candles),
      serverTime: typeof input.serverTime === 'string' ? input.serverTime : new Date().toISOString(),
    }
  }

  if (type === 'candle_update') {
    if (typeof input.pairAddress !== 'string' || !isRecord(input.candle)) {
      return null
    }

    const candle = sanitizeCandle(input.candle)
    if (!candle) {
      return null
    }

    return {
      type: 'candle_update',
      pairAddress: input.pairAddress,
      interval: '1m',
      delayed: Boolean(input.delayed),
      candle,
      isNewCandle: Boolean(input.isNewCandle),
      serverTime: typeof input.serverTime === 'string' ? input.serverTime : new Date().toISOString(),
    }
  }

  return null
}

function sanitizeCandles(candles: unknown[]): ChartHistoryResponse['candles'] {
  const normalized: ChartHistoryResponse['candles'] = []
  for (const candle of candles) {
    const parsed = sanitizeCandle(candle)
    if (parsed) {
      normalized.push(parsed)
    }
  }
  return normalized
}

function sanitizeCandle(input: unknown): ChartHistoryResponse['candles'][number] | null {
  if (!isRecord(input)) {
    return null
  }

  const time = readFiniteNumber(input.time)
  const open = readFiniteNumber(input.open)
  const high = readFiniteNumber(input.high)
  const low = readFiniteNumber(input.low)
  const close = readFiniteNumber(input.close)

  if (
    time === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    time <= 0 ||
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0
  ) {
    return null
  }

  return {
    time,
    open,
    high,
    low,
    close,
    ...(readFiniteNumber(input.volume) !== null ? { volume: readFiniteNumber(input.volume)! } : {}),
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
