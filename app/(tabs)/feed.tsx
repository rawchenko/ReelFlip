import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Button, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { appStyles } from '@/constants/app-styles'
import { VerticalFeed } from '@/features/feed/vertical-feed'
import { useFeedQuery } from '@/features/feed/api/use-feed-query'

export default function FeedScreen() {
  const { data, isLoading, isError, refetch, error } = useFeedQuery({ limit: 20 })
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    setIsManualRefreshing(true)
    try {
      await refetch()
    } finally {
      setIsManualRefreshing(false)
    }
  }, [refetch])

  if (isLoading && !data) {
    return (
      <SafeAreaView edges={['top']} style={appStyles.feedScreen}>
        <View style={appStyles.feedEmptyState}>
          <ActivityIndicator size="large" color="#f5f8ff" />
          <Text style={appStyles.feedEmptyText}>Loading feed...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (isError && !data) {
    return (
      <SafeAreaView edges={['top']} style={appStyles.feedScreen}>
        <View style={appStyles.feedEmptyState}>
          <Text style={appStyles.feedEmptyTitle}>Feed unavailable</Text>
          <Text style={appStyles.feedEmptyText}>{error instanceof Error ? error.message : 'Failed to load feed'}</Text>
          <Button title="Retry" onPress={() => void refetch()} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={appStyles.feedScreen}>
      <VerticalFeed
        items={data?.items ?? []}
        topInset={0}
        refreshing={isManualRefreshing}
        onRefresh={() => void handleRefresh()}
      />
    </SafeAreaView>
  )
}
