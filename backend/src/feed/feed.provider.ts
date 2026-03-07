import type { ChartHistoryQuality } from '../chart/chart.types.js'
import { CircuitBreaker } from '../lib/circuit-breaker.js'
import { ResilientHttpClient, UpstreamRequestEvent } from '../lib/http-client.js'
import type { FeedEnricher } from './feed.enrichment.js'

export type FeedCategory = 'trending' | 'gainer' | 'new' | 'memecoin'
export type FeedLabel = 'trending' | 'gainer' | 'new' | 'meme'
export type RiskTier = 'block' | 'warn' | 'allow'

export interface TokenFeedTags {
  trust: string[]
  discovery: FeedLabel[]
}

export interface TokenFeedSparklineMeta {
  window: '6h'
  interval: '1m' | '5m'
  source: string
  points: number
  generatedAt: string
  historyQuality?: ChartHistoryQuality
  pointCount1m?: number
  lastPointTimeSec?: number
}

export interface TokenFeedSources {
  price: 'birdeye' | 'dexscreener' | 'seed'
  liquidity: 'birdeye' | 'dexscreener' | 'seed'
  volume: 'birdeye' | 'dexscreener' | 'seed'
  marketCap: 'birdeye' | 'dexscreener_market_cap' | 'dexscreener_fdv' | 'seed' | 'unavailable'
  metadata: 'helius' | 'dexscreener' | 'seed'
  tags: string[]
}

export interface TokenFeedItem {
  mint: string
  name: string
  symbol: string
  description: string | null
  imageUri: string | null
  priceUsd: number
  priceChange24h: number
  volume24h: number
  liquidity: number
  marketCap: number | null
  sparkline: number[]
  sparklineMeta: TokenFeedSparklineMeta | null
  pairAddress: string | null
  pairCreatedAtMs?: number | null
  tags: TokenFeedTags
  labels?: FeedLabel[]
  sources: TokenFeedSources
  quoteSymbol?: string | null
  recentVolume5m?: number
  recentTxns5m?: number
  category: FeedCategory
  riskTier: RiskTier
}

export interface FeedProvider {
  readonly name: string
  fetchFeed(signal: AbortSignal): Promise<TokenFeedItem[]>
}

export interface FeedFetchResult {
  items: TokenFeedItem[]
  source: 'providers' | 'seed'
  usedSeedFallback: boolean
}

export class FeedProviderUnavailableError extends Error {
  constructor(message = 'All live feed providers are unavailable') {
    super(message)
    this.name = 'FeedProviderUnavailableError'
  }
}

interface CompositeFeedProviderOptions {
  enableSeedFallback?: boolean
}

interface Logger {
  warn: (obj: unknown, msg?: string) => void
  info?: (obj: unknown, msg?: string) => void
}

export class SeedFeedProvider implements FeedProvider {
  readonly name = 'seed'

  constructor(private readonly seededItems: TokenFeedItem[]) {}

  async fetchFeed(_signal: AbortSignal): Promise<TokenFeedItem[]> {
    return this.seededItems
  }
}

export class CompositeFeedProvider {
  private readonly enableSeedFallback: boolean

  constructor(
    private readonly liveProviders: FeedProvider[],
    private readonly seededProvider: FeedProvider,
    private readonly logger: Logger,
    options: CompositeFeedProviderOptions = {},
  ) {
    this.enableSeedFallback = options.enableSeedFallback ?? true
  }

  async fetchFeed(signal: AbortSignal): Promise<FeedFetchResult> {
    for (const provider of this.liveProviders) {
      try {
        const items = await provider.fetchFeed(signal)
        if (items.length > 0) {
          return { items, source: 'providers', usedSeedFallback: false }
        }
      } catch (error) {
        this.logger.warn({ error, provider: provider.name }, 'Live provider failed')
      }
    }

    if (!this.enableSeedFallback) {
      throw new FeedProviderUnavailableError()
    }

    const seededItems = await this.seededProvider.fetchFeed(signal)
    return {
      items: seededItems,
      source: 'seed',
      usedSeedFallback: true,
    }
  }
}

interface DexScreenerProviderOptions {
  timeoutMs: number
  searchQuery: string
  tokenMints?: string
  onRequestComplete?: (event: UpstreamRequestEvent) => void
}

interface DexDiscoveryEndpoint {
  path: string
  label: string
}

const DEX_DISCOVERY_ENDPOINTS: DexDiscoveryEndpoint[] = [
  { path: '/token-boosts/top/v1', label: 'boosts_top' },
  { path: '/token-boosts/latest/v1', label: 'boosts_latest' },
  { path: '/token-profiles/latest/v1', label: 'token_profiles_latest' },
  { path: '/community-takeovers/latest/v1', label: 'community_takeovers_latest' },
]

const DEX_TOKEN_BATCH_SIZE = 30

export class DexScreenerFeedProvider implements FeedProvider {
  readonly name = 'dexscreener'
  private readonly httpClient: ResilientHttpClient

  constructor(
    private readonly options: DexScreenerProviderOptions,
    private readonly logger: Logger,
    private readonly enricher?: FeedEnricher,
  ) {
    this.httpClient = new ResilientHttpClient({
      upstream: 'dexscreener_feed',
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

  async fetchFeed(signal: AbortSignal): Promise<TokenFeedItem[]> {
    const tokenMints = parseDexTokenMints(this.options.tokenMints)
    const discoverySources = await Promise.allSettled([
      this.fetchConfiguredSearchQueries(signal),
      this.fetchDiscoveryEndpointPairs(signal),
      tokenMints.length > 0 ? this.fetchConfiguredTokenMints(tokenMints, signal) : Promise.resolve<TokenFeedItem[]>([]),
    ])

    const combinedItems: TokenFeedItem[] = []
    let successCount = 0

    const searchResult = discoverySources[0]
    if (searchResult?.status === 'fulfilled') {
      combinedItems.push(...searchResult.value)
      successCount += 1
    } else if (searchResult) {
      this.logger.warn({ error: searchResult.reason }, 'DexScreener dynamic search discovery failed')
    }

    const discoveryEndpointResult = discoverySources[1]
    if (discoveryEndpointResult?.status === 'fulfilled') {
      combinedItems.push(...discoveryEndpointResult.value)
      successCount += 1
    } else if (discoveryEndpointResult) {
      this.logger.warn({ error: discoveryEndpointResult.reason }, 'DexScreener endpoint discovery failed')
    }

    const mintResult = discoverySources[2]
    if (mintResult?.status === 'fulfilled') {
      combinedItems.push(...mintResult.value)
      if (tokenMints.length > 0) {
        successCount += 1
      }
    } else if (mintResult) {
      this.logger.warn({ error: mintResult.reason }, 'DexScreener token mint discovery failed')
    }

    const normalized = dedupeByPairAddress(combinedItems)
    if (normalized.length === 0) {
      throw new Error(
        successCount > 0
          ? 'DexScreener returned no usable Solana pairs for configured discovery sources'
          : 'DexScreener discovery requests failed for all configured sources',
      )
    }

    if (!this.enricher) {
      return normalized
    }

    return this.enricher.enrich(normalized, signal)
  }

  private async fetchConfiguredSearchQueries(signal: AbortSignal): Promise<TokenFeedItem[]> {
    const queries = parseDexSearchQueries(this.options.searchQuery)
    const settled = await Promise.allSettled(queries.map((query) => this.fetchSearchQuery(query, signal)))
    const combined = collectFulfilledItems(queries, settled, (context, error) => {
      this.logger.warn({ error, query: context }, 'DexScreener search query failed')
    })

    const normalized = dedupeByPairAddress(combined.items)
    if (normalized.length > 0) {
      return normalized
    }

    throw new Error(
      combined.successCount > 0
        ? 'DexScreener returned no usable Solana pairs for configured search queries'
        : 'DexScreener search requests failed for all configured queries',
    )
  }

  private async fetchDiscoveryEndpointPairs(signal: AbortSignal): Promise<TokenFeedItem[]> {
    const settled = await Promise.allSettled(
      DEX_DISCOVERY_ENDPOINTS.map((endpoint) => this.fetchDiscoveryEndpointTokenAddresses(endpoint, signal)),
    )
    const tokenAddresses: string[] = []
    let successCount = 0

    settled.forEach((result, index) => {
      const endpoint = DEX_DISCOVERY_ENDPOINTS[index]
      if (!endpoint) {
        return
      }

      if (result.status === 'fulfilled') {
        successCount += 1
        tokenAddresses.push(...result.value)
        return
      }

      this.logger.warn({ error: result.reason, endpoint: endpoint.path }, 'DexScreener discovery endpoint failed')
    })

    const uniqueAddresses = Array.from(new Set(tokenAddresses))
    if (uniqueAddresses.length > 0) {
      return this.fetchTokenAddressBatches(uniqueAddresses, signal, 'DexScreener endpoint discovery')
    }

    throw new Error(
      successCount > 0
        ? 'DexScreener discovery endpoints returned no usable Solana token addresses'
        : 'DexScreener discovery endpoint requests failed for all endpoints',
    )
  }

  private async fetchDiscoveryEndpointTokenAddresses(
    endpoint: DexDiscoveryEndpoint,
    signal: AbortSignal,
  ): Promise<string[]> {
    const payload = await this.fetchDexJson(endpoint.path, signal)
    return extractSolanaTokenAddresses(payload)
  }

  private async fetchTokenAddressBatches(
    tokenAddresses: string[],
    signal: AbortSignal,
    context: string,
  ): Promise<TokenFeedItem[]> {
    const uniqueTokenAddresses = Array.from(new Set(tokenAddresses)).filter((address) => address.length > 0)
    const chunks = chunk(uniqueTokenAddresses, DEX_TOKEN_BATCH_SIZE)
    const settled = await Promise.allSettled(chunks.map((addresses) => this.fetchTokenAddressBatch(addresses, signal)))
    const combined = collectFulfilledItems(chunks, settled, (addresses, error) => {
      this.logger.warn({ error, tokenCount: addresses.length }, `${context} token batch request failed`)
    })

    const normalized = dedupeByPairAddress(combined.items)
    if (normalized.length > 0) {
      return normalized
    }

    throw new Error(
      combined.successCount > 0
        ? `${context} returned no usable Solana pairs for resolved token addresses`
        : `${context} token batch requests failed for all batches`,
    )
  }

  private async fetchTokenAddressBatch(tokenAddresses: string[], signal: AbortSignal): Promise<TokenFeedItem[]> {
    if (tokenAddresses.length === 0) {
      return []
    }

    const encodedTokenAddresses = encodeURIComponent(tokenAddresses.join(','))
    const payload = await this.fetchDexJson(`/tokens/v1/solana/${encodedTokenAddresses}`, signal)
    const pairs = extractPairs(payload)
    return pairs.map((pair) => normalizePair(pair)).filter((item): item is TokenFeedItem => item !== null)
  }

  private async fetchConfiguredTokenMints(tokenMints: string[], signal: AbortSignal): Promise<TokenFeedItem[]> {
    const settled = await Promise.allSettled(tokenMints.map((mint) => this.fetchTokenMint(mint, signal)))
    const combined = collectFulfilledItems(tokenMints, settled, (context, error) => {
      this.logger.warn({ error, mint: context }, 'DexScreener token mint request failed')
    })

    const normalized = dedupeByPairAddress(combined.items)
    if (normalized.length > 0) {
      return normalized
    }

    throw new Error(
      combined.successCount > 0
        ? 'DexScreener returned no usable Solana pairs for configured token mints'
        : 'DexScreener token mint requests failed for all configured mints',
    )
  }

  private async fetchSearchQuery(query: string, signal: AbortSignal): Promise<TokenFeedItem[]> {
    const payload = await this.fetchDexJson(`/latest/dex/search?q=${encodeURIComponent(query)}`, signal)
    const pairs = extractPairs(payload)
    return pairs.map((pair) => normalizePair(pair)).filter((item): item is TokenFeedItem => item !== null)
  }

  private async fetchTokenMint(mint: string, signal: AbortSignal): Promise<TokenFeedItem[]> {
    const payload = await this.fetchDexJson(`/tokens/v1/solana/${encodeURIComponent(mint)}`, signal)
    const pairs = extractPairs(payload)

    return pairs.map((pair) => normalizePair(pair)).filter((item): item is TokenFeedItem => item !== null)
  }

  private async fetchDexJson(path: string, signal: AbortSignal): Promise<unknown> {
    const pathWithSlash = path.startsWith('/') ? path : `/${path}`
    const url = `https://api.dexscreener.com${pathWithSlash}`
    const response = await this.httpClient.request(url, {
      method: 'GET',
      signal,
      headers: { accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`DexScreener request failed with status ${response.status} for ${pathWithSlash}`)
    }

    return (await response.json()) as unknown
  }
}

function parseDexSearchQueries(raw: string): string[] {
  const parsed = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parsed.length === 0) {
    return ['solana']
  }

  return Array.from(new Set(parsed))
}

function parseDexTokenMints(raw?: string): string[] {
  if (!raw) {
    return []
  }

  const parsed = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  return Array.from(new Set(parsed))
}

function extractPairs(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (isRecord(payload) && Array.isArray(payload.pairs)) {
    return payload.pairs
  }

  return []
}

function dedupeByPairAddress(items: TokenFeedItem[]): TokenFeedItem[] {
  const dedupedByPair = new Map<string, TokenFeedItem>()
  for (const item of items) {
    const pairKey = item.pairAddress ?? `${item.mint}:${item.symbol}:${item.priceUsd}`
    const existing = dedupedByPair.get(pairKey)
    if (!existing || item.liquidity > existing.liquidity) {
      dedupedByPair.set(pairKey, item)
    }
  }

  return Array.from(dedupedByPair.values())
}

function chunk<TValue>(items: TValue[], size: number): TValue[][] {
  if (size <= 0 || items.length === 0) {
    return []
  }

  const output: TValue[][] = []
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size))
  }

  return output
}

function extractSolanaTokenAddresses(payload: unknown): string[] {
  const output = new Set<string>()
  const records = extractDiscoveryRecords(payload)

  for (const record of records) {
    const chainId = stringOrNull(record.chainId)?.toLowerCase()
    if (chainId && chainId !== 'solana') {
      continue
    }

    const tokenAddress = stringOrNull(record.tokenAddress) ?? stringOrNull(record.address)
    if (tokenAddress) {
      output.add(tokenAddress)
    }
  }

  return Array.from(output)
}

function extractDiscoveryRecords(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => isRecord(item))
  }

  if (isRecord(payload)) {
    const candidates: unknown[] = []
    if (Array.isArray(payload.items)) {
      candidates.push(...payload.items)
    }
    if (Array.isArray(payload.data)) {
      candidates.push(...payload.data)
    }

    return candidates.filter((item): item is Record<string, unknown> => isRecord(item))
  }

  return []
}

function collectFulfilledItems<TContext>(
  contexts: TContext[],
  settled: PromiseSettledResult<TokenFeedItem[]>[],
  onRejected: (context: TContext, error: unknown) => void,
): { items: TokenFeedItem[]; successCount: number } {
  const items: TokenFeedItem[] = []
  let successCount = 0

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successCount += 1
      items.push(...result.value)
      return
    }

    onRejected(contexts[index] as TContext, result.reason)
  })

  return { items, successCount }
}

function normalizePair(input: unknown): TokenFeedItem | null {
  if (!isRecord(input)) {
    return null
  }

  if (input.chainId !== 'solana') {
    return null
  }

  const baseToken = isRecord(input.baseToken) ? input.baseToken : null
  const info = isRecord(input.info) ? input.info : null
  const pairCreatedAt = numberOrNull(input.pairCreatedAt)

  const mint = stringOrNull(baseToken?.address)
  const name = stringOrNull(baseToken?.name)
  const symbol = stringOrNull(baseToken?.symbol)
  const priceUsd = numberOrNull(input.priceUsd)
  const quoteToken = isRecord(input.quoteToken) ? input.quoteToken : null

  if (!mint || !name || !symbol || priceUsd === null) {
    return null
  }

  if (isLikelySpoofedMajorSymbol(mint, symbol)) {
    return null
  }

  const priceChange24h = numberOr(input.priceChange, 'h24')
  const volume24h = numberOr(input.volume, 'h24')
  const recentVolume5m = numberOr(input.volume, 'm5')
  const liquidity = numberOr(input.liquidity, 'usd')
  const marketCapDirect = numberOrNull(input.marketCap)
  const marketCapFdv = numberOrNull(input.fdv)
  const marketCap = marketCapDirect ?? marketCapFdv
  const recentTxns5m = sumBuysAndSells(input.txns, 'm5')
  const category = deriveCategory({ symbol, priceChange24h, volume24h, pairCreatedAt })
  const labels = deriveLabels({
    category,
    symbol,
    priceChange24h,
    volume24h,
    pairCreatedAt,
  })
  const riskTier = deriveRiskTier({ liquidity, volume24h, priceChange24h })
  const initialTrustTags = deriveRiskTrustTags(riskTier)

  return {
    mint,
    name,
    symbol,
    description: null,
    imageUri: stringOrNull(info?.imageUrl),
    priceUsd,
    priceChange24h,
    volume24h,
    liquidity,
    marketCap,
    sparkline: [],
    sparklineMeta: null,
    pairAddress: stringOrNull(input.pairAddress),
    pairCreatedAtMs: pairCreatedAt,
    tags: {
      trust: initialTrustTags,
      discovery: labels,
    },
    labels,
    sources: {
      price: 'dexscreener',
      liquidity: 'dexscreener',
      volume: 'dexscreener',
      marketCap:
        marketCapDirect !== null
          ? 'dexscreener_market_cap'
          : marketCapFdv !== null
            ? 'dexscreener_fdv'
            : 'unavailable',
      metadata: 'dexscreener',
      tags: initialTrustTags.length > 0 ? ['internal_risk'] : [],
    },
    quoteSymbol: stringOrNull(quoteToken?.symbol),
    recentVolume5m,
    recentTxns5m,
    category,
    riskTier,
  }
}

const CANONICAL_MAJOR_MINT_BY_SYMBOL: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4nJbH6kQQn1JrVN6a8GN',
}

function isLikelySpoofedMajorSymbol(mint: string, symbol: string): boolean {
  const expectedMint = CANONICAL_MAJOR_MINT_BY_SYMBOL[symbol.toUpperCase()]
  if (!expectedMint) {
    return false
  }

  return mint !== expectedMint
}

function deriveCategory(input: {
  symbol: string
  priceChange24h: number
  volume24h: number
  pairCreatedAt: number | null
}): FeedCategory {
  if (isMemeSymbol(input.symbol)) {
    return 'memecoin'
  }

  if (input.priceChange24h >= 8) {
    return 'gainer'
  }

  if (input.pairCreatedAt && Date.now() - input.pairCreatedAt < 3 * 24 * 60 * 60 * 1000) {
    return 'new'
  }

  if (input.volume24h > 0) {
    return 'trending'
  }

  return 'new'
}

function mapCategoryToLabel(category: FeedCategory): FeedLabel {
  if (category === 'memecoin') {
    return 'meme'
  }

  return category
}

function isMemeSymbol(symbol: string): boolean {
  const normalized = symbol.toLowerCase()
  return (
    normalized.includes('dog') ||
    normalized.includes('cat') ||
    normalized.includes('pepe') ||
    normalized.includes('bonk') ||
    normalized.includes('wif')
  )
}

function deriveLabels(input: {
  category: FeedCategory
  symbol: string
  priceChange24h: number
  volume24h: number
  pairCreatedAt: number | null
}): FeedLabel[] {
  const labels = new Set<FeedLabel>()
  const isNewPair = Boolean(input.pairCreatedAt && Date.now() - input.pairCreatedAt < 3 * 24 * 60 * 60 * 1000)

  if (input.volume24h > 0) {
    labels.add('trending')
  }
  if (isMemeSymbol(input.symbol) || input.category === 'memecoin') {
    labels.add('meme')
  }
  if (input.priceChange24h >= 8) {
    labels.add('gainer')
  }
  if (isNewPair || input.category === 'new') {
    labels.add('new')
  }

  labels.add(mapCategoryToLabel(input.category))

  const priority: FeedLabel[] = ['trending', 'meme', 'gainer', 'new']
  return priority.filter((label) => labels.has(label))
}

function deriveRiskTier(input: { liquidity: number; volume24h: number; priceChange24h: number }): RiskTier {
  if (input.liquidity < 10_000 || input.volume24h < 50_000) {
    return 'block'
  }

  if (Math.abs(input.priceChange24h) >= 50 || input.liquidity < 100_000) {
    return 'warn'
  }

  return 'allow'
}

function deriveRiskTrustTags(riskTier: RiskTier): string[] {
  if (riskTier === 'block') {
    return ['risk_block']
  }

  if (riskTier === 'warn') {
    return ['risk_warn']
  }

  return []
}

function numberOr(input: unknown, key: string): number {
  if (!isRecord(input)) {
    return 0
  }

  const value = numberOrNull(input[key])
  return value ?? 0
}

function sumBuysAndSells(input: unknown, key: string): number {
  if (!isRecord(input)) {
    return 0
  }

  const bucket = isRecord(input[key]) ? input[key] : null
  if (!bucket) {
    return 0
  }

  return Math.max(0, numberOrNull(bucket.buys) ?? 0) + Math.max(0, numberOrNull(bucket.sells) ?? 0)
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
  return typeof input === 'string' && input.length > 0 ? input : null
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}
