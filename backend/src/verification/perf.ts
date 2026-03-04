export interface FeedPerfSample {
  p95Ms: number
  averageMs: number
  maxMs: number
  requestsPerSecond: number
  totalRequests: number
}

export interface FeedPerfComparison {
  baselineP95Ms: number
  currentP95Ms: number
  thresholdP95Ms: number
  pass: boolean
}

export interface AutocannonSummaryLike {
  latency?: {
    p95?: number
    p97_5?: number
    p99?: number
    p90?: number
    average?: number
    max?: number
    percentiles?: Record<string, number>
  }
  requests?: {
    average?: number
    total?: number
  }
}

export function parseAutocannonSummary(summary: AutocannonSummaryLike): FeedPerfSample {
  const p95Ms = readFirstNumber(
    summary.latency?.p95,
    summary.latency?.percentiles?.['95'],
    summary.latency?.p97_5,
    summary.latency?.p99,
    summary.latency?.p90,
    summary.latency?.average,
  )
  const averageMs = readNumber(summary.latency?.average)
  const maxMs = readNumber(summary.latency?.max)
  const requestsPerSecond = readNumber(summary.requests?.average)
  const totalRequests = readNumber(summary.requests?.total)

  return {
    p95Ms,
    averageMs,
    maxMs,
    requestsPerSecond,
    totalRequests,
  }
}

export function compareFeedP95(baselineP95Ms: number, currentP95Ms: number): FeedPerfComparison {
  const thresholdP95Ms = Math.max(baselineP95Ms * 1.2, baselineP95Ms + 30)

  return {
    baselineP95Ms,
    currentP95Ms,
    thresholdP95Ms,
    pass: currentP95Ms <= thresholdP95Ms,
  }
}

function readNumber(input: unknown): number {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input
  }

  if (typeof input === 'string') {
    const parsed = Number.parseFloat(input)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return 0
}

function readFirstNumber(...inputs: unknown[]): number {
  for (const value of inputs) {
    const parsed = readNumber(value)
    if (parsed > 0) {
      return parsed
    }
  }

  return 0
}
