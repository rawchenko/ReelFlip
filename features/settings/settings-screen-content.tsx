import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { SettingsDivider } from '@/features/settings/settings-divider'
import { SettingsHeader } from '@/features/settings/settings-header'
import { SettingsResetDialog } from '@/features/settings/settings-reset-dialog'
import { SettingsRow } from '@/features/settings/settings-row'
import { SettingsSectionHeader } from '@/features/settings/settings-section-header'
import { SettingsRowConfig, SettingsSectionConfig } from '@/features/settings/types'
import {
  DEFAULT_ONBOARDING_LAUNCH,
  DEFAULT_ONBOARDING_SAFETY,
  useOnboarding,
} from '@/features/onboarding/onboarding-provider'
import { useNetwork } from '@/features/network/use-network'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'
import React, { useCallback, useMemo, useState } from 'react'
import { Linking, ScrollView, StyleSheet } from 'react-native'

const spec = settingsDesignSpec

const SLIPPAGE_LABELS: Record<string, string> = {
  auto: 'Auto',
  '1%': '1%',
  '2%': '2%',
  custom: 'Custom',
}

const WALLET_LABELS: Record<string, string> = {
  seeker: 'Seeker',
  walletconnect: 'WalletConnect',
  'import-seed-phrase': 'Import Seed Phrase',
}

export function SettingsScreenContent() {
  const router = useRouter()
  const { launchPreferences, safetyPreferences, profilePreferences, updateSafetyPreferences, resetOnboarding } =
    useOnboarding()
  const { disconnect } = useMobileWallet()
  const { selectedNetwork } = useNetwork()
  const [showResetDialog, setShowResetDialog] = useState(false)

  const currentSlippage = launchPreferences?.defaultSlippage ?? DEFAULT_ONBOARDING_LAUNCH.defaultSlippage
  const currentCurrency = launchPreferences?.baseCurrency ?? DEFAULT_ONBOARDING_LAUNCH.baseCurrency
  const biometricEnabled = safetyPreferences?.enableBiometricSigning ?? DEFAULT_ONBOARDING_SAFETY.enableBiometricSigning
  const alertsEnabled = safetyPreferences?.enablePriceAlerts ?? DEFAULT_ONBOARDING_SAFETY.enablePriceAlerts
  const currentWallet = profilePreferences?.walletOption ?? 'seeker'

  const handleBiometricToggle = useCallback(
    (value: boolean) => {
      updateSafetyPreferences({ enableBiometricSigning: value })
    },
    [updateSafetyPreferences],
  )

  const handleAlertsToggle = useCallback(
    (value: boolean) => {
      updateSafetyPreferences({ enablePriceAlerts: value })
    },
    [updateSafetyPreferences],
  )

  const handleResetConfirm = useCallback(async () => {
    setShowResetDialog(false)
    await resetOnboarding()
    router.replace('/onboarding')
  }, [resetOnboarding, router])

  const handleTermsPress = useCallback(() => {
    void Linking.openURL('https://reelflip.app/terms')
  }, [])

  const appVersion = Constants.expoConfig?.version ?? '1.0.0'

  const sections = useMemo<SettingsSectionConfig[]>(
    () => [
      {
        title: 'Trading',
        rows: [
          {
            id: 'slippage',
            icon: 'swap-vertical-outline',
            title: 'Default Slippage',
            subtitle: SLIPPAGE_LABELS[currentSlippage] ?? currentSlippage,
            accessory: 'chevron',
            onPress: () => router.push('/settings-slippage'),
          },
          {
            id: 'currency',
            icon: 'logo-usd',
            title: 'Base Currency',
            subtitle: currentCurrency,
            accessory: 'chevron',
            onPress: () => router.push('/settings-currency'),
          },
        ],
      },
      {
        title: 'Security',
        rows: [
          {
            id: 'biometric',
            icon: 'finger-print-outline',
            title: 'Biometric Signing',
            subtitle: 'Require Face ID for transactions',
            accessory: 'toggle',
            toggleValue: biometricEnabled,
            onToggle: handleBiometricToggle,
          },
          {
            id: 'alerts',
            icon: 'notifications-outline',
            title: 'Price Alerts',
            subtitle: 'Get notified of price changes',
            accessory: 'toggle',
            toggleValue: alertsEnabled,
            onToggle: handleAlertsToggle,
          },
        ],
      },
      {
        title: 'Network',
        rows: [
          {
            id: 'network',
            icon: 'globe-outline',
            title: 'Solana Network',
            subtitle: selectedNetwork.label,
            trailingDotColor: spec.colors.greenDot,
            accessory: 'chevron',
            onPress: () => router.push('/settings-network'),
          },
          {
            id: 'wallet',
            icon: 'wallet-outline',
            title: 'Wallet',
            subtitle: WALLET_LABELS[currentWallet] ?? currentWallet,
            accessory: 'chevron',
            onPress: () => router.push('/settings-wallet'),
          },
        ],
      },
      {
        title: 'About',
        rows: [
          {
            id: 'terms',
            icon: 'document-text-outline',
            title: 'Terms of Service',
            accessory: 'external-link',
            onPress: handleTermsPress,
          },
          {
            id: 'version',
            icon: 'information-circle-outline',
            title: 'Version',
            subtitle: appVersion,
            accessory: 'none',
          },
        ],
      },
    ],
    [
      alertsEnabled,
      appVersion,
      biometricEnabled,
      currentCurrency,
      currentSlippage,
      currentWallet,
      handleAlertsToggle,
      handleBiometricToggle,
      handleTermsPress,
      router,
      selectedNetwork.label,
    ],
  )

  const dangerRows = useMemo<SettingsRowConfig[]>(
    () => [
      {
        id: 'disconnect',
        icon: 'log-out-outline',
        title: 'Disconnect Wallet',
        accessory: 'none',
        isDanger: true,
        onPress: () => {
          void disconnect()
          router.replace('/(tabs)/profile')
        },
      },
      {
        id: 'reset',
        icon: 'refresh-outline',
        title: 'Reset Onboarding',
        accessory: 'none',
        isMuted: true,
        onPress: () => setShowResetDialog(true),
      },
    ],
    [disconnect, router],
  )

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <SettingsHeader />
        {sections.map((section) => (
          <React.Fragment key={section.title}>
            <SettingsSectionHeader title={section.title} />
            {section.rows.map((row) => (
              <SettingsRow key={row.id} row={row} />
            ))}
          </React.Fragment>
        ))}
        <SettingsDivider />
        {dangerRows.map((row) => (
          <SettingsRow key={row.id} row={row} />
        ))}
      </ScrollView>
      <SettingsResetDialog
        visible={showResetDialog}
        onCancel={() => setShowResetDialog(false)}
        onConfirm={() => void handleResetConfirm()}
      />
    </>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
})
