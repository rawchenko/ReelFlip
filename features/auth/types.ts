export interface AuthState {
  isAuthenticated: boolean
  isAuthenticating: boolean
  token: string | null
  wallet: string | null
  expiresAt: string | null
}

export interface ChallengeResponse {
  message: string
  nonce: string
  expiresAt: string
}

export interface VerifyResponse {
  token: string
  expiresAt: string
}
