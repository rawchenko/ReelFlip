import { FeedCategory } from './feed.provider.js'

export interface FeedCursorPayload {
  snapshotId: string
  offset: number
  category: FeedCategory | null
  limit: number
}

export class FeedCursorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedCursorError'
  }
}

export function encodeFeedCursor(payload: FeedCursorPayload): string {
  const serialized = JSON.stringify(payload)
  return toBase64Url(serialized)
}

export function decodeFeedCursor(cursor: string): FeedCursorPayload {
  try {
    const json = fromBase64Url(cursor)
    const parsed = JSON.parse(json) as unknown

    if (!isFeedCursorPayload(parsed)) {
      throw new FeedCursorError('Invalid cursor payload')
    }

    return parsed
  } catch (error) {
    if (error instanceof FeedCursorError) {
      throw error
    }

    throw new FeedCursorError('Invalid cursor encoding')
  }
}

function isFeedCursorPayload(input: unknown): input is FeedCursorPayload {
  if (!isRecord(input)) {
    return false
  }

  const category = input.category
  const isValidCategory =
    category === null ||
    category === 'trending' ||
    category === 'gainer' ||
    category === 'new' ||
    category === 'memecoin'

  return (
    typeof input.snapshotId === 'string' &&
    input.snapshotId.length > 0 &&
    typeof input.offset === 'number' &&
    Number.isInteger(input.offset) &&
    input.offset >= 0 &&
    typeof input.limit === 'number' &&
    Number.isInteger(input.limit) &&
    input.limit > 0 &&
    isValidCategory
  )
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function fromBase64Url(input: string): string {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}
