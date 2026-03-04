import { CacheStore } from '../cache/cache.types.js'
import { MemoryCacheStore } from '../cache/cache.memory.js'
import { TokenFeedItem } from './feed.provider.js'

export interface FeedSnapshot {
  id: string
  schemaVersion?: number
  generatedAt: string
  source: 'providers' | 'seed'
  upstreamStatus?: 'ok' | 'degraded' | 'down'
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
  storage: 'redis_cache' | 'memory_cache' | 'miss'
}

interface FeedCacheOptions {
  store?: CacheStore
  ttlSeconds: number
  staleTtlSeconds: number
  cursorTtlSeconds?: number
  snapshotHistoryMax?: number
  logger: {
    info: (obj: unknown, msg?: string) => void
    warn: (obj: unknown, msg?: string) => void
  }
}

const LATEST_SNAPSHOT_CACHE_KEY = 'feed:snapshot:latest:v3'
const SNAPSHOT_BY_ID_PREFIX = 'feed:snapshot:by-id:v3:'
const DEFAULT_CURSOR_TTL_SECONDS = 300
const DEFAULT_SNAPSHOT_HISTORY_MAX = 500

export class FeedCache {
  private readonly store: CacheStore
  private readonly ttlMs: number
  private readonly staleTtlMs: number
  private readonly cursorTtlMs: number
  private readonly cursorTtlSeconds: number
  private readonly snapshotHistoryMax: number
  private readonly snapshotIds: string[] = []

  constructor(private readonly options: FeedCacheOptions) {
    this.store = options.store ?? new MemoryCacheStore()
    this.ttlMs = options.ttlSeconds * 1000
    this.staleTtlMs = Math.max(options.staleTtlSeconds, options.ttlSeconds) * 1000
    this.cursorTtlMs = (options.cursorTtlSeconds ?? DEFAULT_CURSOR_TTL_SECONDS) * 1000
    this.cursorTtlSeconds = Math.max(1, Math.ceil(this.cursorTtlMs / 1000))
    this.snapshotHistoryMax = Math.max(1, options.snapshotHistoryMax ?? DEFAULT_SNAPSHOT_HISTORY_MAX)
  }

  async initialize(): Promise<void> {
    this.options.logger.info({ backend: this.store.backend }, 'Feed cache initialized')
  }

  cacheMode(): 'redis' | 'memory-fallback' {
    return this.store.backend === 'redis' ? 'redis' : 'memory-fallback'
  }

  cacheStorage(): 'redis_cache' | 'memory_cache' {
    return this.store.backend === 'redis' ? 'redis_cache' : 'memory_cache'
  }

  async readSnapshot(): Promise<FeedCacheLookupResult> {
    const raw = await this.store.get(LATEST_SNAPSHOT_CACHE_KEY)
    if (!raw) {
      return { state: 'missing', entry: null, storage: 'miss' }
    }

    const entry = parseCachedSnapshotEntry(raw)
    if (!entry) {
      return { state: 'missing', entry: null, storage: 'miss' }
    }

    const ageMs = Date.now() - entry.createdAtMs
    if (ageMs <= this.ttlMs) {
      return { state: 'fresh', entry, storage: this.cacheStorage() }
    }

    if (ageMs <= this.staleTtlMs) {
      return { state: 'stale', entry, storage: this.cacheStorage() }
    }

    return { state: 'expired', entry, storage: this.cacheStorage() }
  }

  async readSnapshotById(snapshotId: string): Promise<FeedSnapshot | null> {
    if (snapshotId.length === 0) {
      return null
    }

    const raw = await this.store.get(this.byIdKey(snapshotId))
    if (!raw) {
      return null
    }

    const entry = parseCachedSnapshotEntry(raw)
    if (!entry) {
      return null
    }

    if (!this.isEntryWithinCursorTtl(entry)) {
      await this.store.del(this.byIdKey(snapshotId)).catch(() => undefined)
      return null
    }

    return entry.snapshot
  }

  async writeSnapshot(snapshot: FeedSnapshot): Promise<void> {
    const schemaVersion =
      typeof snapshot.schemaVersion === 'number' && Number.isFinite(snapshot.schemaVersion)
        ? snapshot.schemaVersion
        : 3
    const nextSnapshot: FeedSnapshot = {
      ...snapshot,
      schemaVersion: schemaVersion > 0 ? schemaVersion : 3,
      upstreamStatus: snapshot.upstreamStatus ?? 'ok',
    }

    const entry: CachedSnapshotEntry = {
      createdAtMs: Date.now(),
      snapshot: nextSnapshot,
    }

    await this.store.set(
      LATEST_SNAPSHOT_CACHE_KEY,
      JSON.stringify(entry),
      Math.max(1, Math.ceil(this.staleTtlMs / 1000)),
    )
    await this.store.set(this.byIdKey(nextSnapshot.id), JSON.stringify(entry), this.cursorTtlSeconds)

    this.snapshotIds.push(nextSnapshot.id)
    await this.pruneSnapshotHistory()
  }

  async close(): Promise<void> {
    await this.store.close()
  }

  private byIdKey(snapshotId: string): string {
    return `${SNAPSHOT_BY_ID_PREFIX}${snapshotId}`
  }

  private isEntryWithinCursorTtl(entry: CachedSnapshotEntry): boolean {
    return Date.now() - entry.createdAtMs <= this.cursorTtlMs
  }

  private async pruneSnapshotHistory(): Promise<void> {
    if (this.snapshotIds.length <= this.snapshotHistoryMax) {
      return
    }

    const overflow = this.snapshotIds.length - this.snapshotHistoryMax
    const removed = this.snapshotIds.splice(0, overflow)
    await Promise.all(removed.map((snapshotId) => this.store.del(this.byIdKey(snapshotId)).catch(() => undefined)))
  }
}

function parseCachedSnapshotEntry(raw: string): CachedSnapshotEntry | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) {
      return null
    }

    const snapshot = normalizeSnapshot(parsed.snapshot)
    const createdAtMs = parsed.createdAtMs
    if (typeof createdAtMs !== 'number' || !Number.isFinite(createdAtMs) || !snapshot) {
      return null
    }

    return {
      createdAtMs,
      snapshot,
    }
  } catch {
    return null
  }
}

function normalizeSnapshot(input: unknown): FeedSnapshot | null {
  if (!isRecord(input)) {
    return null
  }

  if (
    typeof input.id !== 'string' ||
    typeof input.generatedAt !== 'string' ||
    (input.source !== 'providers' && input.source !== 'seed') ||
    !Array.isArray(input.items)
  ) {
    return null
  }

  const schemaVersion = typeof input.schemaVersion === 'number' && Number.isFinite(input.schemaVersion) ? input.schemaVersion : 3
  const upstreamStatus =
    input.upstreamStatus === 'ok' || input.upstreamStatus === 'degraded' || input.upstreamStatus === 'down'
      ? input.upstreamStatus
      : 'ok'

  return {
    id: input.id,
    schemaVersion,
    generatedAt: input.generatedAt,
    source: input.source,
    upstreamStatus,
    items: input.items as TokenFeedItem[],
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}
