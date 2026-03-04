import { CacheStore } from '../cache/cache.types.js'
import { MemoryCacheStore } from '../cache/cache.memory.js'
import { ChartInterval, OhlcCandle } from './chart.types.js'
import { normalizeHistoricalCandles } from './chart.history-provider.js'

type CacheStorage = 'redis_cache' | 'memory_cache'

export interface ChartHistoryCacheEntry {
  pairAddress: string
  candles: OhlcCandle[]
  updatedAtMs: number
  lastWriteSource: 'historical_provider' | 'runtime_aggregator'
  hasHistoricalBackfill: boolean
}

export interface ChartHistoryCacheReadResult {
  entry: ChartHistoryCacheEntry | null
  storage: CacheStorage | 'miss'
}

interface ChartHistoryCacheOptions {
  store?: CacheStore
  ttlSeconds?: number
  maxCandles: number
  logger: {
    info?: (obj: unknown, msg?: string) => void
    warn: (obj: unknown, msg?: string) => void
  }
}

const DEFAULT_TTL_SECONDS = 12 * 60 * 60
const KEY_PREFIX = 'chart:'

export class ChartHistoryCache {
  private readonly store: CacheStore
  private readonly ttlSeconds: number
  private readonly ttlMs: number

  constructor(private readonly options: ChartHistoryCacheOptions) {
    this.store = options.store ?? new MemoryCacheStore()
    this.ttlSeconds = Math.max(1, Math.floor(options.ttlSeconds ?? DEFAULT_TTL_SECONDS))
    this.ttlMs = this.ttlSeconds * 1000
  }

  async initialize(): Promise<void> {
    this.options.logger.info?.({ backend: this.store.backend }, 'Chart history cache initialized')
  }

  cacheMode(): 'redis' | 'memory-fallback' {
    return this.store.backend === 'redis' ? 'redis' : 'memory-fallback'
  }

  async close(): Promise<void> {
    await this.store.close()
  }

  async readPair(pairAddress: string, interval: ChartInterval = '1m'): Promise<ChartHistoryCacheReadResult> {
    const raw = await this.store.get(cacheKey(pairAddress, interval))
    if (!raw) {
      return { entry: null, storage: 'miss' }
    }

    const parsed = parseEntry(raw, this.options.maxCandles)
    if (!parsed) {
      return { entry: null, storage: 'miss' }
    }

    if (Date.now() - parsed.updatedAtMs > this.ttlMs) {
      await this.store.del(cacheKey(pairAddress, interval)).catch(() => undefined)
      return { entry: null, storage: 'miss' }
    }

    return {
      entry: parsed,
      storage: this.store.backend === 'redis' ? 'redis_cache' : 'memory_cache',
    }
  }

  async writeHistorical(
    pairAddress: string,
    candles: OhlcCandle[],
    interval: ChartInterval = '1m',
  ): Promise<ChartHistoryCacheEntry | null> {
    const normalized = normalizeHistoricalCandles(candles, this.options.maxCandles)
    if (normalized.length === 0) {
      return null
    }

    const existing = (await this.readPair(pairAddress, interval)).entry
    const merged = mergeCandles(existing?.candles ?? [], normalized, this.options.maxCandles, 'historical')
    const entry: ChartHistoryCacheEntry = {
      pairAddress,
      candles: merged,
      updatedAtMs: Date.now(),
      lastWriteSource: 'historical_provider',
      hasHistoricalBackfill: true,
    }

    await this.writeEntry(entry, interval)
    return cloneEntry(entry)
  }

  async upsertRuntimeCandle(
    pairAddress: string,
    candle: OhlcCandle,
    interval: ChartInterval = '1m',
  ): Promise<ChartHistoryCacheEntry | null> {
    if (!isValidCandle(candle)) {
      return null
    }

    const existing = (await this.readPair(pairAddress, interval)).entry
    const baseCandles = existing?.candles ?? []
    const merged = mergeCandles(baseCandles, [candle], this.options.maxCandles, 'runtime')
    const entry: ChartHistoryCacheEntry = {
      pairAddress,
      candles: merged,
      updatedAtMs: Date.now(),
      lastWriteSource: 'runtime_aggregator',
      hasHistoricalBackfill: existing?.hasHistoricalBackfill ?? false,
    }

    await this.writeEntry(entry, interval)
    return cloneEntry(entry)
  }

  private async writeEntry(entry: ChartHistoryCacheEntry, interval: ChartInterval): Promise<void> {
    await this.store.set(cacheKey(entry.pairAddress, interval), JSON.stringify(entry), this.ttlSeconds)
  }
}

function parseEntry(raw: string, maxCandles: number): ChartHistoryCacheEntry | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    return isChartHistoryCacheEntry(parsed, maxCandles) ? parsed : null
  } catch {
    return null
  }
}

function cacheKey(pairAddress: string, interval: ChartInterval): string {
  return `${KEY_PREFIX}${interval}:${pairAddress}`
}

function mergeCandles(
  left: OhlcCandle[],
  right: OhlcCandle[],
  maxCandles: number,
  precedence: 'historical' | 'runtime',
): OhlcCandle[] {
  const byTime = new Map<number, OhlcCandle>()
  const all = precedence === 'runtime' ? [...left, ...right] : [...right, ...left]

  for (const candle of all) {
    if (!isValidCandle(candle)) {
      continue
    }
    byTime.set(candle.timeSec, cloneCandle(candle))
  }

  const merged = Array.from(byTime.values()).sort((a, b) => a.timeSec - b.timeSec)
  if (merged.length <= maxCandles) {
    return merged
  }
  return merged.slice(-maxCandles)
}

function isChartHistoryCacheEntry(input: unknown, maxCandles: number): input is ChartHistoryCacheEntry {
  if (!isRecord(input)) {
    return false
  }

  return (
    typeof input.pairAddress === 'string' &&
    typeof input.updatedAtMs === 'number' &&
    Number.isFinite(input.updatedAtMs) &&
    Array.isArray(input.candles) &&
    input.candles.length <= maxCandles &&
    input.candles.every((candle) => isValidCandle(candle as OhlcCandle)) &&
    (input.lastWriteSource === 'historical_provider' || input.lastWriteSource === 'runtime_aggregator') &&
    typeof input.hasHistoricalBackfill === 'boolean'
  )
}

function isValidCandle(candle: OhlcCandle): boolean {
  return (
    typeof candle.timeSec === 'number' &&
    Number.isFinite(candle.timeSec) &&
    candle.timeSec > 0 &&
    Number.isFinite(candle.open) &&
    candle.open > 0 &&
    Number.isFinite(candle.high) &&
    candle.high > 0 &&
    Number.isFinite(candle.low) &&
    candle.low > 0 &&
    Number.isFinite(candle.close) &&
    candle.close > 0
  )
}

function cloneCandle(candle: OhlcCandle): OhlcCandle {
  return { ...candle }
}

function cloneEntry(entry: ChartHistoryCacheEntry): ChartHistoryCacheEntry {
  return {
    ...entry,
    candles: entry.candles.map(cloneCandle),
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}
