import { randomUUID } from 'node:crypto'
import { FeedCache, FeedSnapshot } from './feed.cache.js'
import { decodeFeedCursor, encodeFeedCursor, FeedCursorError, FeedCursorPayload } from './feed.cursor.js'
import { CompositeFeedProvider, FeedCategory, FeedLabel, FeedProviderUnavailableError, TokenFeedItem } from './feed.provider.js'
import { FeedRepository, ScoredFeedItem } from '../storage/feed.repository.js'
import { TokenRepository } from '../storage/token.repository.js'

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
  minLifetimeHours?: number
  limit?: number
  mints?: string[]
}

export interface FeedPageResult {
  items: TokenFeedItem[]
  nextCursor: string | null
  generatedAt: string
  cacheStatus: 'HIT' | 'MISS' | 'STALE'
  stale: boolean
  cacheStorage: 'redis_cache' | 'memory_cache' | 'repository' | 'miss'
  source: 'providers' | 'seed'
  eligibilityStats?: FeedEligibilityStats
}

export type SnapshotPersistenceStatus = 'skipped' | 'succeeded' | 'failed'

export interface SnapshotPersistenceOutcome {
  status: SnapshotPersistenceStatus
  errorMessage?: string
}

export interface RefreshSnapshotOutcome {
  snapshot: FeedSnapshot | null
  persistence: SnapshotPersistenceOutcome
}

type FeedEligibilityRejectionReason =
  | 'missing_pair'
  | 'insufficient_chart_history'
  | 'chart_stale'
  | 'risk_block'

interface FeedEligibilityStats {
  filteredTotal: number
  reasons: Record<FeedEligibilityRejectionReason, number>
}

interface FeedServiceOptions {
  enableSeedFallback?: boolean
  minChartCandles?: number
  requireFullChartHistory?: boolean
  enforceRenderableTokens?: boolean
  requireLiveSourceForMinLifetime?: boolean
  trendingMinLifetimeHours?: number
  trendingExcludeRiskBlock?: boolean
  trendingRequireProviderSource?: boolean
  tokenRepository?: TokenRepository
  feedRepository?: FeedRepository
  readThroughEnabled?: boolean
  preferSupabaseRead?: boolean
  writeThroughEnabled?: boolean
  allowSyncRefreshOnMiss?: boolean
  logger?: {
    warn: (obj: unknown, msg?: string) => void
  }
}

const CATEGORY_TO_DISCOVERY_LABEL: Record<FeedCategory, FeedLabel> = {
  trending: 'trending',
  gainer: 'gainer',
  new: 'new',
  memecoin: 'meme',
}

function createEmptyEligibilityStats(): FeedEligibilityStats {
  return {
    filteredTotal: 0,
    reasons: {
      missing_pair: 0,
      insufficient_chart_history: 0,
      chart_stale: 0,
      risk_block: 0,
    },
  }
}

export class FeedRankingService {
  rank(items: TokenFeedItem[]): TokenFeedItem[] {
    return this.rankWithScores(items).map((entry) => entry.item)
  }

  rankWithScores(items: TokenFeedItem[]): Array<{ item: TokenFeedItem; score: number }> {
    const scored = items.map((item, index) => ({ item, index, score: this.scoreItem(item) }))
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
      .map((entry) => ({ item: entry.item, score: entry.score }))
  }

  scoreItem(item: TokenFeedItem): number {
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
  private readonly maxChartPointStalenessSec = 180
  private readonly enableSeedFallback: boolean
  private readonly minChartCandles: number
  private readonly requireFullChartHistory: boolean
  private readonly enforceRenderableTokens: boolean
  private readonly requireLiveSourceForMinLifetime: boolean
  private readonly trendingMinLifetimeHours: number
  private readonly trendingExcludeRiskBlock: boolean
  private readonly trendingRequireProviderSource: boolean
  private readonly tokenRepository?: TokenRepository
  private readonly feedRepository?: FeedRepository
  private readonly readThroughEnabled: boolean
  private readonly preferSupabaseRead: boolean
  private readonly writeThroughEnabled: boolean
  private readonly allowSyncRefreshOnMiss: boolean
  private readonly logger?: {
    warn: (obj: unknown, msg?: string) => void
  }

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
    this.requireLiveSourceForMinLifetime = options.requireLiveSourceForMinLifetime ?? false
    this.trendingMinLifetimeHours = Math.max(0, options.trendingMinLifetimeHours ?? 6)
    this.trendingExcludeRiskBlock = options.trendingExcludeRiskBlock ?? true
    this.trendingRequireProviderSource = options.trendingRequireProviderSource ?? true
    this.tokenRepository = options.tokenRepository
    this.feedRepository = options.feedRepository
    this.readThroughEnabled = options.readThroughEnabled ?? false
    this.preferSupabaseRead = options.preferSupabaseRead ?? false
    this.writeThroughEnabled = options.writeThroughEnabled ?? false
    this.allowSyncRefreshOnMiss = options.allowSyncRefreshOnMiss ?? true
    this.logger = options.logger
  }

  async getPage(query: FeedQueryInput): Promise<FeedPageResult> {
    const cursorPayload = this.parseCursor(query.cursor)
    const limit = this.resolveLimit(query.limit, cursorPayload)
    const category = this.resolveCategory(query.category, cursorPayload)
    const minLifetimeHours = this.resolveEffectiveMinLifetimeHours(category, query.minLifetimeHours, cursorPayload)
    const mintSet = query.mints && query.mints.length > 0 ? new Set(query.mints) : null
    const requiresLiveSource =
      (this.requireLiveSourceForMinLifetime && minLifetimeHours !== null && minLifetimeHours > 0) ||
      (category === 'trending' && this.trendingRequireProviderSource)
    if (cursorPayload) {
      let snapshot: FeedSnapshot | null = null
      let cacheStatus: 'HIT' | 'MISS' = 'HIT'
      let cacheStorage: FeedPageResult['cacheStorage'] = this.cache.cacheStorage()

      if (this.preferSupabaseRead && this.readThroughEnabled && this.feedRepository?.isEnabled()) {
        snapshot = await this.feedRepository.readSnapshotById(cursorPayload.snapshotId)
        if (snapshot) {
          cacheStatus = 'MISS'
          cacheStorage = 'repository'
          await this.cache.writeSnapshot(snapshot).catch(() => undefined)
        }
      }

      if (!snapshot) {
        snapshot = await this.cache.readSnapshotById(cursorPayload.snapshotId)
      }

      if (!snapshot && this.readThroughEnabled && this.feedRepository?.isEnabled()) {
        snapshot = await this.feedRepository.readSnapshotById(cursorPayload.snapshotId)
        if (snapshot) {
          cacheStatus = 'MISS'
          cacheStorage = 'repository'
          await this.cache.writeSnapshot(snapshot).catch(() => undefined)
        }
      }
      if (!snapshot) {
        throw new InvalidFeedRequestError('Cursor snapshot is no longer valid. Start from the first page.')
      }
      if (requiresLiveSource && snapshot.source !== 'providers') {
        throw new FeedUnavailableError('Live feed providers are temporarily unavailable. Please try again soon.')
      }

      return this.paginateSnapshot(snapshot, cursorPayload, category, minLifetimeHours, limit, cacheStatus, cacheStorage, mintSet)
    }

    let triedLatestSnapshotInSupabase = false
    if (this.preferSupabaseRead && this.readThroughEnabled && this.feedRepository?.isEnabled()) {
      triedLatestSnapshotInSupabase = true
      const persistedSnapshot = await this.feedRepository.readLatestSnapshot()
      if (persistedSnapshot && this.canUseSnapshot(persistedSnapshot)) {
        if (!requiresLiveSource || persistedSnapshot.source === 'providers') {
          await this.cache.writeSnapshot(persistedSnapshot).catch(() => undefined)
          return this.paginateSnapshot(
            persistedSnapshot,
            null,
            category,
            minLifetimeHours,
            limit,
            'MISS',
            'repository',
            mintSet,
          )
        }
      }
    }

    const lookup = await this.cache.readSnapshot()
    const staleSnapshot = this.resolveStaleSnapshot(lookup)
    const freshSnapshot =
      lookup.state === 'fresh' && lookup.entry && this.canUseSnapshot(lookup.entry.snapshot) ? lookup.entry.snapshot : null
    const staleProviderSnapshot = staleSnapshot?.source === 'providers' ? staleSnapshot : null

    if (freshSnapshot && (!requiresLiveSource || freshSnapshot.source === 'providers')) {
      return this.paginateSnapshot(
        freshSnapshot,
        null,
        category,
        minLifetimeHours,
        limit,
        'HIT',
        lookup.storage === 'miss' ? this.cache.cacheStorage() : lookup.storage,
        mintSet,
      )
    }

    if (!triedLatestSnapshotInSupabase && this.readThroughEnabled && this.feedRepository?.isEnabled()) {
      const persistedSnapshot = await this.feedRepository.readLatestSnapshot()
      if (persistedSnapshot && this.canUseSnapshot(persistedSnapshot)) {
        if (!requiresLiveSource || persistedSnapshot.source === 'providers') {
          await this.cache.writeSnapshot(persistedSnapshot).catch(() => undefined)
          return this.paginateSnapshot(
            persistedSnapshot,
            null,
            category,
            minLifetimeHours,
            limit,
            'MISS',
            'repository',
            mintSet,
          )
        }
      }
    }

    if (requiresLiveSource && staleProviderSnapshot) {
      return this.paginateSnapshot(
        staleProviderSnapshot,
        null,
        category,
        minLifetimeHours,
        limit,
        'STALE',
        lookup.storage === 'miss' ? this.cache.cacheStorage() : lookup.storage,
        mintSet,
      )
    }

    if (!requiresLiveSource && staleSnapshot) {
      return this.paginateSnapshot(
        staleSnapshot,
        null,
        category,
        minLifetimeHours,
        limit,
        'STALE',
        lookup.storage === 'miss' ? this.cache.cacheStorage() : lookup.storage,
        mintSet,
      )
    }

    if (this.allowSyncRefreshOnMiss) {
      try {
        const providerResult = await this.provider.fetchFeed(new AbortController().signal)

        if (!this.enableSeedFallback && providerResult.usedSeedFallback) {
          if (staleProviderSnapshot) {
            return this.paginateSnapshot(
              staleProviderSnapshot,
              null,
              category,
              minLifetimeHours,
              limit,
              'STALE',
              lookup.storage === 'miss' ? this.cache.cacheStorage() : lookup.storage,
              mintSet,
            )
          }
          throw new FeedUnavailableError()
        }

        if (requiresLiveSource && providerResult.usedSeedFallback) {
          if (staleProviderSnapshot) {
            return this.paginateSnapshot(
              staleProviderSnapshot,
              null,
              category,
              minLifetimeHours,
              limit,
              'STALE',
              lookup.storage === 'miss' ? this.cache.cacheStorage() : lookup.storage,
              mintSet,
            )
          }

          throw new FeedUnavailableError('Live feed providers are temporarily unavailable. Please try again soon.')
        }

        if (providerResult.usedSeedFallback && staleSnapshot) {
          return this.paginateSnapshot(
            staleSnapshot,
            null,
            category,
            minLifetimeHours,
            limit,
            'STALE',
            lookup.storage === 'miss' ? this.cache.cacheStorage() : lookup.storage,
            mintSet,
          )
        }

        const eligibilityResult = this.filterRenderableItems(providerResult.items)
        if (this.enforceRenderableTokens && eligibilityResult.items.length === 0) {
          if (staleSnapshot) {
            return this.paginateSnapshot(
              staleSnapshot,
              null,
              category,
              minLifetimeHours,
              limit,
              'STALE',
              lookup.storage === 'miss' ? this.cache.cacheStorage() : lookup.storage,
              mintSet,
            )
          }
          throw new FeedUnavailableError('No renderable tokens are currently available. Please try again soon.')
        }

        const result = await this.materializeSnapshot(providerResult.source, eligibilityResult.items)
        const page = this.paginateSnapshot(
          result.snapshot,
          null,
          category,
          minLifetimeHours,
          limit,
          'MISS',
          this.cache.cacheStorage(),
          mintSet,
        )
        return {
          ...page,
          eligibilityStats: this.mergeEligibilityStats(eligibilityResult.stats, page.eligibilityStats),
        }
      } catch (error) {
        if (error instanceof FeedUnavailableError) {
          throw error
        }

        if (error instanceof FeedProviderUnavailableError) {
          if (requiresLiveSource && staleProviderSnapshot) {
            return this.paginateSnapshot(
              staleProviderSnapshot,
              null,
              category,
              minLifetimeHours,
              limit,
              'STALE',
              lookup.storage === 'miss' ? this.cache.cacheStorage() : lookup.storage,
              mintSet,
            )
          }

          if (!requiresLiveSource && staleSnapshot) {
            return this.paginateSnapshot(
              staleSnapshot,
              null,
              category,
              minLifetimeHours,
              limit,
              'STALE',
              lookup.storage === 'miss' ? this.cache.cacheStorage() : lookup.storage,
              mintSet,
            )
          }
          throw new FeedUnavailableError()
        }

        throw error
      }
    }

    throw new FeedUnavailableError(
      requiresLiveSource
        ? 'Live feed providers are temporarily unavailable. Please try again soon.'
        : 'Feed is temporarily unavailable. Please try again soon.',
    )
  }

  async refreshSnapshot(): Promise<FeedSnapshot | null> {
    const result = await this.refreshSnapshotWithOutcome()
    return result.snapshot
  }

  async refreshSnapshotWithOutcome(): Promise<RefreshSnapshotOutcome> {
    const providerResult = await this.provider.fetchFeed(new AbortController().signal)

    if (!this.enableSeedFallback && providerResult.usedSeedFallback) {
      throw new FeedUnavailableError('Live feed providers are temporarily unavailable. Please try again soon.')
    }

    const eligibilityResult = this.filterRenderableItems(providerResult.items)
    if (this.enforceRenderableTokens && eligibilityResult.items.length === 0) {
      throw new FeedUnavailableError('No renderable tokens are currently available. Please try again soon.')
    }

    return this.materializeSnapshot(providerResult.source, eligibilityResult.items)
  }

  private async materializeSnapshot(
    source: FeedSnapshot['source'],
    items: TokenFeedItem[],
  ): Promise<{ snapshot: FeedSnapshot; persistence: SnapshotPersistenceOutcome }> {
    const rankedWithScores = this.rankingService.rankWithScores(items)
    const snapshot: FeedSnapshot = {
      id: randomUUID(),
      schemaVersion: 3,
      generatedAt: new Date().toISOString(),
      source,
      upstreamStatus: 'ok',
      items: rankedWithScores.map((entry) => entry.item),
    }

    await this.cache.writeSnapshot(snapshot)
    const persistence = await this.persistSnapshot(snapshot, rankedWithScores)
    return { snapshot, persistence }
  }

  private async persistSnapshot(
    snapshot: FeedSnapshot,
    rankedWithScores: Array<{ item: TokenFeedItem; score: number }>,
  ): Promise<SnapshotPersistenceOutcome> {
    if (!this.writeThroughEnabled) {
      return { status: 'skipped' }
    }

    if (!this.tokenRepository?.isEnabled() || !this.feedRepository?.isEnabled()) {
      return { status: 'skipped' }
    }

    try {
      await this.tokenRepository.upsertTokenDomainBatch(snapshot.items, snapshot.generatedAt)
      const scoredItems: ScoredFeedItem[] = rankedWithScores.map((entry, index) => ({
        mint: entry.item.mint,
        score: entry.score,
        position: index,
      }))
      await this.feedRepository.createSnapshot(snapshot, scoredItems, 'MISS')
      return { status: 'succeeded' }
    } catch (error) {
      this.logger?.warn(
        {
          error,
          snapshotId: snapshot.id,
          itemCount: snapshot.items.length,
        },
        'Failed to persist feed snapshot to Supabase',
      )
      return {
        status: 'failed',
        errorMessage: toErrorMessage(error),
      }
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
    minLifetimeHours: number | null,
    limit: number,
    cacheStatus: FeedPageResult['cacheStatus'],
    cacheStorage: FeedPageResult['cacheStorage'],
    mintSet?: Set<string> | null,
  ): FeedPageResult {
    const generatedAtMs = Date.parse(snapshot.generatedAt)
    const referenceTimeMs = Number.isFinite(generatedAtMs) ? generatedAtMs : Date.now()
    const eligibilityStats = createEmptyEligibilityStats()
    const filtered = snapshot.items.filter((item) => {
      if (mintSet && !mintSet.has(item.mint)) {
        return false
      }

      const categoryMatches = category ? this.matchesCategory(item, category) : true
      if (!categoryMatches) {
        return false
      }

      const trendingPolicyReason = this.getTrendingPolicyRejectionReason(item, category)
      if (trendingPolicyReason) {
        eligibilityStats.filteredTotal += 1
        eligibilityStats.reasons[trendingPolicyReason] += 1
        return false
      }

      return this.matchesMinimumLifetime(item, minLifetimeHours, referenceTimeMs)
    })
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
          minLifetimeHours,
          limit,
        })
        : null

    return {
      items,
      nextCursor,
      generatedAt: snapshot.generatedAt,
      cacheStatus,
      stale: cacheStatus === 'STALE',
      cacheStorage,
      source: snapshot.source,
      eligibilityStats,
    }
  }

  private matchesCategory(item: TokenFeedItem, category: FeedCategory): boolean {
    if (item.category === category) {
      return true
    }

    const label = CATEGORY_TO_DISCOVERY_LABEL[category]
    return item.labels?.includes(label) ?? false
  }

  private matchesMinimumLifetime(item: TokenFeedItem, minLifetimeHours: number | null, referenceTimeMs: number): boolean {
    if (minLifetimeHours === null || minLifetimeHours <= 0) {
      return true
    }

    const pairCreatedAtMs = item.pairCreatedAtMs
    if (typeof pairCreatedAtMs !== 'number' || !Number.isFinite(pairCreatedAtMs) || pairCreatedAtMs <= 0) {
      return false
    }

    const ageMs = referenceTimeMs - pairCreatedAtMs
    if (ageMs < 0) {
      return false
    }

    return ageMs >= minLifetimeHours * 60 * 60 * 1000
  }

  private getTrendingPolicyRejectionReason(
    item: TokenFeedItem,
    category: FeedCategory | null,
  ): FeedEligibilityRejectionReason | null {
    if (category !== 'trending') {
      return null
    }

    if (this.trendingExcludeRiskBlock && item.riskTier === 'block') {
      return 'risk_block'
    }

    const pairAddress = item.pairAddress?.trim()
    if (!pairAddress) {
      return 'missing_pair'
    }

    const pointCount1m = item.sparklineMeta?.pointCount1m ?? 0
    if (pointCount1m < this.minChartCandles) {
      return 'insufficient_chart_history'
    }

    const lastPointTimeSec = item.sparklineMeta?.lastPointTimeSec
    const nowSec = Math.floor(Date.now() / 1000)
    if (
      typeof lastPointTimeSec !== 'number' ||
      !Number.isFinite(lastPointTimeSec) ||
      lastPointTimeSec <= 0 ||
      nowSec - lastPointTimeSec > this.maxChartPointStalenessSec
    ) {
      return 'chart_stale'
    }

    return null
  }

  private mergeEligibilityStats(
    base: FeedEligibilityStats | undefined,
    additions: FeedEligibilityStats | undefined,
  ): FeedEligibilityStats | undefined {
    if (!base && !additions) {
      return undefined
    }

    const merged = createEmptyEligibilityStats()
    const sources = [base, additions].filter((value): value is FeedEligibilityStats => Boolean(value))
    for (const source of sources) {
      merged.filteredTotal += source.filteredTotal
      merged.reasons.missing_pair += source.reasons.missing_pair
      merged.reasons.insufficient_chart_history += source.reasons.insufficient_chart_history
      merged.reasons.chart_stale += source.reasons.chart_stale
      merged.reasons.risk_block += source.reasons.risk_block
    }

    return merged
  }

  private filterRenderableItems(items: TokenFeedItem[]): {
    items: TokenFeedItem[]
    stats: FeedEligibilityStats
  } {
    const stats = createEmptyEligibilityStats()

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

    const pointCount1m = item.sparklineMeta?.pointCount1m ?? 0
    if (pointCount1m < this.minChartCandles) {
      return 'insufficient_chart_history'
    }

    const lastPointTimeSec = item.sparklineMeta?.lastPointTimeSec
    const nowSec = Math.floor(Date.now() / 1000)
    if (
      typeof lastPointTimeSec !== 'number' ||
      !Number.isFinite(lastPointTimeSec) ||
      lastPointTimeSec <= 0 ||
      nowSec - lastPointTimeSec > this.maxChartPointStalenessSec
    ) {
      return 'chart_stale'
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

  private resolveEffectiveMinLifetimeHours(
    category: FeedCategory | null,
    minLifetimeHours: number | undefined,
    cursorPayload: FeedCursorPayload | null,
  ): number | null {
    if (category === 'trending') {
      if (cursorPayload && cursorPayload.minLifetimeHours !== this.trendingMinLifetimeHours) {
        throw new InvalidFeedRequestError('Cursor and minLifetimeHours must match.')
      }

      return this.trendingMinLifetimeHours
    }

    if (!cursorPayload) {
      return minLifetimeHours ?? null
    }

    if (minLifetimeHours === undefined) {
      return cursorPayload.minLifetimeHours
    }

    if ((minLifetimeHours ?? null) !== cursorPayload.minLifetimeHours) {
      throw new InvalidFeedRequestError('Cursor and minLifetimeHours must match.')
    }

    return cursorPayload.minLifetimeHours
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
