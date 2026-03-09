import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { NetworkScreenContent } from '@/features/settings/network-screen-content'
import React from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function SettingsNetworkScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <NetworkScreenContent />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: settingsDesignSpec.colors.background,
    flex: 1,
  },
})
