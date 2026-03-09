import { profileDesignSpec } from '@/features/profile/profile-design-spec'
import {
  MOCK_ALLOCATION,
  MOCK_ASSETS,
  MOCK_TOTAL_BALANCE,
  MOCK_TOTAL_CHANGE_PERCENT,
  MOCK_WATCHLIST,
} from '@/features/profile/mock-profile'
import { ProfileScreenContent } from '@/features/profile/profile-screen-content'
import { semanticColors } from '@/constants/semantic-colors'
import { spacing } from '@/constants/spacing'
import { interFontFamily } from '@/constants/typography'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import React, { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function ProfileEmptyState({
  title,
  description,
  actionLabel,
  onActionPress,
  disabled = false,
}: {
  title: string
  description: string
  actionLabel?: string
  onActionPress?: () => void
  disabled?: boolean
}) {
  return (
    <View style={styles.stateContainer}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateDescription}>{description}</Text>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          disabled={disabled}
          onPress={onActionPress}
          style={({ pressed }) => [
            styles.primaryButton,
            disabled ? styles.primaryButtonDisabled : null,
            pressed && !disabled ? styles.buttonPressed : null,
          ]}
        >
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export default function ProfileScreen() {
  const { account, connect } = useMobileWallet()
  const [isConnectingWallet, setIsConnectingWallet] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const walletAddress = useMemo(() => account?.address.toString() ?? null, [account])

  const handleConnectWallet = useCallback(async () => {
    if (isConnectingWallet) return

    setConnectError(null)
    setIsConnectingWallet(true)

    try {
      await connect()
    } catch {
      setConnectError('Wallet connection failed. Please try again.')
    } finally {
      setIsConnectingWallet(false)
    }
  }, [connect, isConnectingWallet])

  const handleUnfollow = useCallback((_mint: string) => {
    // Watchlist unfollow will be wired in a future update
  }, [])

  if (!walletAddress) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ProfileEmptyState
          title="Connect your wallet"
          description={connectError ?? 'Connect a wallet to view your portfolio and watchlist.'}
          actionLabel={isConnectingWallet ? 'Connecting...' : 'Connect Wallet'}
          disabled={isConnectingWallet}
          onActionPress={() => void handleConnectWallet()}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ProfileScreenContent
        address={walletAddress}
        totalBalance={MOCK_TOTAL_BALANCE}
        changePercent={MOCK_TOTAL_CHANGE_PERCENT}
        allocation={MOCK_ALLOCATION}
        assets={MOCK_ASSETS}
        watchlist={MOCK_WATCHLIST}
        onUnfollow={handleUnfollow}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  buttonPressed: {
    opacity: 0.85,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: semanticColors.button.buyBackground,
    borderRadius: spacing[6],
    height: spacing[12],
    justifyContent: 'center',
    marginTop: spacing[1],
    minWidth: 156,
    paddingHorizontal: spacing[4],
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: semanticColors.button.buyText,
    fontFamily: interFontFamily.bold,
    fontSize: 16,
    lineHeight: 20,
  },
  screen: {
    backgroundColor: profileDesignSpec.colors.background,
    flex: 1,
  },
  stateContainer: {
    alignItems: 'center',
    flex: 1,
    gap: spacing[2.5],
    justifyContent: 'center',
    paddingHorizontal: spacing[7],
  },
  stateDescription: {
    color: semanticColors.text.dimmed,
    fontFamily: interFontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  stateTitle: {
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
})
