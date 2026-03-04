import { HurlRequestOptions, HurlResponse, HurlDefaults, HurlError } from '../types/index.js'
import { buildHttpError, buildNetworkError, buildTimeoutError, buildAbortError } from './errors.js'
import { parseResponseBody, buildResponse, parseHeaders } from './response.js'
import { applyAuth } from '../features/auth.js'
import { normalizeRetry, shouldRetry, waitForRetry } from '../features/retry.js'
import { getCacheKey, getFromCache, setInCache } from '../features/cache.js'
import { getInFlight, setInFlight } from '../features/dedup.js'
import { debugRequest, debugResponse, debugError } from '../features/debug.js'

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

function buildUrl(base: string, url: string, query?: Record<string, string | number | boolean>) {
  let fullUrl: string

  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (base) {
      const baseOrigin = new URL(base).origin
      const urlOrigin = new URL(url).origin
      if (baseOrigin !== urlOrigin) {
        throw new Error(
          `Absolute URL "${url}" does not match baseUrl origin "${baseOrigin}". ` +
          `Pass the full URL without baseUrl, or use a path-relative URL.`
        )
      }
    }
    fullUrl = url
  } else if (url.startsWith('//')) {
    throw new Error(
      `Protocol-relative URLs are not supported. Use an explicit https:// or http:// scheme.`
    )
  } else {
    fullUrl = base
      ? `${base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
      : url
  }

  if (!query || Object.keys(query).length === 0) return fullUrl

  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    params.set(k, String(v))
  }
  return `${fullUrl}?${params.toString()}`
}

function buildHeaders(
  options: HurlRequestOptions,
  defaults: HurlDefaults
): Record<string, string> {
  const headers: Record<string, string> = {
    ...defaults.headers,
    ...options.headers,
  }

  const body = options.body
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json'
  }

  return headers
}

function buildBody(body: unknown): BodyInit | undefined {
  if (body === undefined || body === null) return undefined
  if (body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer) return body as BodyInit
  if (typeof body === 'string') return body
  return JSON.stringify(body)
}

function isTimeoutAbort(err: unknown, timedOut: boolean): boolean {
  if (timedOut) return true
  const e = err as any
  if (e?.name === 'TimeoutError') return true
  if (e?.name === 'AbortError' && e?.message?.includes('timeout')) return true
  return false
}

export async function executeRequest<T>(
  url: string,
  options: HurlRequestOptions,
  defaults: HurlDefaults
): Promise<HurlResponse<T>> {
  const requestId = options.requestId ?? generateId()
  const method = options.method ?? 'GET'
  const start = Date.now()
  const retryConfig = normalizeRetry(options.retry ?? defaults.retry)
  const debug = options.debug ?? defaults.debug ?? false

  const query = { ...defaults.query, ...options.query } as Record<string, string | number | boolean>
  const headers = buildHeaders(options, defaults)
  const timeout = options.timeout ?? defaults.timeout

  const auth = options.auth ?? defaults.auth
  if (auth) applyAuth(headers, query as Record<string, string>, auth)

  const fullUrl = buildUrl(defaults.baseUrl ?? '', url, Object.keys(query).length > 0 ? query : undefined)

  const cacheConfig = options.cache ?? defaults.cache
  const shouldCache = !!cacheConfig && !cacheConfig.bypass && method === 'GET'

  if (shouldCache) {
    const cacheKey = getCacheKey(fullUrl, cacheConfig)
    const cached = getFromCache(cacheKey)
    if (cached) {
      if (debug) debugResponse(cached)
      return cached as HurlResponse<T>
    }
  }

  const deduplicate = options.deduplicate ?? defaults.deduplicate ?? false

  if (deduplicate && method === 'GET') {
    const inflight = getInFlight(fullUrl)
    if (inflight) return inflight as Promise<HurlResponse<T>>
  }

  if (debug) debugRequest(fullUrl, { ...options, method })

  const run = async (attempt: number): Promise<HurlResponse<T>> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let timedOut = false

    const controller = new AbortController()

    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort())
    }

    if (timeout) {
      timeoutId = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeout)
    }

    try {
      const response = await fetch(fullUrl, {
        method,
        headers,
        body: buildBody(options.body),
        signal: controller.signal,
        redirect: (options.followRedirects ?? true) ? 'follow' : 'manual',
      })

      if (timeoutId) clearTimeout(timeoutId)

      const data = await parseResponseBody(response, requestId, options.onDownloadProgress, method) as T

      if (!response.ok) {
        throw buildHttpError({
          status: response.status,
          statusText: response.statusText,
          data,
          headers: parseHeaders(response.headers),
          requestId,
          retries: attempt,
        })
      }

      const result = buildResponse<T>(data, response, requestId, start)

      if (shouldCache && cacheConfig) {
        setInCache(getCacheKey(fullUrl, cacheConfig), result, cacheConfig)
      }

      if (debug) debugResponse(result)

      return result
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId)

      let hurlError: HurlError

      if (err instanceof HurlError) {
        hurlError = err
      } else if ((err as Error).name === 'AbortError' || (err as Error).name === 'TimeoutError') {
        hurlError = isTimeoutAbort(err, timedOut)
          ? buildTimeoutError(timeout ?? 0, requestId)
          : buildAbortError(requestId)
      } else {
        hurlError = buildNetworkError((err as Error).message, requestId)
      }

      hurlError.retries = attempt

      if (retryConfig && shouldRetry(hurlError, retryConfig, attempt)) {
        if (debug) console.log(`[hurl] retrying (${attempt + 1}/${retryConfig.count})...`)
        await waitForRetry(retryConfig, attempt)
        return run(attempt + 1)
      }

      if (debug) debugError(hurlError)
      throw hurlError
    }
  }

  const promise = run(0)

  if (deduplicate && method === 'GET') {
    setInFlight(fullUrl, promise as Promise<HurlResponse>)
  }

  return promise
}
