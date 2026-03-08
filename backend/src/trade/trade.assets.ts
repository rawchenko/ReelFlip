import { TradeAssetSymbol } from './trade.types.js'

/**
 * Centralised asset badge color map — single source of truth for all trade paths.
 */
export const ASSET_BADGE_COLORS: Record<string, string> = {
  SKR: '#4ADE80',
  SOL: '#8B5CF6',
  USDC: '#2F80ED',
} as const

export const DEFAULT_BADGE_COLOR = '#FACC15' as const

export function badgeColorForSymbol(symbol: string): string {
  return ASSET_BADGE_COLORS[symbol] ?? DEFAULT_BADGE_COLOR
}

interface TradeAssetRegistryOptions {
  skrMint?: string
}

interface TradeAssetConfig {
  badgeColor: string
  badgeText: string
  decimals?: number
  defaultPriceUsd: number
  mint?: string
  name: string
  symbol: TradeAssetSymbol
}

const TRADE_ASSET_CONFIGS: Record<TradeAssetSymbol, TradeAssetConfig> = {
  SKR: {
    badgeColor: ASSET_BADGE_COLORS.SKR,
    badgeText: 'K',
    defaultPriceUsd: 0,
    name: 'Shark',
    symbol: 'SKR',
  },
  SOL: {
    badgeColor: ASSET_BADGE_COLORS.SOL,
    badgeText: 'S',
    decimals: 9,
    defaultPriceUsd: 0,
    mint: 'So11111111111111111111111111111111111111112',
    name: 'Solana',
    symbol: 'SOL',
  },
  USDC: {
    badgeColor: ASSET_BADGE_COLORS.USDC,
    badgeText: '$',
    decimals: 6,
    defaultPriceUsd: 1,
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    name: 'USD Coin',
    symbol: 'USDC',
  },
}

export class TradeAssetRegistry {
  private readonly configs: Record<TradeAssetSymbol, TradeAssetConfig>

  constructor(options: TradeAssetRegistryOptions = {}) {
    this.configs = {
      ...TRADE_ASSET_CONFIGS,
      SKR: {
        ...TRADE_ASSET_CONFIGS.SKR,
        ...(options.skrMint ? { mint: options.skrMint } : {}),
      },
    }
  }

  get(symbol: TradeAssetSymbol): TradeAssetConfig {
    return this.configs[symbol]
  }

  isEnabled(symbol: TradeAssetSymbol): boolean {
    return typeof this.configs[symbol].mint === 'string' && this.configs[symbol].mint.trim().length > 0
  }

  getMint(symbol: TradeAssetSymbol): string {
    const value = this.configs[symbol].mint?.trim()
    if (!value) {
      throw new Error(`${symbol} is not configured for trading`)
    }
    return value
  }

  getSymbolFromMint(mint: string): TradeAssetSymbol | null {
    const normalized = mint.trim()
    const match = (Object.values(this.configs) as TradeAssetConfig[]).find((item) => item.mint === normalized)
    return match?.symbol ?? null
  }
}
