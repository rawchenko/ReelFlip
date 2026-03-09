import Constants from 'expo-constants'
import { Platform } from 'react-native'

export const DEFAULT_ANDROID_API_URL = 'http://10.0.2.2:3001'
export const DEFAULT_IOS_API_URL = 'http://127.0.0.1:3001'
export const DEFAULT_API_PORT = '3001'
export const LOCAL_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

function getHostFromUri(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  try {
    const candidate = trimmed.includes('://') ? trimmed : `http://${trimmed}`
    return new URL(candidate).hostname
  } catch {
    return null
  }
}

function getExpoDevHost(): string | null {
  const candidates = [Constants.expoConfig?.hostUri, Constants.platform?.hostUri, Constants.linkingUri]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      continue
    }

    const host = getHostFromUri(candidate)
    if (!host) {
      continue
    }

    if (Platform.OS === 'android' && LOCAL_HOSTS.has(host)) {
      return '10.0.2.2'
    }

    return host
  }

  return null
}

export function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL
  if (configured && configured.length > 0) {
    return configured
  }

  const expoDevHost = getExpoDevHost()
  if (expoDevHost) {
    return `http://${expoDevHost}:${DEFAULT_API_PORT}`
  }

  return Platform.OS === 'android' ? DEFAULT_ANDROID_API_URL : DEFAULT_IOS_API_URL
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}
