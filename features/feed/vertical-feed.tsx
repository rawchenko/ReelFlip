import { appStyles } from '@/constants/app-styles'
import { useAccountTokenBalances } from '@/features/account/use-account-token-balances'
import { useFeedChartRealtime } from '@/features/feed/chart/use-feed-chart-realtime'
import { TokenCard } from '@/features/feed/token-card'
import { FeedCardAction, FeedTradeSide, TokenFeedItem } from '@/features/feed/types'
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, View, ViewToken, useWindowDimensions } from 'react-native'

interface VerticalFeedProps {
  items: TokenFeedItem[]
  topInset?: number
  refreshing?: boolean
  onRefresh?: () => void
  onEndReached?: () => void
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  onActionPress?: (action: FeedCardAction, item: TokenFeedItem) => void
  onTradePress?: (side: FeedTradeSide, item: TokenFeedItem) => void
}

export function VerticalFeed({
  items,
  topInset = 96,
  refreshing = false,
  onRefresh,
  onEndReached,
  hasNextPage = false,
  isFetchingNextPage = false,
  onActionPress,
  onTradePress,
}: VerticalFeedProps) {
  const { height: windowHeight } = useWindowDimensions()
  const [listHeight, setListHeight] = useState(windowHeight)
  const [activeIndex, setActiveIndex] = useState(0)
  const pageHeight = Math.max(listHeight - topInset, 460)
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 })
  const { data: ownedAmountByMint } = useAccountTokenBalances()

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const nextActive = viewableItems.find((token) => token.isViewable && typeof token.index === 'number')
      if (typeof nextActive?.index === 'number') {
        setActiveIndex(nextActive.index)
      }
    },
  )

  const initialRenderCount = useMemo(() => Math.min(items.length, 3), [items.length])
  const realtimeChartsEnabled = process.env.EXPO_PUBLIC_ENABLE_TV_REALTIME_CHART !== 'false'

  useFeedChartRealtime({
    items,
    activeIndex,
    enabled: realtimeChartsEnabled,
  })

  const handleListLayout = useCallback(
    (nextHeight: number) => {
      if (Math.abs(nextHeight - listHeight) > 1) {
        setListHeight(nextHeight)
      }
    },
    [listHeight],
  )
  const handleEndReached = useCallback(() => {
    if (!onEndReached || !hasNextPage || isFetchingNextPage) {
      return
    }

    onEndReached()
  }, [hasNextPage, isFetchingNextPage, onEndReached])
  const showPaginationFooter = Boolean(onEndReached)

  if (items.length === 0) {
    return (
      <View style={appStyles.feedEmptyState}>
        <Text style={appStyles.feedEmptyTitle}>No tokens yet</Text>
        <Text style={appStyles.feedEmptyText}>Pull down to refresh once feed data is available.</Text>
      </View>
    )
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item, index) => `${item.mint}:${item.pairAddress ?? 'no-pair'}:${index}`}
      style={appStyles.feedList}
      onLayout={(event) => handleListLayout(event.nativeEvent.layout.height)}
      initialNumToRender={initialRenderCount}
      maxToRenderPerBatch={3}
      windowSize={5}
      removeClippedSubviews
      pagingEnabled
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.6}
      onViewableItemsChanged={onViewableItemsChanged.current}
      viewabilityConfig={viewabilityConfig.current}
      getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
      ListFooterComponent={
        showPaginationFooter
          ? hasNextPage
            ? (
                <View style={styles.footerContainer}>
                  {isFetchingNextPage ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.footerText}>Loading more...</Text>
                  )}
                </View>
              )
            : (
                <View style={styles.footerContainer}>
                  <Text style={styles.footerText}>You are all caught up</Text>
                </View>
              )
          : null
      }
      renderItem={({ item, index }) => (
        <View style={[appStyles.feedPage, { height: pageHeight }]}>
          <TokenCard
            item={item}
            availableHeight={pageHeight}
            enableTradingView={Math.abs(index - activeIndex) <= 1}
            canSell={Boolean(ownedAmountByMint && (ownedAmountByMint[item.mint] ?? 0n) > 0n)}
            onActionPress={onActionPress}
            onTradePress={onTradePress}
          />
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  footerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
    paddingBottom: 24,
    paddingTop: 16,
  },
  footerText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '500',
  },
})
