export type FeedCategory = 'trending' | 'gainer' | 'new' | 'memecoin'
export type FeedLabel = 'trending' | 'gainer' | 'new' | 'meme'

export type RiskTier = 'block' | 'warn' | 'allow'
export type FeedCardAction = 'like' | 'comment' | 'share' | 'hide'
export type FeedTradeSide = 'buy' | 'sell'

export interface TokenFeedItem {
  mint: string
  name: string
  symbol: string
  description?: string
  imageUri?: string
  priceUsd: number
  priceChange24h: number
  volume24h: number
  liquidity: number
  marketCap?: number
  sparkline?: number[]
  pairAddress?: string
  category: FeedCategory
  labels?: FeedLabel[]
  riskTier: RiskTier
}
