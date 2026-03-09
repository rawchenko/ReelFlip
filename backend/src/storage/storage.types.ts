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
  primary_pair_address: string | null
  recent_volume_5m: number | null
  recent_txns_5m: number | null
  source_price: TokenFeedItem['sources']['price']
  source_market_cap: TokenFeedItem['sources']['marketCap']
  source_liquidity: TokenFeedItem['sources']['liquidity']
  source_volume: TokenFeedItem['sources']['volume']
  source_metadata: TokenFeedItem['sources']['metadata']
  updated_at: string
  ingested_at: string
}

export interface PersistedPairRow {
  pair_address: string
  mint: string
  dex: string
  quote_symbol: string | null
  pair_created_at_ms: number | null
  updated_at: string
  ingested_at: string
  source_discovery: string
}

export interface PersistedLabelsRow {
  mint: string
  category: FeedCategory
  risk_tier: RiskTier
  trust_tags: string[]
  discovery_labels: string[]
  source_tags: string[]
  source_labels: string
  updated_at: string
  ingested_at: string
}

export interface PersistedSparklineRow {
  mint: string
  window: '6h'
  interval: '1m' | '5m'
  points: number
  source: string
  generated_at: string
  history_quality: ChartHistoryQuality | null
  point_count_1m: number | null
  last_point_time_sec: number | null
  sparkline: number[]
  updated_at: string
  ingested_at: string
}

export interface PersistedCandleRow {
  pair_address: string
  time_sec: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  sample_count: number
  source: string
  updated_at: string
  ingested_at: string
}

export interface PersistedWatchlistRow {
  wallet: string
  mint: string
  added_at: string
}
