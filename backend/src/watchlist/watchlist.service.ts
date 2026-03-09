import { CacheStore } from '../cache/cache.types.js'
import type { WatchlistEntry } from './watchlist.types.js'
import { WatchlistRepository } from '../storage/watchlist.repository.js'

const WATCHLIST_CACHE_KEY_PREFIX = 'watchlist:'
const WATCHLIST_CACHE_TTL_SECONDS = 60
const WATCHLIST_MAX_SIZE = 100

export class WatchlistServiceError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'WatchlistServiceError'
  }
}

export class WatchlistService {
  constructor(
    private readonly repository: WatchlistRepository,
    private readonly cacheStore: CacheStore,
  ) {}

  async getWatchlist(wallet: string): Promise<WatchlistEntry[]> {
    this.assertRepositoryEnabled()

    const cacheKey = getWatchlistCacheKey(wallet)
    const cached = await this.readCachedEntries(cacheKey)
    if (cached) {
      return cached
    }

    const entries = await this.repository.listByWallet(wallet)
    await this.writeCachedEntries(cacheKey, entries)
    return entries
  }

  async addToWatchlist(wallet: string, mint: string): Promise<WatchlistEntry> {
    const normalizedMint = mint.trim()
    if (normalizedMint.length === 0) {
      throw new WatchlistServiceError('BAD_REQUEST', 400, 'mint is required')
    }

    const entries = await this.getWatchlist(wallet)

    const existing = entries.find((e) => e.mint === normalizedMint)
    if (existing) {
      return existing
    }

    if (entries.length >= WATCHLIST_MAX_SIZE) {
      throw new WatchlistServiceError('WATCHLIST_FULL', 400, `Watchlist is full (max ${WATCHLIST_MAX_SIZE} tokens)`)
    }

    const entry = await this.repository.addForWallet(wallet, normalizedMint)
    await this.refreshCache(wallet)
    return entry
  }

  async removeFromWatchlist(wallet: string, mint: string): Promise<void> {
    this.assertRepositoryEnabled()
    await this.repository.removeForWallet(wallet, mint)
    await this.refreshCache(wallet)
  }

  private assertRepositoryEnabled(): void {
    if (!this.repository.isEnabled()) {
      throw new WatchlistServiceError('WATCHLIST_UNAVAILABLE', 503, 'Watchlist persistence is unavailable')
    }
  }

  private async refreshCache(wallet: string): Promise<void> {
    const entries = await this.repository.listByWallet(wallet)
    await this.writeCachedEntries(getWatchlistCacheKey(wallet), entries)
  }

  private async readCachedEntries(cacheKey: string): Promise<WatchlistEntry[] | null> {
    const raw = await this.cacheStore.get(cacheKey)
    if (!raw) {
      return null
    }

    try {
      const entries = JSON.parse(raw) as WatchlistEntry[]
      return Array.isArray(entries) ? entries : null
    } catch {
      return null
    }
  }

  private async writeCachedEntries(cacheKey: string, entries: WatchlistEntry[]): Promise<void> {
    await this.cacheStore.set(cacheKey, JSON.stringify(entries), WATCHLIST_CACHE_TTL_SECONDS)
  }
}

function getWatchlistCacheKey(wallet: string): string {
  return `${WATCHLIST_CACHE_KEY_PREFIX}${wallet}`
}
