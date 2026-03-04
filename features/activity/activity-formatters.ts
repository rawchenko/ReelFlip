import { ActivityEvent, ActivitySection } from '@/features/activity/types'

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function formatSectionDateLabel(date: Date, now: Date): string {
  if (isSameLocalDate(date, now)) {
    return 'Today'
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function groupActivityEventsByDate(events: ActivityEvent[], now = new Date()): ActivitySection[] {
  if (events.length === 0) {
    return []
  }

  const sorted = [...events].sort(
    (left, right) => new Date(right.timestampIso).getTime() - new Date(left.timestampIso).getTime(),
  )

  const sectionsByKey = new Map<string, ActivitySection>()
  for (const event of sorted) {
    const date = new Date(event.timestampIso)
    const dateKey = toLocalDateKey(date)
    const existing = sectionsByKey.get(dateKey)
    if (existing) {
      existing.items.push(event)
      continue
    }

    sectionsByKey.set(dateKey, {
      dateKey,
      label: formatSectionDateLabel(date, now),
      items: [event],
    })
  }

  return [...sectionsByKey.values()].sort((left, right) => right.dateKey.localeCompare(left.dateKey))
}
