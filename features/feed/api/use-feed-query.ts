import { FeedCategory } from '@/features/feed/types'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { FeedResponse, fetchFeed } from './feed-client'

interface UseFeedQueryOptions {
  category?: FeedCategory
  minLifetimeHours?: number
  cursor?: string
  limit?: number
  mints?: string[]
  refetchIntervalMs?: number
  enabled?: boolean
}

interface UseInfiniteFeedQueryOptions {
  category?: FeedCategory
  minLifetimeHours?: number
  limit?: number
  mints?: string[]
  enabled?: boolean
}

export function getFeedInfiniteQueryKey(category?: FeedCategory, minLifetimeHours?: number, limit = 20, mints?: string[]) {
  return ['feed-infinite', category ?? 'all', minLifetimeHours ?? null, limit, mints ?? null] as const
}

export function useFeedQuery(options: UseFeedQueryOptions = {}) {
  const { category, minLifetimeHours, cursor, limit = 20, mints, refetchIntervalMs = 5_000, enabled = true } = options

  return useQuery({
    queryKey: ['feed', category ?? 'all', minLifetimeHours ?? null, cursor ?? null, limit, mints ?? null],
    queryFn: ({ signal }) =>
      fetchFeed({
        category,
        minLifetimeHours,
        cursor,
        limit,
        mints,
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
  const { category, minLifetimeHours, limit = 20, mints, enabled = true } = options

  const query = useInfiniteQuery({
    queryKey: getFeedInfiniteQueryKey(category, minLifetimeHours, limit, mints),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      fetchFeed({
        category,
        minLifetimeHours,
        cursor: pageParam,
        limit,
        mints,
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
