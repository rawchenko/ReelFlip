import { AccountFeatureIndex } from '@/features/account/account-feature-index'
import { NetworkFeatureIndex } from '@/features/network/network-feature-index'
import { AppConfig } from '@/constants/app-config'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import React from 'react'
import { appStyles } from '@/constants/app-styles'
import { interFontFamily } from '@/constants/typography'
import { semanticColors } from '@/constants/semantic-colors'
import { useOnboarding } from '@/features/onboarding/onboarding-provider'
import { useRouter } from 'expo-router'

export default function DebugScreen() {
  const { resetOnboarding } = useOnboarding()
  const router = useRouter()

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
            <Pressable
              onPress={() => {
                void resetOnboarding()
                router.replace('./onboarding')
              }}
              style={styles.resetButton}
            >
              <Text style={styles.resetButtonText}>Replay Onboarding</Text>
            </Pressable>
          </View>
          <AccountFeatureIndex />
          <NetworkFeatureIndex />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  resetButton: {
    alignSelf: 'flex-start',
    backgroundColor: semanticColors.app.backgroundPanel,
    borderColor: semanticColors.border.default,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resetButtonText: {
    color: semanticColors.text.secondary,
    fontFamily: interFontFamily.bold,
    fontSize: 13,
  },
})
