import React from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, View } from 'react-native'
import { appStyles } from '@/constants/app-styles'

export default function DiscoverScreen() {
  return (
    <SafeAreaView edges={['top']} style={appStyles.tabScreen}>
      <View style={appStyles.tabPlaceholder}>
        <Text style={appStyles.tabPlaceholderTitle}>Discover</Text>
        <Text style={appStyles.tabPlaceholderText}>Token discovery tools will land here in the next iteration.</Text>
      </View>
    </SafeAreaView>
  )
}
