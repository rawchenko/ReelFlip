import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeFeedCursor, encodeFeedCursor } from './feed.cursor.js'

test('encodes and decodes cursor payload', () => {
  const encoded = encodeFeedCursor({
    snapshotId: 'snapshot-1',
    offset: 20,
    category: 'trending',
    minLifetimeHours: 6,
    limit: 10,
  })

  const decoded = decodeFeedCursor(encoded)
  assert.deepEqual(decoded, {
    snapshotId: 'snapshot-1',
    offset: 20,
    category: 'trending',
    minLifetimeHours: 6,
    limit: 10,
  })
})

test('throws for invalid cursor values', () => {
  assert.throws(() => decodeFeedCursor('not-valid-cursor'))
})
