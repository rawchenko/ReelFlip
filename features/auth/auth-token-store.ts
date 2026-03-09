let _authToken: string | null = null

export function getAuthToken(): string | null {
  return _authToken
}

export function setAuthToken(token: string | null): void {
  _authToken = token
}
