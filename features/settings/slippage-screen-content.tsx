import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { SettingsHeader } from '@/features/settings/settings-header'
import { SettingsRadioRow } from '@/features/settings/settings-radio-row'
import { DEFAULT_ONBOARDING_LAUNCH, OnboardingSlippage, useOnboarding } from '@/features/onboarding/onboarding-provider'
import { interFontFamily } from '@/constants/typography'
import React, { useCallback } from 'react'
import { ScrollView, StyleSheet, Text } from 'react-native'

const spec = settingsDesignSpec

const OPTIONS: { value: OnboardingSlippage; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '1%', label: '1%' },
  { value: '2%', label: '2%' },
  { value: 'custom', label: 'Custom' },
]

export function SlippageScreenContent() {
  const { launchPreferences, updateLaunchPreferences } = useOnboarding()
  const current = launchPreferences?.defaultSlippage ?? DEFAULT_ONBOARDING_LAUNCH.defaultSlippage

  const handleSelect = useCallback(
    (value: OnboardingSlippage) => {
      updateLaunchPreferences({ defaultSlippage: value })
    },
    [updateLaunchPreferences],
  )

  return (
    <ScrollView style={styles.scroll}>
      <SettingsHeader title="Default Slippage" />
      <Text style={styles.description}>
        Maximum price change allowed during a swap. Higher slippage increases success but may result in a worse rate.
      </Text>
      {OPTIONS.map((option) => (
        <SettingsRadioRow
          key={option.value}
          selected={current === option.value}
          onSelect={() => handleSelect(option.value)}
          label={option.label}
        />
      ))}
      <Text style={styles.rangeNote}>Range: 0.25% – 3.00%</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  description: {
    color: spec.colors.rowSubtitle,
    fontFamily: interFontFamily.regular,
    fontSize: spec.subScreen.descriptionFontSize,
    lineHeight: spec.subScreen.descriptionLineHeight,
    paddingHorizontal: spec.subScreen.descriptionPaddingHorizontal,
    paddingVertical: spec.subScreen.descriptionPaddingVertical,
  },
  rangeNote: {
    color: spec.colors.mutedText,
    fontFamily: interFontFamily.regular,
    fontSize: spec.subScreen.rangeNoteFontSize,
    lineHeight: spec.subScreen.rangeNoteLineHeight,
    paddingHorizontal: spec.subScreen.rangeNotePaddingHorizontal,
    paddingTop: spec.subScreen.descriptionPaddingVertical,
  },
  scroll: {
    flex: 1,
  },
})
