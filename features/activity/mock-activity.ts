import { ActivityEvent } from '@/features/activity/types'

interface MockSwapConfig {
  receive: string
  send: string
  receiveAmount: string
  sendAmount: string
  source?: 'jupiter' | 'unknown'
}

function withDaysAgo(baseDate: Date, daysAgo: number, hour: number, minute: number): string {
  const next = new Date(baseDate)
  next.setDate(next.getDate() - daysAgo)
  next.setHours(hour, minute, 0, 0)
  return next.toISOString()
}

function toSwapEvent(id: string, timestampIso: string, config: MockSwapConfig): ActivityEvent {
  return {
    id,
    timestampIso,
    source: config.source ?? 'jupiter',
    type: 'swap',
    status: 'confirmed',
    primaryText: 'Swapped',
    secondaryText: config.source === 'unknown' ? 'Unknown source' : 'Jupiter',
    receivedLeg: {
      symbol: config.receive,
      amountDisplay: config.receiveAmount,
      direction: 'receive',
    },
    sentLeg: {
      symbol: config.send,
      amountDisplay: config.sendAmount,
      direction: 'send',
    },
  }
}

export function createMockActivityEvents(now = new Date()): ActivityEvent[] {
  const configs: Array<{ daysAgo: number; hour: number; minute: number; swap: MockSwapConfig }> = [
    { daysAgo: 0, hour: 14, minute: 20, swap: { receive: 'BONK', send: 'USDC', receiveAmount: '+10 BONK', sendAmount: '-200 USDC' } },
    { daysAgo: 0, hour: 12, minute: 5, swap: { receive: 'BONK', send: 'USDC', receiveAmount: '+10 BONK', sendAmount: '-200 USDC' } },
    { daysAgo: 0, hour: 9, minute: 32, swap: { receive: 'BONK', send: 'USDC', receiveAmount: '+10 BONK', sendAmount: '-200 USDC' } },
    { daysAgo: 1, hour: 18, minute: 14, swap: { receive: 'BONK', send: 'USDC', receiveAmount: '+10 BONK', sendAmount: '-200 USDC' } },
    { daysAgo: 1, hour: 13, minute: 27, swap: { receive: 'BONK', send: 'USDC', receiveAmount: '+10 BONK', sendAmount: '-200 USDC' } },
    { daysAgo: 1, hour: 8, minute: 43, swap: { receive: 'BONK', send: 'USDC', receiveAmount: '+10 BONK', sendAmount: '-200 USDC' } },
    { daysAgo: 2, hour: 17, minute: 9, swap: { receive: 'BONK', send: 'USDC', receiveAmount: '+10 BONK', sendAmount: '-200 USDC' } },
    { daysAgo: 2, hour: 12, minute: 36, swap: { receive: 'BONK', send: 'USDC', receiveAmount: '+10 BONK', sendAmount: '-200 USDC', source: 'unknown' } },
    { daysAgo: 2, hour: 8, minute: 20, swap: { receive: 'SOL', send: 'USDC', receiveAmount: '+10 SOL', sendAmount: '-200 USDC' } },
  ]

  return configs
    .map((item, index) =>
      toSwapEvent(
        `mock-activity-${index + 1}`,
        withDaysAgo(now, item.daysAgo, item.hour, item.minute),
        item.swap,
      ),
    )
    .sort((left, right) => new Date(right.timestampIso).getTime() - new Date(left.timestampIso).getTime())
}
