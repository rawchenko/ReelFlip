import { SupabaseRequestEvent } from '../storage/supabase.client.js'

export interface FeedPageMetricEvent {
  source: 'providers' | 'seed'
  cacheStatus: 'HIT' | 'MISS' | 'STALE'
}

export class BackendMetrics {
  private readonly startedAtMs = Date.now()
  private readonly supabase = {
    total: 0,
    failures: 0,
    retries: 0,
    totalDurationMs: 0,
    lastStatus: 0,
    lastErrorType: null as SupabaseRequestEvent['errorType'] | null,
  }

  private readonly ingest = {
    success: 0,
    failure: 0,
    skippedOverlap: 0,
    lastCompletedAt: null as string | null,
    lastFailedAt: null as string | null,
    consecutiveFailures: 0,
  }

  private readonly feed = {
    totalRequests: 0,
    cacheHit: 0,
    cacheMiss: 0,
    cacheStale: 0,
    sourceProviders: 0,
    sourceSeed: 0,
    unavailable: 0,
  }
  private lastSeedSourceAlertAtMs: number | null = null
  private lastSupabaseFailureAlertAtMs: number | null = null

  recordSupabaseRequest(event: SupabaseRequestEvent): void {
    this.supabase.total += 1
    this.supabase.totalDurationMs += Math.max(0, event.durationMs)
    this.supabase.lastStatus = event.status
    this.supabase.lastErrorType = event.errorType ?? null

    if (!event.success) {
      this.supabase.failures += 1
    }

    if (event.retried) {
      this.supabase.retries += 1
    }
  }

  recordIngestSuccess(): void {
    this.ingest.success += 1
    this.ingest.consecutiveFailures = 0
    this.ingest.lastCompletedAt = new Date().toISOString()
  }

  recordIngestFailure(): void {
    this.ingest.failure += 1
    this.ingest.consecutiveFailures += 1
    this.ingest.lastFailedAt = new Date().toISOString()
  }

  recordIngestSkippedOverlap(): void {
    this.ingest.skippedOverlap += 1
  }

  recordFeedPage(event: FeedPageMetricEvent): void {
    this.feed.totalRequests += 1
    if (event.cacheStatus === 'HIT') {
      this.feed.cacheHit += 1
    } else if (event.cacheStatus === 'MISS') {
      this.feed.cacheMiss += 1
    } else {
      this.feed.cacheStale += 1
    }

    if (event.source === 'providers') {
      this.feed.sourceProviders += 1
    } else {
      this.feed.sourceSeed += 1
    }
  }

  recordFeedUnavailable(): void {
    this.feed.unavailable += 1
  }

  maybeFeedSeedRateAlert(
    threshold = 0.4,
    minRequests = 20,
  ): { shouldAlert: boolean; seedRate: number; totalRequests: number } {
    if (this.feed.totalRequests < minRequests) {
      return { shouldAlert: false, seedRate: 0, totalRequests: this.feed.totalRequests }
    }

    const seedRate = this.feed.sourceSeed / Math.max(1, this.feed.totalRequests)
    const now = Date.now()
    const cooldownMs = 5 * 60 * 1000
    const cooldownActive = this.lastSeedSourceAlertAtMs !== null && now - this.lastSeedSourceAlertAtMs < cooldownMs
    if (seedRate < threshold || cooldownActive) {
      return { shouldAlert: false, seedRate, totalRequests: this.feed.totalRequests }
    }

    this.lastSeedSourceAlertAtMs = now
    return { shouldAlert: true, seedRate, totalRequests: this.feed.totalRequests }
  }

  maybeSupabaseFailureRateAlert(
    threshold = 0.2,
    minRequests = 20,
  ): { shouldAlert: boolean; failureRate: number; totalRequests: number; failedRequests: number } {
    if (this.supabase.total < minRequests) {
      return {
        shouldAlert: false,
        failureRate: 0,
        totalRequests: this.supabase.total,
        failedRequests: this.supabase.failures,
      }
    }

    const failureRate = this.supabase.failures / Math.max(1, this.supabase.total)
    const now = Date.now()
    const cooldownMs = 5 * 60 * 1000
    const cooldownActive = this.lastSupabaseFailureAlertAtMs !== null && now - this.lastSupabaseFailureAlertAtMs < cooldownMs
    if (failureRate < threshold || cooldownActive) {
      return {
        shouldAlert: false,
        failureRate,
        totalRequests: this.supabase.total,
        failedRequests: this.supabase.failures,
      }
    }

    this.lastSupabaseFailureAlertAtMs = now
    return {
      shouldAlert: true,
      failureRate,
      totalRequests: this.supabase.total,
      failedRequests: this.supabase.failures,
    }
  }

  snapshot(): Record<string, unknown> {
    const supabaseAvgDurationMs =
      this.supabase.total > 0 ? Number((this.supabase.totalDurationMs / this.supabase.total).toFixed(2)) : 0

    return {
      uptimeMs: Date.now() - this.startedAtMs,
      supabase: {
        totalRequests: this.supabase.total,
        failedRequests: this.supabase.failures,
        retriedAttempts: this.supabase.retries,
        avgDurationMs: supabaseAvgDurationMs,
        lastStatus: this.supabase.lastStatus,
        lastErrorType: this.supabase.lastErrorType,
      },
      ingest: {
        successCount: this.ingest.success,
        failureCount: this.ingest.failure,
        overlapSkipCount: this.ingest.skippedOverlap,
        consecutiveFailures: this.ingest.consecutiveFailures,
        lastCompletedAt: this.ingest.lastCompletedAt,
        lastFailedAt: this.ingest.lastFailedAt,
      },
      feed: {
        totalRequests: this.feed.totalRequests,
        cacheHit: this.feed.cacheHit,
        cacheMiss: this.feed.cacheMiss,
        cacheStale: this.feed.cacheStale,
        sourceProviders: this.feed.sourceProviders,
        sourceSeed: this.feed.sourceSeed,
        unavailable: this.feed.unavailable,
      },
    }
  }
}
