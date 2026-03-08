export interface ActivityLegResponse {
  mint: string
  symbol: string
  amount: string
  direction: 'in' | 'out'
}

export interface ActivityEventResponse {
  id: string
  txid: string
  timestamp: string
  status: 'confirmed' | 'failed'
  kind: 'swap' | 'transfer'
  primary: ActivityLegResponse
  secondary?: ActivityLegResponse
  counterparty?: { address: string; label?: string }
}

export interface ActivityResponse {
  events: ActivityEventResponse[]
  nextCursor?: string
}

export interface HeliusSignatureResult {
  signature: string
  slot: number
  blockTime: number | null
  err: unknown
}

export interface HeliusTokenTransfer {
  fromUserAccount: string
  toUserAccount: string
  fromTokenAccount: string
  toTokenAccount: string
  tokenAmount: number
  mint: string
  tokenStandard: string
}

export interface HeliusNativeTransfer {
  fromUserAccount: string
  toUserAccount: string
  amount: number
}

export interface HeliusEnhancedTransaction {
  signature: string
  timestamp: number
  type: string
  source: string
  fee: number
  feePayer: string
  description: string
  tokenTransfers: HeliusTokenTransfer[]
  nativeTransfers: HeliusNativeTransfer[]
  transactionError: unknown
  accountData: unknown[]
}
