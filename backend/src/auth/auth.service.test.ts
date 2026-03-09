import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import Fastify from 'fastify'
import bs58 from 'bs58'
import { MemoryCacheStore } from '../cache/cache.memory.js'
import { AuthService, AuthServiceError } from './auth.service.js'
import { createAuthPreHandler } from './auth.middleware.js'
import { registerAuthRoutes } from './auth.route.js'

function createTestAuthService() {
  const cacheStore = new MemoryCacheStore()
  const authService = new AuthService(cacheStore, {
    jwtSecret: 'test-secret-for-unit-tests-only',
    tokenTtlSeconds: 3600,
    runtimeMode: 'dev',
  }, {})
  return { cacheStore, authService }
}

function generateEd25519Wallet() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const pubDer = publicKey.export({ type: 'spki', format: 'der' })
  // Ed25519 SPKI DER: last 32 bytes are the raw public key
  const rawPubkey = pubDer.subarray(pubDer.length - 32)
  const wallet = bs58.encode(rawPubkey)
  return { wallet, privateKey, rawPubkey }
}

test('createChallenge returns message, nonce, and expiresAt for valid wallet', async () => {
  const { authService } = createTestAuthService()
  const { wallet } = generateEd25519Wallet()

  const challenge = await authService.createChallenge(wallet)

  assert.ok(challenge.message.includes(wallet))
  assert.ok(challenge.message.includes('Nonce:'))
  assert.ok(challenge.nonce.length === 32) // 16 random bytes hex-encoded
  assert.ok(new Date(challenge.expiresAt).getTime() > Date.now())
})

test('createChallenge rejects invalid wallet address', async () => {
  const { authService } = createTestAuthService()

  await assert.rejects(
    () => authService.createChallenge('not-a-valid-address!'),
    (error: AuthServiceError) => {
      assert.equal(error.code, 'BAD_REQUEST')
      assert.equal(error.statusCode, 400)
      return true
    },
  )
})

test('full auth flow: challenge → sign → verify → JWT', async () => {
  const { authService } = createTestAuthService()
  const { wallet, privateKey } = generateEd25519Wallet()

  // 1. Get challenge
  const challenge = await authService.createChallenge(wallet)

  // 2. Sign the message with ed25519 private key
  const messageBytes = Buffer.from(challenge.message, 'utf8')
  const signature = crypto.sign(null, messageBytes, privateKey)
  const signatureBase64 = signature.toString('base64')

  // 3. Verify challenge
  const result = await authService.verifyChallenge({
    wallet,
    signature: signatureBase64,
    nonce: challenge.nonce,
  })

  assert.ok(result.token.length > 0)
  assert.ok(new Date(result.expiresAt).getTime() > Date.now())

  // 4. Verify the returned JWT
  const payload = await authService.verifyToken(result.token)
  assert.equal(payload.wallet, wallet)
  assert.ok(payload.exp > 0)
})

test('replay protection: same nonce twice fails on second attempt', async () => {
  const { authService } = createTestAuthService()
  const { wallet, privateKey } = generateEd25519Wallet()

  const challenge = await authService.createChallenge(wallet)
  const messageBytes = Buffer.from(challenge.message, 'utf8')
  const signature = crypto.sign(null, messageBytes, privateKey)
  const signatureBase64 = signature.toString('base64')

  // First verify succeeds
  await authService.verifyChallenge({
    wallet,
    signature: signatureBase64,
    nonce: challenge.nonce,
  })

  // Second verify with same nonce fails
  await assert.rejects(
    () =>
      authService.verifyChallenge({
        wallet,
        signature: signatureBase64,
        nonce: challenge.nonce,
      }),
    (error: AuthServiceError) => {
      assert.equal(error.code, 'CHALLENGE_EXPIRED')
      assert.equal(error.statusCode, 401)
      return true
    },
  )
})

test('invalid signature returns INVALID_SIGNATURE', async () => {
  const { authService } = createTestAuthService()
  const { wallet } = generateEd25519Wallet()

  const challenge = await authService.createChallenge(wallet)

  // Random invalid signature
  const fakeSignature = crypto.randomBytes(64).toString('base64')

  await assert.rejects(
    () =>
      authService.verifyChallenge({
        wallet,
        signature: fakeSignature,
        nonce: challenge.nonce,
      }),
    (error: AuthServiceError) => {
      assert.equal(error.code, 'INVALID_SIGNATURE')
      assert.equal(error.statusCode, 401)
      return true
    },
  )
})

test('verifyToken rejects garbage token', async () => {
  const { authService } = createTestAuthService()

  await assert.rejects(
    () => authService.verifyToken('not.a.jwt'),
    (error: AuthServiceError) => {
      assert.equal(error.code, 'INVALID_TOKEN')
      assert.equal(error.statusCode, 401)
      return true
    },
  )
})

test('auth routes: POST /v1/auth/challenge returns 200', async () => {
  const { authService } = createTestAuthService()
  const { wallet } = generateEd25519Wallet()

  const app = Fastify()
  await registerAuthRoutes(app, {
    authService,
    rateLimitAuthPerMinute: 60,
  })

  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/challenge',
    payload: { wallet },
  })

  assert.equal(response.statusCode, 200)
  const body = response.json() as { message: string; nonce: string; expiresAt: string }
  assert.ok(body.message.includes(wallet))
  assert.ok(body.nonce.length > 0)
})

test('auth routes: POST /v1/auth/challenge returns 400 for missing wallet', async () => {
  const { authService } = createTestAuthService()

  const app = Fastify()
  await registerAuthRoutes(app, {
    authService,
    rateLimitAuthPerMinute: 60,
  })

  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/challenge',
    payload: {},
  })

  assert.equal(response.statusCode, 400)
})

test('auth middleware: protected route returns 401 without token, 200 with valid token', async () => {
  const { authService } = createTestAuthService()
  const { wallet, privateKey } = generateEd25519Wallet()
  const authPreHandler = createAuthPreHandler(authService)

  const app = Fastify()
  app.get('/protected', { preHandler: [authPreHandler] }, async (request) => {
    return { wallet: request.authWallet }
  })

  // Without token
  const noAuthResponse = await app.inject({
    method: 'GET',
    url: '/protected',
  })
  assert.equal(noAuthResponse.statusCode, 401)

  // Get a valid token
  const challenge = await authService.createChallenge(wallet)
  const messageBytes = Buffer.from(challenge.message, 'utf8')
  const signature = crypto.sign(null, messageBytes, privateKey)
  const { token } = await authService.verifyChallenge({
    wallet,
    signature: signature.toString('base64'),
    nonce: challenge.nonce,
  })

  // With valid token
  const authResponse = await app.inject({
    method: 'GET',
    url: '/protected',
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
  assert.equal(authResponse.statusCode, 200)
  const body = authResponse.json() as { wallet: string }
  assert.equal(body.wallet, wallet)
})

test('AuthService throws in prod mode without JWT_SECRET', () => {
  const cacheStore = new MemoryCacheStore()

  assert.throws(
    () =>
      new AuthService(cacheStore, {
        jwtSecret: '',
        tokenTtlSeconds: 3600,
        runtimeMode: 'prod',
      }, {}),
    /JWT_SECRET is required in production mode/,
  )
})

test('AuthService generates ephemeral secret in dev mode without JWT_SECRET', () => {
  const cacheStore = new MemoryCacheStore()
  const warnings: string[] = []

  const authService = new AuthService(cacheStore, {
    jwtSecret: '',
    tokenTtlSeconds: 3600,
    runtimeMode: 'dev',
  }, {
    warn: (_obj, msg) => { if (msg) warnings.push(msg) },
  })

  assert.ok(authService)
  assert.ok(warnings.some((w) => w.includes('ephemeral')))
})
