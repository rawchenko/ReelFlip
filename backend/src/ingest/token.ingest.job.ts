import { FeedService } from '../feed/feed.service.js'
import { ChartRepository } from '../storage/chart.repository.js'

interface Logger {
  info?: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
}

interface TokenIngestJobOptions {
  intervalSeconds: number
  candleRetentionDays: number
  requireDurablePersistence: boolean
}

interface TokenIngestJobMetrics {
  recordIngestSuccess: () => void
  recordIngestFailure: () => void
  recordIngestSkippedOverlap: () => void
  recordIngestDuration?: (durationMs: number) => void
  recordIngestRefreshSuccess?: () => void
  recordIngestRefreshFailure?: () => void
  recordIngestDurableSuccess?: () => void
  recordIngestDurableFailure?: () => void
  recordIngestDurableSkipped?: () => void
}

export interface IngestFailureThresholdEvent {
  cycle: number
  consecutiveFailures: number
  intervalSeconds: number
}

export interface IngestMissedIntervalsEvent {
  cycle: number
  intervalSeconds: number
  lagMs: number
  missedIntervals: number
}

export interface IngestDurableFailureThresholdEvent {
  cycle: number
  consecutiveDurableFailures: number
  intervalSeconds: number
}

interface TokenIngestJobAlerts {
  onFailureThreshold?: (event: IngestFailureThresholdEvent) => void
  onMissedIntervals?: (event: IngestMissedIntervalsEvent) => void
  onDurableFailureThreshold?: (event: IngestDurableFailureThresholdEvent) => void
}

export class TokenIngestJob {
  private timer: ReturnType<typeof setInterval> | null = null
  private inFlight = false
  private cycle = 0
  private consecutiveFailures = 0
  private consecutiveDurableFailures = 0
  private lastCycleStartedAtMs: number | null = null
  private lastSuccessAtMs: number | null = null
  private lastMissedIntervalAlertAtMs: number | null = null

  constructor(
    private readonly feedService: FeedService,
    private readonly chartRepository: ChartRepository | null,
    private readonly options: TokenIngestJobOptions,
    private readonly logger: Logger,
    private readonly metrics?: TokenIngestJobMetrics,
    private readonly alerts: TokenIngestJobAlerts = {},
  ) {}

  start(): void {
    if (this.timer) {
      return
    }

    void this.runCycle('startup')

    const intervalMs = Math.max(5, this.options.intervalSeconds) * 1000
    this.timer = setInterval(() => {
      void this.runCycle('interval')
    }, intervalMs)
    this.timer.unref?.()

    this.logger.info?.(
      {
        intervalSeconds: this.options.intervalSeconds,
        candleRetentionDays: this.options.candleRetentionDays,
      },
      'Token ingest job started',
    )
  }

  stop(): void {
    if (!this.timer) {
      return
    }

    clearInterval(this.timer)
    this.timer = null
    this.logger.info?.({ cycles: this.cycle }, 'Token ingest job stopped')
  }

  private async runCycle(trigger: 'startup' | 'interval'): Promise<void> {
    if (this.inFlight) {
      this.metrics?.recordIngestSkippedOverlap()
      return
    }

    this.inFlight = true
    const startedAt = Date.now()
    this.lastCycleStartedAtMs = startedAt
    this.cycle += 1
    this.warnIfIngestMissedIntervals(startedAt)
    let refreshSucceeded = false
    let snapshot: { id: string; source: string; items: unknown[] } | null = null
    let persistenceStatus: 'skipped' | 'succeeded' | 'failed' | null = null
    let persistenceErrorMessage: string | null = null

    try {
      const refreshResult = await this.feedService.refreshSnapshotWithOutcome()
      refreshSucceeded = true
      this.metrics?.recordIngestRefreshSuccess?.()
      snapshot = refreshResult.snapshot
      persistenceStatus = refreshResult.persistence.status
      persistenceErrorMessage = refreshResult.persistence.errorMessage ?? null

      if (persistenceStatus === 'succeeded') {
        this.metrics?.recordIngestDurableSuccess?.()
        this.consecutiveDurableFailures = 0
      } else if (persistenceStatus === 'failed') {
        this.metrics?.recordIngestDurableFailure?.()
        this.consecutiveDurableFailures += 1
        this.emitDurableFailureThresholdIfNeeded()
        if (!this.options.requireDurablePersistence) {
          this.logger.warn(
            {
              trigger,
              cycle: this.cycle,
              error: persistenceErrorMessage,
            },
            'Token ingest durable persistence failed but cycle will continue',
          )
        }
      } else {
        this.metrics?.recordIngestDurableSkipped?.()
        this.consecutiveDurableFailures = 0
      }

      if (this.options.requireDurablePersistence && persistenceStatus === 'failed') {
        throw new DurablePersistenceRequiredError(
          persistenceErrorMessage ?? 'Supabase durable persistence failed while strict mode is enabled.',
        )
      }

      if (this.chartRepository) {
        const retentionMs = Math.max(1, this.options.candleRetentionDays) * 24 * 60 * 60 * 1000
        const cutoffIso = new Date(Date.now() - retentionMs).toISOString()
        await this.chartRepository.pruneOldCandles(cutoffIso)
      }
      this.consecutiveFailures = 0
      this.lastSuccessAtMs = Date.now()
      this.metrics?.recordIngestSuccess()

      this.logger.info?.(
        {
          trigger,
          cycle: this.cycle,
          durationMs: Date.now() - startedAt,
          snapshotId: snapshot?.id ?? null,
          itemCount: snapshot?.items.length ?? 0,
          source: snapshot?.source ?? null,
          persistenceStatus,
        },
        'Token ingest cycle completed',
      )
    } catch (error) {
      if (!refreshSucceeded) {
        this.metrics?.recordIngestRefreshFailure?.()
      }
      this.consecutiveFailures += 1
      this.metrics?.recordIngestFailure()
      this.logger.warn(
        {
          error,
          trigger,
          cycle: this.cycle,
          durationMs: Date.now() - startedAt,
          consecutiveFailures: this.consecutiveFailures,
        },
        'Token ingest cycle failed',
      )
      if (this.consecutiveFailures >= 2) {
        const thresholdEvent: IngestFailureThresholdEvent = {
          cycle: this.cycle,
          consecutiveFailures: this.consecutiveFailures,
          intervalSeconds: this.options.intervalSeconds,
        }
        this.logger.warn(
          {
            ...thresholdEvent,
            lastCycleStartedAt: this.lastCycleStartedAtMs ? new Date(this.lastCycleStartedAtMs).toISOString() : null,
          },
          'Token ingest failure threshold reached',
        )
        this.alerts.onFailureThreshold?.(thresholdEvent)
      }
    } finally {
      this.metrics?.recordIngestDuration?.(Date.now() - startedAt)
      this.inFlight = false
    }
  }

  private warnIfIngestMissedIntervals(nowMs: number): void {
    if (this.lastSuccessAtMs === null) {
      return
    }

    const intervalMs = Math.max(5, this.options.intervalSeconds) * 1000
    const thresholdMs = intervalMs * 2
    const lagMs = nowMs - this.lastSuccessAtMs
    if (lagMs <= thresholdMs) {
      return
    }

    const cooldownMs = 5 * 60 * 1000
    if (this.lastMissedIntervalAlertAtMs !== null && nowMs - this.lastMissedIntervalAlertAtMs < cooldownMs) {
      return
    }

    const missedIntervals = Math.max(1, Math.floor(lagMs / intervalMs) - 1)
    this.lastMissedIntervalAlertAtMs = nowMs
    const missedEvent: IngestMissedIntervalsEvent = {
      cycle: this.cycle,
      intervalSeconds: this.options.intervalSeconds,
      lagMs,
      missedIntervals,
    }
    this.logger.warn(
      {
        ...missedEvent,
        lastSuccessAt: new Date(this.lastSuccessAtMs).toISOString(),
      },
      'Token ingest job appears to have missed scheduled intervals',
    )
    this.alerts.onMissedIntervals?.(missedEvent)
  }

  private emitDurableFailureThresholdIfNeeded(): void {
    if (this.consecutiveDurableFailures < 2) {
      return
    }

    const thresholdEvent: IngestDurableFailureThresholdEvent = {
      cycle: this.cycle,
      consecutiveDurableFailures: this.consecutiveDurableFailures,
      intervalSeconds: this.options.intervalSeconds,
    }
    this.logger.warn(thresholdEvent, 'Token ingest durable persistence failure threshold reached')
    this.alerts.onDurableFailureThreshold?.(thresholdEvent)
  }
}

class DurablePersistenceRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DurablePersistenceRequiredError'
  }
}
