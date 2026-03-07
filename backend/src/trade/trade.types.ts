export type TradeSide = 'buy' | 'sell'
export type TradeAssetSymbol = 'SOL' | 'USDC' | 'SKR'
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

export interface TradeAssetView {
  amount: number
  badgeColor: string
  badgeText: string
  balance: number
  name: string
  priceUsd: number
  symbol: string
  usdValue: number
}

export interface SwapQuotePreviewDto {
  exchangeRate: number
  expiresAt: string
  inputAsset: TradeAssetView
  minimumReceived: number
  networkFeeSol: number
  networkFeeUsd: number
  outputAsset: TradeAssetView
  platformFeeUsd: number
  priceImpactPct: number
  providerLabel: string
  quoteId: string
  refreshWindowSec: number
  routeLabel: string
  slippageBps: number
  warnings?: string[]
}

export interface QuoteRequest {
  payAssetSymbol: TradeAssetSymbol
  side: TradeSide
  slippageBps: number
  tokenMint: string
  uiAmount: string
  wallet: string
}

export interface BuildTradeRequest {
  quoteId: string
  wallet: string
}

export interface SubmitTradeRequest {
  idempotencyKey: string
  signedTxBase64: string
  tradeIntentId: string
}

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

export interface MintDescriptor {
  decimals: number
  mint: string
  name: string
  symbol: string
}

export interface StoredQuoteContext {
  expiresAt: string
  inputMint: string
  inputMintDecimals: number
  outputMint: string
  outputMintDecimals: number
  payAssetSymbol: TradeAssetSymbol
  quoteId: string
  quoteResponse: JupiterQuoteResponse
  quotePreview: SwapQuotePreviewDto
  side: TradeSide
  tokenMint: string
  wallet: string
}

export interface StoredTradeIntent {
  expiresAt: string
  lastValidBlockHeight?: number
  messageBase64: string
  quoteId: string
  tradeIntentId: string
  unsignedTxBase64: string
  wallet: string
}

export interface StoredTradeRecord {
  confirmedAt?: string
  createdAt: string
  expiresAt?: string
  failureCode?: TradeFailureCode
  failureMessage?: string
  lastCheckedAt?: string
  lastValidBlockHeight?: number
  signature?: string
  status: TradeStatus
  tradeId: string
}

export interface JupiterRoutePlanStep {
  percent?: number
  swapInfo?: {
    feeAmount?: string
    feeMint?: string
    inAmount?: string
    inputMint?: string
    label?: string
    outAmount?: string
    outputMint?: string
  }
}

export interface JupiterQuoteResponse {
  contextSlot?: number
  inAmount: string
  inputMint: string
  otherAmountThreshold: string
  outAmount: string
  outputMint: string
  platformFee?: {
    amount?: string
    feeBps?: number
  } | null
  priceImpactPct: string
  routePlan: JupiterRoutePlanStep[]
  slippageBps: number
  swapMode: 'ExactIn' | 'ExactOut'
  timeTaken?: number
}

export interface JupiterSwapResponse {
  computeUnitLimit?: number
  dynamicSlippageReport?: {
    slippageBps?: number
  } | null
  lastValidBlockHeight?: number
  prioritizationFeeLamports?: number
  simulationError?: unknown
  swapTransaction: string
}
