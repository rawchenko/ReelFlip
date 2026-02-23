import React from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, View } from 'react-native'
import { appStyles } from '@/constants/app-styles'

export default function PortfolioScreen() {
  return (
    <SafeAreaView edges={['top']} style={appStyles.tabScreen}>
      <View style={appStyles.tabPlaceholder}>
        <Text style={appStyles.tabPlaceholderTitle}>Portfolio</Text>
        <Text style={appStyles.tabPlaceholderText}>Balances, holdings, and PnL summaries will appear here soon.</Text>
      </View>
    </SafeAreaView>
  )
}
