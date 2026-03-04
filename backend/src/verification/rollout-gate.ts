export interface ParityReportLite {
  generatedAt: string
  checkedMints: number
  mismatchCount: number
  mismatchRate?: number
}

export interface PerfComparisonLite {
  pass: boolean
  baselineP95Ms: number
  currentP95Ms: number
  thresholdP95Ms: number
}

export interface PerfReportLite {
  generatedAt: string
  mode: 'capture-baseline' | 'compare'
  comparison?: PerfComparisonLite
}

export interface OpsObservationDay {
  date: string
  seedSourceRate: number
  supabaseFailureAlertCount: number
  ingestMissedIntervalAlertCount: number
}

export interface RolloutGateCheck {
  name: string
  pass: boolean
  details: string
}

export interface RolloutGateResult {
  status: 'pass' | 'fail'
  failedChecks: string[]
  checks: RolloutGateCheck[]
}

export function evaluateStrictSevenDayGate(input: {
  parityReports: ParityReportLite[]
  perfReports: PerfReportLite[]
  opsObservations: OpsObservationDay[]
}): RolloutGateResult {
  const parityReports = takeLatest(input.parityReports, 7)
  const perfReports = takeLatest(
    input.perfReports.filter((report) => report.mode === 'compare'),
    7,
  )
  const opsObservations = takeLatest(input.opsObservations, 7)

  const checks: RolloutGateCheck[] = []

  checks.push(checkMinimum('parity report coverage', parityReports.length, 7))
  checks.push(checkMinimum('performance report coverage', perfReports.length, 7))
  checks.push(checkMinimum('ops observation coverage', opsObservations.length, 7))

  if (parityReports.length >= 7) {
    const checked = parityReports.reduce((acc, report) => acc + Math.max(0, report.checkedMints), 0)
    const mismatches = parityReports.reduce((acc, report) => acc + Math.max(0, report.mismatchCount), 0)
    const mismatchRate = checked === 0 ? 1 : mismatches / checked
    checks.push({
      name: 'parity mismatch rate <= 2%',
      pass: mismatchRate <= 0.02,
      details: `mismatchRate=${round(mismatchRate)} checked=${checked} mismatches=${mismatches}`,
    })
  }

  if (perfReports.length >= 7) {
    const failed = perfReports.filter((report) => !report.comparison?.pass)
    checks.push({
      name: 'daily p95 compare passes',
      pass: failed.length === 0,
      details:
        failed.length === 0
          ? `all ${perfReports.length} compare reports passed`
          : `${failed.length} compare reports failed`,
    })
  }

  if (opsObservations.length >= 7) {
    const peakSeedRate = Math.max(...opsObservations.map((day) => day.seedSourceRate))
    checks.push({
      name: 'seed source rate <= 5%',
      pass: peakSeedRate <= 0.05,
      details: `peakSeedRate=${round(peakSeedRate)}`,
    })

    const supabaseAlerts = opsObservations.reduce((acc, day) => acc + Math.max(0, day.supabaseFailureAlertCount), 0)
    checks.push({
      name: 'no supabase failure alert bursts',
      pass: supabaseAlerts === 0,
      details: `supabaseFailureAlertCount=${supabaseAlerts}`,
    })

    const ingestMissed = opsObservations.reduce((acc, day) => acc + Math.max(0, day.ingestMissedIntervalAlertCount), 0)
    checks.push({
      name: 'no ingest missed-interval alerts',
      pass: ingestMissed === 0,
      details: `ingestMissedIntervalAlertCount=${ingestMissed}`,
    })
  }

  const failedChecks = checks.filter((check) => !check.pass).map((check) => check.name)

  return {
    status: failedChecks.length === 0 ? 'pass' : 'fail',
    failedChecks,
    checks,
  }
}

function checkMinimum(name: string, value: number, minimum: number): RolloutGateCheck {
  return {
    name,
    pass: value >= minimum,
    details: `${value}/${minimum} required`,
  }
}

function takeLatest<T extends { generatedAt?: string; date?: string }>(rows: T[], count: number): T[] {
  return [...rows]
    .sort((left, right) => {
      const leftTs = Date.parse(left.generatedAt ?? left.date ?? '')
      const rightTs = Date.parse(right.generatedAt ?? right.date ?? '')
      return rightTs - leftTs
    })
    .slice(0, count)
}

function round(value: number): number {
  return Number(value.toFixed(6))
}
