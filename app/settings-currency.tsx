import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { CurrencyScreenContent } from '@/features/settings/currency-screen-content'
import React from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function SettingsCurrencyScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <CurrencyScreenContent />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: settingsDesignSpec.colors.background,
    flex: 1,
  },
})
