import type { FeedTradeSide, TokenFeedItem } from '@/features/feed/types'

export type SwapFlowOrigin = 'feed' | 'token_details'
export type SwapCounterAssetSymbol = 'USDC' | 'SOL' | 'SKR'
export type SwapProgressStepId = 'quote_locked' | 'wallet_approved' | 'broadcasting' | 'confirmation'
export type SwapFailureReason = 'slippage_exceeded' | 'routing_unavailable'
export type TradeStatus = 'pending' | 'simulating' | 'submitted' | 'confirmed' | 'failed'
export type TradeFailureCode =
  | 'BAD_REQUEST'
  | 'QUOTE_EXPIRED'
  | 'ROUTE_UNAVAILABLE'
  | 'RISK_BLOCKED'
  | 'SIMULATION_FAILED'
  | 'BROADCAST_FAILED'
  | 'SIGNATURE_MISMATCH'
  | 'STATUS_TIMEOUT'
  | 'NOT_FOUND'

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
  imageUri?: string
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
  tradeId?: string
}

export interface SwapFailureResult {
  attemptedPathLabel: string
  failureCode?: TradeFailureCode
  kind: 'failure'
  message: string
  reason: SwapFailureReason
  suggestedSlippageBps: number
  suggestion: string
  title: string
}

export interface SwapPendingResult {
  kind: 'pending'
  message: string
  signature: string
  statusLabel: string
  tradeId: string
}

export type SwapResult = SwapFailureResult | SwapPendingResult | SwapSuccessResult

export interface TradeBuildResponse {
  expiresAt: string
  tradeIntentId: string
  unsignedTxBase64: string
}

export interface TradeSubmitResponse {
  signature: string
  status: TradeStatus
  tradeId: string
}

export interface TradeStatusResponse {
  confirmedAt?: string
  failureCode?: TradeFailureCode
  failureMessage?: string
  signature?: string
  status: TradeStatus
  tradeId: string
}

export interface SwapQuoteAdapter {
  buildTrade(input: { quoteId: string; walletAddress: string }): Promise<TradeBuildResponse>
  getQuote(input: { draft: SwapDraft; walletAddress: string }): Promise<SwapQuotePreview>
  getTradeStatus(tradeId: string): Promise<TradeStatusResponse>
  submitTrade(input: { idempotencyKey: string; signedTxBase64: string; tradeIntentId: string }): Promise<TradeSubmitResponse>
}
