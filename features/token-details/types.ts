export type ChartTimeRange = '1H' | '1D' | '1W' | '1M' | 'YTD' | 'ALL'

export interface TokenActivityEvent {
  id: string
  type: 'buy' | 'sell'
  title: string
  date: string
  amount: string
  valueUsd: string
}
