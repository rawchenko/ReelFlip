import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { semanticColors } from '@/constants/semantic-colors'
import type { FeedTradeSide, TokenFeedItem } from '@/features/feed/types'
import { buildSwapReceiptEvent } from '@/features/swap/build-swap-receipt-event'
import type { SwapFlowPayload, SwapQuotePreview, SwapSuccessResult } from '@/features/swap/types'
import { TokenDetailsScreenContent } from '@/features/token-details/token-details-screen-content'

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
