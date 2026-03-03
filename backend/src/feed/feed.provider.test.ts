import assert from 'node:assert/strict'
import test from 'node:test'
import { DexScreenerFeedProvider } from './feed.provider.js'

const logger = {
  info: () => undefined,
  warn: () => undefined,
}

function buildPair(input: {
  pairAddress: string
  mint: string
  symbol: string
  name: string
}): Record<string, unknown> {
  return {
    chainId: 'solana',
    pairAddress: input.pairAddress,
    baseToken: {
      address: input.mint,
      symbol: input.symbol,
      name: input.name,
    },
    quoteToken: {
      symbol: 'USDC',
    },
    priceUsd: '1.23',
    priceChange: {
      h24: 5.2,
    },
    volume: {
      h24: 1_200_000,
      m5: 8_500,
    },
    liquidity: {
      usd: 2_800_000,
    },
    marketCap: 24_000_000,
    txns: {
      m5: {
        buys: 20,
        sells: 14,
      },
    },
    pairCreatedAt: Date.now() - 12 * 60 * 60 * 1000,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('DexScreenerFeedProvider combines search and endpoint-discovered token addresses', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(raw)

    if (url.pathname === '/latest/dex/search') {
      return jsonResponse({
        pairs: [buildPair({ pairAddress: 'pair-search', mint: 'mint-search', symbol: 'SRCH', name: 'Search Token' })],
      })
    }

    if (url.pathname === '/token-boosts/top/v1') {
      return jsonResponse([
        { chainId: 'solana', tokenAddress: 'mint-boost-a' },
        { chainId: 'ethereum', tokenAddress: 'eth-ignored' },
      ])
    }

    if (url.pathname === '/token-boosts/latest/v1') {
      return jsonResponse([{ chainId: 'solana', tokenAddress: 'mint-boost-b' }])
    }

    if (url.pathname === '/token-profiles/latest/v1') {
      return jsonResponse([{ chainId: 'solana', tokenAddress: 'mint-boost-a' }])
    }

    if (url.pathname === '/community-takeovers/latest/v1') {
      return jsonResponse([])
    }

    if (url.pathname.startsWith('/tokens/v1/solana/')) {
      const encoded = url.pathname.replace('/tokens/v1/solana/', '')
      const addresses = decodeURIComponent(encoded)
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)

      return jsonResponse(
        addresses.map((address, index) =>
          buildPair({
            pairAddress: `pair-discovery-${index + 1}`,
            mint: address,
            symbol: `DISC${index + 1}`,
            name: `Discovery ${index + 1}`,
          }),
        ),
      )
    }

    throw new Error(`Unexpected request URL: ${url.toString()}`)
  }) as typeof fetch

  try {
    const provider = new DexScreenerFeedProvider(
      {
        timeoutMs: 1_000,
        searchQuery: 'solana',
      },
      logger,
    )

    const items = await provider.fetchFeed(new AbortController().signal)
    const mints = new Set(items.map((item) => item.mint))

    assert.equal(items.length, 3)
    assert.ok(mints.has('mint-search'))
    assert.ok(mints.has('mint-boost-a'))
    assert.ok(mints.has('mint-boost-b'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('DexScreenerFeedProvider still returns search results when endpoint discovery fails', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(raw)

    if (url.pathname === '/latest/dex/search') {
      return jsonResponse({
        pairs: [buildPair({ pairAddress: 'pair-search', mint: 'mint-search', symbol: 'SRCH', name: 'Search Token' })],
      })
    }

    if (
      url.pathname === '/token-boosts/top/v1' ||
      url.pathname === '/token-boosts/latest/v1' ||
      url.pathname === '/token-profiles/latest/v1' ||
      url.pathname === '/community-takeovers/latest/v1'
    ) {
      return jsonResponse({ error: 'upstream_failed' }, 500)
    }

    throw new Error(`Unexpected request URL: ${url.toString()}`)
  }) as typeof fetch

  try {
    const provider = new DexScreenerFeedProvider(
      {
        timeoutMs: 1_000,
        searchQuery: 'solana',
      },
      logger,
    )

    const items = await provider.fetchFeed(new AbortController().signal)

    assert.equal(items.length, 1)
    assert.equal(items[0]?.mint, 'mint-search')
  } finally {
    globalThis.fetch = originalFetch
  }
})
