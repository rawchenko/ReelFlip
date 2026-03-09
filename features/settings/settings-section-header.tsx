import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { interFontFamily } from '@/constants/typography'
import React from 'react'
import { StyleSheet, Text } from 'react-native'

const spec = settingsDesignSpec

export function SettingsSectionHeader({ title }: { title: string }) {
  return <Text style={styles.text}>{title}</Text>
}

const styles = StyleSheet.create({
  text: {
    color: spec.colors.sectionHeader,
    fontFamily: interFontFamily.medium,
    fontSize: spec.section.headerFontSize,
    letterSpacing: spec.section.headerLetterSpacing,
    lineHeight: spec.section.headerLineHeight,
    paddingBottom: spec.section.headerPaddingBottom,
    paddingHorizontal: spec.section.headerPaddingHorizontal,
    paddingTop: spec.section.headerPaddingTop,
    textTransform: 'uppercase',
  },
})
