import { TokenFeedItem } from '../feed/feed.provider.js'
import {
  PersistedLabelsRow,
  PersistedMarketRow,
  PersistedSparklineRow,
  PersistedTokenRow,
} from './storage.types.js'
import { SupabaseClient } from './supabase.client.js'

interface Logger {
  info?: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
}

export class TokenRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: Logger,
  ) {}

  isEnabled(): boolean {
    return this.supabase.isEnabled()
  }

  async upsertTokenDomainBatch(items: TokenFeedItem[], updatedAt = new Date().toISOString()): Promise<void> {
    if (!this.supabase.isEnabled() || items.length === 0) {
      return
    }

    const latestByMint = new Map<string, TokenFeedItem>()
    for (const item of items) {
      if (item.mint.trim().length === 0) {
        continue
      }
      latestByMint.set(item.mint, item)
    }

    const tokens: PersistedTokenRow[] = []
    const marketRows: PersistedMarketRow[] = []
    const labelsRows: PersistedLabelsRow[] = []
    const sparklineRows: PersistedSparklineRow[] = []

    for (const item of latestByMint.values()) {
      tokens.push({
        mint: item.mint,
        name: item.name,
        symbol: item.symbol,
        description: item.description ?? null,
        image_uri: item.imageUri ?? null,
        updated_at: updatedAt,
      })

      const sources = item.sources ?? {
        price: 'seed',
        marketCap: 'seed',
        metadata: 'seed',
        tags: [],
      }

      marketRows.push({
        mint: item.mint,
        price_usd: finiteOrZero(item.priceUsd),
        price_change_24h: finiteOrZero(item.priceChange24h),
        volume_24h: finiteOrZero(item.volume24h),
        liquidity: finiteOrZero(item.liquidity),
        market_cap: finiteOrNull(item.marketCap),
        pair_address: normalizeNullableString(item.pairAddress),
        pair_created_at_ms: finiteIntegerOrNull(item.pairCreatedAtMs),
        quote_symbol: normalizeNullableString(item.quoteSymbol),
        recent_volume_5m: finiteOrNull(item.recentVolume5m),
        recent_txns_5m: finiteIntegerOrNull(item.recentTxns5m),
        market_source_price: sources.price,
        market_source_market_cap: sources.marketCap,
        metadata_source: sources.metadata,
        updated_at: updatedAt,
      })

      labelsRows.push({
        mint: item.mint,
        category: item.category,
        risk_tier: item.riskTier,
        trust_tags: item.tags?.trust ?? [],
        discovery_labels: item.tags?.discovery ?? item.labels ?? [],
        source_tags: sources.tags,
        updated_at: updatedAt,
      })

      if (Array.isArray(item.sparkline) && item.sparkline.length > 0 && item.sparklineMeta) {
        sparklineRows.push({
          mint: item.mint,
          window: item.sparklineMeta.window,
          interval: item.sparklineMeta.interval,
          points: item.sparklineMeta.points,
          source: item.sparklineMeta.source,
          generated_at: item.sparklineMeta.generatedAt,
          history_quality: item.sparklineMeta.historyQuality ?? null,
          candle_count_1m: finiteIntegerOrNull(item.sparklineMeta.candleCount1m),
          sparkline: item.sparkline.map((value) => finiteOrZero(value)),
        })
      }
    }

    try {
      await this.supabase.upsertRows('tokens', tokens as unknown as Record<string, unknown>[], ['mint'])
      await this.supabase.upsertRows('token_market_latest', marketRows as unknown as Record<string, unknown>[], ['mint'])
      await this.supabase.upsertRows('token_labels_latest', labelsRows as unknown as Record<string, unknown>[], ['mint'])
      if (sparklineRows.length > 0) {
        await this.supabase.upsertRows(
          'token_sparklines_latest',
          sparklineRows as unknown as Record<string, unknown>[],
          ['mint'],
        )
      }

      this.logger.info?.(
        {
          tokenCount: tokens.length,
          marketCount: marketRows.length,
          labelsCount: labelsRows.length,
          sparklineCount: sparklineRows.length,
        },
        'Supabase token domain upsert completed',
      )
    } catch (error) {
      this.logger.warn({ error, tokenCount: tokens.length }, 'Supabase token domain upsert failed')
      throw error
    }
  }
}

function finiteOrZero(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return 0
}

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }

  const parsed = finiteOrZero(value)
  return Number.isFinite(parsed) ? parsed : null
}

function finiteIntegerOrNull(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }

  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed)) {
    return null
  }

  return parsed
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
