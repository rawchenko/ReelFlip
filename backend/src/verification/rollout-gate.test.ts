import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateStrictSevenDayGate } from './rollout-gate.js'

function buildParityReport(day: number, mismatchCount = 0) {
  return {
    generatedAt: `2026-03-0${day}T00:00:00.000Z`,
    checkedMints: 100,
    mismatchCount,
  }
}

function buildPerfReport(day: number, pass = true) {
  return {
    generatedAt: `2026-03-0${day}T01:00:00.000Z`,
    mode: 'compare' as const,
    comparison: {
      pass,
      baselineP95Ms: 100,
      currentP95Ms: pass ? 110 : 140,
      thresholdP95Ms: 130,
    },
  }
}

function buildOpsObservation(day: number, overrides: Partial<{ seedSourceRate: number; supabaseFailureAlertCount: number; ingestMissedIntervalAlertCount: number }> = {}) {
  return {
    date: `2026-03-0${day}`,
    seedSourceRate: overrides.seedSourceRate ?? 0.02,
    supabaseFailureAlertCount: overrides.supabaseFailureAlertCount ?? 0,
    ingestMissedIntervalAlertCount: overrides.ingestMissedIntervalAlertCount ?? 0,
  }
}

test('evaluateStrictSevenDayGate passes with healthy 7-day inputs', () => {
  const result = evaluateStrictSevenDayGate({
    parityReports: [1, 2, 3, 4, 5, 6, 7].map((day) => buildParityReport(day)),
    perfReports: [1, 2, 3, 4, 5, 6, 7].map((day) => buildPerfReport(day)),
    opsObservations: [1, 2, 3, 4, 5, 6, 7].map((day) => buildOpsObservation(day)),
  })

  assert.equal(result.status, 'pass')
  assert.equal(result.failedChecks.length, 0)
})

test('evaluateStrictSevenDayGate fails closed when report coverage is insufficient', () => {
  const result = evaluateStrictSevenDayGate({
    parityReports: [buildParityReport(1)],
    perfReports: [buildPerfReport(1)],
    opsObservations: [buildOpsObservation(1)],
  })

  assert.equal(result.status, 'fail')
  assert.ok(result.failedChecks.includes('parity report coverage'))
  assert.ok(result.failedChecks.includes('performance report coverage'))
  assert.ok(result.failedChecks.includes('ops observation coverage'))
})

test('evaluateStrictSevenDayGate fails on seed rate and alert counts', () => {
  const result = evaluateStrictSevenDayGate({
    parityReports: [1, 2, 3, 4, 5, 6, 7].map((day) => buildParityReport(day, 0)),
    perfReports: [1, 2, 3, 4, 5, 6, 7].map((day) => buildPerfReport(day, true)),
    opsObservations: [
      buildOpsObservation(1, { seedSourceRate: 0.08 }),
      buildOpsObservation(2),
      buildOpsObservation(3, { supabaseFailureAlertCount: 1 }),
      buildOpsObservation(4),
      buildOpsObservation(5, { ingestMissedIntervalAlertCount: 1 }),
      buildOpsObservation(6),
      buildOpsObservation(7),
    ],
  })

  assert.equal(result.status, 'fail')
  assert.ok(result.failedChecks.includes('seed source rate <= 5%'))
  assert.ok(result.failedChecks.includes('no supabase failure alert bursts'))
  assert.ok(result.failedChecks.includes('no ingest missed-interval alerts'))
})
