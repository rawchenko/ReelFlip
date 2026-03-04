import { Redis } from 'ioredis'
import { CacheLogger, CacheStore } from './cache.types.js'

interface RedisCacheStoreOptions {
  redisUrl: string
  connectTimeoutMs: number
  logger?: CacheLogger
}

export class RedisCacheStore implements CacheStore {
  readonly backend = 'redis' as const
  private readonly client: Redis
  private connected = false

  constructor(private readonly options: RedisCacheStoreOptions) {
    this.client = new Redis(options.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
  }

  async connect(): Promise<boolean> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), Math.max(100, this.options.connectTimeoutMs))

    try {
      const connectPromise = this.client.connect()
      const abortPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          'abort',
          () => {
            reject(new Error('Redis connect timeout'))
          },
          { once: true },
        )
      })
      await Promise.race([connectPromise, abortPromise])
      this.connected = true
      return true
    } catch (error) {
      this.options.logger?.warn?.({ error }, 'Failed to connect Redis cache store')
      await this.client.quit().catch(() => undefined)
      this.connected = false
      return false
    } finally {
      clearTimeout(timeoutId)
    }
  }

  isAvailable(): boolean {
    return this.connected
  }

  async get(key: string): Promise<string | null> {
    this.assertConnected()
    return this.client.get(key)
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.assertConnected()
    await this.client.set(key, value, 'EX', Math.max(1, Math.floor(ttlSeconds)))
  }

  async del(key: string): Promise<void> {
    this.assertConnected()
    await this.client.del(key)
  }

  async setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean> {
    this.assertConnected()
    const response = await this.client.set(key, value, 'PX', Math.max(1, ttlMs), 'NX')
    return response === 'OK'
  }

  async increment(key: string): Promise<number> {
    this.assertConnected()
    return this.client.incr(key)
  }

  async close(): Promise<void> {
    if (!this.connected) {
      return
    }
    await this.client.quit().catch(() => undefined)
    this.connected = false
  }

  getClient(): Redis | null {
    return this.connected ? this.client : null
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new Error('Redis cache store is not connected')
    }
  }
}
