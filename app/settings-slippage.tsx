import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { SlippageScreenContent } from '@/features/settings/slippage-screen-content'
import React from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function SettingsSlippageScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <SlippageScreenContent />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: settingsDesignSpec.colors.background,
    flex: 1,
  },
})
