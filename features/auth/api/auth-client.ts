import { getApiBaseUrl, normalizeBaseUrl } from '@/utils/api-base-url'
import type { ChallengeResponse, VerifyResponse } from '@/features/auth/types'

interface ErrorEnvelope {
  error?: {
    code?: string
    message?: string
  }
}

const FETCH_TIMEOUT_MS = 15_000

function createTimeoutSignal(): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return controller.signal
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ErrorEnvelope
    if (payload.error?.message) {
      return payload.error.message
    }
  } catch {
    // ignore JSON parse issues for error payloads
  }

  return fallback
}

export async function fetchChallenge(wallet: string): Promise<ChallengeResponse> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const response = await fetch(`${baseUrl}/v1/auth/challenge`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ wallet }),
    signal: createTimeoutSignal(),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Challenge request failed with status ${response.status}`))
  }

  return (await response.json()) as ChallengeResponse
}

export async function verifySignature(input: {
  wallet: string
  signature: string
  nonce: string
}): Promise<VerifyResponse> {
  const baseUrl = normalizeBaseUrl(getApiBaseUrl())
  const response = await fetch(`${baseUrl}/v1/auth/verify`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      wallet: input.wallet,
      signature: input.signature,
      nonce: input.nonce,
    }),
    signal: createTimeoutSignal(),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Verify request failed with status ${response.status}`))
  }

  return (await response.json()) as VerifyResponse
}
