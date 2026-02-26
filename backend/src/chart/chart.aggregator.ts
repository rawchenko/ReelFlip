import { ChartTickSample, OhlcCandle } from './chart.types.js'

export interface AggregatorUpdate {
  candle: OhlcCandle
  isNewCandle: boolean
}

interface PairSeriesState {
  candles: OhlcCandle[]
  lastObservedAtMs: number | null
  lastAcceptedAtMs: number | null
}

export class ChartAggregator {
  private readonly pairState = new Map<string, PairSeriesState>()

  constructor(private readonly historyLimit: number) {}

  applySample(sample: ChartTickSample): AggregatorUpdate | null {
    if (!isValidSample(sample)) {
      return null
    }

    const state = this.getOrCreatePairState(sample.pairAddress)

    if (state.lastObservedAtMs !== null && sample.observedAtMs < state.lastObservedAtMs) {
      return null
    }

    state.lastObservedAtMs = sample.observedAtMs

    const bucketTimeSec = Math.floor(sample.observedAtMs / 60_000) * 60
    const lastCandle = state.candles[state.candles.length - 1]

    if (!lastCandle || bucketTimeSec > lastCandle.timeSec) {
      const candle: OhlcCandle = {
        timeSec: bucketTimeSec,
        open: sample.priceUsd,
        high: sample.priceUsd,
        low: sample.priceUsd,
        close: sample.priceUsd,
      }

      state.candles.push(candle)
      trimToLimit(state.candles, this.historyLimit)
      state.lastAcceptedAtMs = sample.observedAtMs

      return { candle, isNewCandle: true }
    }

    if (bucketTimeSec < lastCandle.timeSec) {
      return null
    }

    lastCandle.high = Math.max(lastCandle.high, sample.priceUsd)
    lastCandle.low = Math.min(lastCandle.low, sample.priceUsd)
    lastCandle.close = sample.priceUsd
    state.lastAcceptedAtMs = sample.observedAtMs

    return { candle: lastCandle, isNewCandle: false }
  }

  getCandles(pairAddress: string, limit?: number): OhlcCandle[] {
    const candles = this.pairState.get(pairAddress)?.candles ?? []
    if (!limit || limit >= candles.length) {
      return candles.map(cloneCandle)
    }

    return candles.slice(-limit).map(cloneCandle)
  }

  getLastObservedAtMs(pairAddress: string): number | null {
    return this.pairState.get(pairAddress)?.lastObservedAtMs ?? null
  }

  hasPair(pairAddress: string): boolean {
    return (this.pairState.get(pairAddress)?.candles.length ?? 0) > 0
  }

  private getOrCreatePairState(pairAddress: string): PairSeriesState {
    const existing = this.pairState.get(pairAddress)
    if (existing) {
      return existing
    }

    const state: PairSeriesState = {
      candles: [],
      lastObservedAtMs: null,
      lastAcceptedAtMs: null,
    }
    this.pairState.set(pairAddress, state)
    return state
  }
}

function trimToLimit(candles: OhlcCandle[], limit: number): void {
  if (candles.length <= limit) {
    return
  }

  candles.splice(0, candles.length - limit)
}

function cloneCandle(candle: OhlcCandle): OhlcCandle {
  return { ...candle }
}

function isValidSample(sample: ChartTickSample): boolean {
  return (
    typeof sample.pairAddress === 'string' &&
    sample.pairAddress.length > 0 &&
    Number.isFinite(sample.observedAtMs) &&
    sample.observedAtMs > 0 &&
    Number.isFinite(sample.priceUsd) &&
    sample.priceUsd > 0
  )
}
