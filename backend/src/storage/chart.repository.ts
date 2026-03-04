import { OhlcCandle } from '../chart/chart.types.js'
import { PersistedCandleRow } from './storage.types.js'
import { SupabaseClient } from './supabase.client.js'

interface Logger {
  warn: (obj: unknown, msg?: string) => void
  debug?: (obj: unknown, msg?: string) => void
}

interface CandleSelectRow {
  pair_address: string
  bucket_start: string
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
  ) {}

  isEnabled(): boolean {
    return this.supabase.isEnabled()
  }

  async upsertCandles(candles: PersistedCandleRow[]): Promise<void> {
    if (!this.supabase.isEnabled() || candles.length === 0) {
      return
    }

    await this.supabase.upsertRows('token_candles_1m', candles as unknown as Record<string, unknown>[], [
      'pair_address',
      'bucket_start',
    ])
  }

  async getCandles(pairAddress: string, limit: number): Promise<OhlcCandle[]> {
    if (!this.supabase.isEnabled()) {
      return []
    }

    try {
      const rows = await this.supabase.selectRows<CandleSelectRow>('token_candles_1m', {
        select: 'pair_address,bucket_start,open,high,low,close,volume,sample_count',
        pair_address: `eq.${pairAddress}`,
        order: 'bucket_start.desc',
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
        select: 'pair_address,bucket_start,open,high,low,close,volume,sample_count',
        pair_address: `eq.${pairAddress}`,
        order: 'bucket_start.asc',
        limit: String(Math.max(1, Math.min(range.limit ?? 1000, 1000))),
      }
      if (range.fromIso && range.toIso) {
        query.and = `(bucket_start.gte.${range.fromIso},bucket_start.lte.${range.toIso})`
      } else if (range.fromIso) {
        query.bucket_start = `gte.${range.fromIso}`
      } else if (range.toIso) {
        query.bucket_start = `lte.${range.toIso}`
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

    try {
      const deleted = await this.supabase.deleteRows<Record<string, unknown>>(
        'token_candles_1m',
        {
          bucket_start: `lt.${cutoffIso}`,
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

  const output: PersistedCandleRow[] = []
  for (const candle of candles) {
    if (!isFinitePositive(candle.timeSec)) {
      continue
    }

    output.push({
      pair_address: normalizedPair,
      bucket_start: new Date(Math.floor(candle.timeSec) * 1000).toISOString(),
      open: finiteOrZero(candle.open),
      high: finiteOrZero(candle.high),
      low: finiteOrZero(candle.low),
      close: finiteOrZero(candle.close),
      volume: finiteOrZero(candle.volume),
      sample_count: 1,
    })
  }

  return output
}

function toCandle(row: CandleSelectRow): OhlcCandle | null {
  const date = Date.parse(row.bucket_start)
  if (!Number.isFinite(date) || date <= 0) {
    return null
  }

  return {
    timeSec: Math.floor(date / 1000),
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
