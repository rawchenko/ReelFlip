import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { compareFeedP95, parseAutocannonSummary } from '../perf.js'

interface CliOptions {
  mode: 'capture-baseline' | 'compare'
  baseUrl: string
  durationSeconds: number
  warmupSeconds: number
  connections: number
  pipelining: number
  baselinePath: string
  output?: string
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const targetUrl = `${options.baseUrl.replace(/\/$/, '')}/v1/feed?limit=20`

  await runAutocannon(targetUrl, Math.max(1, options.warmupSeconds), options.connections, options.pipelining)
  const summary = await runAutocannon(targetUrl, Math.max(1, options.durationSeconds), options.connections, options.pipelining)
  const sample = parseAutocannonSummary(summary as Parameters<typeof parseAutocannonSummary>[0])

  const generatedAt = new Date().toISOString()
  let comparison: ReturnType<typeof compareFeedP95> | null = null

  if (options.mode === 'compare') {
    const baseline = readBaseline(options.baselinePath)
    comparison = compareFeedP95(baseline.sample.p95Ms, sample.p95Ms)
  }

  const report = {
    generatedAt,
    tool: 'feed_p95_benchmark',
    mode: options.mode,
    config: {
      baseUrl: options.baseUrl,
      targetPath: '/v1/feed?limit=20',
      durationSeconds: options.durationSeconds,
      warmupSeconds: options.warmupSeconds,
      connections: options.connections,
      pipelining: options.pipelining,
    },
    sample,
    ...(comparison ? { comparison } : {}),
  }

  const reportsDir = resolve(process.cwd(), 'supabase/verification/reports')
  const timestampedOutput =
    options.output ?? resolve(reportsDir, `feed_p95_${timestampForFile(generatedAt)}.json`)
  mkdirSync(dirname(timestampedOutput), { recursive: true })
  writeFileSync(timestampedOutput, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  if (options.mode === 'capture-baseline') {
    mkdirSync(dirname(options.baselinePath), { recursive: true })
    writeFileSync(options.baselinePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }

  const pass = comparison ? comparison.pass : true
  process.stdout.write(
    `${JSON.stringify({ outputPath: timestampedOutput, mode: options.mode, p95Ms: sample.p95Ms, pass })}\n`,
  )

  if (!pass) {
    process.exitCode = 1
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    mode: 'compare',
    baseUrl: 'http://127.0.0.1:3001',
    durationSeconds: 60,
    warmupSeconds: 10,
    connections: 20,
    pipelining: 1,
    baselinePath: resolve(process.cwd(), 'supabase/verification/reports/feed_p95_baseline.json'),
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]

    if (arg === '--mode' && next) {
      if (next !== 'capture-baseline' && next !== 'compare') {
        throw new Error('Invalid --mode')
      }
      options.mode = next
      index += 1
      continue
    }

    if (arg === '--base-url' && next) {
      options.baseUrl = next
      index += 1
      continue
    }

    if (arg === '--duration-seconds' && next) {
      options.durationSeconds = parseIntStrict(next, 'duration-seconds', 1)
      index += 1
      continue
    }

    if (arg === '--warmup-seconds' && next) {
      options.warmupSeconds = parseIntStrict(next, 'warmup-seconds', 0)
      index += 1
      continue
    }

    if (arg === '--connections' && next) {
      options.connections = parseIntStrict(next, 'connections', 1)
      index += 1
      continue
    }

    if (arg === '--pipelining' && next) {
      options.pipelining = parseIntStrict(next, 'pipelining', 1)
      index += 1
      continue
    }

    if (arg === '--baseline' && next) {
      options.baselinePath = resolve(process.cwd(), next)
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

async function runAutocannon(url: string, durationSeconds: number, connections: number, pipelining: number): Promise<unknown> {
  const autocannonBin = resolve(process.cwd(), 'node_modules/.bin/autocannon')
  return await new Promise((resolvePromise, rejectPromise) => {
    execFile(
      autocannonBin,
      ['--json', '--connections', String(connections), '--duration', String(durationSeconds), '--pipelining', String(pipelining), url],
      { encoding: 'utf8' },
      (error, stdout) => {
        if (error) {
          rejectPromise(new Error(`autocannon execution failed: ${error.message}`))
          return
        }

        try {
          const parsed = JSON.parse(stdout) as unknown
          resolvePromise(parsed)
        } catch {
          rejectPromise(new Error('autocannon output parse failed'))
        }
      },
    )
  })
}

function readBaseline(path: string): { sample: { p95Ms: number } } {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error(`Baseline file not found or unreadable: ${path}`)
  }

  if (!isRecord(parsed) || !isRecord(parsed.sample) || typeof parsed.sample.p95Ms !== 'number') {
    throw new Error(`Baseline file is invalid: ${path}`)
  }

  return {
    sample: {
      p95Ms: parsed.sample.p95Ms,
    },
  }
}

function parseIntStrict(raw: string, name: string, min: number): number {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`Invalid --${name}`)
  }

  return parsed
}

function timestampForFile(iso: string): string {
  return iso.replace(/[:.]/g, '-').replace(/Z$/, 'Z')
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`feed_p95_benchmark_failed: ${message}\n`)
  process.exit(1)
})
