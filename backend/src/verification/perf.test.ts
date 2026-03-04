import assert from 'node:assert/strict'
import test from 'node:test'
import { compareFeedP95, parseAutocannonSummary } from './perf.js'

test('parseAutocannonSummary extracts latency and throughput values', () => {
  const summary = parseAutocannonSummary({
    latency: {
      p95: 123,
      average: 45,
      max: 456,
    },
    requests: {
      average: 78,
      total: 900,
    },
  })

  assert.equal(summary.p95Ms, 123)
  assert.equal(summary.averageMs, 45)
  assert.equal(summary.maxMs, 456)
  assert.equal(summary.requestsPerSecond, 78)
  assert.equal(summary.totalRequests, 900)
})

test('parseAutocannonSummary falls back to p97_5 when p95 is missing', () => {
  const summary = parseAutocannonSummary({
    latency: {
      p97_5: 140,
      average: 55,
      max: 600,
    },
    requests: {
      average: 40,
      total: 500,
    },
  })

  assert.equal(summary.p95Ms, 140)
  assert.equal(summary.averageMs, 55)
  assert.equal(summary.maxMs, 600)
  assert.equal(summary.requestsPerSecond, 40)
  assert.equal(summary.totalRequests, 500)
})

test('compareFeedP95 passes and fails using threshold formula', () => {
  const pass = compareFeedP95(100, 120)
  assert.equal(pass.thresholdP95Ms, 130)
  assert.equal(pass.pass, true)

  const fail = compareFeedP95(100, 131)
  assert.equal(fail.pass, false)
})
