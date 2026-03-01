import { Ionicons } from '@expo/vector-icons'
import { Redirect, useRouter } from 'expo-router'
import { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { interFontFamily } from '@/constants/typography'
import { useOnboarding } from '@/features/onboarding/onboarding-provider'

interface FeatureItem {
  description: string
  icon: keyof typeof Ionicons.glyphMap
  title: string
}

const FEATURES: FeatureItem[] = [
  {
    description: 'Real-time momentum signals',
    icon: 'star-outline',
    title: 'Curated token feed',
  },
  {
    description: 'Trade with adjustable slippage',
    icon: 'swap-horizontal-outline',
    title: 'One-tap swap',
  },
  {
    description: 'Track every transfer and swap',
    icon: 'shield-checkmark-outline',
    title: 'Wallet-native security',
  },
]

export default function OnboardingScreen() {
  const router = useRouter()
  const {
    completeOnboardingIntro,
    hasCompletedOnboarding,
    hasCompletedOnboardingIntro,
    hasCompletedOnboardingLaunch,
    hasCompletedOnboardingProfile,
    hasCompletedOnboardingSafety,
    hasHydrated,
  } = useOnboarding()

  const moveToOnboardingTwo = useCallback(async () => {
    await completeOnboardingIntro()
    router.replace('./onboarding-2')
  }, [completeOnboardingIntro, router])

  if (!hasHydrated) {
    return null
  }

  if (hasCompletedOnboarding) {
    return <Redirect href="/(tabs)/feed" />
  }

  if (hasCompletedOnboardingIntro) {
    if (!hasCompletedOnboardingProfile) {
      return <Redirect href="./onboarding-2" />
    }

    if (!hasCompletedOnboardingSafety) {
      return <Redirect href="./onboarding-3" />
    }

    if (!hasCompletedOnboardingLaunch) {
      return <Redirect href="./onboarding-4" />
    }

    return <Redirect href="./onboarding-5" />
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.heroSection}>
          <View style={styles.heroBadgeWrap}>
            <View style={styles.heroBadgeInner}>
              <Ionicons color="#FFFFFF" name="star" size={30} />
            </View>
            <View style={styles.heroGlow} />
          </View>

          <View style={styles.copyWrap}>
            <Text style={styles.title}>Seeker.{'\n'}Trade the unseen.</Text>
            <Text style={styles.subtitle}>The exclusive crypto trading terminal built for absolute speed.</Text>
          </View>
        </View>

        <View style={styles.featuresWrap}>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.featureCard}>
              <View style={styles.featureIconWrap}>
                <Ionicons color="#FFFFFF" name={feature.icon} size={20} />
              </View>
              <View style={styles.featureCopyWrap}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.ctaWrap}>
          <Pressable
            accessibilityLabel="Get started with onboarding"
            accessibilityRole="button"
            onPress={() => void moveToOnboardingTwo()}
            style={({ pressed }) => [styles.primaryButton, pressed ? styles.primaryButtonPressed : null]}
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Continue with existing account"
            accessibilityRole="button"
            onPress={() => void moveToOnboardingTwo()}
            style={({ pressed }) => [styles.secondaryButton, pressed ? styles.secondaryButtonPressed : null]}
          >
            <Text style={styles.secondaryButtonText}>I already have an account</Text>
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
    paddingBottom: 28,
    paddingHorizontal: 24,
    paddingTop: 26,
  },
  copyWrap: {
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  ctaWrap: {
    gap: 16,
  },
  featureCard: {
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    borderColor: '#FFFFFF0D',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  featureCopyWrap: {
    flex: 1,
    gap: 4,
  },
  featureDescription: {
    color: '#777777',
    fontFamily: interFontFamily.medium,
    fontSize: 13,
    lineHeight: 16,
  },
  featureIconWrap: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF0D',
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  featureTitle: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.bold,
    fontSize: 15,
    lineHeight: 18,
  },
  featuresWrap: {
    gap: 12,
  },
  heroBadgeInner: {
    alignItems: 'center',
    backgroundColor: '#0F0F0FCC',
    borderColor: '#FFFFFF1A',
    borderRadius: 80,
    borderWidth: 1,
    height: 160,
    justifyContent: 'center',
    width: 160,
  },
  heroBadgeWrap: {
    alignItems: 'center',
    height: 200,
    justifyContent: 'center',
    position: 'relative',
    width: 200,
  },
  heroGlow: {
    backgroundColor: '#FFFFFF0D',
    borderRadius: 60,
    height: 120,
    opacity: 0.8,
    position: 'absolute',
    width: 120,
  },
  heroSection: {
    alignItems: 'center',
    gap: 32,
    width: '100%',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
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
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    color: '#888888',
    fontFamily: interFontFamily.bold,
    fontSize: 15,
    lineHeight: 18,
  },
  subtitle: {
    color: '#888888',
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 280,
    textAlign: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.extraBold,
    fontSize: 38,
    letterSpacing: -1,
    lineHeight: 42,
    textAlign: 'center',
  },
})
