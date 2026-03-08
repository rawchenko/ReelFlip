import { Ionicons } from '@expo/vector-icons'
import { Redirect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import {
  DEFAULT_ONBOARDING_LAUNCH,
  OnboardingBaseCurrency,
  OnboardingSlippage,
  useOnboarding,
} from '@/features/onboarding/onboarding-provider'

const SLIPPAGE_OPTIONS: OnboardingSlippage[] = ['auto', '1%', '2%', 'custom']
const SLIPPAGE_LABELS: Record<OnboardingSlippage, string> = {
  '1%': '1%',
  '2%': '2%',
  auto: 'Auto',
  custom: 'Custom',
}

const BASE_CURRENCY_OPTIONS: OnboardingBaseCurrency[] = ['USDC', 'SOL', 'SKR']

export default function OnboardingFourScreen() {
  const router = useRouter()
  const {
    completeOnboardingLaunch,
    hasCompletedOnboarding,
    hasCompletedOnboardingIntro,
    hasCompletedOnboardingLaunch,
    hasCompletedOnboardingProfile,
    hasCompletedOnboardingSafety,
    hasHydrated,
    launchPreferences,
  } = useOnboarding()

  const [defaultSlippage, setDefaultSlippage] = useState<OnboardingSlippage>(
    launchPreferences?.defaultSlippage ?? DEFAULT_ONBOARDING_LAUNCH.defaultSlippage,
  )
  const [baseCurrency, setBaseCurrency] = useState<OnboardingBaseCurrency>(
    launchPreferences?.baseCurrency ?? DEFAULT_ONBOARDING_LAUNCH.baseCurrency,
  )

  const persistPreferences = useCallback(async () => {
    await completeOnboardingLaunch({
      baseCurrency,
      defaultSlippage,
    })
    router.replace('./onboarding-5')
  }, [baseCurrency, completeOnboardingLaunch, defaultSlippage, router])

  if (!hasHydrated) {
    return null
  }

  if (hasCompletedOnboarding) {
    return <Redirect href="/(tabs)/feed" />
  }

  if (!hasCompletedOnboardingIntro || !hasCompletedOnboardingProfile) {
    return <Redirect href="./onboarding" />
  }

  if (!hasCompletedOnboardingSafety) {
    return <Redirect href="./onboarding-3" />
  }

  if (hasCompletedOnboardingLaunch) {
    return <Redirect href="./onboarding-5" />
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.copyWrap}>
          <Text style={styles.title}>Trading Defaults</Text>
          <Text style={styles.subtitle}>Customize your speed for 1-tap buys on Solana.</Text>
        </View>

        <View style={styles.settingsWrap}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Default Slippage</Text>
              <Ionicons color={semanticColors.icon.neutralMuted} name="information-circle-outline" size={20} />
            </View>

            <View style={styles.segmentRow}>
              {SLIPPAGE_OPTIONS.map((option) => {
                const selected = defaultSlippage === option
                const customOption = option === 'custom'
                return (
                  <Pressable
                    key={option}
                    accessibilityLabel={`Set default slippage to ${SLIPPAGE_LABELS[option]}`}
                    accessibilityRole="button"
                    onPress={() => setDefaultSlippage(option)}
                    style={({ pressed }) => [
                      styles.segmentButton,
                      customOption && !selected ? styles.segmentButtonCustom : styles.segmentButtonDefault,
                      selected ? styles.segmentButtonSelected : styles.segmentButtonUnselected,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={[styles.segmentText, selected ? styles.segmentTextSelectedOnLight : styles.segmentTextMuted]}>
                      {SLIPPAGE_LABELS[option]}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Base Currency</Text>

            <View style={styles.currencyList}>
              {BASE_CURRENCY_OPTIONS.map((option) => {
                const selected = baseCurrency === option
                return (
                  <Pressable
                    key={option}
                    accessibilityLabel={`Set base currency to ${option}`}
                    accessibilityRole="button"
                    onPress={() => setBaseCurrency(option)}
                    style={({ pressed }) => [
                      styles.currencyCard,
                      selected ? styles.currencyCardSelected : styles.currencyCardUnselected,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <View style={styles.currencyLeft}>
                      <View style={[styles.currencyBadge, selected ? styles.currencyBadgeSelected : styles.currencyBadgeUnselected]}>
                        <Text style={[styles.currencyBadgeText, selected ? styles.currencyTextSelected : styles.segmentTextMuted]}>
                          {option === 'USDC' ? '$' : 'S'}
                        </Text>
                      </View>
                      <Text style={[styles.currencyLabel, selected ? styles.currencyTextSelected : styles.segmentTextMuted]}>
                        {option}
                      </Text>
                    </View>
                    <View style={[styles.radioOuter, selected ? styles.radioOuterSelected : styles.radioOuterUnselected]}>
                      {selected ? <View style={styles.radioInner} /> : null}
                    </View>
                  </Pressable>
                )
              })}
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityLabel="Continue to finish onboarding"
            accessibilityRole="button"
            onPress={() => void persistPreferences()}
            style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  copyWrap: {
    gap: 8,
    marginBottom: 48,
    marginTop: 40,
  },
  currencyBadge: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  currencyBadgeSelected: {
    backgroundColor: semanticColors.border.subtle,
  },
  currencyBadgeText: {
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 20,
  },
  currencyBadgeUnselected: {
    backgroundColor: semanticColors.app.backgroundDark,
  },
  currencyCard: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 66,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  currencyCardSelected: {
    backgroundColor: semanticColors.app.backgroundPanelAlt,
    borderColor: semanticColors.border.subtle,
  },
  currencyCardUnselected: {
    backgroundColor: semanticColors.app.backgroundDeep,
    borderColor: semanticColors.border.subtleDark,
  },
  currencyLabel: {
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 20,
  },
  currencyTextSelected: {
    color: semanticColors.text.headingOnDark,
  },
  currencyLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  currencyList: {
    gap: 12,
  },
  footer: {
    gap: 16,
    paddingBottom: 24,
  },
  pressed: {
    opacity: 0.8,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: semanticColors.button.buyBackground,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: semanticColors.button.buyText,
    fontFamily: interFontFamily.bold,
    fontSize: 18,
    lineHeight: 22,
  },
  radioInner: {
    backgroundColor: semanticColors.text.headingOnDark,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  radioOuter: {
    alignItems: 'center',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioOuterSelected: {
    borderColor: semanticColors.text.headingOnDark,
    borderWidth: 2,
  },
  radioOuterUnselected: {
    borderColor: semanticColors.border.subtleMid,
    borderWidth: 2,
  },
  screen: {
    backgroundColor: semanticColors.app.background,
    flex: 1,
  },
  section: {
    gap: 16,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.bold,
    fontSize: 16,
    lineHeight: 20,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    height: 48,
    justifyContent: 'center',
  },
  segmentButtonCustom: {
    borderStyle: 'dashed',
  },
  segmentButtonDefault: {
    borderStyle: 'solid',
  },
  segmentButtonSelected: {
    backgroundColor: semanticColors.button.buyBackground,
    borderColor: semanticColors.button.buyBackground,
    borderWidth: 2,
  },
  segmentButtonUnselected: {
    backgroundColor: semanticColors.app.backgroundPanel,
    borderColor: semanticColors.border.subtle,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 12,
  },
  segmentText: {
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 20,
  },
  segmentTextMuted: {
    color: semanticColors.text.neutralMuted,
  },
  segmentTextSelectedOnLight: {
    color: semanticColors.text.onLight,
  },
  settingsWrap: {
    flex: 1,
    gap: 32,
  },
  subtitle: {
    color: semanticColors.text.neutralMuted,
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.extraBold,
    fontSize: 32,
    letterSpacing: -0.5,
    lineHeight: 40,
  },
})
