import { Ionicons } from '@expo/vector-icons'
import { Redirect, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { interFontFamily } from '@/constants/typography'
import {
  DEFAULT_ONBOARDING_SAFETY,
  OnboardingSafetyPreferences,
  useOnboarding,
} from '@/features/onboarding/onboarding-provider'

interface ToggleCard {
  description: string
  icon: keyof typeof Ionicons.glyphMap
  key: keyof OnboardingSafetyPreferences
  title: string
}

const TOGGLE_CARDS: ToggleCard[] = [
  {
    description: 'Required to continue',
    icon: 'shield-checkmark-outline',
    key: 'acceptedTermsOfService',
    title: 'Terms of service',
  },
  {
    description: 'Get notified on big moves',
    icon: 'notifications-outline',
    key: 'enablePriceAlerts',
    title: 'Price alerts',
  },
  {
    description: 'Recommended for security',
    icon: 'lock-closed-outline',
    key: 'enableBiometricSigning',
    title: 'Biometric signing',
  },
]

interface ToggleSwitchProps {
  onPress: () => void
  value: boolean
}

function ToggleSwitch({ onPress, value }: ToggleSwitchProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toggleTrack,
        value ? styles.toggleTrackOn : styles.toggleTrackOff,
        pressed ? styles.togglePressed : null,
      ]}
    >
      <View style={[styles.toggleThumb, value ? styles.toggleThumbOn : styles.toggleThumbOff]} />
    </Pressable>
  )
}

export default function OnboardingThreeScreen() {
  const router = useRouter()
  const {
    completeOnboardingSafety,
    hasCompletedOnboarding,
    hasCompletedOnboardingIntro,
    hasCompletedOnboardingProfile,
    hasHydrated,
    safetyPreferences,
  } = useOnboarding()

  const [preferences, setPreferences] = useState<OnboardingSafetyPreferences>(
    safetyPreferences ?? DEFAULT_ONBOARDING_SAFETY,
  )

  const canContinue = useMemo(() => preferences.acceptedTermsOfService, [preferences.acceptedTermsOfService])

  const togglePreference = useCallback((key: keyof OnboardingSafetyPreferences) => {
    setPreferences((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }, [])

  const handleContinue = useCallback(async () => {
    if (!canContinue) {
      return
    }

    await completeOnboardingSafety(preferences)
    router.replace('./onboarding-4')
  }, [canContinue, completeOnboardingSafety, preferences, router])

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

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.headerBlock}>
          <View style={styles.headerRow}>
            <Pressable
              accessibilityLabel="Go back to onboarding step one"
              accessibilityRole="button"
              onPress={() => router.replace('./onboarding-2')}
              style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
            >
              <Ionicons color="#FFFFFFCC" name="chevron-back" size={18} />
            </Pressable>
            <Text style={styles.stepLabel}>Step 2 of 3</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={styles.progressValueTwo} />
          </View>
          <View style={styles.copyWrap}>
            <Text style={styles.title}>Almost there</Text>
            <Text style={styles.subtitle}>Review a few quick settings before you start trading.</Text>
          </View>
        </View>

        <View style={styles.cardList}>
          {TOGGLE_CARDS.map((card) => {
            const value = preferences[card.key]

            return (
              <View key={card.key} style={styles.card}>
                <View style={styles.cardIconWrap}>
                  <Ionicons color="#FFFFFFE6" name={card.icon} size={22} />
                </View>
                <View style={styles.cardCopyWrap}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardDescription}>{card.description}</Text>
                </View>
                <ToggleSwitch onPress={() => togglePreference(card.key)} value={value} />
              </View>
            )
          })}
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityLabel="Continue to onboarding step three"
            accessibilityRole="button"
            disabled={!canContinue}
            onPress={() => void handleContinue()}
            style={({ pressed }) => [
              styles.primaryButton,
              !canContinue ? styles.primaryButtonDisabled : null,
              pressed && canContinue ? styles.primaryButtonPressed : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
          <Text style={styles.footerHint}>You can change these anytime in Settings</Text>
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
  card: {
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    borderColor: '#FFFFFF14',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  cardCopyWrap: {
    flex: 1,
    gap: 4,
  },
  cardDescription: {
    color: '#777777',
    fontFamily: interFontFamily.medium,
    fontSize: 13,
    lineHeight: 16,
  },
  cardIconWrap: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF0D',
    borderColor: '#FFFFFF0D',
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  cardList: {
    gap: 16,
    marginTop: 32,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.bold,
    fontSize: 16,
    lineHeight: 20,
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
  footerHint: {
    color: '#666666',
    fontFamily: interFontFamily.medium,
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
  headerBlock: {
    width: '100%',
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 56,
    justifyContent: 'center',
    width: '100%',
  },
  primaryButtonDisabled: {
    backgroundColor: '#6F6F6F',
    opacity: 0.6,
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
  progressValueTwo: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    height: 4,
    width: '66%',
  },
  screen: {
    backgroundColor: '#000000',
    flex: 1,
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
  togglePressed: {
    opacity: 0.85,
  },
  toggleThumb: {
    borderRadius: 12,
    height: 24,
    width: 24,
  },
  toggleThumbOff: {
    backgroundColor: '#666666',
  },
  toggleThumbOn: {
    backgroundColor: '#000000',
  },
  toggleTrack: {
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 4,
    width: 52,
  },
  toggleTrackOff: {
    backgroundColor: '#222222',
    borderColor: '#FFFFFF1A',
    borderWidth: 1,
  },
  toggleTrackOn: {
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
  },
})
