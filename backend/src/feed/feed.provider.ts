import type { ChartHistoryQuality } from '../chart/chart.types.js'
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
  candleCount1m?: number
}

export interface TokenFeedSources {
  price: 'birdeye' | 'dexscreener' | 'seed'
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
}

export class DexScreenerFeedProvider implements FeedProvider {
  readonly name = 'dexscreener'

  constructor(
    private readonly options: DexScreenerProviderOptions,
    private readonly logger: Logger,
    private readonly enricher?: FeedEnricher,
  ) {}

  async fetchFeed(signal: AbortSignal): Promise<TokenFeedItem[]> {
    const tokenMints = parseDexTokenMints(this.options.tokenMints)
    const discoverySources = await Promise.allSettled([
      this.fetchConfiguredSearchQueries(signal),
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

    const mintResult = discoverySources[1]
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
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs)
    const abortOnParent = () => controller.abort()
    signal.addEventListener('abort', abortOnParent, { once: true })

    try {
      const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`DexScreener request failed with status ${response.status} for query ${query}`)
      }

      const payload = (await response.json()) as unknown
      const pairs = extractPairs(payload)

      return pairs.map((pair) => normalizePair(pair)).filter((item): item is TokenFeedItem => item !== null)
    } finally {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', abortOnParent)
    }
  }

  private async fetchTokenMint(mint: string, signal: AbortSignal): Promise<TokenFeedItem[]> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs)
    const abortOnParent = () => controller.abort()
    signal.addEventListener('abort', abortOnParent, { once: true })

    try {
      const url = `https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(mint)}`
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`DexScreener request failed with status ${response.status} for mint ${mint}`)
      }

      const payload = (await response.json()) as unknown
      const pairs = extractPairs(payload)

      return pairs.map((pair) => normalizePair(pair)).filter((item): item is TokenFeedItem => item !== null)
    } finally {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', abortOnParent)
    }
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
    tags: {
      trust: initialTrustTags,
      discovery: labels,
    },
    labels,
    sources: {
      price: 'dexscreener',
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
  if (input.liquidity < 1_000_000 || input.volume24h < 5_000_000) {
    return 'block'
  }

  if (Math.abs(input.priceChange24h) >= 20 || input.liquidity < 10_000_000) {
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
