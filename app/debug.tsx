import { AccountFeatureIndex } from '@/features/account/account-feature-index'
import { NetworkFeatureIndex } from '@/features/network/network-feature-index'
import { AppConfig } from '@/constants/app-config'
import { Text, View, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import React from 'react'
import { appStyles } from '@/constants/app-styles'
import { interFontFamily } from '@/constants/typography'

export default function DebugScreen() {
  return (
    <SafeAreaView style={appStyles.screen}>
      <ScrollView contentContainerStyle={appStyles.stack}>
        <View style={appStyles.stack}>
          <Text style={appStyles.title}>App Config</Text>
          <View style={appStyles.card}>
            <Text>
              Name <Text style={{ fontFamily: interFontFamily.bold }}>{AppConfig.identity.name}</Text>
            </Text>
            <Text>
              URL <Text style={{ fontFamily: interFontFamily.bold }}>{AppConfig.identity.uri}</Text>
            </Text>
          </View>
          <AccountFeatureIndex />
          <NetworkFeatureIndex />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
