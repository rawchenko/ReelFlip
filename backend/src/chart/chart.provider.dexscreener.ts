import { ChartProvider, ChartTickSample } from './chart.types.js'

interface Logger {
  warn: (obj: unknown, msg?: string) => void
  info?: (obj: unknown, msg?: string) => void
  debug?: (obj: unknown, msg?: string) => void
}

interface DexScreenerChartProviderOptions {
  timeoutMs: number
}

export class DexScreenerChartProvider implements ChartProvider {
  private fetchBatchCount = 0

  constructor(
    private readonly options: DexScreenerChartProviderOptions,
    private readonly logger: Logger,
  ) {}

  async fetchPairSnapshots(pairAddresses: string[], signal: AbortSignal): Promise<ChartTickSample[]> {
    if (pairAddresses.length === 0) {
      return []
    }

    const startedAtMs = Date.now()
    const settled = await Promise.allSettled(
      pairAddresses.map((pairAddress) => this.fetchPairSnapshot(pairAddress, signal)),
    )

    const output: ChartTickSample[] = []
    let failedCount = 0

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        if (result.value) {
          output.push(result.value)
        }
        continue
      }

      failedCount += 1
      this.logger.warn({ error: result.reason }, 'DexScreener chart snapshot fetch failed')
    }

    this.fetchBatchCount += 1
    const durationMs = Date.now() - startedAtMs
    const logPayload = {
      pairCount: pairAddresses.length,
      returnedCount: output.length,
      failedCount,
      durationMs,
      batch: this.fetchBatchCount,
    }

    if (failedCount > 0 || durationMs >= Math.max(1_000, Math.floor(this.options.timeoutMs * 0.7))) {
      this.logger.info?.(logPayload, 'DexScreener chart batch fetch observed')
    } else if (shouldSample(this.fetchBatchCount, 30)) {
      this.logger.debug?.(logPayload, 'DexScreener chart batch fetch observed')
    }

    return output
  }

  private async fetchPairSnapshot(pairAddress: string, parentSignal: AbortSignal): Promise<ChartTickSample | null> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs)
    const abortOnParent = () => controller.abort()
    parentSignal.addEventListener('abort', abortOnParent, { once: true })

    try {
      const url = `https://api.dexscreener.com/latest/dex/pairs/solana/${encodeURIComponent(pairAddress)}`
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`DexScreener pair request failed with status ${response.status}`)
      }

      const payload = (await response.json()) as { pairs?: unknown }
      const pairs = Array.isArray(payload.pairs) ? payload.pairs : []
      const pair = pairs.find((entry) => isMatchingPair(entry, pairAddress)) ?? pairs[0]
      const priceUsd = readNumber((pair as Record<string, unknown> | undefined)?.priceUsd)

      if (!pair || priceUsd === null || priceUsd <= 0) {
        return null
      }

      return {
        pairAddress,
        observedAtMs: Date.now(),
        priceUsd,
        volume24h: readNestedNumber(pair, ['volume', 'h24']) ?? undefined,
      }
    } finally {
      clearTimeout(timeoutId)
      parentSignal.removeEventListener('abort', abortOnParent)
    }
  }
}

function shouldSample(counter: number, every: number): boolean {
  return counter > 0 && counter % every === 0
}

function isMatchingPair(input: unknown, pairAddress: string): boolean {
  if (!isRecord(input)) {
    return false
  }

  return input.pairAddress === pairAddress && input.chainId === 'solana'
}

function readNestedNumber(input: unknown, path: string[]): number | null {
  let current: unknown = input

  for (const key of path) {
    if (!isRecord(current)) {
      return null
    }
    current = current[key]
  }

  return readNumber(current)
}

function readNumber(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input
  }

  if (typeof input === 'string') {
    const parsed = Number.parseFloat(input)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}
