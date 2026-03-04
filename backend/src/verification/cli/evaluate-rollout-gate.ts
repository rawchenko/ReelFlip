import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { evaluateStrictSevenDayGate, OpsObservationDay, ParityReportLite, PerfReportLite } from '../rollout-gate.js'

interface CliOptions {
  reportsDir: string
  opsObservationsFile: string
  output?: string
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))

  const parityReports = loadParityReports(options.reportsDir)
  const perfReports = loadPerfReports(options.reportsDir)
  const opsObservations = loadOpsObservations(options.opsObservationsFile)

  const evaluation = evaluateStrictSevenDayGate({
    parityReports,
    perfReports,
    opsObservations,
  })

  const generatedAt = new Date().toISOString()
  const report = {
    generatedAt,
    tool: 'rollout_gate_evaluator',
    config: {
      reportsDir: options.reportsDir,
      opsObservationsFile: options.opsObservationsFile,
    },
    evaluation,
  }

  const outputPath =
    options.output ??
    resolve(options.reportsDir, `rollout_gate_${timestampForFile(generatedAt)}.json`)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  process.stdout.write(`${JSON.stringify({ outputPath, status: evaluation.status, failedChecks: evaluation.failedChecks })}\n`)

  if (evaluation.status !== 'pass') {
    process.exitCode = 1
  }
}

function parseArgs(args: string[]): CliOptions {
  const defaultReportsDir = resolve(process.cwd(), 'supabase/verification/reports')
  const options: CliOptions = {
    reportsDir: defaultReportsDir,
    opsObservationsFile: resolve(defaultReportsDir, 'ops_observations.json'),
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]

    if (arg === '--reports-dir' && next) {
      options.reportsDir = resolve(process.cwd(), next)
      index += 1
      continue
    }

    if (arg === '--ops-observations-file' && next) {
      options.opsObservationsFile = resolve(process.cwd(), next)
      index += 1
      continue
    }

    if (arg === '--output' && next) {
      options.output = resolve(process.cwd(), next)
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function loadParityReports(reportsDir: string): ParityReportLite[] {
  const files = readdirSync(reportsDir).filter((file) => file.startsWith('parity_') && file.endsWith('.json'))
  const output: ParityReportLite[] = []

  for (const file of files) {
    const parsed = parseJson(resolve(reportsDir, file))
    if (!isRecord(parsed) || !isRecord(parsed.parity)) {
      continue
    }

    const generatedAt = readString(parsed.generatedAt)
    const checkedMints = readNumber(parsed.parity.checkedMints)
    const mismatchCount = readNumber(parsed.parity.mismatchCount)
    if (!generatedAt || checkedMints <= 0) {
      continue
    }

    output.push({
      generatedAt,
      checkedMints,
      mismatchCount,
      mismatchRate: checkedMints === 0 ? 1 : mismatchCount / checkedMints,
    })
  }

  return output
}

function loadPerfReports(reportsDir: string): PerfReportLite[] {
  const files = readdirSync(reportsDir).filter(
    (file) => file.startsWith('feed_p95_') && file.endsWith('.json') && file !== 'feed_p95_baseline.json',
  )
  const output: PerfReportLite[] = []

  for (const file of files) {
    const parsed = parseJson(resolve(reportsDir, file))
    if (!isRecord(parsed)) {
      continue
    }

    const generatedAt = readString(parsed.generatedAt)
    const mode = parsed.mode
    if (!generatedAt || (mode !== 'capture-baseline' && mode !== 'compare')) {
      continue
    }

    const report: PerfReportLite = {
      generatedAt,
      mode,
    }

    if (isRecord(parsed.comparison)) {
      report.comparison = {
        pass: Boolean(parsed.comparison.pass),
        baselineP95Ms: readNumber(parsed.comparison.baselineP95Ms),
        currentP95Ms: readNumber(parsed.comparison.currentP95Ms),
        thresholdP95Ms: readNumber(parsed.comparison.thresholdP95Ms),
      }
    }

    output.push(report)
  }

  return output
}

function loadOpsObservations(path: string): OpsObservationDay[] {
  const parsed = parseJson(path)

  const daily = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.daily)
      ? parsed.daily
      : []

  const output: OpsObservationDay[] = []

  for (const row of daily) {
    if (!isRecord(row)) {
      continue
    }

    const date = readString(row.date)
    if (!date) {
      continue
    }

    output.push({
      date,
      seedSourceRate: readNumber(row.seedSourceRate),
      supabaseFailureAlertCount: readNumber(row.supabaseFailureAlertCount),
      ingestMissedIntervalAlertCount: readNumber(row.ingestMissedIntervalAlertCount),
    })
  }

  return output
}

function parseJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function timestampForFile(iso: string): string {
  return iso.replace(/[:.]/g, '-').replace(/Z$/, 'Z')
}

function readString(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readNumber(input: unknown): number {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input
  }

  if (typeof input === 'string') {
    const parsed = Number.parseFloat(input)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return 0
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`evaluate_rollout_gate_failed: ${message}\n`)
  process.exit(1)
})
