import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { SettingsHeader } from '@/features/settings/settings-header'
import { SettingsRadioRow } from '@/features/settings/settings-radio-row'
import { DEFAULT_ONBOARDING_LAUNCH, OnboardingSlippage, useOnboarding } from '@/features/onboarding/onboarding-provider'
import { clampSlippageBps, normalizeAmountInput } from '@/features/swap/mock-swap'
import { interFontFamily } from '@/constants/typography'
import React, { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

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
  const [customText, setCustomText] = useState(() => {
    const bps = launchPreferences?.customSlippageBps
    return bps != null ? String(bps / 100) : ''
  })

  const handleSelect = useCallback(
    (value: OnboardingSlippage) => {
      if (value === 'custom') {
        const bps = launchPreferences?.customSlippageBps ?? 100
        updateLaunchPreferences({ defaultSlippage: 'custom', customSlippageBps: bps })
        setCustomText(String(bps / 100))
      } else {
        updateLaunchPreferences({ defaultSlippage: value })
      }
    },
    [updateLaunchPreferences, launchPreferences?.customSlippageBps],
  )

  const handleCustomTextChange = useCallback(
    (text: string) => {
      const cleaned = normalizeAmountInput(text)
      setCustomText(cleaned)
      const parsed = parseFloat(cleaned)
      if (Number.isFinite(parsed) && parsed > 0) {
        const bps = clampSlippageBps(Math.round(parsed * 100))
        updateLaunchPreferences({ defaultSlippage: 'custom', customSlippageBps: bps })
      }
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
      {current === 'custom' && (
        <View style={styles.customInputRow}>
          <TextInput
            style={styles.customInput}
            value={customText}
            onChangeText={handleCustomTextChange}
            keyboardType="decimal-pad"
            placeholder="1.00"
            placeholderTextColor={spec.colors.mutedText}
            maxLength={5}
          />
          <Text style={styles.customSuffix}>%</Text>
        </View>
      )}
      <Text style={styles.rangeNote}>Range: 0.25% – 3.00%</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  customInput: {
    borderColor: spec.colors.radioBorder,
    borderRadius: 8,
    borderWidth: 1,
    color: spec.colors.rowTitle,
    flex: 1,
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  customInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spec.subScreen.descriptionPaddingHorizontal,
    paddingTop: 8,
  },
  customSuffix: {
    color: spec.colors.rowSubtitle,
    fontFamily: interFontFamily.medium,
    fontSize: 16,
  },
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
