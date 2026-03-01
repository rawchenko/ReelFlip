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
  streamStatus?: 'live' | 'delayed' | 'reconnecting' | 'fallback_polling'
  pairAddress?: string
  positiveTrend: boolean
  feedMode?: boolean
  interactive?: boolean
  onUnavailable?: () => void
  onStatusChange?: (status: 'loading' | 'ready' | 'error') => void
}

interface WebMessagePayload {
  type?: string
  message?: string
}

const MAX_POINTS = 60
const MAX_CANDLES = 60

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

function buildChartHtml(positiveTrend: boolean, chartScript: string, feedMode: boolean): string {
  const bullBody = semanticColors.chart.bullBody
  const bullWick = semanticColors.chart.bullWick
  const bearBody = semanticColors.chart.bearBody
  const bearWick = semanticColors.chart.bearWick
  const neonLine = positiveTrend ? '#2CFF73' : '#FF6B7A'
  const neonGlowStrong = positiveTrend ? 'rgba(44, 255, 115, 0.28)' : 'rgba(255, 107, 122, 0.26)'
  const neonGlowSoft = positiveTrend ? 'rgba(44, 255, 115, 0.12)' : 'rgba(255, 107, 122, 0.11)'
  const neonFillTop = positiveTrend ? 'rgba(22, 255, 113, 0.14)' : 'rgba(255, 107, 122, 0.12)'
  const neonFillBottom = 'rgba(0, 0, 0, 0)'
  const grid = feedMode ? 'rgba(0, 0, 0, 0)' : semanticColors.chart.grid
  const background = feedMode ? '#04060b' : semanticColors.chart.background
  const text = feedMode ? 'rgba(127, 138, 162, 0.18)' : semanticColors.text.chartAxis
  const priceLine = positiveTrend ? semanticColors.chart.bullFallback : semanticColors.chart.bearFallback
  const crosshairLine = feedMode ? 'rgba(0, 0, 0, 0)' : priceLine

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
        position: relative;
      }
      #chart {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 0;
      }
      #overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 20;
      }
      #endpoint-dot {
        position: absolute;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: ${neonLine};
        opacity: 0;
        box-shadow:
          0 0 10px ${neonGlowStrong},
          0 0 18px ${neonGlowStrong},
          0 0 28px ${neonGlowSoft};
        transform: translate(-9999px, -9999px);
      }
      #endpoint-dot::after {
        content: '';
        position: absolute;
        inset: -6px;
        border-radius: 999px;
        background: ${neonGlowSoft};
        filter: blur(6px);
      }
      #price-pill {
        position: absolute;
        padding: 4px 8px;
        border-radius: 999px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: #ffffff;
        background: rgba(15, 18, 26, 0.86);
        border: 1px solid rgba(255, 255, 255, 0.06);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
        opacity: 0;
        transform: translate(-9999px, -9999px);
        white-space: nowrap;
      }
    </style>
    <script>${chartScript}</script>
  </head>
  <body>
    <div id="chart"></div>
    <div id="overlay">
      <div id="endpoint-dot"></div>
      <div id="price-pill"></div>
    </div>
    <script>
      (function () {
        var chart = null
        var series = null
        var areaSeries = null
        var glowSeriesOuter = null
        var glowSeriesInner = null
        var latestLinePoint = null
        var initialized = false
        var VISIBLE_WINDOW_SECONDS = 60 * 60
        var RIGHT_PAD_SECONDS = 60
        var FEED_NEON_MODE = ${feedMode ? 'true' : 'false'}

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

        function expandMinuteBars(bars) {
          if (!Array.isArray(bars) || bars.length === 0) {
            return []
          }

          var sorted = bars.slice().sort(function (a, b) {
            return Number(a.time) - Number(b.time)
          })

          var output = []
          var previous = null

          for (var i = 0; i < sorted.length; i += 1) {
            var current = sorted[i]
            if (!previous) {
              output.push(current)
              previous = current
              continue
            }

            var previousTime = Number(previous.time)
            var currentTime = Number(current.time)
            var previousClose = Number(previous.close)

            if (Number.isFinite(previousTime) && Number.isFinite(currentTime) && Number.isFinite(previousClose)) {
              var gapMinutes = Math.floor((currentTime - previousTime) / 60)
              if (gapMinutes > 1) {
                for (var step = 1; step < gapMinutes; step += 1) {
                  var fillTime = previousTime + step * 60
                  output.push({
                    time: fillTime,
                    open: previousClose,
                    high: previousClose,
                    low: previousClose,
                    close: previousClose,
                  })
                }
              }
            }

            output.push(current)
            previous = current
          }

          return output
        }

        function currentMinuteSec() {
          return Math.floor(Date.now() / 60000) * 60
        }

        function densifyLastHourBars(bars) {
          var expanded = expandMinuteBars(bars)
          if (!Array.isArray(expanded) || expanded.length === 0) {
            return expanded
          }

          var anchor = currentMinuteSec()
          var from = anchor - (60 - 1) * 60
          var byTime = {}

          for (var i = 0; i < expanded.length; i += 1) {
            var item = expanded[i]
            if (!item || !Number.isFinite(Number(item.time))) {
              continue
            }
            byTime[String(Number(item.time))] = item
          }

          var seed = expanded[0]
          var lastClose = Number(seed && seed.close)
          if (!Number.isFinite(lastClose) || lastClose <= 0) {
            lastClose = Number(seed && seed.open)
          }
          if (!Number.isFinite(lastClose) || lastClose <= 0) {
            lastClose = 1
          }

          var output = []
          for (var t = from; t <= anchor; t += 60) {
            var existing = byTime[String(t)]
            if (existing) {
              output.push(existing)
              var close = Number(existing.close)
              if (Number.isFinite(close) && close > 0) {
                lastClose = close
              }
              continue
            }

            output.push({
              time: t,
              open: lastClose,
              high: lastClose,
              low: lastClose,
              close: lastClose,
            })
          }

          return output
        }

        function resizeChart() {
          if (!chart) {
            return
          }

          chart.resize(window.innerWidth, window.innerHeight)
          updateOverlayPosition()
        }

        function setLastHourWindow(anchorTimeSec) {
          if (!chart || !Number.isFinite(Number(anchorTimeSec))) {
            return
          }

          var anchor = Number(anchorTimeSec)
          chart.timeScale().setVisibleRange({
            from: anchor - VISIBLE_WINDOW_SECONDS,
            to: anchor + RIGHT_PAD_SECONDS,
          })
        }

        function setPoints(points) {
          if (!initialized || !series) {
            return
          }

          var bars = toBars(points)
          if (bars.length < 2) {
            return
          }

          applyBarsData(bars)
          setLastHourWindow(bars[bars.length - 1].time)
          updateOverlayPosition()
        }

        function setCandles(candles) {
          if (!initialized || !series) {
            return
          }

          var bars = normalizeCandles(candles)
          if (bars.length === 0) {
            return
          }

          bars = densifyLastHourBars(bars)
          applyBarsData(bars)
          setLastHourWindow(currentMinuteSec())
          updateOverlayPosition()
        }

        function updateCandle(candle) {
          if (!initialized || !series) {
            return
          }

          var bar = normalizeCandle(candle)
          if (!bar) {
            return
          }

          applyBarUpdate(bar)
          setLastHourWindow(currentMinuteSec())
          updateOverlayPosition()
        }

        function toLinePoints(bars) {
          if (!Array.isArray(bars)) {
            return []
          }

          var points = []
          for (var i = 0; i < bars.length; i += 1) {
            var bar = bars[i]
            if (!bar) {
              continue
            }

            var time = Number(bar.time)
            var close = Number(bar.close)
            if (!Number.isFinite(time) || !Number.isFinite(close) || close <= 0) {
              continue
            }

            points.push({ time: time, value: close })
          }

          return points
        }

        function applyBarsData(bars) {
          if (!FEED_NEON_MODE) {
            series.setData(bars)
            return
          }

          var linePoints = toLinePoints(bars)
          if (linePoints.length === 0) {
            return
          }
          latestLinePoint = linePoints[linePoints.length - 1]

          if (areaSeries) {
            areaSeries.setData(linePoints)
          }
          if (glowSeriesOuter) {
            glowSeriesOuter.setData(linePoints)
          }
          if (glowSeriesInner) {
            glowSeriesInner.setData(linePoints)
          }
          series.setData(linePoints)
        }

        function applyBarUpdate(bar) {
          if (!FEED_NEON_MODE) {
            series.update(bar)
            return
          }

          var time = Number(bar && bar.time)
          var close = Number(bar && bar.close)
          if (!Number.isFinite(time) || !Number.isFinite(close) || close <= 0) {
            return
          }

          var point = { time: time, value: close }
          latestLinePoint = point
          if (areaSeries) {
            areaSeries.update(point)
          }
          if (glowSeriesOuter) {
            glowSeriesOuter.update(point)
          }
          if (glowSeriesInner) {
            glowSeriesInner.update(point)
          }
          series.update(point)
        }

        function formatPriceLabel(value) {
          if (!Number.isFinite(value)) {
            return ''
          }

          var abs = Math.abs(value)
          var maxFractionDigits = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6
          try {
            return '$' + Number(value).toLocaleString('en-US', { maximumFractionDigits: maxFractionDigits })
          } catch (_error) {
            return '$' + String(Math.round(value * 100) / 100)
          }
        }

        function updateOverlayPosition() {
          if (!FEED_NEON_MODE || !chart || !series) {
            return
          }

          var dotEl = document.getElementById('endpoint-dot')
          var labelEl = document.getElementById('price-pill')
          if (!dotEl || !labelEl) {
            return
          }

          if (!latestLinePoint) {
            dotEl.style.opacity = '0'
            labelEl.style.opacity = '0'
            return
          }

          var lastTime = Number(latestLinePoint.time)
          var lastValue = Number(latestLinePoint.value)
          if (!Number.isFinite(lastTime) || !Number.isFinite(lastValue)) {
            dotEl.style.opacity = '0'
            labelEl.style.opacity = '0'
            return
          }

          var x = chart.timeScale().timeToCoordinate(lastTime)
          var y = series.priceToCoordinate(lastValue)
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            dotEl.style.opacity = '0'
            labelEl.textContent = formatPriceLabel(lastValue)
            labelEl.style.opacity = '1'
            labelEl.style.transform = 'translate(10px, 10px)'
            return
          }

          dotEl.style.opacity = '1'
          dotEl.style.transform = 'translate(' + String(x - 4) + 'px, ' + String(y - 4) + 'px)'

          labelEl.textContent = formatPriceLabel(lastValue)
          labelEl.style.opacity = '1'

          var labelPad = 10
          var labelGap = 12
          var labelWidth = labelEl.offsetWidth || 56
          var labelHeight = labelEl.offsetHeight || 24
          var maxX = window.innerWidth - labelWidth - labelPad
          var targetX = Math.max(labelPad, Math.min(maxX, x + labelGap))
          var targetY = Math.max(labelPad, Math.min(window.innerHeight - labelHeight - labelPad, y - labelHeight - 6))
          labelEl.style.transform = 'translate(' + String(targetX) + 'px, ' + String(targetY) + 'px)'
        }

        function makeLineTypeOptions() {
          if (!window.LightweightCharts || !window.LightweightCharts.LineType) {
            return {}
          }
          if (typeof window.LightweightCharts.LineType.WithSteps === 'undefined') {
            return {}
          }
          return { lineType: window.LightweightCharts.LineType.WithSteps }
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
                attributionLogo: ${feedMode ? 'false' : 'true'},
              },
              rightPriceScale: {
                borderVisible: false,
                visible: false,
              },
              timeScale: {
                borderVisible: false,
                secondsVisible: false,
                timeVisible: ${feedMode ? 'false' : 'true'},
                ticksVisible: ${feedMode ? 'false' : 'true'},
                barSpacing: 6,
                minBarSpacing: 2,
                rightOffset: 1,
                lockVisibleTimeRangeOnResize: true,
              },
              grid: {
                vertLines: { color: '${grid}' },
                horzLines: { color: '${grid}' },
              },
              crosshair: {
                vertLine: {
                  color: '${crosshairLine}',
                  visible: ${feedMode ? 'false' : 'true'},
                },
                horzLine: {
                  color: '${crosshairLine}',
                  visible: ${feedMode ? 'false' : 'true'},
                },
              },
              handleScroll: false,
              handleScale: false,
            })

            if (FEED_NEON_MODE) {
              var stepped = makeLineTypeOptions()
              var commonLine = {
                lastValueVisible: false,
                priceLineVisible: false,
                crosshairMarkerVisible: false,
              }

              if (typeof chart.addAreaSeries === 'function') {
                areaSeries = chart.addAreaSeries(Object.assign({}, commonLine, stepped, {
                  lineColor: 'rgba(0,0,0,0)',
                  lineWidth: 1,
                  topColor: '${neonFillTop}',
                  bottomColor: '${neonFillBottom}',
                }))
              } else if (typeof chart.addSeries === 'function' && window.LightweightCharts.AreaSeries) {
                areaSeries = chart.addSeries(window.LightweightCharts.AreaSeries, Object.assign({}, commonLine, stepped, {
                  lineColor: 'rgba(0,0,0,0)',
                  lineWidth: 1,
                  topColor: '${neonFillTop}',
                  bottomColor: '${neonFillBottom}',
                }))
              }

              var outerOptions = Object.assign({}, commonLine, stepped, {
                color: '${neonGlowSoft}',
                lineWidth: 12,
              })
              var innerOptions = Object.assign({}, commonLine, stepped, {
                color: '${neonGlowStrong}',
                lineWidth: 6,
              })
              var mainOptions = Object.assign({}, commonLine, stepped, {
                color: '${neonLine}',
                lineWidth: 2.6,
              })

              if (typeof chart.addLineSeries === 'function') {
                glowSeriesOuter = chart.addLineSeries(outerOptions)
                glowSeriesInner = chart.addLineSeries(innerOptions)
                series = chart.addLineSeries(mainOptions)
              } else if (typeof chart.addSeries === 'function' && window.LightweightCharts.LineSeries) {
                glowSeriesOuter = chart.addSeries(window.LightweightCharts.LineSeries, outerOptions)
                glowSeriesInner = chart.addSeries(window.LightweightCharts.LineSeries, innerOptions)
                series = chart.addSeries(window.LightweightCharts.LineSeries, mainOptions)
              } else {
                notify('chart-error', 'No line series API found')
                return
              }
            } else if (typeof chart.addCandlestickSeries === 'function') {
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
          if (chart.timeScale() && typeof chart.timeScale().subscribeVisibleTimeRangeChange === 'function') {
            chart.timeScale().subscribeVisibleTimeRangeChange(updateOverlayPosition)
          }
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
  feedMode = false,
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
    () => buildChartHtml(positiveTrend, LIGHTWEIGHT_CHARTS_STANDALONE_SCRIPT, feedMode),
    [feedMode, positiveTrend],
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
