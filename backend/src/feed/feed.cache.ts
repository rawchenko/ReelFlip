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
  cursorTtlSeconds?: number
  snapshotHistoryMax?: number
  logger: {
    info: (obj: unknown, msg?: string) => void
    warn: (obj: unknown, msg?: string) => void
  }
}

const LATEST_SNAPSHOT_CACHE_KEY = 'feed:snapshot:latest:v2'
const SNAPSHOT_BY_ID_PREFIX = 'feed:snapshot:by-id:v1:'
const DEFAULT_CURSOR_TTL_SECONDS = 300
const DEFAULT_SNAPSHOT_HISTORY_MAX = 500

export class FeedCache {
  private readonly latestMemoryKey = LATEST_SNAPSHOT_CACHE_KEY
  private readonly memory = new Map<string, CachedSnapshotEntry>()
  private readonly ttlMs: number
  private readonly staleTtlMs: number
  private readonly cursorTtlMs: number
  private readonly snapshotHistoryMax: number
  private redisClient: Redis | null = null

  constructor(private readonly options: FeedCacheOptions) {
    this.ttlMs = options.ttlSeconds * 1000
    this.staleTtlMs = Math.max(options.staleTtlSeconds, options.ttlSeconds) * 1000
    this.cursorTtlMs = (options.cursorTtlSeconds ?? DEFAULT_CURSOR_TTL_SECONDS) * 1000
    this.snapshotHistoryMax = Math.max(1, options.snapshotHistoryMax ?? DEFAULT_SNAPSHOT_HISTORY_MAX)
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
    const entry = (await this.readRedisLatestEntry()) ?? this.readMemoryLatestEntry()

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

  async readSnapshotById(snapshotId: string): Promise<FeedSnapshot | null> {
    if (snapshotId.length === 0) {
      return null
    }

    const byIdKey = this.byIdMemoryKey(snapshotId)
    const entry = (await this.readRedisSnapshotEntryById(snapshotId)) ?? this.readMemorySnapshotEntryById(snapshotId)
    if (!entry) {
      return null
    }

    if (!this.isEntryWithinCursorTtl(entry)) {
      this.memory.delete(byIdKey)
      return null
    }

    return entry.snapshot
  }

  async writeSnapshot(snapshot: FeedSnapshot): Promise<void> {
    const entry: CachedSnapshotEntry = {
      createdAtMs: Date.now(),
      snapshot,
    }

    this.memory.set(this.latestMemoryKey, entry)
    this.memory.set(this.byIdMemoryKey(snapshot.id), entry)
    this.pruneMemorySnapshotHistory()

    if (!this.redisClient) {
      return
    }

    try {
      const latestTtlSeconds = Math.ceil(this.staleTtlMs / 1000)
      const byIdTtlSeconds = Math.ceil(this.cursorTtlMs / 1000)
      const byIdRedisKey = this.byIdRedisKey(snapshot.id)

      await this.redisClient
        .multi()
        .set(LATEST_SNAPSHOT_CACHE_KEY, JSON.stringify(entry), 'EX', latestTtlSeconds)
        .set(byIdRedisKey, JSON.stringify(entry), 'EX', byIdTtlSeconds)
        .exec()
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

  private readMemoryLatestEntry(): CachedSnapshotEntry | null {
    return this.memory.get(this.latestMemoryKey) ?? null
  }

  private readMemorySnapshotEntryById(snapshotId: string): CachedSnapshotEntry | null {
    return this.memory.get(this.byIdMemoryKey(snapshotId)) ?? null
  }

  private async readRedisLatestEntry(): Promise<CachedSnapshotEntry | null> {
    if (!this.redisClient) {
      return null
    }

    try {
      const raw = await this.redisClient.get(LATEST_SNAPSHOT_CACHE_KEY)
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw) as CachedSnapshotEntry
      if (!isCachedSnapshotEntry(parsed)) {
        return null
      }

      this.memory.set(this.latestMemoryKey, parsed)
      this.memory.set(this.byIdMemoryKey(parsed.snapshot.id), parsed)
      this.pruneMemorySnapshotHistory()

      return parsed
    } catch (error) {
      this.options.logger.warn({ error }, 'Failed to read latest snapshot from Redis, falling back to memory')
      await this.disableRedis()
      return null
    }
  }

  private async readRedisSnapshotEntryById(snapshotId: string): Promise<CachedSnapshotEntry | null> {
    if (!this.redisClient) {
      return null
    }

    try {
      const raw = await this.redisClient.get(this.byIdRedisKey(snapshotId))
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw) as CachedSnapshotEntry
      if (!isCachedSnapshotEntry(parsed)) {
        return null
      }

      this.memory.set(this.byIdMemoryKey(snapshotId), parsed)
      this.pruneMemorySnapshotHistory()

      return parsed
    } catch (error) {
      this.options.logger.warn({ error }, 'Failed to read snapshot by id from Redis, falling back to memory')
      await this.disableRedis()
      return null
    }
  }

  private pruneMemorySnapshotHistory(): void {
    const now = Date.now()
    const byIdEntries = Array.from(this.memory.entries()).filter(([key]) => key.startsWith(SNAPSHOT_BY_ID_PREFIX))

    for (const [key, entry] of byIdEntries) {
      if (now - entry.createdAtMs > this.cursorTtlMs) {
        this.memory.delete(key)
      }
    }

    const liveEntries = Array.from(this.memory.entries())
      .filter(([key]) => key.startsWith(SNAPSHOT_BY_ID_PREFIX))
      .sort((left, right) => right[1].createdAtMs - left[1].createdAtMs)

    for (let index = this.snapshotHistoryMax; index < liveEntries.length; index += 1) {
      const key = liveEntries[index]?.[0]
      if (key) {
        this.memory.delete(key)
      }
    }
  }

  private isEntryWithinCursorTtl(entry: CachedSnapshotEntry): boolean {
    return Date.now() - entry.createdAtMs <= this.cursorTtlMs
  }

  private byIdMemoryKey(snapshotId: string): string {
    return `${SNAPSHOT_BY_ID_PREFIX}${snapshotId}`
  }

  private byIdRedisKey(snapshotId: string): string {
    return `${SNAPSHOT_BY_ID_PREFIX}${snapshotId}`
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
