import { createHash, randomUUID } from 'node:crypto'
import {
  Connection,
  type RpcResponseAndContext,
  type SimulatedTransactionResponse,
  VersionedTransaction,
} from '@solana/web3.js'
import bs58 from 'bs58'
import { FeedService } from '../feed/feed.service.js'
import { HeliusMetadataClient } from '../feed/feed.enrichment.js'
import { TokenFeedItem } from '../feed/feed.provider.js'
import { ResilientHttpClient } from '../lib/http-client.js'
import { CacheStore } from '../cache/cache.types.js'
import {
  BuildTradeRequest,
  JupiterQuoteResponse,
  JupiterSwapResponse,
  MintDescriptor,
  QuoteRequest,
  StoredQuoteContext,
  StoredTradeIntent,
  StoredTradeRecord,
  SwapQuotePreviewDto,
  TradeAssetSymbol,
  TradeBuildResponse,
  TradeFailureCode,
  TradeStatusResponse,
  TradeSubmitResponse,
} from './trade.types.js'
import { TradeAssetRegistry, badgeColorForSymbol } from './trade.assets.js'

interface Logger {
  info?: (obj: unknown, msg?: string) => void
  warn?: (obj: unknown, msg?: string) => void
}

interface JupiterQuoteClientOptions {
  apiKey?: string
  baseUrl: string
  timeoutMs: number
}

interface HeliusMintInfoClientOptions {
  apiKey?: string
  dasUrl: string
  timeoutMs: number
}

export interface BalanceLookup {
  getTokenBalance(wallet: string, mint: string, decimals: number): Promise<number>
}

interface QuoteServiceOptions {
  feedLookupLimit: number
  quoteTtlSeconds: number
}

interface TradeBuildServiceOptions {
  intentTtlSeconds: number
}

interface TradeSubmitServiceOptions {
  statusTtlSeconds: number
}

interface TradeStatusServiceOptions {
  confirmTimeoutMs: number
  statusTtlSeconds: number
}

const MAX_PAGES_PER_CATEGORY = 10
const BASE_NETWORK_FEE_LAMPORTS = 5_000
const MAX_PRIORITY_FEE_LAMPORTS = 1_000_000
const LAMPORTS_PER_SOL = 1_000_000_000
const ESTIMATED_NETWORK_FEE_SOL = (BASE_NETWORK_FEE_LAMPORTS + MAX_PRIORITY_FEE_LAMPORTS) / LAMPORTS_PER_SOL

interface RpcClient {
  confirm(signature: string): Promise<'confirmed' | 'failed' | 'submitted'>
  getCurrentBlockHeight(): Promise<number>
  simulate(signedTxBase64: string): Promise<{ errorMessage?: string }>
  submit(signedTxBase64: string): Promise<string>
}

export class TradeServiceError extends Error {
  constructor(
    readonly code: TradeFailureCode,
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'TradeServiceError'
  }
}

export class JupiterQuoteClient {
  private readonly httpClient: ResilientHttpClient
  private readonly headers: Record<string, string>

  constructor(
    private readonly options: JupiterQuoteClientOptions,
    logger: Logger,
  ) {
    this.httpClient = new ResilientHttpClient({
      upstream: 'jupiter_swap',
      timeoutMs: options.timeoutMs,
      maxRetries: 2,
      retryBaseDelayMs: 200,
      logger,
    })
    this.headers = {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(options.apiKey ? { 'x-api-key': options.apiKey } : {}),
    }
  }

  async getQuote(input: {
    amountAtomic: string
    inputMint: string
    outputMint: string
    slippageBps: number
  }): Promise<JupiterQuoteResponse> {
    const url = new URL('/swap/v1/quote', normalizeJupiterBaseUrl(this.options.baseUrl))
    url.searchParams.set('inputMint', input.inputMint)
    url.searchParams.set('outputMint', input.outputMint)
    url.searchParams.set('amount', input.amountAtomic)
    url.searchParams.set('slippageBps', String(input.slippageBps))
    url.searchParams.set('restrictIntermediateTokens', 'true')

    const response = await this.httpClient.request(url, {
      method: 'GET',
      headers: this.headers,
    })

    if (!response.ok) {
      throw new TradeServiceError('ROUTE_UNAVAILABLE', 502, `Quote request failed with status ${response.status}`)
    }

    return (await response.json()) as JupiterQuoteResponse
  }

  async buildSwap(input: { quoteResponse: JupiterQuoteResponse; userPublicKey: string }): Promise<JupiterSwapResponse> {
    const response = await this.httpClient.request(
      new URL('/swap/v1/swap', normalizeJupiterBaseUrl(this.options.baseUrl)),
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: {
              maxLamports: 1_000_000,
              priorityLevel: 'veryHigh',
            },
          },
          quoteResponse: input.quoteResponse,
          userPublicKey: input.userPublicKey,
          wrapAndUnwrapSol: true,
        }),
      },
    )

    if (!response.ok) {
      throw new TradeServiceError('ROUTE_UNAVAILABLE', 502, `Swap build failed with status ${response.status}`)
    }

    return (await response.json()) as JupiterSwapResponse
  }
}

export class HeliusMintInfoClient {
  private readonly metadataClient: HeliusMetadataClient

  constructor(
    private readonly options: HeliusMintInfoClientOptions,
    private readonly cacheStore: CacheStore,
    private readonly logger: Logger,
  ) {
    this.metadataClient = new HeliusMetadataClient(
      {
        apiKey: options.apiKey,
        dasUrl: options.dasUrl,
        enabled: true,
        timeoutMs: options.timeoutMs,
      },
      {
        info: logger.info ?? (() => undefined),
        warn: logger.warn ?? (() => undefined),
      },
    )
  }

  async getMintDescriptor(mint: string, fallback?: Partial<MintDescriptor>): Promise<MintDescriptor> {
    const cacheKey = `trade:mint:${mint}`
    const cached = await this.cacheStore.get(cacheKey)
    if (cached) {
      return JSON.parse(cached) as MintDescriptor
    }

    const descriptor = await this.fetchMintDescriptor(mint, fallback)
    await this.cacheStore.set(cacheKey, JSON.stringify(descriptor), 43_200)
    return descriptor
  }

  private async fetchMintDescriptor(mint: string, fallback?: Partial<MintDescriptor>): Promise<MintDescriptor> {
    if (mint === 'So11111111111111111111111111111111111111112') {
      return {
        decimals: 9,
        mint,
        name: fallback?.name ?? 'Solana',
        symbol: fallback?.symbol ?? 'SOL',
      }
    }

    if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
      return {
        decimals: 6,
        mint,
        name: fallback?.name ?? 'USD Coin',
        symbol: fallback?.symbol ?? 'USDC',
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs)

    let payload: unknown
    try {
      const response = await fetch(buildHeliusRpcUrl(this.options.dasUrl, this.options.apiKey), {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: `trade-${mint}`,
          jsonrpc: '2.0',
          method: 'getAsset',
          params: {
            id: mint,
            displayOptions: {
              showFungible: true,
            },
          },
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        if (fallback?.symbol) {
          return { decimals: fallback.decimals ?? 6, mint, name: fallback.name ?? fallback.symbol, symbol: fallback.symbol }
        }
        throw new TradeServiceError('ROUTE_UNAVAILABLE', 502, `Unable to resolve token metadata for ${mint}`)
      }

      payload = (await response.json()) as unknown
    } catch (error) {
      if (fallback?.decimals != null && fallback.symbol) {
        return { decimals: fallback.decimals, mint, name: fallback.name ?? fallback.symbol, symbol: fallback.symbol }
      }
      if (error instanceof TradeServiceError) {
        throw error
      }
      if (isAbortError(error)) {
        throw new TradeServiceError('ROUTE_UNAVAILABLE', 502, `Timed out resolving token metadata for ${mint}`)
      }
      throw new TradeServiceError('ROUTE_UNAVAILABLE', 502, `Unable to resolve token metadata for ${mint}`)
    } finally {
      clearTimeout(timeoutId)
    }

    const result = isRecord(payload) && isRecord(payload.result) ? payload.result : null
    const tokenInfo = result && isRecord(result.token_info) ? result.token_info : null
    const content = result && isRecord(result.content) ? result.content : null
    const metadata = content && isRecord(content.metadata) ? content.metadata : null
    const decimals = numberOrNull(tokenInfo?.decimals)
    const symbol =
      stringOrNull(tokenInfo?.symbol) ?? stringOrNull(metadata?.symbol) ?? fallback?.symbol ?? mint.slice(0, 4)
    const name = stringOrNull(metadata?.name) ?? fallback?.name ?? symbol

    if (decimals === null) {
      throw new TradeServiceError('ROUTE_UNAVAILABLE', 502, `Missing decimals for token ${mint}`)
    }

    const metadataController = new AbortController()
    const metadataTimeoutId = setTimeout(() => metadataController.abort(), this.options.timeoutMs)
    const metadataSnapshot = await this.metadataClient
      .fetchTokenMetadata(mint, metadataController.signal)
      .catch(() => null)
    clearTimeout(metadataTimeoutId)

    return {
      decimals,
      mint,
      name: metadataSnapshot?.name ?? name,
      symbol,
    }
  }
}

export class FeedRiskService {
  constructor(
    private readonly feedService: FeedService,
    private readonly feedLookupLimit: number,
  ) {}

  async assertTokenAllowed(tokenMint: string): Promise<TokenFeedItem> {
    const candidates = [undefined, 'trending', 'gainer', 'new', 'memecoin'] as const

    for (const category of candidates) {
      let cursor: string | undefined
      const seenCursors = new Set<string>()
      let pagesScanned = 0

      while (pagesScanned < MAX_PAGES_PER_CATEGORY) {
        pagesScanned += 1
        const page = await this.feedService.getPage({
          ...(category ? { category } : {}),
          ...(cursor ? { cursor } : {}),
          limit: this.feedLookupLimit,
        })
        const match = page.items.find((item) => item.mint === tokenMint)
        if (match) {
          return match
        }

        const nextCursor = page.nextCursor ?? undefined
        if (!nextCursor || seenCursors.has(nextCursor)) {
          break
        }

        seenCursors.add(nextCursor)
        cursor = nextCursor
      }
    }

    throw new TradeServiceError('RISK_BLOCKED', 403, 'Trading is only available for supported feed tokens.')
  }
}

export class QuoteService {
  constructor(
    private readonly assetRegistry: TradeAssetRegistry,
    private readonly cacheStore: CacheStore,
    private readonly jupiterClient: JupiterQuoteClient,
    private readonly mintInfoClient: HeliusMintInfoClient,
    private readonly riskService: FeedRiskService,
    private readonly options: QuoteServiceOptions,
  ) {}

  async createQuote(input: QuoteRequest): Promise<SwapQuotePreviewDto> {
    validateTradeRequest(input)
    if (!this.assetRegistry.isEnabled(input.payAssetSymbol)) {
      throw new TradeServiceError('BAD_REQUEST', 400, `${input.payAssetSymbol} is not available for swaps`)
    }

    const feedToken = await this.riskService.assertTokenAllowed(input.tokenMint)
    const payAssetDescriptor = this.assetRegistry.get(input.payAssetSymbol)

    const payAssetMint = this.assetRegistry.getMint(input.payAssetSymbol)
    const inputMint = input.side === 'buy' ? payAssetMint : input.tokenMint
    const outputMint = input.side === 'buy' ? input.tokenMint : payAssetMint
    const inputDescriptor = await this.mintInfoClient.getMintDescriptor(inputMint, {
      decimals: inputMint === input.tokenMint ? undefined : payAssetDescriptor.decimals,
      name: inputMint === input.tokenMint ? feedToken.name : payAssetDescriptor.name,
      symbol: inputMint === input.tokenMint ? feedToken.symbol : payAssetDescriptor.symbol,
    })
    const outputDescriptor = await this.mintInfoClient.getMintDescriptor(outputMint, {
      decimals: outputMint === input.tokenMint ? undefined : payAssetDescriptor.decimals,
      name: outputMint === input.tokenMint ? feedToken.name : payAssetDescriptor.name,
      symbol: outputMint === input.tokenMint ? feedToken.symbol : payAssetDescriptor.symbol,
    })
    const amountAtomic = decimalUiAmountToAtomic(input.uiAmount, inputDescriptor.decimals)
    const quoteResponse = await this.jupiterClient.getQuote({
      amountAtomic,
      inputMint,
      outputMint,
      slippageBps: input.slippageBps,
    })

    const quoteId = `qt_${randomUUID().replace(/-/g, '')}`
    const preview = buildQuotePreview({
      inputDescriptor,
      outputDescriptor,
      quoteId,
      quoteResponse,
      refreshWindowSec: this.options.quoteTtlSeconds,
      tokenMint: input.tokenMint,
      tokenPriceUsd: feedToken.priceUsd,
    })

    const storedQuote: StoredQuoteContext = {
      expiresAt: preview.expiresAt,
      inputMint,
      inputMintDecimals: inputDescriptor.decimals,
      outputMint,
      outputMintDecimals: outputDescriptor.decimals,
      payAssetSymbol: input.payAssetSymbol,
      quoteId,
      quotePreview: preview,
      quoteResponse,
      side: input.side,
      tokenMint: input.tokenMint,
      wallet: input.wallet,
    }
    await this.cacheStore.set(getQuoteCacheKey(quoteId), JSON.stringify(storedQuote), this.options.quoteTtlSeconds)

    return preview
  }
}

export class TradeBuildService {
  constructor(
    private readonly cacheStore: CacheStore,
    private readonly jupiterClient: JupiterQuoteClient,
    private readonly options: TradeBuildServiceOptions,
  ) {}

  async buildTrade(input: BuildTradeRequest): Promise<TradeBuildResponse> {
    validateBase58Address(input.wallet, 'wallet')
    const quote = await readQuoteContext(this.cacheStore, input.quoteId)
    if (quote.wallet !== input.wallet) {
      throw new TradeServiceError('BAD_REQUEST', 400, 'wallet does not match quote wallet')
    }
    if (Date.now() >= new Date(quote.expiresAt).getTime()) {
      throw new TradeServiceError('QUOTE_EXPIRED', 410, 'Quote has expired. Refresh and try again.')
    }

    const swapResponse = await this.jupiterClient.buildSwap({
      quoteResponse: quote.quoteResponse,
      userPublicKey: input.wallet,
    })
    if (!swapResponse.swapTransaction) {
      throw new TradeServiceError('ROUTE_UNAVAILABLE', 502, 'Swap builder did not return a transaction')
    }
    if (swapResponse.simulationError) {
      throw new TradeServiceError('ROUTE_UNAVAILABLE', 502, 'Swap transaction could not be prepared')
    }

    const unsignedTxBase64 = swapResponse.swapTransaction
    const tx = VersionedTransaction.deserialize(Buffer.from(unsignedTxBase64, 'base64'))
    const messageBase64 = Buffer.from(tx.message.serialize()).toString('base64')
    const tradeIntentId = `ti_${randomUUID().replace(/-/g, '')}`
    const expiresAt = new Date(Date.now() + this.options.intentTtlSeconds * 1_000).toISOString()
    const intent: StoredTradeIntent = {
      expiresAt,
      ...(typeof swapResponse.lastValidBlockHeight === 'number'
        ? { lastValidBlockHeight: swapResponse.lastValidBlockHeight }
        : {}),
      messageBase64,
      quoteId: input.quoteId,
      tradeIntentId,
      unsignedTxBase64,
      wallet: input.wallet,
    }

    await this.cacheStore.set(
      getTradeIntentCacheKey(tradeIntentId),
      JSON.stringify(intent),
      this.options.intentTtlSeconds,
    )

    return {
      expiresAt,
      tradeIntentId,
      unsignedTxBase64,
    }
  }
}

export class TradeSubmitService {
  constructor(
    private readonly cacheStore: CacheStore,
    private readonly rpcClient: RpcClient,
    private readonly options: TradeSubmitServiceOptions,
  ) {}

  async submitTrade(input: {
    idempotencyKey: string
    signedTxBase64: string
    tradeIntentId: string
  }): Promise<TradeSubmitResponse> {
    if (input.idempotencyKey.trim().length === 0) {
      throw new TradeServiceError('BAD_REQUEST', 400, 'idempotencyKey is required')
    }

    const intent = await readTradeIntent(this.cacheStore, input.tradeIntentId)
    if (Date.now() >= new Date(intent.expiresAt).getTime()) {
      throw new TradeServiceError('QUOTE_EXPIRED', 410, 'Trade intent has expired. Build a new transaction.')
    }

    const idempotencyKey = getSubmitIdempotencyCacheKey(intent.wallet, input.idempotencyKey, input.tradeIntentId)
    const existingTradeId = await this.cacheStore.get(idempotencyKey)
    if (existingTradeId) {
      const record = await readTradeRecord(this.cacheStore, existingTradeId)
      return toTradeSubmitResponse(record)
    }

    const signedTx = deserializeSignedTransaction(input.signedTxBase64)
    const signedMessageBase64 = Buffer.from(signedTx.message.serialize()).toString('base64')
    if (signedMessageBase64 !== intent.messageBase64) {
      throw new TradeServiceError('SIGNATURE_MISMATCH', 400, 'Signed transaction does not match the built trade intent')
    }

    const tradeId = `tr_${randomUUID().replace(/-/g, '')}`
    const createdAt = new Date().toISOString()
    await writeTradeRecord(this.cacheStore, tradeId, this.options.statusTtlSeconds, {
      createdAt,
      expiresAt: intent.expiresAt,
      ...(typeof intent.lastValidBlockHeight === 'number' ? { lastValidBlockHeight: intent.lastValidBlockHeight } : {}),
      status: 'simulating',
      tradeId,
    })
    const claimed = await this.cacheStore.setIfAbsent(idempotencyKey, tradeId, this.options.statusTtlSeconds * 1_000)
    if (!claimed) {
      await this.cacheStore.del(getTradeRecordCacheKey(tradeId))
      const claimedTradeId = await this.cacheStore.get(idempotencyKey)
      if (!claimedTradeId) {
        throw new TradeServiceError('STATUS_TIMEOUT', 409, 'Trade submission is already in progress. Retry shortly.')
      }

      const record = await readTradeRecord(this.cacheStore, claimedTradeId)
      return toTradeSubmitResponse(record)
    }

    const simulation = await this.rpcClient.simulate(input.signedTxBase64)
    if (simulation.errorMessage) {
      await writeTradeRecord(this.cacheStore, tradeId, this.options.statusTtlSeconds, {
        createdAt,
        failureCode: 'SIMULATION_FAILED',
        failureMessage: simulation.errorMessage,
        status: 'failed',
        tradeId,
      })
      throw new TradeServiceError('SIMULATION_FAILED', 422, simulation.errorMessage)
    }

    try {
      const signature = await this.rpcClient.submit(input.signedTxBase64)
      const record: StoredTradeRecord = {
        createdAt,
        expiresAt: intent.expiresAt,
        ...(typeof intent.lastValidBlockHeight === 'number'
          ? { lastValidBlockHeight: intent.lastValidBlockHeight }
          : {}),
        signature,
        status: 'submitted',
        tradeId,
      }
      await writeTradeRecord(this.cacheStore, tradeId, this.options.statusTtlSeconds, record)
      return toTradeSubmitResponse(record)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Broadcast failed'
      await writeTradeRecord(this.cacheStore, tradeId, this.options.statusTtlSeconds, {
        createdAt,
        failureCode: 'BROADCAST_FAILED',
        failureMessage: message,
        status: 'failed',
        tradeId,
      })
      throw new TradeServiceError('BROADCAST_FAILED', 502, message)
    }
  }
}

export class TradeStatusService {
  constructor(
    private readonly cacheStore: CacheStore,
    private readonly rpcClient: RpcClient,
    private readonly options: TradeStatusServiceOptions,
  ) {}

  async getTradeStatus(tradeId: string): Promise<TradeStatusResponse> {
    const record = await readTradeRecord(this.cacheStore, tradeId)
    if (record.status === 'confirmed' || record.status === 'failed' || !record.signature) {
      return toTradeStatusResponse(record)
    }

    const confirmation = await this.rpcClient.confirm(record.signature)
    if (confirmation === 'confirmed') {
      const confirmed: StoredTradeRecord = {
        ...record,
        confirmedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
        status: 'confirmed',
      }
      await writeTradeRecord(this.cacheStore, tradeId, this.options.statusTtlSeconds, confirmed)
      return toTradeStatusResponse(confirmed)
    }
    if (confirmation === 'failed') {
      const failed: StoredTradeRecord = {
        ...record,
        failureCode: 'BROADCAST_FAILED',
        failureMessage: 'Transaction failed on-chain.',
        lastCheckedAt: new Date().toISOString(),
        status: 'failed',
      }
      await writeTradeRecord(this.cacheStore, tradeId, this.options.statusTtlSeconds, failed)
      return toTradeStatusResponse(failed)
    }

    if (typeof record.lastValidBlockHeight === 'number') {
      const currentBlockHeight = await this.rpcClient.getCurrentBlockHeight()
      if (currentBlockHeight > record.lastValidBlockHeight) {
        const expired: StoredTradeRecord = {
          ...record,
          failureCode: 'QUOTE_EXPIRED',
          failureMessage: 'Transaction expired before confirmation.',
          lastCheckedAt: new Date().toISOString(),
          status: 'failed',
        }
        await writeTradeRecord(this.cacheStore, tradeId, this.options.statusTtlSeconds, expired)
        return toTradeStatusResponse(expired)
      }
    }

    // Still submitted — skip the cache write to avoid unnecessary write pressure on every poll.
    return toTradeStatusResponse(record)
  }
}

export class SolanaRpcClient implements RpcClient {
  private readonly connection: Connection

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed')
  }

  async confirm(signature: string): Promise<'confirmed' | 'failed' | 'submitted'> {
    const response = await this.connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    })
    const status = response.value[0]
    if (!status) {
      return 'submitted'
    }
    if (status.err) {
      return 'failed'
    }
    if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
      return 'confirmed'
    }
    return 'submitted'
  }

  async getCurrentBlockHeight(): Promise<number> {
    return this.connection.getBlockHeight('confirmed')
  }

  async simulate(signedTxBase64: string): Promise<{ errorMessage?: string }> {
    const tx = VersionedTransaction.deserialize(Buffer.from(signedTxBase64, 'base64'))
    const result: RpcResponseAndContext<SimulatedTransactionResponse> = await this.connection.simulateTransaction(tx, {
      commitment: 'processed',
      replaceRecentBlockhash: false,
      sigVerify: true,
    })
    if (result.value.err) {
      return {
        errorMessage: JSON.stringify(result.value.err),
      }
    }
    if (Array.isArray(result.value.logs)) {
      const failedLog = result.value.logs.find((line) => typeof line === 'string' && /\bfailed\b/i.test(line))
      if (failedLog) {
        return {
          errorMessage: failedLog,
        }
      }
    }
    return {}
  }

  async submit(signedTxBase64: string): Promise<string> {
    const tx = VersionedTransaction.deserialize(Buffer.from(signedTxBase64, 'base64'))
    const rawBytes = tx.serialize()
    const signature = await this.connection.sendRawTransaction(rawBytes, {
      maxRetries: 2,
      skipPreflight: true,
    })

    if (signature) {
      return signature
    }

    return bs58.encode(tx.signatures[0] ?? new Uint8Array(64))
  }
}

function normalizeJupiterBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (trimmed.length === 0) {
    return 'https://api.jup.ag'
  }
  if (trimmed.endsWith('/')) {
    return trimmed
  }
  return `${trimmed}/`
}

function validateTradeRequest(input: QuoteRequest): void {
  validateBase58Address(input.wallet, 'wallet')
  validateBase58Address(input.tokenMint, 'tokenMint')
  if (!['SOL', 'USDC', 'SKR'].includes(input.payAssetSymbol)) {
    throw new TradeServiceError('BAD_REQUEST', 400, 'Invalid payAssetSymbol')
  }
  if (input.side !== 'buy' && input.side !== 'sell') {
    throw new TradeServiceError('BAD_REQUEST', 400, 'Invalid side')
  }
  if (!Number.isInteger(input.slippageBps) || input.slippageBps < 1 || input.slippageBps > 5000) {
    throw new TradeServiceError('BAD_REQUEST', 400, 'slippageBps must be an integer between 1 and 5000')
  }
  if (!/^\d+(\.\d+)?$/.test(input.uiAmount.trim())) {
    throw new TradeServiceError('BAD_REQUEST', 400, 'uiAmount must be a positive decimal string')
  }
  if (Number.parseFloat(input.uiAmount) <= 0) {
    throw new TradeServiceError('BAD_REQUEST', 400, 'uiAmount must be greater than zero')
  }
}

function validateBase58Address(value: string, label: string): void {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim())) {
    throw new TradeServiceError('BAD_REQUEST', 400, `${label} must be a valid base58 public key`)
  }
}

export function decimalUiAmountToAtomic(value: string, decimals: number): string {
  const normalized = value.trim()
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new TradeServiceError('BAD_REQUEST', 400, 'Invalid decimal amount')
  }

  const [wholePart, fractionPart = ''] = normalized.split('.')
  if (fractionPart.length > decimals) {
    throw new TradeServiceError('BAD_REQUEST', 400, `Amount supports at most ${decimals} decimal places`)
  }
  const paddedFraction = `${fractionPart}${'0'.repeat(decimals)}`.slice(0, decimals)
  const combined = `${wholePart}${paddedFraction}`.replace(/^0+/, '')
  const atomic = combined.length > 0 ? combined : '0'
  if (atomic === '0') {
    throw new TradeServiceError('BAD_REQUEST', 400, 'Amount is too small for token decimals')
  }
  return atomic
}

function atomicToDecimal(value: string, decimals: number): number {
  const atomic = BigInt(value)
  const base = 10n ** BigInt(decimals)
  const whole = atomic / base
  const fraction = atomic % base
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
  const normalized = fractionText.length > 0 ? `${whole.toString()}.${fractionText}` : whole.toString()
  return Number.parseFloat(normalized)
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function deserializeSignedTransaction(signedTxBase64: string): VersionedTransaction {
  try {
    return VersionedTransaction.deserialize(Buffer.from(signedTxBase64, 'base64'))
  } catch {
    throw new TradeServiceError('BAD_REQUEST', 400, 'signedTxBase64 must be a valid base64-encoded Solana transaction')
  }
}

function buildQuotePreview(input: {
  inputDescriptor: MintDescriptor
  outputDescriptor: MintDescriptor
  quoteId: string
  quoteResponse: JupiterQuoteResponse
  refreshWindowSec: number
  tokenMint: string
  tokenPriceUsd: number
}): SwapQuotePreviewDto {
  const inputAmount = atomicToDecimal(input.quoteResponse.inAmount, input.inputDescriptor.decimals)
  const outputAmount = atomicToDecimal(input.quoteResponse.outAmount, input.outputDescriptor.decimals)
  const minimumReceived = atomicToDecimal(input.quoteResponse.otherAmountThreshold, input.outputDescriptor.decimals)
  const priceImpactPct = Number.parseFloat(input.quoteResponse.priceImpactPct)
  const routeLabels = input.quoteResponse.routePlan
    .map((step) => step.swapInfo?.label?.trim() ?? '')
    .filter((value) => value.length > 0)
  const resolveDirectPriceUsd = (descriptor: MintDescriptor): number => {
    if (descriptor.symbol === 'USDC') {
      return 1
    }
    if (descriptor.mint === input.tokenMint && Number.isFinite(input.tokenPriceUsd) && input.tokenPriceUsd > 0) {
      return input.tokenPriceUsd
    }
    return 0
  }
  const inputDirectPriceUsd = resolveDirectPriceUsd(input.inputDescriptor)
  const outputDirectPriceUsd = resolveDirectPriceUsd(input.outputDescriptor)
  const inputUsdValue =
    inputDirectPriceUsd > 0
      ? inputAmount * inputDirectPriceUsd
      : outputDirectPriceUsd > 0
        ? outputAmount * outputDirectPriceUsd
        : 0
  const outputUsdValue =
    outputDirectPriceUsd > 0
      ? outputAmount * outputDirectPriceUsd
      : inputDirectPriceUsd > 0
        ? inputAmount * inputDirectPriceUsd
        : 0
  const solPriceUsd =
    input.inputDescriptor.symbol === 'SOL' && inputAmount > 0 && inputUsdValue > 0
      ? inputUsdValue / inputAmount
      : input.outputDescriptor.symbol === 'SOL' && outputAmount > 0 && outputUsdValue > 0
        ? outputUsdValue / outputAmount
        : 0
  const networkFeeUsd = solPriceUsd > 0 ? roundTo(ESTIMATED_NETWORK_FEE_SOL * solPriceUsd, 2) : 0

  return {
    exchangeRate: inputAmount > 0 ? outputAmount / inputAmount : 0,
    expiresAt: new Date(Date.now() + input.refreshWindowSec * 1_000).toISOString(),
    inputAsset: {
      amount: inputAmount,
      badgeColor: badgeColorForSymbol(input.inputDescriptor.symbol),
      badgeText: badgeTextForSymbol(input.inputDescriptor.symbol),
      balance: 0,
      name: input.inputDescriptor.name,
      priceUsd: inputUsdValue > 0 && inputAmount > 0 ? inputUsdValue / inputAmount : 0,
      symbol: input.inputDescriptor.symbol,
      usdValue: inputUsdValue,
    },
    minimumReceived,
    networkFeeSol: ESTIMATED_NETWORK_FEE_SOL,
    networkFeeUsd,
    outputAsset: {
      amount: outputAmount,
      badgeColor: badgeColorForSymbol(input.outputDescriptor.symbol),
      badgeText: badgeTextForSymbol(input.outputDescriptor.symbol),
      balance: 0,
      name: input.outputDescriptor.name,
      priceUsd: outputUsdValue > 0 && outputAmount > 0 ? outputUsdValue / outputAmount : 0,
      symbol: input.outputDescriptor.symbol,
      usdValue: outputUsdValue,
    },
    platformFeeUsd: 0,
    priceImpactPct: Number.isFinite(priceImpactPct) ? priceImpactPct : 0,
    providerLabel: 'Jupiter',
    quoteId: input.quoteId,
    refreshWindowSec: input.refreshWindowSec,
    routeLabel: routeLabels.length > 0 ? routeLabels.join(' + ') : 'Best route via Jupiter',
    slippageBps: input.quoteResponse.slippageBps,
  }
}

function badgeTextForSymbol(symbol: string): string {
  if (symbol === 'USDC') {
    return '$'
  }
  return symbol.slice(0, 1).toUpperCase()
}

function buildHeliusRpcUrl(rawUrl: string, apiKey?: string): string {
  const normalized = rawUrl.trim()
  if (!apiKey || apiKey.trim().length === 0) {
    return normalized
  }
  if (normalized.includes('api-key=')) {
    return normalized
  }
  return normalized.includes('?')
    ? `${normalized}&api-key=${encodeURIComponent(apiKey)}`
    : `${normalized}?api-key=${encodeURIComponent(apiKey)}`
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}

function stringOrNull(input: unknown): string | null {
  return typeof input === 'string' && input.trim().length > 0 ? input.trim() : null
}

function numberOrNull(input: unknown): number | null {
  return typeof input === 'number' && Number.isFinite(input) ? input : null
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function hashMessageBase64(messageBase64: string): string {
  return createHash('sha256').update(messageBase64).digest('hex')
}

export function getQuoteCacheKey(quoteId: string): string {
  return `trade:quote:${quoteId}`
}

export function getTradeIntentCacheKey(tradeIntentId: string): string {
  return `trade:intent:${tradeIntentId}`
}

export function getTradeRecordCacheKey(tradeId: string): string {
  return `trade:record:${tradeId}`
}

function getSubmitIdempotencyCacheKey(wallet: string, idempotencyKey: string, tradeIntentId: string): string {
  return `trade:idempotency:${wallet}:${tradeIntentId}:${idempotencyKey}`
}

async function readQuoteContext(cacheStore: CacheStore, quoteId: string): Promise<StoredQuoteContext> {
  const raw = await cacheStore.get(getQuoteCacheKey(quoteId))
  if (!raw) {
    throw new TradeServiceError('QUOTE_EXPIRED', 410, 'Quote has expired. Refresh and try again.')
  }
  return JSON.parse(raw) as StoredQuoteContext
}

async function readTradeIntent(cacheStore: CacheStore, tradeIntentId: string): Promise<StoredTradeIntent> {
  const raw = await cacheStore.get(getTradeIntentCacheKey(tradeIntentId))
  if (!raw) {
    throw new TradeServiceError('QUOTE_EXPIRED', 410, 'Trade intent has expired. Build again.')
  }
  return JSON.parse(raw) as StoredTradeIntent
}

async function readTradeRecord(cacheStore: CacheStore, tradeId: string): Promise<StoredTradeRecord> {
  const raw = await cacheStore.get(getTradeRecordCacheKey(tradeId))
  if (!raw) {
    throw new TradeServiceError('NOT_FOUND', 404, 'Trade record not found')
  }
  return JSON.parse(raw) as StoredTradeRecord
}

async function writeTradeRecord(
  cacheStore: CacheStore,
  tradeId: string,
  ttlSeconds: number,
  record: StoredTradeRecord,
): Promise<void> {
  await cacheStore.set(getTradeRecordCacheKey(tradeId), JSON.stringify(record), ttlSeconds)
}

function toTradeStatusResponse(record: StoredTradeRecord): TradeStatusResponse {
  return {
    ...(record.confirmedAt ? { confirmedAt: record.confirmedAt } : {}),
    ...(record.failureCode ? { failureCode: record.failureCode } : {}),
    ...(record.failureMessage ? { failureMessage: record.failureMessage } : {}),
    ...(record.signature ? { signature: record.signature } : {}),
    status: record.status,
    tradeId: record.tradeId,
  }
}

function toTradeSubmitResponse(record: StoredTradeRecord): TradeSubmitResponse {
  return {
    signature: record.signature ?? '',
    status: record.status,
    tradeId: record.tradeId,
  }
}
