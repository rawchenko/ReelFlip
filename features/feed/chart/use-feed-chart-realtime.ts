import { useIsFocused } from '@react-navigation/native'
import { useEffect, useMemo, useRef } from 'react'
import { createChartStreamSse, createChartStreamWs, fetchChartBatchHistory, fetchChartHistory } from '@/features/feed/api/chart-client'
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
const HISTORY_VISIBLE_CANDLES = 360
const CHART_INTERVAL = '1m' as const

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

    const pairsNeedingHistory = stableActivePairs.filter((pairAddress) => {
      const existing = getChartPairState(pairAddress)
      return (existing?.candles.length ?? 0) === 0 && !historyInFlightRef.current.has(pairAddress)
    })

    if (pairsNeedingHistory.length === 0) {
      return
    }

    for (const pairAddress of pairsNeedingHistory) {
      historyInFlightRef.current.add(pairAddress)
      feedChartStore.setStatus(pairAddress, 'reconnecting')
    }

    let cancelled = false

    const finishPair = (pairAddress: string) => {
      historyInFlightRef.current.delete(pairAddress)
    }

    void fetchChartBatchHistory(pairsNeedingHistory, { interval: CHART_INTERVAL, limit: HISTORY_VISIBLE_CANDLES })
      .then(async (batch) => {
        if (__DEV__) {
          const summary = batch.results.map((result) => ({
            pairAddress: result.pairAddress,
            source: result.source,
            historyQuality: result.historyQuality,
            candleCount: result.candles.length,
          }))
          logChartRealtimeDiagnostic('history_batch_bootstrap', {
            pairCount: batch.results.length,
            results: summary,
          })
        }

        const seenPairs = new Set<string>()
        for (const result of batch.results) {
          seenPairs.add(result.pairAddress)
          if (cancelled) {
            continue
          }

          if (result.candles.length > 0) {
            feedChartStore.hydrateHistory(result.pairAddress, result.candles, {
              source: result.source,
              historyQuality: result.historyQuality,
            })
          }
          feedChartStore.setStatus(result.pairAddress, result.delayed ? 'delayed' : result.status)
          finishPair(result.pairAddress)
        }

        const missingPairs = pairsNeedingHistory.filter((pairAddress) => !seenPairs.has(pairAddress))
        if (missingPairs.length === 0) {
          return
        }

        await Promise.all(
          missingPairs.map(async (pairAddress) => {
            try {
              const history = await fetchChartHistory(pairAddress, { interval: CHART_INTERVAL, limit: HISTORY_VISIBLE_CANDLES })
              if (!cancelled) {
                feedChartStore.hydrateHistory(history.pairAddress, history.candles, {
                  source: history.source,
                  historyQuality: history.historyQuality ?? null,
                })
                feedChartStore.setStatus(history.pairAddress, history.delayed ? 'delayed' : 'live')
              }
            } catch (error) {
              if (__DEV__) {
                console.warn('[chart] fallback history fetch failed', pairAddress, error)
              }
              if (!cancelled) {
                feedChartStore.setStatus(pairAddress, 'reconnecting')
              }
            } finally {
              finishPair(pairAddress)
            }
          }),
        )
      })
      .catch(async (error) => {
        if (__DEV__) {
          console.warn('[chart] history batch fetch failed', error)
        }

        await Promise.all(
          pairsNeedingHistory.map(async (pairAddress) => {
            try {
              const history = await fetchChartHistory(pairAddress, { interval: CHART_INTERVAL, limit: HISTORY_VISIBLE_CANDLES })
              if (!cancelled) {
                feedChartStore.hydrateHistory(history.pairAddress, history.candles, {
                  source: history.source,
                  historyQuality: history.historyQuality ?? null,
                })
                feedChartStore.setStatus(history.pairAddress, history.delayed ? 'delayed' : 'live')
              }
            } catch (innerError) {
              console.warn('[chart] history fetch failed', pairAddress, innerError)
              if (!cancelled) {
                feedChartStore.setStatus(pairAddress, 'reconnecting')
              }
            } finally {
              finishPair(pairAddress)
            }
          }),
        )
      })

    return () => {
      cancelled = true
      for (const pairAddress of pairsNeedingHistory) {
        finishPair(pairAddress)
      }
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
    let wsDisabledForSession = false
    let currentTransport: 'ws' | 'sse' | 'polling_fallback' | null = null
    let connectGeneration = 0

    const markPairsReconnecting = () => {
      for (const pairAddress of stableActivePairs) {
        feedChartStore.setStatus(pairAddress, 'reconnecting')
      }
    }

    const markPairsFallbackPolling = () => {
      for (const pairAddress of stableActivePairs) {
        feedChartStore.setStatus(pairAddress, 'fallback_polling')
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
      currentTransport = null
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
          stableActivePairs.map((pairAddress) =>
            fetchChartHistory(pairAddress, { interval: CHART_INTERVAL, limit: HISTORY_VISIBLE_CANDLES }),
          ),
        )

        for (const history of results) {
          feedChartStore.hydrateHistory(history.pairAddress, history.candles, {
            source: history.source,
            historyQuality: history.historyQuality ?? null,
          })
          feedChartStore.setStatus(history.pairAddress, history.delayed ? 'delayed' : 'fallback_polling')
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
      closeStream()
      clearReconnectTimer()
      currentTransport = 'polling_fallback'
      markPairsFallbackPolling()
      if (__DEV__) {
        console.warn('[chart] falling back to 1m history polling (SSE streaming unsupported)')
      }
      logChartRealtimeDiagnostic('stream_fallback_to_polling', {
        reason: 'streaming_unavailable',
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
        mode: fallbackPollingMode ? 'polling_fallback' : currentTransport ?? (wsDisabledForSession ? 'sse' : 'ws'),
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
          transport: fallbackPollingMode ? 'polling_fallback' : currentTransport ?? (wsDisabledForSession ? 'sse' : 'ws'),
        })
        feedChartStore.setStatus(event.pairAddress, event.status)
      }
    }

    const connectSse = (generation: number, reason: 'ws_unavailable' | 'ws_disabled' | 'direct' = 'direct') => {
      if (disposed || fallbackPollingMode || generation !== connectGeneration) {
        return
      }

      let opened = false
      let terminated = false

      currentTransport = 'sse'
      streamConnection = createChartStreamSse({
        pairs: stableActivePairs,
        interval: CHART_INTERVAL,
        onOpen: () => {
          if (disposed || generation !== connectGeneration) {
            return
          }

          opened = true
          retryAttempt = 0
          currentTransport = 'sse'
          logChartRealtimeDiagnostic('stream_connected', {
            pairCount: stableActivePairs.length,
            pairs: stableActivePairs,
            transport: 'sse',
            reason,
          })
          if (__DEV__) {
            console.log('[chart] stream connected (sse)', stableActivePairs)
          }
        },
        onEvent: handleStreamEvent,
        onError: (error) => {
          if (disposed || generation !== connectGeneration || terminated) {
            return
          }

          terminated = true

          if (error.message.includes('Streaming response body is not available')) {
            startHistoryPollingFallback()
            return
          }

          logChartRealtimeDiagnostic('stream_error', {
            pairCount: stableActivePairs.length,
            message: error.message,
            transport: 'sse',
          })
          if (__DEV__) {
            console.warn('[chart] sse stream error', error)
          }
          scheduleReconnect()
        },
        onClose: () => {
          if (disposed || generation !== connectGeneration || terminated) {
            return
          }

          terminated = true
          logChartRealtimeDiagnostic('stream_closed', {
            pairCount: stableActivePairs.length,
            transport: 'sse',
            opened,
          })
          scheduleReconnect()
        },
      })
    }

    const connectWs = (generation: number) => {
      if (disposed || fallbackPollingMode || generation !== connectGeneration) {
        return
      }

      let opened = false
      let terminated = false

      currentTransport = 'ws'
      streamConnection = createChartStreamWs({
        pairs: stableActivePairs,
        interval: CHART_INTERVAL,
        onOpen: () => {
          if (disposed || generation !== connectGeneration) {
            return
          }

          opened = true
          retryAttempt = 0
          currentTransport = 'ws'
          logChartRealtimeDiagnostic('stream_connected', {
            pairCount: stableActivePairs.length,
            pairs: stableActivePairs,
            transport: 'ws',
          })
          if (__DEV__) {
            console.log('[chart] stream connected (ws)', stableActivePairs)
          }
        },
        onEvent: handleStreamEvent,
        onError: (error) => {
          if (disposed || generation !== connectGeneration || terminated) {
            return
          }

          logChartRealtimeDiagnostic('stream_error', {
            pairCount: stableActivePairs.length,
            message: error.message,
            transport: 'ws',
          })

          if (!opened) {
            terminated = true
            wsDisabledForSession = true
            closeStream()
            logChartRealtimeDiagnostic('stream_transport_downgrade', {
              from: 'ws',
              to: 'sse',
              pairCount: stableActivePairs.length,
              reason: error.message,
            })
            connectSse(generation, 'ws_unavailable')
          }
        },
        onClose: () => {
          if (disposed || generation !== connectGeneration || terminated) {
            return
          }

          terminated = true
          logChartRealtimeDiagnostic('stream_closed', {
            pairCount: stableActivePairs.length,
            transport: 'ws',
            opened,
          })

          if (!opened) {
            wsDisabledForSession = true
            connectSse(generation, 'ws_unavailable')
            return
          }

          scheduleReconnect()
        },
      })
    }

    const connect = () => {
      if (disposed || fallbackPollingMode) {
        return
      }

      connectGeneration += 1
      const generation = connectGeneration
      closeStream()
      markPairsReconnecting()
      if (wsDisabledForSession) {
        connectSse(generation, 'ws_disabled')
        return
      }

      connectWs(generation)
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
