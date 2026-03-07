import Constants from 'expo-constants'
import { Platform } from 'react-native'
import type {
  SwapDraft,
  SwapQuoteAdapter,
  SwapQuotePreview,
  TradeBuildResponse,
  TradeStatusResponse,
  TradeSubmitResponse,
} from '@/features/swap/types'

interface ErrorEnvelope {
  error?: {
    code?: string
    message?: string
  }
}

const FETCH_TIMEOUT_MS = 15_000

function createTimeoutSignal(): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return controller.signal
}

const DEFAULT_ANDROID_API_URL = 'http://10.0.2.2:3001'
const DEFAULT_IOS_API_URL = 'http://127.0.0.1:3001'
const DEFAULT_API_PORT = '3001'
const LOCAL_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

function getHostFromUri(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  try {
    const candidate = trimmed.includes('://') ? trimmed : `http://${trimmed}`
    return new URL(candidate).hostname
  } catch {
    return null
  }
}

function getExpoDevHost(): string | null {
  const candidates = [Constants.expoConfig?.hostUri, Constants.platform?.hostUri, Constants.linkingUri]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      continue
    }

    const host = getHostFromUri(candidate)
    if (!host) {
      continue
    }

    if (Platform.OS === 'android' && LOCAL_HOSTS.has(host)) {
      return '10.0.2.2'
    }

    return host
  }

  return null
}

function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL
  if (configured && configured.length > 0) {
    return configured
  }

  const expoDevHost = getExpoDevHost()
  if (expoDevHost) {
    return `http://${expoDevHost}:${DEFAULT_API_PORT}`
  }

  return Platform.OS === 'android' ? DEFAULT_ANDROID_API_URL : DEFAULT_IOS_API_URL
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ErrorEnvelope
    if (payload.error?.message) {
      return payload.error.message
    }
  } catch {
    // ignore JSON parse issues for error payloads
  }

  return fallback
}

function normalizeUiAmount(amountText: string, amount: number): string {
  const trimmed = amountText.trim()
  if (trimmed.length > 0) {
    const normalized = trimmed.startsWith('.') ? `0${trimmed}` : trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed

    if (/^\d+(\.\d+)?$/.test(normalized)) {
      return normalized
    }
  }

  return String(amount)
}

export async function fetchSwapQuote(input: { draft: SwapDraft; walletAddress: string }): Promise<SwapQuotePreview> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const response = await fetch(`${baseUrl}/v1/quotes`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      payAssetSymbol: input.draft.counterAssetSymbol,
      side: input.draft.side,
      slippageBps: input.draft.slippageBps,
      tokenMint: input.draft.token.mint,
      uiAmount: normalizeUiAmount(input.draft.amountText, input.draft.amount),
      wallet: input.walletAddress,
    }),
    signal: createTimeoutSignal(),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Quote request failed with status ${response.status}`))
  }

  return (await response.json()) as SwapQuotePreview
}

export async function buildTrade(input: { quoteId: string; walletAddress: string }): Promise<TradeBuildResponse> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const response = await fetch(`${baseUrl}/v1/trades/build`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      quoteId: input.quoteId,
      wallet: input.walletAddress,
    }),
    signal: createTimeoutSignal(),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Trade build failed with status ${response.status}`))
  }

  return (await response.json()) as TradeBuildResponse
}

export async function submitTrade(input: {
  signedTxBase64: string
  tradeIntentId: string
  idempotencyKey: string
}): Promise<TradeSubmitResponse> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const response = await fetch(`${baseUrl}/v1/trades/submit`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      idempotencyKey: input.idempotencyKey,
      signedTxBase64: input.signedTxBase64,
      tradeIntentId: input.tradeIntentId,
    }),
    signal: createTimeoutSignal(),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Trade submit failed with status ${response.status}`))
  }

  return (await response.json()) as TradeSubmitResponse
}

export async function fetchTradeStatus(tradeId: string): Promise<TradeStatusResponse> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const response = await fetch(`${baseUrl}/v1/trades/${encodeURIComponent(tradeId)}/status`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
    signal: createTimeoutSignal(),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Trade status failed with status ${response.status}`))
  }

  return (await response.json()) as TradeStatusResponse
}

export const apiSwapQuoteAdapter: SwapQuoteAdapter = {
  buildTrade,
  async getQuote(input) {
    return fetchSwapQuote(input)
  },
  async getTradeStatus(tradeId) {
    return fetchTradeStatus(tradeId)
  },
  async submitTrade(input) {
    return submitTrade(input)
  },
}
