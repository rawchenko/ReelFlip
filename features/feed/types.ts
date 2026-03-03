export type FeedCategory = 'trending' | 'gainer' | 'new' | 'memecoin'
export type FeedLabel = 'trending' | 'gainer' | 'new' | 'meme'

export type RiskTier = 'block' | 'warn' | 'allow'
export type FeedCardAction = 'like' | 'comment' | 'share' | 'hide'
export type FeedTradeSide = 'buy' | 'sell'

export interface TokenFeedTags {
  trust: string[]
  discovery: FeedLabel[]
}

export interface TokenFeedSparklineMeta {
  window: '6h'
  interval: '1m'
  source: string
  points: number
  generatedAt: string
}

export interface TokenFeedSources {
  price: 'birdeye' | 'dexscreener' | 'seed'
  marketCap: 'birdeye' | 'dexscreener_market_cap' | 'dexscreener_fdv' | 'seed' | 'unavailable'
  metadata: 'helius' | 'dexscreener' | 'seed'
  tags: string[]
}

export interface TokenFeedItem {
  mint: string
  name: string
  symbol: string
  description?: string | null
  imageUri?: string | null
  priceUsd: number
  priceChange24h: number
  volume24h: number
  liquidity: number
  marketCap?: number | null
  sparkline?: number[]
  sparklineMeta?: TokenFeedSparklineMeta | null
  pairAddress?: string | null
  tags?: TokenFeedTags
  category: FeedCategory
  labels?: FeedLabel[]
  sources?: TokenFeedSources
  riskTier: RiskTier
}
