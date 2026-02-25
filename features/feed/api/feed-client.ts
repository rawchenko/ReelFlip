import { FeedCategory, TokenFeedItem } from '@/features/feed/types'
import { Platform } from 'react-native'

export interface FeedCursorMetadata {
  nextCursor: string | null
  generatedAt: string
}

export interface FeedResponse extends FeedCursorMetadata {
  items: TokenFeedItem[]
}

export interface FeedRequestParams {
  category?: FeedCategory
  cursor?: string
  limit?: number
  signal?: AbortSignal
}

interface FeedErrorEnvelope {
  error?: {
    code?: string
    message?: string
  }
}

const DEFAULT_ANDROID_API_URL = 'http://10.0.2.2:3001'
const DEFAULT_IOS_API_URL = 'http://127.0.0.1:3001'

function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL
  if (configured && configured.length > 0) {
    return configured
  }

  return Platform.OS === 'android' ? DEFAULT_ANDROID_API_URL : DEFAULT_IOS_API_URL
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

export async function fetchFeed(params: FeedRequestParams): Promise<FeedResponse> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const searchParams = new URLSearchParams()

  if (params.category) {
    searchParams.set('category', params.category)
  }

  if (params.cursor) {
    searchParams.set('cursor', params.cursor)
  }

  if (params.limit) {
    searchParams.set('limit', String(params.limit))
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
