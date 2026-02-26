export interface ChartCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type ChartStreamStatus = 'live' | 'delayed' | 'reconnecting'

export interface ChartHistoryResponse {
  pairAddress: string
  interval: '1m'
  generatedAt: string
  source: 'dexscreener'
  delayed: boolean
  candles: ChartCandle[]
}

export type ChartStreamEvent =
  | {
      type: 'snapshot'
      pairAddress: string
      interval: '1m'
      delayed: boolean
      candles: ChartCandle[]
      serverTime: string
    }
  | {
      type: 'candle_update'
      pairAddress: string
      interval: '1m'
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
