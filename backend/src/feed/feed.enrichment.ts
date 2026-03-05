import type { ChartBatchHistoryResponse, ChartHistoryQuality, ChartInterval } from '../chart/chart.types.js'
import { CircuitBreaker } from '../lib/circuit-breaker.js'
import { ResilientHttpClient, UpstreamRequestEvent } from '../lib/http-client.js'
import type { FeedLabel, TokenFeedItem, TokenFeedSparklineMeta } from './feed.provider.js'

interface Logger {
  warn: (obj: unknown, msg?: string) => void
  info?: (obj: unknown, msg?: string) => void
  debug?: (obj: unknown, msg?: string) => void
}

export interface FeedEnricher {
  enrich(items: TokenFeedItem[], signal: AbortSignal): Promise<TokenFeedItem[]>
}

export interface ChartHistoryBatchReader {
  getBatchMaxPairs(): number
  getBatchHistory(pairAddresses: string[], limit: number, interval?: ChartInterval): Promise<ChartBatchHistoryResponse>
}

export interface BirdeyeMarketSnapshot {
  priceUsd: number | null
  priceChange24h: number | null
  marketCap: number | null
}

export interface TokenMarketDataClient {
  fetchTokenMarket(mint: string, signal: AbortSignal): Promise<BirdeyeMarketSnapshot | null>
}

export interface TokenMetadataSnapshot {
  name: string | null
  description: string | null
  imageUri: string | null
}

export interface TokenMetadataClient {
  fetchTokenMetadata(mint: string, signal: AbortSignal): Promise<TokenMetadataSnapshot | null>
}

export interface TokenTrustTagsClient {
  fetchTrustTags(mint: string, signal: AbortSignal): Promise<string[]>
}

export interface FeedEnrichmentServiceOptions {
  maxItems: number
  concurrency: number
  marketTtlMs?: number
  metadataTtlMs?: number
  trustTagsTtlMs?: number
  marketCacheMaxKeys?: number
  metadataCacheMaxKeys?: number
  trustTagsCacheMaxKeys?: number
  failureCooldownMs?: number
  sparklineWindowMinutes: number
  sparklinePoints: number
}

type CacheResultStatus = 'fetched' | 'ttl_hit' | 'cooldown_skip' | 'stale_on_error' | 'fallback_on_error'

interface MintCacheEntry<T> {
  value: T
  expiresAtMs: number
  lastFailureAtMs: number | null
}

type CacheStatsCounter = Record<CacheResultStatus, number>

export class FeedEnrichmentService implements FeedEnricher {
  private readonly marketCache = new Map<string, MintCacheEntry<BirdeyeMarketSnapshot | null>>()
  private readonly metadataCache = new Map<string, MintCacheEntry<TokenMetadataSnapshot | null>>()
  private readonly trustTagsCache = new Map<string, MintCacheEntry<string[]>>()
  private readonly marketTtlMs: number
  private readonly metadataTtlMs: number
  private readonly trustTagsTtlMs: number
  private readonly marketCacheMaxKeys: number
  private readonly metadataCacheMaxKeys: number
  private readonly trustTagsCacheMaxKeys: number
  private readonly failureCooldownMs: number

  constructor(
    private readonly marketDataClient: TokenMarketDataClient,
    private readonly metadataClient: TokenMetadataClient,
    private readonly trustTagsClient: TokenTrustTagsClient,
    private readonly chartHistoryReader: ChartHistoryBatchReader | null,
    private readonly options: FeedEnrichmentServiceOptions,
    private readonly logger: Logger,
  ) {
    this.marketTtlMs = normalizeDurationMs(options.marketTtlMs, 60_000)
    this.metadataTtlMs = normalizeDurationMs(options.metadataTtlMs, 43_200_000)
    this.trustTagsTtlMs = normalizeDurationMs(options.trustTagsTtlMs, 900_000)
    this.marketCacheMaxKeys = normalizeCacheMaxKeys(options.marketCacheMaxKeys, 2000)
    this.metadataCacheMaxKeys = normalizeCacheMaxKeys(options.metadataCacheMaxKeys, 2000)
    this.trustTagsCacheMaxKeys = normalizeCacheMaxKeys(options.trustTagsCacheMaxKeys, 2000)
    this.failureCooldownMs = normalizeDurationMs(options.failureCooldownMs, 300_000)
  }

  async enrich(items: TokenFeedItem[], signal: AbortSignal): Promise<TokenFeedItem[]> {
    if (items.length === 0 || this.options.maxItems <= 0) {
      return items
    }

    const selectedIndexes = pickIndexesForEnrichment(items, this.options.maxItems)
    const selectedItems = selectedIndexes.map((index) => items[index]).filter((item): item is TokenFeedItem => item !== undefined)

    const { byPair: sparklineByPair } = await this.buildSparklineMap(selectedItems)
    const next = [...items]

    let priceFromBirdeye = 0
    let marketCapFromBirdeye = 0
    let metadataFromHelius = 0
    const counters = {
      market: createCacheStatsCounter(),
      metadata: createCacheStatsCounter(),
      tags: createCacheStatsCounter(),
    }

    await mapWithConcurrency(selectedIndexes, Math.max(1, this.options.concurrency), async (index) => {
      if (signal.aborted) {
        return
      }

      const item = next[index]
      if (!item) {
        return
      }

      const [marketResult, metadataResult, tagsResult] = await Promise.all([
        this.getMarketWithCache(item.mint, signal),
        this.getMetadataWithCache(item.mint, signal),
        this.getTrustTagsWithCache(item.mint, signal),
      ])
      counters.market[marketResult.status] += 1
      counters.metadata[metadataResult.status] += 1
      counters.tags[tagsResult.status] += 1
      const market = marketResult.value
      const metadata = metadataResult.value
      const trustTags = tagsResult.value

      const mergedTrustTags = mergeUniqueStrings([...item.tags.trust, ...trustTags])
      const discoveryLabels = resolveDiscoveryLabels(item)
      const tagsSources = buildTagSources(item.sources.tags, trustTags.length > 0)

      const hasHeliusMetadata =
        metadata !== null &&
        (metadata.name !== null || metadata.description !== null || metadata.imageUri !== null)

      const hasBirdeyePrice = market !== null && market.priceUsd !== null
      const hasBirdeyeMarketCap = market !== null && market.marketCap !== null

      if (hasBirdeyePrice) {
        priceFromBirdeye += 1
      }
      if (hasBirdeyeMarketCap) {
        marketCapFromBirdeye += 1
      }
      if (hasHeliusMetadata) {
        metadataFromHelius += 1
      }

      const sparklinePayload = item.pairAddress ? sparklineByPair.get(item.pairAddress) : undefined

      const nextItem: TokenFeedItem = {
        ...item,
        name: metadata?.name ?? item.name,
        description: metadata?.description ?? null,
        imageUri: metadata?.imageUri ?? item.imageUri,
        priceUsd: market?.priceUsd ?? item.priceUsd,
        priceChange24h: market?.priceChange24h ?? item.priceChange24h,
        marketCap: market?.marketCap ?? item.marketCap,
        sparkline: sparklinePayload?.sparkline ?? [],
        sparklineMeta: sparklinePayload?.meta ?? null,
        tags: {
          trust: mergedTrustTags,
          discovery: discoveryLabels,
        },
        labels: discoveryLabels,
        sources: {
          price: hasBirdeyePrice ? 'birdeye' : item.sources.price,
          liquidity: item.sources.liquidity,
          volume: item.sources.volume,
          marketCap: hasBirdeyeMarketCap ? 'birdeye' : item.sources.marketCap,
          metadata: hasHeliusMetadata ? 'helius' : item.sources.metadata,
          tags: tagsSources,
        },
      }

      next[index] = nextItem
    })

    this.logger.info?.(
      {
        totalItems: items.length,
        enrichedItems: selectedIndexes.length,
        priceSourceBirdeyeCount: priceFromBirdeye,
        marketCapSourceBirdeyeCount: marketCapFromBirdeye,
        metadataSourceHeliusCount: metadataFromHelius,
        skippedByTtl: {
          market: counters.market.ttl_hit,
          metadata: counters.metadata.ttl_hit,
          tags: counters.tags.ttl_hit,
        },
        skippedByCooldown: {
          market: counters.market.cooldown_skip,
          metadata: counters.metadata.cooldown_skip,
          tags: counters.tags.cooldown_skip,
        },
      },
      'Feed enrichment completed',
    )

    return next
  }

  private async buildSparklineMap(items: TokenFeedItem[]): Promise<{
    byPair: Map<string, SparklinePayload>
    stats: SparklineBuildStats
  }> {
    const output = new Map<string, SparklinePayload>()
    const stats: SparklineBuildStats = {
      sparkline_pair_count: 0,
      sparkline_empty_count: 0,
      sparkline_points_min: null,
      sparkline_points_max: null,
      sparkline_points_avg: 0,
    }

    if (!this.chartHistoryReader || this.options.sparklineWindowMinutes <= 0 || this.options.sparklinePoints <= 1) {
      return { byPair: output, stats }
    }

    const pairs = Array.from(
      new Set(items.map((item) => item.pairAddress?.trim() ?? '').filter((pairAddress) => pairAddress.length > 0)),
    )

    if (pairs.length === 0) {
      return { byPair: output, stats }
    }

    const chunkSize = Math.max(1, this.chartHistoryReader.getBatchMaxPairs())
    for (let index = 0; index < pairs.length; index += chunkSize) {
      const chunk = pairs.slice(index, index + chunkSize)
      if (chunk.length === 0) {
        continue
      }

      try {
        const batch = await this.chartHistoryReader.getBatchHistory(chunk, this.options.sparklineWindowMinutes, '1m')
        for (const result of batch.results) {
          const sparkline = bucketPointsToSparkline(
            result.points,
            FEED_SPARKLINE_BUCKET_SECONDS,
            this.options.sparklinePoints,
          )
          stats.sparkline_pair_count += 1
          if (sparkline.length === 0) {
            stats.sparkline_empty_count += 1
          }
          stats.sparkline_points_min =
            stats.sparkline_points_min === null
              ? sparkline.length
              : Math.min(stats.sparkline_points_min, sparkline.length)
          stats.sparkline_points_max =
            stats.sparkline_points_max === null
              ? sparkline.length
              : Math.max(stats.sparkline_points_max, sparkline.length)
          stats.sparkline_points_avg += sparkline.length

          const meta: TokenFeedSparklineMeta = {
            window: '6h',
            interval: '5m',
            source: result.source,
            points: sparkline.length,
            generatedAt: batch.generatedAt,
            historyQuality: result.historyQuality,
            pointCount1m: result.points.length,
            lastPointTimeSec: result.points[result.points.length - 1]?.time,
          }

          output.set(result.pairAddress, {
            sparkline,
            meta,
            historyQuality: result.historyQuality,
            pointCount1m: result.points.length,
            lastPointTimeSec: result.points[result.points.length - 1]?.time,
          })
        }
      } catch (error) {
        this.logger.warn({ error, pairCount: chunk.length }, 'Sparkline batch enrichment failed')
      }
    }

    if (stats.sparkline_pair_count > 0) {
      stats.sparkline_points_avg = Number((stats.sparkline_points_avg / stats.sparkline_pair_count).toFixed(2))
    }

    this.logger.debug?.(stats, 'Feed sparkline enrichment stats')
    return { byPair: output, stats }
  }

  private async getMarketWithCache(
    mint: string,
    signal: AbortSignal,
  ): Promise<{ value: BirdeyeMarketSnapshot | null; status: CacheResultStatus }> {
    return this.getWithCache(
      this.marketCache,
      mint,
      this.marketTtlMs,
      this.marketCacheMaxKeys,
      this.failureCooldownMs,
      async () => this.marketDataClient.fetchTokenMarket(mint, signal),
      null,
      'Market enrichment request failed',
    )
  }

  private async getMetadataWithCache(
    mint: string,
    signal: AbortSignal,
  ): Promise<{ value: TokenMetadataSnapshot | null; status: CacheResultStatus }> {
    return this.getWithCache(
      this.metadataCache,
      mint,
      this.metadataTtlMs,
      this.metadataCacheMaxKeys,
      this.failureCooldownMs,
      async () => this.metadataClient.fetchTokenMetadata(mint, signal),
      null,
      'Metadata enrichment request failed',
    )
  }

  private async getTrustTagsWithCache(
    mint: string,
    signal: AbortSignal,
  ): Promise<{ value: string[]; status: CacheResultStatus }> {
    return this.getWithCache(
      this.trustTagsCache,
      mint,
      this.trustTagsTtlMs,
      this.trustTagsCacheMaxKeys,
      this.failureCooldownMs,
      async () => this.trustTagsClient.fetchTrustTags(mint, signal),
      [],
      'Trust tag enrichment request failed',
    )
  }

  private async getWithCache<T>(
    cache: Map<string, MintCacheEntry<T>>,
    mint: string,
    ttlMs: number,
    maxKeys: number,
    cooldownMs: number,
    fetcher: () => Promise<T>,
    fallback: T,
    errorLogMessage: string,
  ): Promise<{ value: T; status: CacheResultStatus }> {
    const key = mint.trim()
    if (key.length === 0) {
      return { value: fallback, status: 'fallback_on_error' }
    }

    const now = Date.now()
    const existing = cache.get(key)
    if (existing && existing.lastFailureAtMs !== null && now - existing.lastFailureAtMs < cooldownMs) {
      touchCacheEntry(cache, key, existing)
      enforceCacheCap(cache, maxKeys, now)
      return { value: existing.value, status: 'cooldown_skip' }
    }

    if (existing && existing.expiresAtMs > now) {
      touchCacheEntry(cache, key, existing)
      enforceCacheCap(cache, maxKeys, now)
      return { value: existing.value, status: 'ttl_hit' }
    }

    try {
      const value = await fetcher()
      writeCacheEntry(cache, key, {
        value,
        expiresAtMs: now + ttlMs,
        lastFailureAtMs: null,
      }, maxKeys, now)
      return { value, status: 'fetched' }
    } catch (error) {
      this.logger.warn({ error, mint: key }, errorLogMessage)
      const staleValue = existing ? existing.value : fallback
      writeCacheEntry(cache, key, {
        value: staleValue,
        expiresAtMs: now + Math.max(1000, cooldownMs),
        lastFailureAtMs: now,
      }, maxKeys, now)
      return { value: staleValue, status: existing ? 'stale_on_error' : 'fallback_on_error' }
    }
  }
}

function touchCacheEntry<T>(cache: Map<string, MintCacheEntry<T>>, key: string, entry: MintCacheEntry<T>): void {
  cache.delete(key)
  cache.set(key, entry)
}

function writeCacheEntry<T>(
  cache: Map<string, MintCacheEntry<T>>,
  key: string,
  entry: MintCacheEntry<T>,
  maxKeys: number,
  now: number,
): void {
  cache.delete(key)
  cache.set(key, entry)
  enforceCacheCap(cache, maxKeys, now)
}

function enforceCacheCap<T>(cache: Map<string, MintCacheEntry<T>>, maxKeys: number, now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAtMs <= now) {
      cache.delete(key)
    }
  }

  while (cache.size > maxKeys) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    cache.delete(oldestKey)
  }
}

function normalizeCacheMaxKeys(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) {
    return fallback
  }

  return Math.floor(value)
}

interface BirdeyeClientOptions {
  apiKey?: string
  timeoutMs: number
  onRequestComplete?: (event: UpstreamRequestEvent) => void
}

export class BirdeyeMarketDataClient implements TokenMarketDataClient {
  private readonly enabled: boolean
  private readonly httpClient: ResilientHttpClient

  constructor(
    private readonly options: BirdeyeClientOptions,
    private readonly logger: Logger,
  ) {
    this.enabled = typeof options.apiKey === 'string' && options.apiKey.trim().length > 0
    this.httpClient = new ResilientHttpClient({
      upstream: 'birdeye_market',
      timeoutMs: options.timeoutMs,
      maxRetries: 2,
      retryBaseDelayMs: 200,
      circuitBreaker: new CircuitBreaker({
        windowMs: 30_000,
        minSamples: 10,
        failureThreshold: 0.5,
        openDurationMs: 15_000,
        halfOpenProbeCount: 1,
      }),
      logger,
      onRequestComplete: options.onRequestComplete,
    })
  }

  async fetchTokenMarket(mint: string, signal: AbortSignal): Promise<BirdeyeMarketSnapshot | null> {
    if (!this.enabled) {
      return null
    }

    const url = new URL('https://public-api.birdeye.so/defi/token_overview')
    url.searchParams.set('address', mint)

    const response = await this.httpClient.request(url, {
      method: 'GET',
      signal,
      headers: {
        accept: 'application/json',
        'x-api-key': this.options.apiKey ?? '',
        'x-chain': 'solana',
      },
    })

    if (!response.ok) {
      throw new Error(`Birdeye request failed with status ${response.status}`)
    }

    const payload = (await response.json()) as unknown
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null
    if (!data) {
      return null
    }

    return {
      priceUsd: firstFiniteNumber(data.price, data.priceUsd, data.current_price, data.value),
      priceChange24h: firstFiniteNumber(
        data.priceChange24h,
        data.price_change_24h,
        data.price_change_24h_percent,
        data.v24hChangePercent,
      ),
      marketCap: firstFiniteNumber(data.marketCap, data.market_cap, data.mc),
    }
  }
}

interface HeliusClientOptions {
  apiKey?: string
  enabled?: boolean
  timeoutMs: number
  dasUrl: string
  onRequestComplete?: (event: UpstreamRequestEvent) => void
}

export class HeliusMetadataClient implements TokenMetadataClient {
  private readonly enabled: boolean
  private readonly httpClient: ResilientHttpClient

  constructor(
    private readonly options: HeliusClientOptions,
    private readonly logger: Logger,
  ) {
    const enabledByConfig = options.enabled ?? true
    this.enabled = enabledByConfig && typeof options.apiKey === 'string' && options.apiKey.trim().length > 0
    this.httpClient = new ResilientHttpClient({
      upstream: 'helius_metadata',
      timeoutMs: options.timeoutMs,
      maxRetries: 2,
      retryBaseDelayMs: 200,
      circuitBreaker: new CircuitBreaker({
        windowMs: 30_000,
        minSamples: 10,
        failureThreshold: 0.5,
        openDurationMs: 15_000,
        halfOpenProbeCount: 1,
      }),
      logger,
      onRequestComplete: options.onRequestComplete,
    })
  }

  async fetchTokenMetadata(mint: string, signal: AbortSignal): Promise<TokenMetadataSnapshot | null> {
    if (!this.enabled) {
      return null
    }

    const endpoint = buildHeliusRpcUrl(this.options.dasUrl, this.options.apiKey)
    const response = await this.httpClient.request(endpoint, {
      method: 'POST',
      signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `feed-${mint}`,
        method: 'getAsset',
        params: {
          id: mint,
          displayOptions: {
            showFungible: true,
          },
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Helius request failed with status ${response.status}`)
    }

    const payload = (await response.json()) as unknown
    const result = isRecord(payload) && isRecord(payload.result) ? payload.result : null
    if (!result) {
      return null
    }

    const content = isRecord(result.content) ? result.content : null
    const metadata = content && isRecord(content.metadata) ? content.metadata : null
    const links = content && isRecord(content.links) ? content.links : null

    const description = stringOrNull(metadata?.description)
    const name = stringOrNull(metadata?.name)
    const imageUri = stringOrNull(links?.image) ?? firstFileUri(content)

    if (!name && !description && !imageUri) {
      return null
    }

    return {
      name,
      description,
      imageUri,
    }
  }
}

interface JupiterTagsClientOptions {
  ttlMs: number
  timeoutMs?: number
  onRequestComplete?: (event: UpstreamRequestEvent) => void
}

const JUPITER_TRUST_TAGS = ['verified', 'lst'] as const

type JupiterTrustTag = (typeof JUPITER_TRUST_TAGS)[number]

export class JupiterTrustTagsClient implements TokenTrustTagsClient {
  private readonly byTagCache = new Map<JupiterTrustTag, { expiresAtMs: number; mints: Set<string> }>()
  private readonly httpClient: ResilientHttpClient

  constructor(
    private readonly options: JupiterTagsClientOptions,
    private readonly logger: Logger,
  ) {
    this.httpClient = new ResilientHttpClient({
      upstream: 'jupiter_tags',
      timeoutMs: options.timeoutMs ?? 2500,
      maxRetries: 2,
      retryBaseDelayMs: 200,
      circuitBreaker: new CircuitBreaker({
        windowMs: 30_000,
        minSamples: 10,
        failureThreshold: 0.5,
        openDurationMs: 15_000,
        halfOpenProbeCount: 1,
      }),
      logger,
      onRequestComplete: options.onRequestComplete,
    })
  }

  async fetchTrustTags(mint: string, signal: AbortSignal): Promise<string[]> {
    if (this.options.ttlMs <= 0) {
      return []
    }

    const normalizedMint = mint.trim()
    if (normalizedMint.length === 0) {
      return []
    }

    const tags: string[] = []

    for (const tag of JUPITER_TRUST_TAGS) {
      const mints = await this.getMintsForTag(tag, signal)
      if (mints.has(normalizedMint)) {
        tags.push(tag)
      }
    }

    return tags
  }

  private async getMintsForTag(tag: JupiterTrustTag, signal: AbortSignal): Promise<Set<string>> {
    const now = Date.now()
    const cached = this.byTagCache.get(tag)
    if (cached && cached.expiresAtMs > now) {
      return cached.mints
    }

    try {
      const url = new URL('https://tokens.jup.ag/tokens')
      url.searchParams.set('tags', tag)

      const response = await this.httpClient.request(url, {
        method: 'GET',
        signal,
        headers: {
          accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Jupiter tags request failed with status ${response.status}`)
      }

      const payload = (await response.json()) as unknown
      const mints = parseJupiterTagMints(payload)

      this.byTagCache.set(tag, {
        expiresAtMs: now + this.options.ttlMs,
        mints,
      })

      return mints
    } catch (error) {
      this.logger.warn({ error, tag }, 'Jupiter tag fetch failed')
      return cached?.mints ?? new Set<string>()
    }
  }
}

interface SparklinePayload {
  sparkline: number[]
  meta: TokenFeedSparklineMeta
  historyQuality: ChartHistoryQuality
  pointCount1m: number
  lastPointTimeSec?: number
}

interface SparklineBuildStats {
  sparkline_pair_count: number
  sparkline_empty_count: number
  sparkline_points_min: number | null
  sparkline_points_max: number | null
  sparkline_points_avg: number
}

const FEED_SPARKLINE_BUCKET_SECONDS = 5 * 60

function resolveDiscoveryLabels(item: TokenFeedItem): FeedLabel[] {
  const preferred = item.tags.discovery.length > 0 ? item.tags.discovery : item.labels ?? []
  if (preferred.length > 0) {
    return preferred
  }

  if (item.category === 'memecoin') {
    return ['meme']
  }

  return [item.category]
}

function buildTagSources(previous: string[], hasJupiterTags: boolean): string[] {
  const next = mergeUniqueStrings(previous)
  if (hasJupiterTags) {
    next.push('jupiter')
  }

  return mergeUniqueStrings(next)
}

function pickIndexesForEnrichment(items: TokenFeedItem[], maxItems: number): number[] {
  const scored = items
    .map((item, index) => ({
      index,
      score:
        Math.log10(Math.max(1, item.liquidity)) * 0.5 +
        Math.log10(Math.max(1, item.volume24h)) * 0.35 +
        Math.log10(Math.max(1, item.recentVolume5m ?? 0)) * 0.15,
    }))
    .sort((left, right) => right.score - left.score)

  return scored.slice(0, Math.max(1, maxItems)).map((entry) => entry.index)
}

function bucketPointsToSparkline(
  points: Array<{ time: number; value: number }>,
  bucketSeconds: number,
  targetPoints: number,
  nowSec: number = Math.floor(Date.now() / 1000),
): number[] {
  if (
    !Number.isFinite(bucketSeconds) ||
    bucketSeconds <= 0 ||
    !Number.isFinite(targetPoints) ||
    targetPoints <= 1 ||
    !Number.isFinite(nowSec) ||
    nowSec <= 0
  ) {
    return []
  }

  const normalizedTargetPoints = Math.floor(targetPoints)
  const normalizedNowSec = Math.floor(nowSec)
  const anchorSec = Math.floor(normalizedNowSec / bucketSeconds) * bucketSeconds
  const windowStartSec = anchorSec - (normalizedTargetPoints - 1) * bucketSeconds

  const sorted = points
    .map((point) => ({
      time: Number(point.time),
      value: Number(point.value),
    }))
    .filter((point) => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.value) && point.value > 0)
    .sort((left, right) => left.time - right.time)

  if (sorted.length === 0) {
    return []
  }

  const valueByBucketIndex = new Map<number, number>()

  for (const point of sorted) {
    const bucketTime = Math.floor(point.time / bucketSeconds) * bucketSeconds
    if (bucketTime < windowStartSec || bucketTime > anchorSec) {
      continue
    }

    const bucketIndex = Math.floor((bucketTime - windowStartSec) / bucketSeconds)
    if (bucketIndex < 0 || bucketIndex >= normalizedTargetPoints) {
      continue
    }
    valueByBucketIndex.set(bucketIndex, point.value)
  }

  if (valueByBucketIndex.size === 0) {
    return []
  }

  const output = Array.from({ length: normalizedTargetPoints }, (_entry, index) => valueByBucketIndex.get(index) ?? Number.NaN)
  const firstKnownClose = output.find((value) => Number.isFinite(value) && value > 0)
  if (firstKnownClose === undefined || !Number.isFinite(firstKnownClose) || firstKnownClose <= 0) {
    return []
  }

  let carryClose = firstKnownClose
  for (let index = 0; index < output.length; index += 1) {
    const value = output[index]
    if (value !== undefined && Number.isFinite(value) && value > 0) {
      carryClose = value
      continue
    }
    output[index] = carryClose
  }

  return output.map((value) => (value !== undefined && Number.isFinite(value) && value > 0 ? value : firstKnownClose))
}

async function mapWithConcurrency<TInput>(
  values: TInput[],
  concurrency: number,
  mapper: (value: TInput, index: number) => Promise<void>,
): Promise<void> {
  if (values.length === 0) {
    return
  }

  let nextIndex = 0

  const workers = Array.from({ length: Math.min(values.length, Math.max(1, concurrency)) }, async () => {
    while (true) {
      const index = nextIndex
      if (index >= values.length) {
        return
      }

      nextIndex += 1
      const value = values[index]
      if (value === undefined) {
        continue
      }

      await mapper(value, index)
    }
  })

  await Promise.all(workers)
}

function createCacheStatsCounter(): CacheStatsCounter {
  return {
    fetched: 0,
    ttl_hit: 0,
    cooldown_skip: 0,
    stale_on_error: 0,
    fallback_on_error: 0,
  }
}

function normalizeDurationMs(input: number | undefined, fallbackMs: number): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input <= 0) {
    return fallbackMs
  }

  return Math.max(1, Math.floor(input))
}

function parseJupiterTagMints(payload: unknown): Set<string> {
  const output = new Set<string>()
  if (!Array.isArray(payload)) {
    return output
  }

  for (const entry of payload) {
    if (!isRecord(entry)) {
      continue
    }

    const mint = stringOrNull(entry.address) ?? stringOrNull(entry.mint)
    if (mint) {
      output.add(mint)
    }
  }

  return output
}

function buildHeliusRpcUrl(rawUrl: string, apiKey?: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '')
  const url = new URL(trimmed)

  if (apiKey && apiKey.trim().length > 0) {
    url.searchParams.set('api-key', apiKey.trim())
  }

  return url.toString()
}

function firstFiniteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = numberOrNull(value)
    if (parsed !== null) {
      return parsed
    }
  }

  return null
}

function firstFileUri(content: Record<string, unknown> | null): string | null {
  const files = content && Array.isArray(content.files) ? content.files : []
  for (const file of files) {
    if (!isRecord(file)) {
      continue
    }

    const uri = stringOrNull(file.uri)
    if (uri) {
      return uri
    }
  }

  return null
}

function mergeUniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

function numberOrNull(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input
  }

  if (typeof input === 'string') {
    const value = Number.parseFloat(input)
    if (Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function stringOrNull(input: unknown): string | null {
  return typeof input === 'string' && input.trim().length > 0 ? input : null
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}
