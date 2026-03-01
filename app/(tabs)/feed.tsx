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
import { useRouter } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Button, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type FeedUiTab = 'for_you' | 'hot' | 'following'

const HEADER_ROW_HEIGHT = 56
const HEADER_BOTTOM_GAP = 10

interface FeedTabConfig {
  key: FeedUiTab
  label: string
}

const FEED_TABS: FeedTabConfig[] = [
  { key: 'for_you', label: 'For you' },
  { key: 'hot', label: 'Hot' },
  { key: 'following', label: 'Following' },
]

function triggerSelectionHaptic() {
  void Haptics.selectionAsync().catch(() => {})
}

function mapUiTabToCategory(tab: FeedUiTab): FeedCategory | undefined {
  if (tab === 'hot') {
    return 'trending'
  }

  return undefined
}

export default function FeedScreen() {
  const router = useRouter()
  const [uiTab, setUiTab] = useState<FeedUiTab>('for_you')
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [activeSheet, setActiveSheet] = useState<FeedPlaceholderSheetPayload | null>(null)

  const isFollowingTab = uiTab === 'following'
  const queryCategory = useMemo(() => mapUiTabToCategory(uiTab), [uiTab])
  const { data, isLoading, isError, refetch, error } = useFeedQuery({
    category: queryCategory,
    enabled: !isFollowingTab,
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
    router.push('/(tabs)/discover')
  }, [router])

  const handleTabPress = useCallback((nextTab: FeedUiTab) => {
    setUiTab((current) => {
      if (current !== nextTab) {
        triggerSelectionHaptic()
      }
      return nextTab
    })
  }, [])

  const contentTopPadding = HEADER_ROW_HEIGHT + HEADER_BOTTOM_GAP
  const showLoadingState = !isFollowingTab && isLoading && !data
  const showErrorState = !isFollowingTab && isError && !data

  return (
    <SafeAreaView edges={['top']} style={appStyles.feedScreen}>
      <View style={styles.screenRoot}>
        <View style={styles.headerChrome} pointerEvents="box-none">
          <View style={styles.headerRow}>
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
                    <View style={[styles.tabUnderline, selected ? styles.tabUnderlineVisible : styles.tabUnderlineHidden]} />
                  </Pressable>
                )
              })}
            </View>
            <Pressable
              onPress={handleSearchPress}
              accessibilityRole="button"
              accessibilityLabel="Open Discover tab"
              hitSlop={8}
              style={styles.searchButton}
            >
              <Ionicons name="search-outline" size={20} color={semanticColors.text.primary} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.contentContainer, { paddingTop: contentTopPadding }]}>
          {isFollowingTab ? (
            <View style={[appStyles.tabPlaceholder, styles.followingPlaceholder]}>
              <Text style={appStyles.tabPlaceholderTitle}>Following coming soon</Text>
              <Text style={appStyles.tabPlaceholderText}>
                Followed and watchlisted tokens will appear here in a future iteration.
              </Text>
              <Text style={styles.followingHint}>Use the heart action on cards (placeholder for now).</Text>
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
      </View>
      <FeedPlaceholderSheet payload={activeSheet} onClose={() => setActiveSheet(null)} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
  },
  followingHint: {
    color: semanticColors.text.info,
    fontFamily: interFontFamily.medium,
    fontSize: 14,
    textAlign: 'center',
  },
  followingPlaceholder: {
    paddingTop: 8,
  },
  headerChrome: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  headerRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(7, 13, 26, 0.68)',
    borderBottomColor: 'rgba(27, 42, 71, 0.45)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: HEADER_ROW_HEIGHT,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  screenRoot: {
    flex: 1,
  },
  searchButton: {
    alignItems: 'center',
    borderColor: 'rgba(143, 166, 204, 0.25)',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  tabButton: {
    alignItems: 'flex-start',
    gap: 5,
    minHeight: 38,
    justifyContent: 'center',
  },
  tabLabel: {
    fontFamily: interFontFamily.bold,
    fontSize: 15,
  },
  tabLabelMuted: {
    color: semanticColors.text.muted,
  },
  tabLabelSelected: {
    color: semanticColors.text.primary,
  },
  tabUnderline: {
    borderRadius: 999,
    height: 2,
    width: '100%',
  },
  tabUnderlineHidden: {
    backgroundColor: 'transparent',
  },
  tabUnderlineVisible: {
    backgroundColor: semanticColors.text.primary,
  },
  tabsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
    paddingRight: 8,
  },
})
