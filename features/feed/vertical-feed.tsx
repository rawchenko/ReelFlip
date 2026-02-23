import { appStyles } from '@/constants/app-styles'
import { TokenCard } from '@/features/feed/token-card'
import { TokenFeedItem } from '@/features/feed/types'
import React, { useCallback, useState } from 'react'
import { FlatList, Text, View, useWindowDimensions } from 'react-native'

interface VerticalFeedProps {
  items: TokenFeedItem[]
  topInset?: number
}

export function VerticalFeed({ items, topInset = 96 }: VerticalFeedProps) {
  const { height: windowHeight } = useWindowDimensions()
  const [listHeight, setListHeight] = useState(windowHeight)
  const pageHeight = Math.max(listHeight - topInset, 460)

  const handleListLayout = useCallback(
    (nextHeight: number) => {
      if (Math.abs(nextHeight - listHeight) > 1) {
        setListHeight(nextHeight)
      }
    },
    [listHeight],
  )

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
      keyExtractor={(item) => item.mint}
      style={appStyles.feedList}
      onLayout={(event) => handleListLayout(event.nativeEvent.layout.height)}
      pagingEnabled
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
      renderItem={({ item }) => (
        <View style={[appStyles.feedPage, { height: pageHeight }]}>
          <TokenCard item={item} availableHeight={pageHeight} />
        </View>
      )}
    />
  )
}
