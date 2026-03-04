export type CircuitBreakerState = 'closed' | 'open' | 'half_open'

interface FailureRecord {
  atMs: number
  success: boolean
}

export interface CircuitBreakerOptions {
  windowMs: number
  minSamples: number
  failureThreshold: number
  openDurationMs: number
  halfOpenProbeCount: number
}

export interface CircuitBreakerSnapshot {
  state: CircuitBreakerState
  totalSamples: number
  failedSamples: number
  failureRate: number
  openUntilMs: number | null
}

export class CircuitBreaker {
  private readonly records: FailureRecord[] = []
  private state: CircuitBreakerState = 'closed'
  private openUntilMs: number | null = null
  private halfOpenInFlight = 0
  private halfOpenSuccesses = 0

  constructor(private readonly options: CircuitBreakerOptions) {}

  canRequest(nowMs = Date.now()): boolean {
    this.refreshState(nowMs)

    if (this.state === 'open') {
      return false
    }

    if (this.state === 'half_open') {
      if (this.halfOpenInFlight >= this.options.halfOpenProbeCount) {
        return false
      }
      this.halfOpenInFlight += 1
    }

    return true
  }

  onSuccess(nowMs = Date.now()): void {
    this.refreshState(nowMs)
    this.records.push({ atMs: nowMs, success: true })
    this.prune(nowMs)

    if (this.state === 'half_open') {
      this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1)
      this.halfOpenSuccesses += 1
      if (this.halfOpenSuccesses >= this.options.halfOpenProbeCount) {
        this.state = 'closed'
        this.openUntilMs = null
        this.halfOpenInFlight = 0
        this.halfOpenSuccesses = 0
      }
      return
    }

    this.evaluateOpenTransition(nowMs)
  }

  onFailure(nowMs = Date.now()): void {
    this.refreshState(nowMs)
    this.records.push({ atMs: nowMs, success: false })
    this.prune(nowMs)

    if (this.state === 'half_open') {
      this.open(nowMs)
      return
    }

    this.evaluateOpenTransition(nowMs)
  }

  snapshot(nowMs = Date.now()): CircuitBreakerSnapshot {
    this.refreshState(nowMs)
    this.prune(nowMs)
    const totalSamples = this.records.length
    const failedSamples = this.records.filter((entry) => !entry.success).length
    const failureRate = totalSamples > 0 ? failedSamples / totalSamples : 0

    return {
      state: this.state,
      totalSamples,
      failedSamples,
      failureRate,
      openUntilMs: this.openUntilMs,
    }
  }

  private evaluateOpenTransition(nowMs: number): void {
    if (this.state !== 'closed') {
      return
    }
    const totalSamples = this.records.length
    if (totalSamples < this.options.minSamples) {
      return
    }
    const failedSamples = this.records.filter((entry) => !entry.success).length
    const failureRate = failedSamples / Math.max(1, totalSamples)
    if (failureRate >= this.options.failureThreshold) {
      this.open(nowMs)
    }
  }

  private open(nowMs: number): void {
    this.state = 'open'
    this.openUntilMs = nowMs + this.options.openDurationMs
    this.halfOpenInFlight = 0
    this.halfOpenSuccesses = 0
  }

  private refreshState(nowMs: number): void {
    if (this.state !== 'open') {
      return
    }
    if (this.openUntilMs === null || nowMs < this.openUntilMs) {
      return
    }
    this.state = 'half_open'
    this.openUntilMs = null
    this.halfOpenInFlight = 0
    this.halfOpenSuccesses = 0
  }

  private prune(nowMs: number): void {
    const minTimestamp = nowMs - this.options.windowMs
    while (this.records.length > 0 && this.records[0] && this.records[0].atMs < minTimestamp) {
      this.records.shift()
    }
  }
}
