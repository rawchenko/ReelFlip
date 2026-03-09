import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import { MemoryCacheStore } from '../cache/cache.memory.js'
import { registerWatchlistRoutes } from './watchlist.route.js'
import { WatchlistService } from './watchlist.service.js'
import type { WatchlistEntry } from './watchlist.types.js'
import { WatchlistRepository } from '../storage/watchlist.repository.js'

class InMemoryWatchlistRepository {
  enabled = true
  private readonly data = new Map<string, WatchlistEntry[]>()

  isEnabled(): boolean {
    return this.enabled
  }

  async listByWallet(wallet: string): Promise<WatchlistEntry[]> {
    return [...(this.data.get(wallet) ?? [])].sort((left, right) => right.addedAt.localeCompare(left.addedAt))
  }

  async addForWallet(wallet: string, mint: string): Promise<WatchlistEntry> {
    const entries = [...(this.data.get(wallet) ?? [])]
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
    this.data.set(wallet, entries)
    return entry
  }

  async removeForWallet(wallet: string, mint: string): Promise<void> {
    this.data.set(
      wallet,
      (this.data.get(wallet) ?? []).filter((entry) => entry.mint !== mint),
    )
  }
}

test('watchlist routes are scoped by authenticated wallet', async () => {
  const repository = new InMemoryWatchlistRepository()
  const service = new WatchlistService(repository as unknown as WatchlistRepository, new MemoryCacheStore())
  const app = Fastify()

  await registerWatchlistRoutes(app, {
    watchlistService: service,
    rateLimitWatchlistPerMinute: 60,
    authPreHandler: async (request, reply) => {
      const wallet = request.headers['x-test-wallet']
      if (typeof wallet !== 'string' || wallet.length === 0) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
      }
      request.authWallet = wallet
    },
  })

  const walletA = 'wallet-a'
  const walletB = 'wallet-b'

  const addResponse = await app.inject({
    method: 'POST',
    url: '/v1/watchlist',
    headers: {
      'x-test-wallet': walletA,
    },
    payload: { mint: 'mint-a' },
  })
  assert.equal(addResponse.statusCode, 201)

  const getWalletA = await app.inject({
    method: 'GET',
    url: '/v1/watchlist',
    headers: {
      'x-test-wallet': walletA,
    },
  })
  assert.equal(getWalletA.statusCode, 200)
  assert.deepEqual(getWalletA.json(), { mints: ['mint-a'] })

  const getWalletB = await app.inject({
    method: 'GET',
    url: '/v1/watchlist',
    headers: {
      'x-test-wallet': walletB,
    },
  })
  assert.equal(getWalletB.statusCode, 200)
  assert.deepEqual(getWalletB.json(), { mints: [] })

  const deleteWalletB = await app.inject({
    method: 'DELETE',
    url: '/v1/watchlist/mint-a',
    headers: {
      'x-test-wallet': walletB,
    },
  })
  assert.equal(deleteWalletB.statusCode, 204)

  const getWalletAAfterDelete = await app.inject({
    method: 'GET',
    url: '/v1/watchlist',
    headers: {
      'x-test-wallet': walletA,
    },
  })
  assert.deepEqual(getWalletAAfterDelete.json(), { mints: ['mint-a'] })
})

test('watchlist routes require auth', async () => {
  const repository = new InMemoryWatchlistRepository()
  const service = new WatchlistService(repository as unknown as WatchlistRepository, new MemoryCacheStore())
  const app = Fastify()

  await registerWatchlistRoutes(app, {
    watchlistService: service,
    rateLimitWatchlistPerMinute: 60,
    authPreHandler: async (_request, reply) => {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
    },
  })

  const response = await app.inject({
    method: 'GET',
    url: '/v1/watchlist',
  })
  assert.equal(response.statusCode, 401)
})
