import { Ionicons } from '@expo/vector-icons'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { Redirect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { interFontFamily } from '@/constants/typography'
import { DEFAULT_ONBOARDING_PROFILE, useOnboarding } from '@/features/onboarding/onboarding-provider'

export default function OnboardingScreen() {
  const router = useRouter()
  const { account, connect } = useMobileWallet()
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false)
  const [isConnectingWallet, setIsConnectingWallet] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const {
    completeOnboardingProfile,
    hasCompletedOnboarding,
    hasCompletedOnboardingIntro,
    hasCompletedOnboardingLaunch,
    hasCompletedOnboardingProfile,
    hasCompletedOnboardingSafety,
    hasHydrated,
  } = useOnboarding()

  const handleConnectWallet = useCallback(async () => {
    if (!hasAcceptedTerms || isConnectingWallet) {
      return
    }

    setConnectionError(null)
    setIsConnectingWallet(true)

    try {
      const connectedAccount = account ?? (await connect())
      if (!connectedAccount) {
        setConnectionError('Wallet connection was not completed. Please try again.')
        return
      }

      // Persist directly to stage 2 to avoid intermediate self-redirect loops on stage 1.
      await completeOnboardingProfile(DEFAULT_ONBOARDING_PROFILE)
      router.replace('./onboarding-2')
    } catch {
      setConnectionError('Wallet connection failed. Please try again.')
    } finally {
      setIsConnectingWallet(false)
    }
  }, [
    account,
    completeOnboardingProfile,
    connect,
    hasAcceptedTerms,
    isConnectingWallet,
    router,
  ])

  if (!hasHydrated) {
    return null
  }

  if (hasCompletedOnboarding) {
    return <Redirect href="/(tabs)/feed" />
  }

  if (hasCompletedOnboardingIntro && hasCompletedOnboardingProfile) {
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
          <View style={styles.cardStackWrap}>
            <View style={styles.cardBackOne} />
            <View style={styles.cardBackTwo} />
            <View style={styles.cardFront}>
              <View style={styles.cardFrontHeader}>
                <View style={styles.avatarDot} />
                <View style={styles.headerBar} />
              </View>
              <View style={styles.cardFooterBar} />
            </View>
          </View>

          <View style={styles.copyWrap}>
            <Text style={styles.title}>Swipe Tokens.</Text>
            <Text style={styles.title}>Trade Instantly.</Text>
            <Text style={styles.subtitle}>
              An infinite feed to discover the best Solana tokens. Buy and sell directly from the card in 1 tap.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityLabel={hasAcceptedTerms ? 'Accepted terms of service' : 'Accept terms of service'}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: hasAcceptedTerms }}
            onPress={() => setHasAcceptedTerms((current) => !current)}
            style={({ pressed }) => [styles.termsRow, pressed ? styles.pressed : null]}
          >
            <View style={[styles.checkbox, hasAcceptedTerms ? styles.checkboxChecked : null]}>
              {hasAcceptedTerms ? <Ionicons color="#FFFFFF" name="checkmark" size={14} /> : null}
            </View>
            <Text style={styles.termsText}>
              I agree to the <Text style={styles.termsLinkText}>Terms of Service</Text>
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Connect wallet"
            accessibilityRole="button"
            disabled={!hasAcceptedTerms || isConnectingWallet}
            onPress={() => void handleConnectWallet()}
            style={({ pressed }) => [
              styles.primaryButton,
              !hasAcceptedTerms || isConnectingWallet ? styles.primaryButtonDisabled : null,
              pressed && hasAcceptedTerms && !isConnectingWallet ? styles.pressed : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>{isConnectingWallet ? 'Connecting...' : 'Connect Wallet'}</Text>
          </Pressable>

          {connectionError ? <Text style={styles.errorText}>{connectionError}</Text> : null}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  avatarDot: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 24,
    width: 24,
  },
  cardBackOne: {
    backgroundColor: '#111111',
    borderColor: '#333333',
    borderRadius: 12,
    borderWidth: 1,
    height: 140,
    opacity: 0.5,
    position: 'absolute',
    transform: [{ translateX: 15 }, { translateY: -10 }, { rotate: '10deg' }],
    width: 100,
  },
  cardBackTwo: {
    backgroundColor: '#1A1A1A',
    borderColor: '#444444',
    borderRadius: 12,
    borderWidth: 1,
    height: 140,
    opacity: 0.8,
    position: 'absolute',
    transform: [{ translateX: -10 }, { translateY: -5 }, { rotate: '-5deg' }],
    width: 100,
  },
  cardFooterBar: {
    backgroundColor: '#222222',
    borderRadius: 6,
    height: 40,
    width: '100%',
  },
  cardFront: {
    backgroundColor: '#000000',
    borderColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    boxShadow: '0px 8px 24px #FFFFFF1A',
    gap: 12,
    height: 150,
    justifyContent: 'space-between',
    padding: 12,
    width: 110,
  },
  cardFrontHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  cardStackWrap: {
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    borderColor: '#444444',
    borderRadius: 120,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 240,
    justifyContent: 'center',
    width: 240,
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderColor: '#555555',
    borderRadius: 6,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkboxChecked: {
    borderColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  copyWrap: {
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    color: '#D77C7C',
    fontFamily: interFontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  footer: {
    gap: 24,
    paddingBottom: 24,
  },
  headerBar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    height: 6,
    width: 40,
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
  primaryButtonDisabled: {
    backgroundColor: '#5A5A5A',
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
    marginTop: 8,
    maxWidth: 300,
    textAlign: 'center',
  },
  termsLinkText: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.medium,
    textDecorationLine: 'underline',
  },
  termsRow: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  termsText: {
    color: '#888888',
    fontFamily: interFontFamily.medium,
    fontSize: 14,
    lineHeight: 18,
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
