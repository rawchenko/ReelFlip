import { FeedCategory, TokenFeedItem } from '@/features/feed/types'
import { getApiBaseUrl, normalizeBaseUrl } from '@/utils/api-base-url'

export interface FeedCursorMetadata {
  nextCursor: string | null
  generatedAt: string
}

export interface FeedResponse extends FeedCursorMetadata {
  items: TokenFeedItem[]
}

export interface FeedRequestParams {
  category?: FeedCategory
  minLifetimeHours?: number
  cursor?: string
  limit?: number
  mints?: string[]
  signal?: AbortSignal
}

interface FeedErrorEnvelope {
  error?: {
    code?: string
    message?: string
  }
}

export async function fetchFeed(params: FeedRequestParams): Promise<FeedResponse> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const searchParams = new URLSearchParams()

  if (params.category) {
    searchParams.set('category', params.category)
  }

  if (typeof params.minLifetimeHours === 'number') {
    searchParams.set('minLifetimeHours', String(params.minLifetimeHours))
  }

  if (params.cursor) {
    searchParams.set('cursor', params.cursor)
  }

  if (params.limit) {
    searchParams.set('limit', String(params.limit))
  }

  if (params.mints && params.mints.length > 0) {
    searchParams.set('mints', params.mints.join(','))
  }

  const queryString = searchParams.toString()
  const url = `${baseUrl}/v1/feed${queryString ? `?${queryString}` : ''}`

  const response = await fetch(url, {
    method: 'GET',
    signal: params.signal,
    headers: {
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    let message = `Feed request failed with status ${response.status}`

    try {
      const payload = (await response.json()) as FeedErrorEnvelope
      if (payload.error?.message) {
        message = payload.error.message
      }
    } catch {
      // Keep fallback message when error payload is not JSON.
    }

    throw new Error(message)
  }

  const payload = (await response.json()) as Partial<FeedResponse>
  if (!Array.isArray(payload.items)) {
    throw new Error('Feed response is missing items array')
  }

  return {
    items: payload.items,
    nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
    generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date(0).toISOString(),
  }
}
