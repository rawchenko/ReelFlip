import type { AllocationSegment, PortfolioAsset, WatchlistItem } from '@/features/profile/types'

export const MOCK_TOTAL_BALANCE = 2847.63
export const MOCK_TOTAL_CHANGE_PERCENT = 1.14

export const MOCK_ASSETS: PortfolioAsset[] = [
  {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    balance: 12.43,
    balanceFormatted: '12.43 SOL',
    usdValue: 1842.1,
    usdChange: 24.3,
    changePercent: 1.34,
    iconColor: '#9945FF',
    iconColorEnd: '#19FB9B',
  },
  {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    balance: 428.12,
    balanceFormatted: '428.12 USDC',
    usdValue: 428.12,
    usdChange: 0,
    changePercent: 0,
    iconColor: '#2775CA',
  },
  {
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    symbol: 'BONK',
    name: 'Bonk',
    balance: 1245800,
    balanceFormatted: '1,245,800 BONK',
    usdValue: 577.41,
    usdChange: 7.88,
    changePercent: 1.38,
    iconColor: '#F5A623',
  },
]

export const MOCK_ALLOCATION: AllocationSegment[] = [
  { symbol: 'SOL', proportion: 64.7, color: '#9945FF' },
  { symbol: 'USDC', proportion: 15, color: '#2775CA' },
  { symbol: 'BONK', proportion: 20.3, color: '#F5A623' },
]

export const MOCK_WATCHLIST: WatchlistItem[] = [
  {
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    symbol: 'JUP',
    name: 'Jupiter',
    changePercent: -3.21,
    iconColor: '#2775CA',
    iconColorEnd: '#19FB9B',
  },
  {
    mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    symbol: 'RAY',
    name: 'Raydium',
    changePercent: 5.74,
    iconColor: '#9945FF',
    iconColorEnd: '#2775CA',
  },
  {
    mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    symbol: 'WIF',
    name: 'dogwifhat',
    changePercent: 12.08,
    iconColor: '#F5A623',
  },
]
