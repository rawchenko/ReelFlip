import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { SettingsHeader } from '@/features/settings/settings-header'
import { SettingsRadioRow } from '@/features/settings/settings-radio-row'
import {
  DEFAULT_ONBOARDING_PROFILE,
  OnboardingWalletOption,
  useOnboarding,
} from '@/features/onboarding/onboarding-provider'
import { interFontFamily } from '@/constants/typography'
import React, { useCallback } from 'react'
import { ScrollView, StyleSheet, Text } from 'react-native'

const spec = settingsDesignSpec

const WALLET_OPTIONS: {
  value: OnboardingWalletOption
  label: string
  subtitle: string
}[] = [
  { value: 'seeker', label: 'Seeker', subtitle: 'Saga native wallet' },
  { value: 'walletconnect', label: 'WalletConnect', subtitle: 'Connect external wallet' },
  { value: 'import-seed-phrase', label: 'Import Seed Phrase', subtitle: 'Restore from recovery phrase' },
]

export function WalletScreenContent() {
  const { profilePreferences, updateProfilePreferences } = useOnboarding()
  const current = profilePreferences?.walletOption ?? DEFAULT_ONBOARDING_PROFILE.walletOption

  const handleSelect = useCallback(
    (value: OnboardingWalletOption) => {
      updateProfilePreferences({ walletOption: value })
    },
    [updateProfilePreferences],
  )

  return (
    <ScrollView style={styles.scroll}>
      <SettingsHeader title="Wallet" />
      <Text style={styles.description}>Choose how to connect your wallet to ReelFlip.</Text>
      {WALLET_OPTIONS.map((option) => (
        <SettingsRadioRow
          key={option.value}
          selected={current === option.value}
          onSelect={() => handleSelect(option.value)}
          label={option.label}
          subtitle={option.subtitle}
        />
      ))}
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
  scroll: {
    flex: 1,
  },
})
