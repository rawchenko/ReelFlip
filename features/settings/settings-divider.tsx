import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import React from 'react'
import { StyleSheet, View } from 'react-native'

const spec = settingsDesignSpec

export function SettingsDivider() {
  return <View style={styles.divider} />
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: spec.colors.divider,
    height: spec.divider.height,
    marginBottom: spec.divider.marginBottom,
    marginHorizontal: spec.divider.marginHorizontal,
  },
})
