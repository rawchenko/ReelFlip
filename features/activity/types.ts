export type ActivityEventType = 'swap' | 'transfer'
export type ActivityEventSource = 'jupiter' | 'unknown'
export type ActivityLegDirection = 'receive' | 'send'

export interface ActivityLeg {
  symbol: string
  amountDisplay: string
  direction: ActivityLegDirection
  iconUri?: string
}

export interface ActivityEvent {
  id: string
  timestampIso: string
  source: ActivityEventSource
  type: ActivityEventType
  primaryText: string
  secondaryText: string
  receivedLeg: ActivityLeg
  sentLeg?: ActivityLeg
  txSignature?: string
}

export interface ActivitySection {
  dateKey: string
  label: string
  items: ActivityEvent[]
}

export interface ActivityListParams {
  walletAddress: string
  signal?: AbortSignal
}

export interface ActivityDataSource {
  mode: 'empty' | 'mock' | 'live'
  list: (params: ActivityListParams) => Promise<ActivityEvent[]>
}
