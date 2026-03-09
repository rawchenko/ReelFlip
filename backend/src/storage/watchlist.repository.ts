import type { WatchlistEntry } from '../watchlist/watchlist.types.js'
import type { PersistedTokenRow, PersistedWatchlistRow } from './storage.types.js'
import { SupabaseClient } from './supabase.client.js'

interface Logger {
  info?: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
}

interface TokenExistsRow {
  mint: string
}

export class WatchlistRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: Logger,
  ) {}

  isEnabled(): boolean {
    return this.supabase.isEnabled()
  }

  async listByWallet(wallet: string): Promise<WatchlistEntry[]> {
    if (!this.supabase.isEnabled()) {
      return []
    }

    try {
      const rows = await this.supabase.selectRows<PersistedWatchlistRow>('user_watchlists', {
        select: 'wallet,mint,added_at',
        wallet: `eq.${wallet}`,
        order: 'added_at.desc',
      })
      return rows.map(mapPersistedWatchlistRow)
    } catch (error) {
      this.logger.warn({ error, wallet }, 'Failed to read watchlist rows from Supabase')
      throw error
    }
  }

  async addForWallet(wallet: string, mint: string): Promise<WatchlistEntry> {
    if (!this.supabase.isEnabled()) {
      throw new Error('Supabase watchlist repository is not configured')
    }

    const normalizedMint = mint.trim()
    await this.ensureTokenExists(normalizedMint)

    const addedAt = new Date().toISOString()
    try {
      const inserted = await this.supabase.request<PersistedWatchlistRow[]>('POST', 'user_watchlists', {
        query: {
          on_conflict: 'wallet,mint',
        },
        body: [
          {
            wallet,
            mint: normalizedMint,
            added_at: addedAt,
          },
        ],
        prefer: 'resolution=ignore-duplicates,return=representation',
      })

      const row = inserted[0] ?? (await this.readOne(wallet, normalizedMint))
      if (!row) {
        throw new Error('Watchlist row was not returned after insert')
      }

      return mapPersistedWatchlistRow(row)
    } catch (error) {
      this.logger.warn({ error, wallet, mint: normalizedMint }, 'Failed to persist watchlist row in Supabase')
      throw error
    }
  }

  async removeForWallet(wallet: string, mint: string): Promise<void> {
    if (!this.supabase.isEnabled()) {
      throw new Error('Supabase watchlist repository is not configured')
    }

    const normalizedMint = mint.trim()
    try {
      await this.supabase.deleteRows(
        'user_watchlists',
        {
          wallet: `eq.${wallet}`,
          mint: `eq.${normalizedMint}`,
        },
        'minimal',
      )
    } catch (error) {
      this.logger.warn({ error, wallet, mint: normalizedMint }, 'Failed to delete watchlist row from Supabase')
      throw error
    }
  }

  private async readOne(wallet: string, mint: string): Promise<PersistedWatchlistRow | null> {
    const rows = await this.supabase.selectRows<PersistedWatchlistRow>('user_watchlists', {
      select: 'wallet,mint,added_at',
      wallet: `eq.${wallet}`,
      mint: `eq.${mint}`,
      limit: '1',
    })
    return rows[0] ?? null
  }

  private async ensureTokenExists(mint: string): Promise<void> {
    const existing = await this.supabase.selectRows<TokenExistsRow>('tokens', {
      select: 'mint',
      mint: `eq.${mint}`,
      limit: '1',
    })
    if (existing.length > 0) {
      return
    }

    const placeholder: PersistedTokenRow = {
      mint,
      name: mint,
      symbol: mint.slice(0, 8),
      description: null,
      image_uri: null,
      updated_at: new Date().toISOString(),
    }

    await this.supabase.request<void>('POST', 'tokens', {
      query: {
        on_conflict: 'mint',
      },
      body: [placeholder],
      prefer: 'resolution=ignore-duplicates,return=minimal',
    })

    this.logger.info?.({ mint }, 'Inserted placeholder token row for watchlist bootstrap')
  }
}

function mapPersistedWatchlistRow(row: PersistedWatchlistRow): WatchlistEntry {
  return {
    mint: row.mint,
    addedAt: row.added_at,
  }
}
