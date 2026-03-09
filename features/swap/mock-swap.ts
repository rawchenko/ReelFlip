import { semanticColors } from '@/constants/semantic-colors'
import type { OnboardingSlippage } from '@/features/onboarding/onboarding-provider'
import type {
  SwapAssetOption,
  SwapCounterAssetSymbol,
  SwapDraft,
  SwapFlowPayload,
  SwapQuoteAdapter,
  SwapQuoteAssetView,
  SwapQuotePreview,
  TradeBuildResponse,
  TradeStatusResponse,
  TradeSubmitResponse,
} from '@/features/swap/types'
import { isSwapAssetEnabled } from '@/features/swap/swap-config'

const QUOTE_REFRESH_WINDOW_SEC = 12
const DEFAULT_QUOTE_NOTIONAL_USD = 200
const DEFAULT_SLIPPAGE_BPS = 50
const MIN_SLIPPAGE_BPS = 25
const MAX_SLIPPAGE_BPS = 300
const DEFAULT_NETWORK_FEE_SOL = 0.003
const TOKEN_BALANCE_MIN = 4_000
const TOKEN_BALANCE_RANGE = 14_000

const COUNTER_ASSET_IMAGE_URIS: Record<SwapCounterAssetSymbol, string> = {
  SKR: 'https://raw.githubusercontent.com/nicksenger/solana-token-list/master/assets/mainnet/skrkVDTozAeRMvEEGacVoaTVBAv3v5VpbJ5MFaBZe5u/logo.png',
  SOL: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  USDC: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
}

const COUNTER_ASSET_OPTIONS: Record<SwapCounterAssetSymbol, SwapAssetOption> = {
  SKR: {
    badgeColor: semanticColors.assetBadge.skr,
    badgeText: 'K',
    balance: 1_244,
    name: 'Shark',
    priceUsd: 1.86,
    symbol: 'SKR',
  },
  SOL: {
    badgeColor: semanticColors.assetBadge.sol,
    badgeText: 'S',
    balance: 4.82,
    name: 'Solana',
    priceUsd: 190,
    symbol: 'SOL',
  },
  USDC: {
    badgeColor: semanticColors.assetBadge.usdc,
    badgeText: '$',
    balance: 428.12,
    name: 'USD Coin',
    priceUsd: 1,
    symbol: 'USDC',
  },
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function stableHash(input: string): number {
  let value = 0
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 31 + input.charCodeAt(index)) % 1_000_003
  }
  return value
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function normalizeTokenPrice(priceUsd: number): number {
  if (Number.isFinite(priceUsd) && priceUsd > 0) {
    return priceUsd
  }

  return 0.01
}

function getMockTokenBalance(symbol: string, mint: string, priceUsd: number): number {
  const notionalTargetUsd = DEFAULT_QUOTE_NOTIONAL_USD + (stableHash(mint) % 120)
  const baseFromUsd = notionalTargetUsd / normalizeTokenPrice(priceUsd)
  const paddedBalance = TOKEN_BALANCE_MIN + (stableHash(`${symbol}:${mint}`) % TOKEN_BALANCE_RANGE)
  return roundTo(Math.max(baseFromUsd * 1.35, paddedBalance), 2)
}

function getTokenAssetView(
  draft: SwapDraft,
  amount: number,
  usdValue: number,
): SwapQuoteAssetView {
  return {
    amount,
    badgeColor: semanticColors.assetBadge.default,
    badgeText: draft.token.symbol.slice(0, 1).toUpperCase(),
    balance: getMockTokenBalance(draft.token.symbol, draft.token.mint, draft.token.priceUsd),
    imageUri: draft.token.imageUri ?? `https://tokens.jup.ag/token/${draft.token.mint}/icon`,
    name: draft.token.name,
    priceUsd: normalizeTokenPrice(draft.token.priceUsd),
    symbol: draft.token.symbol,
    usdValue,
  }
}

function getCounterAsset(symbol: SwapCounterAssetSymbol): SwapAssetOption {
  return COUNTER_ASSET_OPTIONS[symbol]
}

function buildQuoteId(draft: SwapDraft): string {
  return `qt_${stableHash(`${draft.token.mint}:${draft.side}:${draft.counterAssetSymbol}:${draft.amountText}:${draft.slippageBps}`)}`
}

function buildSignature(draft: SwapDraft): string {
  const hash = stableHash(`${draft.token.mint}:${draft.side}:${draft.counterAssetSymbol}:${draft.attemptCount}:${draft.slippageBps}`)
    .toString(36)
    .toUpperCase()
    .padStart(10, '0')
  return `${hash.slice(0, 5)}...${hash.slice(-4)}`
}

function createSuccessShareText(quote: SwapQuotePreview): string {
  return `Swapped ${formatAmount(quote.inputAsset.amount, quote.inputAsset.symbol)} ${quote.inputAsset.symbol} for ${formatAmount(quote.outputAsset.amount, quote.outputAsset.symbol)} ${quote.outputAsset.symbol} on ReelFlip.`
}

function formatAmount(amount: number, symbol: string): string {
  const decimals = symbol === 'USDC' ? 2 : amount >= 1_000 ? 0 : amount >= 10 ? 2 : 4
  return roundTo(amount, decimals).toLocaleString('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals === 0 ? 0 : 2,
  })
}

export function createSwapDraft(payload: SwapFlowPayload): SwapDraft {
  const side = payload.side
  const defaultCounterAssetSymbol: SwapCounterAssetSymbol = 'USDC'
  const tokenPriceUsd = normalizeTokenPrice(payload.item.priceUsd)
  const tokenAmount = roundTo(DEFAULT_QUOTE_NOTIONAL_USD / tokenPriceUsd, tokenPriceUsd >= 1 ? 2 : 0)
  const amount = side === 'buy' ? DEFAULT_QUOTE_NOTIONAL_USD : tokenAmount

  return {
    amount,
    amountText: String(roundTo(amount, side === 'buy' ? 0 : 0)),
    attemptCount: 0,
    counterAssetSymbol: defaultCounterAssetSymbol,
    origin: payload.origin,
    side,
    slippageBps: DEFAULT_SLIPPAGE_BPS,
    token: payload.item,
  }
}

export function getCounterAssetOptions(): SwapAssetOption[] {
  return Object.values(COUNTER_ASSET_OPTIONS).filter((option) => isSwapAssetEnabled(option.symbol as SwapCounterAssetSymbol))
}

export function parseAmountInput(value: string): number {
  const normalized = value.replace(/,/g, '.').replace(/[^\d.]/g, '')
  if (normalized.trim().length === 0) {
    return 0
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }

  return parsed
}

export function normalizeAmountInput(value: string): string {
  return value.replace(/,/g, '.').replace(/[^\d.]/g, '')
}

export function clampSlippageBps(slippageBps: number): number {
  return clamp(Math.round(slippageBps), MIN_SLIPPAGE_BPS, MAX_SLIPPAGE_BPS)
}

export function slippagePreferenceToBps(
  preference: OnboardingSlippage | undefined,
  customBps?: number,
): number {
  switch (preference) {
    case '1%':
      return 100
    case '2%':
      return 200
    case 'custom':
      return clampSlippageBps(customBps ?? 100)
    case 'auto':
    default:
      return 100
  }
}

export function buildMockQuote(draft: SwapDraft): SwapQuotePreview {
  const amount = Number.isFinite(draft.amount) && draft.amount > 0 ? draft.amount : 0
  const counterAsset = getCounterAsset(draft.counterAssetSymbol)
  const tokenPriceUsd = normalizeTokenPrice(draft.token.priceUsd)
  const inputUsdValue = amount * (draft.side === 'buy' ? counterAsset.priceUsd : tokenPriceUsd)
  const marketStress = (stableHash(draft.token.symbol) % 18) / 100
  const sizePressure = clamp(inputUsdValue / 3_500, 0, 0.55)
  const priceImpactPct = roundTo(0.24 + marketStress + sizePressure, 2)
  const platformFeeUsd = roundTo(Math.max(0.22, inputUsdValue * 0.0059), 2)
  const networkFeeUsd = roundTo(DEFAULT_NETWORK_FEE_SOL * COUNTER_ASSET_OPTIONS.SOL.priceUsd, 2)
  const outputUsdAfterFees = Math.max(inputUsdValue - platformFeeUsd - networkFeeUsd, 0)
  const outputUsdNet = outputUsdAfterFees * (1 - priceImpactPct / 100)
  const outputAmount =
    draft.side === 'buy'
      ? outputUsdNet / tokenPriceUsd
      : outputUsdNet / getCounterAsset(draft.counterAssetSymbol).priceUsd
  const slippageFactor = 1 - clampSlippageBps(draft.slippageBps) / 10_000
  const minimumReceived = outputAmount * slippageFactor

  const inputAsset =
    draft.side === 'buy'
      ? {
        amount,
        badgeColor: counterAsset.badgeColor,
        badgeText: counterAsset.badgeText,
        balance: counterAsset.balance,
        imageUri: COUNTER_ASSET_IMAGE_URIS[draft.counterAssetSymbol],
        name: counterAsset.name,
        priceUsd: counterAsset.priceUsd,
        symbol: counterAsset.symbol,
        usdValue: inputUsdValue,
      }
      : getTokenAssetView(draft, amount, inputUsdValue)

  const outputAsset =
    draft.side === 'buy'
      ? getTokenAssetView(draft, outputAmount, outputUsdNet)
      : {
        amount: outputAmount,
        badgeColor: counterAsset.badgeColor,
        badgeText: counterAsset.badgeText,
        balance: counterAsset.balance,
        imageUri: COUNTER_ASSET_IMAGE_URIS[draft.counterAssetSymbol],
        name: counterAsset.name,
        priceUsd: counterAsset.priceUsd,
        symbol: counterAsset.symbol,
        usdValue: outputUsdNet,
      }

  return {
    exchangeRate: inputAsset.amount > 0 ? outputAsset.amount / inputAsset.amount : 0,
    expiresAt: new Date(Date.now() + QUOTE_REFRESH_WINDOW_SEC * 1_000).toISOString(),
    inputAsset,
    minimumReceived,
    networkFeeSol: DEFAULT_NETWORK_FEE_SOL,
    networkFeeUsd,
    outputAsset,
    platformFeeUsd,
    priceImpactPct,
    providerLabel: 'Jupiter',
    quoteId: buildQuoteId(draft),
    refreshWindowSec: QUOTE_REFRESH_WINDOW_SEC,
    routeLabel: draft.side === 'buy' ? 'Best route via Jupiter' : 'Routed via Jupiter liquidity',
    slippageBps: clampSlippageBps(draft.slippageBps),
  }
}

export const mockSwapQuoteAdapter: SwapQuoteAdapter = {
  async buildTrade(): Promise<TradeBuildResponse> {
    await new Promise((resolve) => setTimeout(resolve, 240))
    return {
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      tradeIntentId: 'ti_mock',
      unsignedTxBase64: 'bW9jaw==',
    }
  },
  async getQuote({ draft }) {
    await new Promise((resolve) => setTimeout(resolve, 180))
    return buildMockQuote(draft)
  },
  async getTradeStatus(): Promise<TradeStatusResponse> {
    await new Promise((resolve) => setTimeout(resolve, 240))
    return {
      signature: 'MOCKSIG',
      status: 'confirmed',
      tradeId: 'tr_mock',
    }
  },
  async submitTrade(): Promise<TradeSubmitResponse> {
    await new Promise((resolve) => setTimeout(resolve, 240))
    return {
      signature: 'MOCKSIG',
      status: 'submitted',
      tradeId: 'tr_mock',
    }
  },
}

export function buildMockSuccessResult(draft: SwapDraft, quote: SwapQuotePreview) {
  return {
    kind: 'success' as const,
    receivedAmount: quote.outputAsset.amount,
    receivedSymbol: quote.outputAsset.symbol,
    sentAmount: quote.inputAsset.amount,
    sentSymbol: quote.inputAsset.symbol,
    shareText: createSuccessShareText(quote),
    signature: buildSignature(draft),
    statusLabel: 'Confirmed',
    tradeId: 'tr_mock',
  }
}
