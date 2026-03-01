import { Ionicons } from '@expo/vector-icons'
import { Redirect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { interFontFamily } from '@/constants/typography'
import {
  DEFAULT_ONBOARDING_LAUNCH,
  OnboardingBaseCurrency,
  OnboardingSlippage,
  useOnboarding,
} from '@/features/onboarding/onboarding-provider'

const SLIPPAGE_OPTIONS: OnboardingSlippage[] = ['0.3%', '0.5%', '1.0%']
const BASE_CURRENCY_OPTIONS: OnboardingBaseCurrency[] = ['USD', 'USDC', 'ETH']

export default function OnboardingFourScreen() {
  const router = useRouter()
  const {
    completeOnboardingLaunch,
    hasCompletedOnboarding,
    hasCompletedOnboardingIntro,
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

  const persistPreferences = useCallback(
    async (nextSlippage: OnboardingSlippage, nextBaseCurrency: OnboardingBaseCurrency) => {
      await completeOnboardingLaunch({
        baseCurrency: nextBaseCurrency,
        defaultSlippage: nextSlippage,
      })
      router.replace('./onboarding-5')
    },
    [completeOnboardingLaunch, router],
  )

  if (!hasHydrated) {
    return null
  }

  if (hasCompletedOnboarding) {
    return <Redirect href="/(tabs)/feed" />
  }

  if (!hasCompletedOnboardingIntro) {
    return <Redirect href="./onboarding" />
  }

  if (!hasCompletedOnboardingProfile) {
    return <Redirect href="./onboarding-2" />
  }

  if (!hasCompletedOnboardingSafety) {
    return <Redirect href="./onboarding-3" />
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View>
          <View style={styles.headerRow}>
            <Pressable
              accessibilityLabel="Go back to onboarding step two"
              accessibilityRole="button"
              onPress={() => router.replace('./onboarding-3')}
              style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
            >
              <Ionicons color="#FFFFFFCC" name="chevron-back" size={18} />
            </Pressable>
            <Text style={styles.stepLabel}>Step 3 of 3</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={styles.progressValueThree} />
          </View>
          <View style={styles.copyWrap}>
            <Text style={styles.title}>Personalize your experience</Text>
            <Text style={styles.subtitle}>We have set smart defaults, adjust if you would like, or skip for now.</Text>
          </View>
        </View>

        <View style={styles.settingsWrap}>
          <View style={styles.settingsCard}>
            <View style={styles.settingHeaderRow}>
              <Text style={styles.settingTitle}>Default slippage</Text>
              <Text style={styles.linkText}>What is this?</Text>
            </View>
            <View style={styles.segmentRow}>
              {SLIPPAGE_OPTIONS.map((value) => {
                const selected = defaultSlippage === value
                return (
                  <Pressable
                    key={value}
                    accessibilityLabel={`Set default slippage to ${value}`}
                    accessibilityRole="button"
                    onPress={() => setDefaultSlippage(value)}
                    style={({ pressed }) => [
                      styles.segmentButton,
                      selected ? styles.segmentButtonActive : styles.segmentButtonInactive,
                      pressed ? styles.segmentButtonPressed : null,
                    ]}
                  >
                    <Text
                      style={[styles.segmentText, selected ? styles.segmentTextActive : styles.segmentTextInactive]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <Text style={styles.settingHint}>Lower slippage = fewer failed trades. 0.3% works for most tokens.</Text>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingTitle}>Base currency</Text>
            <View style={styles.segmentRow}>
              {BASE_CURRENCY_OPTIONS.map((value) => {
                const selected = baseCurrency === value
                return (
                  <Pressable
                    key={value}
                    accessibilityLabel={`Set base currency to ${value}`}
                    accessibilityRole="button"
                    onPress={() => setBaseCurrency(value)}
                    style={({ pressed }) => [
                      styles.segmentButton,
                      selected ? styles.segmentButtonActive : styles.segmentButtonInactive,
                      pressed ? styles.segmentButtonPressed : null,
                    ]}
                  >
                    <Text
                      style={[styles.segmentText, selected ? styles.segmentTextActive : styles.segmentTextInactive]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <Text style={styles.settingHint}>
              Your default token for swaps. USDC is the most widely used stablecoin.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityLabel="Save onboarding preferences"
            accessibilityRole="button"
            onPress={() => void persistPreferences(defaultSlippage, baseCurrency)}
            style={({ pressed }) => [styles.primaryButton, pressed ? styles.primaryButtonPressed : null]}
          >
            <Text style={styles.primaryButtonText}>Save Preferences</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Skip and continue"
            accessibilityRole="button"
            onPress={() =>
              void persistPreferences(DEFAULT_ONBOARDING_LAUNCH.defaultSlippage, DEFAULT_ONBOARDING_LAUNCH.baseCurrency)
            }
            style={({ pressed }) => [styles.skipButton, pressed ? styles.skipButtonPressed : null]}
          >
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    borderColor: '#FFFFFF1A',
    borderRadius: 12,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  backButtonPressed: {
    opacity: 0.75,
  },
  content: {
    flex: 1,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  copyWrap: {
    gap: 12,
    paddingTop: 32,
  },
  footer: {
    alignItems: 'center',
    gap: 16,
    marginTop: 'auto',
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  linkText: {
    color: '#888888',
    fontFamily: interFontFamily.medium,
    fontSize: 13,
    lineHeight: 16,
    textDecorationLine: 'underline',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 56,
    justifyContent: 'center',
    width: '100%',
  },
  primaryButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: '#000000',
    fontFamily: interFontFamily.bold,
    fontSize: 17,
    lineHeight: 22,
  },
  progressTrack: {
    backgroundColor: '#111111',
    borderRadius: 2,
    height: 4,
    marginTop: 20,
    overflow: 'hidden',
    width: '100%',
  },
  progressValueThree: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    height: 4,
    width: '100%',
  },
  screen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  segmentButtonInactive: {
    backgroundColor: '#FFFFFF0D',
    borderColor: '#FFFFFF0D',
    borderWidth: 1,
  },
  segmentButtonPressed: {
    opacity: 0.85,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentText: {
    fontSize: 15,
    lineHeight: 18,
  },
  segmentTextActive: {
    color: '#000000',
    fontFamily: interFontFamily.bold,
  },
  segmentTextInactive: {
    color: '#888888',
    fontFamily: interFontFamily.medium,
  },
  settingHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  settingHint: {
    color: '#666666',
    fontFamily: interFontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  settingTitle: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.bold,
    fontSize: 16,
    lineHeight: 20,
  },
  settingsCard: {
    backgroundColor: '#0A0A0A',
    borderColor: '#FFFFFF14',
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  settingsWrap: {
    gap: 20,
    marginTop: 32,
  },
  skipButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
  },
  skipButtonPressed: {
    opacity: 0.7,
  },
  skipButtonText: {
    color: '#888888',
    fontFamily: interFontFamily.bold,
    fontSize: 15,
    lineHeight: 18,
  },
  stepLabel: {
    color: '#666666',
    fontFamily: interFontFamily.medium,
    fontSize: 13,
    lineHeight: 16,
  },
  subtitle: {
    color: '#888888',
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.extraBold,
    fontSize: 32,
    letterSpacing: -0.5,
    lineHeight: 40,
  },
})
