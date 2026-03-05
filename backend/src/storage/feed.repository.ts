import { FeedSnapshot } from '../feed/feed.cache.js'
import { FeedCategory, FeedLabel, RiskTier, TokenFeedItem } from '../feed/feed.provider.js'
import { formatInFilter, SupabaseClient } from './supabase.client.js'

interface Logger {
  warn: (obj: unknown, msg?: string) => void
  debug?: (obj: unknown, msg?: string) => void
  info?: (obj: unknown, msg?: string) => void
}

interface FeedRepositoryOptions {
  onRowsWritten?: (tableOrView: string, rowCount: number) => void
}

type SnapshotCacheStatus = 'HIT' | 'MISS' | 'STALE'

interface FeedSnapshotHeaderRow {
  id: string
  generated_at: string
  source: FeedSnapshot['source']
}

interface FeedSnapshotItemRefRow {
  position: number
  mint: string
}

export interface ScoredFeedItem {
  mint: string
  score: number
  position: number
}

export class FeedRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: Logger,
    private readonly options: FeedRepositoryOptions = {},
  ) {}

  isEnabled(): boolean {
    return this.supabase.isEnabled()
  }

  async createSnapshot(snapshot: FeedSnapshot, scoredItems: ScoredFeedItem[], cacheStatus: SnapshotCacheStatus): Promise<void> {
    if (!this.supabase.isEnabled()) {
      return
    }

    let snapshotInserted = false
    try {
      await this.supabase.insertRows(
        'feed_snapshots',
        [
          {
            id: snapshot.id,
            generated_at: snapshot.generatedAt,
            source: snapshot.source,
            cache_status: cacheStatus,
            item_count: snapshot.items.length,
          },
        ],
        'minimal',
      )
      this.options.onRowsWritten?.('feed_snapshots', 1)
      snapshotInserted = true

      if (scoredItems.length === 0) {
        return
      }

      await this.supabase.insertRows(
        'feed_snapshot_items',
        scoredItems.map((entry) => ({
          snapshot_id: snapshot.id,
          position: entry.position,
          mint: entry.mint,
          score: entry.score,
        })),
        'minimal',
      )
      this.options.onRowsWritten?.('feed_snapshot_items', scoredItems.length)
    } catch (error) {
      if (snapshotInserted) {
        try {
          await this.supabase.deleteRows(
            'feed_snapshots',
            {
              id: `eq.${snapshot.id}`,
            },
            'minimal',
          )
          this.logger.info?.({ snapshotId: snapshot.id }, 'Rolled back partial feed snapshot write')
        } catch (rollbackError) {
          this.logger.warn(
            { error: rollbackError, snapshotId: snapshot.id },
            'Failed to rollback partial feed snapshot write',
          )
        }
      }
      throw error
    }
  }

  async createSnapshotAndPage(
    snapshot: FeedSnapshot,
    scoredItems: ScoredFeedItem[],
    cacheStatus: SnapshotCacheStatus,
  ): Promise<FeedSnapshot | null> {
    await this.createSnapshot(snapshot, scoredItems, cacheStatus)
    return this.readSnapshotById(snapshot.id)
  }

  async readLatestSnapshot(): Promise<FeedSnapshot | null> {
    if (!this.supabase.isEnabled()) {
      return null
    }

    try {
      const headers = await this.supabase.selectRows<FeedSnapshotHeaderRow>('feed_snapshots', {
        select: 'id,generated_at,source',
        order: 'generated_at.desc',
        limit: '1',
      })

      const header = headers[0]
      if (!header) {
        return null
      }

      return await this.buildSnapshotFromHeader(header)
    } catch (error) {
      this.logger.warn({ error }, 'Failed to read latest feed snapshot from Supabase')
      return null
    }
  }

  async readSnapshotById(snapshotId: string): Promise<FeedSnapshot | null> {
    if (!this.supabase.isEnabled() || snapshotId.trim().length === 0) {
      return null
    }

    try {
      const rows = await this.supabase.selectRows<FeedSnapshotHeaderRow>('feed_snapshots', {
        select: 'id,generated_at,source',
        id: `eq.${snapshotId}`,
        limit: '1',
      })

      const header = rows[0]
      if (!header) {
        return null
      }

      return await this.buildSnapshotFromHeader(header)
    } catch (error) {
      this.logger.warn({ error, snapshotId }, 'Failed to read feed snapshot by id from Supabase')
      return null
    }
  }

  private async buildSnapshotFromHeader(header: FeedSnapshotHeaderRow): Promise<FeedSnapshot | null> {
    const refs = await this.supabase.selectRows<FeedSnapshotItemRefRow>('feed_snapshot_items', {
      select: 'position,mint',
      snapshot_id: `eq.${header.id}`,
      order: 'position.asc',
    })

    if (refs.length === 0) {
      return {
        id: header.id,
        generatedAt: header.generated_at,
        source: header.source,
        items: [],
      }
    }

    const mints = refs.map((row) => row.mint).filter((mint) => mint.length > 0)
    const feedRows = await this.supabase.selectRows<Record<string, unknown>>('v_token_feed', {
      select: '*',
      mint: `in.${formatInFilter(mints)}`,
    })

    const byMint = new Map<string, TokenFeedItem>()
    for (const row of feedRows) {
      const item = mapViewRowToTokenFeedItem(row)
      if (item) {
        byMint.set(item.mint, item)
      }
    }

    const orderedItems: TokenFeedItem[] = []
    for (const ref of refs) {
      const item = byMint.get(ref.mint)
      if (item) {
        orderedItems.push(item)
      }
    }

    this.logger.debug?.(
      { snapshotId: header.id, expectedCount: refs.length, resolvedCount: orderedItems.length },
      'Resolved feed snapshot items from Supabase',
    )

    if (orderedItems.length === 0) {
      return null
    }

    return {
      id: header.id,
      generatedAt: header.generated_at,
      source: header.source,
      items: orderedItems,
    }
  }
}

function mapViewRowToTokenFeedItem(row: Record<string, unknown>): TokenFeedItem | null {
  const mint = readString(row.mint)
  if (!mint) {
    return null
  }

  const category = readCategory(row.category)

  return {
    mint,
    name: readString(row.name) ?? mint,
    symbol: readString(row.symbol) ?? mint.slice(0, 8),
    description: readNullableString(row.description),
    imageUri: readNullableString(row.imageUri),
    priceUsd: readNumber(row.priceUsd, 0),
    priceChange24h: readNumber(row.priceChange24h, 0),
    volume24h: readNumber(row.volume24h, 0),
    liquidity: readNumber(row.liquidity, 0),
    marketCap: readNullableNumber(row.marketCap),
    sparkline: readNumberArray(row.sparkline),
    sparklineMeta: readSparklineMeta(row.sparklineMeta),
    pairAddress: readNullableString(row.pairAddress),
    pairCreatedAtMs: readNullableInteger(row.pairCreatedAtMs),
    tags: readTags(row.tags, row.labels),
    labels: readLabelArray(row.labels),
    sources: readSources(row.sources),
    quoteSymbol: readNullableString(row.quoteSymbol),
    recentVolume5m: readNullableNumber(row.recentVolume5m) ?? undefined,
    recentTxns5m: readNullableInteger(row.recentTxns5m) ?? undefined,
    category,
    riskTier: readRiskTier(row.riskTier),
  }
}

function readSparklineMeta(input: unknown): TokenFeedItem['sparklineMeta'] {
  if (!isRecord(input)) {
    return null
  }

  const window = readString(input.window)
  const interval = readString(input.interval)
  const source = readString(input.source)
  const points = readNumber(input.points, 0)
  const generatedAt = readString(input.generatedAt)

  if (!window || (interval !== '1m' && interval !== '5m') || !source || !generatedAt) {
    return null
  }

  return {
    window: '6h',
    interval,
    source,
    points,
    generatedAt,
    historyQuality: readHistoryQuality(input.historyQuality),
    pointCount1m: readNullableInteger(input.pointCount1m) ?? undefined,
    lastPointTimeSec: readNullableInteger(input.lastPointTimeSec) ?? undefined,
  }
}

function readHistoryQuality(
  input: unknown,
): 'real_backfill' | 'runtime_only' | 'partial' | 'unavailable' | undefined {
  if (input === 'real_backfill' || input === 'runtime_only' || input === 'partial' || input === 'unavailable') {
    return input
  }

  return undefined
}

function readSources(input: unknown): TokenFeedItem['sources'] {
  if (!isRecord(input)) {
    return {
      price: 'seed',
      liquidity: 'seed',
      volume: 'seed',
      marketCap: 'seed',
      metadata: 'seed',
      tags: [],
    }
  }

  const price = input.price
  const liquidity = input.liquidity
  const volume = input.volume
  const marketCap = input.marketCap
  const metadata = input.metadata

  const normalizedPrice = price === 'birdeye' || price === 'dexscreener' || price === 'seed' ? price : 'seed'

  return {
    price: normalizedPrice,
    liquidity:
      liquidity === 'birdeye' || liquidity === 'dexscreener' || liquidity === 'seed' ? liquidity : normalizedPrice,
    volume: volume === 'birdeye' || volume === 'dexscreener' || volume === 'seed' ? volume : normalizedPrice,
    marketCap:
      marketCap === 'birdeye' ||
      marketCap === 'dexscreener_market_cap' ||
      marketCap === 'dexscreener_fdv' ||
      marketCap === 'seed' ||
      marketCap === 'unavailable'
        ? marketCap
        : 'seed',
    metadata: metadata === 'helius' || metadata === 'dexscreener' || metadata === 'seed' ? metadata : 'seed',
    tags: readStringArray(input.tags),
  }
}

function readTags(input: unknown, labelsInput: unknown): TokenFeedItem['tags'] {
  if (!isRecord(input)) {
    return {
      trust: [],
      discovery: readLabelArray(labelsInput),
    }
  }

  return {
    trust: readStringArray(input.trust),
    discovery: readLabelArray(input.discovery),
  }
}

function readLabelArray(input: unknown): FeedLabel[] {
  const values = readStringArray(input)
  return values.filter((value): value is FeedLabel => value === 'trending' || value === 'gainer' || value === 'new' || value === 'meme')
}

function readCategory(input: unknown): FeedCategory {
  if (input === 'trending' || input === 'gainer' || input === 'new' || input === 'memecoin') {
    return input
  }

  return 'trending'
}

function readRiskTier(input: unknown): RiskTier {
  if (input === 'block' || input === 'warn' || input === 'allow') {
    return input
  }

  return 'warn'
}

function readNumberArray(input: unknown): number[] {
  if (!Array.isArray(input)) {
    return []
  }

  const output: number[] = []
  for (const value of input) {
    const parsed = readNullableNumber(value)
    if (parsed !== null) {
      output.push(parsed)
    }
  }

  return output
}

function readNullableNumber(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input
  }

  if (typeof input === 'string') {
    const parsed = Number.parseFloat(input)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function readNumber(input: unknown, fallback: number): number {
  return readNullableNumber(input) ?? fallback
}

function readNullableInteger(input: unknown): number | null {
  if (typeof input === 'number' && Number.isInteger(input)) {
    return input
  }

  if (typeof input === 'string') {
    const parsed = Number.parseInt(input, 10)
    if (Number.isInteger(parsed)) {
      return parsed
    }
  }

  return null
}

function readString(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readNullableString(input: unknown): string | null {
  return readString(input)
}

function readStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}
