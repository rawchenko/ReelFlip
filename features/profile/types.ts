export interface PortfolioAsset {
  mint: string
  symbol: string
  name: string
  balance: number
  balanceFormatted: string
  usdValue: number
  usdChange: number
  changePercent: number
  iconColor: string
  /** Optional second color for gradient icons */
  iconColorEnd?: string
}

export interface WatchlistItem {
  mint: string
  symbol: string
  name: string
  changePercent: number
  iconColor: string
  iconColorEnd?: string
}

export interface AllocationSegment {
  symbol: string
  proportion: number
  color: string
}

export type ProfileTab = 'assets' | 'watchlist'
