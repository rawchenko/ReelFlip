import { CircuitBreaker } from '../lib/circuit-breaker.js'
import { ResilientHttpClient, UpstreamRequestEvent } from '../lib/http-client.js'
import { HistoricalCandleProvider, HistoricalCandleProviderFetchParams, normalizeHistoricalCandles } from './chart.history-provider.js'
import { OhlcCandle } from './chart.types.js'

interface Logger {
  warn: (obj: unknown, msg?: string) => void
  debug?: (obj: unknown, msg?: string) => void
}

interface BirdeyeHistoricalProviderOptions {
  apiKey?: string
  timeoutMs: number
  onRequestComplete?: (event: UpstreamRequestEvent) => void
}

export class BirdeyeHistoricalCandleProvider implements HistoricalCandleProvider {
  readonly name = 'birdeye_ohlcv_pair'

  private readonly enabled: boolean
  private readonly httpClient: ResilientHttpClient

  constructor(
    private readonly options: BirdeyeHistoricalProviderOptions,
    private readonly logger: Logger,
  ) {
    this.enabled = typeof options.apiKey === 'string' && options.apiKey.trim().length > 0
    this.httpClient = new ResilientHttpClient({
      upstream: 'birdeye_history',
      timeoutMs: options.timeoutMs,
      maxRetries: 2,
      retryBaseDelayMs: 200,
      circuitBreaker: new CircuitBreaker({
        windowMs: 30_000,
        minSamples: 10,
        failureThreshold: 0.5,
        openDurationMs: 15_000,
        halfOpenProbeCount: 1,
      }),
      logger,
      onRequestComplete: options.onRequestComplete,
    })
  }

  async fetch1mCandles(params: HistoricalCandleProviderFetchParams): Promise<OhlcCandle[]> {
    if (!this.enabled) {
      return []
    }

    const url = buildOhlcvUrl(params)

    try {
      const response = await this.httpClient.request(url, {
        method: 'GET',
        signal: params.signal,
        headers: {
          accept: 'application/json',
          'x-api-key': this.options.apiKey ?? '',
          'x-chain': 'solana',
        },
      })

      if (!response.ok) {
        throw new Error(`Birdeye OHLCV request failed with status ${response.status}`)
      }

      const payload = (await response.json()) as unknown
      const candles = parseBirdeyeOhlcvPayload(payload)
      return normalizeHistoricalCandles(candles, Math.max(1, params.limit))
    } catch (error) {
      this.logger.warn({ error, pairAddress: params.pairAddress }, 'Birdeye historical candle fetch failed')
      return []
    }
  }
}

function buildOhlcvUrl(params: HistoricalCandleProviderFetchParams): URL {
  const endTimeSec =
    typeof params.endTimeSec === 'number' && Number.isFinite(params.endTimeSec) && params.endTimeSec > 0
      ? Math.floor(params.endTimeSec)
      : Math.floor(Date.now() / 1000)
  const boundedLimit = Math.max(1, Math.min(360, Math.floor(params.limit)))
  const startTimeSec = Math.max(1, endTimeSec - boundedLimit * 60)

  const url = new URL('https://public-api.birdeye.so/defi/ohlcv/pair')
  url.searchParams.set('address', params.pairAddress)
  url.searchParams.set('type', '1m')
  url.searchParams.set('time_from', String(startTimeSec))
  url.searchParams.set('time_to', String(endTimeSec))

  return url
}

function parseBirdeyeOhlcvPayload(payload: unknown): OhlcCandle[] {
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null
  const rawRows = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.list)
      ? data.list
      : Array.isArray(data?.ohlcv_list)
        ? data.ohlcv_list
        : []

  const output: OhlcCandle[] = []
  for (const row of rawRows) {
    const candle = parseRow(row)
    if (candle) {
      output.push(candle)
    }
  }

  return output
}

function parseRow(input: unknown): OhlcCandle | null {
  if (Array.isArray(input)) {
    if (input.length < 5) {
      return null
    }

    const timeSec = toFiniteNumber(input[0])
    const open = toFiniteNumber(input[1])
    const high = toFiniteNumber(input[2])
    const low = toFiniteNumber(input[3])
    const close = toFiniteNumber(input[4])
    const volume = input.length >= 6 ? toFiniteNumber(input[5]) : null
    return finalizeCandle(timeSec, open, high, low, close, volume)
  }

  if (!isRecord(input)) {
    return null
  }

  const timeSec = firstFiniteNumber(input.unixTime, input.time, input.timestamp, input.t)
  const open = firstFiniteNumber(input.open, input.o)
  const high = firstFiniteNumber(input.high, input.h)
  const low = firstFiniteNumber(input.low, input.l)
  const close = firstFiniteNumber(input.close, input.c)
  const volume = firstFiniteNumber(input.volume, input.v)

  return finalizeCandle(timeSec, open, high, low, close, volume)
}

function finalizeCandle(
  timeSec: number | null,
  open: number | null,
  high: number | null,
  low: number | null,
  close: number | null,
  volume: number | null,
): OhlcCandle | null {
  if (
    timeSec === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    timeSec <= 0 ||
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0
  ) {
    return null
  }

  return {
    timeSec: Math.floor(timeSec),
    open,
    high,
    low,
    close,
    ...(volume !== null && volume >= 0 ? { volume } : {}),
  }
}

function firstFiniteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = toFiniteNumber(value)
    if (parsed !== null) {
      return parsed
    }
  }
  return null
}

function toFiniteNumber(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input
  }

  if (typeof input === 'string') {
    const parsed = Number.parseFloat(input)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}
