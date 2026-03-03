import AsyncStorage from '@react-native-async-storage/async-storage'
import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const ONBOARDING_STORAGE_KEY = 'reelflip.onboarding.state.v1'

export type OnboardingWalletOption = 'seeker' | 'walletconnect' | 'import-seed-phrase'
export type OnboardingSlippage = 'auto' | '1%' | '2%' | 'custom'
export type OnboardingBaseCurrency = 'USDC' | 'SOL' | 'SKR'

export interface OnboardingPreferences {
  walletOption: OnboardingWalletOption
}

export interface OnboardingSafetyPreferences {
  acceptedTermsOfService: boolean
  enablePriceAlerts: boolean
  enableBiometricSigning: boolean
}

export interface OnboardingLaunchPreferences {
  baseCurrency: OnboardingBaseCurrency
  defaultSlippage: OnboardingSlippage
}

export interface OnboardingFinishPreferences {
  enteredApp: boolean
}

export const DEFAULT_ONBOARDING_PROFILE: OnboardingPreferences = {
  walletOption: 'seeker',
}

export const DEFAULT_ONBOARDING_SAFETY: OnboardingSafetyPreferences = {
  acceptedTermsOfService: false,
  enableBiometricSigning: false,
  enablePriceAlerts: false,
}

export const DEFAULT_ONBOARDING_LAUNCH: OnboardingLaunchPreferences = {
  baseCurrency: 'USDC',
  defaultSlippage: '1%',
}

interface PersistedOnboardingState {
  completedAt?: string
  stage: 0 | 1 | 2 | 3 | 4 | 5
  preferences?: OnboardingPreferences
  safetyPreferences?: OnboardingSafetyPreferences
  launchPreferences?: OnboardingLaunchPreferences
  finishPreferences?: OnboardingFinishPreferences
  finalPreferences?: OnboardingLaunchPreferences
}

interface OnboardingContextValue {
  hasCompletedOnboardingIntro: boolean
  hasCompletedOnboardingProfile: boolean
  hasCompletedOnboardingSafety: boolean
  hasCompletedOnboardingLaunch: boolean
  hasCompletedOnboarding: boolean
  hasHydrated: boolean
  launchPreferences?: OnboardingLaunchPreferences
  profilePreferences?: OnboardingPreferences
  safetyPreferences?: OnboardingSafetyPreferences
  finishPreferences?: OnboardingFinishPreferences
  completeOnboardingIntro: () => Promise<void>
  completeOnboardingProfile: (preferences: OnboardingPreferences) => Promise<void>
  completeOnboardingSafety: (safetyPreferences: OnboardingSafetyPreferences) => Promise<void>
  completeOnboardingLaunch: (launchPreferences: OnboardingLaunchPreferences) => Promise<void>
  completeOnboarding: (finishPreferences?: OnboardingFinishPreferences) => Promise<void>
  resetOnboarding: () => Promise<void>
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined)

function isWalletOption(value: unknown): value is OnboardingWalletOption {
  return value === 'seeker' || value === 'walletconnect' || value === 'import-seed-phrase'
}

function isSlippageOption(value: unknown): value is OnboardingSlippage {
  return value === 'auto' || value === '1%' || value === '2%' || value === 'custom'
}

function isBaseCurrency(value: unknown): value is OnboardingBaseCurrency {
  return value === 'USDC' || value === 'SOL' || value === 'SKR'
}

function normalizeProfilePreferences(value: unknown): OnboardingPreferences | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const walletOption = (value as { walletOption?: unknown }).walletOption
  if (!isWalletOption(walletOption)) {
    return undefined
  }

  return { walletOption }
}

function normalizeSafetyPreferences(value: unknown): OnboardingSafetyPreferences | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const acceptedTermsOfService = (value as { acceptedTermsOfService?: unknown }).acceptedTermsOfService
  const enablePriceAlerts = (value as { enablePriceAlerts?: unknown }).enablePriceAlerts
  const enableBiometricSigning = (value as { enableBiometricSigning?: unknown }).enableBiometricSigning

  if (
    typeof acceptedTermsOfService !== 'boolean' ||
    typeof enablePriceAlerts !== 'boolean' ||
    typeof enableBiometricSigning !== 'boolean'
  ) {
    return undefined
  }

  return {
    acceptedTermsOfService,
    enableBiometricSigning,
    enablePriceAlerts,
  }
}

function normalizeLaunchPreferences(value: unknown): OnboardingLaunchPreferences | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const rawBaseCurrency = (value as { baseCurrency?: unknown }).baseCurrency
  const rawDefaultSlippage = (value as { defaultSlippage?: unknown }).defaultSlippage

  if (isBaseCurrency(rawBaseCurrency) && isSlippageOption(rawDefaultSlippage)) {
    return {
      baseCurrency: rawBaseCurrency,
      defaultSlippage: rawDefaultSlippage,
    }
  }

  // Backward-compatibility for legacy onboarding values persisted in v1.
  const baseCurrency: OnboardingBaseCurrency | undefined =
    rawBaseCurrency === 'USD' ? 'USDC' : rawBaseCurrency === 'ETH' ? 'SOL' : undefined
  const defaultSlippage: OnboardingSlippage | undefined =
    rawDefaultSlippage === '0.3%'
      ? 'auto'
      : rawDefaultSlippage === '0.5%'
        ? '1%'
        : rawDefaultSlippage === '1.0%'
          ? '2%'
          : undefined

  if (!baseCurrency || !defaultSlippage) {
    return undefined
  }

  return { baseCurrency, defaultSlippage }
}

function normalizeFinishPreferences(value: unknown): OnboardingFinishPreferences | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const enteredApp = (value as { enteredApp?: unknown }).enteredApp
  if (typeof enteredApp !== 'boolean') {
    return undefined
  }

  return { enteredApp }
}

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [hasHydrated, setHasHydrated] = useState(false)
  const [onboardingStage, setOnboardingStage] = useState<0 | 1 | 2 | 3 | 4 | 5>(0)
  const [finishPreferences, setFinishPreferences] = useState<OnboardingFinishPreferences | undefined>(undefined)
  const [profilePreferences, setProfilePreferences] = useState<OnboardingPreferences | undefined>(undefined)
  const [safetyPreferences, setSafetyPreferences] = useState<OnboardingSafetyPreferences | undefined>(undefined)
  const [launchPreferences, setLaunchPreferences] = useState<OnboardingLaunchPreferences | undefined>(undefined)

  useEffect(() => {
    let isMounted = true

    async function hydrate() {
      try {
        const storedValue = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)
        if (!isMounted) {
          return
        }

        if (!storedValue) {
          setOnboardingStage(0)
          return
        }

        if (storedValue === '1' || storedValue === 'true') {
          setOnboardingStage(5)
          setProfilePreferences(DEFAULT_ONBOARDING_PROFILE)
          setSafetyPreferences(DEFAULT_ONBOARDING_SAFETY)
          setLaunchPreferences(DEFAULT_ONBOARDING_LAUNCH)
          setFinishPreferences({ enteredApp: true })
          return
        }

        const parsed = JSON.parse(storedValue) as PersistedOnboardingState
        const nextProfile = normalizeProfilePreferences(parsed.preferences)
        const nextSafety = normalizeSafetyPreferences(parsed.safetyPreferences)
        const nextLaunch = normalizeLaunchPreferences(parsed.launchPreferences ?? parsed.finalPreferences)
        const nextFinish = normalizeFinishPreferences(parsed.finishPreferences)

        setProfilePreferences(nextProfile)
        setSafetyPreferences(nextSafety)
        setLaunchPreferences(nextLaunch)
        setFinishPreferences(nextFinish)

        if (parsed.completedAt) {
          setOnboardingStage(5)
          return
        }

        const safeStage =
          parsed.stage === 1 || parsed.stage === 2 || parsed.stage === 3 || parsed.stage === 4 || parsed.stage === 5
            ? parsed.stage
            : 0
        setOnboardingStage(safeStage)
      } catch {
        if (isMounted) {
          setOnboardingStage(0)
          setFinishPreferences(undefined)
          setProfilePreferences(undefined)
          setSafetyPreferences(undefined)
          setLaunchPreferences(undefined)
        }
        void AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY).catch(() => {})
      } finally {
        if (isMounted) {
          setHasHydrated(true)
        }
      }
    }

    void hydrate()

    return () => {
      isMounted = false
    }
  }, [])

  const completeOnboardingIntro = useCallback(async () => {
    setOnboardingStage((currentStage) => (currentStage >= 1 ? currentStage : 1))
    const persistedStage = onboardingStage >= 1 ? onboardingStage : 1
    const payload: PersistedOnboardingState = {
      finishPreferences,
      launchPreferences,
      preferences: profilePreferences,
      safetyPreferences,
      stage: persistedStage,
    }

    try {
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(payload))
    } catch {}
  }, [finishPreferences, launchPreferences, onboardingStage, profilePreferences, safetyPreferences])

  const completeOnboardingProfile = useCallback(
    async (preferences: OnboardingPreferences) => {
      setOnboardingStage((currentStage) => (currentStage >= 2 ? currentStage : 2))
      setProfilePreferences(preferences)
      const persistedStage = onboardingStage >= 2 ? onboardingStage : 2
      const payload: PersistedOnboardingState = {
        finishPreferences,
        launchPreferences,
        preferences,
        safetyPreferences,
        stage: persistedStage,
      }

      try {
        await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(payload))
      } catch {}
    },
    [finishPreferences, launchPreferences, onboardingStage, safetyPreferences],
  )

  const completeOnboardingSafety = useCallback(
    async (nextSafetyPreferences: OnboardingSafetyPreferences) => {
      const currentProfile = profilePreferences
      setOnboardingStage((currentStage) => (currentStage >= 3 ? currentStage : 3))
      setSafetyPreferences(nextSafetyPreferences)
      const persistedStage = onboardingStage >= 3 ? onboardingStage : 3
      const payload: PersistedOnboardingState = {
        finishPreferences,
        launchPreferences,
        preferences: currentProfile,
        safetyPreferences: nextSafetyPreferences,
        stage: persistedStage,
      }

      try {
        await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(payload))
      } catch {}
    },
    [finishPreferences, launchPreferences, onboardingStage, profilePreferences],
  )

  const completeOnboardingLaunch = useCallback(
    async (nextLaunchPreferences: OnboardingLaunchPreferences) => {
      const currentProfile = profilePreferences
      const currentSafety = safetyPreferences
      setOnboardingStage((currentStage) => (currentStage >= 4 ? currentStage : 4))
      setLaunchPreferences(nextLaunchPreferences)
      const persistedStage = onboardingStage >= 4 ? onboardingStage : 4
      const payload: PersistedOnboardingState = {
        finishPreferences,
        launchPreferences: nextLaunchPreferences,
        preferences: currentProfile,
        safetyPreferences: currentSafety,
        stage: persistedStage,
      }

      try {
        await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(payload))
      } catch {}
    },
    [finishPreferences, onboardingStage, profilePreferences, safetyPreferences],
  )

  const completeOnboarding = useCallback(
    async (nextFinishPreferences?: OnboardingFinishPreferences) => {
      const currentProfile = profilePreferences
      const currentSafety = safetyPreferences
      const currentLaunch = launchPreferences
      const normalizedFinishPreferences = nextFinishPreferences ?? { enteredApp: true }

      setOnboardingStage(5)
      setFinishPreferences(normalizedFinishPreferences)
      const payload: PersistedOnboardingState = {
        completedAt: new Date().toISOString(),
        finishPreferences: normalizedFinishPreferences,
        launchPreferences: currentLaunch,
        preferences: currentProfile,
        safetyPreferences: currentSafety,
        finalPreferences: currentLaunch,
        stage: 5,
      }

      try {
        await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(payload))
      } catch {}
    },
    [launchPreferences, profilePreferences, safetyPreferences],
  )

  const resetOnboarding = useCallback(async () => {
    setOnboardingStage(0)
    setFinishPreferences(undefined)
    setLaunchPreferences(undefined)
    setProfilePreferences(undefined)
    setSafetyPreferences(undefined)
    try {
      await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY)
    } catch {}
  }, [])

  const value = useMemo<OnboardingContextValue>(
    () => ({
      hasCompletedOnboarding: onboardingStage >= 5,
      hasCompletedOnboardingIntro: onboardingStage >= 1,
      hasCompletedOnboardingLaunch: onboardingStage >= 4,
      hasCompletedOnboardingProfile: onboardingStage >= 2,
      hasCompletedOnboardingSafety: onboardingStage >= 3,
      hasHydrated,
      finishPreferences,
      launchPreferences,
      profilePreferences,
      safetyPreferences,
      completeOnboardingIntro,
      completeOnboardingLaunch,
      completeOnboardingProfile,
      completeOnboardingSafety,
      completeOnboarding,
      resetOnboarding,
    }),
    [
      completeOnboarding,
      completeOnboardingLaunch,
      completeOnboardingIntro,
      completeOnboardingProfile,
      completeOnboardingSafety,
      finishPreferences,
      hasHydrated,
      launchPreferences,
      onboardingStage,
      profilePreferences,
      resetOnboarding,
      safetyPreferences,
    ],
  )

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (!context) {
    throw new Error('useOnboarding must be used inside OnboardingProvider')
  }

  return context
}
