import crypto from 'node:crypto'
import * as jose from 'jose'
import bs58 from 'bs58'
import { CacheStore } from '../cache/cache.types.js'
import type { AuthTokenPayload, ChallengeRecord, ChallengeResponse, VerifyResponse } from './auth.types.js'

const CHALLENGE_TTL_SECONDS = 120
const CHALLENGE_KEY_PREFIX = 'auth:challenge:'
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

interface AuthServiceConfig {
  jwtSecret: string
  tokenTtlSeconds: number
  runtimeMode: 'dev' | 'prod'
}

interface AuthServiceLogger {
  info?: (obj: unknown, msg?: string) => void
  warn?: (obj: unknown, msg?: string) => void
}

export class AuthServiceError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'AuthServiceError'
  }
}

export class AuthService {
  private readonly cacheStore: CacheStore
  private readonly jwtKey: Uint8Array
  private readonly tokenTtlSeconds: number
  private readonly logger: AuthServiceLogger

  constructor(cacheStore: CacheStore, config: AuthServiceConfig, logger: AuthServiceLogger) {
    if (config.runtimeMode === 'prod' && config.jwtSecret.length === 0) {
      throw new Error('JWT_SECRET is required in production mode')
    }

    let secret = config.jwtSecret
    if (secret.length === 0) {
      secret = crypto.randomBytes(32).toString('hex')
      logger.warn?.({}, 'JWT_SECRET not set — using ephemeral secret (dev only)')
    }

    this.cacheStore = cacheStore
    this.jwtKey = new TextEncoder().encode(secret)
    this.tokenTtlSeconds = config.tokenTtlSeconds
    this.logger = logger
  }

  async createChallenge(wallet: string): Promise<ChallengeResponse> {
    if (!BASE58_REGEX.test(wallet)) {
      throw new AuthServiceError('BAD_REQUEST', 400, 'wallet must be a valid base58 public key')
    }

    const nonce = crypto.randomBytes(16).toString('hex')
    const issuedAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString()

    const message = [
      'ReelFlip wants you to sign in with your Solana account:',
      wallet,
      '',
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
    ].join('\n')

    const record: ChallengeRecord = {
      nonce,
      wallet,
      message,
      issuedAt,
      expiresAt,
    }

    await this.cacheStore.set(`${CHALLENGE_KEY_PREFIX}${nonce}`, JSON.stringify(record), CHALLENGE_TTL_SECONDS)

    return { message, nonce, expiresAt }
  }

  async verifyChallenge(input: {
    wallet: string
    signature: string
    nonce: string
  }): Promise<VerifyResponse> {
    if (!BASE58_REGEX.test(input.wallet)) {
      throw new AuthServiceError('BAD_REQUEST', 400, 'wallet must be a valid base58 public key')
    }
    if (!input.nonce || input.nonce.trim().length === 0) {
      throw new AuthServiceError('BAD_REQUEST', 400, 'nonce is required')
    }
    if (!input.signature || input.signature.trim().length === 0) {
      throw new AuthServiceError('BAD_REQUEST', 400, 'signature is required')
    }

    const cacheKey = `${CHALLENGE_KEY_PREFIX}${input.nonce}`
    const raw = await this.cacheStore.get(cacheKey)
    if (!raw) {
      throw new AuthServiceError('CHALLENGE_EXPIRED', 401, 'Challenge has expired or was already used')
    }

    // Delete immediately — single-use nonce
    await this.cacheStore.del(cacheKey)

    const challenge = JSON.parse(raw) as ChallengeRecord
    if (challenge.wallet !== input.wallet) {
      throw new AuthServiceError('BAD_REQUEST', 400, 'wallet does not match challenge')
    }

    // Decode public key from base58
    const pubkeyBytes = bs58.decode(input.wallet)
    if (pubkeyBytes.length !== 32) {
      throw new AuthServiceError('BAD_REQUEST', 400, 'Invalid public key length')
    }

    // Import Ed25519 public key via JWK
    const x = Buffer.from(pubkeyBytes).toString('base64url')
    const keyObject = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x },
      format: 'jwk',
    })

    // Decode signature from base64
    const signatureBytes = Buffer.from(input.signature, 'base64')
    const messageBytes = Buffer.from(challenge.message, 'utf8')

    const valid = crypto.verify(null, messageBytes, keyObject, signatureBytes)
    if (!valid) {
      throw new AuthServiceError('INVALID_SIGNATURE', 401, 'Signature verification failed')
    }

    // Mint JWT
    const expiresAt = new Date(Date.now() + this.tokenTtlSeconds * 1000).toISOString()
    const token = await new jose.SignJWT({ wallet: input.wallet })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${this.tokenTtlSeconds}s`)
      .sign(this.jwtKey)

    this.logger.info?.({ wallet: input.wallet }, 'Auth token issued')

    return { token, expiresAt }
  }

  async verifyToken(token: string): Promise<AuthTokenPayload> {
    try {
      const { payload } = await jose.jwtVerify(token, this.jwtKey)
      if (typeof payload.wallet !== 'string') {
        throw new AuthServiceError('INVALID_TOKEN', 401, 'Token is missing wallet claim')
      }

      return {
        wallet: payload.wallet,
        iat: payload.iat ?? 0,
        exp: payload.exp ?? 0,
      }
    } catch (error) {
      if (error instanceof AuthServiceError) {
        throw error
      }
      throw new AuthServiceError('INVALID_TOKEN', 401, 'Invalid or expired token')
    }
  }
}
