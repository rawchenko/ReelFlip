import { getAuthToken } from '@/features/auth/auth-token-store'

export interface ErrorEnvelope {
  error?: {
    code?: string
    message?: string
  }
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}

export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
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

export function isInvalidAuthTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes('invalid or expired token') || message.includes('authorization header is required')
}
