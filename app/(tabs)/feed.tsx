import { appStyles } from '@/constants/app-styles'
import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import { useFeedQuery } from '@/features/feed/api/use-feed-query'
import {
  FeedPlaceholderSheet,
  FeedPlaceholderSheetPayload,
  FeedPlaceholderSheetType,
} from '@/features/feed/feed-placeholder-sheet'
import { VerticalFeed } from '@/features/feed/vertical-feed'
import { FeedCategory, FeedCardAction, FeedTradeSide, TokenFeedItem } from '@/features/feed/types'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useCallback, useMemo, useState } from 'react'
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
  const [uiTab, setUiTab] = useState<FeedUiTab>('for_you')
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [activeSheet, setActiveSheet] = useState<FeedPlaceholderSheetPayload | null>(null)

  const isWatchlistTab = uiTab === 'watchlist'
  const queryCategory = useMemo(() => mapUiTabToCategory(uiTab), [uiTab])
  const { data, isLoading, isError, refetch, error } = useFeedQuery({
    category: queryCategory,
    enabled: !isWatchlistTab,
    limit: 20,
  })

  const handleRefresh = useCallback(async () => {
    setIsManualRefreshing(true)
    try {
      await refetch()
    } finally {
      setIsManualRefreshing(false)
    }
  }, [refetch])

  const openSheet = useCallback((type: FeedPlaceholderSheetType, item: TokenFeedItem) => {
    setActiveSheet({ type, item })
  }, [])

  const handleActionPress = useCallback((action: FeedCardAction, item: TokenFeedItem) => {
    openSheet(action, item)
  }, [openSheet])

  const handleTradePress = useCallback((side: FeedTradeSide, item: TokenFeedItem) => {
    openSheet(side, item)
  }, [openSheet])

  const handleSearchPress = useCallback(() => {
    triggerSelectionHaptic()
  }, [])

  const handleTabPress = useCallback((nextTab: FeedUiTab) => {
    setUiTab((current) => {
      if (current !== nextTab) {
        triggerSelectionHaptic()
      }
      return nextTab
    })
  }, [])

  const showLoadingState = !isWatchlistTab && isLoading && !data
  const showErrorState = !isWatchlistTab && isError && !data

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
            <Button title="Retry" onPress={() => void refetch()} />
          </View>
        ) : (
          <VerticalFeed
            key={uiTab}
            items={data?.items ?? []}
            topInset={0}
            refreshing={isManualRefreshing}
            onRefresh={() => void handleRefresh()}
            onActionPress={handleActionPress}
            onTradePress={handleTradePress}
          />
        )}
      </View>

      <SafeAreaView edges={['top']} style={styles.headerOverlay} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.80)', 'rgba(0, 0, 0, 0)']}
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
              <Ionicons name="search-outline" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </LinearGradient>
      </SafeAreaView>

      <FeedPlaceholderSheet payload={activeSheet} onClose={() => setActiveSheet(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
  },
  headerGradient: {
    paddingBottom: 20,
    paddingHorizontal: 24,
    paddingTop: 16,
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
    fontFamily: interFontFamily.bold,
    fontSize: 14,
    lineHeight: 18,
  },
  tabLabelMuted: {
    color: '#FFFFFF',
    opacity: 0.6,
  },
  tabLabelSelected: {
    color: '#FFFFFF',
  },
  tabsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  watchlistPlaceholder: {
    paddingTop: 80,
  },
})
