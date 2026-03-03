import assert from 'node:assert/strict'
import test from 'node:test'
import { FeedCache, FeedSnapshot } from './feed.cache.js'

const logger = {
  info: () => undefined,
  warn: () => undefined,
}

function buildSnapshot(id: string): FeedSnapshot {
  return {
    id,
    generatedAt: new Date().toISOString(),
    source: 'providers',
    items: [],
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

test('reads latest snapshot and looks up snapshots by id', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    cursorTtlSeconds: 300,
    snapshotHistoryMax: 10,
    logger,
  })

  const snapshotA = buildSnapshot('snapshot-a')
  const snapshotB = buildSnapshot('snapshot-b')
  await cache.writeSnapshot(snapshotA)
  await cache.writeSnapshot(snapshotB)

  const latest = await cache.readSnapshot()
  assert.equal(latest.state, 'fresh')
  assert.equal(latest.entry?.snapshot.id, 'snapshot-b')

  const readA = await cache.readSnapshotById('snapshot-a')
  const readB = await cache.readSnapshotById('snapshot-b')
  assert.equal(readA?.id, 'snapshot-a')
  assert.equal(readB?.id, 'snapshot-b')
})

test('expires snapshot-by-id entries based on cursor ttl', async () => {
  const cache = new FeedCache({
    ttlSeconds: 30,
    staleTtlSeconds: 60,
    cursorTtlSeconds: 1,
    snapshotHistoryMax: 10,
    logger,
  })

  const snapshot = buildSnapshot('snapshot-expiring')
  await cache.writeSnapshot(snapshot)
  assert.equal((await cache.readSnapshotById(snapshot.id))?.id, snapshot.id)

  await delay(1_100)

  assert.equal(await cache.readSnapshotById(snapshot.id), null)
})
