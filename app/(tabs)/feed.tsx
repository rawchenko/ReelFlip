import React from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { appStyles } from '@/constants/app-styles'
import { VerticalFeed } from '@/features/feed/vertical-feed'
import { mockFeed } from '@/features/feed/mock-feed'

export default function FeedScreen() {
  return (
    <SafeAreaView edges={['top']} style={appStyles.feedScreen}>
      <VerticalFeed items={mockFeed} topInset={0} />
    </SafeAreaView>
  )
}
