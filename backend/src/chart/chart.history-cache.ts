import { Redis } from 'ioredis'
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
  redisUrl?: string
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
  private readonly memory = new Map<string, ChartHistoryCacheEntry>()
  private readonly ttlSeconds: number
  private readonly ttlMs: number
  private redisClient: Redis | null = null

  constructor(private readonly options: ChartHistoryCacheOptions) {
    this.ttlSeconds = Math.max(60, Math.floor(options.ttlSeconds ?? DEFAULT_TTL_SECONDS))
    this.ttlMs = this.ttlSeconds * 1000
  }

  async initialize(): Promise<void> {
    if (!this.options.redisUrl) {
      return
    }

    const redis = new Redis(this.options.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })

    try {
      await redis.connect()
      this.redisClient = redis
      this.options.logger.info?.({ redisUrl: this.options.redisUrl }, 'Chart history Redis cache connected')
    } catch (error) {
      this.options.logger.warn({ error }, 'Chart history Redis unavailable, using in-memory cache')
      await redis.quit().catch(() => undefined)
      this.redisClient = null
    }
  }

  cacheMode(): 'redis' | 'memory-fallback' {
    return this.redisClient ? 'redis' : 'memory-fallback'
  }

  async close(): Promise<void> {
    if (!this.redisClient) {
      return
    }

    await this.redisClient.quit().catch(() => undefined)
    this.redisClient = null
  }

  async readPair(pairAddress: string, interval: ChartInterval = '1m'): Promise<ChartHistoryCacheReadResult> {
    const redisEntry = await this.readRedisEntry(pairAddress, interval)
    if (redisEntry) {
      this.memory.set(cacheKey(pairAddress, interval), redisEntry)
      return { entry: redisEntry, storage: 'redis_cache' }
    }

    const memoryEntry = this.memory.get(cacheKey(pairAddress, interval)) ?? null
    if (memoryEntry) {
      if (Date.now() - memoryEntry.updatedAtMs > this.ttlMs) {
        this.memory.delete(cacheKey(pairAddress, interval))
        return { entry: null, storage: 'miss' }
      }
      return { entry: cloneEntry(memoryEntry), storage: 'memory_cache' }
    }

    return { entry: null, storage: 'miss' }
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
    const key = cacheKey(entry.pairAddress, interval)
    this.memory.set(key, cloneEntry(entry))

    if (!this.redisClient) {
      return
    }

    try {
      await this.redisClient.set(key, JSON.stringify(entry), 'EX', this.ttlSeconds)
    } catch (error) {
      this.options.logger.warn({ error, pairAddress: entry.pairAddress }, 'Failed to write chart history cache to Redis')
      await this.disableRedis()
    }
  }

  private async readRedisEntry(pairAddress: string, interval: ChartInterval): Promise<ChartHistoryCacheEntry | null> {
    if (!this.redisClient) {
      return null
    }

    try {
      const raw = await this.redisClient.get(cacheKey(pairAddress, interval))
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw) as unknown
      return isChartHistoryCacheEntry(parsed, this.options.maxCandles) ? parsed : null
    } catch (error) {
      this.options.logger.warn({ error, pairAddress }, 'Failed to read chart history cache from Redis')
      await this.disableRedis()
      return null
    }
  }

  private async disableRedis(): Promise<void> {
    if (!this.redisClient) {
      return
    }
    await this.redisClient.quit().catch(() => undefined)
    this.redisClient = null
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
