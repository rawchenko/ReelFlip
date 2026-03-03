import { randomUUID } from 'node:crypto'
import { FeedCache, FeedSnapshot } from './feed.cache.js'
import { decodeFeedCursor, encodeFeedCursor, FeedCursorError, FeedCursorPayload } from './feed.cursor.js'
import { CompositeFeedProvider, FeedCategory, FeedLabel, FeedProviderUnavailableError, TokenFeedItem } from './feed.provider.js'

export class InvalidFeedRequestError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'InvalidFeedRequestError'
  }
}

export class FeedUnavailableError extends Error {
  readonly statusCode = 503

  constructor(message = 'Feed is temporarily unavailable. Please try again soon.') {
    super(message)
    this.name = 'FeedUnavailableError'
  }
}

export interface FeedQueryInput {
  cursor?: string
  category?: FeedCategory
  limit?: number
}

export interface FeedPageResult {
  items: TokenFeedItem[]
  nextCursor: string | null
  generatedAt: string
  cacheStatus: 'HIT' | 'MISS' | 'STALE'
  source: 'providers' | 'seed'
  eligibilityStats?: FeedEligibilityStats
}

type FeedEligibilityRejectionReason = 'missing_pair' | 'insufficient_chart_history' | 'chart_quality_not_full'

interface FeedEligibilityStats {
  filteredTotal: number
  reasons: Record<FeedEligibilityRejectionReason, number>
}

interface FeedServiceOptions {
  enableSeedFallback?: boolean
  minChartCandles?: number
  requireFullChartHistory?: boolean
  enforceRenderableTokens?: boolean
}

const CATEGORY_TO_DISCOVERY_LABEL: Record<FeedCategory, FeedLabel> = {
  trending: 'trending',
  gainer: 'gainer',
  new: 'new',
  memecoin: 'meme',
}

export class FeedRankingService {
  rank(items: TokenFeedItem[]): TokenFeedItem[] {
    const scored = items.map((item, index) => ({ item, index, score: this.score(item) }))
    const bestByMint = new Map<string, (typeof scored)[number]>()

    for (const candidate of scored) {
      const existing = bestByMint.get(candidate.item.mint)
      if (!existing) {
        bestByMint.set(candidate.item.mint, candidate)
        continue
      }

      if (candidate.score > existing.score) {
        bestByMint.set(candidate.item.mint, candidate)
        continue
      }

      if (candidate.score === existing.score && candidate.item.liquidity > existing.item.liquidity) {
        bestByMint.set(candidate.item.mint, candidate)
        continue
      }

      if (
        candidate.score === existing.score &&
        candidate.item.liquidity === existing.item.liquidity &&
        (candidate.item.pairAddress ?? '').localeCompare(existing.item.pairAddress ?? '') < 0
      ) {
        bestByMint.set(candidate.item.mint, candidate)
      }
    }

    return Array.from(bestByMint.values())
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score
        }

        if (left.item.mint !== right.item.mint) {
          return left.item.mint.localeCompare(right.item.mint)
        }

        return left.index - right.index
      })
      .map((entry) => entry.item)
  }

  private score(item: TokenFeedItem): number {
    const liquidityScore = Math.log10(Math.max(1, item.liquidity))
    const volumeScore = Math.log10(Math.max(1, item.volume24h))
    const recentVolumeScore = Math.log10(Math.max(1, item.recentVolume5m ?? 0))
    const recentTradesScore = Math.log10(Math.max(1, item.recentTxns5m ?? 0))
    const moveScore = Math.min(Math.max(item.priceChange24h, -40), 40) / 40
    const riskPenalty = item.riskTier === 'block' ? 2 : item.riskTier === 'warn' ? 0.5 : 0
    const stalePenalty = (item.recentTxns5m ?? 0) === 0 ? 0.8 : 0
    const quoteBonus =
      item.quoteSymbol === 'USDC' || item.quoteSymbol === 'USDT'
        ? 0.3
        : item.quoteSymbol === 'SOL' || item.quoteSymbol === 'WSOL'
          ? 0.15
          : 0

    return (
      liquidityScore * 0.33 +
      volumeScore * 0.22 +
      recentVolumeScore * 0.16 +
      recentTradesScore * 0.12 +
      moveScore * 0.17 +
      quoteBonus -
      stalePenalty -
      riskPenalty
    )
  }
}

export class FeedService {
  private readonly enableSeedFallback: boolean
  private readonly minChartCandles: number
  private readonly requireFullChartHistory: boolean
  private readonly enforceRenderableTokens: boolean

  constructor(
    private readonly cache: FeedCache,
    private readonly provider: CompositeFeedProvider,
    private readonly rankingService: FeedRankingService,
    private readonly defaultLimit: number,
    options: FeedServiceOptions = {},
  ) {
    this.enableSeedFallback = options.enableSeedFallback ?? true
    this.minChartCandles = Math.max(0, options.minChartCandles ?? 120)
    this.requireFullChartHistory = options.requireFullChartHistory ?? true
    this.enforceRenderableTokens = options.enforceRenderableTokens ?? false
  }

  async getPage(query: FeedQueryInput): Promise<FeedPageResult> {
    const cursorPayload = this.parseCursor(query.cursor)
    const limit = this.resolveLimit(query.limit, cursorPayload)
    const category = this.resolveCategory(query.category, cursorPayload)
    if (cursorPayload) {
      const snapshot = await this.cache.readSnapshotById(cursorPayload.snapshotId)
      if (!snapshot) {
        throw new InvalidFeedRequestError('Cursor snapshot is no longer valid. Start from the first page.')
      }

      return this.paginateSnapshot(snapshot, cursorPayload, category, limit, 'HIT')
    }

    const lookup = await this.cache.readSnapshot()
    const staleSnapshot = this.resolveStaleSnapshot(lookup)
    const freshSnapshot =
      lookup.state === 'fresh' && lookup.entry && this.canUseSnapshot(lookup.entry.snapshot) ? lookup.entry.snapshot : null

    if (freshSnapshot) {
      return this.paginateSnapshot(freshSnapshot, null, category, limit, 'HIT')
    }

    try {
      const providerResult = await this.provider.fetchFeed(new AbortController().signal)

      if (!this.enableSeedFallback && providerResult.usedSeedFallback) {
        if (staleSnapshot) {
          return this.paginateSnapshot(staleSnapshot, null, category, limit, 'STALE')
        }
        throw new FeedUnavailableError()
      }

      if (providerResult.usedSeedFallback && staleSnapshot) {
        return this.paginateSnapshot(staleSnapshot, null, category, limit, 'STALE')
      }

      const eligibilityResult = this.filterRenderableItems(providerResult.items)
      if (this.enforceRenderableTokens && eligibilityResult.items.length === 0) {
        if (staleSnapshot) {
          return this.paginateSnapshot(staleSnapshot, null, category, limit, 'STALE')
        }
        throw new FeedUnavailableError('No renderable tokens are currently available. Please try again soon.')
      }

      const rankedItems = this.rankingService.rank(eligibilityResult.items)
      const snapshot: FeedSnapshot = {
        id: randomUUID(),
        generatedAt: new Date().toISOString(),
        source: providerResult.source,
        items: rankedItems,
      }
      await this.cache.writeSnapshot(snapshot)

      const page = this.paginateSnapshot(snapshot, null, category, limit, 'MISS')
      return {
        ...page,
        eligibilityStats: eligibilityResult.stats,
      }
    } catch (error) {
      if (error instanceof FeedUnavailableError) {
        throw error
      }

      if (error instanceof FeedProviderUnavailableError) {
        if (staleSnapshot) {
          return this.paginateSnapshot(staleSnapshot, null, category, limit, 'STALE')
        }
        throw new FeedUnavailableError()
      }

      throw error
    }
  }

  private canUseSnapshot(snapshot: FeedSnapshot): boolean {
    return this.enableSeedFallback || snapshot.source === 'providers'
  }

  private resolveStaleSnapshot(lookup: Awaited<ReturnType<FeedCache['readSnapshot']>>): FeedSnapshot | null {
    if (lookup.state !== 'stale' || !lookup.entry) {
      return null
    }

    return this.canUseSnapshot(lookup.entry.snapshot) ? lookup.entry.snapshot : null
  }

  private paginateSnapshot(
    snapshot: FeedSnapshot,
    cursorPayload: FeedCursorPayload | null,
    category: FeedCategory | null,
    limit: number,
    cacheStatus: FeedPageResult['cacheStatus'],
  ): FeedPageResult {
    const filtered = category ? snapshot.items.filter((item) => this.matchesCategory(item, category)) : snapshot.items
    const offset = cursorPayload?.offset ?? 0

    if (offset > filtered.length) {
      throw new InvalidFeedRequestError('Cursor offset is out of range.')
    }

    const pageEnd = offset + limit
    const items = filtered.slice(offset, pageEnd)
    const nextCursor =
      pageEnd < filtered.length
        ? encodeFeedCursor({
            snapshotId: snapshot.id,
            offset: pageEnd,
            category,
            limit,
          })
        : null

    return {
      items,
      nextCursor,
      generatedAt: snapshot.generatedAt,
      cacheStatus,
      source: snapshot.source,
    }
  }

  private matchesCategory(item: TokenFeedItem, category: FeedCategory): boolean {
    if (item.category === category) {
      return true
    }

    const label = CATEGORY_TO_DISCOVERY_LABEL[category]
    return item.labels?.includes(label) ?? false
  }

  private filterRenderableItems(items: TokenFeedItem[]): {
    items: TokenFeedItem[]
    stats: FeedEligibilityStats
  } {
    const stats: FeedEligibilityStats = {
      filteredTotal: 0,
      reasons: {
        missing_pair: 0,
        insufficient_chart_history: 0,
        chart_quality_not_full: 0,
      },
    }

    if (!this.enforceRenderableTokens) {
      return { items, stats }
    }

    const eligible: TokenFeedItem[] = []
    for (const item of items) {
      const reason = this.getIneligibilityReason(item)
      if (!reason) {
        eligible.push(item)
        continue
      }

      stats.filteredTotal += 1
      stats.reasons[reason] += 1
    }

    return { items: eligible, stats }
  }

  private getIneligibilityReason(item: TokenFeedItem): FeedEligibilityRejectionReason | null {
    const pairAddress = item.pairAddress?.trim()
    if (!pairAddress) {
      return 'missing_pair'
    }

    const candleCount1m = item.sparklineMeta?.candleCount1m ?? 0
    if (candleCount1m < this.minChartCandles) {
      return 'insufficient_chart_history'
    }

    if (this.requireFullChartHistory && item.sparklineMeta?.historyQuality !== 'real_backfill') {
      return 'chart_quality_not_full'
    }

    return null
  }

  private parseCursor(cursor?: string): FeedCursorPayload | null {
    if (!cursor) {
      return null
    }

    try {
      return decodeFeedCursor(cursor)
    } catch (error) {
      if (error instanceof FeedCursorError) {
        throw new InvalidFeedRequestError('Cursor is invalid.')
      }

      throw error
    }
  }

  private resolveLimit(limit: number | undefined, cursorPayload: FeedCursorPayload | null): number {
    if (!cursorPayload) {
      return limit ?? this.defaultLimit
    }

    if (limit === undefined) {
      return cursorPayload.limit
    }

    if (limit !== cursorPayload.limit) {
      throw new InvalidFeedRequestError('Cursor and limit must match.')
    }

    return cursorPayload.limit
  }

  private resolveCategory(
    category: FeedCategory | undefined,
    cursorPayload: FeedCursorPayload | null,
  ): FeedCategory | null {
    if (!cursorPayload) {
      return category ?? null
    }

    if ((category ?? null) !== cursorPayload.category) {
      throw new InvalidFeedRequestError('Cursor and category must match.')
    }

    return cursorPayload.category
  }
}
