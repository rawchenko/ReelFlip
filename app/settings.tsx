import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { SettingsScreenContent } from '@/features/settings/settings-screen-content'
import React from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function SettingsScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <SettingsScreenContent />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: settingsDesignSpec.colors.background,
    flex: 1,
  },
})
