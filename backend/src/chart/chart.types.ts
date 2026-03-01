export type ChartInterval = '1m' | '1s'

export interface ChartTickSample {
  pairAddress: string
  observedAtMs: number
  priceUsd: number
  volume24h?: number
}

export interface OhlcCandle {
  timeSec: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface ChartCandleDto {
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
  candles: ChartCandleDto[]
}

export interface ChartBatchHistoryPairResult {
  pairAddress: string
  delayed: boolean
  status: ChartStreamStatus
  source: string
  historyQuality: ChartHistoryQuality
  candles: ChartCandleDto[]
}

export interface ChartBatchHistoryResponse {
  interval: ChartInterval
  generatedAt: string
  results: ChartBatchHistoryPairResult[]
}

export interface ChartProvider {
  fetchPairSnapshots(pairAddresses: string[], signal: AbortSignal): Promise<ChartTickSample[]>
}

export type ChartStreamEvent =
  | {
      type: 'candle_update'
      pairAddress: string
      interval: ChartInterval
      delayed: boolean
      candle: ChartCandleDto
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
      type: 'snapshot'
      pairAddress: string
      interval: ChartInterval
      delayed: boolean
      candles: ChartCandleDto[]
      serverTime: string
    }
  | {
      type: 'heartbeat'
      serverTime: string
    }

export function toChartCandleDto(candle: OhlcCandle): ChartCandleDto {
  return {
    time: candle.timeSec,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    ...(candle.volume !== undefined ? { volume: candle.volume } : {}),
  }
}

export function fromChartCandleDto(candle: ChartCandleDto): OhlcCandle {
  return {
    timeSec: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    ...(candle.volume !== undefined ? { volume: candle.volume } : {}),
  }
}
