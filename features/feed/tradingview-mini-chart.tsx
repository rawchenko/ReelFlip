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

const MAX_POINTS = 360
const MAX_CANDLES = 360

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
  const baselineTopLine = '#22d3a5'
  const baselineBottomLine = '#ff3b57'
  const baselineTopFillStrong = 'rgba(34, 211, 165, 0.32)'
  const baselineTopFillSoft = 'rgba(34, 211, 165, 0.03)'
  const baselineBottomFillStrong = 'rgba(255, 59, 87, 0.28)'
  const baselineBottomFillSoft = 'rgba(255, 59, 87, 0.03)'
  const referenceLineColor = 'rgba(226, 232, 240, 0.62)'
  const horizontalGrid = feedMode ? 'rgba(120, 130, 150, 0.24)' : semanticColors.chart.grid
  const verticalGrid = feedMode ? 'rgba(0, 0, 0, 0)' : semanticColors.chart.grid
  const background = feedMode ? '#05070b' : semanticColors.chart.background
  const text = feedMode ? 'rgba(185, 192, 205, 0.65)' : semanticColors.text.chartAxis
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
        display: none;
      }
      #endpoint-dot,
      #price-pill {
        display: none;
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
        var referenceSeries = null
        var latestLinePoint = null
        var baselineValue = null
        var initialized = false
        var VISIBLE_WINDOW_SECONDS = 6 * 60 * 60
        var RIGHT_PAD_SECONDS = 3 * 60
        var FEED_NEON_MODE = ${feedMode ? 'true' : 'false'}
        var liveStepSec = 60
        var activePricePrecision = null
        var activePriceMinMove = null

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

        function resolvePricePrecision(value) {
          if (!Number.isFinite(value) || value <= 0) {
            return 4
          }

          var abs = Math.abs(value)
          if (abs >= 1000) {
            return 2
          }
          if (abs >= 1) {
            return 4
          }
          if (abs >= 0.01) {
            return 6
          }
          return 8
        }

        function resolvePriceMinMove(precision) {
          if (!Number.isFinite(precision) || precision < 0) {
            return 0.0001
          }
          return Math.pow(10, -precision)
        }

        function applySeriesPriceFormat(value) {
          if (!series || typeof series.applyOptions !== 'function') {
            return
          }

          var precision = resolvePricePrecision(value)
          var minMove = resolvePriceMinMove(precision)

          if (activePricePrecision === precision && activePriceMinMove === minMove) {
            return
          }

          activePricePrecision = precision
          activePriceMinMove = minMove

          series.applyOptions({
            priceFormat: {
              type: 'price',
              precision: precision,
              minMove: minMove,
            },
          })

          if (referenceSeries && typeof referenceSeries.applyOptions === 'function') {
            referenceSeries.applyOptions({
              priceFormat: {
                type: 'price',
                precision: precision,
                minMove: minMove,
              },
            })
          }
        }

        function toBars(points) {
          if (!Array.isArray(points) || points.length < 2) {
            return []
          }

          var now = Math.floor(Date.now() / 1000)
          var spacingSec = Math.max(60, Math.floor(VISIBLE_WINDOW_SECONDS / Math.max(1, points.length - 1)))
          spacingSec = Math.floor(spacingSec / 60) * 60
          if (!Number.isFinite(spacingSec) || spacingSec < 60) {
            spacingSec = 60
          }
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
              time: now - (points.length - 1 - index) * spacingSec,
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

        function inferBarStepSec(bars) {
          if (!Array.isArray(bars) || bars.length < 2) {
            return 60
          }

          var smallestDiff = Number.POSITIVE_INFINITY
          for (var i = 1; i < bars.length; i += 1) {
            var previous = Number(bars[i - 1] && bars[i - 1].time)
            var current = Number(bars[i] && bars[i].time)
            var diff = current - previous

            if (Number.isFinite(diff) && diff > 0 && diff < smallestDiff) {
              smallestDiff = diff
            }
          }

          if (!Number.isFinite(smallestDiff) || smallestDiff <= 0) {
            return 60
          }

          var rounded = Math.round(smallestDiff / 60) * 60
          return Math.max(60, rounded)
        }

        function expandBarsByStep(bars, stepSec) {
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
              var gapSteps = Math.floor((currentTime - previousTime) / stepSec)
              if (gapSteps > 1) {
                for (var step = 1; step < gapSteps; step += 1) {
                  var fillTime = previousTime + step * stepSec
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

        function currentWindowAnchorSec(stepSec) {
          var resolvedStepSec = Number.isFinite(stepSec) && stepSec > 0 ? stepSec : 60
          return Math.floor(Date.now() / resolvedStepSec) * resolvedStepSec
        }

        function densifyVisibleWindowBars(bars) {
          var stepSec = inferBarStepSec(bars)
          var expanded = expandBarsByStep(bars, stepSec)
          if (!Array.isArray(expanded) || expanded.length === 0) {
            return expanded
          }

          var anchor = currentWindowAnchorSec(stepSec)
          var visibleSteps = Math.max(2, Math.floor(VISIBLE_WINDOW_SECONDS / stepSec))
          var from = anchor - (visibleSteps - 1) * stepSec
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
          for (var t = from; t <= anchor; t += stepSec) {
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

          liveStepSec = stepSec
          return output
        }

        function resizeChart() {
          if (!chart) {
            return
          }

          chart.resize(window.innerWidth, window.innerHeight)
          updateOverlayPosition()
        }

        function setVisibleWindow(anchorTimeSec) {
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
          setVisibleWindow(bars[bars.length - 1].time)
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

          bars = densifyVisibleWindowBars(bars)
          applyBarsData(bars)
          setVisibleWindow(currentWindowAnchorSec(liveStepSec))
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
          setVisibleWindow(currentWindowAnchorSec(liveStepSec))
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

          liveStepSec = inferBarStepSec(bars)

          baselineValue = resolveBaselineValue(linePoints)
          if (!Number.isFinite(baselineValue) || baselineValue <= 0) {
            baselineValue = Number(linePoints[0] && linePoints[0].value)
          }
          if (!Number.isFinite(baselineValue) || baselineValue <= 0) {
            return
          }

          latestLinePoint = linePoints[linePoints.length - 1]
          applySeriesPriceFormat(Number(latestLinePoint && latestLinePoint.value) || baselineValue)
          if (typeof series.applyOptions === 'function') {
            series.applyOptions({
              baseValue: {
                type: 'price',
                price: baselineValue,
              },
            })
          }

          series.setData(linePoints)
          if (referenceSeries) {
            referenceSeries.setData(buildReferencePoints(linePoints, baselineValue))
          }
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
          applySeriesPriceFormat(close)
          series.update(point)
          if (referenceSeries && Number.isFinite(baselineValue) && baselineValue > 0) {
            referenceSeries.update({ time: time, value: baselineValue })
          }
        }

        function resolveBaselineValue(points) {
          if (!Array.isArray(points) || points.length === 0) {
            return null
          }

          var candidateIndex = Math.max(0, points.length - 2)
          var candidate = Number(points[candidateIndex] && points[candidateIndex].value)
          if (Number.isFinite(candidate) && candidate > 0) {
            return candidate
          }

          var first = Number(points[0] && points[0].value)
          if (Number.isFinite(first) && first > 0) {
            return first
          }

          return null
        }

        function buildReferencePoints(points, value) {
          if (!Array.isArray(points) || points.length === 0 || !Number.isFinite(value) || value <= 0) {
            return []
          }

          var output = []
          for (var i = 0; i < points.length; i += 1) {
            var point = points[i]
            var time = Number(point && point.time)
            if (!Number.isFinite(time)) {
              continue
            }
            output.push({ time: time, value: value })
          }

          return output
        }

        function formatPriceLabel(value) {
          if (!Number.isFinite(value)) {
            return ''
          }

          var precision = resolvePricePrecision(value)
          try {
            return '$' + Number(value).toLocaleString('en-US', { maximumFractionDigits: precision })
          } catch (_error) {
            return '$' + Number(value).toFixed(precision)
          }
        }

        function updateOverlayPosition() {
          return
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
                visible: ${feedMode ? 'true' : 'false'},
                scaleMargins: {
                  top: 0.02,
                  bottom: 0.02,
                },
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
                vertLines: { color: '${verticalGrid}' },
                horzLines: { color: '${horizontalGrid}' },
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
              var baselineOptions = {
                baseValue: { type: 'price', price: 1 },
                topLineColor: '${baselineTopLine}',
                topFillColor1: '${baselineTopFillStrong}',
                topFillColor2: '${baselineTopFillSoft}',
                bottomLineColor: '${baselineBottomLine}',
                bottomFillColor1: '${baselineBottomFillStrong}',
                bottomFillColor2: '${baselineBottomFillSoft}',
                lineWidth: 3,
                lastValueVisible: true,
                priceLineVisible: true,
                crosshairMarkerVisible: false,
                priceFormat: {
                  type: 'price',
                  precision: 4,
                  minMove: 0.0001,
                },
                autoscaleInfoProvider: undefined,
              }

              if (typeof chart.addBaselineSeries === 'function') {
                series = chart.addBaselineSeries(baselineOptions)
              } else if (typeof chart.addSeries === 'function' && window.LightweightCharts.BaselineSeries) {
                series = chart.addSeries(window.LightweightCharts.BaselineSeries, baselineOptions)
              } else if (typeof chart.addLineSeries === 'function') {
                series = chart.addLineSeries({
                  color: '${positiveTrend ? baselineTopLine : baselineBottomLine}',
                  lineWidth: 3,
                  lastValueVisible: true,
                  priceLineVisible: true,
                  crosshairMarkerVisible: false,
                  priceFormat: {
                    type: 'price',
                    precision: 4,
                    minMove: 0.0001,
                  },
                })
              } else {
                notify('chart-error', 'No baseline series API found')
                return
              }

              var dashed = window.LightweightCharts && window.LightweightCharts.LineStyle
                ? window.LightweightCharts.LineStyle.Dashed
                : 2
              var referenceLineOptions = {
                color: '${referenceLineColor}',
                lineWidth: 1,
                lineStyle: dashed,
                lastValueVisible: false,
                priceLineVisible: false,
                crosshairMarkerVisible: false,
                priceFormat: {
                  type: 'price',
                  precision: 4,
                  minMove: 0.0001,
                },
              }

              if (typeof chart.addLineSeries === 'function') {
                referenceSeries = chart.addLineSeries(referenceLineOptions)
              } else if (typeof chart.addSeries === 'function' && window.LightweightCharts.LineSeries) {
                referenceSeries = chart.addSeries(window.LightweightCharts.LineSeries, referenceLineOptions)
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
