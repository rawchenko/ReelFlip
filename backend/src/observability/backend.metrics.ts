import { UpstreamRequestEvent } from '../lib/http-client.js'
import { SupabaseRequestEvent } from '../storage/supabase.client.js'

export interface FeedPageMetricEvent {
  source: 'providers' | 'seed'
  cacheStatus: 'HIT' | 'MISS' | 'STALE'
  cacheStorage?: 'redis_cache' | 'memory_cache' | 'repository' | 'miss'
}

interface UpstreamCounters {
  total: number
  failed: number
  circuitOpen: number
  totalDurationMs: number
  lastStatus: number
  lastErrorType: string | null
}

interface StreamCounters {
  published: number
  consumed: number
  lagSamples: number
  lagTotalMs: number
  queueSamples: number
  queueTotal: number
}

export class BackendMetrics {
  private readonly startedAtMs = Date.now()
  private readonly supabase = {
    total: 0,
    failures: 0,
    retries: 0,
    totalDurationMs: 0,
    totalRowsWritten: 0,
    rowsWrittenByTable: {} as Record<string, number>,
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
    totalDurationMs: 0,
    lastDurationMs: 0,
  }

  private readonly feed = {
    totalRequests: 0,
    cacheHit: 0,
    cacheMiss: 0,
    cacheStale: 0,
    cacheStorageRedis: 0,
    cacheStorageMemory: 0,
    cacheStorageRepository: 0,
    sourceProviders: 0,
    sourceSeed: 0,
    unavailable: 0,
  }

  private readonly upstream = new Map<string, UpstreamCounters>()

  private readonly stream = {
    byInterval: {
      '1s': { published: 0, consumed: 0 },
      '1m': { published: 0, consumed: 0 },
    },
    totals: {
      published: 0,
      consumed: 0,
      lagSamples: 0,
      lagTotalMs: 0,
      queueSamples: 0,
      queueTotal: 0,
    } as StreamCounters,
  }

  private readonly rateLimit = {
    hits: 0,
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

  recordSupabaseRowsWritten(tableOrView: string, rowCount: number): void {
    if (rowCount <= 0) {
      return
    }

    const normalized = tableOrView.trim()
    if (normalized.length === 0) {
      return
    }

    this.supabase.totalRowsWritten += rowCount
    this.supabase.rowsWrittenByTable[normalized] = (this.supabase.rowsWrittenByTable[normalized] ?? 0) + rowCount
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

  recordIngestDuration(durationMs: number): void {
    const normalized = Math.max(0, Math.round(durationMs))
    this.ingest.totalDurationMs += normalized
    this.ingest.lastDurationMs = normalized
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

    if (event.cacheStorage === 'redis_cache') {
      this.feed.cacheStorageRedis += 1
    } else if (event.cacheStorage === 'memory_cache') {
      this.feed.cacheStorageMemory += 1
    } else if (event.cacheStorage === 'repository') {
      this.feed.cacheStorageRepository += 1
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

  recordUpstreamRequest(event: UpstreamRequestEvent): void {
    const counters = this.ensureUpstream(event.upstream)
    counters.total += 1
    counters.totalDurationMs += Math.max(0, event.durationMs)
    counters.lastStatus = event.status
    counters.lastErrorType = event.errorType ?? null

    if (!event.success) {
      counters.failed += 1
    }
    if (event.errorType === 'circuit_open') {
      counters.circuitOpen += 1
    }
  }

  recordChartStreamPublished(_pairAddress: string, interval: '1s' | '1m'): void {
    this.stream.byInterval[interval].published += 1
    this.stream.totals.published += 1
  }

  recordChartStreamConsumed(_pairAddress: string, interval: '1s' | '1m', lagMs?: number): void {
    this.stream.byInterval[interval].consumed += 1
    this.stream.totals.consumed += 1

    if (typeof lagMs === 'number' && Number.isFinite(lagMs) && lagMs >= 0) {
      this.stream.totals.lagSamples += 1
      this.stream.totals.lagTotalMs += lagMs
    }
  }

  recordChartStreamQueueSize(_pairAddress: string, _interval: '1s' | '1m', queueSize: number): void {
    if (!Number.isFinite(queueSize) || queueSize < 0) {
      return
    }
    this.stream.totals.queueSamples += 1
    this.stream.totals.queueTotal += queueSize
  }

  recordRateLimitHit(): void {
    this.rateLimit.hits += 1
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
    const ingestCycles = this.ingest.success + this.ingest.failure
    const ingestAvgDurationMs =
      ingestCycles > 0 ? Number((this.ingest.totalDurationMs / ingestCycles).toFixed(2)) : 0
    const seedRate = this.feed.totalRequests > 0 ? this.feed.sourceSeed / this.feed.totalRequests : 0
    const staleRate = this.feed.totalRequests > 0 ? this.feed.cacheStale / this.feed.totalRequests : 0
    const avgStreamLagMs =
      this.stream.totals.lagSamples > 0
        ? Number((this.stream.totals.lagTotalMs / this.stream.totals.lagSamples).toFixed(2))
        : 0
    const avgStreamQueueSize =
      this.stream.totals.queueSamples > 0
        ? Number((this.stream.totals.queueTotal / this.stream.totals.queueSamples).toFixed(2))
        : 0

    const upstream: Record<string, unknown> = {}
    for (const [name, counters] of this.upstream.entries()) {
      upstream[name] = {
        totalRequests: counters.total,
        failedRequests: counters.failed,
        circuitOpen: counters.circuitOpen,
        avgDurationMs: counters.total > 0 ? Number((counters.totalDurationMs / counters.total).toFixed(2)) : 0,
        lastStatus: counters.lastStatus,
        lastErrorType: counters.lastErrorType,
      }
    }

    return {
      uptimeMs: Date.now() - this.startedAtMs,
      supabase: {
        totalRequests: this.supabase.total,
        failedRequests: this.supabase.failures,
        retriedAttempts: this.supabase.retries,
        avgDurationMs: supabaseAvgDurationMs,
        rowsWrittenTotal: this.supabase.totalRowsWritten,
        rowsWrittenByTable: { ...this.supabase.rowsWrittenByTable },
        lastStatus: this.supabase.lastStatus,
        lastErrorType: this.supabase.lastErrorType,
      },
      ingest: {
        successCount: this.ingest.success,
        failureCount: this.ingest.failure,
        overlapSkipCount: this.ingest.skippedOverlap,
        consecutiveFailures: this.ingest.consecutiveFailures,
        avgDurationMs: ingestAvgDurationMs,
        lastDurationMs: this.ingest.lastDurationMs,
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
        seedRate: Number(seedRate.toFixed(6)),
        staleRate: Number(staleRate.toFixed(6)),
        unavailable: this.feed.unavailable,
      },
      cache: {
        feed: {
          redisReads: this.feed.cacheStorageRedis,
          memoryReads: this.feed.cacheStorageMemory,
          repositoryReads: this.feed.cacheStorageRepository,
        },
      },
      upstream,
      stream: {
        interval1s: {
          published: this.stream.byInterval['1s'].published,
          consumed: this.stream.byInterval['1s'].consumed,
        },
        interval1m: {
          published: this.stream.byInterval['1m'].published,
          consumed: this.stream.byInterval['1m'].consumed,
        },
        avgLagMs: avgStreamLagMs,
        avgQueueSize: avgStreamQueueSize,
      },
      rateLimit: {
        hits: this.rateLimit.hits,
      },
    }
  }

  private ensureUpstream(name: string): UpstreamCounters {
    const existing = this.upstream.get(name)
    if (existing) {
      return existing
    }

    const next: UpstreamCounters = {
      total: 0,
      failed: 0,
      circuitOpen: 0,
      totalDurationMs: 0,
      lastStatus: 0,
      lastErrorType: null,
    }
    this.upstream.set(name, next)
    return next
  }
}
