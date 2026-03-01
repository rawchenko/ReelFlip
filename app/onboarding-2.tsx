import { Ionicons } from '@expo/vector-icons'
import { Redirect, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { interFontFamily } from '@/constants/typography'
import {
  DEFAULT_ONBOARDING_PROFILE,
  OnboardingWalletOption,
  useOnboarding,
} from '@/features/onboarding/onboarding-provider'

interface WalletOption {
  icon: keyof typeof Ionicons.glyphMap
  key: OnboardingWalletOption
  title: string
}

const OTHER_WALLET_OPTIONS: WalletOption[] = [
  {
    icon: 'wifi-outline',
    key: 'walletconnect',
    title: 'WalletConnect',
  },
  {
    icon: 'document-text-outline',
    key: 'import-seed-phrase',
    title: 'Import seed phrase',
  },
]

export default function OnboardingTwoScreen() {
  const router = useRouter()
  const {
    completeOnboardingProfile,
    hasCompletedOnboarding,
    hasCompletedOnboardingIntro,
    hasHydrated,
    profilePreferences,
  } = useOnboarding()

  const [selectedWalletOption, setSelectedWalletOption] = useState<OnboardingWalletOption>(
    profilePreferences?.walletOption ?? DEFAULT_ONBOARDING_PROFILE.walletOption,
  )

  const shouldHighlightSeeker = useMemo(() => selectedWalletOption === 'seeker', [selectedWalletOption])

  const handleContinue = useCallback(
    async (walletOption: OnboardingWalletOption) => {
      setSelectedWalletOption(walletOption)
      await completeOnboardingProfile({ walletOption })
      router.replace('./onboarding-3')
    },
    [completeOnboardingProfile, router],
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

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.headerWrap}>
          <View style={styles.headerRow}>
            <Pressable
              accessibilityLabel="Go back to onboarding intro"
              accessibilityRole="button"
              onPress={() => router.replace('./onboarding')}
              style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
            >
              <Ionicons color="#FFFFFFCC" name="chevron-back" size={18} />
            </Pressable>
            <Text style={styles.stepLabel}>Step 1 of 3</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={styles.progressValueOne} />
          </View>
        </View>

        <View style={styles.copyWrap}>
          <Text style={styles.title}>Connect your wallet</Text>
          <Text style={styles.subtitle}>
            Link your wallet to start trading. We will sync your address securely, your keys stay with you.
          </Text>
        </View>

        <View style={styles.seekerCard}>
          <View style={styles.seekerHeader}>
            <View style={[styles.seekerIconWrap, shouldHighlightSeeker ? styles.seekerIconWrapSelected : null]}>
              <Text style={styles.seekerIconText}>S</Text>
            </View>
            <View style={styles.seekerCopyWrap}>
              <Text style={styles.seekerTitle}>Seeker Wallet</Text>
              <Text style={styles.seekerSubtitle}>Recommended · fast signing</Text>
            </View>
          </View>

          <Pressable
            accessibilityLabel="Connect Seeker wallet"
            accessibilityRole="button"
            onPress={() => void handleContinue('seeker')}
            style={({ pressed }) => [styles.primaryButton, pressed ? styles.primaryButtonPressed : null]}
          >
            <Text style={styles.primaryButtonText}>Connect Seeker</Text>
          </Pressable>
        </View>

        <View style={styles.otherOptionsWrap}>
          <Text style={styles.otherOptionsLabel}>OTHER OPTIONS</Text>

          {OTHER_WALLET_OPTIONS.map((option) => {
            const selected = selectedWalletOption === option.key
            return (
              <Pressable
                key={option.key}
                accessibilityLabel={`Continue with ${option.title}`}
                accessibilityRole="button"
                onPress={() => void handleContinue(option.key)}
                style={({ pressed }) => [
                  styles.optionCard,
                  selected ? styles.optionCardSelected : null,
                  pressed ? styles.optionCardPressed : null,
                ]}
              >
                <View style={styles.optionIconWrap}>
                  <Ionicons color="#FFFFFFE6" name={option.icon} size={20} />
                </View>
                <Text style={styles.optionTitle}>{option.title}</Text>
              </Pressable>
            )
          })}
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
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerWrap: {
    gap: 20,
  },
  optionCard: {
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
  optionCardPressed: {
    opacity: 0.75,
  },
  optionCardSelected: {
    borderColor: '#FFFFFF52',
  },
  optionIconWrap: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF0D',
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  optionTitle: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 20,
  },
  otherOptionsLabel: {
    color: '#555555',
    fontFamily: interFontFamily.bold,
    fontSize: 12,
    letterSpacing: 1,
    lineHeight: 16,
  },
  otherOptionsWrap: {
    gap: 12,
    paddingTop: 32,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: '#000000',
    fontFamily: interFontFamily.bold,
    fontSize: 16,
    lineHeight: 20,
  },
  progressTrack: {
    backgroundColor: '#111111',
    borderRadius: 2,
    height: 4,
    overflow: 'hidden',
    width: '100%',
  },
  progressValueOne: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    height: 4,
    width: '33%',
  },
  screen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  seekerCard: {
    backgroundColor: '#0A0A0A',
    borderColor: '#FFFFFF14',
    borderRadius: 20,
    borderWidth: 1,
    gap: 20,
    marginTop: 32,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  seekerCopyWrap: {
    gap: 4,
  },
  seekerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  seekerIconText: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.bold,
    fontSize: 20,
    lineHeight: 24,
  },
  seekerIconWrap: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderColor: '#FFFFFF1A',
    borderRadius: 14,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  seekerIconWrapSelected: {
    borderColor: '#FFFFFF52',
  },
  seekerSubtitle: {
    color: '#777777',
    fontFamily: interFontFamily.medium,
    fontSize: 14,
    lineHeight: 18,
  },
  seekerTitle: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.bold,
    fontSize: 18,
    lineHeight: 22,
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
