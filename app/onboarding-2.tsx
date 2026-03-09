import { Redirect, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import { useAuth } from '@/features/auth/use-auth'
import { useOnboarding } from '@/features/onboarding/onboarding-provider'

export default function OnboardingTwoScreen() {
  const router = useRouter()
  const { signIn } = useAuth()
  const {
    hasCompletedOnboarding,
    hasCompletedOnboardingIntro,
    hasCompletedOnboardingProfile,
    hasCompletedOnboardingSafety,
    hasHydrated,
  } = useOnboarding()

  const spinValue = useRef(new Animated.Value(0)).current
  const signInRef = useRef(signIn)
  signInRef.current = signIn

  useEffect(() => {
    const spinAnimation = Animated.loop(
      Animated.timing(spinValue, {
        duration: 900,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    )

    spinAnimation.start()

    return () => {
      spinAnimation.stop()
      spinValue.setValue(0)
    }
  }, [spinValue])

  useEffect(() => {
    if (!hasHydrated || !hasCompletedOnboardingIntro || !hasCompletedOnboardingProfile || hasCompletedOnboardingSafety) {
      return
    }

    let isMounted = true

    async function setup() {
      // Attempt SIWS auth while loading screen is shown.
      // If it fails, swap-time auth is still a fallback.
      await signInRef.current().catch(() => {})

      if (isMounted) {
        router.replace('./onboarding-3')
      }
    }

    void setup()

    return () => {
      isMounted = false
    }
  }, [
    hasCompletedOnboardingIntro,
    hasCompletedOnboardingProfile,
    hasCompletedOnboardingSafety,
    hasHydrated,
    router,
  ])

  const spinnerRotation = useMemo(
    () =>
      spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
      }),
    [spinValue],
  )

  if (!hasHydrated) {
    return null
  }

  if (hasCompletedOnboarding) {
    return <Redirect href="/(tabs)/feed" />
  }

  if (!hasCompletedOnboardingIntro || !hasCompletedOnboardingProfile) {
    return <Redirect href="./onboarding" />
  }

  if (hasCompletedOnboardingSafety) {
    return <Redirect href="./onboarding-4" />
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.loadingBlock}>
          <Animated.View style={[styles.spinner, { transform: [{ rotate: spinnerRotation }] }]} />
          <View style={styles.copyWrap}>
            <Text style={styles.title}>Setting up your profile</Text>
            <Text style={styles.subtitle}>Fetching top tokens...</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  copyWrap: {
    alignItems: 'center',
    gap: 8,
  },
  loadingBlock: {
    alignItems: 'center',
    gap: 32,
  },
  screen: {
    backgroundColor: semanticColors.app.background,
    flex: 1,
  },
  spinner: {
    borderBottomColor: semanticColors.border.subtle,
    borderBottomWidth: 4,
    borderLeftColor: semanticColors.border.subtle,
    borderLeftWidth: 4,
    borderRadius: 40,
    borderRightColor: semanticColors.border.subtle,
    borderRightWidth: 4,
    borderTopColor: semanticColors.text.headingOnDark,
    borderTopWidth: 4,
    height: 80,
    width: 80,
  },
  subtitle: {
    color: semanticColors.text.neutralMuted,
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
  title: {
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.bold,
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
})
