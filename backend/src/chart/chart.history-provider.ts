import { OhlcCandle } from './chart.types.js'

export interface HistoricalCandleProviderFetchParams {
  pairAddress: string
  limit: number
  endTimeSec?: number
  signal: AbortSignal
}

export interface HistoricalCandleProvider {
  readonly name: string
  fetch1mCandles(params: HistoricalCandleProviderFetchParams): Promise<OhlcCandle[]>
}

export class NoopHistoricalCandleProvider implements HistoricalCandleProvider {
  readonly name = 'none'

  async fetch1mCandles(_params: HistoricalCandleProviderFetchParams): Promise<OhlcCandle[]> {
    return []
  }
}

export function normalizeHistoricalCandles(candles: OhlcCandle[], max = 240): OhlcCandle[] {
  const byTime = new Map<number, OhlcCandle>()

  for (const candle of candles) {
    if (!isValidCandle(candle)) {
      continue
    }

    byTime.set(candle.timeSec, {
      timeSec: Math.floor(candle.timeSec),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      ...(typeof candle.volume === 'number' && Number.isFinite(candle.volume) ? { volume: candle.volume } : {}),
    })
  }

  const sorted = Array.from(byTime.values()).sort((left, right) => left.timeSec - right.timeSec)
  if (sorted.length <= max) {
    return sorted
  }

  return sorted.slice(-max)
}

function isValidCandle(candle: OhlcCandle): boolean {
  return (
    Number.isFinite(candle.timeSec) &&
    candle.timeSec > 0 &&
    Number.isFinite(candle.open) &&
    candle.open > 0 &&
    Number.isFinite(candle.high) &&
    candle.high > 0 &&
    Number.isFinite(candle.low) &&
    candle.low > 0 &&
    Number.isFinite(candle.close) &&
    candle.close > 0
  )
}
