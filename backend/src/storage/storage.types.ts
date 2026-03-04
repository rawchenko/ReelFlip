import { ChartHistoryQuality } from '../chart/chart.types.js'
import { FeedCategory, RiskTier, TokenFeedItem } from '../feed/feed.provider.js'

export interface PersistedTokenRow {
  mint: string
  name: string
  symbol: string
  description: string | null
  image_uri: string | null
  first_seen_at?: string
  updated_at: string
}

export interface PersistedMarketRow {
  mint: string
  price_usd: number
  price_change_24h: number
  volume_24h: number
  liquidity: number
  market_cap: number | null
  pair_address: string | null
  pair_created_at_ms: number | null
  quote_symbol: string | null
  recent_volume_5m: number | null
  recent_txns_5m: number | null
  market_source_price: TokenFeedItem['sources']['price']
  market_source_market_cap: TokenFeedItem['sources']['marketCap']
  metadata_source: TokenFeedItem['sources']['metadata']
  updated_at: string
}

export interface PersistedLabelsRow {
  mint: string
  category: FeedCategory
  risk_tier: RiskTier
  trust_tags: string[]
  discovery_labels: string[]
  source_tags: string[]
  updated_at: string
}

export interface PersistedSparklineRow {
  mint: string
  window: '6h'
  interval: '1m' | '5m'
  points: number
  source: string
  generated_at: string
  history_quality: ChartHistoryQuality | null
  candle_count_1m: number | null
  sparkline: number[]
}

export interface PersistedCandleRow {
  pair_address: string
  bucket_start: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  sample_count: number
}
