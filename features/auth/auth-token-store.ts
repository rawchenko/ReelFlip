let _authToken: string | null = null
let _expiresAt: number | null = null

export function getAuthToken(): string | null {
  return _authToken
}

export function isAuthTokenExpired(): boolean {
  if (!_expiresAt) return _authToken == null
  return Date.now() >= _expiresAt
}

export function setAuthToken(token: string | null, expiresAt?: string | null): void {
  _authToken = token
  _expiresAt = expiresAt ? new Date(expiresAt).getTime() : null
}
