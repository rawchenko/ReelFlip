import { fetchActivity } from '@/features/activity/api/activity-client'
import { createMockActivityEvents } from '@/features/activity/mock-activity'
import { ActivityDataSource, ActivityListParams } from '@/features/activity/types'

function createEmptyDataSource(): ActivityDataSource {
  return {
    mode: 'empty',
    list: async (_params: ActivityListParams) => [],
  }
}

function createMockDataSource(): ActivityDataSource {
  return {
    mode: 'mock',
    list: async (_params: ActivityListParams) => createMockActivityEvents(),
  }
}

function createLiveDataSource(): ActivityDataSource {
  return {
    mode: 'live',
    list: async (params: ActivityListParams) => {
      const response = await fetchActivity({
        walletAddress: params.walletAddress,
        signal: params.signal,
      })
      return response.events
    },
  }
}

export function createActivityDataSource(): ActivityDataSource {
  const mockEnabled = process.env.EXPO_PUBLIC_ACTIVITY_DEV_MOCK === 'true'
  if (mockEnabled) return createMockDataSource()
  return createLiveDataSource()
}
