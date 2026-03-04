import { groupActivityEventsByDate } from '@/features/activity/activity-formatters'
import { createActivityDataSource } from '@/features/activity/activity-data-source'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

const activityDataSource = createActivityDataSource()

export function useActivityQuery(walletAddress: string | null | undefined) {
  const query = useQuery({
    queryKey: ['activity', walletAddress ?? 'disconnected', activityDataSource.mode],
    queryFn: ({ signal }) =>
      activityDataSource.list({
        walletAddress: walletAddress ?? '',
        signal,
      }),
    enabled: Boolean(walletAddress),
    staleTime: 5_000,
    gcTime: 60_000,
    retry: 1,
  })

  const sections = useMemo(() => groupActivityEventsByDate(query.data ?? []), [query.data])

  return {
    ...query,
    sections,
    sourceMode: activityDataSource.mode,
  }
}
