import AsyncStorage from '@react-native-async-storage/async-storage'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { Base64 } from 'js-base64'
import { PropsWithChildren, createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InteractionManager } from 'react-native'
import { fetchChallenge, verifySignature } from '@/features/auth/api/auth-client'
import { getAuthToken, setAuthToken } from '@/features/auth/auth-token-store'

const AUTH_STORAGE_KEY = 'reelflip.auth.state.v1'

interface PersistedAuthState {
  token: string
  wallet: string
  expiresAt: string
}

interface AuthContextValue {
  isAuthenticated: boolean
  isAuthenticating: boolean
  signIn: () => Promise<boolean>
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: PropsWithChildren) {
  const { account, signMessage } = useMobileWallet()
  const walletAddress = account?.address as string | undefined

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const prevWalletRef = useRef<string | undefined>(undefined)

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    let isMounted = true

    async function hydrate() {
      try {
        const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY)
        if (!isMounted || !stored) {
          return
        }

        const parsed = JSON.parse(stored) as PersistedAuthState
        if (!parsed.token || !parsed.wallet || !parsed.expiresAt) {
          return
        }

        // Check expiry
        if (Date.now() >= new Date(parsed.expiresAt).getTime()) {
          void AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {})
          return
        }

        // Check wallet match
        if (walletAddress && parsed.wallet !== walletAddress) {
          void AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {})
          return
        }

        setAuthToken(parsed.token)
        setIsAuthenticated(true)
      } catch {
        // Silent — start unauthenticated
      }
    }

    void hydrate()

    return () => {
      isMounted = false
    }
  }, [walletAddress])

  // Clear auth when wallet changes or disconnects
  useEffect(() => {
    const prev = prevWalletRef.current
    prevWalletRef.current = walletAddress

    if (prev !== undefined && prev !== walletAddress) {
      setAuthToken(null)
      setIsAuthenticated(false)
      InteractionManager.runAfterInteractions(() => {
        void AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {})
      })
    }
  }, [walletAddress])

  const signIn = useCallback(async (): Promise<boolean> => {
    // Already authenticated with a valid token
    if (getAuthToken() && isAuthenticated) {
      return true
    }

    if (!walletAddress) {
      return false
    }

    setIsAuthenticating(true)

    try {
      // 1. Get challenge from backend
      const challenge = await fetchChallenge(walletAddress)

      // 2. Sign challenge message with wallet
      const messageBytes = new TextEncoder().encode(challenge.message)
      const signatureBytes = await signMessage(messageBytes)

      // 3. Encode signature as base64
      const signatureBase64 = Base64.fromUint8Array(signatureBytes)

      // 4. Verify with backend to get JWT
      const result = await verifySignature({
        wallet: walletAddress,
        signature: signatureBase64,
        nonce: challenge.nonce,
      })

      // 5. Store token
      setAuthToken(result.token)
      setIsAuthenticated(true)

      // 6. Persist to AsyncStorage
      InteractionManager.runAfterInteractions(() => {
        const payload: PersistedAuthState = {
          token: result.token,
          wallet: walletAddress,
          expiresAt: result.expiresAt,
        }
        void AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload)).catch(() => {})
      })

      return true
    } catch {
      return false
    } finally {
      setIsAuthenticating(false)
    }
  }, [isAuthenticated, signMessage, walletAddress])

  const signOut = useCallback(() => {
    setAuthToken(null)
    setIsAuthenticated(false)
    InteractionManager.runAfterInteractions(() => {
      void AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {})
    })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      isAuthenticating,
      signIn,
      signOut,
    }),
    [isAuthenticated, isAuthenticating, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export { AuthContext }
