export type CacheBackend = 'redis' | 'memory'

export interface CacheStore {
  readonly backend: CacheBackend
  isAvailable(): boolean
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  del(key: string): Promise<void>
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>
  increment(key: string): Promise<number>
  close(): Promise<void>
}

export interface CacheLogger {
  info?: (obj: unknown, msg?: string) => void
  warn?: (obj: unknown, msg?: string) => void
}
