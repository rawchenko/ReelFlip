import { FeedCategory } from '@/features/feed/types'
import { useQuery } from '@tanstack/react-query'
import { fetchFeed } from './feed-client'

interface UseFeedQueryOptions {
  category?: FeedCategory
  cursor?: string
  limit?: number
  refetchIntervalMs?: number
  enabled?: boolean
}

export function useFeedQuery(options: UseFeedQueryOptions = {}) {
  const { category, cursor, limit = 20, refetchIntervalMs = 5_000, enabled = true } = options

  return useQuery({
    queryKey: ['feed', category ?? 'all', cursor ?? null, limit],
    queryFn: ({ signal }) =>
      fetchFeed({
        category,
        cursor,
        limit,
        signal,
      }),
    staleTime: 5_000,
    gcTime: 60_000,
    retry: 1,
    enabled,
    refetchInterval: refetchIntervalMs,
    refetchIntervalInBackground: false,
  })
}
