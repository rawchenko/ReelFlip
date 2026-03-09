import { getApiBaseUrl, normalizeBaseUrl } from '@/utils/api-base-url'
import { authHeaders, readErrorMessage } from '@/utils/api-client-helpers'

interface WatchlistResponse {
  mints: string[]
}

interface WatchlistAddResponse {
  mint: string
  addedAt: string
}

export async function fetchWatchlist(): Promise<string[]> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const response = await fetch(`${baseUrl}/v1/watchlist`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...authHeaders(),
    },
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Watchlist fetch failed with status ${response.status}`))
  }

  const payload = (await response.json()) as WatchlistResponse
  return payload.mints ?? []
}

export async function addToWatchlist(mint: string): Promise<WatchlistAddResponse> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const response = await fetch(`${baseUrl}/v1/watchlist`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ mint }),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Watchlist add failed with status ${response.status}`))
  }

  return (await response.json()) as WatchlistAddResponse
}

export async function removeFromWatchlist(mint: string): Promise<void> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const response = await fetch(`${baseUrl}/v1/watchlist/${encodeURIComponent(mint)}`, {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      ...authHeaders(),
    },
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Watchlist remove failed with status ${response.status}`))
  }
}
