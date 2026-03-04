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

export function createActivityDataSource(): ActivityDataSource {
  const mockEnabled = process.env.EXPO_PUBLIC_ACTIVITY_DEV_MOCK === 'true'
  return mockEnabled ? createMockDataSource() : createEmptyDataSource()
}

