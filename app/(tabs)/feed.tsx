import { appStyles } from '@/constants/app-styles'
import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import { FeedResponse, fetchFeed } from '@/features/feed/api/feed-client'
import { getFeedInfiniteQueryKey, useFeedQuery, useInfiniteFeedQuery } from '@/features/feed/api/use-feed-query'
import { homeDesignSpec } from '@/features/feed/home-design-spec'
import {
  FeedPlaceholderSheetPayload,
  FeedPlaceholderSheetType,
} from '@/features/feed/feed-placeholder-sheet'
import type { SwapFlowPayload, SwapQuotePreview, SwapSuccessResult } from '@/features/swap/types'
import type { ActivityEvent } from '@/features/activity/types'
import { VerticalFeed } from '@/features/feed/vertical-feed'
import { FeedCategory, FeedCardAction, FeedTradeSide, TokenFeedItem } from '@/features/feed/types'
import { InfiniteData, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Button, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type FeedUiTab = 'for_you' | 'trending' | 'watchlist'

interface FeedTabConfig {
  key: FeedUiTab
  label: string
}

const FEED_TABS: FeedTabConfig[] = [
  { key: 'for_you', label: 'For You' },
  { key: 'trending', label: 'Trending' },
  { key: 'watchlist', label: 'Watchlist' },
]
const FEED_PAGE_LIMIT = 20
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FeedInteractionOverlays } = require('@/features/swap/swap-flow') as typeof import('@/features/swap/swap-flow')

function triggerSelectionHaptic() {
  void Haptics.selectionAsync().catch(() => { })
}

function mapUiTabToCategory(tab: FeedUiTab): FeedCategory | undefined {
  if (tab === 'trending') {
    return 'trending'
  }

  return undefined
}

export default function FeedScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [uiTab, setUiTab] = useState<FeedUiTab>('for_you')
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [activeActionSheet, setActiveActionSheet] = useState<FeedPlaceholderSheetPayload | null>(null)
  const [activeSwapFlow, setActiveSwapFlow] = useState<SwapFlowPayload | null>(null)
  const [hiddenTrendingCardKeys, setHiddenTrendingCardKeys] = useState<Set<string>>(() => new Set())
  const isTrendingTab = uiTab === 'trending'
  const strictTrendingCharts = isTrendingTab && process.env.EXPO_PUBLIC_ENABLE_TV_CHART !== 'false'
  const isWatchlistTab = uiTab === 'watchlist'
  const infiniteFeedEnabled = process.env.EXPO_PUBLIC_FEED_INFINITE_SCROLL !== 'false'
  const queryCategory = useMemo(() => mapUiTabToCategory(uiTab), [uiTab])
  const infiniteQuery = useInfiniteFeedQuery({
    category: queryCategory,
    enabled: !isWatchlistTab && infiniteFeedEnabled,
    limit: FEED_PAGE_LIMIT,
  })
  const singleQuery = useFeedQuery({
    category: queryCategory,
    enabled: !isWatchlistTab && !infiniteFeedEnabled,
    limit: FEED_PAGE_LIMIT,
  })

  const handleRefresh = useCallback(async () => {
    setIsManualRefreshing(true)
    setHiddenTrendingCardKeys(new Set())
    try {
      if (infiniteFeedEnabled) {
        const firstPage = await fetchFeed({
          category: queryCategory,
          limit: FEED_PAGE_LIMIT,
        })
        queryClient.setQueryData<InfiniteData<FeedResponse>>(
          getFeedInfiniteQueryKey(queryCategory, undefined, FEED_PAGE_LIMIT),
          (current) => {
            if (!current || current.pages.length === 0) {
              return {
                pages: [firstPage],
                pageParams: [undefined],
              }
            }

            return {
              ...current,
              pages: [firstPage, ...current.pages.slice(1)],
            }
          },
        )
      } else {
        await singleQuery.refetch()
      }
    } finally {
      setIsManualRefreshing(false)
    }
  }, [infiniteFeedEnabled, queryCategory, queryClient, singleQuery])

  const handleStrictReject = useCallback((cardKey: string, _reason: string) => {
    setHiddenTrendingCardKeys((current) => {
      if (current.has(cardKey)) {
        return current
      }

      const next = new Set(current)
      next.add(cardKey)
      return next
    })
  }, [])

  const openSheet = useCallback((type: FeedPlaceholderSheetType, item: TokenFeedItem) => {
    setActiveActionSheet({ type, item })
  }, [])

  const handleActionPress = useCallback((action: FeedCardAction, item: TokenFeedItem) => {
    openSheet(action, item)
  }, [openSheet])

  const handleTradePress = useCallback((side: FeedTradeSide, item: TokenFeedItem) => {
    setActiveSwapFlow({
      item,
      origin: 'feed',
      side,
    })
  }, [])

  const handleViewReceipt = useCallback((result: SwapSuccessResult, quote: SwapQuotePreview) => {
    const event: ActivityEvent = {
      id: result.signature,
      timestampIso: new Date().toISOString(),
      source: 'jupiter',
      type: 'swap',
      status: 'confirmed',
      primaryText: `${quote.inputAsset.symbol} → ${quote.outputAsset.symbol}`,
      secondaryText: 'Jupiter',
      receivedLeg: {
        symbol: result.receivedSymbol,
        amountDisplay: `+${result.receivedAmount} ${result.receivedSymbol}`,
        direction: 'receive',
      },
      sentLeg: {
        symbol: result.sentSymbol,
        amountDisplay: `-${result.sentAmount} ${result.sentSymbol}`,
        direction: 'send',
      },
      txSignature: result.signature,
    }
    setActiveSwapFlow(null)
    router.push({ pathname: '/tx-details', params: { event: JSON.stringify(event) } })
  }, [router])

  const handleSearchPress = useCallback(() => {
    triggerSelectionHaptic()
  }, [])

  const handleLoadMore = useCallback(() => {
    if (!infiniteFeedEnabled || !infiniteQuery.hasNextPage || infiniteQuery.isFetchingNextPage) {
      return
    }

    void infiniteQuery.fetchNextPage()
  }, [infiniteFeedEnabled, infiniteQuery])

  const handleTabPress = useCallback((nextTab: FeedUiTab) => {
    setUiTab((current) => {
      if (current !== nextTab) {
        triggerSelectionHaptic()
        if (current === 'trending') {
          setHiddenTrendingCardKeys(new Set())
        }
      }
      return nextTab
    })
  }, [])

  const items = useMemo(() => {
    const rawItems = infiniteFeedEnabled ? infiniteQuery.items : singleQuery.data?.items ?? []
    if (!isTrendingTab || hiddenTrendingCardKeys.size === 0) {
      return rawItems
    }

    return rawItems.filter((item) => {
      const cardKey = `${item.mint}:${item.pairAddress ?? 'no-pair'}`
      return !hiddenTrendingCardKeys.has(cardKey)
    })
  }, [hiddenTrendingCardKeys, infiniteFeedEnabled, infiniteQuery.items, isTrendingTab, singleQuery.data?.items])
  const isLoading = infiniteFeedEnabled ? infiniteQuery.isLoading : singleQuery.isLoading
  const isError = infiniteFeedEnabled ? infiniteQuery.isError : singleQuery.isError
  const error = infiniteFeedEnabled ? infiniteQuery.error : singleQuery.error
  const showLoadingState = !isWatchlistTab && isLoading && items.length === 0
  const showErrorState = !isWatchlistTab && isError && items.length === 0

  // Auto-refill: fetch more pages when visible trending cards drop below target
  const autoRefillInProgress = useRef(false)
  useEffect(() => {
    if (
      !strictTrendingCharts ||
      !infiniteFeedEnabled ||
      !infiniteQuery.hasNextPage ||
      infiniteQuery.isFetchingNextPage ||
      autoRefillInProgress.current ||
      items.length >= FEED_PAGE_LIMIT
    ) {
      return
    }

    autoRefillInProgress.current = true
    void infiniteQuery.fetchNextPage().finally(() => {
      autoRefillInProgress.current = false
    })
  }, [
    strictTrendingCharts,
    infiniteFeedEnabled,
    infiniteQuery.hasNextPage,
    infiniteQuery.isFetchingNextPage,
    items.length,
    infiniteQuery,
  ])

  return (
    <View style={styles.screenRoot}>
      <View style={styles.contentContainer}>
        {isWatchlistTab ? (
          <View style={[appStyles.tabPlaceholder, styles.watchlistPlaceholder]}>
            <Text style={appStyles.tabPlaceholderTitle}>Watchlist coming soon</Text>
            <Text style={appStyles.tabPlaceholderText}>
              Followed and watchlisted tokens will appear here in a future iteration.
            </Text>
          </View>
        ) : showLoadingState ? (
          <View style={appStyles.feedEmptyState}>
            <ActivityIndicator size="large" color={semanticColors.text.primary} />
            <Text style={appStyles.feedEmptyText}>Loading feed...</Text>
          </View>
        ) : showErrorState ? (
          <View style={appStyles.feedEmptyState}>
            <Text style={appStyles.feedEmptyTitle}>Feed unavailable</Text>
            <Text style={appStyles.feedEmptyText}>{error instanceof Error ? error.message : 'Failed to load feed'}</Text>
            <Button
              title="Retry"
              onPress={() => void (infiniteFeedEnabled ? infiniteQuery.refetch() : singleQuery.refetch())}
            />
          </View>
        ) : (
          <VerticalFeed
            key={uiTab}
            items={items}
            topInset={0}
            refreshing={isManualRefreshing}
            onRefresh={() => void handleRefresh()}
            onEndReached={infiniteFeedEnabled ? handleLoadMore : undefined}
            hasNextPage={infiniteFeedEnabled ? Boolean(infiniteQuery.hasNextPage) : undefined}
            isFetchingNextPage={infiniteFeedEnabled ? infiniteQuery.isFetchingNextPage : undefined}
            strictTrendingCharts={strictTrendingCharts}
            onStrictReject={strictTrendingCharts ? handleStrictReject : undefined}
            onActionPress={handleActionPress}
            onTradePress={handleTradePress}
          />
        )}
      </View>

      <SafeAreaView edges={['top']} style={styles.headerOverlay} pointerEvents="box-none">
        <LinearGradient
          colors={homeDesignSpec.header.gradientColors}
          style={styles.headerGradient}
          pointerEvents="box-none"
        >
          <View style={styles.headerRow} pointerEvents="box-none">
            <View style={styles.tabsRow} accessibilityRole="tablist">
              {FEED_TABS.map((tab) => {
                const selected = uiTab === tab.key
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => handleTabPress(tab.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${tab.label} tab`}
                    style={styles.tabButton}
                  >
                    <Text style={[styles.tabLabel, selected ? styles.tabLabelSelected : styles.tabLabelMuted]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <Pressable
              onPress={handleSearchPress}
              accessibilityRole="button"
              accessibilityLabel="Search tokens"
              hitSlop={8}
              style={styles.searchButton}
            >
              <Ionicons name="search-outline" size={homeDesignSpec.header.searchIconSize} color={semanticColors.icon.primary} />
            </Pressable>
          </View>
        </LinearGradient>
      </SafeAreaView>

      <FeedInteractionOverlays
        actionPayload={activeActionSheet}
        onCloseActionSheet={() => setActiveActionSheet(null)}
        onCloseSwapFlow={() => setActiveSwapFlow(null)}
        onViewReceipt={handleViewReceipt}
        swapPayload={activeSwapFlow}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
  },
  headerGradient: {
    paddingBottom: homeDesignSpec.header.bottomPadding,
    paddingHorizontal: homeDesignSpec.header.horizontalPadding,
    paddingTop: homeDesignSpec.header.topPadding,
  },
  headerOverlay: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  screenRoot: {
    backgroundColor: semanticColors.app.background,
    flex: 1,
  },
  searchButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  tabButton: {
    paddingBottom: 4,
    paddingVertical: 4,
  },
  tabLabel: {
    fontFamily: interFontFamily.medium,
    fontSize: 14,
    lineHeight: 18,
  },
  tabLabelMuted: {
    color: semanticColors.text.headingOnDark,
    fontWeight: '500',
    opacity: homeDesignSpec.header.mutedTabOpacity,
  },
  tabLabelSelected: {
    color: semanticColors.text.headingOnDark,
    fontWeight: '600',
    opacity: homeDesignSpec.header.selectedTabOpacity,
  },
  tabsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: homeDesignSpec.header.tabGap,
  },
  watchlistPlaceholder: {
    paddingTop: 80,
  },
})
