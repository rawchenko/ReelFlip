import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import { useChartPairState } from '@/features/feed/chart/chart-store'
import type { ChartCandle } from '@/features/feed/chart/types'
import { MiniChart } from '@/features/feed/mini-chart'
import { TradingViewMiniChart } from '@/features/feed/tradingview-mini-chart'
import { FeedCardAction, FeedTradeSide, TokenFeedItem } from '@/features/feed/types'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useMemo, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

interface TokenCardProps {
  item: TokenFeedItem
  availableHeight: number
  enableTradingView?: boolean
  onActionPress?: (action: FeedCardAction, item: TokenFeedItem) => void
  onTradePress?: (side: FeedTradeSide, item: TokenFeedItem) => void
}

const CHART_COLOR_LOOKBACK_CANDLES = 60

function deriveTrendFromPoints(points?: number[]): boolean | null {
  if (!Array.isArray(points)) {
    return null
  }

  const visible = points.filter((point) => Number.isFinite(point) && point > 0)
  if (visible.length < 2) {
    return null
  }

  return (visible[visible.length - 1] ?? 0) >= (visible[0] ?? 0)
}

function deriveTrendFromCandles(candles?: ChartCandle[], latestCandle?: ChartCandle | null): boolean | null {
  const visible = Array.isArray(candles) ? candles.slice(-CHART_COLOR_LOOKBACK_CANDLES) : []

  if (visible.length >= 2) {
    const firstVisible = visible[0]
    const lastClose = latestCandle?.close ?? visible[visible.length - 1]?.close
    if (firstVisible && Number.isFinite(firstVisible.open) && Number.isFinite(lastClose)) {
      return lastClose >= firstVisible.open
    }
  }

  const single = latestCandle ?? visible[0]
  if (!single) {
    return null
  }

  if (!Number.isFinite(single.open) || !Number.isFinite(single.close)) {
    return null
  }

  return single.close >= single.open
}

function trimTrailingZeros(value: string): string {
  if (!value.includes('.')) {
    return value
  }

  return value.replace(/0+$/, '').replace(/\.$/, '')
}

function formatCompactCurrencyStable(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '--'
  }

  const abs = Math.abs(value)
  const format = (scaled: number, suffix: string) => {
    const fractionDigits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2
    return `$${trimTrailingZeros(scaled.toFixed(fractionDigits))}${suffix}`
  }

  if (abs >= 1_000_000_000_000) {
    return format(value / 1_000_000_000_000, 'T')
  }
  if (abs >= 1_000_000_000) {
    return format(value / 1_000_000_000, 'B')
  }
  if (abs >= 1_000_000) {
    return format(value / 1_000_000, 'M')
  }
  if (abs >= 1_000) {
    return format(value / 1_000, 'K')
  }

  return `$${trimTrailingZeros(value.toFixed(value >= 100 ? 0 : value >= 1 ? 2 : 4))}`
}

function formatPriceStable(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '--'
  }

  if (value >= 1) {
    return `$${trimTrailingZeros(value.toFixed(2))}`
  }

  return `$${trimTrailingZeros(value.toFixed(4))}`
}

function triggerHaptic(kind: 'selection' | 'impactLight' = 'selection') {
  const promise = kind === 'selection' ? Haptics.selectionAsync() : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  void promise.catch(() => { })
}

function getCategoryLabel(category: string): string | null {
  switch (category) {
    case 'trending':
      return 'Trending'
    case 'new':
      return 'New'
    case 'memecoin':
      return 'Meme'
    case 'gainer':
      return 'Gainer'
    default:
      return null
  }
}

export function TokenCard({
  item,
  availableHeight,
  enableTradingView = false,
  onTradePress,
}: TokenCardProps) {
  const { width } = useWindowDimensions()
  const isUp24h = item.priceChange24h >= 0
  const [tradingViewUnavailable, setTradingViewUnavailable] = useState(false)

  const hasChartPoints = Array.isArray(item.sparkline) && item.sparkline.length >= 4

  const webChartEnabled = process.env.EXPO_PUBLIC_ENABLE_TV_CHART !== 'false'
  const realtimeChartsEnabled = process.env.EXPO_PUBLIC_ENABLE_TV_REALTIME_CHART !== 'false'
  const pairChartState = useChartPairState(item.pairAddress)
  const hasPairAddress = Boolean(item.pairAddress)

  const useRealtimeWebChart = useMemo(
    () => Boolean(enableTradingView && hasPairAddress && webChartEnabled && realtimeChartsEnabled && !tradingViewUnavailable),
    [enableTradingView, hasPairAddress, realtimeChartsEnabled, tradingViewUnavailable, webChartEnabled],
  )
  const useLegacyWebChart = useMemo(
    () =>
      Boolean(enableTradingView && hasChartPoints && webChartEnabled && !realtimeChartsEnabled && !tradingViewUnavailable),
    [enableTradingView, hasChartPoints, realtimeChartsEnabled, tradingViewUnavailable, webChartEnabled],
  )
  const useWebChart = useMemo(
    () => useRealtimeWebChart || useLegacyWebChart,
    [useLegacyWebChart, useRealtimeWebChart],
  )

  const realtimeCandleCount = pairChartState?.candles.length ?? 0
  const tvBootstrapPoints = useMemo(
    () => (useRealtimeWebChart && realtimeCandleCount === 0 ? item.sparkline : undefined),
    [useRealtimeWebChart, realtimeCandleCount, item.sparkline],
  )
  const tvRealtimeCandles = useMemo(
    () => (useRealtimeWebChart && realtimeCandleCount > 0 ? pairChartState?.candles : undefined),
    [pairChartState?.candles, realtimeCandleCount, useRealtimeWebChart],
  )
  const streamBadgeState = useRealtimeWebChart
    ? (pairChartState?.status ?? 'reconnecting')
    : null
  const chartIsUp = useMemo(() => {
    if (useRealtimeWebChart) {
      const realtimeTrend = deriveTrendFromCandles(pairChartState?.candles, pairChartState?.latestCandle)
      if (realtimeTrend !== null) {
        return realtimeTrend
      }
    }

    const sparklineTrend = deriveTrendFromPoints(item.sparkline)
    if (sparklineTrend !== null) {
      return sparklineTrend
    }

    return isUp24h
  }, [isUp24h, item.sparkline, pairChartState?.candles, pairChartState?.latestCandle, useRealtimeWebChart])

  useEffect(() => {
    setTradingViewUnavailable(false)
  }, [item.mint, item.pairAddress])

  const metricsValues = useMemo(
    () => ({
      price: formatPriceStable(item.priceUsd),
      marketCap: formatCompactCurrencyStable(item.marketCap),
    }),
    [item.marketCap, item.priceUsd],
  )

  const priceChange24hFormatted = useMemo(() => {
    const sign = item.priceChange24h >= 0 ? '+' : ''
    return `${sign}${item.priceChange24h.toFixed(1)}%`
  }, [item.priceChange24h])

  const handleTradePress = (side: FeedTradeSide) => {
    triggerHaptic('impactLight')
    onTradePress?.(side, item)
  }

  // Layout calculations
  const avatarSize = 48
  const bottomPanelHeight = 300
  const chartViewportHeight = Math.max(availableHeight - bottomPanelHeight, 220)
  const webChartPoints = useLegacyWebChart ? item.sparkline : tvBootstrapPoints
  const webChartCandles = useRealtimeWebChart ? tvRealtimeCandles : undefined
  const webChartLatestCandle = useRealtimeWebChart ? pairChartState?.latestCandle : null
  const categoryLabel = getCategoryLabel(item.category)
  const descriptionText = item.description || item.name

  const renderMiniFallback = () => (
    <MiniChart
      points={item.sparkline}
      positiveTrend={chartIsUp}
      fullBleed
      feedMode
      height={chartViewportHeight}
      candleCount={32}
      showAxis={false}
      showPriceBubble={false}
    />
  )

  const renderTradingView = () => (
    <TradingViewMiniChart
      points={webChartPoints}
      candles={webChartCandles}
      latestCandle={webChartLatestCandle}
      streamStatus={streamBadgeState ?? undefined}
      pairAddress={item.pairAddress ?? undefined}
      positiveTrend={chartIsUp}
      feedMode
      onUnavailable={() => setTradingViewUnavailable(true)}
    />
  )

  return (
    <View style={styles.card}>
      {/* Chart area — full width */}
      <View style={[styles.chartViewport, { height: chartViewportHeight }]}>
        {useWebChart ? renderTradingView() : renderMiniFallback()}

        <LinearGradient
          colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.85)']}
          locations={[0, 0.5, 1]}
          style={styles.chartBottomFade}
          pointerEvents="none"
        />
      </View>

      {/* Bottom info panel */}
      <View style={styles.bottomPanel}>
        {/* Avatar */}
        <View style={[styles.avatarOuter, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}>
          {item.imageUri ? (
            <Image
              source={{ uri: item.imageUri }}
              style={{ width: avatarSize - 4, height: avatarSize - 4, borderRadius: (avatarSize - 4) / 2 }}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.avatarFallbackText}>
              {item.symbol.slice(0, 1).toUpperCase()}
            </Text>
          )}
        </View>

        {/* Symbol + badges */}
        <View style={styles.symbolRow}>
          <Text style={styles.symbolText} numberOfLines={1}>
            {item.symbol.startsWith('$') ? item.symbol : `$${item.symbol}`}
          </Text>
          {categoryLabel ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{categoryLabel}</Text>
            </View>
          ) : null}
          {item.category === 'memecoin' ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Meme</Text>
            </View>
          ) : null}
        </View>

        {/* Description */}
        <Text style={styles.descriptionText} numberOfLines={2}>
          {descriptionText} ...more
        </Text>

        {/* Metrics row */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Current Price</Text>
            <Text style={styles.metricValue}>{metricsValues.price}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>M.Cap</Text>
            <Text style={styles.metricValue}>{metricsValues.marketCap}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>24h</Text>
            <Text style={[styles.metricValue, { color: isUp24h ? semanticColors.text.success : '#E74837' }]}>
              {priceChange24hFormatted}
            </Text>
          </View>
        </View>

        {/* Buy / Sell buttons */}
        <View style={styles.ctaRow}>
          <Pressable
            onPress={() => handleTradePress('sell')}
            accessibilityRole="button"
            accessibilityLabel={`Sell ${item.symbol}`}
            style={({ pressed }) => [
              styles.ctaButton,
              styles.sellButton,
              { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
            ]}
          >
            <Text style={styles.sellLabel}>Sell</Text>
          </Pressable>
          <Pressable
            onPress={() => handleTradePress('buy')}
            accessibilityRole="button"
            accessibilityLabel={`Buy ${item.symbol}`}
            style={({ pressed }) => [
              styles.ctaButton,
              styles.buyButton,
              { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
            ]}
          >
            <Text style={styles.buyLabel}>Buy</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  avatarFallbackText: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.extraBold,
    fontSize: 18,
  },
  avatarOuter: {
    alignItems: 'center',
    backgroundColor: '#5B5BD6',
    borderColor: 'rgba(196, 181, 253, 0.9)',
    borderWidth: 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
    borderColor: 'rgba(255, 255, 255, 0.40)',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  bottomPanel: {
    gap: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  buyButton: {
    backgroundColor: semanticColors.button.buyBackground,
  },
  buyLabel: {
    color: semanticColors.button.buyText,
    fontFamily: interFontFamily.bold,
    fontSize: 18,
  },
  card: {
    backgroundColor: '#000000',
    flex: 1,
    overflow: 'hidden',
  },
  chartBottomFade: {
    bottom: 0,
    height: '40%',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  chartViewport: {
    backgroundColor: '#000000',
    overflow: 'hidden',
    width: '100%',
  },
  ctaButton: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1,
    height: 56,
    justifyContent: 'center',
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  descriptionText: {
    color: 'rgba(255, 255, 255, 0.60)',
    fontFamily: interFontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  metricCol: {
    gap: 2,
  },
  metricLabel: {
    color: '#888888',
    fontFamily: interFontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  metricValue: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.regular,
    fontSize: 20,
    letterSpacing: -0.5,
    lineHeight: 24,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 24,
  },
  sellButton: {
    backgroundColor: semanticColors.button.sellBackground,
    borderColor: semanticColors.button.sellBorder,
    borderWidth: 1,
  },
  sellLabel: {
    color: semanticColors.button.sellText,
    fontFamily: interFontFamily.bold,
    fontSize: 18,
  },
  symbolRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  symbolText: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.regular,
    fontSize: 24,
    lineHeight: 30,
  },
})
