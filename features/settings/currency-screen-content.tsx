import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { SettingsHeader } from '@/features/settings/settings-header'
import { SettingsRadioRow } from '@/features/settings/settings-radio-row'
import {
  DEFAULT_ONBOARDING_LAUNCH,
  OnboardingBaseCurrency,
  useOnboarding,
} from '@/features/onboarding/onboarding-provider'
import { white } from '@/constants/palette'
import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import React, { useCallback } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

const spec = settingsDesignSpec

const CURRENCY_OPTIONS: {
  value: OnboardingBaseCurrency
  label: string
  fullName: string
  iconColor: string
  iconText: string
}[] = [
  { value: 'USDC', label: 'USDC', fullName: 'USD Coin', iconColor: semanticColors.assetBadge.usdc, iconText: '$' },
  { value: 'SOL', label: 'SOL', fullName: 'Solana', iconColor: semanticColors.assetBadge.sol, iconText: '' },
  { value: 'SKR', label: 'SKR', fullName: 'Seeker', iconColor: semanticColors.assetBadge.skr, iconText: 'S' },
]

function TokenIcon({ color, text }: { color: string; text: string }) {
  return (
    <View style={[styles.tokenIcon, { backgroundColor: color }]}>
      {text ? <Text style={styles.tokenIconText}>{text}</Text> : null}
    </View>
  )
}

export function CurrencyScreenContent() {
  const { launchPreferences, updateLaunchPreferences } = useOnboarding()
  const current = launchPreferences?.baseCurrency ?? DEFAULT_ONBOARDING_LAUNCH.baseCurrency

  const handleSelect = useCallback(
    (value: OnboardingBaseCurrency) => {
      updateLaunchPreferences({ baseCurrency: value })
    },
    [updateLaunchPreferences],
  )

  return (
    <ScrollView style={styles.scroll}>
      <SettingsHeader title="Base Currency" />
      <Text style={styles.description}>Your default token for the "You Pay" side of swaps.</Text>
      {CURRENCY_OPTIONS.map((option) => (
        <SettingsRadioRow
          key={option.value}
          selected={current === option.value}
          onSelect={() => handleSelect(option.value)}
          label={option.label}
          subtitle={option.fullName}
          radioPosition="right"
          leftContent={<TokenIcon color={option.iconColor} text={option.iconText} />}
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
  tokenIcon: {
    alignItems: 'center',
    borderRadius: spec.subScreen.tokenIconSize / 2,
    height: spec.subScreen.tokenIconSize,
    justifyContent: 'center',
    width: spec.subScreen.tokenIconSize,
  },
  tokenIconText: {
    color: white,
    fontFamily: interFontFamily.bold,
    fontSize: 18,
  },
})
