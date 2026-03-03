import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import { useChartPairState } from '@/features/feed/chart/chart-store'
import type { ChartCandle, ChartHistoryQuality } from '@/features/feed/chart/types'
import { homeDesignSpec } from '@/features/feed/home-design-spec'
import { MiniChart } from '@/features/feed/mini-chart'
import { TradingViewMiniChart } from '@/features/feed/tradingview-mini-chart'
import { FeedCardAction, FeedCategory, FeedLabel, FeedTradeSide, TokenFeedItem } from '@/features/feed/types'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

interface TokenCardProps {
  item: TokenFeedItem
  availableHeight: number
  enableTradingView?: boolean
  canSell?: boolean
  onActionPress?: (action: FeedCardAction, item: TokenFeedItem) => void
  onTradePress?: (side: FeedTradeSide, item: TokenFeedItem) => void
}

const CHART_COLOR_LOOKBACK_CANDLES = 60
const FEED_CARD_BUCKET_SECONDS = 5 * 60
const FEED_CARD_MAX_BUCKET_CANDLES = 72
const RUNTIME_ONLY_MIN_1M_CANDLES = 120
const REALTIME_MAX_STALENESS_SECONDS = 15 * 60
const REALTIME_MIN_UNIQUE_CLOSES = 3
const REALTIME_MIN_RELATIVE_RANGE = 0.0001
const DEFAULT_ANDROID_API_URL = 'http://10.0.2.2:3001'
const DEFAULT_IOS_API_URL = 'http://127.0.0.1:3001'

const LABEL_PRIORITY: FeedLabel[] = ['trending', 'meme', 'gainer', 'new']
type FeedCardChartMode = 'realtime_candles' | 'server_sparkline' | 'loading_skeleton'

function sanitizeSparklinePoints(points?: number[]): number[] {
  if (!Array.isArray(points)) {
    return []
  }

  return points.filter((point) => Number.isFinite(point) && point > 0)
}

function deriveTrendFromPoints(points?: number[]): boolean | null {
  const visible = sanitizeSparklinePoints(points)
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

function aggregateCandlesToBuckets(
  candles?: ChartCandle[],
  bucketSeconds: number = FEED_CARD_BUCKET_SECONDS,
  maxCandles: number = FEED_CARD_MAX_BUCKET_CANDLES,
): ChartCandle[] {
  if (!Array.isArray(candles) || candles.length === 0 || bucketSeconds <= 0) {
    return []
  }

  const sorted = candles
    .filter(
      (candle) =>
        Number.isFinite(candle.time) &&
        candle.time > 0 &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        candle.open > 0 &&
        candle.high > 0 &&
        candle.low > 0 &&
        candle.close > 0,
    )
    .slice()
    .sort((left, right) => left.time - right.time)

  if (sorted.length === 0) {
    return []
  }

  const output: ChartCandle[] = []
  let active: ChartCandle | null = null

  for (const candle of sorted) {
    const bucketTime = Math.floor(candle.time / bucketSeconds) * bucketSeconds

    if (!active || active.time !== bucketTime) {
      if (active) {
        output.push(active)
      }

      active = {
        time: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        ...(typeof candle.volume === 'number' && Number.isFinite(candle.volume) ? { volume: candle.volume } : {}),
      }
      continue
    }

    active.high = Math.max(active.high, candle.high)
    active.low = Math.min(active.low, candle.low)
    active.close = candle.close
    if (typeof candle.volume === 'number' && Number.isFinite(candle.volume)) {
      active.volume = (active.volume ?? 0) + candle.volume
    }
  }

  if (active) {
    output.push(active)
  }

  return output.slice(-maxCandles)
}

function shouldUseRealtimeCandles(
  historyQuality: ChartHistoryQuality | null | undefined,
  candleCount: number,
  nowSec: number,
  candles?: ChartCandle[],
): boolean {
  if (candleCount < 2) {
    return false
  }

  if (!historyQuality) {
    return false
  }

  if (historyQuality === 'partial' || historyQuality === 'unavailable') {
    return false
  }

  if (historyQuality === 'runtime_only' && candleCount < RUNTIME_ONLY_MIN_1M_CANDLES) {
    return false
  }

  const latest = candles?.[candles.length - 1]
  if (!latest || !Number.isFinite(latest.time) || latest.time <= 0) {
    return false
  }

  const latestAgeSec = Math.max(0, nowSec - latest.time)
  if (latestAgeSec > REALTIME_MAX_STALENESS_SECONDS) {
    return false
  }

  const closes = (candles ?? [])
    .slice(-RUNTIME_ONLY_MIN_1M_CANDLES)
    .map((candle) => candle.close)
    .filter((value) => Number.isFinite(value) && value > 0)

  if (closes.length < 2) {
    return false
  }

  const uniqueCloseCount = new Set(closes.map((value) => value.toFixed(8))).size
  const minClose = Math.min(...closes)
  const maxClose = Math.max(...closes)
  const relativeRange = minClose > 0 ? (maxClose - minClose) / minClose : 0

  if (uniqueCloseCount < REALTIME_MIN_UNIQUE_CLOSES && relativeRange < REALTIME_MIN_RELATIVE_RANGE) {
    return false
  }

  return true
}

function trimTrailingZeros(value: string): string {
  if (!value.includes('.')) {
    return value
  }

  return value.replace(/0+$/, '').replace(/\.$/, '')
}

function formatCompactCurrencyStable(value?: number | null): string {
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

function normalizeTokenImageUri(input?: string | null): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return null
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (/^ipfs:\/\//i.test(trimmed)) {
    const rawPath = trimmed.replace(/^ipfs:\/\//i, '').replace(/^ipfs\//i, '').replace(/^\/+/, '')
    return rawPath.length > 0 ? `https://ipfs.io/ipfs/${rawPath}` : null
  }

  if (/^ar:\/\//i.test(trimmed)) {
    const rawPath = trimmed.replace(/^ar:\/\//i, '').replace(/^\/+/, '')
    return rawPath.length > 0 ? `https://arweave.net/${rawPath}` : null
  }

  return null
}

function resolveImageApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL
  const baseUrl = configured && configured.length > 0 ? configured : Platform.OS === 'android' ? DEFAULT_ANDROID_API_URL : DEFAULT_IOS_API_URL
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function buildTokenImageCandidates(uri: string | null, apiBaseUrl: string): string[] {
  if (!uri) {
    return []
  }

  const candidates = [`${apiBaseUrl}/v1/image/proxy?url=${encodeURIComponent(uri)}`, uri]

  if (/\.webp($|\?)/i.test(uri)) {
    const webpProxyJpeg = `https://images.weserv.nl/?url=${encodeURIComponent(uri)}&output=jpg`
    candidates.push(webpProxyJpeg)
  }

  return Array.from(new Set(candidates))
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

function getDisplayLabels(item: Pick<TokenFeedItem, 'tags' | 'labels' | 'category'>): FeedLabel[] {
  const normalized = new Set<FeedLabel>()

  const preferred = Array.isArray(item.tags?.discovery) && item.tags.discovery.length > 0 ? item.tags.discovery : item.labels

  if (Array.isArray(preferred)) {
    for (const label of preferred) {
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

function formatTrustTag(tag: string): string {
  if (tag === 'verified') {
    return 'Verified'
  }
  if (tag === 'lst') {
    return 'LST'
  }
  if (tag === 'risk_warn') {
    return 'Risk: Warn'
  }
  if (tag === 'risk_block') {
    return 'Risk: High'
  }

  return tag.replace(/_/g, ' ').replace(/\\b\\w/g, (char) => char.toUpperCase())
}

function getTrustTags(item: Pick<TokenFeedItem, 'tags'>): string[] {
  if (!Array.isArray(item.tags?.trust)) {
    return []
  }

  return item.tags.trust.slice(0, 2)
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
  const lastChartModeLogRef = useRef<string>('')
  const [tradingViewUnavailable, setTradingViewUnavailable] = useState(false)
  const [avatarImageAttemptIndex, setAvatarImageAttemptIndex] = useState(0)
  const [realtimeEligibilityTick, setRealtimeEligibilityTick] = useState(0)
  const sparklinePoints = useMemo(() => sanitizeSparklinePoints(item.sparkline), [item.sparkline])

  const hasChartPoints = sparklinePoints.length >= 2
  const hasMiniFallbackPoints = sparklinePoints.length >= 5

  const webChartEnabled = process.env.EXPO_PUBLIC_ENABLE_TV_CHART !== 'false'
  const realtimeChartsEnabled = process.env.EXPO_PUBLIC_ENABLE_TV_REALTIME_CHART !== 'false'
  const pairChartState = useChartPairState(item.pairAddress)
  const hasPairAddress = Boolean(item.pairAddress)
  const useTradingViewChart = useMemo(
    () =>
      Boolean(
        enableTradingView &&
          webChartEnabled &&
          (hasPairAddress || hasChartPoints) &&
          !tradingViewUnavailable,
      ),
    [enableTradingView, hasChartPoints, hasPairAddress, tradingViewUnavailable, webChartEnabled],
  )

  const useRealtimeWebChart = useMemo(
    () => Boolean(useTradingViewChart && hasPairAddress && realtimeChartsEnabled),
    [hasPairAddress, realtimeChartsEnabled, useTradingViewChart],
  )

  const realtimeCandleCount = pairChartState?.candles.length ?? 0
  const realtimeHistoryQuality = pairChartState?.historyQuality ?? null
  const realtimeNowSec = useMemo(
    () => Math.floor(Date.now() / 1000),
    [pairChartState?.lastUpdateTimeMs, pairChartState?.status, realtimeCandleCount, realtimeEligibilityTick],
  )
  const realtimeCandlesEligible = useMemo(
    () =>
      useRealtimeWebChart &&
      shouldUseRealtimeCandles(realtimeHistoryQuality, realtimeCandleCount, realtimeNowSec, pairChartState?.candles),
    [pairChartState?.candles, realtimeCandleCount, realtimeHistoryQuality, realtimeNowSec, useRealtimeWebChart],
  )

  const aggregatedRealtimeCandles = useMemo(
    () => aggregateCandlesToBuckets(pairChartState?.candles, FEED_CARD_BUCKET_SECONDS, FEED_CARD_MAX_BUCKET_CANDLES),
    [pairChartState?.candles, pairChartState?.lastUpdateTimeMs],
  )
  const hasRealtimeCandlesForDisplay = useMemo(
    () => Boolean(useRealtimeWebChart && realtimeCandlesEligible && aggregatedRealtimeCandles.length >= 2),
    [aggregatedRealtimeCandles.length, realtimeCandlesEligible, useRealtimeWebChart],
  )
  const chartMode = useMemo<FeedCardChartMode>(() => {
    if (hasRealtimeCandlesForDisplay) {
      return 'realtime_candles'
    }

    if (hasChartPoints) {
      return 'server_sparkline'
    }

    return 'loading_skeleton'
  }, [hasChartPoints, hasRealtimeCandlesForDisplay])

  const showChartLoadingSkeleton = useMemo(() => {
    if (chartMode !== 'loading_skeleton') {
      return false
    }

    if (tradingViewUnavailable || !useTradingViewChart) {
      return !hasMiniFallbackPoints
    }

    return true
  }, [
    chartMode,
    hasMiniFallbackPoints,
    tradingViewUnavailable,
    useTradingViewChart,
  ])
  const tvRealtimeCandles = useMemo(
    () => (chartMode === 'realtime_candles' ? aggregatedRealtimeCandles : undefined),
    [aggregatedRealtimeCandles, chartMode],
  )
  const streamBadgeState = chartMode === 'realtime_candles'
    ? (pairChartState?.status ?? 'reconnecting')
    : null
  const imageApiBaseUrl = useMemo(() => resolveImageApiBaseUrl(), [])
  const normalizedImageUri = useMemo(() => normalizeTokenImageUri(item.imageUri), [item.imageUri])
  const avatarImageCandidates = useMemo(
    () => buildTokenImageCandidates(normalizedImageUri, imageApiBaseUrl),
    [imageApiBaseUrl, normalizedImageUri],
  )
  const activeAvatarImageUri = avatarImageCandidates[avatarImageAttemptIndex] ?? null
  const showAvatarImage = Boolean(activeAvatarImageUri)

  useEffect(() => {
    setTradingViewUnavailable(false)
  }, [item.mint, item.pairAddress])

  useEffect(() => {
    setAvatarImageAttemptIndex(0)
  }, [item.mint, normalizedImageUri])

  useEffect(() => {
    if (!useRealtimeWebChart) {
      return
    }

    const timer = setInterval(() => {
      setRealtimeEligibilityTick((value) => value + 1)
    }, 15_000)

    return () => clearInterval(timer)
  }, [useRealtimeWebChart])

  useEffect(() => {
    if (!__DEV__) {
      return
    }

    const mode = chartMode
    const logKey = `${item.mint}:${mode}:${realtimeHistoryQuality ?? 'none'}:${realtimeCandleCount >= RUNTIME_ONLY_MIN_1M_CANDLES}`
    if (lastChartModeLogRef.current === logKey) {
      return
    }
    lastChartModeLogRef.current = logKey

    console.debug('[feed-card] chart mode', {
      symbol: item.symbol,
      mint: item.mint,
      mode,
      historyQuality: realtimeHistoryQuality,
      candleCount1m: realtimeCandleCount,
      candleCount5m: aggregatedRealtimeCandles.length,
      useRealtimeWebChart,
      hasSparkline: hasChartPoints,
    })
  }, [
    aggregatedRealtimeCandles.length,
    chartMode,
    hasChartPoints,
    item.mint,
    item.symbol,
    realtimeCandleCount,
    realtimeHistoryQuality,
    useRealtimeWebChart,
  ])

  const chartIsUp = useMemo(() => {
    if (hasRealtimeCandlesForDisplay) {
      const latestRealtimeCandle = aggregatedRealtimeCandles[aggregatedRealtimeCandles.length - 1] ?? null
      const realtimeTrend = deriveTrendFromCandles(aggregatedRealtimeCandles, latestRealtimeCandle)
      if (realtimeTrend !== null) {
        return realtimeTrend
      }
    }

    const sparklineTrend = deriveTrendFromPoints(sparklinePoints)
    if (sparklineTrend !== null) {
      return sparklineTrend
    }

    return isUp24h
  }, [aggregatedRealtimeCandles, hasRealtimeCandlesForDisplay, isUp24h, sparklinePoints])

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

  const webChartPoints = chartMode === 'server_sparkline' ? sparklinePoints : undefined
  const webChartCandles = chartMode === 'realtime_candles' ? tvRealtimeCandles : undefined
  const webChartLatestCandle = chartMode === 'realtime_candles'
    ? (tvRealtimeCandles?.[tvRealtimeCandles.length - 1] ?? null)
    : null
  const descriptionText = item.description || item.name
  const displayLabels = getDisplayLabels(item)
  const trustTags = getTrustTags(item)

  const handleTradePress = (side: FeedTradeSide) => {
    triggerHaptic('impactLight')
    onTradePress?.(side, item)
  }

  const handleAvatarImageLoad = () => {
    if (__DEV__) {
      console.debug('[feed-card] avatar_loaded', {
        symbol: item.symbol,
        mint: item.mint,
        uri: activeAvatarImageUri,
      })
    }
  }

  const handleAvatarImageError = () => {
    if (__DEV__) {
      console.debug('[feed-card] avatar_error', {
        symbol: item.symbol,
        mint: item.mint,
        uri: activeAvatarImageUri,
        attempt: avatarImageAttemptIndex,
        candidateCount: avatarImageCandidates.length,
      })
    }

    setAvatarImageAttemptIndex((index) => index + 1)
  }

  const renderMiniFallback = () => (
    hasMiniFallbackPoints ? (
      <MiniChart
        points={sparklinePoints}
        positiveTrend={chartIsUp}
        fullBleed
        feedMode
        height={chartViewportHeight}
        candleCount={32}
        showAxis={false}
        showPriceBubble={false}
      />
    ) : (
      renderChartLoadingSkeleton()
    )
  )

  const renderChartLoadingSkeleton = () => (
    <View style={styles.chartLoadingSkeleton}>
      <View style={styles.chartLoadingGridLine} />
      <View style={styles.chartLoadingGridLine} />
      <View style={styles.chartLoadingGridLine} />
      <LinearGradient
        colors={['rgba(71, 85, 105, 0.12)', 'rgba(71, 85, 105, 0.28)', 'rgba(71, 85, 105, 0.08)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.chartLoadingBand}
      />
    </View>
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
        {showChartLoadingSkeleton ? renderChartLoadingSkeleton() : useTradingViewChart ? renderTradingView() : renderMiniFallback()}

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
        {showAvatarImage ? (
          <Image
            source={{ uri: activeAvatarImageUri }}
            style={styles.avatarImage}
            resizeMode="cover"
            onLoad={handleAvatarImageLoad}
            onError={handleAvatarImageError}
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

          {trustTags.length > 0 ? (
            <View style={styles.trustTagsRow}>
              {trustTags.map((tag) => (
                <View key={tag} style={styles.trustBadge}>
                  <Text style={styles.trustBadgeText}>{formatTrustTag(tag)}</Text>
                </View>
              ))}
            </View>
          ) : null}

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
  chartLoadingBand: {
    borderRadius: 999,
    height: 56,
    left: 16,
    position: 'absolute',
    right: 16,
    top: '38%',
  },
  chartLoadingGridLine: {
    backgroundColor: 'rgba(120, 130, 150, 0.16)',
    height: 1,
    width: '100%',
  },
  chartLoadingSkeleton: {
    backgroundColor: '#05070b',
    gap: 72,
    height: '100%',
    justifyContent: 'flex-start',
    paddingTop: 16,
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
  trustBadge: {
    backgroundColor: 'rgba(111, 239, 180, 0.18)',
    borderColor: 'rgba(111, 239, 180, 0.55)',
    borderRadius: homeDesignSpec.card.badgeRadius,
    borderWidth: 1,
    paddingHorizontal: homeDesignSpec.card.badgeHorizontalPadding,
    paddingVertical: homeDesignSpec.card.badgeVerticalPadding,
  },
  trustBadgeText: {
    color: '#D7FFE9',
    fontFamily: interFontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  trustTagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: -2,
  },
})
