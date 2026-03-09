import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { semanticColors } from '@/constants/semantic-colors'
import { useAuth } from '@/features/auth/use-auth'
import type { FeedTradeSide, TokenFeedItem } from '@/features/feed/types'
import { buildSwapReceiptEvent } from '@/features/swap/build-swap-receipt-event'
import type { SwapFlowPayload, SwapQuotePreview, SwapSuccessResult } from '@/features/swap/types'
import { TokenDetailsScreenContent } from '@/features/token-details/token-details-screen-content'
import { useIsInWatchlist, useWatchlistMutations } from '@/features/watchlist/api/use-watchlist'
import { isInvalidAuthTokenError } from '@/utils/api-client-helpers'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FeedInteractionOverlays } = require('@/features/swap/swap-flow') as typeof import('@/features/swap/swap-flow')

export default function TokenDetailsScreen() {
  const router = useRouter()
  const { token: tokenJson } = useLocalSearchParams<{ token: string }>()
  const [activeSwapFlow, setActiveSwapFlow] = useState<SwapFlowPayload | null>(null)

  const token = useMemo<TokenFeedItem | null>(() => {
    if (!tokenJson) {
      return null
    }

    try {
      return JSON.parse(tokenJson) as TokenFeedItem
    } catch {
      return null
    }
  }, [tokenJson])

  const handleTradePress = useCallback((side: FeedTradeSide) => {
    if (!token) return
    setActiveSwapFlow({
      item: token,
      origin: 'token_details',
      side,
    })
  }, [token])

  const { signIn, signOut } = useAuth()
  const isFollowing = useIsInWatchlist(token?.mint ?? '')
  const { add, remove } = useWatchlistMutations()
  const isFollowPending = add.isPending || remove.isPending

  const handleFollowToggle = useCallback(async () => {
    if (!token) return
    if (isFollowPending) return

    const ok = await signIn()
    if (!ok) {
      Alert.alert('Sign-in incomplete', 'Please approve the wallet sign-in message, then try Follow again.')
      return
    }

    try {
      if (isFollowing) {
        await remove.mutateAsync(token.mint)
      } else {
        await add.mutateAsync(token.mint)
      }
    } catch (error) {
      if (isInvalidAuthTokenError(error)) {
        signOut()

        const recovered = await signIn()
        if (!recovered) {
          Alert.alert('Sign-in incomplete', 'Please approve the wallet sign-in message, then try Follow again.')
          return
        }

        try {
          if (isFollowing) {
            await remove.mutateAsync(token.mint)
          } else {
            await add.mutateAsync(token.mint)
          }
          return
        } catch (retryError) {
          const retryMessage =
            retryError instanceof Error ? retryError.message : 'Unable to update watchlist right now.'
          Alert.alert('Watchlist update failed', retryMessage)
          return
        }
      }

      const message = error instanceof Error ? error.message : 'Unable to update watchlist right now.'
      Alert.alert('Watchlist update failed', message)
    }
  }, [token, isFollowPending, signIn, signOut, isFollowing, remove, add])

  const handleViewReceipt = useCallback((result: SwapSuccessResult, quote: SwapQuotePreview) => {
    setActiveSwapFlow(null)
    const event = buildSwapReceiptEvent(result, quote)
    router.push({ pathname: '/tx-details', params: { event: JSON.stringify(event) } })
  }, [router])

  if (!token) {
    return (
      <View style={{ flex: 1, backgroundColor: semanticColors.app.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: semanticColors.text.muted, fontSize: 16 }}>Token not found</Text>
      </View>
    )
  }

  return (
    <>
      <TokenDetailsScreenContent
        token={token}
        onBuyPress={() => handleTradePress('buy')}
        onSellPress={() => handleTradePress('sell')}
        isFollowing={isFollowing}
        onFollowToggle={handleFollowToggle}
      />
      <FeedInteractionOverlays
        actionPayload={null}
        onCloseActionSheet={() => {}}
        onCloseSwapFlow={() => setActiveSwapFlow(null)}
        onViewReceipt={handleViewReceipt}
        swapPayload={activeSwapFlow}
      />
    </>
  )
}
