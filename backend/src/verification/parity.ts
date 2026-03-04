export interface ComparableTokenRow {
  mint: string
  name: string | null
  symbol: string | null
  description: string | null
  imageUri: string | null
  priceUsd: number | null
  priceChange24h: number | null
  volume24h: number | null
  liquidity: number | null
  marketCap: number | null
  quoteSymbol: string | null
  recentVolume5m: number | null
  recentTxns5m: number | null
  category: string | null
  riskTier: string | null
  sparklinePresent: boolean
  sparklineLength: number
}

export interface ParityIssue {
  field: Exclude<keyof ComparableTokenRow, 'mint'>
  expected: string | number | boolean | null
  actual: string | number | boolean | null
}

export interface FeedParityResult {
  checkedMints: number
  missingInDb: string[]
  mismatchedMints: string[]
  mismatchCount: number
  mismatchRate: number
  issuesByMint: Record<string, ParityIssue[]>
  pass: boolean
}

export function compareFeedParity(
  feedRows: ComparableTokenRow[],
  databaseRows: ComparableTokenRow[],
  numericTolerance: number,
): FeedParityResult {
  const byMint = new Map<string, ComparableTokenRow>()
  for (const row of databaseRows) {
    byMint.set(row.mint, row)
  }

  const missingInDb: string[] = []
  const issuesByMint: Record<string, ParityIssue[]> = {}
  const mismatchedMints: string[] = []

  for (const feedRow of feedRows) {
    const dbRow = byMint.get(feedRow.mint)
    if (!dbRow) {
      missingInDb.push(feedRow.mint)
      continue
    }

    const issues = compareRows(feedRow, dbRow, numericTolerance)
    if (issues.length > 0) {
      issuesByMint[feedRow.mint] = issues
      mismatchedMints.push(feedRow.mint)
    }
  }

  const checkedMints = feedRows.length
  const mismatchCount = missingInDb.length + mismatchedMints.length
  const mismatchRate = checkedMints === 0 ? 0 : mismatchCount / checkedMints

  return {
    checkedMints,
    missingInDb,
    mismatchedMints,
    mismatchCount,
    mismatchRate,
    issuesByMint,
    pass: mismatchCount === 0,
  }
}

export function normalizeFeedRow(input: Record<string, unknown>): ComparableTokenRow | null {
  const mint = readString(input.mint)
  if (!mint) {
    return null
  }

  const sparkline = readArray(input.sparkline)

  return {
    mint,
    name: readString(input.name),
    symbol: readString(input.symbol),
    description: readNullableString(input.description),
    imageUri: readNullableString(input.imageUri),
    priceUsd: readNullableNumber(input.priceUsd),
    priceChange24h: readNullableNumber(input.priceChange24h),
    volume24h: readNullableNumber(input.volume24h),
    liquidity: readNullableNumber(input.liquidity),
    marketCap: readNullableNumber(input.marketCap),
    quoteSymbol: readNullableString(input.quoteSymbol),
    recentVolume5m: readNullableNumber(input.recentVolume5m),
    recentTxns5m: readNullableNumber(input.recentTxns5m),
    category: readString(input.category),
    riskTier: readString(input.riskTier),
    sparklinePresent: sparkline.length > 0,
    sparklineLength: sparkline.length,
  }
}

export function normalizeSupabaseRow(input: Record<string, unknown>): ComparableTokenRow | null {
  const mint = readString(input.mint)
  if (!mint) {
    return null
  }

  const sparkline = readArray(input.sparkline)

  return {
    mint,
    name: readString(input.name),
    symbol: readString(input.symbol),
    description: readNullableString(input.description),
    imageUri: readNullableString(input.imageUri),
    priceUsd: readNullableNumber(input.priceUsd),
    priceChange24h: readNullableNumber(input.priceChange24h),
    volume24h: readNullableNumber(input.volume24h),
    liquidity: readNullableNumber(input.liquidity),
    marketCap: readNullableNumber(input.marketCap),
    quoteSymbol: readNullableString(input.quoteSymbol),
    recentVolume5m: readNullableNumber(input.recentVolume5m),
    recentTxns5m: readNullableNumber(input.recentTxns5m),
    category: readString(input.category),
    riskTier: readString(input.riskTier),
    sparklinePresent: sparkline.length > 0,
    sparklineLength: sparkline.length,
  }
}

function compareRows(expected: ComparableTokenRow, actual: ComparableTokenRow, tolerance: number): ParityIssue[] {
  const issues: ParityIssue[] = []

  for (const field of [
    'name',
    'symbol',
    'description',
    'imageUri',
    'quoteSymbol',
    'category',
    'riskTier',
  ] as const) {
    if ((expected[field] ?? null) !== (actual[field] ?? null)) {
      issues.push({ field, expected: expected[field], actual: actual[field] })
    }
  }

  for (const field of [
    'priceUsd',
    'priceChange24h',
    'volume24h',
    'liquidity',
    'marketCap',
    'recentVolume5m',
    'recentTxns5m',
  ] as const) {
    if (!isNumericEqual(expected[field], actual[field], tolerance)) {
      issues.push({ field, expected: expected[field], actual: actual[field] })
    }
  }

  for (const field of ['sparklinePresent', 'sparklineLength'] as const) {
    if (expected[field] !== actual[field]) {
      issues.push({ field, expected: expected[field], actual: actual[field] })
    }
  }

  return issues
}

function isNumericEqual(left: number | null, right: number | null, tolerance: number): boolean {
  if (left === null || right === null) {
    return left === right
  }

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return false
  }

  const denominator = Math.max(Math.abs(left), Math.abs(right), 1e-9)
  return Math.abs(left - right) / denominator <= tolerance
}

function readString(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readNullableString(input: unknown): string | null {
  if (input === null || input === undefined) {
    return null
  }

  return readString(input)
}

function readNullableNumber(input: unknown): number | null {
  if (input === null || input === undefined) {
    return null
  }

  if (typeof input === 'number' && Number.isFinite(input)) {
    return input
  }

  if (typeof input === 'string') {
    const parsed = Number.parseFloat(input)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function readArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : []
}
