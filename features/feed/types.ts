export type FeedCategory = 'trending' | 'gainer' | 'new' | 'memecoin'

export type RiskTier = 'block' | 'warn' | 'allow'

export interface TokenFeedItem {
  mint: string
  name: string
  symbol: string
  imageUri?: string
  priceUsd: number
  priceChange24h: number
  volume24h: number
  liquidity: number
  marketCap?: number
  sparkline?: number[]
  pairAddress?: string
  category: FeedCategory
  riskTier: RiskTier
}
