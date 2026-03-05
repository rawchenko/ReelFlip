import { OhlcCandle } from '../chart/chart.types.js'
import { PersistedCandleRow } from './storage.types.js'
import { SupabaseClient } from './supabase.client.js'

interface Logger {
  warn: (obj: unknown, msg?: string) => void
  debug?: (obj: unknown, msg?: string) => void
}

interface ChartRepositoryOptions {
  onRowsWritten?: (tableOrView: string, rowCount: number) => void
}

interface CandleSelectRow {
  pair_address: string
  time_sec: number | string
  open: number | string
  high: number | string
  low: number | string
  close: number | string
  volume: number | string
  sample_count: number
}

export interface CandleRangeQuery {
  fromIso?: string
  toIso?: string
  limit?: number
}

export class ChartRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: Logger,
    private readonly options: ChartRepositoryOptions = {},
  ) {}

  isEnabled(): boolean {
    return this.supabase.isEnabled()
  }

  async upsertCandles(candles: PersistedCandleRow[]): Promise<void> {
    if (!this.supabase.isEnabled() || candles.length === 0) {
      return
    }

    try {
      await this.supabase.upsertRows('token_candles_1m', candles as unknown as Record<string, unknown>[], [
        'pair_address',
        'time_sec',
      ])
      this.options.onRowsWritten?.('token_candles_1m', candles.length)
    } catch (error) {
      if (isCandlePairForeignKeyViolation(error)) {
        const distinctPairs = new Set(candles.map((candle) => candle.pair_address))
        this.logger.warn(
          {
            error,
            candleCount: candles.length,
            pairCount: distinctPairs.size,
            pairSample: Array.from(distinctPairs).slice(0, 5),
          },
          'Skipped candle upsert due to missing token_pairs parent row',
        )
        return
      }
      throw error
    }
  }

  async getCandles(pairAddress: string, limit: number): Promise<OhlcCandle[]> {
    if (!this.supabase.isEnabled()) {
      return []
    }

    try {
      const rows = await this.supabase.selectRows<CandleSelectRow>('token_candles_1m', {
        select: 'pair_address,time_sec,open,high,low,close,volume,sample_count',
        pair_address: `eq.${pairAddress}`,
        order: 'time_sec.desc',
        limit: String(Math.max(1, Math.min(limit, 1000))),
      })

      const candles = rows
        .map((row) => toCandle(row))
        .filter((row): row is OhlcCandle => row !== null)
        .sort((left, right) => left.timeSec - right.timeSec)

      return candles
    } catch (error) {
      this.logger.warn({ error, pairAddress }, 'Failed to read candles from Supabase')
      return []
    }
  }

  async getCandlesByRange(pairAddress: string, range: CandleRangeQuery): Promise<OhlcCandle[]> {
    if (!this.supabase.isEnabled()) {
      return []
    }

    try {
      const query: Record<string, string | undefined> = {
        select: 'pair_address,time_sec,open,high,low,close,volume,sample_count',
        pair_address: `eq.${pairAddress}`,
        order: 'time_sec.asc',
        limit: String(Math.max(1, Math.min(range.limit ?? 1000, 1000))),
      }
      const fromTimeSec = parseIsoToEpochSec(range.fromIso)
      const toTimeSec = parseIsoToEpochSec(range.toIso)
      if (fromTimeSec !== null && toTimeSec !== null) {
        query.and = `(time_sec.gte.${fromTimeSec},time_sec.lte.${toTimeSec})`
      } else if (fromTimeSec !== null) {
        query.time_sec = `gte.${fromTimeSec}`
      } else if (toTimeSec !== null) {
        query.time_sec = `lte.${toTimeSec}`
      }

      const rows = await this.supabase.selectRows<CandleSelectRow>('token_candles_1m', {
        ...query,
      })

      return rows.map((row) => toCandle(row)).filter((row): row is OhlcCandle => row !== null)
    } catch (error) {
      this.logger.warn({ error, pairAddress, range }, 'Failed to read candle range from Supabase')
      return []
    }
  }

  async pruneOldCandles(cutoffIso: string): Promise<number> {
    if (!this.supabase.isEnabled()) {
      return 0
    }
    const cutoffTimeSec = parseIsoToEpochSec(cutoffIso)
    if (cutoffTimeSec === null) {
      this.logger.warn({ cutoffIso }, 'Skipping candle prune due to invalid cutoff ISO')
      return 0
    }

    try {
      const deleted = await this.supabase.deleteRows<Record<string, unknown>>(
        'token_candles_1m',
        {
          time_sec: `lt.${cutoffTimeSec}`,
        },
        'representation',
      )
      this.logger.debug?.({ deletedCount: deleted.length, cutoffIso }, 'Pruned old candles from Supabase')
      return deleted.length
    } catch (error) {
      this.logger.warn({ error, cutoffIso }, 'Failed to prune old candles from Supabase')
      return 0
    }
  }
}

export function toPersistedCandles(pairAddress: string, candles: OhlcCandle[]): PersistedCandleRow[] {
  const normalizedPair = pairAddress.trim()
  if (normalizedPair.length === 0) {
    return []
  }
  const persistedAt = new Date().toISOString()

  const output: PersistedCandleRow[] = []
  for (const candle of candles) {
    if (!isFinitePositive(candle.timeSec)) {
      continue
    }

    output.push({
      pair_address: normalizedPair,
      time_sec: Math.floor(candle.timeSec),
      open: finiteOrZero(candle.open),
      high: finiteOrZero(candle.high),
      low: finiteOrZero(candle.low),
      close: finiteOrZero(candle.close),
      volume: finiteOrZero(candle.volume),
      sample_count: 1,
      source: 'runtime_aggregator',
      updated_at: persistedAt,
      ingested_at: persistedAt,
    })
  }

  return output
}

function toCandle(row: CandleSelectRow): OhlcCandle | null {
  const timeSec = readEpochSeconds(row.time_sec)
  if (timeSec === null) {
    return null
  }

  return {
    timeSec,
    open: finiteOrZero(row.open),
    high: finiteOrZero(row.high),
    low: finiteOrZero(row.low),
    close: finiteOrZero(row.close),
    volume: finiteOrZero(row.volume),
  }
}

function isFinitePositive(input: unknown): input is number {
  return typeof input === 'number' && Number.isFinite(input) && input > 0
}

function finiteOrZero(input: unknown): number {
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

function parseIsoToEpochSec(input: string | undefined): number | null {
  if (!input) {
    return null
  }
  const millis = Date.parse(input)
  if (!Number.isFinite(millis) || millis <= 0) {
    return null
  }
  return Math.floor(millis / 1000)
}

function readEpochSeconds(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
    return Math.floor(input)
  }

  if (typeof input === 'string') {
    const parsed = Number.parseInt(input, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return null
}

function isCandlePairForeignKeyViolation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('token_candles_1m_pair_address_fkey') ||
    message.includes('sqlstate 23503') ||
    message.includes('sqlstate: 23503') ||
    (message.includes('foreign key') &&
      message.includes('token_candles_1m') &&
      message.includes('pair_address'))
  )
}
