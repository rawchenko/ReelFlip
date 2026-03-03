import { Redirect, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { interFontFamily } from '@/constants/typography'
import { useOnboarding } from '@/features/onboarding/onboarding-provider'

const LOADING_REDIRECT_DELAY_MS = 1500

export default function OnboardingTwoScreen() {
  const router = useRouter()
  const {
    hasCompletedOnboarding,
    hasCompletedOnboardingIntro,
    hasCompletedOnboardingProfile,
    hasCompletedOnboardingSafety,
    hasHydrated,
  } = useOnboarding()

  const spinValue = useRef(new Animated.Value(0)).current

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

    const timer = setTimeout(() => {
      router.replace('./onboarding-3')
    }, LOADING_REDIRECT_DELAY_MS)

    return () => clearTimeout(timer)
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
    backgroundColor: '#000000',
    flex: 1,
  },
  spinner: {
    borderBottomColor: '#333333',
    borderBottomWidth: 4,
    borderLeftColor: '#333333',
    borderLeftWidth: 4,
    borderRadius: 40,
    borderRightColor: '#333333',
    borderRightWidth: 4,
    borderTopColor: '#FFFFFF',
    borderTopWidth: 4,
    height: 80,
    width: 80,
  },
  subtitle: {
    color: '#888888',
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.bold,
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
})
