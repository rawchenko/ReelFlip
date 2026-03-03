import assert from 'node:assert/strict'
import test from 'node:test'
import { loadEnv } from './env.js'

function withEnv(overrides: Record<string, string | undefined>, callback: () => void): void {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
      continue
    }
    process.env[key] = value
  }

  try {
    callback()
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
        continue
      }
      process.env[key] = value
    }
  }
}

test('loadEnv uses default chart history cache ttl when env is absent', () => {
  withEnv({ CHART_HISTORY_CACHE_TTL_SECONDS: undefined }, () => {
    const env = loadEnv()
    assert.equal(env.chartHistoryCacheTtlSeconds, 43_200)
  })
})

test('loadEnv parses CHART_HISTORY_CACHE_TTL_SECONDS', () => {
  withEnv({ CHART_HISTORY_CACHE_TTL_SECONDS: '12345' }, () => {
    const env = loadEnv()
    assert.equal(env.chartHistoryCacheTtlSeconds, 12_345)
  })
})

test('loadEnv rejects invalid CHART_HISTORY_CACHE_TTL_SECONDS', () => {
  withEnv({ CHART_HISTORY_CACHE_TTL_SECONDS: 'invalid' }, () => {
    assert.throws(() => loadEnv(), /Invalid CHART_HISTORY_CACHE_TTL_SECONDS/)
  })
})
