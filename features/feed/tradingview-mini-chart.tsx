import { semanticColors } from '@/constants/semantic-colors'
import { LIGHTWEIGHT_CHARTS_STANDALONE_SCRIPT } from '@/features/feed/lightweight-charts-standalone'
import { ChartCandle } from '@/features/feed/chart/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView, WebViewMessageEvent } from 'react-native-webview'

interface TradingViewMiniChartProps {
  points?: number[]
  candles?: ChartCandle[]
  latestCandle?: ChartCandle | null
  streamStatus?: 'live' | 'delayed' | 'reconnecting'
  pairAddress?: string
  positiveTrend: boolean
  interactive?: boolean
  onUnavailable?: () => void
  onStatusChange?: (status: 'loading' | 'ready' | 'error') => void
}

interface WebMessagePayload {
  type?: string
  message?: string
}

const MAX_POINTS = 240
const MAX_CANDLES = 240

function sanitizePoints(points?: number[]): number[] {
  if (!Array.isArray(points)) {
    return []
  }

  return points.filter((point) => Number.isFinite(point) && point > 0).slice(-MAX_POINTS)
}

function sanitizeCandle(candle?: ChartCandle | null): ChartCandle | null {
  if (!candle) {
    return null
  }

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

function sanitizeCandles(candles?: ChartCandle[]): ChartCandle[] {
  if (!Array.isArray(candles)) {
    return []
  }

  const normalized: ChartCandle[] = []
  for (const candle of candles.slice(-MAX_CANDLES)) {
    const sanitized = sanitizeCandle(candle)
    if (sanitized) {
      normalized.push(sanitized)
    }
  }

  return normalized
}

function buildChartHtml(positiveTrend: boolean, chartScript: string): string {
  const bullBody = semanticColors.chart.bullBody
  const bullWick = semanticColors.chart.bullWick
  const bearBody = semanticColors.chart.bearBody
  const bearWick = semanticColors.chart.bearWick
  const grid = semanticColors.chart.grid
  const background = semanticColors.chart.background
  const text = semanticColors.text.chartAxis
  const priceLine = positiveTrend ? semanticColors.chart.bullFallback : semanticColors.chart.bearFallback

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: ${background};
      }
      #chart {
        width: 100%;
        height: 100%;
      }
    </style>
    <script>${chartScript}</script>
  </head>
  <body>
    <div id="chart"></div>
    <script>
      (function () {
        var chart = null
        var series = null
        var initialized = false
        var hasFitted = false

        function notify(type, message) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, message: message || '' }))
          }
        }

        window.onerror = function (message, source, lineno, colno) {
          notify('chart-error', String(message) + ' @' + String(lineno || 0) + ':' + String(colno || 0))
        }

        window.onunhandledrejection = function (event) {
          var reason = event && event.reason ? String(event.reason) : 'unhandledrejection'
          notify('chart-error', reason)
        }

        function toBars(points) {
          if (!Array.isArray(points) || points.length < 2) {
            return []
          }

          var now = Math.floor(Date.now() / 1000)
          var bars = []

          for (var index = 0; index < points.length; index += 1) {
            var close = Number(points[index])
            var previous = index === 0 ? close : Number(points[index - 1])
            if (!Number.isFinite(close) || !Number.isFinite(previous)) {
              continue
            }

            var open = previous
            var high = Math.max(open, close) * 1.0018
            var low = Math.min(open, close) * 0.9982

            bars.push({
              time: now - (points.length - index) * 60,
              open: open,
              high: high,
              low: low,
              close: close,
            })
          }

          return bars
        }

        function isValidBar(candle) {
          return (
            candle &&
            Number.isFinite(Number(candle.time)) &&
            Number.isFinite(Number(candle.open)) &&
            Number.isFinite(Number(candle.high)) &&
            Number.isFinite(Number(candle.low)) &&
            Number.isFinite(Number(candle.close)) &&
            Number(candle.time) > 0 &&
            Number(candle.open) > 0 &&
            Number(candle.high) > 0 &&
            Number(candle.low) > 0 &&
            Number(candle.close) > 0
          )
        }

        function normalizeCandle(candle) {
          if (!isValidBar(candle)) {
            return null
          }

          return {
            time: Number(candle.time),
            open: Number(candle.open),
            high: Number(candle.high),
            low: Number(candle.low),
            close: Number(candle.close),
          }
        }

        function normalizeCandles(candles) {
          if (!Array.isArray(candles)) {
            return []
          }

          var output = []
          for (var i = 0; i < candles.length; i += 1) {
            var parsed = normalizeCandle(candles[i])
            if (parsed) {
              output.push(parsed)
            }
          }
          return output
        }

        function resizeChart() {
          if (!chart) {
            return
          }

          chart.resize(window.innerWidth, window.innerHeight)
        }

        function fitOnce() {
          if (hasFitted || !chart) {
            return
          }

          hasFitted = true
          chart.timeScale().fitContent()
        }

        function setPoints(points) {
          if (!initialized || !series) {
            return
          }

          var bars = toBars(points)
          if (bars.length < 2) {
            return
          }

          series.setData(bars)
          fitOnce()
        }

        function setCandles(candles) {
          if (!initialized || !series) {
            return
          }

          var bars = normalizeCandles(candles)
          if (bars.length === 0) {
            return
          }

          series.setData(bars)
          fitOnce()
        }

        function updateCandle(candle) {
          if (!initialized || !series) {
            return
          }

          var bar = normalizeCandle(candle)
          if (!bar) {
            return
          }

          series.update(bar)
        }

        function createChart() {
          if (!window.LightweightCharts) {
            notify('chart-error', 'LightweightCharts global missing')
            return
          }

          var container = document.getElementById('chart')
          if (!container) {
            notify('chart-error', 'chart container missing')
            return
          }

          try {
            chart = window.LightweightCharts.createChart(container, {
              layout: {
                background: { color: '${background}' },
                textColor: '${text}',
              },
              rightPriceScale: {
                borderVisible: false,
                visible: false,
              },
              timeScale: {
                borderVisible: false,
                secondsVisible: false,
                timeVisible: true,
              },
              grid: {
                vertLines: { color: '${grid}' },
                horzLines: { color: '${grid}' },
              },
              crosshair: {
                vertLine: {
                  color: '${priceLine}',
                },
                horzLine: {
                  color: '${priceLine}',
                },
              },
              handleScroll: false,
              handleScale: false,
            })

            if (typeof chart.addCandlestickSeries === 'function') {
              series = chart.addCandlestickSeries({
                upColor: '${bullBody}',
                borderUpColor: '${bullBody}',
                wickUpColor: '${bullWick}',
                downColor: '${bearBody}',
                borderDownColor: '${bearBody}',
                wickDownColor: '${bearWick}',
              })
            } else if (typeof chart.addSeries === 'function' && window.LightweightCharts.CandlestickSeries) {
              series = chart.addSeries(window.LightweightCharts.CandlestickSeries, {
                upColor: '${bullBody}',
                borderUpColor: '${bullBody}',
                wickUpColor: '${bullWick}',
                downColor: '${bearBody}',
                borderDownColor: '${bearBody}',
                wickDownColor: '${bearWick}',
              })
            } else {
              notify('chart-error', 'No candlestick series API found')
              return
            }
          } catch (error) {
            notify('chart-error', error && error.message ? error.message : String(error))
            return
          }

          initialized = true
          resizeChart()
          notify('ready')
        }

        window.__RF_SET_POINTS = setPoints
        window.__RF_SET_CANDLES = setCandles
        window.__RF_UPDATE_CANDLE = updateCandle
        window.addEventListener('resize', resizeChart)

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', createChart, { once: true })
        } else {
          createChart()
        }

        setTimeout(function () {
          if (!initialized) {
            notify('chart-error', 'init timeout')
          }
        }, 3000)
      })()
    </script>
  </body>
</html>`
}

export function TradingViewMiniChart({
  points,
  candles,
  latestCandle,
  positiveTrend,
  interactive = false,
  onUnavailable,
  onStatusChange,
}: TradingViewMiniChartProps) {
  const webViewRef = useRef<WebView>(null)
  const unavailableNotifiedRef = useRef(false)
  const normalizedPoints = useMemo(() => sanitizePoints(points), [points])
  const normalizedCandles = useMemo(() => sanitizeCandles(candles), [candles])
  const normalizedLatestCandle = useMemo(() => sanitizeCandle(latestCandle), [latestCandle])
  const html = useMemo(
    () => buildChartHtml(positiveTrend, LIGHTWEIGHT_CHARTS_STANDALONE_SCRIPT),
    [positiveTrend],
  )
  const [isReady, setIsReady] = useState(false)

  const markUnavailable = useCallback(() => {
    if (unavailableNotifiedRef.current) {
      return
    }

    unavailableNotifiedRef.current = true
    onStatusChange?.('error')
    console.warn('[TradingViewMiniChart] falling back to MiniChart (WebView/lightweight-charts unavailable)')
    onUnavailable?.()
  }, [onStatusChange, onUnavailable])

  useEffect(() => {
    setIsReady(false)
    unavailableNotifiedRef.current = false
    onStatusChange?.('loading')
  }, [html, onStatusChange])

  useEffect(() => {
    if (!isReady) {
      return
    }

    if (normalizedCandles.length > 0) {
      const payload = JSON.stringify(normalizedCandles)
      webViewRef.current?.injectJavaScript(`window.__RF_SET_CANDLES && window.__RF_SET_CANDLES(${payload}); true;`)
      return
    }

    if (normalizedPoints.length < 2) {
      return
    }

    const payload = JSON.stringify(normalizedPoints)
    webViewRef.current?.injectJavaScript(`window.__RF_SET_POINTS && window.__RF_SET_POINTS(${payload}); true;`)
  }, [isReady, normalizedCandles, normalizedPoints])

  useEffect(() => {
    if (!isReady || !normalizedLatestCandle) {
      return
    }

    const payload = JSON.stringify(normalizedLatestCandle)
    webViewRef.current?.injectJavaScript(`window.__RF_UPDATE_CANDLE && window.__RF_UPDATE_CANDLE(${payload}); true;`)
  }, [isReady, normalizedLatestCandle])

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let payload: WebMessagePayload | null = null

      try {
        payload = JSON.parse(event.nativeEvent.data) as WebMessagePayload
      } catch {
        return
      }

      if (payload.type === 'ready') {
        setIsReady(true)
        onStatusChange?.('ready')
        return
      }

      if (payload.type === 'chart-error') {
        if (payload.message) {
          console.warn('[TradingViewMiniChart] chart-error:', payload.message)
        }
        markUnavailable()
      }
    },
    [markUnavailable, onStatusChange],
  )

  return (
    <View style={styles.container} pointerEvents={interactive ? 'auto' : 'none'}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        originWhitelist={['*']}
        style={styles.webView}
        onMessage={handleMessage}
        onError={markUnavailable}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        mixedContentMode="always"
        scrollEnabled={false}
        overScrollMode="never"
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  webView: {
    backgroundColor: 'transparent',
    flex: 1,
  },
})
