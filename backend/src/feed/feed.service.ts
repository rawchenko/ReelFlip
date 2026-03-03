import { randomUUID } from 'node:crypto'
import { FeedCache, FeedSnapshot } from './feed.cache.js'
import { decodeFeedCursor, encodeFeedCursor, FeedCursorError, FeedCursorPayload } from './feed.cursor.js'
import { CompositeFeedProvider, FeedCategory, TokenFeedItem } from './feed.provider.js'

export class InvalidFeedRequestError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'InvalidFeedRequestError'
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
  constructor(
    private readonly cache: FeedCache,
    private readonly provider: CompositeFeedProvider,
    private readonly rankingService: FeedRankingService,
    private readonly defaultLimit: number,
  ) {}

  async getPage(query: FeedQueryInput): Promise<FeedPageResult> {
    const cursorPayload = this.parseCursor(query.cursor)
    const limit = this.resolveLimit(query.limit, cursorPayload)
    const category = this.resolveCategory(query.category, cursorPayload)

    const lookup = await this.cache.readSnapshot()

    let snapshot: FeedSnapshot
    let cacheStatus: FeedPageResult['cacheStatus']

    if (lookup.state === 'fresh' && lookup.entry) {
      snapshot = lookup.entry.snapshot
      cacheStatus = 'HIT'
    } else {
      const providerResult = await this.provider.fetchFeed(new AbortController().signal)

      if (providerResult.usedSeedFallback && lookup.state === 'stale' && lookup.entry) {
        snapshot = lookup.entry.snapshot
        cacheStatus = 'STALE'
      } else {
        const rankedItems = this.rankingService.rank(providerResult.items)
        snapshot = {
          id: randomUUID(),
          generatedAt: new Date().toISOString(),
          source: providerResult.source,
          items: rankedItems,
        }
        await this.cache.writeSnapshot(snapshot)
        cacheStatus = 'MISS'
      }
    }

    if (cursorPayload && cursorPayload.snapshotId !== snapshot.id) {
      throw new InvalidFeedRequestError('Cursor snapshot is no longer valid. Start from the first page.')
    }

    const filtered = category ? snapshot.items.filter((item) => item.category === category) : snapshot.items
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
