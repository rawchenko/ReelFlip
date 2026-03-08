import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import { useChartPairState } from '@/features/feed/chart/chart-store'
import type { ChartHistoryQuality, ChartPoint } from '@/features/feed/chart/types'
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
  strictTrendingCharts?: boolean
  onStrictReject?: (cardKey: string, reason: string) => void
  onActionPress?: (action: FeedCardAction, item: TokenFeedItem) => void
  onTradePress?: (side: FeedTradeSide, item: TokenFeedItem) => void
}

const CHART_COLOR_LOOKBACK_POINTS = 60
const FEED_CARD_BUCKET_SECONDS = 5 * 60
const FEED_CARD_MAX_BUCKET_POINTS = 72
const RUNTIME_ONLY_MIN_1M_POINTS = 120
const REALTIME_MAX_STALENESS_SECONDS = 15 * 60
const REALTIME_MIN_UNIQUE_CLOSES = 3
const REALTIME_MIN_RELATIVE_RANGE = 0.0001
const PRICE_TWEEN_MS = 150
const PRICE_REALTIME_MIN_INTERVAL_MS = 200
const PRICE_EPSILON = 0.0000001
const DEFAULT_ANDROID_API_URL = 'http://10.0.2.2:3001'
const DEFAULT_IOS_API_URL = 'http://127.0.0.1:3001'

const LABEL_PRIORITY: FeedLabel[] = ['trending', 'meme', 'gainer', 'new']
const STRICT_TRENDING_GRACE_MS = 3000
type FeedCardChartMode = 'realtime_points' | 'server_sparkline' | 'loading_skeleton'
type FeedCardPriceSource = 'feed' | 'realtime'

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

function deriveTrendFromRealtimePoints(points?: ChartPoint[]): boolean | null {
  const visible = Array.isArray(points) ? points.slice(-CHART_COLOR_LOOKBACK_POINTS) : []
  if (visible.length < 2) {
    return null
  }

  const first = visible[0]?.value
  const last = visible[visible.length - 1]?.value
  if (!Number.isFinite(first) || !Number.isFinite(last)) {
    return null
  }

  return last >= first
}

function aggregatePointsToBuckets(
  points?: ChartPoint[],
  bucketSeconds: number = FEED_CARD_BUCKET_SECONDS,
  maxPoints: number = FEED_CARD_MAX_BUCKET_POINTS,
): ChartPoint[] {
  if (!Array.isArray(points) || points.length === 0 || bucketSeconds <= 0) {
    return []
  }

  const sorted = points
    .filter((point) => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.value) && point.value > 0)
    .slice()
    .sort((left, right) => left.time - right.time)

  if (sorted.length === 0) {
    return []
  }

  const output: ChartPoint[] = []
  let active: ChartPoint | null = null

  for (const point of sorted) {
    const bucketTime = Math.floor(point.time / bucketSeconds) * bucketSeconds

    if (!active || active.time !== bucketTime) {
      if (active) {
        output.push(active)
      }

      active = {
        time: bucketTime,
        value: point.value,
      }
      continue
    }

    active.value = point.value
  }

  if (active) {
    output.push(active)
  }

  return output.slice(-maxPoints)
}

function shouldUseRealtimePoints(
  historyQuality: ChartHistoryQuality | null | undefined,
  pointCount: number,
  nowSec: number,
  points?: ChartPoint[],
): boolean {
  if (pointCount < 2) {
    return false
  }

  if (!historyQuality) {
    return false
  }

  if (historyQuality === 'partial' || historyQuality === 'unavailable') {
    return false
  }

  if (historyQuality === 'runtime_only' && pointCount < RUNTIME_ONLY_MIN_1M_POINTS) {
    return false
  }

  const latest = points?.[points.length - 1]
  if (!latest || !Number.isFinite(latest.time) || latest.time <= 0) {
    return false
  }

  const latestAgeSec = Math.max(0, nowSec - latest.time)
  if (latestAgeSec > REALTIME_MAX_STALENESS_SECONDS) {
    return false
  }

  const values = (points ?? [])
    .slice(-RUNTIME_ONLY_MIN_1M_POINTS)
    .map((point) => point.value)
    .filter((value) => Number.isFinite(value) && value > 0)

  if (values.length < 2) {
    return false
  }

  const uniquePointCount = new Set(values.map((value) => value.toFixed(8))).size
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const relativeRange = minValue > 0 ? (maxValue - minValue) / minValue : 0

  if (uniquePointCount < REALTIME_MIN_UNIQUE_CLOSES && relativeRange < REALTIME_MIN_RELATIVE_RANGE) {
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

function sanitizePositivePrice(value?: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return value
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
    const rawPath = trimmed
      .replace(/^ipfs:\/\//i, '')
      .replace(/^ipfs\//i, '')
      .replace(/^\/+/, '')
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
  const baseUrl =
    configured && configured.length > 0
      ? configured
      : Platform.OS === 'android'
        ? DEFAULT_ANDROID_API_URL
        : DEFAULT_IOS_API_URL
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
  const promise =
    kind === 'selection' ? Haptics.selectionAsync() : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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

  const preferred =
    Array.isArray(item.tags?.discovery) && item.tags.discovery.length > 0 ? item.tags.discovery : item.labels

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
  strictTrendingCharts = false,
  onStrictReject,
  onTradePress,
}: TokenCardProps) {
  const { width } = useWindowDimensions()
  const isUp24h = item.priceChange24h >= 0
  const lastChartModeLogRef = useRef<string>('')
  const lastPriceSourceLogRef = useRef<FeedCardPriceSource | null>(null)
  const [tradingViewUnavailable, setTradingViewUnavailable] = useState(false)
  const [avatarImageAttemptIndex, setAvatarImageAttemptIndex] = useState(0)
  const [realtimeEligibilityTick, setRealtimeEligibilityTick] = useState(0)
  const [displayPriceUsd, setDisplayPriceUsd] = useState<number | undefined>(
    sanitizePositivePrice(item.priceUsd) ?? undefined,
  )
  const displayPriceRef = useRef<number | undefined>(sanitizePositivePrice(item.priceUsd) ?? undefined)
  const targetPriceRef = useRef<number | null>(sanitizePositivePrice(item.priceUsd))
  const animationFrameRef = useRef<number | null>(null)
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRealtimeCommitAtRef = useRef<number>(0)
  const pendingRealtimePriceRef = useRef<number | null>(null)
  const lastPriceSourceRef = useRef<FeedCardPriceSource>('feed')
  const sparklinePoints = useMemo(() => sanitizeSparklinePoints(item.sparkline), [item.sparkline])

  const hasChartPoints = sparklinePoints.length >= 2
  const hasMiniFallbackPoints = sparklinePoints.length >= 5

  const webChartEnabled = process.env.EXPO_PUBLIC_ENABLE_TV_CHART !== 'false'
  const realtimeChartsEnabled = process.env.EXPO_PUBLIC_ENABLE_TV_REALTIME_CHART !== 'false'
  const pairChartState = useChartPairState(item.pairAddress)
  const hasPairAddress = Boolean(item.pairAddress)
  const useTradingViewChart = useMemo(
    () =>
      Boolean(enableTradingView && webChartEnabled && (hasPairAddress || hasChartPoints) && !tradingViewUnavailable),
    [enableTradingView, hasChartPoints, hasPairAddress, tradingViewUnavailable, webChartEnabled],
  )

  const useRealtimeWebChart = useMemo(
    () => Boolean(useTradingViewChart && hasPairAddress && realtimeChartsEnabled),
    [hasPairAddress, realtimeChartsEnabled, useTradingViewChart],
  )

  const realtimePointCount = pairChartState?.points.length ?? 0
  const realtimeHistoryQuality = pairChartState?.historyQuality ?? null
  const realtimeNowSec = useMemo(
    () => Math.floor(Date.now() / 1000),
    [pairChartState?.lastUpdateTimeMs, pairChartState?.status, realtimePointCount, realtimeEligibilityTick],
  )
  const realtimePointsEligible = useMemo(
    () =>
      useRealtimeWebChart &&
      shouldUseRealtimePoints(realtimeHistoryQuality, realtimePointCount, realtimeNowSec, pairChartState?.points),
    [pairChartState?.points, realtimePointCount, realtimeHistoryQuality, realtimeNowSec, useRealtimeWebChart],
  )

  const aggregatedRealtimePoints = useMemo(
    () => aggregatePointsToBuckets(pairChartState?.points, FEED_CARD_BUCKET_SECONDS, FEED_CARD_MAX_BUCKET_POINTS),
    [pairChartState?.points, pairChartState?.lastUpdateTimeMs],
  )
  const hasRealtimePointsForDisplay = useMemo(
    () => Boolean(useRealtimeWebChart && realtimePointsEligible && aggregatedRealtimePoints.length >= 2),
    [aggregatedRealtimePoints.length, realtimePointsEligible, useRealtimeWebChart],
  )
  const chartMode = useMemo<FeedCardChartMode>(() => {
    if (hasRealtimePointsForDisplay) {
      return 'realtime_points'
    }

    if (strictTrendingCharts) {
      return 'loading_skeleton'
    }

    if (hasChartPoints) {
      return 'server_sparkline'
    }

    return 'loading_skeleton'
  }, [hasChartPoints, hasRealtimePointsForDisplay, strictTrendingCharts])

  const showChartLoadingSkeleton = useMemo(() => {
    if (chartMode !== 'loading_skeleton') {
      return false
    }

    if (tradingViewUnavailable || !useTradingViewChart) {
      return !hasMiniFallbackPoints
    }

    return true
  }, [chartMode, hasMiniFallbackPoints, tradingViewUnavailable, useTradingViewChart])
  const tvRealtimePoints = useMemo(
    () => (chartMode === 'realtime_points' ? aggregatedRealtimePoints : undefined),
    [aggregatedRealtimePoints, chartMode],
  )
  const realtimeCloseUsd = useMemo(() => {
    const realtimeLastValue = tvRealtimePoints?.[tvRealtimePoints.length - 1]?.value
    if (typeof realtimeLastValue === 'number' && Number.isFinite(realtimeLastValue) && realtimeLastValue > 0) {
      return realtimeLastValue
    }

    const latestPairClose = pairChartState?.latestPoint?.value
    if (typeof latestPairClose === 'number' && Number.isFinite(latestPairClose) && latestPairClose > 0) {
      return latestPairClose
    }

    return null
  }, [pairChartState?.latestPoint?.value, tvRealtimePoints])
  const feedSnapshotPriceUsd = useMemo(() => sanitizePositivePrice(item.priceUsd), [item.priceUsd])
  const targetPriceSource = useMemo<FeedCardPriceSource>(
    () => (chartMode === 'realtime_points' && realtimeCloseUsd !== null ? 'realtime' : 'feed'),
    [chartMode, realtimeCloseUsd],
  )
  const targetPriceUsd = useMemo(
    () => (targetPriceSource === 'realtime' ? realtimeCloseUsd : feedSnapshotPriceUsd),
    [feedSnapshotPriceUsd, realtimeCloseUsd, targetPriceSource],
  )
  const streamBadgeState = chartMode === 'realtime_points' ? (pairChartState?.status ?? 'reconnecting') : null
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
    displayPriceRef.current = displayPriceUsd
  }, [displayPriceUsd])

  useEffect(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current)
      throttleTimerRef.current = null
    }

    const initialPrice = sanitizePositivePrice(item.priceUsd) ?? undefined
    displayPriceRef.current = initialPrice
    targetPriceRef.current = initialPrice ?? null
    pendingRealtimePriceRef.current = null
    lastRealtimeCommitAtRef.current = 0
    lastPriceSourceRef.current = 'feed'
    lastPriceSourceLogRef.current = null
    setDisplayPriceUsd(initialPrice)
  }, [item.mint, item.pairAddress, item.priceUsd])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }

      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current)
        throttleTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const animatePriceTo = (nextPrice: number) => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }

      const startValue = sanitizePositivePrice(displayPriceRef.current) ?? nextPrice
      if (Math.abs(startValue - nextPrice) <= PRICE_EPSILON) {
        displayPriceRef.current = nextPrice
        setDisplayPriceUsd(nextPrice)
        return
      }

      const startedAtMs = Date.now()
      const tick = () => {
        const elapsedMs = Date.now() - startedAtMs
        const progress = Math.min(1, elapsedMs / PRICE_TWEEN_MS)
        const interpolated = startValue + (nextPrice - startValue) * progress
        displayPriceRef.current = interpolated
        setDisplayPriceUsd(interpolated)

        if (progress >= 1) {
          animationFrameRef.current = null
          displayPriceRef.current = nextPrice
          setDisplayPriceUsd(nextPrice)
          return
        }

        animationFrameRef.current = requestAnimationFrame(tick)
      }

      animationFrameRef.current = requestAnimationFrame(tick)
    }

    const commitPriceTarget = (nextPrice: number, source: FeedCardPriceSource, forceImmediate = false) => {
      const normalizedPrice = sanitizePositivePrice(nextPrice)
      if (normalizedPrice === null) {
        return
      }

      const sourceChanged = lastPriceSourceRef.current !== source
      const sameTarget =
        targetPriceRef.current !== null && Math.abs(targetPriceRef.current - normalizedPrice) <= PRICE_EPSILON
      if (sameTarget && !sourceChanged) {
        return
      }

      targetPriceRef.current = normalizedPrice
      lastPriceSourceRef.current = source

      const runCommit = (value: number) => {
        animatePriceTo(value)
        if (source === 'realtime') {
          lastRealtimeCommitAtRef.current = Date.now()
        }
      }

      if (source !== 'realtime' || sourceChanged || forceImmediate) {
        if (throttleTimerRef.current) {
          clearTimeout(throttleTimerRef.current)
          throttleTimerRef.current = null
        }
        pendingRealtimePriceRef.current = null
        runCommit(normalizedPrice)
        return
      }

      const nowMs = Date.now()
      const elapsedMs = nowMs - lastRealtimeCommitAtRef.current
      if (elapsedMs >= PRICE_REALTIME_MIN_INTERVAL_MS) {
        if (throttleTimerRef.current) {
          clearTimeout(throttleTimerRef.current)
          throttleTimerRef.current = null
        }
        pendingRealtimePriceRef.current = null
        runCommit(normalizedPrice)
        return
      }

      pendingRealtimePriceRef.current = normalizedPrice
      if (throttleTimerRef.current) {
        return
      }

      const waitMs = PRICE_REALTIME_MIN_INTERVAL_MS - elapsedMs
      throttleTimerRef.current = setTimeout(() => {
        throttleTimerRef.current = null
        const pendingPrice = pendingRealtimePriceRef.current
        pendingRealtimePriceRef.current = null
        if (pendingPrice === null) {
          return
        }

        runCommit(pendingPrice)
      }, waitMs)
    }

    if (targetPriceUsd === null) {
      return
    }

    const sourceChanged = lastPriceSourceRef.current !== targetPriceSource
    commitPriceTarget(targetPriceUsd, targetPriceSource, sourceChanged)
  }, [targetPriceSource, targetPriceUsd])

  useEffect(() => {
    if (!useRealtimeWebChart) {
      return
    }

    const timer = setInterval(() => {
      setRealtimeEligibilityTick((value) => value + 1)
    }, 15_000)

    return () => clearInterval(timer)
  }, [useRealtimeWebChart])

  // Strict trending grace timer: reject card if realtime not ready within 3s
  const strictRejectedRef = useRef(false)
  const strictCardKey = useMemo(
    () => `${item.mint}:${item.pairAddress ?? 'no-pair'}`,
    [item.mint, item.pairAddress],
  )

  useEffect(() => {
    if (!strictTrendingCharts || !enableTradingView) {
      return
    }

    if (hasRealtimePointsForDisplay || strictRejectedRef.current) {
      return
    }

    const graceTimer = setTimeout(() => {
      if (!strictRejectedRef.current) {
        strictRejectedRef.current = true
        onStrictReject?.(strictCardKey, 'no_realtime_within_grace')
      }
    }, STRICT_TRENDING_GRACE_MS)

    return () => clearTimeout(graceTimer)
  }, [strictTrendingCharts, enableTradingView, hasRealtimePointsForDisplay, strictCardKey, onStrictReject])

  // Reset rejection state when card identity changes
  useEffect(() => {
    strictRejectedRef.current = false
  }, [item.mint, item.pairAddress])

  useEffect(() => {
    if (!__DEV__) {
      return
    }

    const mode = chartMode
    const logKey = `${item.mint}:${mode}:${realtimeHistoryQuality ?? 'none'}:${realtimePointCount >= RUNTIME_ONLY_MIN_1M_POINTS}:${targetPriceSource}`
    if (lastChartModeLogRef.current === logKey) {
      return
    }
    lastChartModeLogRef.current = logKey
    const previousPriceSource = lastPriceSourceLogRef.current
    const modeTransition =
      previousPriceSource && previousPriceSource !== targetPriceSource
        ? `${previousPriceSource}->${targetPriceSource}`
        : null
    lastPriceSourceLogRef.current = targetPriceSource

    console.debug('[feed-card] chart mode', {
      symbol: item.symbol,
      mint: item.mint,
      mode,
      historyQuality: realtimeHistoryQuality,
      pointCount1m: realtimePointCount,
      pointCount5m: aggregatedRealtimePoints.length,
      useRealtimeWebChart,
      hasSparkline: hasChartPoints,
      priceSource: targetPriceSource,
      targetPriceUsd: targetPriceUsd ?? null,
      displayPriceUsd: displayPriceUsd ?? null,
      modeTransition,
    })
  }, [
    aggregatedRealtimePoints.length,
    chartMode,
    displayPriceUsd,
    hasChartPoints,
    item.mint,
    item.symbol,
    realtimePointCount,
    realtimeHistoryQuality,
    targetPriceSource,
    targetPriceUsd,
    useRealtimeWebChart,
  ])

  const chartIsUp = useMemo(() => {
    if (hasRealtimePointsForDisplay) {
      const realtimeTrend = deriveTrendFromRealtimePoints(aggregatedRealtimePoints)
      if (realtimeTrend !== null) {
        return realtimeTrend
      }
    }

    const sparklineTrend = deriveTrendFromPoints(sparklinePoints)
    if (sparklineTrend !== null) {
      return sparklineTrend
    }

    return isUp24h
  }, [aggregatedRealtimePoints, hasRealtimePointsForDisplay, isUp24h, sparklinePoints])

  const metricsValues = useMemo(
    () => ({
      price: formatPriceStable(displayPriceUsd ?? item.priceUsd),
      marketCap: formatCompactCurrencyStable(item.marketCap),
    }),
    [displayPriceUsd, item.marketCap, item.priceUsd],
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

  const webChartRealtimePoints = chartMode === 'realtime_points' ? tvRealtimePoints : undefined
  const webChartPoints =
    chartMode === 'realtime_points'
      ? webChartRealtimePoints?.map((point) => point.value)
      : chartMode === 'server_sparkline'
        ? sparklinePoints
        : undefined
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

  const renderMiniFallback = () =>
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

  const renderChartLoadingSkeleton = () => (
    <View style={styles.chartLoadingSkeleton}>
      <View style={styles.chartLoadingGridLine} />
      <View style={styles.chartLoadingGridLine} />
      <View style={styles.chartLoadingGridLine} />
      <LinearGradient
        colors={semanticColors.chart.skeletonLoadColors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.chartLoadingBand}
      />
    </View>
  )

  const renderTradingView = () => (
    <TradingViewMiniChart
      points={webChartPoints}
      latestPoint={webChartRealtimePoints?.[webChartRealtimePoints.length - 1] ?? null}
      streamStatus={streamBadgeState ?? undefined}
      pairAddress={item.pairAddress ?? undefined}
      positiveTrend={chartIsUp}
      feedMode
      onUnavailable={() => {
        setTradingViewUnavailable(true)
        if (strictTrendingCharts && !strictRejectedRef.current) {
          strictRejectedRef.current = true
          onStrictReject?.(strictCardKey, 'renderer_unavailable')
        }
      }}
    />
  )

  return (
    <View style={styles.card}>
      <View style={[styles.chartViewport, { height: chartViewportHeight, top: chartViewportTop }]}>
        {showChartLoadingSkeleton
          ? renderChartLoadingSkeleton()
          : useTradingViewChart
            ? renderTradingView()
            : strictTrendingCharts
              ? renderChartLoadingSkeleton()
              : renderMiniFallback()}
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
          <Text style={styles.avatarFallbackText}>{item.symbol.slice(0, 1).toUpperCase()}</Text>
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
              <Text style={[styles.metricValue, { color: isUp24h ? semanticColors.text.success : semanticColors.text.danger }]}>
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
    color: semanticColors.avatar.fallbackText,
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
    backgroundColor: semanticColors.avatar.fallbackBackground,
    borderColor: semanticColors.avatar.fallbackBorder,
    borderWidth: 2,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    zIndex: 3,
  },
  badge: {
    backgroundColor: semanticColors.button.sellBackground,
    borderColor: semanticColors.button.sellBorder,
    borderRadius: homeDesignSpec.card.badgeRadius,
    borderWidth: 1,
    paddingHorizontal: homeDesignSpec.card.badgeHorizontalPadding,
    paddingVertical: homeDesignSpec.card.badgeVerticalPadding,
  },
  badgeText: {
    color: semanticColors.text.headingOnDark,
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
    backgroundColor: semanticColors.app.background,
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    paddingBottom: homeDesignSpec.card.shellBottomPadding,
    paddingTop: homeDesignSpec.card.shellTopPadding,
    position: 'relative',
  },
  chartViewport: {
    backgroundColor: semanticColors.app.background,
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
    backgroundColor: semanticColors.chart.skeleton,
    height: 1,
    width: '100%',
  },
  chartLoadingSkeleton: {
    backgroundColor: semanticColors.chart.feedBackground,
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
    color: semanticColors.text.dimmed,
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
    color: semanticColors.text.neutralMuted,
    fontFamily: interFontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  metricValue: {
    color: semanticColors.text.headingOnDark,
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
    backgroundColor: semanticColors.button.sellBackground,
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
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.regular,
    fontSize: 24,
    lineHeight: 30,
  },
  trustBadge: {
    backgroundColor: semanticColors.trust.background,
    borderColor: semanticColors.trust.border,
    borderRadius: homeDesignSpec.card.badgeRadius,
    borderWidth: 1,
    paddingHorizontal: homeDesignSpec.card.badgeHorizontalPadding,
    paddingVertical: homeDesignSpec.card.badgeVerticalPadding,
  },
  trustBadgeText: {
    color: semanticColors.trust.text,
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
