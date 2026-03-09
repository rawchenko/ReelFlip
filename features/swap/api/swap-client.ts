import { getApiBaseUrl, normalizeBaseUrl } from '@/utils/api-base-url'
import { getAuthToken } from '@/features/auth/auth-token-store'
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

function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { authorization: `Bearer ${token}` } : {}
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
      ...authHeaders(),
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
      ...authHeaders(),
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
      ...authHeaders(),
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
      ...authHeaders(),
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
