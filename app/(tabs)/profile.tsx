import { profileDesignSpec } from '@/features/profile/profile-design-spec'
import {
  MOCK_ALLOCATION,
  MOCK_ASSETS,
  MOCK_TOTAL_BALANCE,
  MOCK_TOTAL_CHANGE_PERCENT,
} from '@/features/profile/mock-profile'
import { ProfileScreenContent } from '@/features/profile/profile-screen-content'
import type { WatchlistItem } from '@/features/profile/types'
import { semanticColors } from '@/constants/semantic-colors'
import { spacing } from '@/constants/spacing'
import { interFontFamily } from '@/constants/typography'
import { useFeedQuery } from '@/features/feed/api/use-feed-query'
import { useWatchlistQuery, useWatchlistMutations } from '@/features/watchlist/api/use-watchlist'
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

  const watchlistQuery = useWatchlistQuery({ enabled: !!walletAddress })
  const watchlistMints = watchlistQuery.data
  const watchlistFeedQuery = useFeedQuery({
    mints: watchlistMints,
    enabled: Array.isArray(watchlistMints) && watchlistMints.length > 0,
    refetchIntervalMs: 30_000,
  })
  const { remove } = useWatchlistMutations()

  const watchlist = useMemo<WatchlistItem[]>(() => {
    if (!watchlistMints || watchlistMints.length === 0) return []
    const feedItems = watchlistFeedQuery.data?.items ?? []
    const feedByMint = new Map(feedItems.map((item) => [item.mint, item]))

    return watchlistMints.map((mint) => {
      const feedItem = feedByMint.get(mint)
      return {
        mint,
        symbol: feedItem?.symbol ?? mint.slice(0, 4),
        name: feedItem?.name ?? 'Unknown',
        changePercent: feedItem?.priceChange24h ?? 0,
        iconColor: '#9945FF',
      }
    })
  }, [watchlistMints, watchlistFeedQuery.data?.items])

  const handleUnfollow = useCallback((mint: string) => {
    remove.mutate(mint)
  }, [remove])

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
        watchlist={watchlist}
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
