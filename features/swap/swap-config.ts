import type { SwapCounterAssetSymbol } from '@/features/swap/types'

const SKR_MINT = process.env.EXPO_PUBLIC_SWAP_SKR_MINT?.trim() ?? ''

export function isSwapAssetEnabled(symbol: SwapCounterAssetSymbol): boolean {
  if (symbol === 'SKR') {
    return SKR_MINT.length > 0
  }

  return true
}

export function isSwapChainSupported(chain: string | null | undefined): boolean {
  return chain === 'solana:mainnet'
}
