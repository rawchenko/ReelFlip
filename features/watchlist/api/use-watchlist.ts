import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { useAuth } from '@/features/auth/use-auth'
import { addToWatchlist, fetchWatchlist, removeFromWatchlist } from './watchlist-client'

function getWatchlistQueryKey(walletAddress: string | null) {
  return ['watchlist', walletAddress ?? 'disconnected'] as const
}

export function useWatchlistQuery(options?: { enabled?: boolean }) {
  const { account } = useMobileWallet()
  const { isAuthenticated } = useAuth()
  const walletAddress = useMemo(() => account?.address?.toString() ?? null, [account])

  return useQuery({
    queryKey: getWatchlistQueryKey(walletAddress),
    queryFn: fetchWatchlist,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
    enabled: Boolean(walletAddress) && isAuthenticated && (options?.enabled ?? true),
  })
}

export function useWatchlistMutations() {
  const { account } = useMobileWallet()
  const walletAddress = useMemo(() => account?.address?.toString() ?? null, [account])
  const watchlistQueryKey = getWatchlistQueryKey(walletAddress)
  const queryClient = useQueryClient()

  const add = useMutation({
    mutationFn: (mint: string) => addToWatchlist(mint),
    onMutate: async (mint) => {
      await queryClient.cancelQueries({ queryKey: watchlistQueryKey })
      const previous = queryClient.getQueryData<string[]>(watchlistQueryKey)
      queryClient.setQueryData<string[]>(watchlistQueryKey, (old) => {
        if (!old) return [mint]
        return old.includes(mint) ? old : [...old, mint]
      })
      return { previous }
    },
    onError: (_error, _mint, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(watchlistQueryKey, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: watchlistQueryKey })
    },
  })

  const remove = useMutation({
    mutationFn: (mint: string) => removeFromWatchlist(mint),
    onMutate: async (mint) => {
      await queryClient.cancelQueries({ queryKey: watchlistQueryKey })
      const previous = queryClient.getQueryData<string[]>(watchlistQueryKey)
      queryClient.setQueryData<string[]>(watchlistQueryKey, (old) => (old ? old.filter((m) => m !== mint) : []))
      return { previous }
    },
    onError: (_error, _mint, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(watchlistQueryKey, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: watchlistQueryKey })
    },
  })

  return { add, remove }
}

export function useWatchlistSet(): Set<string> {
  const { data } = useWatchlistQuery()
  return useMemo(() => new Set(data ?? []), [data])
}

export function useIsInWatchlist(mint: string): boolean {
  const watchlistSet = useWatchlistSet()
  return watchlistSet.has(mint)
}
