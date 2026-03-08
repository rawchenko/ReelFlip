import { ActivityEvent } from '@/features/activity/types'
import { Platform } from 'react-native'

export interface ActivityRequestParams {
  walletAddress: string
  days?: number
  cursor?: string
  signal?: AbortSignal
}

export interface ActivityClientResponse {
  events: ActivityEvent[]
  nextCursor: string | null
}

interface ActivityErrorEnvelope {
  error?: {
    code?: string
    message?: string
  }
}

interface ActivityEventApiLeg {
  mint: string
  symbol: string
  amount: string
  direction: 'in' | 'out'
}

interface ActivityEventApiResponse {
  id: string
  txid: string
  timestamp: string
  status: 'confirmed' | 'failed'
  kind: 'swap' | 'transfer'
  primary: ActivityEventApiLeg
  secondary?: ActivityEventApiLeg
  counterparty?: { address: string; label?: string }
}

interface ActivityApiPayload {
  events?: ActivityEventApiResponse[]
  nextCursor?: string
}

const DEFAULT_ANDROID_API_URL = 'http://10.0.2.2:3001'
const DEFAULT_IOS_API_URL = 'http://127.0.0.1:3001'

function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL
  if (configured && configured.length > 0) {
    return configured
  }

  return Platform.OS === 'android' ? DEFAULT_ANDROID_API_URL : DEFAULT_IOS_API_URL
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

export async function fetchActivity(params: ActivityRequestParams): Promise<ActivityClientResponse> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const searchParams = new URLSearchParams()

  searchParams.set('walletAddress', params.walletAddress)

  if (typeof params.days === 'number') {
    searchParams.set('days', String(params.days))
  }

  if (params.cursor) {
    searchParams.set('cursor', params.cursor)
  }

  const queryString = searchParams.toString()
  const url = `${baseUrl}/v1/activity${queryString ? `?${queryString}` : ''}`

  const response = await fetch(url, {
    method: 'GET',
    signal: params.signal,
    headers: {
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    let message = `Activity request failed with status ${response.status}`

    try {
      const payload = (await response.json()) as ActivityErrorEnvelope
      if (payload.error?.message) {
        message = payload.error.message
      }
    } catch {
      // Keep fallback message when error payload is not JSON.
    }

    throw new Error(message)
  }

  const payload = (await response.json()) as ActivityApiPayload
  if (!Array.isArray(payload.events)) {
    throw new Error('Activity response is missing events array')
  }

  const events = payload.events.map(mapApiEventToActivityEvent)

  return {
    events,
    nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
  }
}

function mapApiEventToActivityEvent(apiEvent: ActivityEventApiResponse): ActivityEvent {
  const primaryText = buildPrimaryText(apiEvent)
  const secondaryText = buildSecondaryText(apiEvent)

  if (apiEvent.kind === 'transfer') {
    const direction = apiEvent.primary.direction === 'in' ? ('receive' as const) : ('send' as const)
    const sign = direction === 'receive' ? '+' : '-'
    return {
      id: apiEvent.id,
      timestampIso: apiEvent.timestamp,
      source: 'jupiter',
      type: 'transfer',
      status: apiEvent.status,
      primaryText,
      secondaryText,
      receivedLeg: {
        symbol: apiEvent.primary.symbol,
        amountDisplay: `${sign}${formatAmount(apiEvent.primary.amount)} ${apiEvent.primary.symbol}`,
        direction,
      },
      txSignature: apiEvent.txid,
    }
  }

  const receivedLeg = resolveReceivedLeg(apiEvent)
  const sentLeg = resolveSentLeg(apiEvent)

  return {
    id: apiEvent.id,
    timestampIso: apiEvent.timestamp,
    source: 'jupiter',
    type: 'swap',
    status: apiEvent.status,
    primaryText,
    secondaryText,
    receivedLeg,
    sentLeg,
    txSignature: apiEvent.txid,
  }
}

function resolveReceivedLeg(apiEvent: ActivityEventApiResponse) {
  const inLeg =
    apiEvent.primary.direction === 'in'
      ? apiEvent.primary
      : apiEvent.secondary?.direction === 'in'
        ? apiEvent.secondary
        : apiEvent.primary

  return {
    symbol: inLeg.symbol,
    amountDisplay: `+${formatAmount(inLeg.amount)} ${inLeg.symbol}`,
    direction: 'receive' as const,
  }
}

function resolveSentLeg(apiEvent: ActivityEventApiResponse) {
  const outLeg =
    apiEvent.primary.direction === 'out'
      ? apiEvent.primary
      : apiEvent.secondary?.direction === 'out'
        ? apiEvent.secondary
        : undefined

  if (!outLeg) return undefined

  return {
    symbol: outLeg.symbol,
    amountDisplay: `-${formatAmount(outLeg.amount)} ${outLeg.symbol}`,
    direction: 'send' as const,
  }
}

function buildPrimaryText(apiEvent: ActivityEventApiResponse): string {
  if (apiEvent.kind === 'swap') {
    const inLeg =
      apiEvent.primary.direction === 'in' ? apiEvent.primary : apiEvent.secondary
    return inLeg ? `+${formatAmount(inLeg.amount)} ${inLeg.symbol}` : apiEvent.kind
  }

  const dirLabel = apiEvent.primary.direction === 'in' ? 'Received' : 'Sent'
  return `${dirLabel} ${formatAmount(apiEvent.primary.amount)} ${apiEvent.primary.symbol}`
}

function buildSecondaryText(apiEvent: ActivityEventApiResponse): string {
  if (apiEvent.kind === 'swap') {
    const outLeg =
      apiEvent.primary.direction === 'out' ? apiEvent.primary : apiEvent.secondary
    return outLeg ? `-${formatAmount(outLeg.amount)} ${outLeg.symbol}` : ''
  }

  if (apiEvent.counterparty?.address) {
    const label = apiEvent.counterparty.label ?? truncateAddress(apiEvent.counterparty.address)
    return apiEvent.primary.direction === 'in' ? `From ${label}` : `To ${label}`
  }

  return ''
}

function formatAmount(amount: string): string {
  const num = Number(amount)
  if (Number.isNaN(num)) return amount

  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  if (num >= 1) return num.toFixed(2)
  if (num >= 0.001) return num.toFixed(4)
  return num.toFixed(6)
}

function truncateAddress(address: string): string {
  if (address.length <= 8) return address
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}
