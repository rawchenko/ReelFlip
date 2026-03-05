import { useSyncExternalStore } from 'react'
import { ChartHistoryQuality, ChartPoint, ChartStreamStatus } from '@/features/feed/chart/types'

const MAX_POINTS_PER_PAIR = 360

export interface ChartPairState {
  pairAddress: string
  points: ChartPoint[]
  latestPoint: ChartPoint | null
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
  points: [],
  latestPoint: null,
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

  hydrateHistory(pairAddress: string, points: ChartPoint[], metadata?: HydrateHistoryMetadata): void {
    const sanitized = sanitizePoints(points)
    const now = Date.now()
    this.updatePair(pairAddress, (current) => ({
      ...current,
      points: sanitized.slice(-MAX_POINTS_PER_PAIR),
      latestPoint: sanitized.length > 0 ? { ...sanitized[sanitized.length - 1] } : null,
      historySource: metadata?.source ?? current.historySource,
      historyQuality: metadata?.historyQuality ?? current.historyQuality,
      lastHistoryHydratedAtMs: now,
      lastTouchedAtMs: now,
      lastUpdateTimeMs: sanitized.length > 0 ? now : current.lastUpdateTimeMs,
    }))
  }

  applyPointUpdate(pairAddress: string, point: ChartPoint, isNewPoint: boolean): void {
    const nextPoint = sanitizePoint(point)
    if (!nextPoint) {
      return
    }

    const now = Date.now()
    this.updatePair(pairAddress, (current) => {
      const points = current.points.length === 0 ? [] : current.points
      const last = points[points.length - 1]

      if (!last) {
        const nextPoints = [nextPoint]
        return {
          ...current,
          points: nextPoints,
          latestPoint: { ...nextPoint },
          lastUpdateTimeMs: now,
          lastTouchedAtMs: now,
        }
      }

      if (isNewPoint || nextPoint.time > last.time) {
        points.push(nextPoint)
        if (points.length > MAX_POINTS_PER_PAIR) {
          points.splice(0, points.length - MAX_POINTS_PER_PAIR)
        }
      } else if (nextPoint.time === last.time) {
        points[points.length - 1] = nextPoint
      } else {
        return current
      }

      return {
        ...current,
        points,
        latestPoint: { ...nextPoint },
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

function sanitizePoints(points: ChartPoint[]): ChartPoint[] {
  const output: ChartPoint[] = []
  for (const point of points) {
    const sanitized = sanitizePoint(point)
    if (sanitized) {
      output.push(sanitized)
    }
  }
  return output
}

function sanitizePoint(point: ChartPoint): ChartPoint | null {
  if (!Number.isFinite(point.time) || !Number.isFinite(point.value) || point.time <= 0 || point.value <= 0) {
    return null
  }

  return {
    time: point.time,
    value: point.value,
  }
}
