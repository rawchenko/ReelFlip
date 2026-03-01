import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import { useChartPairState } from '@/features/feed/chart/chart-store'
import type { ChartCandle } from '@/features/feed/chart/types'
import { MiniChart } from '@/features/feed/mini-chart'
import { TradingViewMiniChart } from '@/features/feed/tradingview-mini-chart'
import { FeedCardAction, FeedTradeSide, TokenFeedItem } from '@/features/feed/types'
import { Ionicons } from '@expo/vector-icons'
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

type StreamBadgeState = 'live' | 'delayed' | 'reconnecting' | 'fallback_polling'

interface ActionButtonConfig {
  action: FeedCardAction
  iconName: keyof typeof Ionicons.glyphMap
  label: string
}

const ACTION_BUTTONS: ActionButtonConfig[] = [
  { action: 'like', iconName: 'heart-outline', label: 'Like token' },
  { action: 'comment', iconName: 'chatbubble-outline', label: 'Open comments' },
  { action: 'share', iconName: 'share-social-outline', label: 'Share token' },
  { action: 'hide', iconName: 'eye-off-outline', label: 'Hide token' },
]
const CHART_COLOR_LOOKBACK_CANDLES = 60

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

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

function triggerHaptic(kind: 'selection' | 'impactLight' = 'selection') {
  const promise = kind === 'selection' ? Haptics.selectionAsync() : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  void promise.catch(() => {})
}

function getActionIconName(action: FeedCardAction, liked: boolean): keyof typeof Ionicons.glyphMap {
  if (action === 'like' && liked) {
    return 'heart'
  }

  return ACTION_BUTTONS.find((config) => config.action === action)?.iconName ?? 'ellipse-outline'
}

export function TokenCard({
  item,
  availableHeight,
  enableTradingView = false,
  onActionPress,
  onTradePress,
}: TokenCardProps) {
  const { width } = useWindowDimensions()
  const isUp24h = item.priceChange24h >= 0
  const [tradingViewUnavailable, setTradingViewUnavailable] = useState(false)
  const [liked, setLiked] = useState(false)

  const isVeryNarrow = width < 360
  const isNarrow = width < 390
  const isWide = width > 430

  const cardPadding = clamp(width * 0.048, 14, 22)
  const symbolSize = clamp(width * (isNarrow ? 0.095 : 0.105), 20, isWide ? 36 : 32)
  const badgeFontSize = clamp(width * 0.029, 10, 12)
  const metricsFontSize = clamp(width * 0.031, 11, 13)
  const ctaFontSize = clamp(width * (isVeryNarrow ? 0.043 : 0.046), 16, 22)
  const ctaHeight = clamp(width * 0.118, 46, 54)
  const actionButtonSize = clamp(width * (isNarrow ? 0.102 : 0.112), 40, 48)
  const avatarSize = clamp(width * (isNarrow ? 0.14 : 0.155), 44, 58)
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
  const streamBadgeState: StreamBadgeState | null = useRealtimeWebChart
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
    setLiked(false)
  }, [item.mint, item.pairAddress])

  const metricsValues = useMemo(
    () => ({
      marketCap: formatCompactCurrencyStable(item.marketCap),
      volume24h: formatCompactCurrencyStable(item.volume24h),
    }),
    [item.marketCap, item.volume24h],
  )

  const handleActionPress = (action: FeedCardAction) => {
    triggerHaptic('selection')
    if (action === 'like') {
      setLiked((current) => !current)
    }
    onActionPress?.(action, item)
  }

  const handleTradePress = (side: FeedTradeSide) => {
    triggerHaptic('impactLight')
    onTradePress?.(side, item)
  }

  const metricsStacked = isNarrow
  const railPanelWidth = actionButtonSize + (isNarrow ? 20 : 24)
  const bottomPanelPadding = cardPadding
  const bottomPanelTopPadding = isNarrow ? 12 : 14
  const infoEstimatedHeight = Math.max(avatarSize + (metricsStacked ? 8 : 4), metricsStacked ? 74 : 64)
  const bottomPanelHeight = clamp(
    bottomPanelTopPadding + infoEstimatedHeight + 12 + ctaHeight + bottomPanelPadding,
    148,
    210,
  )
  const chartViewportHeight = Math.max(availableHeight - bottomPanelHeight - 6, 220)
  const webChartPoints = useLegacyWebChart ? item.sparkline : tvBootstrapPoints
  const webChartCandles = useRealtimeWebChart ? tvRealtimeCandles : undefined
  const webChartLatestCandle = useRealtimeWebChart ? pairChartState?.latestCandle : null

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
      <View style={[styles.chartViewport, { right: railPanelWidth, bottom: bottomPanelHeight }]}>
        {useWebChart ? renderTradingView() : renderMiniFallback()}

        <LinearGradient
          colors={['rgba(7, 13, 26, 0)', 'rgba(7, 13, 26, 0.18)', 'rgba(7, 13, 26, 0.62)']}
          locations={[0, 0.6, 1]}
          style={styles.chartBottomFade}
          pointerEvents="none"
        />
      </View>

      <View style={[styles.rightPanel, { width: railPanelWidth, bottom: bottomPanelHeight }]}>
        <View style={[styles.rightRail, { gap: isNarrow ? 10 : 12 }]}>
        {ACTION_BUTTONS.map((config) => {
          const isLike = config.action === 'like'
          const active = isLike && liked
          return (
            <Pressable
              key={config.action}
              onPress={() => handleActionPress(config.action)}
              accessibilityRole="button"
              accessibilityLabel={config.label}
              hitSlop={8}
              style={({ pressed }) => [
                styles.actionButton,
                active ? styles.actionButtonActive : null,
                {
                  width: actionButtonSize,
                  height: actionButtonSize,
                  borderRadius: actionButtonSize / 2,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                  opacity: pressed ? 0.84 : 1,
                },
              ]}
            >
              <Ionicons
                name={getActionIconName(config.action, liked)}
                size={Math.round(actionButtonSize * 0.5)}
                color={active ? '#FCA5A5' : semanticColors.text.primary}
              />
            </Pressable>
          )
        })}
        </View>
      </View>

      <View style={[styles.bottomPanel, { height: bottomPanelHeight, paddingHorizontal: bottomPanelPadding, paddingTop: bottomPanelTopPadding, paddingBottom: bottomPanelPadding }]}>
        <View style={[styles.identityRow, { gap: isNarrow ? 10 : 12 }]}>
          <View style={[styles.avatarOuter, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}>
            {item.imageUri ? (
              <Image
                source={{ uri: item.imageUri }}
                style={{ width: avatarSize - 4, height: avatarSize - 4, borderRadius: (avatarSize - 4) / 2 }}
                resizeMode="cover"
              />
            ) : (
              <Text style={[styles.avatarFallbackText, { fontSize: Math.max(14, Math.round(avatarSize * 0.3)) }]}>
                {item.symbol.slice(0, 1).toUpperCase()}
              </Text>
            )}
          </View>

          <View style={styles.identityTextCol}>
            <View style={[styles.symbolRow, { gap: 8 }]}> 
              <Text style={[styles.symbolText, { fontSize: symbolSize }]} numberOfLines={1} ellipsizeMode="tail">
                {item.symbol}
              </Text>
              {item.category === 'new' ? (
                <View style={styles.newBadge}>
                  <Text style={[styles.newBadgeText, { fontSize: badgeFontSize }]}>NEW</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.nameText} numberOfLines={1} ellipsizeMode="tail">
              {item.name}
            </Text>

            {metricsStacked ? (
              <View style={styles.metricChipsWrap}>
                <View style={styles.metricChip}>
                  <Text style={styles.metricChipLabel}>MC</Text>
                  <Text style={[styles.metricChipValue, { fontSize: metricsFontSize }]} numberOfLines={1}>
                    {metricsValues.marketCap}
                  </Text>
                </View>
                <View style={styles.metricChip}>
                  <Text style={styles.metricChipLabel}>VOL</Text>
                  <Text style={[styles.metricChipValue, { fontSize: metricsFontSize }]} numberOfLines={1}>
                    {metricsValues.volume24h}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.metricsLineRow}>
                <Text style={[styles.metricLineText, { fontSize: metricsFontSize }]} numberOfLines={1} ellipsizeMode="tail">
                  MC {metricsValues.marketCap}
                </Text>
                <Text style={[styles.metricDot, { fontSize: metricsFontSize }]}>·</Text>
                <Text style={[styles.metricLineText, { fontSize: metricsFontSize }]} numberOfLines={1} ellipsizeMode="tail">
                  VOL {metricsValues.volume24h}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.ctaRow, { marginTop: 12, gap: 10 }]}>
          <Pressable
            onPress={() => handleTradePress('sell')}
            accessibilityRole="button"
            accessibilityLabel={`Sell ${item.symbol}`}
            style={({ pressed }) => [
              styles.ctaButton,
              styles.sellButton,
              { minHeight: ctaHeight, opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
            ]}
          >
            <Text style={[styles.ctaLabel, { fontSize: ctaFontSize }]}>Sell</Text>
          </Pressable>
          <Pressable
            onPress={() => handleTradePress('buy')}
            accessibilityRole="button"
            accessibilityLabel={`Buy ${item.symbol}`}
            style={({ pressed }) => [
              styles.ctaButton,
              styles.buyButton,
              { minHeight: ctaHeight, opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
            ]}
          >
            <Text style={[styles.ctaLabel, { fontSize: ctaFontSize }]}>Buy</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.28)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    justifyContent: 'center',
  },
  actionButtonActive: {
    backgroundColor: 'rgba(127, 29, 29, 0.28)',
    borderColor: 'rgba(252, 165, 165, 0.32)',
  },
  avatarFallbackText: {
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.extraBold,
  },
  avatarOuter: {
    alignItems: 'center',
    backgroundColor: '#5B5BD6',
    borderColor: 'rgba(196, 181, 253, 0.9)',
    borderWidth: 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bottomShade: {
    bottom: 0,
    height: '68%',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  buyButton: {
    backgroundColor: 'rgba(22, 163, 74, 0.24)',
    borderColor: 'rgba(134, 239, 172, 0.45)',
  },
  card: {
    backgroundColor: semanticColors.app.backgroundElevated,
    borderColor: semanticColors.border.strong,
    borderRadius: 28,
    borderWidth: 1,
    flex: 1,
    overflow: 'hidden',
  },
  chartBottomFade: {
    bottom: 0,
    height: '32%',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  chartViewport: {
    backgroundColor: semanticColors.chart.background,
    borderBottomColor: 'rgba(148, 163, 184, 0.08)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(148, 163, 184, 0.08)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 28,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
  },
  bottomPanel: {
    backgroundColor: 'rgba(6, 11, 22, 0.96)',
    borderTopColor: 'rgba(148, 163, 184, 0.1)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  ctaButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  ctaLabel: {
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.extraBold,
    letterSpacing: 0.2,
  },
  ctaRow: {
    flexDirection: 'row',
  },
  identityRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  identityTextCol: {
    flex: 1,
    minWidth: 0,
  },
  metricChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    borderColor: 'rgba(148, 163, 184, 0.18)',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metricChipLabel: {
    color: semanticColors.text.muted,
    fontFamily: interFontFamily.bold,
    fontSize: 10,
  },
  metricChipValue: {
    color: semanticColors.text.secondary,
    fontFamily: interFontFamily.bold,
  },
  metricChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 5,
  },
  metricDot: {
    color: semanticColors.text.muted,
    fontFamily: interFontFamily.medium,
    marginHorizontal: 4,
  },
  metricLineText: {
    color: semanticColors.text.secondary,
    flexShrink: 1,
    fontFamily: interFontFamily.bold,
  },
  metricsLineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 5,
    minWidth: 0,
  },
  nameText: {
    color: semanticColors.text.muted,
    fontFamily: interFontFamily.medium,
    fontSize: 13,
    marginTop: 1,
  },
  newBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.22)',
    borderColor: 'rgba(147, 197, 253, 0.36)',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newBadgeText: {
    color: '#93C5FD',
    fontFamily: interFontFamily.extraBold,
    letterSpacing: 0.25,
  },
  rightPanel: {
    alignItems: 'center',
    backgroundColor: 'rgba(4, 9, 19, 0.96)',
    borderLeftColor: 'rgba(148, 163, 184, 0.08)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderTopRightRadius: 28,
    justifyContent: 'center',
    paddingVertical: 12,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  rightRail: {
    alignItems: 'center',
  },
  sellButton: {
    backgroundColor: 'rgba(185, 28, 28, 0.22)',
    borderColor: 'rgba(252, 165, 165, 0.34)',
  },
  symbolRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 0,
  },
  symbolText: {
    color: semanticColors.text.headingOnDark,
    flexShrink: 1,
    fontFamily: interFontFamily.black,
    letterSpacing: 0.35,
  },
})
