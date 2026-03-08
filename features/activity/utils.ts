import type { ActivityLeg } from '@/features/activity/types'

export function legInitial(leg: ActivityLeg): string {
  if (leg.symbol.length === 0) {
    return '?'
  }

  return leg.symbol.slice(0, 1).toUpperCase()
}
