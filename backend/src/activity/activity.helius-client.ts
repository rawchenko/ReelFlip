import { CircuitBreaker } from '../lib/circuit-breaker.js'
import { ResilientHttpClient } from '../lib/http-client.js'
import type { HeliusEnhancedTransaction, HeliusSignatureResult } from './activity.types.js'

export interface HeliusTransactionClientOptions {
  apiKey?: string
  dasUrl: string
  restApiBaseUrl?: string
  timeoutMs: number
}

interface HeliusTransactionClientLogger {
  warn?: (obj: unknown, msg?: string) => void
  info?: (obj: unknown, msg?: string) => void
}

const SIGNATURES_LIMIT = 50
const PARSE_BATCH_SIZE = 100

export class HeliusTransactionClient {
  private readonly circuitBreaker: CircuitBreaker
  private readonly rpcClient: ResilientHttpClient
  private readonly restClient: ResilientHttpClient

  constructor(
    private readonly options: HeliusTransactionClientOptions,
    private readonly logger: HeliusTransactionClientLogger,
  ) {
    this.circuitBreaker = new CircuitBreaker({
      windowMs: 60_000,
      minSamples: 5,
      failureThreshold: 0.5,
      openDurationMs: 30_000,
      halfOpenProbeCount: 2,
    })

    this.rpcClient = new ResilientHttpClient({
      upstream: 'helius-rpc-activity',
      timeoutMs: options.timeoutMs,
      maxRetries: 2,
      retryBaseDelayMs: 500,
      circuitBreaker: this.circuitBreaker,
      logger,
    })

    this.restClient = new ResilientHttpClient({
      upstream: 'helius-rest-activity',
      timeoutMs: options.timeoutMs,
      maxRetries: 2,
      retryBaseDelayMs: 500,
      circuitBreaker: this.circuitBreaker,
      logger,
    })
  }

  async getSignatures(
    walletAddress: string,
    days: number,
    cursor?: string,
  ): Promise<{ signatures: HeliusSignatureResult[]; nextCursor?: string }> {
    const untilTimestamp = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000)

    const params: Record<string, unknown> = {
      limit: SIGNATURES_LIMIT,
    }
    if (cursor) {
      params.before = cursor
    }

    const rpcUrl = buildHeliusRpcUrl(this.options.dasUrl, this.options.apiKey)
    const response = await this.rpcClient.request(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `activity-sigs-${walletAddress.slice(0, 8)}`,
        jsonrpc: '2.0',
        method: 'getSignaturesForAddress',
        params: [walletAddress, params],
      }),
    })

    if (!response.ok) {
      throw new HeliusClientError(`getSignaturesForAddress failed with status ${response.status}`)
    }

    const json = (await response.json()) as { result?: HeliusSignatureResult[]; error?: unknown }
    if (json.error) {
      throw new HeliusClientError(`getSignaturesForAddress RPC error: ${JSON.stringify(json.error)}`)
    }

    const allSignatures = json.result ?? []

    const filtered = allSignatures.filter((sig) => {
      if (sig.blockTime === null) return true
      return sig.blockTime >= untilTimestamp
    })

    const nextCursor =
      allSignatures.length >= SIGNATURES_LIMIT && filtered.length > 0
        ? filtered[filtered.length - 1]?.signature
        : undefined

    return { signatures: filtered, nextCursor }
  }

  async parseTransactions(signatures: string[]): Promise<HeliusEnhancedTransaction[]> {
    if (signatures.length === 0) return []

    const results: HeliusEnhancedTransaction[] = []

    for (let i = 0; i < signatures.length; i += PARSE_BATCH_SIZE) {
      const batch = signatures.slice(i, i + PARSE_BATCH_SIZE)
      const url = buildHeliusRestUrl(
        this.options.restApiBaseUrl ?? 'https://api.helius.dev',
        '/v0/transactions',
        this.options.apiKey,
      )

      const response = await this.restClient.request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transactions: batch }),
      })

      if (!response.ok) {
        throw new HeliusClientError(`parseTransactions failed with status ${response.status}`)
      }

      const parsed = (await response.json()) as HeliusEnhancedTransaction[]
      if (Array.isArray(parsed)) {
        results.push(...parsed)
      }
    }

    return results
  }
}

export class HeliusClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HeliusClientError'
  }
}

function buildHeliusRpcUrl(rawUrl: string, apiKey?: string): string {
  const normalized = rawUrl.trim()
  if (!apiKey || apiKey.trim().length === 0) {
    return normalized
  }
  const separator = normalized.includes('?') ? '&' : '?'
  return `${normalized}${separator}api-key=${encodeURIComponent(apiKey)}`
}

function buildHeliusRestUrl(baseUrl: string, path: string, apiKey?: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  const url = `${normalized}${path}`
  if (!apiKey || apiKey.trim().length === 0) {
    return url
  }
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}api-key=${encodeURIComponent(apiKey)}`
}
