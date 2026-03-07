import { TradeAssetSymbol } from './trade.types.js'

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
    badgeColor: '#4ADE80',
    badgeText: 'K',
    defaultPriceUsd: 0,
    name: 'Shark',
    symbol: 'SKR',
  },
  SOL: {
    badgeColor: '#8B5CF6',
    badgeText: 'S',
    decimals: 9,
    defaultPriceUsd: 0,
    mint: 'So11111111111111111111111111111111111111112',
    name: 'Solana',
    symbol: 'SOL',
  },
  USDC: {
    badgeColor: '#2F80ED',
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
