import type { ChartBatchHistoryResponse, ChartInterval } from '../chart/chart.types.js'
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
  sparklineWindowMinutes: number
  sparklinePoints: number
}

export class FeedEnrichmentService implements FeedEnricher {
  constructor(
    private readonly marketDataClient: TokenMarketDataClient,
    private readonly metadataClient: TokenMetadataClient,
    private readonly trustTagsClient: TokenTrustTagsClient,
    private readonly chartHistoryReader: ChartHistoryBatchReader | null,
    private readonly options: FeedEnrichmentServiceOptions,
    private readonly logger: Logger,
  ) {}

  async enrich(items: TokenFeedItem[], signal: AbortSignal): Promise<TokenFeedItem[]> {
    if (items.length === 0 || this.options.maxItems <= 0) {
      return items
    }

    const selectedIndexes = pickIndexesForEnrichment(items, this.options.maxItems)
    const selectedItems = selectedIndexes.map((index) => items[index]).filter((item): item is TokenFeedItem => item !== undefined)

    const sparklineByPair = await this.buildSparklineMap(selectedItems)
    const next = [...items]

    let priceFromBirdeye = 0
    let marketCapFromBirdeye = 0
    let metadataFromHelius = 0

    await mapWithConcurrency(selectedIndexes, Math.max(1, this.options.concurrency), async (index) => {
      if (signal.aborted) {
        return
      }

      const item = next[index]
      if (!item) {
        return
      }

      const [market, metadata, trustTags] = await Promise.all([
        this.safeFetchMarket(item.mint, signal),
        this.safeFetchMetadata(item.mint, signal),
        this.safeFetchTrustTags(item.mint, signal),
      ])

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
      },
      'Feed enrichment completed',
    )

    return next
  }

  private async buildSparklineMap(items: TokenFeedItem[]): Promise<Map<string, SparklinePayload>> {
    const output = new Map<string, SparklinePayload>()

    if (!this.chartHistoryReader || this.options.sparklineWindowMinutes <= 0 || this.options.sparklinePoints <= 1) {
      return output
    }

    const pairs = Array.from(
      new Set(items.map((item) => item.pairAddress?.trim() ?? '').filter((pairAddress) => pairAddress.length > 0)),
    )

    if (pairs.length === 0) {
      return output
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
          const sparkline = downsampleCandlesToSparkline(result.candles, this.options.sparklinePoints)
          if (sparkline.length === 0) {
            continue
          }

          const meta: TokenFeedSparklineMeta = {
            window: '6h',
            interval: '1m',
            source: result.source,
            points: sparkline.length,
            generatedAt: batch.generatedAt,
          }

          output.set(result.pairAddress, { sparkline, meta })
        }
      } catch (error) {
        this.logger.warn({ error, pairCount: chunk.length }, 'Sparkline batch enrichment failed')
      }
    }

    return output
  }

  private async safeFetchMarket(mint: string, signal: AbortSignal): Promise<BirdeyeMarketSnapshot | null> {
    try {
      return await this.marketDataClient.fetchTokenMarket(mint, signal)
    } catch (error) {
      this.logger.warn({ error, mint }, 'Market enrichment request failed')
      return null
    }
  }

  private async safeFetchMetadata(mint: string, signal: AbortSignal): Promise<TokenMetadataSnapshot | null> {
    try {
      return await this.metadataClient.fetchTokenMetadata(mint, signal)
    } catch (error) {
      this.logger.warn({ error, mint }, 'Metadata enrichment request failed')
      return null
    }
  }

  private async safeFetchTrustTags(mint: string, signal: AbortSignal): Promise<string[]> {
    try {
      return await this.trustTagsClient.fetchTrustTags(mint, signal)
    } catch (error) {
      this.logger.warn({ error, mint }, 'Trust tag enrichment request failed')
      return []
    }
  }
}

interface BirdeyeClientOptions {
  apiKey?: string
  timeoutMs: number
}

export class BirdeyeMarketDataClient implements TokenMarketDataClient {
  private readonly enabled: boolean

  constructor(
    private readonly options: BirdeyeClientOptions,
    private readonly logger: Logger,
  ) {
    this.enabled = typeof options.apiKey === 'string' && options.apiKey.trim().length > 0
  }

  async fetchTokenMarket(mint: string, signal: AbortSignal): Promise<BirdeyeMarketSnapshot | null> {
    if (!this.enabled) {
      return null
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs)
    const abortOnParent = () => controller.abort()
    signal.addEventListener('abort', abortOnParent, { once: true })

    try {
      const url = new URL('https://public-api.birdeye.so/defi/token_overview')
      url.searchParams.set('address', mint)

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
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
    } catch (error) {
      this.logger.warn({ error, mint }, 'Birdeye fetch failed')
      return null
    } finally {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', abortOnParent)
    }
  }
}

interface HeliusClientOptions {
  apiKey?: string
  timeoutMs: number
  dasUrl: string
}

export class HeliusMetadataClient implements TokenMetadataClient {
  private readonly enabled: boolean

  constructor(
    private readonly options: HeliusClientOptions,
    private readonly logger: Logger,
  ) {
    this.enabled = typeof options.apiKey === 'string' && options.apiKey.trim().length > 0
  }

  async fetchTokenMetadata(mint: string, signal: AbortSignal): Promise<TokenMetadataSnapshot | null> {
    if (!this.enabled) {
      return null
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs)
    const abortOnParent = () => controller.abort()
    signal.addEventListener('abort', abortOnParent, { once: true })

    try {
      const endpoint = buildHeliusRpcUrl(this.options.dasUrl, this.options.apiKey)
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
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
    } catch (error) {
      this.logger.warn({ error, mint }, 'Helius metadata fetch failed')
      return null
    } finally {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', abortOnParent)
    }
  }
}

interface JupiterTagsClientOptions {
  ttlMs: number
}

const JUPITER_TRUST_TAGS = ['verified', 'lst'] as const

type JupiterTrustTag = (typeof JUPITER_TRUST_TAGS)[number]

export class JupiterTrustTagsClient implements TokenTrustTagsClient {
  private readonly byTagCache = new Map<JupiterTrustTag, { expiresAtMs: number; mints: Set<string> }>()

  constructor(
    private readonly options: JupiterTagsClientOptions,
    private readonly logger: Logger,
  ) {}

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

      const response = await fetch(url, {
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
}

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

function downsampleCandlesToSparkline(candles: Array<{ close: number }>, targetPoints: number): number[] {
  const closePoints = candles
    .map((candle) => candle.close)
    .filter((value): value is number => Number.isFinite(value) && value > 0)

  if (closePoints.length === 0 || targetPoints <= 1) {
    return []
  }

  if (closePoints.length <= targetPoints) {
    return closePoints
  }

  const output: number[] = []
  const step = (closePoints.length - 1) / (targetPoints - 1)

  for (let index = 0; index < targetPoints; index += 1) {
    const sampledIndex = Math.round(index * step)
    const sampled = closePoints[sampledIndex]
    if (typeof sampled === 'number' && Number.isFinite(sampled) && sampled > 0) {
      output.push(sampled)
    }
  }

  return output
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
