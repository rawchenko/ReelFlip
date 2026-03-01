export type ChartInterval = '1m' | '1s'

export interface ChartCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
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
  candles: ChartCandle[]
}

export interface ChartBatchHistoryPairResult {
  pairAddress: string
  delayed: boolean
  status: ChartStreamStatus
  source: string
  historyQuality: ChartHistoryQuality
  candles: ChartCandle[]
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
      candles: ChartCandle[]
      serverTime: string
    }
  | {
      type: 'candle_update'
      pairAddress: string
      interval: ChartInterval
      delayed: boolean
      candle: ChartCandle
      isNewCandle: boolean
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
