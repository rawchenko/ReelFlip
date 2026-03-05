export type ChartInterval = '1m' | '1s'

export interface ChartPoint {
  time: number
  value: number
}

export type ChartStreamStatus = 'live' | 'delayed' | 'reconnecting' | 'fallback_polling'
export type ChartHistoryQuality = 'real_backfill' | 'runtime_only' | 'partial' | 'unavailable'

export interface ChartHistoryResponse {
  pairAddress: string
  interval: ChartInterval
  generatedAt: string
  source: string
  delayed: boolean
  historyQuality?: ChartHistoryQuality
  points: ChartPoint[]
}

export interface ChartBatchHistoryPairResult {
  pairAddress: string
  delayed: boolean
  status: ChartStreamStatus
  source: string
  historyQuality: ChartHistoryQuality
  points: ChartPoint[]
}

export interface ChartBatchHistoryResponse {
  interval: ChartInterval
  generatedAt: string
  results: ChartBatchHistoryPairResult[]
}

export type ChartStreamEvent =
  | {
      type: 'snapshot'
      pairAddress: string
      interval: ChartInterval
      delayed: boolean
      points: ChartPoint[]
      serverTime: string
    }
  | {
      type: 'point_update'
      pairAddress: string
      interval: ChartInterval
      delayed: boolean
      point: ChartPoint
      isNewPoint: boolean
      serverTime: string
    }
  | {
      type: 'status'
      pairAddress: string
      status: ChartStreamStatus
      reason?: string
      serverTime: string
    }
  | {
      type: 'heartbeat'
      serverTime: string
    }
