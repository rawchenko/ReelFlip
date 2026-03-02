import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import { useChartPairState } from '@/features/feed/chart/chart-store'
import type { ChartCandle } from '@/features/feed/chart/types'
import { homeDesignSpec } from '@/features/feed/home-design-spec'
import { MiniChart } from '@/features/feed/mini-chart'
import { TradingViewMiniChart } from '@/features/feed/tradingview-mini-chart'
import { FeedCardAction, FeedCategory, FeedLabel, FeedTradeSide, TokenFeedItem } from '@/features/feed/types'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useMemo, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

interface TokenCardProps {
  item: TokenFeedItem
  availableHeight: number
  enableTradingView?: boolean
  canSell?: boolean
  onActionPress?: (action: FeedCardAction, item: TokenFeedItem) => void
  onTradePress?: (side: FeedTradeSide, item: TokenFeedItem) => void
}

const CHART_COLOR_LOOKBACK_CANDLES = 60

const LABEL_PRIORITY: FeedLabel[] = ['trending', 'meme', 'gainer', 'new']

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

function mapCategoryToLabel(category: FeedCategory): FeedLabel {
  if (category === 'memecoin') {
    return 'meme'
  }

  return category
}

function formatLabel(label: FeedLabel): string {
  if (label === 'trending') {
    return 'Trending'
  }

  if (label === 'gainer') {
    return 'Gainer'
  }

  if (label === 'new') {
    return 'New'
  }

  return 'Meme'
}

function getDisplayLabels(item: Pick<TokenFeedItem, 'labels' | 'category'>): FeedLabel[] {
  const normalized = new Set<FeedLabel>()

  if (Array.isArray(item.labels)) {
    for (const label of item.labels) {
      if (LABEL_PRIORITY.includes(label)) {
        normalized.add(label)
      }
    }
  }

  if (normalized.size === 0) {
    normalized.add(mapCategoryToLabel(item.category))
  }

  return LABEL_PRIORITY.filter((label) => normalized.has(label)).slice(0, 2)
}

export function TokenCard({
  item,
  availableHeight,
  enableTradingView = false,
  canSell = false,
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

  const chartViewportHeight = useMemo(() => {
    const byScreen = Math.max(
      homeDesignSpec.card.chartMinHeight,
      Math.min(homeDesignSpec.card.chartPreferredHeight, availableHeight - 332),
    )

    return Math.min(byScreen, Math.max(homeDesignSpec.card.chartMinHeight, width - 24))
  }, [availableHeight, width])

  const chartViewportTop = useMemo(
    () => Math.max(48, Math.min(homeDesignSpec.card.chartTopOffset, availableHeight - chartViewportHeight - 280)),
    [availableHeight, chartViewportHeight],
  )

  const avatarBottomOffset = useMemo(
    () => Math.max(260, Math.min(homeDesignSpec.card.avatarBottomOffset, availableHeight - 520)),
    [availableHeight],
  )

  const webChartPoints = useLegacyWebChart ? item.sparkline : tvBootstrapPoints
  const webChartCandles = useRealtimeWebChart ? tvRealtimeCandles : undefined
  const webChartLatestCandle = useRealtimeWebChart ? pairChartState?.latestCandle : null
  const descriptionText = item.description || item.name
  const displayLabels = getDisplayLabels(item)

  const handleTradePress = (side: FeedTradeSide) => {
    triggerHaptic('impactLight')
    onTradePress?.(side, item)
  }

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
      <View style={[styles.chartViewport, { height: chartViewportHeight, top: chartViewportTop }]}>
        {useWebChart ? renderTradingView() : renderMiniFallback()}

        <LinearGradient
          colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.85)']}
          locations={[0, 0.5, 1]}
          style={styles.chartBottomFade}
          pointerEvents="none"
        />
      </View>

      <View
        style={[
          styles.avatarOuter,
          {
            width: homeDesignSpec.card.avatarSize,
            height: homeDesignSpec.card.avatarSize,
            borderRadius: homeDesignSpec.card.avatarSize / 2,
            left: homeDesignSpec.card.avatarEdgeInset,
            bottom: avatarBottomOffset,
          },
        ]}
      >
        {item.imageUri ? (
          <Image
            source={{ uri: item.imageUri }}
            style={styles.avatarImage}
            resizeMode="cover"
          />
        ) : (
          <Text style={styles.avatarFallbackText}>
            {item.symbol.slice(0, 1).toUpperCase()}
          </Text>
        )}
      </View>

      <View style={styles.bottomStack}>
        <View style={styles.infoPanel}>
          <View style={styles.symbolRow}>
            <Text style={styles.symbolText} numberOfLines={1}>
              {item.symbol.startsWith('$') ? item.symbol : `$${item.symbol}`}
            </Text>
            {displayLabels.map((label) => (
              <View key={label} style={styles.badge}>
                <Text style={styles.badgeText}>{formatLabel(label)}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.descriptionText} numberOfLines={2}>
            {descriptionText} ...more
          </Text>

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
        </View>

        <View style={styles.ctaPanel}>
          <View style={[styles.ctaRow, !canSell ? styles.ctaRowSingle : null]}>
            {canSell ? (
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
            ) : null}
            <Pressable
              onPress={() => handleTradePress('buy')}
              accessibilityRole="button"
              accessibilityLabel={`Buy ${item.symbol}`}
              style={({ pressed }) => [
                styles.ctaButton,
                styles.buyButton,
                !canSell ? styles.buyButtonOnly : null,
                { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
              ]}
            >
              <Text style={styles.buyLabel}>Buy</Text>
            </Pressable>
          </View>
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
  avatarImage: {
    borderRadius: 22,
    height: 44,
    width: 44,
  },
  avatarOuter: {
    alignItems: 'center',
    backgroundColor: '#5B5BD6',
    borderColor: 'rgba(196, 181, 253, 0.9)',
    borderWidth: 2,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    zIndex: 3,
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
    borderColor: 'rgba(255, 255, 255, 0.40)',
    borderRadius: homeDesignSpec.card.badgeRadius,
    borderWidth: 1,
    paddingHorizontal: homeDesignSpec.card.badgeHorizontalPadding,
    paddingVertical: homeDesignSpec.card.badgeVerticalPadding,
  },
  badgeText: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
  },
  bottomStack: {
    width: '100%',
  },
  buyButton: {
    backgroundColor: semanticColors.button.buyBackground,
  },
  buyLabel: {
    color: semanticColors.button.buyText,
    fontFamily: interFontFamily.bold,
    fontSize: 18,
    lineHeight: 22,
  },
  buyButtonOnly: {
    flex: 1,
  },
  card: {
    backgroundColor: '#000000',
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    paddingBottom: homeDesignSpec.card.shellBottomPadding,
    paddingTop: homeDesignSpec.card.shellTopPadding,
    position: 'relative',
  },
  chartBottomFade: {
    bottom: 0,
    height: `${homeDesignSpec.card.chartBottomFadeHeightPct * 100}%`,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  chartViewport: {
    backgroundColor: '#000000',
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    width: '100%',
  },
  ctaButton: {
    alignItems: 'center',
    borderRadius: homeDesignSpec.card.ctaRadius,
    flex: 1,
    height: homeDesignSpec.card.ctaHeight,
    justifyContent: 'center',
  },
  ctaPanel: {
    paddingBottom: homeDesignSpec.card.ctaVerticalPadding,
    paddingHorizontal: homeDesignSpec.card.ctaHorizontalPadding,
    paddingTop: homeDesignSpec.card.ctaVerticalPadding,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: homeDesignSpec.card.ctaGap,
  },
  ctaRowSingle: {
    gap: 0,
  },
  descriptionText: {
    color: '#FFFFFF99',
    fontFamily: interFontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  infoPanel: {
    gap: homeDesignSpec.card.infoGap,
    paddingBottom: homeDesignSpec.card.infoVerticalPadding,
    paddingHorizontal: homeDesignSpec.card.infoHorizontalPadding,
    paddingTop: homeDesignSpec.card.infoVerticalPadding,
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
    gap: homeDesignSpec.card.metricsGap,
    marginTop: 4,
  },
  sellButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
  },
  sellLabel: {
    color: semanticColors.button.sellText,
    fontFamily: interFontFamily.bold,
    fontSize: 18,
    lineHeight: 22,
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
