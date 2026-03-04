import { CacheStore } from '../cache/cache.types.js'
import { RedisStreamStore, StreamReadSubscription } from '../cache/stream.redis.js'
import { ChartInterval, ChartStreamEvent } from './chart.types.js'
import { Redis } from 'ioredis'

interface ChartStreamServiceOptions {
  maxLen: number
  readBlockMs?: number
}

export interface ChartPollLock {
  tryAcquire(pairAddress: string, interval: ChartInterval, ttlMs: number): Promise<boolean>
}

export class CachePollLock implements ChartPollLock {
  constructor(private readonly cacheStore: CacheStore) {}

  async tryAcquire(pairAddress: string, interval: ChartInterval, ttlMs: number): Promise<boolean> {
    const key = `chart:poll:lock:v1:${interval}:${pairAddress}`
    return this.cacheStore.setIfAbsent(key, '1', ttlMs)
  }
}

export class ChartStreamService {
  private readonly streamStore: RedisStreamStore<ChartStreamEvent>
  private readonly readBlockMs: number
  private readonly redisClient: Redis | null

  constructor(redisClient: Redis | null, options: ChartStreamServiceOptions) {
    this.redisClient = redisClient
    this.streamStore = new RedisStreamStore<ChartStreamEvent>({
      redisClient,
      maxLen: options.maxLen,
    })
    this.readBlockMs = options.readBlockMs ?? 15_000
  }

  isAvailable(): boolean {
    return this.streamStore.isAvailable()
  }

  async publish(event: ChartStreamEvent): Promise<ChartStreamEvent> {
    if (!('pairAddress' in event) || !('interval' in event) || !event.interval) {
      return event
    }

    const sequence = this.redisClient
      ? await this.redisClient.incr(`chart:events:seq:v1:${event.interval}:${event.pairAddress}`)
      : undefined
    const payload: ChartStreamEvent = sequence !== undefined ? { ...event, sequence } : event

    const streamId = await this.streamStore.publish(event.pairAddress, event.interval, payload)
    if (!streamId) {
      return payload
    }

    return {
      ...payload,
      streamId,
    }
  }

  async read(subscriptions: StreamReadSubscription[], blocking = true): Promise<ChartStreamEvent[]> {
    const events = await this.streamStore.read(subscriptions, {
      blockMs: blocking ? this.readBlockMs : undefined,
      count: 100,
    })

    return events.map((event) => ({
      ...event.payload,
      streamId: event.streamId,
    })) as ChartStreamEvent[]
  }

  async getQueueLength(pairAddress: string, interval: ChartInterval): Promise<number> {
    return this.streamStore.getStreamLength(pairAddress, interval)
  }
}
