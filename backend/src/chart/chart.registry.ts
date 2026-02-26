import { ChartAggregator } from './chart.aggregator.js'
import {
  ChartCandleDto,
  ChartProvider,
  ChartStreamEvent,
  ChartStreamStatus,
  OhlcCandle,
  toChartCandleDto,
} from './chart.types.js'

interface Logger {
  info?: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
  debug?: (obj: unknown, msg?: string) => void
}

export interface ChartRegistryOptions {
  enabled: boolean
  pollIntervalMs: number
  historyLimit: number
  staleAfterMs: number
  pairIdleTtlMs: number
  maxPairsPerStream: number
  maxActivePairsGlobal: number
}

interface PairRuntimeState {
  subscribers: number
  lastSubscriberSeenAtMs: number | null
  lastPollAttemptAtMs: number | null
  lastSuccessAtMs: number | null
  status: ChartStreamStatus
  statusReason?: string
}

interface FetchAndApplyStats {
  requestedPairCount: number
  sampleCount: number
  emittedCandleUpdateCount: number
  missingPairCount: number
}

export interface ChartPairSnapshot {
  pairAddress: string
  candles: ChartCandleDto[]
  delayed: boolean
  status: ChartStreamStatus
  statusReason?: string
}

export class ChartRegistry {
  private readonly aggregator: ChartAggregator
  private readonly pairState = new Map<string, PairRuntimeState>()
  private readonly pairListeners = new Map<string, Set<ChartStreamListener>>()
  private readonly seedPromises = new Map<string, Promise<void>>()
  private pollCycleCount = 0
  private emittedCandleUpdateCount = 0
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private pollInFlight = false
  private closed = false

  constructor(
    private readonly provider: ChartProvider,
    private readonly options: ChartRegistryOptions,
    private readonly logger: Logger,
  ) {
    this.aggregator = new ChartAggregator(options.historyLimit)

    if (options.enabled) {
      this.pollTimer = setInterval(() => {
        void this.runPollCycle()
      }, Math.max(250, options.pollIntervalMs))
      this.pollTimer.unref?.()
    }
  }

  isEnabled(): boolean {
    return this.options.enabled
  }

  getOptions(): ChartRegistryOptions {
    return this.options
  }

  async close(): Promise<void> {
    this.closed = true
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  subscribe(pairAddresses: string[], listener: ChartStreamListener): () => void {
    const now = Date.now()

    for (const pairAddress of pairAddresses) {
      const state = this.getOrCreatePairState(pairAddress)
      state.subscribers += 1
      state.lastSubscriberSeenAtMs = now

      let listeners = this.pairListeners.get(pairAddress)
      if (!listeners) {
        listeners = new Set()
        this.pairListeners.set(pairAddress, listeners)
      }
      listeners.add(listener)
    }

    void this.runPollCycle()

    let unsubscribed = false
    return () => {
      if (unsubscribed) {
        return
      }
      unsubscribed = true

      const leftAt = Date.now()
      for (const pairAddress of pairAddresses) {
        const state = this.getOrCreatePairState(pairAddress)
        state.subscribers = Math.max(0, state.subscribers - 1)
        state.lastSubscriberSeenAtMs = leftAt

        const listeners = this.pairListeners.get(pairAddress)
        if (!listeners) {
          continue
        }
        listeners.delete(listener)
        if (listeners.size === 0) {
          this.pairListeners.delete(pairAddress)
        }
      }
    }
  }

  async ensurePairSeeded(pairAddress: string): Promise<void> {
    if (this.aggregator.hasPair(pairAddress)) {
      return
    }

    const existing = this.seedPromises.get(pairAddress)
    if (existing) {
      await existing
      return
    }

    const pending = this.fetchAndApplySamples([pairAddress], 'seed')
      .then(() => undefined)
      .finally(() => {
        this.seedPromises.delete(pairAddress)
      })

    this.seedPromises.set(pairAddress, pending)
    await pending
  }

  getPairSnapshot(pairAddress: string, limit: number): ChartPairSnapshot {
    const now = Date.now()
    this.updatePairFreshnessState(pairAddress, now)

    const state = this.getOrCreatePairState(pairAddress)
    const candles = this.aggregator.getCandles(pairAddress, limit).map(toChartCandleDto)

    return {
      pairAddress,
      candles,
      delayed: this.isPairDelayed(pairAddress, now),
      status: state.status,
      ...(state.statusReason ? { statusReason: state.statusReason } : {}),
    }
  }

  buildSnapshotEvent(pairAddress: string, limit: number): ChartStreamEvent | null {
    const snapshot = this.getPairSnapshot(pairAddress, limit)
    if (snapshot.candles.length === 0) {
      return null
    }

    return {
      type: 'snapshot',
      pairAddress,
      interval: '1m',
      delayed: snapshot.delayed,
      candles: snapshot.candles,
      serverTime: new Date().toISOString(),
    }
  }

  buildStatusEvent(pairAddress: string): ChartStreamEvent {
    const state = this.getOrCreatePairState(pairAddress)
    return {
      type: 'status',
      pairAddress,
      status: state.status,
      ...(state.statusReason ? { reason: state.statusReason } : {}),
      serverTime: new Date().toISOString(),
    }
  }

  private async runPollCycle(): Promise<void> {
    if (!this.options.enabled || this.closed || this.pollInFlight) {
      return
    }

    const now = Date.now()
    this.pruneIdlePairListeners(now)
    this.refreshStaleStatuses(now)

    const pollPairs = this.collectPollPairs(now)
    if (pollPairs.length === 0) {
      return
    }

    this.pollInFlight = true
    const startedAtMs = Date.now()
    try {
      const stats = await this.fetchAndApplySamples(pollPairs, 'poll')
      this.refreshStaleStatuses(Date.now())
      this.pollCycleCount += 1
      const durationMs = Date.now() - startedAtMs
      const payload = {
        cycle: this.pollCycleCount,
        durationMs,
        pollPairCount: pollPairs.length,
        sampleCount: stats.sampleCount,
        emittedCandleUpdateCount: stats.emittedCandleUpdateCount,
        missingPairCount: stats.missingPairCount,
      }
      if (durationMs > Math.max(this.options.pollIntervalMs * 2, 1_500) || stats.missingPairCount > 0) {
        this.logger.info?.(payload, 'Chart poll cycle observed')
      } else if (shouldSample(this.pollCycleCount, 20)) {
        this.logger.debug?.(payload, 'Chart poll cycle observed')
      }
    } catch (error) {
      for (const pairAddress of pollPairs) {
        this.updateStatus(pairAddress, 'reconnecting', getErrorMessage(error))
      }
      this.logger.warn({ error, pairCount: pollPairs.length }, 'Chart poll cycle failed')
    } finally {
      this.pollInFlight = false
    }
  }

  private async fetchAndApplySamples(pairAddresses: string[], reason: 'poll' | 'seed'): Promise<FetchAndApplyStats> {
    const controller = new AbortController()
    const startedAt = Date.now()

    for (const pairAddress of pairAddresses) {
      const state = this.getOrCreatePairState(pairAddress)
      state.lastPollAttemptAtMs = startedAt
    }

    const samples = await this.provider.fetchPairSnapshots(pairAddresses, controller.signal)
    const seenPairs = new Set<string>()
    let emittedCandleUpdateCount = 0

    for (const sample of samples) {
      seenPairs.add(sample.pairAddress)
      const state = this.getOrCreatePairState(sample.pairAddress)
      const update = this.aggregator.applySample(sample)

      if (!update) {
        continue
      }

      state.lastSuccessAtMs = sample.observedAtMs
      this.updateStatus(sample.pairAddress, 'live')

      this.emitToPair(sample.pairAddress, {
        type: 'candle_update',
        pairAddress: sample.pairAddress,
        interval: '1m',
        delayed: this.isPairDelayed(sample.pairAddress, sample.observedAtMs),
        candle: toChartCandleDto(update.candle),
        isNewCandle: update.isNewCandle,
        serverTime: new Date().toISOString(),
      })
      emittedCandleUpdateCount += 1
      this.emittedCandleUpdateCount += 1

      const observedAgeMs = Math.max(0, Date.now() - sample.observedAtMs)
      if (observedAgeMs >= 2_000 || shouldSample(this.emittedCandleUpdateCount, 50)) {
        this.logger.debug?.(
          {
            pairAddress: sample.pairAddress,
            observedAgeMs,
            isNewCandle: update.isNewCandle,
            reason,
            sampleAgeAtPollStartMs: Math.max(0, startedAt - sample.observedAtMs),
          },
          'Chart candle update emitted',
        )
      }
    }

    for (const pairAddress of pairAddresses) {
      if (seenPairs.has(pairAddress)) {
        continue
      }

      if (reason === 'seed') {
        this.updateStatus(pairAddress, 'reconnecting', 'no_snapshot')
      } else {
        this.updatePairFreshnessState(pairAddress, Date.now(), 'no_snapshot')
      }
    }

    return {
      requestedPairCount: pairAddresses.length,
      sampleCount: samples.length,
      emittedCandleUpdateCount,
      missingPairCount: Math.max(0, pairAddresses.length - seenPairs.size),
    }
  }

  private collectPollPairs(now: number): string[] {
    const output: string[] = []

    for (const [pairAddress, state] of this.pairState.entries()) {
      const hasSubscribers = state.subscribers > 0
      const recentlySubscribed =
        state.lastSubscriberSeenAtMs !== null && now - state.lastSubscriberSeenAtMs <= this.options.pairIdleTtlMs

      if (!hasSubscribers && !recentlySubscribed) {
        continue
      }

      output.push(pairAddress)
      if (output.length >= this.options.maxActivePairsGlobal) {
        break
      }
    }

    return output
  }

  private pruneIdlePairListeners(now: number): void {
    for (const [pairAddress, state] of this.pairState.entries()) {
      if (state.subscribers > 0) {
        continue
      }

      if (state.lastSubscriberSeenAtMs === null) {
        continue
      }

      if (now - state.lastSubscriberSeenAtMs <= this.options.pairIdleTtlMs * 4) {
        continue
      }

      this.pairListeners.delete(pairAddress)
    }
  }

  private refreshStaleStatuses(now: number): void {
    for (const pairAddress of this.pairState.keys()) {
      this.updatePairFreshnessState(pairAddress, now)
    }
  }

  private updatePairFreshnessState(pairAddress: string, now: number, reasonIfStale?: string): void {
    const state = this.getOrCreatePairState(pairAddress)
    const delayed = this.isPairDelayed(pairAddress, now)

    if (delayed) {
      const status: ChartStreamStatus = state.lastPollAttemptAtMs && !state.lastSuccessAtMs ? 'reconnecting' : 'delayed'
      this.updateStatus(pairAddress, status, reasonIfStale ?? 'stale')
      return
    }

    if (state.lastSuccessAtMs !== null) {
      this.updateStatus(pairAddress, 'live')
    }
  }

  private isPairDelayed(pairAddress: string, nowMs: number): boolean {
    const lastObservedAtMs = this.aggregator.getLastObservedAtMs(pairAddress)
    if (lastObservedAtMs === null) {
      return true
    }

    return nowMs - lastObservedAtMs > this.options.staleAfterMs
  }

  private updateStatus(pairAddress: string, status: ChartStreamStatus, reason?: string): void {
    const state = this.getOrCreatePairState(pairAddress)
    const previousStatus = state.status
    const previousReason = state.statusReason
    const normalizedReason = reason && reason.length > 0 ? reason : undefined

    if (state.status === status && state.statusReason === normalizedReason) {
      return
    }

    state.status = status
    state.statusReason = normalizedReason

    const statusLogPayload = {
      pairAddress,
      fromStatus: previousStatus,
      toStatus: status,
      fromReason: previousReason ?? null,
      toReason: normalizedReason ?? null,
    }
    if (status === 'delayed' || status === 'reconnecting') {
      this.logger.info?.(statusLogPayload, 'Chart pair status changed')
    } else {
      this.logger.debug?.(statusLogPayload, 'Chart pair status changed')
    }

    this.emitToPair(pairAddress, {
      type: 'status',
      pairAddress,
      status,
      ...(normalizedReason ? { reason: normalizedReason } : {}),
      serverTime: new Date().toISOString(),
    })
  }

  private emitToPair(pairAddress: string, event: ChartStreamEvent): void {
    const listeners = this.pairListeners.get(pairAddress)
    if (!listeners || listeners.size === 0) {
      return
    }

    for (const listener of listeners) {
      try {
        listener(event)
      } catch (error) {
        this.logger.warn({ error, pairAddress, eventType: event.type }, 'Chart stream listener callback failed')
      }
    }
  }

  private getOrCreatePairState(pairAddress: string): PairRuntimeState {
    const existing = this.pairState.get(pairAddress)
    if (existing) {
      return existing
    }

    const state: PairRuntimeState = {
      subscribers: 0,
      lastSubscriberSeenAtMs: null,
      lastPollAttemptAtMs: null,
      lastSuccessAtMs: null,
      status: 'reconnecting',
    }

    this.pairState.set(pairAddress, state)
    return state
  }
}

type ChartStreamListener = (event: ChartStreamEvent) => void

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'unknown_error'
}

function shouldSample(counter: number, every: number): boolean {
  return counter > 0 && counter % every === 0
}
