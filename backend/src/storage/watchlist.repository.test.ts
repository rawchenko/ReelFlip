import assert from 'node:assert/strict'
import test from 'node:test'
import type { WatchlistEntry } from '../watchlist/watchlist.types.js'
import { SupabaseClient } from './supabase.client.js'
import { WatchlistRepository } from './watchlist.repository.js'

interface SelectCall {
  table: string
  query: Record<string, string | undefined>
}

interface RequestCall {
  method: 'POST' | 'GET' | 'DELETE'
  table: string
  options: {
    query?: Record<string, string | undefined>
    body?: unknown
    prefer?: string
  }
}

interface DeleteCall {
  table: string
  query: Record<string, string | undefined>
}

class FakeSupabaseClient {
  enabled = true
  readonly selectCalls: SelectCall[] = []
  readonly requestCalls: RequestCall[] = []
  readonly deleteCalls: DeleteCall[] = []
  readonly tokens = new Map<string, { mint: string }>()
  readonly watchlists = new Map<string, WatchlistEntry[]>()

  isEnabled(): boolean {
    return this.enabled
  }

  async selectRows<T>(table: string, query: Record<string, string | undefined>): Promise<T[]> {
    this.selectCalls.push({ table, query })

    if (table === 'tokens') {
      const mint = parseEq(query.mint)
      if (!mint) {
        return [] as T[]
      }
      return (this.tokens.has(mint) ? [{ mint }] : []) as T[]
    }

    if (table === 'user_watchlists') {
      const wallet = parseEq(query.wallet)
      const mint = parseEq(query.mint)
      const entries = wallet ? [...(this.watchlists.get(wallet) ?? [])] : []
      const filtered = mint ? entries.filter((entry) => entry.mint === mint) : entries
      return filtered
        .map((entry) => ({
          wallet,
          mint: entry.mint,
          added_at: entry.addedAt,
        }))
        .sort((left, right) => right.added_at.localeCompare(left.added_at)) as T[]
    }

    return [] as T[]
  }

  async request<T>(
    method: 'POST' | 'GET' | 'DELETE',
    table: string,
    options: {
      query?: Record<string, string | undefined>
      body?: unknown
      prefer?: string
    } = {},
  ): Promise<T> {
    this.requestCalls.push({ method, table, options })

    if (method === 'POST' && table === 'tokens') {
      const rows = Array.isArray(options.body) ? (options.body as Array<{ mint: string }>) : []
      for (const row of rows) {
        this.tokens.set(row.mint, { mint: row.mint })
      }
      return undefined as T
    }

    if (method === 'POST' && table === 'user_watchlists') {
      const rows = Array.isArray(options.body)
        ? (options.body as Array<{ wallet: string; mint: string; added_at: string }>)
        : []
      const row = rows[0]
      if (!row) {
        return [] as T
      }

      const entries = [...(this.watchlists.get(row.wallet) ?? [])]
      const existing = entries.find((entry) => entry.mint === row.mint)
      if (existing) {
        return [] as T
      }

      const next: WatchlistEntry = {
        mint: row.mint,
        addedAt: row.added_at,
      }
      entries.push(next)
      entries.sort((left, right) => right.addedAt.localeCompare(left.addedAt))
      this.watchlists.set(row.wallet, entries)
      return [
        {
          wallet: row.wallet,
          mint: row.mint,
          added_at: row.added_at,
        },
      ] as T
    }

    return undefined as T
  }

  async deleteRows<T>(table: string, query: Record<string, string | undefined>): Promise<T[]> {
    this.deleteCalls.push({ table, query })

    if (table === 'user_watchlists') {
      const wallet = parseEq(query.wallet)
      const mint = parseEq(query.mint)
      if (wallet && mint) {
        const next = (this.watchlists.get(wallet) ?? []).filter((entry) => entry.mint !== mint)
        this.watchlists.set(wallet, next)
      }
    }

    return [] as T[]
  }
}

const logger = {
  info: () => undefined,
  warn: () => undefined,
}

test('listByWallet returns entries ordered newest-first', async () => {
  const fake = new FakeSupabaseClient()
  fake.watchlists.set('wallet-a', [
    { mint: 'mint-old', addedAt: '2026-03-10T10:00:00.000Z' },
    { mint: 'mint-new', addedAt: '2026-03-10T12:00:00.000Z' },
  ])
  const repository = new WatchlistRepository(fake as unknown as SupabaseClient, logger)

  const entries = await repository.listByWallet('wallet-a')

  assert.deepEqual(entries.map((entry) => entry.mint), ['mint-new', 'mint-old'])
})

test('addForWallet bootstraps missing token and inserts watchlist row', async () => {
  const fake = new FakeSupabaseClient()
  const repository = new WatchlistRepository(fake as unknown as SupabaseClient, logger)

  const entry = await repository.addForWallet('wallet-a', 'mint-new')

  assert.equal(entry.mint, 'mint-new')
  assert.ok(fake.tokens.has('mint-new'))
  assert.equal(fake.requestCalls[0]?.table, 'tokens')
  assert.equal(fake.requestCalls[1]?.table, 'user_watchlists')
})

test('addForWallet is idempotent and preserves original addedAt', async () => {
  const fake = new FakeSupabaseClient()
  fake.tokens.set('mint-a', { mint: 'mint-a' })
  fake.watchlists.set('wallet-a', [{ mint: 'mint-a', addedAt: '2026-03-10T09:00:00.000Z' }])
  const repository = new WatchlistRepository(fake as unknown as SupabaseClient, logger)

  const entry = await repository.addForWallet('wallet-a', 'mint-a')

  assert.equal(entry.mint, 'mint-a')
  assert.equal(entry.addedAt, '2026-03-10T09:00:00.000Z')
})

test('removeForWallet deletes only the targeted wallet/mint row', async () => {
  const fake = new FakeSupabaseClient()
  fake.tokens.set('mint-a', { mint: 'mint-a' })
  fake.watchlists.set('wallet-a', [{ mint: 'mint-a', addedAt: '2026-03-10T09:00:00.000Z' }])
  fake.watchlists.set('wallet-b', [{ mint: 'mint-a', addedAt: '2026-03-10T10:00:00.000Z' }])
  const repository = new WatchlistRepository(fake as unknown as SupabaseClient, logger)

  await repository.removeForWallet('wallet-a', 'mint-a')

  assert.deepEqual(fake.watchlists.get('wallet-a'), [])
  assert.deepEqual(fake.watchlists.get('wallet-b'), [{ mint: 'mint-a', addedAt: '2026-03-10T10:00:00.000Z' }])
})

test('listByWallet is empty when supabase is disabled', async () => {
  const fake = new FakeSupabaseClient()
  fake.enabled = false
  const repository = new WatchlistRepository(fake as unknown as SupabaseClient, logger)

  const entries = await repository.listByWallet('wallet-a')

  assert.deepEqual(entries, [])
})

function parseEq(value: string | undefined): string | null {
  if (!value || !value.startsWith('eq.')) {
    return null
  }

  return value.slice(3)
}
