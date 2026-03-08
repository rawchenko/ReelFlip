import { HeliusClientError, HeliusTransactionClient } from './activity.helius-client.js'
import type {
  ActivityEventResponse,
  ActivityLegResponse,
  ActivityResponse,
  HeliusEnhancedTransaction,
  HeliusNativeTransfer,
  HeliusTokenTransfer,
} from './activity.types.js'

interface ActivityServiceLogger {
  warn?: (obj: unknown, msg?: string) => void
  info?: (obj: unknown, msg?: string) => void
}

export interface MintSymbolResolver {
  getSymbol(mint: string): Promise<string>
}

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const LAMPORTS_PER_SOL = 1_000_000_000

const SWAP_TYPES = new Set(['SWAP', 'SWAP_EXACT_IN', 'SWAP_EXACT_OUT'])
const TRANSFER_TYPES = new Set(['TRANSFER', 'SOL_TRANSFER', 'TOKEN_TRANSFER'])

export class ActivityService {
  constructor(
    private readonly heliusClient: HeliusTransactionClient,
    private readonly mintResolver: MintSymbolResolver,
    private readonly logger: ActivityServiceLogger,
  ) {}

  async list(walletAddress: string, days: number, cursor?: string): Promise<ActivityResponse> {
    const startMs = Date.now()

    try {
      const { signatures, nextCursor } = await this.heliusClient.getSignatures(walletAddress, days, cursor)

      if (signatures.length === 0) {
        return { events: [], nextCursor: undefined }
      }

      const sigs = signatures.map((s) => s.signature)
      const enriched = await this.heliusClient.parseTransactions(sigs)

      const symbolMap = await this.resolveSymbols(enriched, walletAddress)

      const events = enriched
        .map((tx) => this.normalizeTransaction(tx, walletAddress, symbolMap))
        .filter((event): event is ActivityEventResponse => event !== null)

      this.logger.info?.(
        {
          walletAddress: walletAddress.slice(0, 8) + '...',
          signatureCount: signatures.length,
          enrichedCount: enriched.length,
          eventCount: events.length,
          durationMs: Date.now() - startMs,
        },
        'Activity list completed',
      )

      return { events, nextCursor }
    } catch (error) {
      if (error instanceof HeliusClientError) {
        throw new ActivityServiceError(`Failed to fetch activity: ${error.message}`)
      }
      throw error
    }
  }

  private async resolveSymbols(
    transactions: HeliusEnhancedTransaction[],
    walletAddress: string,
  ): Promise<Map<string, string>> {
    const mints = new Set<string>()

    for (const tx of transactions) {
      for (const t of tx.tokenTransfers) {
        if (t.fromUserAccount === walletAddress || t.toUserAccount === walletAddress) {
          mints.add(t.mint)
        }
      }
    }

    mints.delete(SOL_MINT)

    const symbolMap = new Map<string, string>()
    symbolMap.set(SOL_MINT, 'SOL')

    const entries = Array.from(mints)
    await Promise.all(
      entries.map(async (mint) => {
        try {
          const symbol = await this.mintResolver.getSymbol(mint)
          symbolMap.set(mint, symbol)
        } catch {
          symbolMap.set(mint, mint.slice(0, 6))
        }
      }),
    )

    return symbolMap
  }

  private normalizeTransaction(
    tx: HeliusEnhancedTransaction,
    walletAddress: string,
    symbolMap: Map<string, string>,
  ): ActivityEventResponse | null {
    const kind = this.resolveKind(tx.type)
    if (!kind) return null

    const status = tx.transactionError ? ('failed' as const) : ('confirmed' as const)
    const timestamp = new Date(tx.timestamp * 1000).toISOString()

    if (kind === 'swap') {
      return this.normalizeSwap(tx, walletAddress, status, timestamp, symbolMap)
    }

    return this.normalizeTransfer(tx, walletAddress, status, timestamp, symbolMap)
  }

  private normalizeSwap(
    tx: HeliusEnhancedTransaction,
    walletAddress: string,
    status: 'confirmed' | 'failed',
    timestamp: string,
    symbolMap: Map<string, string>,
  ): ActivityEventResponse | null {
    const outTransfers = tx.tokenTransfers.filter((t) => t.fromUserAccount === walletAddress)
    const inTransfers = tx.tokenTransfers.filter((t) => t.toUserAccount === walletAddress)

    const nativeOut = tx.nativeTransfers
      .filter((t) => t.fromUserAccount === walletAddress && t.toUserAccount !== walletAddress)
      .reduce((sum, t) => sum + t.amount, 0)
    const nativeIn = tx.nativeTransfers
      .filter((t) => t.toUserAccount === walletAddress && t.fromUserAccount !== walletAddress)
      .reduce((sum, t) => sum + t.amount, 0)

    const sentLeg = this.pickLargestTokenLeg(outTransfers, 'out', symbolMap) ?? this.buildNativeLeg(nativeOut, 'out')
    const receivedLeg = this.pickLargestTokenLeg(inTransfers, 'in', symbolMap) ?? this.buildNativeLeg(nativeIn, 'in')

    if (!sentLeg && !receivedLeg) return null

    const primary = receivedLeg ?? sentLeg!
    const secondary = receivedLeg && sentLeg ? sentLeg : undefined

    return {
      id: `${tx.signature}-0`,
      txid: tx.signature,
      timestamp,
      status,
      kind: 'swap',
      primary,
      secondary,
    }
  }

  private normalizeTransfer(
    tx: HeliusEnhancedTransaction,
    walletAddress: string,
    status: 'confirmed' | 'failed',
    timestamp: string,
    symbolMap: Map<string, string>,
  ): ActivityEventResponse | null {
    const tokenTransfer = tx.tokenTransfers.find(
      (t) => t.fromUserAccount === walletAddress || t.toUserAccount === walletAddress,
    )

    if (tokenTransfer) {
      const direction = tokenTransfer.toUserAccount === walletAddress ? ('in' as const) : ('out' as const)
      const counterpartyAddress = direction === 'in' ? tokenTransfer.fromUserAccount : tokenTransfer.toUserAccount

      return {
        id: `${tx.signature}-0`,
        txid: tx.signature,
        timestamp,
        status,
        kind: 'transfer',
        primary: {
          mint: tokenTransfer.mint,
          symbol: symbolMap.get(tokenTransfer.mint) ?? tokenTransfer.mint.slice(0, 6),
          amount: String(tokenTransfer.tokenAmount),
          direction,
        },
        counterparty: counterpartyAddress ? { address: counterpartyAddress } : undefined,
      }
    }

    const nativeTransfer = this.findRelevantNativeTransfer(tx.nativeTransfers, walletAddress)
    if (!nativeTransfer) return null

    const direction = nativeTransfer.toUserAccount === walletAddress ? ('in' as const) : ('out' as const)
    const counterpartyAddress = direction === 'in' ? nativeTransfer.fromUserAccount : nativeTransfer.toUserAccount

    return {
      id: `${tx.signature}-0`,
      txid: tx.signature,
      timestamp,
      status,
      kind: 'transfer',
      primary: {
        mint: SOL_MINT,
        symbol: 'SOL',
        amount: String(nativeTransfer.amount / LAMPORTS_PER_SOL),
        direction,
      },
      counterparty: counterpartyAddress ? { address: counterpartyAddress } : undefined,
    }
  }

  private resolveKind(heliusType: string): 'swap' | 'transfer' | null {
    const upper = heliusType.toUpperCase()
    if (SWAP_TYPES.has(upper)) return 'swap'
    if (TRANSFER_TYPES.has(upper)) return 'transfer'
    return null
  }

  private pickLargestTokenLeg(
    transfers: HeliusTokenTransfer[],
    direction: 'in' | 'out',
    symbolMap: Map<string, string>,
  ): ActivityLegResponse | null {
    if (transfers.length === 0) return null

    let largest = transfers[0]!
    for (const t of transfers) {
      if (t.tokenAmount > largest.tokenAmount) {
        largest = t
      }
    }

    return {
      mint: largest.mint,
      symbol: symbolMap.get(largest.mint) ?? largest.mint.slice(0, 6),
      amount: String(largest.tokenAmount),
      direction,
    }
  }

  private buildNativeLeg(lamports: number, direction: 'in' | 'out'): ActivityLegResponse | null {
    if (lamports <= 0) return null
    return {
      mint: SOL_MINT,
      symbol: 'SOL',
      amount: String(lamports / LAMPORTS_PER_SOL),
      direction,
    }
  }

  private findRelevantNativeTransfer(
    transfers: HeliusNativeTransfer[],
    walletAddress: string,
  ): HeliusNativeTransfer | null {
    let largest: HeliusNativeTransfer | null = null

    for (const t of transfers) {
      if (t.fromUserAccount !== walletAddress && t.toUserAccount !== walletAddress) continue
      if (t.amount <= 0) continue
      if (!largest || t.amount > largest.amount) {
        largest = t
      }
    }

    return largest
  }
}

export class ActivityServiceError extends Error {
  readonly statusCode = 502

  constructor(message: string) {
    super(message)
    this.name = 'ActivityServiceError'
  }
}

export class InvalidActivityRequestError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'InvalidActivityRequestError'
  }
}
