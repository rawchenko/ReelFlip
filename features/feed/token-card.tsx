import { useChartPairState } from '@/features/feed/chart/chart-store'
import { MiniChart } from '@/features/feed/mini-chart'
import { TradingViewMiniChart } from '@/features/feed/tradingview-mini-chart'
import { TokenFeedItem } from '@/features/feed/types'
import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'

interface TokenCardProps {
  item: TokenFeedItem
  availableHeight: number
  enableTradingView?: boolean
}

type ChartRendererState = 'loading' | 'ready' | 'error' | 'fallback'
type StreamBadgeState = 'live' | 'delayed' | 'reconnecting'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: value >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1 ? 2 : 6,
  }).format(value)
}

function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function TokenCard({ item, availableHeight, enableTradingView = false }: TokenCardProps) {
  const { width } = useWindowDimensions()
  const isUp = item.priceChange24h >= 0
  const [tradingViewUnavailable, setTradingViewUnavailable] = useState(false)
  const [chartRendererState, setChartRendererState] = useState<ChartRendererState>('fallback')
  const cardPadding = clamp(width * 0.055, 18, 26)
  const symbolSize = clamp(width * 0.12, 44, 60)
  const nameSize = clamp(width * 0.06, 19, 23)
  const badgeFontSize = clamp(width * 0.03, 11, 13)
  const priceSize = clamp(width * 0.125, 42, 58)
  const changeSize = clamp(width * 0.083, 24, 34)
  const metricLabelSize = clamp(width * 0.028, 10, 12)
  const metricValueSize = clamp(width * 0.047, 16, 20)
  const chartHeight = Math.max(availableHeight - 6, 320)
  const hasChartPoints = Array.isArray(item.sparkline) && item.sparkline.length >= 4
  const tradingViewEnabled = process.env.EXPO_PUBLIC_ENABLE_TV_CHART !== 'false'
  const realtimeChartsEnabled = process.env.EXPO_PUBLIC_ENABLE_TV_REALTIME_CHART !== 'false'
  const pairChartState = useChartPairState(item.pairAddress)
  const hasPairAddress = Boolean(item.pairAddress)
  const useRealtimeTradingViewChart = useMemo(
    () => Boolean(enableTradingView && hasPairAddress && tradingViewEnabled && realtimeChartsEnabled && !tradingViewUnavailable),
    [enableTradingView, hasPairAddress, tradingViewEnabled, realtimeChartsEnabled, tradingViewUnavailable],
  )
  const useLegacyTradingViewChart = useMemo(
    () =>
      Boolean(enableTradingView && hasChartPoints && tradingViewEnabled && !realtimeChartsEnabled && !tradingViewUnavailable),
    [enableTradingView, hasChartPoints, tradingViewEnabled, realtimeChartsEnabled, tradingViewUnavailable],
  )
  const useTradingViewChart = useMemo(
    () => useRealtimeTradingViewChart || useLegacyTradingViewChart,
    [useLegacyTradingViewChart, useRealtimeTradingViewChart],
  )
  const realtimeCandleCount = pairChartState?.candles.length ?? 0
  const tvBootstrapPoints = useMemo(
    () => (useRealtimeTradingViewChart && realtimeCandleCount < 2 ? item.sparkline : undefined),
    [useRealtimeTradingViewChart, realtimeCandleCount, item.sparkline],
  )
  const streamBadgeState: StreamBadgeState | null = useRealtimeTradingViewChart
    ? (pairChartState?.status ?? 'reconnecting')
    : null
  const realtimeDisplayPriceUsd = useMemo(() => {
    const close = pairChartState?.latestCandle?.close
    if (!useRealtimeTradingViewChart || typeof close !== 'number' || !Number.isFinite(close) || close <= 0) {
      return null
    }

    return close
  }, [pairChartState?.latestCandle?.close, useRealtimeTradingViewChart])
  const displayPriceUsd = realtimeDisplayPriceUsd ?? item.priceUsd

  useEffect(() => {
    setTradingViewUnavailable(false)
    setChartRendererState('fallback')
  }, [item.mint, item.pairAddress])

  useEffect(() => {
    if (useTradingViewChart) {
      setChartRendererState((state) => (state === 'ready' ? state : 'loading'))
      return
    }

    setChartRendererState(tradingViewUnavailable ? 'error' : 'fallback')
  }, [tradingViewUnavailable, useTradingViewChart])

  return (
    <View style={styles.card}>
      {useTradingViewChart ? (
        <TradingViewMiniChart
          points={useLegacyTradingViewChart ? item.sparkline : tvBootstrapPoints}
          candles={useRealtimeTradingViewChart ? pairChartState?.candles : undefined}
          latestCandle={useRealtimeTradingViewChart ? pairChartState?.latestCandle : null}
          streamStatus={streamBadgeState ?? undefined}
          pairAddress={item.pairAddress ?? undefined}
          positiveTrend={isUp}
          onStatusChange={(status) => setChartRendererState(status)}
          onUnavailable={() => setTradingViewUnavailable(true)}
        />
      ) : (
        <MiniChart
          points={item.sparkline}
          positiveTrend={isUp}
          fullBleed
          height={chartHeight}
          candleCount={32}
          showAxis={false}
          showPriceBubble={false}
        />
      )}

      <LinearGradient
        colors={[semanticColors.overlay.topStrong, semanticColors.overlay.topClear]}
        style={styles.topShade}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[semanticColors.overlay.topClear, semanticColors.overlay.bottomMid, semanticColors.app.backgroundElevated]}
        locations={[0, 0.5, 1]}
        style={styles.bottomShade}
        pointerEvents="none"
      />

      <View style={[styles.topOverlay, { paddingTop: cardPadding, paddingHorizontal: cardPadding }]}>
        <View>
          <Text style={[styles.symbol, { fontSize: symbolSize }]}>{item.symbol}</Text>
          <Text style={[styles.name, { fontSize: nameSize }]}>{item.name}</Text>
        </View>
        <View style={styles.badgeColumn}>
          <Text
            style={[
              styles.badge,
              styles.chartSourceBadge,
              chartRendererState === 'ready' ? styles.chartSourceBadgeTv : styles.chartSourceBadgeFallback,
              { fontSize: badgeFontSize },
            ]}
          >
            {chartRendererState === 'ready' ? 'TV' : chartRendererState === 'loading' ? 'TV…' : 'FALLBACK'}
          </Text>
          {streamBadgeState ? (
            <Text style={[styles.badge, streamBadgeStyles[streamBadgeState], { fontSize: badgeFontSize }]}>
              {streamBadgeState.toUpperCase()}
            </Text>
          ) : null}
          <Text style={[styles.badge, styles.categoryBadge, { fontSize: badgeFontSize }]}>{item.category}</Text>
          <Text style={[styles.badge, riskStyles[item.riskTier], { fontSize: badgeFontSize }]}>{item.riskTier}</Text>
        </View>
      </View>

      <View style={[styles.bottomOverlay, { paddingHorizontal: cardPadding, paddingBottom: cardPadding + 6 }]}>
        <Text style={[styles.price, { fontSize: priceSize }]}>{formatUsd(displayPriceUsd)}</Text>
        <Text style={[styles.change, { fontSize: changeSize }, isUp ? styles.changeUp : styles.changeDown]}>
          {formatPercent(item.priceChange24h)}
        </Text>

        <View style={styles.metricsRow}>
          <View style={styles.metricChip}>
            <Text style={[styles.metricLabel, { fontSize: metricLabelSize }]}>24H VOL</Text>
            <Text style={[styles.metricValue, { fontSize: metricValueSize }]}>{formatCompactUsd(item.volume24h)}</Text>
          </View>
          <View style={styles.metricChip}>
            <Text style={[styles.metricLabel, { fontSize: metricLabelSize }]}>LIQUIDITY</Text>
            <Text style={[styles.metricValue, { fontSize: metricValueSize }]}>{formatCompactUsd(item.liquidity)}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

const riskStyles = StyleSheet.create({
  allow: {
    backgroundColor: semanticColors.status.success.background,
    color: semanticColors.status.success.text,
  },
  block: {
    backgroundColor: semanticColors.status.danger.background,
    color: semanticColors.status.danger.text,
  },
  warn: {
    backgroundColor: semanticColors.status.warning.background,
    color: semanticColors.status.warning.text,
  },
})

const styles = StyleSheet.create({
  badge: {
    borderRadius: 8,
    fontFamily: interFontFamily.extraBold,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  badgeColumn: {
    alignItems: 'flex-end',
    gap: 8,
  },
  bottomOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  bottomShade: {
    bottom: 0,
    height: '48%',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  card: {
    backgroundColor: semanticColors.app.backgroundElevated,
    borderColor: semanticColors.border.strong,
    borderRadius: 28,
    borderWidth: 1,
    flex: 1,
    overflow: 'hidden',
  },
  categoryBadge: {
    backgroundColor: semanticColors.status.info.background,
    color: semanticColors.status.info.text,
  },
  chartSourceBadge: {
    minWidth: 72,
  },
  chartSourceBadgeFallback: {
    backgroundColor: 'rgba(71, 85, 105, 0.72)',
    color: '#E2E8F0',
  },
  chartSourceBadgeTv: {
    backgroundColor: 'rgba(20, 83, 45, 0.82)',
    color: '#86EFAC',
  },
  change: {
    fontFamily: interFontFamily.extraBold,
    marginTop: 6,
  },
  changeDown: {
    color: semanticColors.text.danger,
  },
  changeUp: {
    color: semanticColors.text.success,
  },
  metricChip: {
    backgroundColor: semanticColors.app.backgroundPanel,
    borderColor: semanticColors.border.panel,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metricLabel: {
    color: semanticColors.text.chartLabel,
    fontFamily: interFontFamily.bold,
    marginBottom: 6,
  },
  metricValue: {
    color: semanticColors.text.bodyOnDark,
    fontFamily: interFontFamily.extraBold,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  name: {
    color: semanticColors.text.tertiary,
    fontFamily: interFontFamily.medium,
    marginTop: 2,
  },
  price: {
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.black,
    letterSpacing: 0.2,
  },
  symbol: {
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.black,
    letterSpacing: 0.4,
  },
  topOverlay: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  topShade: {
    height: '34%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
})

const streamBadgeStyles = StyleSheet.create({
  live: {
    backgroundColor: 'rgba(20, 83, 45, 0.82)',
    color: '#86EFAC',
  },
  delayed: {
    backgroundColor: 'rgba(120, 53, 15, 0.82)',
    color: '#FDBA74',
  },
  reconnecting: {
    backgroundColor: 'rgba(30, 41, 59, 0.82)',
    color: '#BFDBFE',
  },
})
