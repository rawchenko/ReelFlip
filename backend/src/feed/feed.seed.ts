import { FeedLabel, TokenFeedItem } from './feed.provider.js'

const DEFAULT_SEED_SPARKLINE_META = {
  window: '6h' as const,
  interval: '5m' as const,
  source: 'seed_static',
  generatedAt: new Date(0).toISOString(),
}

function buildSeededItem(
  item: Omit<TokenFeedItem, 'description' | 'tags' | 'sources' | 'sparklineMeta'> & {
    description?: string | null
    labels?: FeedLabel[]
  },
): TokenFeedItem {
  const discovery: FeedLabel[] =
    Array.isArray(item.labels) && item.labels.length > 0
      ? item.labels
      : item.category === 'memecoin'
        ? ['meme']
        : [item.category]
  const trust = item.riskTier === 'block' ? ['risk_block'] : item.riskTier === 'warn' ? ['risk_warn'] : []

  return {
    ...item,
    description: item.description ?? null,
    tags: {
      trust,
      discovery,
    },
    sources: {
      price: 'seed',
      marketCap: 'seed',
      metadata: 'seed',
      tags: trust.length > 0 ? ['internal_risk', 'seed'] : ['seed'],
    },
    sparklineMeta:
      item.sparkline.length > 0
        ? {
            ...DEFAULT_SEED_SPARKLINE_META,
            points: item.sparkline.length,
          }
        : null,
  }
}

export const DEFAULT_SEEDED_FEED: TokenFeedItem[] = [
  buildSeededItem({
    mint: 'So11111111111111111111111111111111111111112',
    name: 'Wrapped SOL',
    symbol: 'SOL',
    imageUri: null,
    priceUsd: 184.21,
    priceChange24h: 5.4,
    volume24h: 3_418_000_000,
    liquidity: 802_000_000,
    marketCap: 91_000_000_000,
    sparkline: [175.3, 177.5, 179.8, 181.2, 182.6, 184.21],
    pairAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
    labels: ['trending'],
    category: 'trending',
    riskTier: 'allow',
  }),
  buildSeededItem({
    mint: '4nKiBzUscGCKkEpz1Jz8upgbaRySigVF94FcDZ6RN5u5',
    name: 'dogwifhat',
    symbol: 'WIF',
    imageUri: null,
    priceUsd: 2.43,
    priceChange24h: -2.1,
    volume24h: 659_000_000,
    liquidity: 112_000_000,
    marketCap: 2_400_000_000,
    sparkline: [2.65, 2.57, 2.54, 2.5, 2.46, 2.43],
    pairAddress: 'AhnSokYSRhBQCGkvidA2WqczjUbcHq1PqapuA1PPjLQ8',
    labels: ['trending', 'meme'],
    category: 'memecoin',
    riskTier: 'warn',
  }),
  buildSeededItem({
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    name: 'Bonk',
    symbol: 'BONK',
    imageUri: null,
    priceUsd: 0.00003,
    priceChange24h: 8.6,
    volume24h: 430_000_000,
    liquidity: 92_000_000,
    marketCap: 2_100_000_000,
    sparkline: [0.000021, 0.000023, 0.000025, 0.000027, 0.000028, 0.00003],
    pairAddress: '3ne4mWqdYuNiYrYZC9TrA3FcfuFdErghH97vNPbjicr1',
    labels: ['trending', 'meme'],
    category: 'gainer',
    riskTier: 'warn',
  }),
  buildSeededItem({
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    name: 'Jupiter',
    symbol: 'JUP',
    imageUri: null,
    priceUsd: 1.34,
    priceChange24h: 3.2,
    volume24h: 301_000_000,
    liquidity: 145_000_000,
    marketCap: 1_800_000_000,
    sparkline: [1.15, 1.18, 1.21, 1.26, 1.3, 1.34],
    pairAddress: 'C1MgLojNLWBKADvu9BHdtgzz1oZX4dZ5zGdGcgvvW8Wz',
    labels: ['trending'],
    category: 'trending',
    riskTier: 'allow',
  }),
  buildSeededItem({
    mint: 'rndrxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    name: 'Render',
    symbol: 'RNDR',
    imageUri: null,
    priceUsd: 7.88,
    priceChange24h: 1.1,
    volume24h: 220_000_000,
    liquidity: 51_000_000,
    marketCap: 3_000_000_000,
    sparkline: [6.91, 7.05, 7.18, 7.33, 7.6, 7.88],
    pairAddress: '6hX6S2jWq6Xn1v3Tq8A2kM7tJ3mL5fN9pQ4rV2xZ1sD8',
    labels: ['trending', 'new'],
    category: 'new',
    riskTier: 'allow',
  }),
  buildSeededItem({
    mint: 'F8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f',
    name: 'Turbo Cat',
    symbol: 'TCAT',
    imageUri: null,
    priceUsd: 0.0142,
    priceChange24h: 19.7,
    volume24h: 9_600_000,
    liquidity: 1_300_000,
    marketCap: 14_000_000,
    sparkline: [0.0041, 0.0058, 0.0077, 0.0099, 0.0124, 0.0142],
    pairAddress: '9fP4qL6vM8kN1hS3dR5tY7uI2oP4aS6dF8gH1jK3lM5',
    labels: ['trending', 'meme'],
    category: 'memecoin',
    riskTier: 'block',
  }),
]
