import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { WalletScreenContent } from '@/features/settings/wallet-screen-content'
import React from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function SettingsWalletScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <WalletScreenContent />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: settingsDesignSpec.colors.background,
    flex: 1,
  },
})
