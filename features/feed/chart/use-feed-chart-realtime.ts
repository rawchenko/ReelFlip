import { useIsFocused } from '@react-navigation/native'
import { useEffect, useMemo, useRef } from 'react'
import { createChartStream, fetchChartHistory } from '@/features/feed/api/chart-client'
import { feedChartStore, getChartPairState } from '@/features/feed/chart/chart-store'
import { ChartStreamEvent } from '@/features/feed/chart/types'
import { TokenFeedItem } from '@/features/feed/types'

interface UseFeedChartRealtimeOptions {
  items: TokenFeedItem[]
  activeIndex: number
  enabled: boolean
}

const ACTIVE_RADIUS = 1
const PAIRS_PER_STREAM = 3
const RECONNECT_BACKOFF_MS = [1000, 2000, 5000] as const
const HISTORY_POLL_INTERVAL_MS = 1000

function logChartRealtimeDiagnostic(event: string, details?: Record<string, unknown>): void {
  if (!__DEV__) {
    return
  }

  if (details) {
    console.log(`[chart][diag] ${event}`, details)
    return
  }

  console.log(`[chart][diag] ${event}`)
}

export function useFeedChartRealtime({ items, activeIndex, enabled }: UseFeedChartRealtimeOptions): void {
  const isFocused = useIsFocused()
  const historyInFlightRef = useRef(new Set<string>())

  const activePairs = useMemo(() => {
    if (!enabled) {
      return [] as string[]
    }

    const pairs: string[] = []
    for (let index = 0; index < items.length; index += 1) {
      if (Math.abs(index - activeIndex) > ACTIVE_RADIUS) {
        continue
      }

      const pairAddress = items[index]?.pairAddress?.trim()
      if (!pairAddress) {
        continue
      }

      if (!pairs.includes(pairAddress)) {
        pairs.push(pairAddress)
      }

      if (pairs.length >= PAIRS_PER_STREAM) {
        break
      }
    }

    return pairs
  }, [activeIndex, enabled, items])

  const activePairsKey = useMemo(() => activePairs.join(','), [activePairs])
  const stableActivePairs = useMemo(() => (activePairsKey ? activePairsKey.split(',') : []), [activePairsKey])

  useEffect(() => {
    for (const pairAddress of stableActivePairs) {
      feedChartStore.retainPair(pairAddress)
    }

    return () => {
      for (const pairAddress of stableActivePairs) {
        feedChartStore.releasePair(pairAddress)
      }
      feedChartStore.pruneInactive()
    }
  }, [activePairsKey, stableActivePairs])

  useEffect(() => {
    if (!enabled) {
      return
    }

    for (const pairAddress of stableActivePairs) {
      const existing = getChartPairState(pairAddress)
      if ((existing?.candles.length ?? 0) > 0 || historyInFlightRef.current.has(pairAddress)) {
        continue
      }

      historyInFlightRef.current.add(pairAddress)
      feedChartStore.setStatus(pairAddress, 'reconnecting')

      void fetchChartHistory(pairAddress, { interval: '1m', limit: 120 })
        .then((history) => {
          feedChartStore.hydrateHistory(history.pairAddress, history.candles)
          feedChartStore.setStatus(history.pairAddress, history.delayed ? 'delayed' : 'live')
        })
        .catch((error) => {
          console.warn('[chart] history fetch failed', pairAddress, error)
          feedChartStore.setStatus(pairAddress, 'reconnecting')
        })
        .finally(() => {
          historyInFlightRef.current.delete(pairAddress)
        })
    }
  }, [activePairsKey, enabled, stableActivePairs])

  useEffect(() => {
    if (!enabled || !isFocused || stableActivePairs.length === 0) {
      return
    }

    let disposed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let connectDebounceTimer: ReturnType<typeof setTimeout> | null = null
    let retryAttempt = 0
    let streamConnection: { close: () => void } | null = null
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let fallbackPollingMode = false
    let pollInFlight = false

    const markPairsReconnecting = () => {
      for (const pairAddress of stableActivePairs) {
        feedChartStore.setStatus(pairAddress, 'reconnecting')
      }
    }

    const clearReconnectTimer = () => {
      if (!reconnectTimer) {
        return
      }
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    const clearPollTimer = () => {
      if (!pollTimer) {
        return
      }
      clearTimeout(pollTimer)
      pollTimer = null
    }

    const closeStream = () => {
      if (!streamConnection) {
        return
      }
      streamConnection.close()
      streamConnection = null
    }

    const scheduleHistoryPoll = () => {
      if (disposed || !fallbackPollingMode) {
        return
      }

      clearPollTimer()
      pollTimer = setTimeout(() => {
        void pollHistoryOnce()
      }, HISTORY_POLL_INTERVAL_MS)
    }

    const pollHistoryOnce = async () => {
      if (disposed || !fallbackPollingMode || pollInFlight) {
        return
      }

      const startedAtMs = Date.now()
      pollInFlight = true
      try {
        const results = await Promise.all(
          stableActivePairs.map((pairAddress) => fetchChartHistory(pairAddress, { interval: '1m', limit: 120 })),
        )

        for (const history of results) {
          feedChartStore.hydrateHistory(history.pairAddress, history.candles)
          feedChartStore.setStatus(history.pairAddress, history.delayed ? 'delayed' : 'live')
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('[chart] history polling fallback error', error)
        }
        logChartRealtimeDiagnostic('history_poll_error', {
          mode: 'polling_fallback',
          pairCount: stableActivePairs.length,
          message: error instanceof Error ? error.message : String(error),
        })
        markPairsReconnecting()
      } finally {
        logChartRealtimeDiagnostic('history_poll_cycle_duration_ms', {
          mode: 'polling_fallback',
          pairCount: stableActivePairs.length,
          durationMs: Date.now() - startedAtMs,
        })
        pollInFlight = false
        scheduleHistoryPoll()
      }
    }

    const startHistoryPollingFallback = () => {
      if (fallbackPollingMode || disposed) {
        return
      }

      fallbackPollingMode = true
      if (__DEV__) {
        console.warn('[chart] falling back to 1s history polling (SSE streaming unsupported)')
      }
      logChartRealtimeDiagnostic('stream_fallback_to_polling', {
        reason: 'sse_unsupported_or_stream_error',
        pairCount: stableActivePairs.length,
      })
      void pollHistoryOnce()
    }

    const scheduleReconnect = () => {
      if (disposed || fallbackPollingMode) {
        return
      }

      clearReconnectTimer()
      markPairsReconnecting()
      const delay = RECONNECT_BACKOFF_MS[Math.min(retryAttempt, RECONNECT_BACKOFF_MS.length - 1)]
      logChartRealtimeDiagnostic('stream_reconnect_attempt', {
        attempt: retryAttempt + 1,
        delayMs: delay,
        pairCount: stableActivePairs.length,
        mode: fallbackPollingMode ? 'polling_fallback' : 'sse',
      })
      retryAttempt += 1
      reconnectTimer = setTimeout(connect, delay)
    }

    const handleStreamEvent = (event: ChartStreamEvent) => {
      if (event.type === 'heartbeat') {
        return
      }

      if (event.type === 'snapshot') {
        feedChartStore.hydrateHistory(event.pairAddress, event.candles)
        feedChartStore.setStatus(event.pairAddress, event.delayed ? 'delayed' : 'live')
        return
      }

      if (event.type === 'candle_update') {
        feedChartStore.applyCandleUpdate(event.pairAddress, event.candle, event.isNewCandle)
        feedChartStore.setStatus(event.pairAddress, event.delayed ? 'delayed' : 'live')
        return
      }

      if (event.type === 'status') {
        logChartRealtimeDiagnostic('stream_status', {
          pairAddress: event.pairAddress,
          status: event.status,
          reason: event.reason ?? null,
          transport: fallbackPollingMode ? 'polling_fallback' : 'sse',
        })
        feedChartStore.setStatus(event.pairAddress, event.status)
      }
    }

    const connect = () => {
      if (disposed || fallbackPollingMode) {
        return
      }

      closeStream()
      markPairsReconnecting()

      streamConnection = createChartStream({
        pairs: stableActivePairs,
        interval: '1m',
        onOpen: () => {
          retryAttempt = 0
          logChartRealtimeDiagnostic('stream_connected', {
            pairCount: stableActivePairs.length,
            pairs: stableActivePairs,
            transport: 'sse',
          })
          if (__DEV__) {
            console.log('[chart] stream connected', stableActivePairs)
          }
        },
        onEvent: handleStreamEvent,
        onError: (error) => {
          if (error.message.includes('Streaming response body is not available')) {
            startHistoryPollingFallback()
            return
          }
          logChartRealtimeDiagnostic('stream_error', {
            pairCount: stableActivePairs.length,
            message: error.message,
          })
          if (__DEV__) {
            console.warn('[chart] stream error', error)
          }
          scheduleReconnect()
        },
        onClose: () => {
          logChartRealtimeDiagnostic('stream_closed', {
            pairCount: stableActivePairs.length,
            transport: fallbackPollingMode ? 'polling_fallback' : 'sse',
          })
          if (!disposed) {
            scheduleReconnect()
          }
        },
      })
    }

    connectDebounceTimer = setTimeout(connect, 150)

    return () => {
      disposed = true
      if (connectDebounceTimer) {
        clearTimeout(connectDebounceTimer)
      }
      clearReconnectTimer()
      clearPollTimer()
      closeStream()
    }
  }, [activePairsKey, enabled, isFocused, stableActivePairs])
}
