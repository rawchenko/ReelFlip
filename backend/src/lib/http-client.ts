import { CircuitBreaker } from './circuit-breaker.js'

export type UpstreamErrorType = 'http' | 'timeout' | 'network' | 'circuit_open'

export interface UpstreamRequestEvent {
  upstream: string
  success: boolean
  status: number
  durationMs: number
  attempts: number
  errorType?: UpstreamErrorType
}

interface HttpClientLogger {
  warn?: (obj: unknown, msg?: string) => void
}

export interface HttpClientOptions {
  upstream: string
  timeoutMs: number
  maxRetries: number
  retryBaseDelayMs: number
  jitterRatio?: number
  circuitBreaker?: CircuitBreaker
  logger?: HttpClientLogger
  onRequestComplete?: (event: UpstreamRequestEvent) => void
}

export class CircuitOpenError extends Error {
  constructor(public readonly upstream: string) {
    super(`Circuit breaker open for ${upstream}`)
    this.name = 'CircuitOpenError'
  }
}

export class ResilientHttpClient {
  private readonly jitterRatio: number

  constructor(private readonly options: HttpClientOptions) {
    this.jitterRatio = options.jitterRatio ?? 0.2
  }

  async request(url: string | URL, init: RequestInit = {}): Promise<Response> {
    const startMs = Date.now()
    const maxAttempts = Math.max(1, this.options.maxRetries + 1)
    let attempts = 0
    let lastError: unknown = null

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attempts = attempt
      if (this.options.circuitBreaker && !this.options.circuitBreaker.canRequest()) {
        const event: UpstreamRequestEvent = {
          upstream: this.options.upstream,
          success: false,
          status: 0,
          durationMs: Date.now() - startMs,
          attempts: attempt,
          errorType: 'circuit_open',
        }
        this.options.onRequestComplete?.(event)
        throw new CircuitOpenError(this.options.upstream)
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs)
      const signal = mergeAbortSignals(init.signal, controller.signal)
      const attemptStartedAt = Date.now()

      try {
        const response = await fetch(url, {
          ...init,
          signal,
        })

        const durationMs = Date.now() - attemptStartedAt
        if (response.ok) {
          this.options.circuitBreaker?.onSuccess()
          this.options.onRequestComplete?.({
            upstream: this.options.upstream,
            success: true,
            status: response.status,
            durationMs: Date.now() - startMs,
            attempts,
          })
          return response
        }

        const retryable = shouldRetryStatus(response.status)
        const errorType: UpstreamErrorType = 'http'
        if (!retryable || attempt === maxAttempts) {
          this.options.circuitBreaker?.onFailure()
          this.options.onRequestComplete?.({
            upstream: this.options.upstream,
            success: false,
            status: response.status,
            durationMs: Date.now() - startMs,
            attempts,
            errorType,
          })
          return response
        }

        this.options.logger?.warn?.(
          {
            upstream: this.options.upstream,
            status: response.status,
            attempt,
            durationMs,
          },
          'Retrying upstream HTTP request',
        )
        await delay(withJitter(this.retryDelayMs(attempt), this.jitterRatio))
      } catch (error) {
        lastError = error
        const errorType: UpstreamErrorType = isAbortError(error) ? 'timeout' : 'network'
        const retryable = true
        if (!retryable || attempt === maxAttempts) {
          this.options.circuitBreaker?.onFailure()
          this.options.onRequestComplete?.({
            upstream: this.options.upstream,
            success: false,
            status: 0,
            durationMs: Date.now() - startMs,
            attempts,
            errorType,
          })
          throw error
        }

        this.options.logger?.warn?.(
          {
            upstream: this.options.upstream,
            attempt,
            errorType,
          },
          'Retrying upstream HTTP request after transport failure',
        )
        await delay(withJitter(this.retryDelayMs(attempt), this.jitterRatio))
      } finally {
        clearTimeout(timeoutId)
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Upstream request failed')
  }

  private retryDelayMs(attempt: number): number {
    return Math.min(5_000, this.options.retryBaseDelayMs * 2 ** Math.max(0, attempt - 1))
  }
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function withJitter(baseMs: number, ratio: number): number {
  const spread = Math.max(0, ratio)
  const min = Math.max(0, 1 - spread)
  const max = 1 + spread
  const randomScale = min + Math.random() * (max - min)
  return Math.max(1, Math.round(baseMs * randomScale))
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function mergeAbortSignals(...signals: Array<AbortSignal | null | undefined>): AbortSignal | undefined {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal))
  if (activeSignals.length === 0) {
    return undefined
  }

  const controller = new AbortController()
  const onAbort = () => controller.abort()
  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort()
      return controller.signal
    }
    signal.addEventListener('abort', onAbort, { once: true })
  }
  return controller.signal
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
