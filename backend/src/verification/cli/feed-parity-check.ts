import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { compareFeedParity, normalizeFeedRow, normalizeSupabaseRow } from '../parity.js'

interface CliOptions {
  baseUrl: string
  feedLimit: number
  sampleSize: number
  numericTolerance: number
  output?: string
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  const feedResponse = await fetchJson<{ items?: Array<Record<string, unknown>> }>(
    `${options.baseUrl.replace(/\/$/, '')}/v1/feed?limit=${options.feedLimit}`,
  )

  const feedRows = (feedResponse.items ?? [])
    .map((row) => normalizeFeedRow(row))
    .filter((row): row is NonNullable<typeof row> => row !== null)

  const sampled = dedupeByMint(feedRows).slice(0, options.sampleSize)
  const sampledMints = sampled.map((row) => row.mint)

  const databaseRows =
    sampledMints.length === 0
      ? []
      : await fetchSupabaseRows(supabaseUrl, supabaseServiceRoleKey, sampledMints).then((rows) =>
          rows.map((row) => normalizeSupabaseRow(row)).filter((row): row is NonNullable<typeof row> => row !== null),
        )

  const parity = compareFeedParity(sampled, databaseRows, options.numericTolerance)
  const generatedAt = new Date().toISOString()
  const report = {
    generatedAt,
    tool: 'feed_parity_check',
    config: {
      baseUrl: options.baseUrl,
      feedLimit: options.feedLimit,
      sampleSize: options.sampleSize,
      numericTolerance: options.numericTolerance,
    },
    sampledMints,
    parity,
  }

  const outputPath =
    options.output ??
    resolve(process.cwd(), 'supabase/verification/reports', `parity_${timestampForFile(generatedAt)}.json`)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  process.stdout.write(`${JSON.stringify({ outputPath, pass: parity.pass, mismatchCount: parity.mismatchCount })}\n`)

  if (!parity.pass) {
    process.exitCode = 1
  }
}

async function fetchSupabaseRows(
  supabaseUrl: string,
  serviceRoleKey: string,
  mints: string[],
): Promise<Array<Record<string, unknown>>> {
  const url = new URL('/rest/v1/v_token_feed', supabaseUrl)
  url.searchParams.set('select', '*')
  url.searchParams.set('mint', `in.${formatInFilter(mints)}`)

  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`supabase_query_failed_${response.status}`)
  }

  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.filter(isRecord)
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    baseUrl: 'http://127.0.0.1:3001',
    feedLimit: 20,
    sampleSize: 50,
    numericTolerance: 0.005,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]

    if (arg === '--base-url' && next) {
      options.baseUrl = next
      index += 1
      continue
    }

    if (arg === '--feed-limit' && next) {
      options.feedLimit = parseIntStrict(next, 'feed-limit', 1)
      index += 1
      continue
    }

    if (arg === '--sample-size' && next) {
      options.sampleSize = parseIntStrict(next, 'sample-size', 1)
      index += 1
      continue
    }

    if (arg === '--numeric-tolerance' && next) {
      options.numericTolerance = parseFloatStrict(next, 'numeric-tolerance', 0, 1)
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

function parseIntStrict(raw: string, name: string, min: number): number {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`Invalid --${name}`)
  }

  return parsed
}

function parseFloatStrict(raw: string, name: string, min: number, max: number): number {
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid --${name}`)
  }

  return parsed
}

function dedupeByMint(rows: ReturnType<typeof normalizeFeedRow>[]): Array<NonNullable<ReturnType<typeof normalizeFeedRow>>> {
  const map = new Map<string, NonNullable<ReturnType<typeof normalizeFeedRow>>>()
  for (const row of rows) {
    if (!row) {
      continue
    }
    map.set(row.mint, row)
  }

  return Array.from(map.values())
}

function timestampForFile(iso: string): string {
  return iso.replace(/[:.]/g, '-').replace(/Z$/, 'Z')
}

function formatInFilter(values: string[]): string {
  const encoded = values.map((value) => `"${value.replaceAll('"', '\\"')}"`)
  return `(${encoded.join(',')})`
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`request_failed_${response.status}`)
  }

  return (await response.json()) as T
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`feed_parity_check_failed: ${message}\n`)
  process.exit(1)
})
