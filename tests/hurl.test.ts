// Listen: i don't have time to say all ehat i did here with comments, just know i made important updates

import { describe, it, expect, vi, beforeEach } from 'vitest'
import hurl, { HurlError, createInstance, clearCache } from '../src/index'

// FIX: Added a helper to easily mock fetch responses for robust testing
const fetchMock = vi.fn()
globalThis.fetch = fetchMock as any

function mockResponse(data: any, status = 200, contentType = 'application/json') {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': contentType, 'content-length': '100' }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
  } as unknown as Response)
}

describe('hurl', () => {
  // FIX: Reset fetch mocks, cache, and defaults before every test to ensure isolation
  beforeEach(() => {
    fetchMock.mockReset()
    clearCache()
    hurl.defaults.reset()
    hurl.interceptors.request.clear()
    hurl.interceptors.response.clear()
    hurl.interceptors.error.clear()
  })

  // your original stuff

  it('exports default instance', () => {
    expect(hurl).toBeDefined()
  })

  it('has all HTTP methods', () => {
    expect(typeof hurl.get).toBe('function')
    expect(typeof hurl.post).toBe('function')
    expect(typeof hurl.put).toBe('function')
    expect(typeof hurl.patch).toBe('function')
    expect(typeof hurl.delete).toBe('function')
    expect(typeof hurl.head).toBe('function')
    expect(typeof hurl.options).toBe('function')
    expect(typeof hurl.request).toBe('function')
    expect(typeof hurl.all).toBe('function')
  })

  it('has defaults API', () => {
    expect(typeof hurl.defaults.set).toBe('function')
    expect(typeof hurl.defaults.get).toBe('function')
    expect(typeof hurl.defaults.reset).toBe('function')
  })

  it('has interceptors API', () => {
    expect(typeof hurl.interceptors.request.use).toBe('function')
    expect(typeof hurl.interceptors.response.use).toBe('function')
    expect(typeof hurl.interceptors.error.use).toBe('function')
  })

  it('can set and get defaults', () => {
    hurl.defaults.set({ baseUrl: 'https://api.example.com', timeout: 5000 })
    const defaults = hurl.defaults.get()
    expect(defaults.baseUrl).toBe('https://api.example.com')
    expect(defaults.timeout).toBe(5000)
    hurl.defaults.reset()
  })

  it('can create isolated instance', () => {
    const api = hurl.create({ baseUrl: 'https://api.example.com' })
    expect(api.defaults.get().baseUrl).toBe('https://api.example.com')
    expect(hurl.defaults.get().baseUrl).toBeUndefined()
  })

  it('interceptor returns removal function', () => {
    const remove = hurl.interceptors.request.use((url, opts) => ({ url, options: opts }))
    expect(typeof remove).toBe('function')
    remove()
  })

  it('exports HurlError class', () => {
    expect(HurlError).toBeDefined()
    const err = new HurlError({ message: 'test', type: 'HTTP_ERROR', requestId: '123' })
    expect(err.type).toBe('HTTP_ERROR')
    expect(err.requestId).toBe('123')
    expect(err instanceof Error).toBe(true)
  })

  it('exports createInstance', () => {
    expect(typeof createInstance).toBe('function')
  })

  it('exports clearCache', () => {
    expect(typeof clearCache).toBe('function')
    expect(() => clearCache()).not.toThrow()
  })

  // my updates here

  it('makes a successful GET request and parses JSON', async () => {
    fetchMock.mockReturnValueOnce(mockResponse({ success: true }))
    const res = await hurl.get('https://api.example.com/data')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.data).toEqual({ success: true })
    expect(res.status).toBe(200)
  })

  it('throws a HurlError on 4xx/5xx HTTP errors', async () => {
    fetchMock.mockReturnValueOnce(mockResponse({ error: 'Not Found' }, 404))
    
    await expect(hurl.get('https://api.example.com/404')).rejects.toThrowError(HurlError)
    
    try {
      await hurl.get('https://api.example.com/404')
    } catch (err: any) {
      expect(err.type).toBe('HTTP_ERROR')
      expect(err.status).toBe(404)
      expect(err.data).toEqual({ error: 'Not Found' })
    }
  })

  it('retries requests on failure based on retry config', async () => {
    // Fail twice, succeed on the third try
    fetchMock
      .mockReturnValueOnce(mockResponse('Error', 500))
      .mockReturnValueOnce(mockResponse('Error', 500))
      .mockReturnValueOnce(mockResponse({ success: true }, 200))

    const res = await hurl.get('https://api.example.com/retry', {
      retry: { count: 3, delay: 10, backoff: 'linear' }
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(res.data).toEqual({ success: true })
  })

  it('caches GET requests and serves them from memory', async () => {
    fetchMock.mockReturnValueOnce(mockResponse({ cached: true }))

    // First request hits the network
    const res1 = await hurl.get('https://api.example.com/cache', { cache: { ttl: 5000 } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res1.fromCache).toBe(false)

    // Second request should hit the cache
    const res2 = await hurl.get('https://api.example.com/cache', { cache: { ttl: 5000 } })
    expect(fetchMock).toHaveBeenCalledTimes(1) // Still 1!
    expect(res2.fromCache).toBe(true)
    expect(res2.data).toEqual({ cached: true })
  })

  it('deduplicates simultaneous GET requests', async () => {
    fetchMock.mockImplementationOnce(() => 
      new Promise(resolve => setTimeout(() => resolve(mockResponse({ dedup: true })), 50))
    )

    const [res1, res2] = await Promise.all([
      hurl.get('https://api.example.com/dedup', { deduplicate: true }),
      hurl.get('https://api.example.com/dedup', { deduplicate: true })
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1) // Only one network call was made
    expect(res1.data).toEqual({ dedup: true })
    expect(res2.data).toEqual({ dedup: true })
  })

  it('runs interceptors in order', async () => {
    fetchMock.mockReturnValueOnce(mockResponse({ original: true }))

    hurl.interceptors.request.use((url, options) => {
      return {
        url,
        options: { ...options, headers: { ...options.headers, 'X-Injected': 'true' } }
      }
    })

    hurl.interceptors.response.use((response) => {
      response.data = { modified: true }
      return response
    })

    const res = await hurl.get('https://api.example.com/intercept')
    const fetchArgs = fetchMock.mock.calls[0]
    expect(fetchArgs[1].headers['X-Injected']).toBe('true')
    expect(res.data).toEqual({ modified: true })
  })
})
