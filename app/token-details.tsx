import { useLocalSearchParams } from 'expo-router'
import React, { useMemo } from 'react'
import { Text, View } from 'react-native'
import { semanticColors } from '@/constants/semantic-colors'
import type { TokenFeedItem } from '@/features/feed/types'
import { TokenDetailsScreenContent } from '@/features/token-details/token-details-screen-content'

export default function TokenDetailsScreen() {
  const { token: tokenJson } = useLocalSearchParams<{ token: string }>()

  const token = useMemo<TokenFeedItem | null>(() => {
    if (!tokenJson) {
      return null
    }

    try {
      return JSON.parse(tokenJson) as TokenFeedItem
    } catch {
      return null
    }
  }, [tokenJson])

  if (!token) {
    return (
      <View style={{ flex: 1, backgroundColor: semanticColors.app.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: semanticColors.text.muted, fontSize: 16 }}>Token not found</Text>
      </View>
    )
  }

  return <TokenDetailsScreenContent token={token} />
}
