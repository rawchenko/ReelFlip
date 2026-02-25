import { Redis } from 'ioredis'
import { TokenFeedItem } from './feed.provider.js'

export interface FeedSnapshot {
  id: string
  generatedAt: string
  source: 'providers' | 'seed'
  items: TokenFeedItem[]
}

interface CachedSnapshotEntry {
  createdAtMs: number
  snapshot: FeedSnapshot
}

export type FeedCacheLookupState = 'missing' | 'fresh' | 'stale' | 'expired'

export interface FeedCacheLookupResult {
  state: FeedCacheLookupState
  entry: CachedSnapshotEntry | null
}

interface FeedCacheOptions {
  redisUrl?: string
  ttlSeconds: number
  staleTtlSeconds: number
  logger: {
    info: (obj: unknown, msg?: string) => void
    warn: (obj: unknown, msg?: string) => void
  }
}

const SNAPSHOT_CACHE_KEY = 'feed:snapshot:v1'

export class FeedCache {
  private readonly memory = new Map<string, CachedSnapshotEntry>()
  private readonly ttlMs: number
  private readonly staleTtlMs: number
  private redisClient: Redis | null = null

  constructor(private readonly options: FeedCacheOptions) {
    this.ttlMs = options.ttlSeconds * 1000
    this.staleTtlMs = Math.max(options.staleTtlSeconds, options.ttlSeconds) * 1000
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
      this.options.logger.info({ redisUrl: this.options.redisUrl }, 'Redis cache connected')
    } catch (error) {
      this.options.logger.warn({ error }, 'Redis unavailable, falling back to in-memory cache')
      await redis.quit().catch(() => undefined)
      this.redisClient = null
    }
  }

  cacheMode(): 'redis' | 'memory-fallback' {
    return this.redisClient ? 'redis' : 'memory-fallback'
  }

  async readSnapshot(): Promise<FeedCacheLookupResult> {
    const entry = (await this.readRedisEntry()) ?? this.readMemoryEntry()

    if (!entry) {
      return { state: 'missing', entry: null }
    }

    const ageMs = Date.now() - entry.createdAtMs
    if (ageMs <= this.ttlMs) {
      return { state: 'fresh', entry }
    }

    if (ageMs <= this.staleTtlMs) {
      return { state: 'stale', entry }
    }

    return { state: 'expired', entry }
  }

  async writeSnapshot(snapshot: FeedSnapshot): Promise<void> {
    const entry: CachedSnapshotEntry = {
      createdAtMs: Date.now(),
      snapshot,
    }

    this.memory.set(SNAPSHOT_CACHE_KEY, entry)

    if (!this.redisClient) {
      return
    }

    try {
      await this.redisClient.set(SNAPSHOT_CACHE_KEY, JSON.stringify(entry), 'EX', Math.ceil(this.staleTtlMs / 1000))
    } catch (error) {
      this.options.logger.warn({ error }, 'Failed to write snapshot to Redis, keeping in-memory value')
      await this.disableRedis()
    }
  }

  async close(): Promise<void> {
    if (!this.redisClient) {
      return
    }

    await this.redisClient.quit().catch(() => undefined)
    this.redisClient = null
  }

  private readMemoryEntry(): CachedSnapshotEntry | null {
    return this.memory.get(SNAPSHOT_CACHE_KEY) ?? null
  }

  private async readRedisEntry(): Promise<CachedSnapshotEntry | null> {
    if (!this.redisClient) {
      return null
    }

    try {
      const raw = await this.redisClient.get(SNAPSHOT_CACHE_KEY)
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw) as CachedSnapshotEntry
      if (!isCachedSnapshotEntry(parsed)) {
        return null
      }

      this.memory.set(SNAPSHOT_CACHE_KEY, parsed)
      return parsed
    } catch (error) {
      this.options.logger.warn({ error }, 'Failed to read snapshot from Redis, falling back to memory')
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

function isCachedSnapshotEntry(input: unknown): input is CachedSnapshotEntry {
  if (!isRecord(input)) {
    return false
  }

  return typeof input.createdAtMs === 'number' && Number.isFinite(input.createdAtMs) && isFeedSnapshot(input.snapshot)
}

function isFeedSnapshot(input: unknown): input is FeedSnapshot {
  if (!isRecord(input)) {
    return false
  }

  return (
    typeof input.id === 'string' &&
    typeof input.generatedAt === 'string' &&
    (input.source === 'providers' || input.source === 'seed') &&
    Array.isArray(input.items)
  )
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}
