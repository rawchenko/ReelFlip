import { TokenFeedItem } from '../feed/feed.provider.js'
import {
  PersistedLabelsRow,
  PersistedMarketRow,
  PersistedPairRow,
  PersistedSparklineRow,
  PersistedTokenRow,
} from './storage.types.js'
import { SupabaseClient } from './supabase.client.js'

interface Logger {
  info?: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
}

interface TokenRepositoryOptions {
  onRowsWritten?: (tableOrView: string, rowCount: number) => void
}

export class TokenRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: Logger,
    private readonly options: TokenRepositoryOptions = {},
  ) {}

  isEnabled(): boolean {
    return this.supabase.isEnabled()
  }

  async upsertTokenDomainBatch(items: TokenFeedItem[], updatedAt = new Date().toISOString()): Promise<void> {
    if (!this.supabase.isEnabled() || items.length === 0) {
      return
    }
    const ingestedAt = new Date().toISOString()

    const latestByMint = new Map<string, TokenFeedItem>()
    for (const item of items) {
      if (item.mint.trim().length === 0) {
        continue
      }
      latestByMint.set(item.mint, item)
    }

    const tokens: PersistedTokenRow[] = []
    const pairsByAddress = new Map<string, PersistedPairRow>()
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
        liquidity: 'seed',
        volume: 'seed',
        marketCap: 'seed',
        metadata: 'seed',
        tags: [],
      }
      const primaryPairAddress = normalizeNullableString(item.pairAddress)
      const quoteSymbol = normalizeNullableString(item.quoteSymbol)
      if (primaryPairAddress) {
        pairsByAddress.set(primaryPairAddress, {
          pair_address: primaryPairAddress,
          mint: item.mint,
          dex: derivePairDex(sources.price),
          quote_symbol: quoteSymbol,
          pair_created_at_ms: finiteIntegerOrNull(item.pairCreatedAtMs),
          updated_at: updatedAt,
          ingested_at: ingestedAt,
          source_discovery: derivePairDiscoverySource(sources.price),
        })
      }

      marketRows.push({
        mint: item.mint,
        price_usd: finiteOrZero(item.priceUsd),
        price_change_24h: finiteOrZero(item.priceChange24h),
        volume_24h: finiteOrZero(item.volume24h),
        liquidity: finiteOrZero(item.liquidity),
        market_cap: finiteOrNull(item.marketCap),
        primary_pair_address: primaryPairAddress,
        recent_volume_5m: finiteOrNull(item.recentVolume5m),
        recent_txns_5m: finiteIntegerOrNull(item.recentTxns5m),
        source_price: sources.price,
        source_market_cap: sources.marketCap,
        source_liquidity: sources.liquidity,
        source_volume: sources.volume,
        source_metadata: sources.metadata,
        updated_at: updatedAt,
        ingested_at: ingestedAt,
      })

      labelsRows.push({
        mint: item.mint,
        category: item.category,
        risk_tier: item.riskTier,
        trust_tags: normalizeAndSortStrings(item.tags?.trust ?? []),
        discovery_labels: normalizeAndSortStrings(item.tags?.discovery ?? item.labels ?? []),
        source_tags: normalizeAndSortStrings(sources.tags),
        source_labels: 'derived',
        updated_at: updatedAt,
        ingested_at: ingestedAt,
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
          point_count_1m: finiteIntegerOrNull(item.sparklineMeta.pointCount1m),
          last_point_time_sec: finiteIntegerOrNull(item.sparklineMeta.lastPointTimeSec),
          sparkline: item.sparkline.map((value) => finiteOrZero(value)),
          updated_at: updatedAt,
          ingested_at: ingestedAt,
        })
      }
    }
    const pairRows = Array.from(pairsByAddress.values())

    try {
      await this.supabase.invokeRpc<void>('upsert_tokens_diff', { rows: tokens as unknown as Record<string, unknown>[] })
      this.options.onRowsWritten?.('tokens', tokens.length)
      if (pairRows.length > 0) {
        await this.supabase.invokeRpc<void>('upsert_token_pairs_diff', {
          rows: pairRows as unknown as Record<string, unknown>[],
        })
        this.options.onRowsWritten?.('token_pairs', pairRows.length)
      }
      await this.supabase.invokeRpc<void>('upsert_token_market_latest_diff', {
        rows: marketRows as unknown as Record<string, unknown>[],
      })
      this.options.onRowsWritten?.('token_market_latest', marketRows.length)
      await this.supabase.invokeRpc<void>('upsert_token_labels_latest_diff', {
        rows: labelsRows as unknown as Record<string, unknown>[],
      })
      this.options.onRowsWritten?.('token_labels_latest', labelsRows.length)
      if (sparklineRows.length > 0) {
        await this.supabase.invokeRpc<void>('upsert_token_sparklines_latest_diff', {
          rows: sparklineRows as unknown as Record<string, unknown>[],
        })
        this.options.onRowsWritten?.('token_sparklines_latest', sparklineRows.length)
      }

      this.logger.info?.(
        {
          tokenCount: tokens.length,
          pairCount: pairRows.length,
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
  return parseFiniteNumber(value) ?? 0
}

function finiteOrNull(value: unknown): number | null {
  return parseFiniteNumber(value)
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
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

function normalizeAndSortStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))).sort()
}

function derivePairDex(source: TokenFeedItem['sources']['price']): string {
  return source === 'seed' ? 'seed' : 'dexscreener'
}

function derivePairDiscoverySource(source: TokenFeedItem['sources']['price']): string {
  return source === 'seed' ? 'seed' : 'dexscreener'
}
