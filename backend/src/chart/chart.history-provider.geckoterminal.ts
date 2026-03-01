import { HistoricalCandleProvider, HistoricalCandleProviderFetchParams, normalizeHistoricalCandles } from './chart.history-provider.js'
import { OhlcCandle } from './chart.types.js'

interface Logger {
  warn: (obj: unknown, msg?: string) => void
  debug?: (obj: unknown, msg?: string) => void
}

interface GeckoTerminalHistoricalProviderOptions {
  timeoutMs: number
}

export class GeckoTerminalHistoricalCandleProvider implements HistoricalCandleProvider {
  readonly name = 'geckoterminal_public'

  constructor(
    private readonly options: GeckoTerminalHistoricalProviderOptions,
    private readonly logger: Logger,
  ) {}

  async fetch1mCandles(params: HistoricalCandleProviderFetchParams): Promise<OhlcCandle[]> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs)
    const abortOnParent = () => controller.abort()
    params.signal.addEventListener('abort', abortOnParent, { once: true })

    try {
      const url = buildOhlcvUrl(params)
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`GeckoTerminal OHLCV request failed with status ${response.status}`)
      }

      const payload = (await response.json()) as unknown
      const candles = parseGeckoOhlcvPayload(payload)
      return normalizeHistoricalCandles(candles, Math.max(1, params.limit))
    } catch (error) {
      this.logger.warn({ error, pairAddress: params.pairAddress }, 'GeckoTerminal historical candle fetch failed')
      return []
    } finally {
      clearTimeout(timeoutId)
      params.signal.removeEventListener('abort', abortOnParent)
    }
  }
}

function buildOhlcvUrl(params: HistoricalCandleProviderFetchParams): string {
  const search = new URLSearchParams()
  search.set('aggregate', '1')
  search.set('limit', String(Math.max(1, Math.min(240, Math.floor(params.limit)))))
  search.set('currency', 'usd')
  search.set('token', 'base')
  if (typeof params.endTimeSec === 'number' && Number.isFinite(params.endTimeSec) && params.endTimeSec > 0) {
    search.set('before_timestamp', String(Math.floor(params.endTimeSec)))
  }

  return `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(params.pairAddress)}/ohlcv/minute?${search.toString()}`
}

function parseGeckoOhlcvPayload(payload: unknown): OhlcCandle[] {
  const attributes = isRecord((payload as any)?.data) && isRecord((payload as any).data.attributes)
    ? ((payload as any).data.attributes as Record<string, unknown>)
    : null
  const list = attributes && Array.isArray(attributes.ohlcv_list) ? attributes.ohlcv_list : []

  const output: OhlcCandle[] = []
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 5) {
      continue
    }

    const timeSec = toFiniteNumber(row[0])
    const open = toFiniteNumber(row[1])
    const high = toFiniteNumber(row[2])
    const low = toFiniteNumber(row[3])
    const close = toFiniteNumber(row[4])
    const volume = row.length >= 6 ? toFiniteNumber(row[5]) : null

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
      continue
    }

    output.push({
      timeSec: Math.floor(timeSec),
      open,
      high,
      low,
      close,
      ...(volume !== null && volume >= 0 ? { volume } : {}),
    })
  }

  return output
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
