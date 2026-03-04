import { Redis } from 'ioredis'

export interface StreamReadSubscription {
  pairAddress: string
  interval: '1s' | '1m'
  lastId: string
}

export interface StreamReadEvent<TPayload> {
  pairAddress: string
  interval: '1s' | '1m'
  streamId: string
  payload: TPayload
}

interface RedisStreamStoreOptions {
  redisClient: Redis | null
  maxLen: number
}

export class RedisStreamStore<TPayload> {
  constructor(private readonly options: RedisStreamStoreOptions) {}

  isAvailable(): boolean {
    return this.options.redisClient !== null
  }

  async publish(pairAddress: string, interval: '1s' | '1m', payload: TPayload): Promise<string | null> {
    const redis = this.options.redisClient
    if (!redis) {
      return null
    }

    const streamId = await redis.xadd(
      streamKey(interval, pairAddress),
      'MAXLEN',
      '~',
      Math.max(100, this.options.maxLen),
      '*',
      'payload',
      JSON.stringify(payload),
    )

    return streamId
  }

  async read(
    subscriptions: StreamReadSubscription[],
    options: {
      blockMs?: number
      count?: number
    } = {},
  ): Promise<Array<StreamReadEvent<TPayload>>> {
    const redis = this.options.redisClient
    if (!redis || subscriptions.length === 0) {
      return []
    }

    const keys = subscriptions.map((entry) => streamKey(entry.interval, entry.pairAddress))
    const ids = subscriptions.map((entry) => entry.lastId)
    const args = []

    if (options.blockMs !== undefined) {
      args.push('BLOCK', Math.max(1, options.blockMs))
    }
    if (options.count !== undefined) {
      args.push('COUNT', Math.max(1, options.count))
    }
    args.push('STREAMS', ...keys, ...ids)

    const response = await (redis as unknown as { xread: (...parts: Array<string | number>) => Promise<unknown> }).xread(
      ...args,
    )
    if (!Array.isArray(response)) {
      return []
    }

    const output: Array<StreamReadEvent<TPayload>> = []
    for (const streamEntry of response) {
      if (!Array.isArray(streamEntry) || streamEntry.length !== 2) {
        continue
      }
      const [key, values] = streamEntry
      if (typeof key !== 'string' || !Array.isArray(values)) {
        continue
      }

      const parsedKey = parseStreamKey(key)
      if (!parsedKey) {
        continue
      }

      for (const valueEntry of values) {
        if (!Array.isArray(valueEntry) || valueEntry.length !== 2) {
          continue
        }
        const [streamId, rawFields] = valueEntry
        if (typeof streamId !== 'string' || !Array.isArray(rawFields)) {
          continue
        }

        const payload = parsePayload<TPayload>(rawFields)
        if (payload === null) {
          continue
        }

        output.push({
          ...parsedKey,
          streamId,
          payload,
        })
      }
    }

    return output
  }

  async getStreamLength(pairAddress: string, interval: '1s' | '1m'): Promise<number> {
    const redis = this.options.redisClient
    if (!redis) {
      return 0
    }

    return redis.xlen(streamKey(interval, pairAddress))
  }
}

function streamKey(interval: '1s' | '1m', pairAddress: string): string {
  return `chart:events:v1:${interval}:${pairAddress}`
}

function parseStreamKey(key: string): { interval: '1s' | '1m'; pairAddress: string } | null {
  const parts = key.split(':')
  if (parts.length < 5) {
    return null
  }

  const interval = parts[3]
  const pairAddress = parts.slice(4).join(':')
  if ((interval !== '1s' && interval !== '1m') || pairAddress.length === 0) {
    return null
  }

  return {
    interval,
    pairAddress,
  }
}

function parsePayload<TPayload>(rawFields: string[]): TPayload | null {
  for (let index = 0; index < rawFields.length; index += 2) {
    const field = rawFields[index]
    const value = rawFields[index + 1]
    if (field !== 'payload' || typeof value !== 'string') {
      continue
    }

    try {
      return JSON.parse(value) as TPayload
    } catch {
      return null
    }
  }

  return null
}
