import type { FeedTradeSide, TokenFeedItem } from '@/features/feed/types'

export type SwapFlowOrigin = 'feed'
export type SwapCounterAssetSymbol = 'USDC' | 'SOL' | 'SKR'
export type SwapProgressStepId = 'quote_locked' | 'wallet_approved' | 'broadcasting' | 'confirmation'
export type SwapFailureReason = 'slippage_exceeded' | 'routing_unavailable'

export interface SwapFlowPayload {
  item: TokenFeedItem
  origin: SwapFlowOrigin
  side: FeedTradeSide
}

export interface SwapAssetOption {
  badgeColor: string
  balance: number
  badgeText: string
  name: string
  priceUsd: number
  symbol: string
}

export interface SwapDraft {
  amount: number
  amountText: string
  attemptCount: number
  counterAssetSymbol: SwapCounterAssetSymbol
  origin: SwapFlowOrigin
  side: FeedTradeSide
  slippageBps: number
  token: TokenFeedItem
}

export interface SwapQuoteAssetView {
  amount: number
  badgeColor: string
  badgeText: string
  balance: number
  name: string
  priceUsd: number
  symbol: string
  usdValue: number
}

export interface SwapQuotePreview {
  exchangeRate: number
  expiresAt: string
  inputAsset: SwapQuoteAssetView
  minimumReceived: number
  networkFeeSol: number
  networkFeeUsd: number
  outputAsset: SwapQuoteAssetView
  platformFeeUsd: number
  priceImpactPct: number
  providerLabel: string
  quoteId: string
  refreshWindowSec: number
  routeLabel: string
  slippageBps: number
}

export interface SwapProgressStep {
  description: string
  durationMs: number
  id: SwapProgressStepId
  title: string
}

export interface SwapSuccessResult {
  kind: 'success'
  receivedAmount: number
  receivedSymbol: string
  sentAmount: number
  sentSymbol: string
  shareText: string
  signature: string
  statusLabel: string
}

export interface SwapFailureResult {
  attemptedPathLabel: string
  kind: 'failure'
  message: string
  reason: SwapFailureReason
  suggestedSlippageBps: number
  suggestion: string
  title: string
}

export type SwapResult = SwapFailureResult | SwapSuccessResult

export interface SwapExecutionPlan {
  result: SwapResult
  steps: SwapProgressStep[]
}

export interface SwapQuoteAdapter {
  getExecutionPlan(input: { draft: SwapDraft; quote: SwapQuotePreview }): Promise<SwapExecutionPlan>
  getQuote(draft: SwapDraft): Promise<SwapQuotePreview>
}
