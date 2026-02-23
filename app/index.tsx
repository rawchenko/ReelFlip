import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import React from 'react'
import { appStyles } from '@/constants/app-styles'
import { VerticalFeed } from '@/features/feed/vertical-feed'
import { mockFeed } from '@/features/feed/mock-feed'
import { Link } from 'expo-router'

export default function HomeScreen() {
  return (
    <SafeAreaView style={appStyles.feedScreen}>
      <View style={appStyles.feedHeader}>
        <Text style={appStyles.feedTitle}>ReelFlip</Text>
        <Link href="./debug" style={appStyles.feedDebugLink}>
          Debug
        </Link>
      </View>
      <VerticalFeed items={mockFeed} />
    </SafeAreaView>
  )
}
