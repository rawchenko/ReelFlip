import { Ionicons } from '@expo/vector-icons'
import { Redirect, useRouter } from 'expo-router'
import { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { interFontFamily } from '@/constants/typography'
import { useOnboarding } from '@/features/onboarding/onboarding-provider'

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
  } = useOnboarding()

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

  if (!hasCompletedOnboardingIntro || !hasCompletedOnboardingProfile) {
    return <Redirect href="./onboarding" />
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
        <View style={styles.heroSection}>
          <View style={styles.heroIconWrap}>
            <Ionicons color="#000000" name="checkmark" size={64} />
          </View>
          <View style={styles.copyWrap}>
            <Text style={styles.title}>{"You're all set"}</Text>
            <Text style={styles.subtitle}>Your wallet is connected and default preferences are saved.</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityLabel="Finish onboarding and open feed"
            accessibilityRole="button"
            onPress={() => void handleFinish()}
            style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.primaryButtonText}>Start Scrolling</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  copyWrap: {
    alignItems: 'center',
    gap: 24,
  },
  footer: {
    gap: 16,
    paddingBottom: 24,
  },
  heroIconWrap: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 70,
    boxShadow: '0px 0px 60px #FFFFFF33',
    height: 140,
    justifyContent: 'center',
    width: 140,
  },
  heroSection: {
    alignItems: 'center',
    flex: 1,
    gap: 40,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#000000',
    fontFamily: interFontFamily.bold,
    fontSize: 18,
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
    maxWidth: 300,
    textAlign: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.extraBold,
    fontSize: 32,
    letterSpacing: -0.5,
    lineHeight: 40,
    textAlign: 'center',
  },
})
