import { ChartHistoryCache } from './chart.history-cache.js'
import { HistoricalCandleProvider } from './chart.history-provider.js'
import { ChartRegistry } from './chart.registry.js'
import { ChartRepository, toPersistedCandles } from '../storage/chart.repository.js'
import {
  ChartBatchHistoryPairResult,
  ChartBatchHistoryResponse,
  ChartCandleDto,
  ChartHistoryQuality,
  ChartHistoryResponse,
  ChartInterval,
  OhlcCandle,
  fromChartCandleDto,
  toChartCandleDto,
} from './chart.types.js'

interface Logger {
  info?: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
  debug?: (obj: unknown, msg?: string) => void
}

export interface ChartHistoryServiceOptions {
  historyLimit: number
  bootstrapLimit: number
  batchMaxPairs: number
  backfillEnabled: boolean
  backfillConcurrency: number
  warmupTopPairs: number
  chartRepository?: ChartRepository
  readThroughEnabled?: boolean
  preferSupabaseRead?: boolean
  writeThroughEnabled?: boolean
}

interface PairHistoryResolved {
  pairAddress: string
  delayed: boolean
  status: ChartBatchHistoryPairResult['status']
  source: string
  historyQuality: ChartHistoryQuality
  candles: ChartCandleDto[]
}

export class ChartHistoryService {
  private readonly backfillInFlight = new Map<string, Promise<void>>()
  private readonly chartRepository?: ChartRepository
  private readonly readThroughEnabled: boolean
  private readonly preferSupabaseRead: boolean
  private readonly writeThroughEnabled: boolean

  constructor(
    private readonly chartRegistry: ChartRegistry,
    private readonly historyCache: ChartHistoryCache,
    private readonly historicalProvider: HistoricalCandleProvider,
    private readonly options: ChartHistoryServiceOptions,
    private readonly logger: Logger,
  ) {
    this.chartRepository = options.chartRepository
    this.readThroughEnabled = options.readThroughEnabled ?? false
    this.preferSupabaseRead = options.preferSupabaseRead ?? false
    this.writeThroughEnabled = options.writeThroughEnabled ?? false
  }

  getBatchMaxPairs(): number {
    return this.options.batchMaxPairs
  }

  getDefaultBootstrapLimit(): number {
    return this.options.bootstrapLimit
  }

  async getPairHistory(pairAddress: string, limit: number, interval: ChartInterval = '1m'): Promise<ChartHistoryResponse> {
    const resolved = await this.resolvePairHistory(pairAddress, limit, interval)
    return {
      pairAddress,
      interval,
      generatedAt: new Date().toISOString(),
      source: resolved.source,
      delayed: resolved.delayed,
      historyQuality: resolved.historyQuality,
      candles: resolved.candles,
    }
  }

  async getBatchHistory(
    pairAddresses: string[],
    limit: number,
    interval: ChartInterval = '1m',
  ): Promise<ChartBatchHistoryResponse> {
    const deduped = Array.from(new Set(pairAddresses.map((pair) => pair.trim()).filter((pair) => pair.length > 0)))
    const bounded = deduped.slice(0, this.options.batchMaxPairs)

    const startedAtMs = Date.now()
    const results = await mapWithConcurrency(
      bounded,
      Math.max(1, this.options.backfillConcurrency),
      async (pairAddress) => {
        const resolved = await this.resolvePairHistory(pairAddress, limit, interval)
        const result: ChartBatchHistoryPairResult = {
          pairAddress,
          delayed: resolved.delayed,
          status: resolved.status,
          source: resolved.source,
          historyQuality: resolved.historyQuality,
          candles: resolved.candles,
        }
        return result
      },
    )

    this.logger.info?.(
      {
        pairCount: bounded.length,
        limit,
        durationMs: Date.now() - startedAtMs,
        unavailableCount: results.filter((result) => result.historyQuality === 'unavailable').length,
        partialCount: results.filter((result) => result.historyQuality === 'partial').length,
      },
      'Chart batch history request completed',
    )

    return {
      interval,
      generatedAt: new Date().toISOString(),
      results,
    }
  }

  warmupPairs(pairAddresses: string[]): void {
    const deduped = Array.from(new Set(pairAddresses.map((pair) => pair.trim()).filter((pair) => pair.length > 0))).slice(
      0,
      this.options.warmupTopPairs,
    )
    if (deduped.length === 0) {
      return
    }

    void mapWithConcurrency(deduped, Math.max(1, this.options.backfillConcurrency), async (pairAddress) => {
      try {
        await this.resolvePairHistory(pairAddress, this.options.bootstrapLimit, '1m')
      } catch (error) {
        this.logger.debug?.({ error, pairAddress }, 'Chart history warmup failed')
      }
    })
      .then(() => {
        this.logger.debug?.({ pairCount: deduped.length }, 'Chart history warmup completed')
      })
      .catch((error) => {
        this.logger.debug?.({ error, pairCount: deduped.length }, 'Chart history warmup failed')
      })
  }

  private async resolvePairHistory(
    pairAddress: string,
    limit: number,
    interval: ChartInterval,
  ): Promise<PairHistoryResolved> {
    const boundedLimit = Math.max(1, Math.min(limit, this.options.historyLimit))

    try {
      await this.chartRegistry.ensurePairSeeded(pairAddress)
    } catch (error) {
      this.logger.debug?.({ error, pairAddress }, 'Chart registry seed failed before history resolve')
    }

    const runtimeSnapshot = this.chartRegistry.getPairSnapshot(pairAddress, this.options.historyLimit, interval)
    const runtimeCandles = runtimeSnapshot.candles.map(fromChartCandleDto)

    const shouldReadThroughFromSupabase =
      interval === '1m' && this.readThroughEnabled && this.chartRepository?.isEnabled()
    const supabaseChartRepository = shouldReadThroughFromSupabase ? this.chartRepository : null
    if (supabaseChartRepository && this.preferSupabaseRead) {
      const storedCandles = await supabaseChartRepository.getCandles(pairAddress, boundedLimit)
      if (storedCandles.length > 0) {
        await this.historyCache.writeHistorical(pairAddress, storedCandles, interval)
      }
    }

    let cacheRead = await this.historyCache.readPair(pairAddress, interval)
    if (
      supabaseChartRepository &&
      !this.preferSupabaseRead &&
      (cacheRead.entry?.candles.length ?? 0) < boundedLimit
    ) {
      const storedCandles = await supabaseChartRepository.getCandles(pairAddress, boundedLimit)
      if (storedCandles.length > 0) {
        await this.historyCache.writeHistorical(pairAddress, storedCandles, interval)
        cacheRead = await this.historyCache.readPair(pairAddress, interval)
      }
    }
    const cacheHasEnough = (cacheRead.entry?.candles.length ?? 0) >= boundedLimit && (cacheRead.entry?.hasHistoricalBackfill ?? false)
    const runtimeHasEnough = runtimeCandles.length >= boundedLimit
    let backfillHappened = false

    if (interval === '1m' && this.options.backfillEnabled && !cacheHasEnough && !runtimeHasEnough) {
      backfillHappened = await this.backfillPairHistory(pairAddress, boundedLimit)
      cacheRead = await this.historyCache.readPair(pairAddress, interval)
    }

    const cacheCandles = cacheRead.entry?.candles ?? []
    const merged = mergeWithRuntime(cacheCandles, runtimeCandles, this.options.historyLimit).slice(-boundedLimit)
    const historyQuality = classifyHistoryQuality({
      requestedLimit: boundedLimit,
      mergedCount: merged.length,
      cacheEntryExists: Boolean(cacheRead.entry),
      cacheHasHistoricalBackfill: cacheRead.entry?.hasHistoricalBackfill ?? false,
      runtimeCount: runtimeCandles.length,
    })

    const source =
      backfillHappened && merged.length > 0
        ? 'historical_provider'
        : cacheRead.storage !== 'miss'
          ? cacheRead.storage
          : merged.length > 0
            ? 'runtime_aggregator'
            : 'runtime_aggregator'

    if (interval === '1m' && merged.length > 0 && this.writeThroughEnabled && this.chartRepository?.isEnabled()) {
      void this.chartRepository
        .upsertCandles(toPersistedCandles(pairAddress, merged))
        .catch((error) =>
          this.logger.warn({ error, pairAddress, candleCount: merged.length }, 'Chart Supabase write-through failed'),
        )
    }

    return {
      pairAddress,
      delayed: runtimeSnapshot.delayed,
      status: runtimeSnapshot.status,
      source,
      historyQuality,
      candles: merged.map(toChartCandleDto),
    }
  }

  private async backfillPairHistory(pairAddress: string, limit: number): Promise<boolean> {
    const existing = this.backfillInFlight.get(pairAddress)
    if (existing) {
      await existing
      const read = await this.historyCache.readPair(pairAddress)
      return Boolean(read.entry?.hasHistoricalBackfill && (read.entry.candles.length ?? 0) > 0)
    }

    let wroteAny = false
    const pending = (async () => {
      const controller = new AbortController()
      const candles = await this.historicalProvider.fetch1mCandles({
        pairAddress,
        limit,
        signal: controller.signal,
      })

      if (candles.length === 0) {
        return
      }

      const entry = await this.historyCache.writeHistorical(pairAddress, candles, '1m')
      wroteAny = Boolean(entry && entry.candles.length > 0)
    })()
      .catch((error) => {
        this.logger.warn({ error, pairAddress }, 'Chart historical backfill failed')
      })
      .finally(() => {
        this.backfillInFlight.delete(pairAddress)
      })

    this.backfillInFlight.set(pairAddress, pending)
    await pending
    return wroteAny
  }
}

function classifyHistoryQuality(input: {
  requestedLimit: number
  mergedCount: number
  cacheEntryExists: boolean
  cacheHasHistoricalBackfill: boolean
  runtimeCount: number
}): ChartHistoryQuality {
  if (input.mergedCount <= 0) {
    return 'unavailable'
  }

  if (input.cacheHasHistoricalBackfill) {
    return input.mergedCount >= input.requestedLimit ? 'real_backfill' : 'partial'
  }

  if (input.runtimeCount > 0) {
    return 'runtime_only'
  }

  return input.cacheEntryExists ? 'partial' : 'unavailable'
}

function mergeWithRuntime(cacheCandles: OhlcCandle[], runtimeCandles: OhlcCandle[], maxCandles: number): OhlcCandle[] {
  const byTime = new Map<number, OhlcCandle>()

  for (const candle of cacheCandles) {
    byTime.set(candle.timeSec, { ...candle })
  }

  for (const candle of runtimeCandles) {
    byTime.set(candle.timeSec, { ...candle })
  }

  const merged = Array.from(byTime.values()).sort((left, right) => left.timeSec - right.timeSec)
  if (merged.length <= maxCandles) {
    return merged
  }
  return merged.slice(-maxCandles)
}

async function mapWithConcurrency<TInput, TOutput>(
  values: TInput[],
  concurrency: number,
  mapper: (value: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (values.length === 0) {
    return []
  }

  const output = new Array<TOutput>(values.length)
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = nextIndex
      if (index >= values.length) {
        return
      }
      nextIndex += 1
      const value = values[index]
      if (value === undefined) {
        return
      }
      output[index] = await mapper(value, index)
    }
  })

  await Promise.all(workers)
  return output
}
