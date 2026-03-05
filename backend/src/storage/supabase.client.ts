interface SupabaseClientOptions {
  url?: string
  serviceRoleKey?: string
  requestTimeoutMs?: number
  maxRetries?: number
  retryBaseDelayMs?: number
  onRequestComplete?: (event: SupabaseRequestEvent) => void
}

interface RequestOptions {
  query?: Record<string, string | undefined>
  body?: unknown
  prefer?: string
}

export interface SupabaseRequestEvent {
  tableOrView: string
  method: 'GET' | 'POST' | 'DELETE'
  attempt: number
  durationMs: number
  status: number
  success: boolean
  retried: boolean
  errorType?: 'http' | 'timeout' | 'network'
}

export class SupabaseClientError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'SupabaseClientError'
    this.status = status
  }
}

export class SupabaseClient {
  private readonly requestTimeoutMs: number
  private readonly maxRetries: number
  private readonly retryBaseDelayMs: number

  constructor(private readonly options: SupabaseClientOptions) {
    this.requestTimeoutMs = Math.max(500, options.requestTimeoutMs ?? 10_000)
    this.maxRetries = Math.max(0, options.maxRetries ?? 2)
    this.retryBaseDelayMs = Math.max(25, options.retryBaseDelayMs ?? 200)
  }

  isEnabled(): boolean {
    return Boolean(this.options.url && this.options.serviceRoleKey)
  }

  async upsertRows(table: string, rows: Record<string, unknown>[], onConflict: string[]): Promise<void> {
    if (!this.isEnabled() || rows.length === 0) {
      return
    }

    const query: Record<string, string> = {}
    if (onConflict.length > 0) {
      query.on_conflict = onConflict.join(',')
    }

    await this.request<void>('POST', table, {
      query,
      body: rows,
      prefer: 'resolution=merge-duplicates,return=minimal',
    })
  }

  async insertRows<T extends Record<string, unknown>>(
    table: string,
    rows: Record<string, unknown>[],
    returning: 'minimal' | 'representation' = 'minimal',
  ): Promise<T[]> {
    if (!this.isEnabled() || rows.length === 0) {
      return []
    }

    return this.request<T[]>('POST', table, {
      body: rows,
      prefer: returning === 'representation' ? 'return=representation' : 'return=minimal',
    })
  }

  async selectRows<T>(tableOrView: string, query: Record<string, string | undefined>): Promise<T[]> {
    if (!this.isEnabled()) {
      return []
    }

    const mergedQuery: Record<string, string | undefined> = {
      ...query,
      select: query.select ?? '*',
    }

    return this.request<T[]>('GET', tableOrView, {
      query: mergedQuery,
    })
  }

  async deleteRows<T>(
    table: string,
    query: Record<string, string | undefined>,
    returning: 'minimal' | 'representation' = 'minimal',
  ): Promise<T[]> {
    if (!this.isEnabled()) {
      return []
    }

    return this.request<T[]>('DELETE', table, {
      query,
      prefer: returning === 'representation' ? 'return=representation' : 'return=minimal',
    })
  }

  async invokeRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    if (!this.isEnabled()) {
      return undefined as T
    }

    return this.requestAtPath<T>('POST', `/rest/v1/rpc/${encodeURIComponent(fn)}`, `rpc/${fn}`, {
      body: args,
    })
  }

  async request<T>(method: 'GET' | 'POST' | 'DELETE', tableOrView: string, options: RequestOptions = {}): Promise<T> {
    return this.requestAtPath<T>(method, `/rest/v1/${encodeURIComponent(tableOrView)}`, tableOrView, options)
  }

  private async requestAtPath<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    tableOrView: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = this.options.url
    const serviceRoleKey = this.options.serviceRoleKey
    if (!url || !serviceRoleKey) {
      throw new SupabaseClientError('Supabase client is not configured', 0)
    }

    const requestUrl = new URL(path, url)
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined) {
          continue
        }
        requestUrl.searchParams.set(key, value)
      }
    }

    const maxAttempts = this.maxRetries + 1
    let finalError: unknown = new SupabaseClientError('Supabase request failed', 0)

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs)
      const startedAt = Date.now()
      let status = 0
      let success = false
      let errorType: SupabaseRequestEvent['errorType'] | undefined

      try {
        const response = await fetch(requestUrl, {
          method,
          signal: controller.signal,
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
            ...(options.prefer ? { Prefer: options.prefer } : {}),
          },
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        })

        status = response.status
        if (!response.ok) {
          errorType = 'http'
          const message = await safeReadError(response)
          const error = new SupabaseClientError(message, response.status)

          if (attempt < maxAttempts && shouldRetryStatus(response.status)) {
            await delay(this.retryDelayMs(attempt))
            finalError = error
            continue
          }

          throw error
        }

        if (response.status === 204) {
          success = true
          return undefined as T
        }

        const text = await response.text()
        success = true
        if (text.length === 0) {
          return undefined as T
        }

        return JSON.parse(text) as T
      } catch (error) {
        if (!errorType) {
          if (isAbortError(error)) {
            errorType = 'timeout'
          } else {
            errorType = 'network'
          }
        }

        const normalized = normalizeRequestError(error)
        finalError = normalized

        if (attempt < maxAttempts && shouldRetryError(normalized)) {
          await delay(this.retryDelayMs(attempt))
          continue
        }

        throw normalized
      } finally {
        clearTimeout(timeoutId)
        this.options.onRequestComplete?.({
          tableOrView,
          method,
          attempt,
          durationMs: Date.now() - startedAt,
          status,
          success,
          retried: attempt > 1,
          ...(errorType ? { errorType } : {}),
        })
      }
    }

    throw normalizeRequestError(finalError)
  }

  private retryDelayMs(attempt: number): number {
    const exponential = this.retryBaseDelayMs * 2 ** Math.max(0, attempt - 1)
    return Math.min(2_000, exponential)
  }
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as unknown
    if (isRecord(payload)) {
      const message = payload.message
      if (typeof message === 'string' && message.length > 0) {
        return `Supabase request failed (${response.status}): ${message}`
      }

      const error = payload.error
      if (typeof error === 'string' && error.length > 0) {
        return `Supabase request failed (${response.status}): ${error}`
      }
    }
  } catch {
    // noop
  }

  return `Supabase request failed (${response.status})`
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function shouldRetryError(error: SupabaseClientError): boolean {
  if (error.status === 0) {
    return true
  }
  return shouldRetryStatus(error.status)
}

function normalizeRequestError(error: unknown): SupabaseClientError {
  if (error instanceof SupabaseClientError) {
    return error
  }

  if (isAbortError(error)) {
    return new SupabaseClientError('Supabase request timed out', 0)
  }

  if (error instanceof Error && error.message.length > 0) {
    return new SupabaseClientError(`Supabase request failed: ${error.message}`, 0)
  }

  return new SupabaseClientError('Supabase request failed', 0)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function formatInFilter(values: string[]): string {
  const encoded = values
    .filter((value) => value.length > 0)
    .map((value) => `"${value.replaceAll('"', '\\"')}"`)
  return `(${encoded.join(',')})`
}
