import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import { registerTradeRoutes } from './trade.route.js'
import { TradeServiceError } from './trade.jupiter.js'

test('POST /v1/quotes returns normalized preview payload', async () => {
  const app = Fastify()
  await registerTradeRoutes(app, {
    quoteService: {
      createQuote: async () => ({
        exchangeRate: 12.5,
        expiresAt: '2026-03-06T10:00:00.000Z',
        inputAsset: {
          amount: 1,
          badgeColor: '#2F80ED',
          badgeText: '$',
          balance: 0,
          name: 'USD Coin',
          priceUsd: 1,
          symbol: 'USDC',
          usdValue: 1,
        },
        minimumReceived: 10,
        networkFeeSol: 0,
        networkFeeUsd: 0,
        outputAsset: {
          amount: 12.5,
          badgeColor: '#FACC15',
          badgeText: 'B',
          balance: 0,
          name: 'Bonk',
          priceUsd: 0,
          symbol: 'BONK',
          usdValue: 0,
        },
        platformFeeUsd: 0,
        priceImpactPct: 0.12,
        providerLabel: 'Jupiter',
        quoteId: 'qt_test',
        refreshWindowSec: 15,
        routeLabel: 'Best route via Jupiter',
        slippageBps: 50,
      }),
    } as never,
    rateLimitTradesPerMinute: 120,
    tradeBuildService: {} as never,
    tradeStatusService: {} as never,
    tradeSubmitService: {} as never,
  })

  const response = await app.inject({
    method: 'POST',
    url: '/v1/quotes',
    payload: {
      payAssetSymbol: 'USDC',
      side: 'buy',
      slippageBps: 50,
      tokenMint: 'So11111111111111111111111111111111111111112',
      uiAmount: '10',
      wallet: '4Nd1mGk4mF6qS6gQ2vVmQAXoJ2Bs8LojRxurx8WcN6iU',
    },
  })

  assert.equal(response.statusCode, 200)
  const body = response.json() as { quoteId?: string; routeLabel?: string }
  assert.equal(body.quoteId, 'qt_test')
  assert.equal(body.routeLabel, 'Best route via Jupiter')
})

test('POST /v1/trades/submit returns canonical error envelope for service failures', async () => {
  const app = Fastify()
  await registerTradeRoutes(app, {
    quoteService: {} as never,
    rateLimitTradesPerMinute: 120,
    tradeBuildService: {} as never,
    tradeStatusService: {} as never,
    tradeSubmitService: {
      submitTrade: async () => {
        throw new TradeServiceError('SIMULATION_FAILED', 422, 'Simulation rejected the transaction')
      },
    } as never,
  })

  const response = await app.inject({
    method: 'POST',
    url: '/v1/trades/submit',
    payload: {
      idempotencyKey: 'idem-1',
      signedTxBase64: 'ZmFrZQ==',
      tradeIntentId: 'ti_123',
    },
  })

  assert.equal(response.statusCode, 422)
  const body = response.json() as {
    error?: {
      code?: string
      message?: string
    }
  }
  assert.equal(body.error?.code, 'SIMULATION_FAILED')
  assert.equal(body.error?.message, 'Simulation rejected the transaction')
})
