import assert from 'node:assert/strict'
import test from 'node:test'
import { compareFeedParity, normalizeFeedRow, normalizeSupabaseRow } from './parity.js'
import type { ComparableTokenRow } from './parity.js'

test('compareFeedParity tolerates small numeric drift and detects mismatches', () => {
  const base: ComparableTokenRow = {
    mint: 'mint-a',
    name: 'Token A',
    symbol: 'A',
    description: null,
    imageUri: null,
    priceUsd: 10,
    priceChange24h: 5,
    volume24h: 1000,
    liquidity: 500,
    marketCap: 5000,
    quoteSymbol: 'SOL',
    recentVolume5m: 10,
    recentTxns5m: 2,
    category: 'trending',
    riskTier: 'warn',
    sparklinePresent: true,
    sparklineLength: 3,
  }
  const feed: ComparableTokenRow[] = [base]

  const db: ComparableTokenRow[] = [{ ...base, priceUsd: 10.01 }]

  const passResult = compareFeedParity(feed, db, 0.005)
  assert.equal(passResult.pass, true)

  const failResult = compareFeedParity(feed, [{ ...base, priceUsd: 12 }], 0.005)
  assert.equal(failResult.pass, false)
  assert.equal(failResult.mismatchedMints.length, 1)
  assert.equal(failResult.issuesByMint['mint-a']?.[0]?.field, 'priceUsd')
})

test('compareFeedParity detects missing mints in database', () => {
  const feed = [
    {
      mint: 'mint-missing',
      name: null,
      symbol: null,
      description: null,
      imageUri: null,
      priceUsd: null,
      priceChange24h: null,
      volume24h: null,
      liquidity: null,
      marketCap: null,
      quoteSymbol: null,
      recentVolume5m: null,
      recentTxns5m: null,
      category: null,
      riskTier: null,
      sparklinePresent: false,
      sparklineLength: 0,
    },
  ]

  const result = compareFeedParity(feed, [], 0.005)
  assert.equal(result.pass, false)
  assert.deepEqual(result.missingInDb, ['mint-missing'])
})

test('normalize helpers map feed and supabase rows to comparable shape', () => {
  const normalizedFeed = normalizeFeedRow({
    mint: 'mint-z',
    name: 'Token Z',
    symbol: 'Z',
    priceUsd: 1.1,
    sparkline: [1, 2],
    category: 'new',
    riskTier: 'allow',
  })
  const normalizedDb = normalizeSupabaseRow({
    mint: 'mint-z',
    name: 'Token Z',
    symbol: 'Z',
    priceUsd: '1.1',
    sparkline: [1, 2],
    category: 'new',
    riskTier: 'allow',
  })

  assert.equal(normalizedFeed?.mint, 'mint-z')
  assert.equal(normalizedFeed?.sparklineLength, 2)
  assert.equal(normalizedDb?.mint, 'mint-z')
  assert.equal(normalizedDb?.priceUsd, 1.1)
})
