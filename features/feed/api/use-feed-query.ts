import { FeedCategory } from '@/features/feed/types'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { FeedResponse, fetchFeed } from './feed-client'

interface UseFeedQueryOptions {
  category?: FeedCategory
  minLifetimeHours?: number
  cursor?: string
  limit?: number
  refetchIntervalMs?: number
  enabled?: boolean
}

interface UseInfiniteFeedQueryOptions {
  category?: FeedCategory
  minLifetimeHours?: number
  limit?: number
  enabled?: boolean
}

export function getFeedInfiniteQueryKey(category?: FeedCategory, minLifetimeHours?: number, limit = 20) {
  return ['feed-infinite', category ?? 'all', minLifetimeHours ?? null, limit] as const
}

export function useFeedQuery(options: UseFeedQueryOptions = {}) {
  const { category, minLifetimeHours, cursor, limit = 20, refetchIntervalMs = 5_000, enabled = true } = options

  return useQuery({
    queryKey: ['feed', category ?? 'all', minLifetimeHours ?? null, cursor ?? null, limit],
    queryFn: ({ signal }) =>
      fetchFeed({
        category,
        minLifetimeHours,
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

export function useInfiniteFeedQuery(options: UseInfiniteFeedQueryOptions = {}) {
  const { category, minLifetimeHours, limit = 20, enabled = true } = options

  const query = useInfiniteQuery({
    queryKey: getFeedInfiniteQueryKey(category, minLifetimeHours, limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      fetchFeed({
        category,
        minLifetimeHours,
        cursor: pageParam,
        limit,
        signal,
      }),
    getNextPageParam: (lastPage: FeedResponse) => lastPage.nextCursor ?? undefined,
    staleTime: 5_000,
    gcTime: 5 * 60_000,
    retry: 1,
    enabled,
    maxPages: 25,
  })

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data?.pages])

  return {
    ...query,
    items,
  }
}
