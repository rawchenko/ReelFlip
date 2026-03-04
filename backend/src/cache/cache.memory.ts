import { CacheStore } from './cache.types.js'

interface MemoryEntry {
  value: string
  expiresAtMs: number
}

export class MemoryCacheStore implements CacheStore {
  readonly backend = 'memory' as const
  private readonly values = new Map<string, MemoryEntry>()
  private readonly counters = new Map<string, number>()

  isAvailable(): boolean {
    return true
  }

  async get(key: string): Promise<string | null> {
    this.pruneIfExpired(key)
    return this.values.get(key)?.value ?? null
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const ttlMs = Math.max(1, Math.floor(ttlSeconds * 1000))
    this.values.set(key, {
      value,
      expiresAtMs: Date.now() + ttlMs,
    })
  }

  async del(key: string): Promise<void> {
    this.values.delete(key)
  }

  async setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean> {
    this.pruneIfExpired(key)
    if (this.values.has(key)) {
      return false
    }

    this.values.set(key, {
      value,
      expiresAtMs: Date.now() + Math.max(1, ttlMs),
    })
    return true
  }

  async increment(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1
    this.counters.set(key, next)
    return next
  }

  async close(): Promise<void> {
    this.values.clear()
    this.counters.clear()
  }

  private pruneIfExpired(key: string): void {
    const value = this.values.get(key)
    if (!value) {
      return
    }
    if (Date.now() > value.expiresAtMs) {
      this.values.delete(key)
    }
  }
}
