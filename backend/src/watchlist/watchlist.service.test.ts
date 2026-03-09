import assert from 'node:assert/strict'
import test from 'node:test'
import { MemoryCacheStore } from '../cache/cache.memory.js'
import { WatchlistRepository } from '../storage/watchlist.repository.js'
import { WatchlistService, WatchlistServiceError } from './watchlist.service.js'
import type { WatchlistEntry } from './watchlist.types.js'

const VALID_MINT = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'
const VALID_MINT_2 = 'So11111111111111111111111111111111111111112'
const TEST_WALLET = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dUhK2B'

class FakeWatchlistRepository {
  enabled = true
  readCount = 0
  addCount = 0
  removeCount = 0
  private readonly entriesByWallet = new Map<string, WatchlistEntry[]>()

  constructor(seed?: Record<string, WatchlistEntry[]>) {
    if (seed) {
      for (const [wallet, entries] of Object.entries(seed)) {
        this.entriesByWallet.set(wallet, [...entries])
      }
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  async listByWallet(wallet: string): Promise<WatchlistEntry[]> {
    this.readCount += 1
    return [...(this.entriesByWallet.get(wallet) ?? [])].sort((left, right) => right.addedAt.localeCompare(left.addedAt))
  }

  async addForWallet(wallet: string, mint: string): Promise<WatchlistEntry> {
    this.addCount += 1
    const entries = [...(this.entriesByWallet.get(wallet) ?? [])]
    const existing = entries.find((entry) => entry.mint === mint)
    if (existing) {
      return existing
    }

    const entry: WatchlistEntry = {
      mint,
      addedAt: new Date().toISOString(),
    }
    entries.push(entry)
    entries.sort((left, right) => right.addedAt.localeCompare(left.addedAt))
    this.entriesByWallet.set(wallet, entries)
    return entry
  }

  async removeForWallet(wallet: string, mint: string): Promise<void> {
    this.removeCount += 1
    this.entriesByWallet.set(
      wallet,
      (this.entriesByWallet.get(wallet) ?? []).filter((entry) => entry.mint !== mint),
    )
  }
}

function createTestService(seed?: Record<string, WatchlistEntry[]>) {
  const repository = new FakeWatchlistRepository(seed)
  const cacheStore = new MemoryCacheStore()
  const service = new WatchlistService(repository as unknown as WatchlistRepository, cacheStore)
  return { repository, cacheStore, service }
}

test('getWatchlist returns empty array for new wallet', async () => {
  const { service } = createTestService()

  const entries = await service.getWatchlist(TEST_WALLET)

  assert.deepEqual(entries, [])
})

test('getWatchlist populates cache on first read and serves cached data afterward', async () => {
  const { repository, service } = createTestService({
    [TEST_WALLET]: [{ mint: VALID_MINT, addedAt: '2026-03-10T09:00:00.000Z' }],
  })

  const first = await service.getWatchlist(TEST_WALLET)
  const second = await service.getWatchlist(TEST_WALLET)

  assert.deepEqual(first, second)
  assert.equal(repository.readCount, 1)
})

test('addToWatchlist adds mint and refreshes cache from repository', async () => {
  const { repository, service } = createTestService()

  const entry = await service.addToWatchlist(TEST_WALLET, VALID_MINT)

  assert.equal(entry.mint, VALID_MINT)
  assert.equal(repository.addCount, 1)

  const entries = await service.getWatchlist(TEST_WALLET)
  assert.equal(entries.length, 1)
  assert.equal(entries[0]?.mint, VALID_MINT)
})

test('addToWatchlist is idempotent for duplicate mints', async () => {
  const { repository, service } = createTestService({
    [TEST_WALLET]: [{ mint: VALID_MINT, addedAt: '2026-03-10T09:00:00.000Z' }],
  })

  const first = await service.addToWatchlist(TEST_WALLET, VALID_MINT)
  const second = await service.addToWatchlist(TEST_WALLET, VALID_MINT)

  assert.equal(first.mint, second.mint)
  assert.equal(first.addedAt, second.addedAt)
  assert.equal(repository.addCount, 0)
})

test('removeFromWatchlist removes an existing mint and refreshes cache', async () => {
  const { repository, service } = createTestService({
    [TEST_WALLET]: [
      { mint: VALID_MINT, addedAt: '2026-03-10T09:00:00.000Z' },
      { mint: VALID_MINT_2, addedAt: '2026-03-10T10:00:00.000Z' },
    ],
  })

  await service.removeFromWatchlist(TEST_WALLET, VALID_MINT)

  assert.equal(repository.removeCount, 1)
  const entries = await service.getWatchlist(TEST_WALLET)
  assert.deepEqual(entries.map((entry) => entry.mint), [VALID_MINT_2])
})

test('removeFromWatchlist on empty watchlist succeeds silently', async () => {
  const { service } = createTestService()

  await service.removeFromWatchlist(TEST_WALLET, VALID_MINT)

  const entries = await service.getWatchlist(TEST_WALLET)
  assert.deepEqual(entries, [])
})

test('addToWatchlist rejects empty mint', async () => {
  const { service } = createTestService()

  await assert.rejects(
    () => service.addToWatchlist(TEST_WALLET, '   '),
    (error: WatchlistServiceError) => {
      assert.equal(error.code, 'BAD_REQUEST')
      assert.equal(error.statusCode, 400)
      return true
    },
  )
})

test('addToWatchlist rejects when watchlist is full', async () => {
  const fullEntries: WatchlistEntry[] = Array.from({ length: 100 }, (_, index) => ({
    mint: `mint-${index}`,
    addedAt: `2026-03-10T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
  }))
  const { service } = createTestService({
    [TEST_WALLET]: fullEntries,
  })

  await assert.rejects(
    () => service.addToWatchlist(TEST_WALLET, VALID_MINT),
    (error: WatchlistServiceError) => {
      assert.equal(error.code, 'WATCHLIST_FULL')
      assert.equal(error.statusCode, 400)
      return true
    },
  )
})

test('watchlist survives service restart because repository is authoritative', async () => {
  const repository = new FakeWatchlistRepository()
  const firstService = new WatchlistService(repository as unknown as WatchlistRepository, new MemoryCacheStore())
  await firstService.addToWatchlist(TEST_WALLET, VALID_MINT)

  const restartedService = new WatchlistService(repository as unknown as WatchlistRepository, new MemoryCacheStore())
  const entries = await restartedService.getWatchlist(TEST_WALLET)

  assert.deepEqual(entries.map((entry) => entry.mint), [VALID_MINT])
})

test('watchlist operations fail closed when persistence is unavailable', async () => {
  const { repository, service } = createTestService()
  repository.enabled = false

  await assert.rejects(
    () => service.getWatchlist(TEST_WALLET),
    (error: WatchlistServiceError) => {
      assert.equal(error.code, 'WATCHLIST_UNAVAILABLE')
      assert.equal(error.statusCode, 503)
      return true
    },
  )
})
