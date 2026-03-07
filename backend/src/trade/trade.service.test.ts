import assert from 'node:assert/strict'
import test from 'node:test'
import { Connection, Keypair, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { MemoryCacheStore } from '../cache/cache.memory.js'
import {
  decimalUiAmountToAtomic,
  FeedRiskService,
  HeliusMintInfoClient,
  QuoteService,
  SolanaRpcClient,
  TradeServiceError,
  TradeStatusService,
  TradeSubmitService,
} from './trade.jupiter.js'
import { TradeAssetRegistry } from './trade.assets.js'
import type { JupiterQuoteResponse, MintDescriptor } from './trade.types.js'

function createSerializedTransaction(payer: Keypair): string {
  const message = new TransactionMessage({
    instructions: [],
    payerKey: payer.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
  }).compileToV0Message()
  const tx = new VersionedTransaction(message)
  return Buffer.from(tx.serialize()).toString('base64')
}

test('decimalUiAmountToAtomic converts ui-native amounts using token decimals', () => {
  assert.equal(decimalUiAmountToAtomic('1.5', 6), '1500000')
  assert.equal(decimalUiAmountToAtomic('0.000001', 6), '1')
})

test('decimalUiAmountToAtomic rejects unsupported decimal precision', () => {
  assert.throws(
    () => decimalUiAmountToAtomic('1.2345678', 6),
    (error: unknown) =>
      error instanceof TradeServiceError &&
      error.code === 'BAD_REQUEST' &&
      /at most 6 decimal places/.test(error.message),
  )
})

test('QuoteService stores wallet-bound quote context and normalizes preview', async () => {
  const cacheStore = new MemoryCacheStore()
  const quoteResponse: JupiterQuoteResponse = {
    inAmount: '1000000',
    inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    otherAmountThreshold: '900000',
    outAmount: '1200000',
    outputMint: 'Bonk111111111111111111111111111111111111111',
    priceImpactPct: '0.12',
    routePlan: [{ swapInfo: { label: 'Meteora' } }],
    slippageBps: 50,
    swapMode: 'ExactIn',
  }

  const service = new QuoteService(
    new TradeAssetRegistry({
      skrMint: 'skrMint11111111111111111111111111111111111',
    }),
    cacheStore,
    {
      getQuote: async () => quoteResponse,
    } as never,
    {
      getMintDescriptor: async (mint: string): Promise<MintDescriptor> => ({
        decimals: mint === quoteResponse.inputMint ? 6 : 5,
        mint,
        name: mint === quoteResponse.inputMint ? 'USD Coin' : 'Bonk',
        symbol: mint === quoteResponse.inputMint ? 'USDC' : 'BONK',
      }),
    } as never,
    {
      assertTokenAllowed: async () => ({
        mint: quoteResponse.outputMint,
        priceUsd: 0.25,
        riskTier: 'allow',
      }),
    } as never,
    {
      feedLookupLimit: 20,
      quoteTtlSeconds: 15,
    },
  )

  const preview = await service.createQuote({
    payAssetSymbol: 'USDC',
    side: 'buy',
    slippageBps: 50,
    tokenMint: quoteResponse.outputMint,
    uiAmount: '1',
    wallet: '4Nd1mGk4mF6qS6gQ2vVmQAXoJ2Bs8LojRxurx8WcN6iU',
  })

  assert.equal(preview.inputAsset.amount, 1)
  assert.equal(preview.outputAsset.amount, 12)
  assert.equal(preview.routeLabel, 'Meteora')
  assert.equal(preview.networkFeeSol > 0, true)
  const stored = await cacheStore.get(`trade:quote:${preview.quoteId}`)
  assert.ok(stored)
  assert.match(stored ?? '', /4Nd1mGk4mF6qS6gQ2vVmQAXoJ2Bs8LojRxurx8WcN6iU/)
})

test('QuoteService derives SOL usd values from the matched feed token price', async () => {
  const cacheStore = new MemoryCacheStore()
  const quoteResponse: JupiterQuoteResponse = {
    inAmount: '2000000000',
    inputMint: 'So11111111111111111111111111111111111111112',
    otherAmountThreshold: '380000000',
    outAmount: '400000000',
    outputMint: 'Bonk111111111111111111111111111111111111111',
    priceImpactPct: '0.08',
    routePlan: [{ swapInfo: { label: 'Jupiter' } }],
    slippageBps: 50,
    swapMode: 'ExactIn',
  }

  const service = new QuoteService(
    new TradeAssetRegistry(),
    cacheStore,
    {
      getQuote: async () => quoteResponse,
    } as never,
    {
      getMintDescriptor: async (mint: string): Promise<MintDescriptor> => ({
        decimals: mint === quoteResponse.inputMint ? 9 : 6,
        mint,
        name: mint === quoteResponse.inputMint ? 'Solana' : 'Bonk',
        symbol: mint === quoteResponse.inputMint ? 'SOL' : 'BONK',
      }),
    } as never,
    {
      assertTokenAllowed: async () => ({
        mint: quoteResponse.outputMint,
        priceUsd: 1,
        riskTier: 'allow',
      }),
    } as never,
    {
      feedLookupLimit: 20,
      quoteTtlSeconds: 15,
    },
  )

  const preview = await service.createQuote({
    payAssetSymbol: 'SOL',
    side: 'buy',
    slippageBps: 50,
    tokenMint: quoteResponse.outputMint,
    uiAmount: '2',
    wallet: '4Nd1mGk4mF6qS6gQ2vVmQAXoJ2Bs8LojRxurx8WcN6iU',
  })

  assert.equal(preview.inputAsset.symbol, 'SOL')
  assert.equal(preview.inputAsset.usdValue, 400)
  assert.equal(preview.inputAsset.priceUsd, 200)
  assert.equal(preview.outputAsset.usdValue, 400)
  assert.equal(preview.outputAsset.priceUsd, 1)
  assert.equal(preview.networkFeeUsd > 0, true)
})

test('QuoteService keeps the sell-side token label when mint metadata needs fallback values', async () => {
  const cacheStore = new MemoryCacheStore()
  const tokenMint = 'Bonk111111111111111111111111111111111111111'
  const quoteResponse: JupiterQuoteResponse = {
    inAmount: '500000000',
    inputMint: tokenMint,
    otherAmountThreshold: '450000',
    outAmount: '500000',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    priceImpactPct: '0.04',
    routePlan: [{ swapInfo: { label: 'Meteora' } }],
    slippageBps: 50,
    swapMode: 'ExactIn',
  }

  const service = new QuoteService(
    new TradeAssetRegistry(),
    cacheStore,
    {
      getQuote: async () => quoteResponse,
    } as never,
    {
      getMintDescriptor: async (mint: string, fallback?: Partial<MintDescriptor>): Promise<MintDescriptor> => ({
        decimals: mint === tokenMint ? 6 : 6,
        mint,
        name: fallback?.name ?? 'Unknown',
        symbol: fallback?.symbol ?? 'UNK',
      }),
    } as never,
    {
      assertTokenAllowed: async () => ({
        mint: tokenMint,
        name: 'Bonk',
        priceUsd: 1,
        riskTier: 'allow',
        symbol: 'BONK',
      }),
    } as never,
    {
      feedLookupLimit: 20,
      quoteTtlSeconds: 15,
    },
  )

  const preview = await service.createQuote({
    payAssetSymbol: 'USDC',
    side: 'sell',
    slippageBps: 50,
    tokenMint,
    uiAmount: '500',
    wallet: '4Nd1mGk4mF6qS6gQ2vVmQAXoJ2Bs8LojRxurx8WcN6iU',
  })

  assert.equal(preview.inputAsset.symbol, 'BONK')
  assert.equal(preview.inputAsset.name, 'Bonk')
  assert.equal(preview.outputAsset.symbol, 'USDC')
})

test('FeedRiskService paginates until a supported token is found', async () => {
  const tokenMint = 'Bonk111111111111111111111111111111111111111'
  const service = new FeedRiskService(
    {
      getPage: async ({ cursor }: { cursor?: string }) => {
        if (!cursor) {
          return {
            items: [
              {
                mint: 'So11111111111111111111111111111111111111112',
                priceUsd: 140,
                riskTier: 'allow',
              },
            ],
            nextCursor: 'page-2',
          }
        }

        return {
          items: [
            {
              mint: tokenMint,
              priceUsd: 0.5,
              riskTier: 'allow',
            },
          ],
          nextCursor: null,
        }
      },
    } as never,
    20,
  )

  const result = await service.assertTokenAllowed(tokenMint)
  assert.equal(result.mint, tokenMint)
  assert.equal(result.priceUsd, 0.5)
})

test('FeedRiskService rejects tokens that are missing from paginated feed pages', async () => {
  const service = new FeedRiskService(
    {
      getPage: async ({ cursor }: { cursor?: string }) => ({
        items: [
          {
            mint: cursor
              ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
              : 'So11111111111111111111111111111111111111112',
            priceUsd: 1,
            riskTier: 'allow',
          },
        ],
        nextCursor: cursor ? null : 'page-2',
      }),
    } as never,
    20,
  )

  await assert.rejects(
    () => service.assertTokenAllowed('Bonk111111111111111111111111111111111111111'),
    (error: unknown) =>
      error instanceof TradeServiceError &&
      error.code === 'RISK_BLOCKED' &&
      error.statusCode === 403 &&
      /supported feed tokens/.test(error.message),
  )
})

test('TradeSubmitService rejects signed transactions that do not match the built intent', async () => {
  const cacheStore = new MemoryCacheStore()
  const payer = Keypair.generate()
  const recipient = Keypair.generate()
  const signedTxBase64 = createSerializedTransaction(payer)

  await cacheStore.set(
    'trade:intent:ti_mismatch',
    JSON.stringify({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      messageBase64: Buffer.from(recipient.publicKey.toBytes()).toString('base64'),
      quoteId: 'qt_1',
      tradeIntentId: 'ti_mismatch',
      unsignedTxBase64: signedTxBase64,
      wallet: payer.publicKey.toBase58(),
    }),
    60,
  )

  const service = new TradeSubmitService(
    cacheStore,
    {
      confirm: async () => 'submitted',
      getCurrentBlockHeight: async () => 1,
      simulate: async () => ({}),
      submit: async () => 'sig',
    },
    {
      statusTtlSeconds: 60,
    },
  )

  await assert.rejects(
    () =>
      service.submitTrade({
        idempotencyKey: 'idem-1',
        signedTxBase64,
        tradeIntentId: 'ti_mismatch',
      }),
    (error: unknown) =>
      error instanceof TradeServiceError && error.code === 'SIGNATURE_MISMATCH' && error.statusCode === 400,
  )
})

test('TradeSubmitService rejects malformed signed transaction payloads as bad requests', async () => {
  const cacheStore = new MemoryCacheStore()
  const payer = Keypair.generate()
  const signedTxBase64 = createSerializedTransaction(payer)

  await cacheStore.set(
    'trade:intent:ti_bad_payload',
    JSON.stringify({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      messageBase64: Buffer.from(
        VersionedTransaction.deserialize(Buffer.from(signedTxBase64, 'base64')).message.serialize(),
      ).toString('base64'),
      quoteId: 'qt_1',
      tradeIntentId: 'ti_bad_payload',
      unsignedTxBase64: signedTxBase64,
      wallet: payer.publicKey.toBase58(),
    }),
    60,
  )

  const service = new TradeSubmitService(
    cacheStore,
    {
      confirm: async () => 'submitted',
      getCurrentBlockHeight: async () => 1,
      simulate: async () => ({}),
      submit: async () => 'sig',
    },
    {
      statusTtlSeconds: 60,
    },
  )

  await assert.rejects(
    () =>
      service.submitTrade({
        idempotencyKey: 'idem-bad-payload',
        signedTxBase64: 'not-a-valid-transaction',
        tradeIntentId: 'ti_bad_payload',
      }),
    (error: unknown) =>
      error instanceof TradeServiceError &&
      error.code === 'BAD_REQUEST' &&
      error.statusCode === 400 &&
      /signedTxBase64/.test(error.message),
  )
})

test('TradeSubmitService scopes idempotency keys to the trade intent', async () => {
  const cacheStore = new MemoryCacheStore()
  const payer = Keypair.generate()
  const signedTxBase64 = createSerializedTransaction(payer)
  const messageBase64 = Buffer.from(
    VersionedTransaction.deserialize(Buffer.from(signedTxBase64, 'base64')).message.serialize(),
  ).toString('base64')

  await cacheStore.set(
    'trade:intent:ti_first',
    JSON.stringify({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      messageBase64,
      quoteId: 'qt_first',
      tradeIntentId: 'ti_first',
      unsignedTxBase64: signedTxBase64,
      wallet: payer.publicKey.toBase58(),
    }),
    60,
  )
  await cacheStore.set(
    'trade:intent:ti_second',
    JSON.stringify({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      messageBase64,
      quoteId: 'qt_second',
      tradeIntentId: 'ti_second',
      unsignedTxBase64: signedTxBase64,
      wallet: payer.publicKey.toBase58(),
    }),
    60,
  )

  let submitCount = 0
  const service = new TradeSubmitService(
    cacheStore,
    {
      confirm: async () => 'submitted',
      getCurrentBlockHeight: async () => 1,
      simulate: async () => ({}),
      submit: async () => {
        submitCount += 1
        return `sig_${submitCount}`
      },
    },
    {
      statusTtlSeconds: 60,
    },
  )

  const firstResult = await service.submitTrade({
    idempotencyKey: 'idem-shared',
    signedTxBase64,
    tradeIntentId: 'ti_first',
  })
  const secondResult = await service.submitTrade({
    idempotencyKey: 'idem-shared',
    signedTxBase64,
    tradeIntentId: 'ti_second',
  })

  assert.equal(submitCount, 2)
  assert.notEqual(firstResult.tradeId, secondResult.tradeId)
  assert.notEqual(firstResult.signature, secondResult.signature)
})

test('TradeStatusService keeps slow confirmations in submitted state', async () => {
  const cacheStore = new MemoryCacheStore()
  await cacheStore.set(
    'trade:record:tr_slow',
    JSON.stringify({
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      signature: 'sig_slow',
      status: 'submitted',
      tradeId: 'tr_slow',
    }),
    60,
  )

  const service = new TradeStatusService(
    cacheStore,
    {
      confirm: async () => 'submitted',
      getCurrentBlockHeight: async () => 1,
      simulate: async () => ({}),
      submit: async () => 'sig_slow',
    },
    {
      confirmTimeoutMs: 5_000,
      statusTtlSeconds: 60,
    },
  )

  const result = await service.getTradeStatus('tr_slow')
  assert.equal(result.status, 'submitted')
  assert.equal(result.failureCode, undefined)

  const stored = JSON.parse((await cacheStore.get('trade:record:tr_slow')) ?? '{}') as {
    failureCode?: string
    status?: string
  }
  assert.equal(stored.status, 'submitted')
  assert.equal(stored.failureCode, undefined)
})

test('SolanaRpcClient queries transaction history when checking status', async () => {
  const originalGetSignatureStatuses = Connection.prototype.getSignatureStatuses
  let searchTransactionHistory: boolean | undefined

  Connection.prototype.getSignatureStatuses = async function (
    this: Connection,
    signatures: string[],
    config?: { searchTransactionHistory?: boolean },
  ) {
    void this
    void signatures
    searchTransactionHistory = config?.searchTransactionHistory
    return {
      context: {
        slot: 1,
      },
      value: [null],
    } as never
  } as typeof Connection.prototype.getSignatureStatuses

  try {
    const client = new SolanaRpcClient('http://127.0.0.1:8899')
    const result = await client.confirm('sig_history')

    assert.equal(result, 'submitted')
    assert.equal(searchTransactionHistory, true)
  } finally {
    Connection.prototype.getSignatureStatuses = originalGetSignatureStatuses
  }
})

test('HeliusMintInfoClient aborts stalled mint lookups at timeout', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = ((_: string | URL | globalThis.Request, init?: RequestInit) => {
    return new Promise((_, reject) => {
      const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' })
      init?.signal?.addEventListener('abort', () => reject(abortError), { once: true })
    })
  }) as typeof fetch

  try {
    const client = new HeliusMintInfoClient(
      {
        dasUrl: 'https://example.com',
        timeoutMs: 10,
      },
      new MemoryCacheStore(),
      {},
    )

    await assert.rejects(
      () => client.getMintDescriptor('Bonk111111111111111111111111111111111111111'),
      (error: unknown) =>
        error instanceof TradeServiceError &&
        error.code === 'ROUTE_UNAVAILABLE' &&
        error.statusCode === 502 &&
        /Timed out resolving token metadata/.test(error.message),
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
