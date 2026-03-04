export type MigrationAlertType =
  | 'feed_seed_rate_high'
  | 'supabase_failure_rate_high'
  | 'ingest_failure_threshold'
  | 'ingest_missed_intervals'

export type MigrationAlertSeverity = 'warning' | 'critical'

export interface MigrationAlertEvent {
  type: MigrationAlertType
  severity: MigrationAlertSeverity
  detectedAt: string
  service: string
  environment: string
  metrics: Record<string, number | string | null>
  message: string
}

export interface AlertContext {
  service: string
  environment: string
}

export interface FeedSeedRateAlertInput {
  seedRate: number
  totalRequests: number
}

export interface SupabaseFailureRateAlertInput {
  failureRate: number
  totalRequests: number
  failedRequests: number
}

export interface IngestFailureThresholdAlertInput {
  consecutiveFailures: number
  cycle: number
  intervalSeconds: number
}

export interface IngestMissedIntervalsAlertInput {
  missedIntervals: number
  lagMs: number
  intervalSeconds: number
}

export function buildFeedSeedRateAlert(
  context: AlertContext,
  input: FeedSeedRateAlertInput,
  detectedAt = new Date().toISOString(),
): MigrationAlertEvent {
  return {
    type: 'feed_seed_rate_high',
    severity: 'warning',
    detectedAt,
    service: context.service,
    environment: context.environment,
    metrics: {
      seedRate: round(input.seedRate),
      totalRequests: input.totalRequests,
    },
    message: 'Feed source seed ratio is above configured threshold.',
  }
}

export function buildSupabaseFailureRateAlert(
  context: AlertContext,
  input: SupabaseFailureRateAlertInput,
  detectedAt = new Date().toISOString(),
): MigrationAlertEvent {
  return {
    type: 'supabase_failure_rate_high',
    severity: 'critical',
    detectedAt,
    service: context.service,
    environment: context.environment,
    metrics: {
      failureRate: round(input.failureRate),
      totalRequests: input.totalRequests,
      failedRequests: input.failedRequests,
    },
    message: 'Supabase request failure rate is above configured threshold.',
  }
}

export function buildIngestFailureThresholdAlert(
  context: AlertContext,
  input: IngestFailureThresholdAlertInput,
  detectedAt = new Date().toISOString(),
): MigrationAlertEvent {
  return {
    type: 'ingest_failure_threshold',
    severity: 'critical',
    detectedAt,
    service: context.service,
    environment: context.environment,
    metrics: {
      consecutiveFailures: input.consecutiveFailures,
      cycle: input.cycle,
      intervalSeconds: input.intervalSeconds,
    },
    message: 'Token ingest consecutive failure threshold reached.',
  }
}

export function buildIngestMissedIntervalsAlert(
  context: AlertContext,
  input: IngestMissedIntervalsAlertInput,
  detectedAt = new Date().toISOString(),
): MigrationAlertEvent {
  return {
    type: 'ingest_missed_intervals',
    severity: 'warning',
    detectedAt,
    service: context.service,
    environment: context.environment,
    metrics: {
      missedIntervals: input.missedIntervals,
      lagMs: input.lagMs,
      intervalSeconds: input.intervalSeconds,
    },
    message: 'Token ingest appears to have missed scheduled intervals.',
  }
}

function round(value: number): number {
  return Number(value.toFixed(6))
}
