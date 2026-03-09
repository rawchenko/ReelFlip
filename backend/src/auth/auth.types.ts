export interface ChallengeRecord {
  nonce: string
  wallet: string
  message: string
  issuedAt: string
  expiresAt: string
}

export interface AuthTokenPayload {
  wallet: string
  iat: number
  exp: number
}

export interface ChallengeRequest {
  wallet: string
}

export interface ChallengeResponse {
  message: string
  nonce: string
  expiresAt: string
}

export interface VerifyRequest {
  wallet: string
  signature: string
  nonce: string
}

export interface VerifyResponse {
  token: string
  expiresAt: string
}
