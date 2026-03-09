import type { ActivityEvent } from '@/features/activity/types'
import type { SwapQuotePreview, SwapSuccessResult } from '@/features/swap/types'

/** Build an ActivityEvent from a completed swap — shared by feed and token-details screens. */
export function buildSwapReceiptEvent(result: SwapSuccessResult, quote: SwapQuotePreview): ActivityEvent {
  return {
    id: result.signature,
    timestampIso: new Date().toISOString(),
    source: 'jupiter',
    type: 'swap',
    status: 'confirmed',
    primaryText: `${quote.inputAsset.symbol} → ${quote.outputAsset.symbol}`,
    secondaryText: 'Jupiter',
    receivedLeg: {
      symbol: result.receivedSymbol,
      amountDisplay: `+${result.receivedAmount} ${result.receivedSymbol}`,
      direction: 'receive',
    },
    sentLeg: {
      symbol: result.sentSymbol,
      amountDisplay: `-${result.sentAmount} ${result.sentSymbol}`,
      direction: 'send',
    },
    txSignature: result.signature,
  }
}
