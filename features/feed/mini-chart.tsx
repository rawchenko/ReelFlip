import { StyleSheet, Text, View } from 'react-native'
import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'

interface MiniChartProps {
  points?: number[]
  positiveTrend: boolean
  height?: number
  fullBleed?: boolean
  feedMode?: boolean
  showAxis?: boolean
  showPriceBubble?: boolean
  candleCount?: number
}

interface CandlePoint {
  open: number
  close: number
  high: number
  low: number
}

const DEFAULT_PLOT_HEIGHT = 132

function sanitizePoints(points?: number[]): number[] {
  if (!Array.isArray(points)) {
    return []
  }

  return points.filter((point) => Number.isFinite(point) && point > 0)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function formatPrice(value: number): string {
  const absValue = Math.abs(value)
  const fractionDigits = absValue >= 1_000 ? 2 : absValue >= 1 ? 3 : absValue >= 0.01 ? 4 : 6

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

function toCandles(values: number[], desiredCandles: number): CandlePoint[] {
  if (values.length < 2) {
    return []
  }

  const normalizedDesiredCandles = Math.max(8, Math.floor(desiredCandles))
  const maxCandles = Math.min(48, normalizedDesiredCandles + 4)
  const bucketSize = Math.max(1, Math.floor((values.length - 1) / normalizedDesiredCandles))
  const candles: CandlePoint[] = []

  for (let start = 0; start < values.length - 1; start += bucketSize) {
    const end = Math.min(values.length - 1, start + bucketSize)
    const segment = values.slice(start, end + 1)
    const open = segment[0] ?? 0
    const close = segment[segment.length - 1] ?? open
    const segmentHigh = Math.max(...segment)
    const segmentLow = Math.min(...segment)

    const base = Math.max(open, close, Number.EPSILON)
    const bodyMoveRatio = Math.abs(close - open) / base
    const wickRatio = clamp(bodyMoveRatio * 0.8, 0.0015, 0.01)
    const wickBiasUp = 0.7 + (candles.length % 3) * 0.15
    const wickBiasDown = 0.7 + ((candles.length + 1) % 3) * 0.15

    const high = Math.max(segmentHigh, Math.max(open, close) * (1 + wickRatio * wickBiasUp))
    const low = Math.min(segmentLow, Math.min(open, close) * (1 - wickRatio * wickBiasDown))

    candles.push({ open, close, high, low })
    if (candles.length >= maxCandles) {
      break
    }
  }

  return candles.length >= 4 ? candles : []
}

export function MiniChart({
  points,
  positiveTrend,
  height = DEFAULT_PLOT_HEIGHT,
  fullBleed = false,
  feedMode = false,
  showAxis = true,
  showPriceBubble = true,
  candleCount = fullBleed ? 28 : 18,
}: MiniChartProps) {
  const values = sanitizePoints(points)
  const candles = toCandles(values, candleCount)
  if (candles.length < 4) {
    return null
  }

  const plotHeight = Math.max(120, Math.floor(height))
  const high = Math.max(...candles.map((candle) => candle.high))
  const low = Math.min(...candles.map((candle) => candle.low))
  const range = Math.max(high - low, Number.EPSILON)
  const lastClose = candles[candles.length - 1]?.close ?? values[values.length - 1] ?? 0

  const toY = (value: number): number => ((high - value) / range) * plotHeight
  const priceLineY = clamp(toY(lastClose), 2, plotHeight - 2)
  const bubbleY = clamp(priceLineY - 12, 4, plotHeight - 24)
  const fallbackBodyColor = positiveTrend ? semanticColors.chart.bullFallback : semanticColors.chart.bearFallback
  const fallbackGlowColor = positiveTrend ? semanticColors.chart.bullFallbackGlow : semanticColors.chart.bearFallbackGlow
  const gridOpacity = feedMode ? 0.2 : 0.7
  const priceLineOpacity = feedMode ? 0.18 : 1
  const trailOpacity = feedMode ? 0.35 : 1
  const glowOpacity = feedMode ? 0.45 : 0.95

  return (
    <View style={[styles.container, fullBleed ? styles.containerFullBleed : styles.containerCompact]}>
      <View
        style={[
          styles.plotAreaBase,
          fullBleed ? styles.plotAreaFullBleed : styles.plotAreaCompact,
          { height: plotHeight },
        ]}
      >
        <View style={[styles.gridLine, { top: plotHeight * 0.2, opacity: gridOpacity }]} />
        <View style={[styles.gridLine, { top: plotHeight * 0.5, opacity: gridOpacity }]} />
        <View style={[styles.gridLine, { top: plotHeight * 0.8, opacity: gridOpacity }]} />
        <View style={[styles.priceLine, { top: priceLineY, opacity: priceLineOpacity }]} />
        <View style={[styles.candleRow, { height: plotHeight }]}>
          {candles.map((candle, index) => {
            const bullish = candle.close >= candle.open
            const openY = toY(candle.open)
            const closeY = toY(candle.close)
            const wickTop = toY(candle.high)
            const wickBottom = toY(candle.low)
            const bodyTop = Math.min(openY, closeY)
            const bodyHeight = Math.max(3, Math.abs(openY - closeY))
            const wickHeight = Math.max(2, wickBottom - wickTop)

            const bodyColor = bullish ? semanticColors.chart.bullBody : semanticColors.chart.bearBody
            const wickColor = bullish ? semanticColors.chart.bullWick : semanticColors.chart.bearWick
            const glowColor = bullish ? semanticColors.chart.bullGlow : semanticColors.chart.bearGlow
            const trailColor = bullish ? semanticColors.chart.bullTrail : semanticColors.chart.bearTrail

            return (
              <View
                key={`${index}:${candle.open}:${candle.close}`}
                style={[styles.candleSlot, { marginHorizontal: fullBleed ? 0.6 : 0.3, height: plotHeight }]}
              >
                <View
                  style={[
                    styles.trail,
                    { top: bodyTop + bodyHeight, bottom: 0, backgroundColor: trailColor, opacity: trailOpacity },
                  ]}
                />
                <View style={[styles.wick, { top: wickTop, height: wickHeight, backgroundColor: wickColor }]} />
                <View
                  style={[
                    styles.glow,
                    { top: bodyTop - 6, height: bodyHeight + 12, backgroundColor: glowColor, opacity: glowOpacity },
                  ]}
                />
                <View style={[styles.body, { top: bodyTop, height: bodyHeight, backgroundColor: bodyColor }]} />
              </View>
            )
          })}
        </View>

        {showPriceBubble ? (
          <View style={[styles.priceBubble, { top: bubbleY, backgroundColor: fallbackGlowColor }]}>
            <Text style={[styles.priceBubbleText, { color: fallbackBodyColor }]}>{formatPrice(lastClose)}</Text>
          </View>
        ) : null}
      </View>

      {showAxis ? (
        <View style={styles.axisColumn}>
          <Text style={styles.axisLabel}>{formatPrice(high)}</Text>
          <Text style={styles.axisLabel}>{formatPrice(low)}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  axisColumn: {
    justifyContent: 'space-between',
    marginLeft: 10,
    paddingVertical: 4,
    width: 82,
  },
  axisLabel: {
    color: semanticColors.text.chartAxis,
    fontFamily: interFontFamily.medium,
    fontSize: 14,
    textAlign: 'right',
  },
  body: {
    borderRadius: 3,
    left: '28%',
    position: 'absolute',
    width: '44%',
  },
  candleRow: {
    flexDirection: 'row',
  },
  candleSlot: {
    flex: 1,
    position: 'relative',
  },
  container: {
    flexDirection: 'row',
  },
  containerCompact: {
    backgroundColor: semanticColors.chart.backgroundSurface,
    borderColor: semanticColors.border.chart,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 10,
  },
  containerFullBleed: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: semanticColors.chart.background,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  gridLine: {
    borderTopColor: semanticColors.chart.grid,
    borderTopWidth: 1,
    left: 0,
    opacity: 0.7,
    position: 'absolute',
    right: 0,
  },
  glow: {
    borderRadius: 10,
    left: '14%',
    opacity: 0.95,
    position: 'absolute',
    width: '72%',
  },
  plotAreaBase: {
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  plotAreaCompact: {
    backgroundColor: semanticColors.chart.backgroundPlot,
    paddingHorizontal: 4,
  },
  plotAreaFullBleed: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 8,
  },
  priceBubble: {
    borderRadius: 8,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
  },
  priceBubbleText: {
    fontFamily: interFontFamily.bold,
    fontSize: 11,
  },
  priceLine: {
    borderTopColor: semanticColors.chart.priceLine,
    borderTopWidth: 1,
    borderStyle: 'dotted',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  trail: {
    borderRadius: 0.5,
    left: '50%',
    marginLeft: -0.75,
    position: 'absolute',
    width: 1.5,
  },
  wick: {
    borderRadius: 1,
    left: '50%',
    marginLeft: -0.75,
    position: 'absolute',
    width: 1.5,
  },
})
