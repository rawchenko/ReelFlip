import { useSyncExternalStore } from 'react'
import { ChartCandle, ChartHistoryQuality, ChartStreamStatus } from '@/features/feed/chart/types'

export interface ChartPairState {
  pairAddress: string
  candles: ChartCandle[]
  latestCandle: ChartCandle | null
  status: ChartStreamStatus
  historySource: string | null
  historyQuality: ChartHistoryQuality | null
  lastUpdateTimeMs: number | null
  lastHistoryHydratedAtMs: number | null
  refCount: number
}

interface ChartPairInternalState extends ChartPairState {
  lastTouchedAtMs: number
}

interface ChartStoreSnapshot {
  pairs: ReadonlyMap<string, ChartPairInternalState>
  version: number
}

type StoreListener = () => void

const EMPTY_MAP = new Map<string, ChartPairInternalState>()
const DEFAULT_PAIR_STATE: ChartPairState = {
  pairAddress: '',
  candles: [],
  latestCandle: null,
  status: 'reconnecting',
  historySource: null,
  historyQuality: null,
  lastUpdateTimeMs: null,
  lastHistoryHydratedAtMs: null,
  refCount: 0,
}

interface HydrateHistoryMetadata {
  source?: string | null
  historyQuality?: ChartHistoryQuality | null
}

class FeedChartStore {
  private snapshot: ChartStoreSnapshot = { pairs: EMPTY_MAP, version: 0 }
  private readonly listeners = new Set<StoreListener>()

  subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): ChartStoreSnapshot => this.snapshot

  getPairState(pairAddress?: string | null): ChartPairState | null {
    if (!pairAddress) {
      return null
    }

    const state = this.snapshot.pairs.get(pairAddress)
    if (!state) {
      return null
    }

    return state
  }

  retainPair(pairAddress: string): void {
    this.updatePair(pairAddress, (current) => ({
      ...current,
      refCount: current.refCount + 1,
      lastTouchedAtMs: Date.now(),
    }))
  }

  releasePair(pairAddress: string): void {
    this.updatePair(pairAddress, (current) => ({
      ...current,
      refCount: Math.max(0, current.refCount - 1),
      lastTouchedAtMs: Date.now(),
    }))
  }

  hydrateHistory(pairAddress: string, candles: ChartCandle[], metadata?: HydrateHistoryMetadata): void {
    const sanitized = sanitizeCandles(candles)
    const now = Date.now()
    this.updatePair(pairAddress, (current) => ({
      ...current,
      candles: sanitized.slice(-240),
      latestCandle: sanitized.length > 0 ? { ...sanitized[sanitized.length - 1] } : null,
      historySource: metadata?.source ?? current.historySource,
      historyQuality: metadata?.historyQuality ?? current.historyQuality,
      lastHistoryHydratedAtMs: now,
      lastTouchedAtMs: now,
      lastUpdateTimeMs: sanitized.length > 0 ? now : current.lastUpdateTimeMs,
    }))
  }

  applyCandleUpdate(pairAddress: string, candle: ChartCandle, isNewCandle: boolean): void {
    const nextCandle = sanitizeCandle(candle)
    if (!nextCandle) {
      return
    }

    const now = Date.now()
    this.updatePair(pairAddress, (current) => {
      const candles = current.candles.length === 0 ? [] : current.candles
      const last = candles[candles.length - 1]

      if (!last) {
        const nextCandles = [nextCandle]
        return {
          ...current,
          candles: nextCandles,
          latestCandle: { ...nextCandle },
          lastUpdateTimeMs: now,
          lastTouchedAtMs: now,
        }
      }

      if (isNewCandle || nextCandle.time > last.time) {
        candles.push(nextCandle)
        if (candles.length > 240) {
          candles.splice(0, candles.length - 240)
        }
      } else if (nextCandle.time === last.time) {
        candles[candles.length - 1] = nextCandle
      } else {
        return current
      }

      return {
        ...current,
        candles,
        latestCandle: { ...nextCandle },
        lastUpdateTimeMs: now,
        lastTouchedAtMs: now,
      }
    })
  }

  setStatus(pairAddress: string, status: ChartStreamStatus): void {
    const now = Date.now()
    this.updatePair(pairAddress, (current) => {
      if (current.status === status) {
        return {
          ...current,
          lastTouchedAtMs: now,
        }
      }

      return {
        ...current,
        status,
        lastTouchedAtMs: now,
      }
    })
  }

  pruneInactive(maxIdleMs = 120_000): void {
    const now = Date.now()
    let changed = false
    const nextPairs = new Map(this.snapshot.pairs)

    for (const [pairAddress, state] of nextPairs.entries()) {
      if (state.refCount > 0) {
        continue
      }

      if (now - state.lastTouchedAtMs <= maxIdleMs) {
        continue
      }

      nextPairs.delete(pairAddress)
      changed = true
    }

    if (!changed) {
      return
    }

    this.snapshot = {
      pairs: nextPairs,
      version: this.snapshot.version + 1,
    }
    this.emit()
  }

  private updatePair(
    pairAddress: string,
    updater: (current: ChartPairInternalState) => ChartPairInternalState,
  ): void {
    const now = Date.now()
    const current =
      this.snapshot.pairs.get(pairAddress) ??
      ({
        ...DEFAULT_PAIR_STATE,
        pairAddress,
        lastTouchedAtMs: now,
      } satisfies ChartPairInternalState)

    const updated = updater(current)
    if (updated === current) {
      return
    }

    const nextPairs = new Map(this.snapshot.pairs)
    nextPairs.set(pairAddress, updated)
    this.snapshot = {
      pairs: nextPairs,
      version: this.snapshot.version + 1,
    }
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export const feedChartStore = new FeedChartStore()

export function useChartPairState(pairAddress?: string | null): ChartPairState | null {
  const snapshot = useSyncExternalStore(feedChartStore.subscribe, feedChartStore.getSnapshot, feedChartStore.getSnapshot)
  if (!pairAddress) {
    return null
  }

  return snapshot.pairs.get(pairAddress) ?? null
}

export function getChartPairState(pairAddress?: string | null): ChartPairState | null {
  return feedChartStore.getPairState(pairAddress)
}

function sanitizeCandles(candles: ChartCandle[]): ChartCandle[] {
  const output: ChartCandle[] = []
  for (const candle of candles) {
    const sanitized = sanitizeCandle(candle)
    if (sanitized) {
      output.push(sanitized)
    }
  }
  return output
}

function sanitizeCandle(candle: ChartCandle): ChartCandle | null {
  if (
    !Number.isFinite(candle.time) ||
    !Number.isFinite(candle.open) ||
    !Number.isFinite(candle.high) ||
    !Number.isFinite(candle.low) ||
    !Number.isFinite(candle.close) ||
    candle.time <= 0 ||
    candle.open <= 0 ||
    candle.high <= 0 ||
    candle.low <= 0 ||
    candle.close <= 0
  ) {
    return null
  }

  return {
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    ...(typeof candle.volume === 'number' && Number.isFinite(candle.volume) ? { volume: candle.volume } : {}),
  }
}
