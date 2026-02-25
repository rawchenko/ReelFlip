export type FeedCategory = 'trending' | 'gainer' | 'new' | 'memecoin'
export type RiskTier = 'block' | 'warn' | 'allow'

export interface TokenFeedItem {
  mint: string
  name: string
  symbol: string
  imageUri: string | null
  priceUsd: number
  priceChange24h: number
  volume24h: number
  liquidity: number
  marketCap: number
  sparkline: number[]
  pairAddress: string | null
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

interface Logger {
  warn: (obj: unknown, msg?: string) => void
}

export class SeedFeedProvider implements FeedProvider {
  readonly name = 'seed'

  constructor(private readonly seededItems: TokenFeedItem[]) {}

  async fetchFeed(_signal: AbortSignal): Promise<TokenFeedItem[]> {
    return this.seededItems
  }
}

export class CompositeFeedProvider {
  constructor(
    private readonly liveProviders: FeedProvider[],
    private readonly seededProvider: FeedProvider,
    private readonly logger: Logger,
  ) {}

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
}

export class DexScreenerFeedProvider implements FeedProvider {
  readonly name = 'dexscreener'

  constructor(
    private readonly options: DexScreenerProviderOptions,
    private readonly logger: Logger,
  ) {}

  async fetchFeed(signal: AbortSignal): Promise<TokenFeedItem[]> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs)
    const abortOnParent = () => controller.abort()
    signal.addEventListener('abort', abortOnParent, { once: true })

    try {
      const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(this.options.searchQuery)}`
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`DexScreener request failed with status ${response.status}`)
      }

      const payload = (await response.json()) as { pairs?: unknown }
      const pairs = Array.isArray(payload.pairs) ? payload.pairs : []
      const normalized = pairs.map((pair) => normalizePair(pair)).filter((item): item is TokenFeedItem => item !== null)

      if (normalized.length === 0) {
        throw new Error('DexScreener returned no usable Solana pairs')
      }

      return normalized
    } catch (error) {
      this.logger.warn({ error }, 'DexScreener fetch failed')
      throw error
    } finally {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', abortOnParent)
    }
  }
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

  if (!mint || !name || !symbol || priceUsd === null) {
    return null
  }

  const priceChange24h = numberOr(input.priceChange, 'h24')
  const volume24h = numberOr(input.volume, 'h24')
  const liquidity = numberOr(input.liquidity, 'usd')
  const marketCap = numberOrNull(input.marketCap) ?? numberOrNull(input.fdv) ?? Math.max(liquidity * 8, 0)
  const sparkline = deriveSparkline(priceUsd, input.priceChange)

  return {
    mint,
    name,
    symbol,
    imageUri: stringOrNull(info?.imageUrl),
    priceUsd,
    priceChange24h,
    volume24h,
    liquidity,
    marketCap,
    sparkline,
    pairAddress: stringOrNull(input.pairAddress),
    category: deriveCategory({ symbol, priceChange24h, volume24h, pairCreatedAt }),
    riskTier: deriveRiskTier({ liquidity, volume24h, priceChange24h }),
  }
}

function deriveSparkline(priceUsd: number, priceChange: unknown): number[] {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    return []
  }

  const change24h = numberOr(priceChange, 'h24')
  const change6h = numberOr(priceChange, 'h6')
  const change1h = numberOr(priceChange, 'h1')
  const change5m = numberOr(priceChange, 'm5')

  const startPrice = priceFromPercentChange(priceUsd, change24h)
  const start = Number.isFinite(startPrice) && startPrice > 0 ? startPrice : priceUsd
  const pointsCount = 56
  const volatilityScale = Math.min(
    0.06,
    Math.max(Math.abs(change1h) / 100, (Math.abs(change5m) * 4) / 100, Math.abs(change6h) / 6 / 100, 0.003),
  )

  const output: number[] = []

  for (let index = 0; index < pointsCount; index += 1) {
    const t = index / (pointsCount - 1)
    const trend = start + (priceUsd - start) * t
    const oscillationA = Math.sin((index + 3) * 0.62) * trend * volatilityScale * 0.35
    const oscillationB = Math.cos((index + 11) * 0.19) * trend * volatilityScale * 0.2
    const drift = Math.sin((index + 1) * 0.11) * trend * volatilityScale * 0.08
    const value = Math.max(Number.EPSILON, trend + oscillationA + oscillationB + drift)
    output.push(value)
  }

  output[output.length - 1] = priceUsd
  return output
}

function priceFromPercentChange(currentPriceUsd: number, percentChange: number): number {
  const denominator = 1 + percentChange / 100
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return currentPriceUsd
  }

  return currentPriceUsd / denominator
}

function deriveCategory(input: {
  symbol: string
  priceChange24h: number
  volume24h: number
  pairCreatedAt: number | null
}): FeedCategory {
  const symbol = input.symbol.toLowerCase()
  if (
    symbol.includes('dog') ||
    symbol.includes('cat') ||
    symbol.includes('pepe') ||
    symbol.includes('bonk') ||
    symbol.includes('wif')
  ) {
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

function deriveRiskTier(input: { liquidity: number; volume24h: number; priceChange24h: number }): RiskTier {
  if (input.liquidity < 1_000_000 || input.volume24h < 5_000_000) {
    return 'block'
  }

  if (Math.abs(input.priceChange24h) >= 20 || input.liquidity < 10_000_000) {
    return 'warn'
  }

  return 'allow'
}

function numberOr(input: unknown, key: string): number {
  if (!isRecord(input)) {
    return 0
  }

  const value = numberOrNull(input[key])
  return value ?? 0
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
