import { appStyles } from '@/constants/app-styles'
import { TokenCard } from '@/features/feed/token-card'
import { TokenFeedItem } from '@/features/feed/types'
import React from 'react'
import { FlatList, Text, View, useWindowDimensions } from 'react-native'

interface VerticalFeedProps {
  items: TokenFeedItem[]
}

export function VerticalFeed({ items }: VerticalFeedProps) {
  const { height } = useWindowDimensions()
  const pageHeight = Math.max(height - 96, 460)

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
      pagingEnabled
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
      renderItem={({ item }) => (
        <View style={[appStyles.feedPage, { height: pageHeight }]}>
          <TokenCard item={item} />
        </View>
      )}
    />
  )
}
