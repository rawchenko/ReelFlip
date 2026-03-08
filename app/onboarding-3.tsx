import { Ionicons } from '@expo/vector-icons'
import { Redirect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import { useOnboarding } from '@/features/onboarding/onboarding-provider'

export default function OnboardingThreeScreen() {
  const router = useRouter()
  const {
    completeOnboardingSafety,
    hasCompletedOnboarding,
    hasCompletedOnboardingIntro,
    hasCompletedOnboardingLaunch,
    hasCompletedOnboardingProfile,
    hasCompletedOnboardingSafety,
    hasHydrated,
  } = useOnboarding()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const requestNotificationPermission = useCallback(async () => {
    if (Platform.OS !== 'android' || Platform.Version < 33) {
      return true
    }

    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    if (!permission) {
      return true
    }

    const result = await PermissionsAndroid.request(permission)
    return result === PermissionsAndroid.RESULTS.GRANTED
  }, [])

  const handleContinue = useCallback(
    async (shouldRequestPermission: boolean) => {
      if (isSubmitting) {
        return
      }

      setIsSubmitting(true)
      try {
        const enablePriceAlerts = shouldRequestPermission ? await requestNotificationPermission() : false
        await completeOnboardingSafety({
          acceptedTermsOfService: true,
          enableBiometricSigning: false,
          enablePriceAlerts,
        })
        router.replace('./onboarding-4')
      } finally {
        setIsSubmitting(false)
      }
    },
    [completeOnboardingSafety, isSubmitting, requestNotificationPermission, router],
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
    return <Redirect href={hasCompletedOnboardingLaunch ? './onboarding-5' : './onboarding-4'} />
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.heroSection}>
          <View style={styles.iconWrap}>
            <Ionicons color={semanticColors.icon.primary} name="notifications-outline" size={48} />
          </View>
          <View style={styles.copyWrap}>
            <Text style={styles.title}>Catch the Pump</Text>
            <Text style={styles.subtitle}>
              Get instant alerts when your trades execute or when tokens in your feed are surging.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityLabel="Enable notifications"
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => void handleContinue(true)}
            style={({ pressed }) => [
              styles.primaryButton,
              isSubmitting ? styles.buttonDisabled : null,
              pressed && !isSubmitting ? styles.pressed : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>{isSubmitting ? 'Checking...' : 'Enable Notifications'}</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Skip notifications for now"
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => void handleContinue(false)}
            style={({ pressed }) => [
              styles.secondaryButton,
              isSubmitting ? styles.buttonDisabled : null,
              pressed && !isSubmitting ? styles.pressed : null,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Not Now</Text>
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
    gap: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  footer: {
    gap: 16,
    paddingBottom: 24,
  },
  heroSection: {
    alignItems: 'center',
    flex: 1,
    gap: 40,
    justifyContent: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: semanticColors.app.backgroundPanel,
    borderColor: semanticColors.border.subtle,
    borderRadius: 60,
    borderWidth: 1,
    height: 120,
    justifyContent: 'center',
    width: 120,
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
  screen: {
    backgroundColor: semanticColors.app.background,
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: semanticColors.text.neutralMuted,
    fontFamily: interFontFamily.bold,
    fontSize: 18,
    lineHeight: 22,
  },
  subtitle: {
    color: semanticColors.text.neutralMuted,
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 300,
    textAlign: 'center',
  },
  title: {
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.extraBold,
    fontSize: 32,
    letterSpacing: -0.5,
    lineHeight: 40,
    textAlign: 'center',
  },
})
