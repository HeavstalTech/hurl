import { HurlResponse, CacheConfig } from '../types/index.js'

type CacheEntry = {
  response: HurlResponse
  expiresAt: number
}

const store = new Map<string, CacheEntry>()
// FIX: Set a maximum cache size to prevent unbounded memory growth (OOM)
const MAX_CACHE_SIZE = 1000

export function getCacheKey(url: string, config?: CacheConfig) {
  return config?.key ?? url
}

export function getFromCache(key: string): HurlResponse | null {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }

  // FIX: Deep clone ArrayBuffer to prevent cache mutation by consumers
  let safeData = entry.response.data
  if (safeData instanceof ArrayBuffer) {
    safeData = safeData.slice(0)
  }

  return { ...entry.response, data: safeData, fromCache: true }
}

export function setInCache(key: string, response: HurlResponse, config: CacheConfig) {
  // FIX: Evict oldest entry (first key in Map) if we exceed MAX_CACHE_SIZE to prevent memory leaks
  if (store.size >= MAX_CACHE_SIZE && !store.has(key)) {
    const oldestKey = store.keys().next().value
    if (oldestKey !== undefined) {
      store.delete(oldestKey)
    }
  }

  store.set(key, {
    response,
    expiresAt: Date.now() + config.ttl,
  })
}

export function invalidateCache(key: string) {
  store.delete(key)
}

export function clearCache() {
  store.clear()
}
