import { randomUUID } from 'node:crypto'
import { CacheStore } from '../cache/cache.types.js'
import { FeedService } from './feed.service.js'

interface Logger {
  info?: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
}

interface FeedSnapshotRefresherOptions {
  intervalSeconds: number
  distributedLockKey?: string
  lockTtlMs?: number
}

const DEFAULT_LOCK_KEY = 'feed:snapshot:refresh:lock:v1'

export class FeedSnapshotRefresher {
  private timer: ReturnType<typeof setInterval> | null = null
  private inFlight = false
  private cycle = 0
  private readonly lockKey: string
  private readonly lockTtlMs: number

  constructor(
    private readonly feedService: FeedService,
    private readonly cacheStore: CacheStore,
    private readonly logger: Logger,
    private readonly options: FeedSnapshotRefresherOptions,
  ) {
    this.lockKey = options.distributedLockKey ?? DEFAULT_LOCK_KEY
    this.lockTtlMs = options.lockTtlMs ?? Math.max(1000, options.intervalSeconds * 1000)
  }

  start(): void {
    if (this.timer) {
      return
    }

    void this.runCycle('startup')
    this.timer = setInterval(() => {
      void this.runCycle('interval')
    }, Math.max(1000, this.options.intervalSeconds * 1000))
    this.timer.unref?.()
  }

  stop(): void {
    if (!this.timer) {
      return
    }
    clearInterval(this.timer)
    this.timer = null
  }

  private async runCycle(trigger: 'startup' | 'interval'): Promise<void> {
    if (this.inFlight) {
      return
    }
    this.inFlight = true
    this.cycle += 1

    const lockToken = randomUUID()
    try {
      const acquired = await this.cacheStore.setIfAbsent(this.lockKey, lockToken, this.lockTtlMs)
      if (!acquired) {
        return
      }

      const snapshot = await this.feedService.refreshSnapshot()
      this.logger.info?.(
        {
          cycle: this.cycle,
          trigger,
          snapshotId: snapshot?.id ?? null,
          itemCount: snapshot?.items.length ?? 0,
        },
        'Feed snapshot refresh cycle completed',
      )
    } catch (error) {
      this.logger.warn({ error, cycle: this.cycle, trigger }, 'Feed snapshot refresh cycle failed')
    } finally {
      this.inFlight = false
    }
  }
}
