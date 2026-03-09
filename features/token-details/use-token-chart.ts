import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchChartHistory } from '@/features/feed/api/chart-client'
import type { ChartPoint } from '@/features/feed/chart/types'
import type { ChartTimeRange } from '@/features/token-details/types'

interface TimeRangeConfig {
  interval: '1m'
  limit: number
}

// Note: backend only supports '1m' interval currently.
// 1M/YTD/ALL need a backend '1h' interval for proper resolution — post-MVP.
const TIME_RANGE_CONFIG: Record<ChartTimeRange, TimeRangeConfig> = {
  '1H': { interval: '1m', limit: 60 },
  '1D': { interval: '1m', limit: 360 },
  '1W': { interval: '1m', limit: 360 },
  '1M': { interval: '1m', limit: 360 },
  'YTD': { interval: '1m', limit: 360 },
  'ALL': { interval: '1m', limit: 360 },
}

interface UseTokenChartReturn {
  points: number[]
  loading: boolean
  error: string | null
  timeRange: ChartTimeRange
  setTimeRange: (range: ChartTimeRange) => void
}

export function useTokenChart(pairAddress: string | null | undefined): UseTokenChartReturn {
  const [points, setPoints] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<ChartTimeRange>('1H')
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async () => {
    if (!pairAddress) {
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const config = TIME_RANGE_CONFIG[timeRange]
      const response = await fetchChartHistory(pairAddress, {
        interval: config.interval,
        limit: config.limit,
        signal: controller.signal,
      })

      if (!controller.signal.aborted) {
        setPoints(response.points.map((p: ChartPoint) => p.value))
        setLoading(false)
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Failed to load chart')
        setLoading(false)
      }
    }
  }, [pairAddress, timeRange])

  useEffect(() => {
    void fetchData()

    return () => {
      abortRef.current?.abort()
    }
  }, [fetchData])

  return { points, loading, error, timeRange, setTimeRange }
}
