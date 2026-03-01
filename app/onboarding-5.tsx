import { Ionicons } from '@expo/vector-icons'
import { Redirect, useRouter } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { interFontFamily } from '@/constants/typography'
import {
  DEFAULT_ONBOARDING_LAUNCH,
  DEFAULT_ONBOARDING_PROFILE,
  useOnboarding,
} from '@/features/onboarding/onboarding-provider'

export default function OnboardingFiveScreen() {
  const router = useRouter()
  const {
    completeOnboarding,
    hasCompletedOnboarding,
    hasCompletedOnboardingIntro,
    hasCompletedOnboardingLaunch,
    hasCompletedOnboardingProfile,
    hasCompletedOnboardingSafety,
    hasHydrated,
    launchPreferences,
    profilePreferences,
  } = useOnboarding()

  const walletSummary = useMemo(() => {
    const walletOption = profilePreferences?.walletOption ?? DEFAULT_ONBOARDING_PROFILE.walletOption

    if (walletOption === 'walletconnect') {
      return 'WalletConnect'
    }

    if (walletOption === 'import-seed-phrase') {
      return 'Imported wallet'
    }

    return 'sam.skr'
  }, [profilePreferences?.walletOption])

  const slippageSummary = launchPreferences?.defaultSlippage ?? DEFAULT_ONBOARDING_LAUNCH.defaultSlippage
  const currencySummary = launchPreferences?.baseCurrency ?? DEFAULT_ONBOARDING_LAUNCH.baseCurrency

  const handleFinish = useCallback(async () => {
    await completeOnboarding({ enteredApp: true })
    router.replace('/(tabs)/feed')
  }, [completeOnboarding, router])

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

  if (!hasCompletedOnboardingLaunch) {
    return <Redirect href="./onboarding-4" />
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.heroWrap}>
          <View style={styles.heroBadge}>
            <View style={styles.heroBadgeInner}>
              <Ionicons color="#000000" name="checkmark" size={34} />
            </View>
          </View>
          <View style={styles.heroSparkleLeft}>
            <Ionicons color="#FFFFFF66" name="sparkles" size={16} />
          </View>
          <View style={styles.heroSparkleRight}>
            <Ionicons color="#FFFFFF4A" name="sparkles" size={12} />
          </View>

          <View style={styles.copyWrap}>
            <Text style={styles.title}>You are all set.</Text>
            <Text style={styles.subtitle}>Your wallet is connected and you are ready to start trading.</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRowWithDivider}>
            <Text style={styles.summaryKey}>Wallet</Text>
            <Text style={styles.summaryValue}>{walletSummary}</Text>
          </View>

          <View style={styles.summaryRowWithDivider}>
            <Text style={styles.summaryKey}>Default slippage</Text>
            <Text style={styles.summaryValue}>{slippageSummary}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>Base currency</Text>
            <Text style={styles.summaryValue}>{currencySummary}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityLabel="Finish onboarding and enter app"
            accessibilityRole="button"
            onPress={() => void handleFinish()}
            style={({ pressed }) => [styles.primaryButton, pressed ? styles.primaryButtonPressed : null]}
          >
            <Text style={styles.primaryButtonText}>Enter App</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flex: 1,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 26,
  },
  copyWrap: {
    alignItems: 'center',
    gap: 12,
  },
  footer: {
    marginTop: 'auto',
    width: '100%',
  },
  heroBadge: {
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    borderColor: '#FFFFFF1A',
    borderRadius: 60,
    borderWidth: 1,
    height: 120,
    justifyContent: 'center',
    width: 120,
  },
  heroBadgeInner: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 40,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  heroSparkleLeft: {
    left: 60,
    opacity: 0.6,
    position: 'absolute',
    top: -10,
  },
  heroSparkleRight: {
    opacity: 0.5,
    position: 'absolute',
    right: 60,
    top: 40,
  },
  heroWrap: {
    alignItems: 'center',
    gap: 32,
    marginTop: 56,
    position: 'relative',
    width: '100%',
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
  screen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  subtitle: {
    color: '#888888',
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 260,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#0A0A0A',
    borderColor: '#FFFFFF14',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 48,
    paddingHorizontal: 20,
    paddingVertical: 8,
    width: '100%',
  },
  summaryKey: {
    color: '#777777',
    fontFamily: interFontFamily.medium,
    fontSize: 14,
    lineHeight: 18,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  summaryRowWithDivider: {
    alignItems: 'center',
    borderBottomColor: '#FFFFFF0D',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.bold,
    fontSize: 14,
    lineHeight: 18,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.extraBold,
    fontSize: 34,
    letterSpacing: -0.5,
    lineHeight: 42,
    textAlign: 'center',
  },
})
