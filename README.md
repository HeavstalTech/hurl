<div align="center">

# @firekid/hurl

[![npm version](https://img.shields.io/npm/v/@firekid/hurl?style=flat-square&logo=npm&logoColor=white&color=CB3837)](https://npmjs.com/package/@firekid/hurl)
[![npm downloads](https://img.shields.io/npm/dm/@firekid/hurl?style=flat-square&logo=npm&logoColor=white&color=CB3837)](https://npmjs.com/package/@firekid/hurl)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/@firekid/hurl?style=flat-square&logo=webpack&logoColor=white&color=2563EB)](https://bundlephobia.com/package/@firekid/hurl)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=flat-square)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/firekid-is-him/hurl?style=flat-square&logo=github&logoColor=white&color=FACC15)](https://github.com/firekid-is-him/hurl/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/firekid-is-him/hurl?style=flat-square&logo=github&logoColor=white&color=8B5CF6)](https://github.com/firekid-is-him/hurl/network/members)
[![CI](https://img.shields.io/github/actions/workflow/status/firekid-is-him/hurl/ci.yml?style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/firekid-is-him/hurl/actions)
[![Website](https://img.shields.io/badge/website-hurl.firekidofficial.name.ng-black?style=flat-square&logo=googlechrome&logoColor=white)](https://hurl.firekidofficial.name.ng)

A modern HTTP client for Node.js and edge runtimes.  
Zero dependencies. Full TypeScript support. Under 3KB gzipped.

</div>

---

## Installation

```bash
npm install @firekid/hurl
yarn add @firekid/hurl
pnpm add @firekid/hurl
```

## Quick Start

```ts
import hurl from '@firekid/hurl'

const res = await hurl.get('https://api.example.com/users')

res.data        // parsed response body
res.status      // 200
res.headers     // Record<string, string>
res.requestId   // unique ID for this request
res.timing      // { start, end, duration }
res.fromCache   // boolean
```

## Core Concepts

Every method on `hurl` returns a `HurlResponse<T>` object. The response always includes the parsed data, status code, headers, a unique request ID, timing information, and a flag indicating whether the response was served from cache.

Defaults are set globally using `hurl.defaults.set()` and apply to every request made on that instance. Isolated instances with their own defaults can be created using `hurl.create()`.

Interceptors run in the order they were registered and can be async. A request interceptor receives the URL and options before the request is sent. A response interceptor receives the full response object. An error interceptor receives a `HurlError` and can either return a modified error or resolve it into a response.

## HTTP Methods

```ts
hurl.get<T>(url, options?)
hurl.post<T>(url, body?, options?)
hurl.put<T>(url, body?, options?)
hurl.patch<T>(url, body?, options?)
hurl.delete<T>(url, options?)
hurl.head(url, options?)
hurl.options<T>(url, options?)
hurl.request<T>(url, options?)
```

## Global Defaults

```ts
hurl.defaults.set({
  baseUrl: 'https://api.example.com',
  headers: { 'x-api-version': '2' },
  timeout: 10000,
  retry: 3,
})

hurl.defaults.get()
hurl.defaults.reset()
```

## Request Options

All methods accept a `HurlRequestOptions` object.

```ts
type HurlRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
  headers?: Record<string, string>
  body?: unknown
  query?: Record<string, string | number | boolean>
  timeout?: number
  retry?: RetryConfig | number
  auth?: AuthConfig
  proxy?: ProxyConfig
  cache?: CacheConfig
  signal?: AbortSignal
  followRedirects?: boolean
  maxRedirects?: number
  onUploadProgress?: ProgressCallback
  onDownloadProgress?: ProgressCallback
  stream?: boolean
  debug?: boolean
  requestId?: string
  deduplicate?: boolean
}
```

## Authentication

```ts
hurl.defaults.set({
  auth: { type: 'bearer', token: 'my-token' }
})

hurl.defaults.set({
  auth: { type: 'basic', username: 'admin', password: 'secret' }
})

hurl.defaults.set({
  auth: { type: 'apikey', key: 'x-api-key', value: 'my-key' }
})

hurl.defaults.set({
  auth: { type: 'apikey', key: 'token', value: 'my-key', in: 'query' }
})
```

## Retry

```ts
await hurl.get('/users', { retry: 3 })

await hurl.get('/users', {
  retry: {
    count: 3,
    delay: 300,
    backoff: 'exponential',
    on: [500, 502, 503],
  }
})
```

`retry` accepts a number (shorthand for count with exponential backoff) or a full `RetryConfig` object. Retries are not triggered for abort errors. If no `on` array is provided, retries fire on network errors, timeout errors, and any 5xx status.

## Timeout and Abort

```ts
await hurl.get('/users', { timeout: 5000 })

const controller = new AbortController()
setTimeout(() => controller.abort(), 3000)
await hurl.get('/users', { signal: controller.signal })
```

## Interceptors

```ts
const remove = hurl.interceptors.request.use((url, options) => {
  return {
    url,
    options: {
      ...options,
      headers: { ...options.headers, 'x-trace-id': crypto.randomUUID() },
    },
  }
})

remove()

hurl.interceptors.response.use((response) => {
  console.log(response.status, response.timing.duration)
  return response
})

hurl.interceptors.error.use((error) => {
  if (error.status === 401) redirectToLogin()
  return error
})

hurl.interceptors.request.clear()
hurl.interceptors.response.clear()
hurl.interceptors.error.clear()
```

## File Upload with Progress

```ts
const form = new FormData()
form.append('file', file)

await hurl.post('/upload', form, {
  onUploadProgress: ({ loaded, total, percent }) => {
    console.log(`${percent}%`)
  }
})
```

## Download Progress

```ts
await hurl.get('/large-file', {
  onDownloadProgress: ({ loaded, total, percent }) => {
    console.log(`${percent}%`)
  }
})
```

## Caching

Caching only applies to GET requests. Responses are stored in memory with a TTL in milliseconds.

```ts
await hurl.get('/users', { cache: { ttl: 60000 } })

await hurl.get('/users', { cache: { ttl: 60000, key: 'all-users' } })

await hurl.get('/users', { cache: { ttl: 60000, bypass: true } })
```

## Request Deduplication

When `deduplicate` is true and the same GET URL is called multiple times simultaneously, only one network request is made.

```ts
const [a, b] = await Promise.all([
  hurl.get('/users', { deduplicate: true }),
  hurl.get('/users', { deduplicate: true }),
])
```

## Proxy

```ts
await hurl.get('/users', {
  proxy: { url: 'http://proxy.example.com:8080' }
})

await hurl.get('/users', {
  proxy: {
    url: 'socks5://proxy.example.com:1080',
    auth: { username: 'user', password: 'pass' }
  }
})
```

## Parallel Requests

```ts
const [users, posts] = await hurl.all([
  hurl.get('/users'),
  hurl.get('/posts'),
])
```

## Isolated Instances

```ts
const api = hurl.create({
  baseUrl: 'https://api.example.com',
  auth: { type: 'bearer', token: 'my-token' },
  timeout: 5000,
  retry: 3,
})

await api.get('/users')

const adminApi = api.extend({
  headers: { 'x-role': 'admin' }
})
```

## Debug Mode

Logs the full request (method, url, headers, body, query, timeout, retry config) and response (status, timing, headers, data) to the console. Errors and retries are also logged.

```ts
await hurl.get('/users', { debug: true })
```

## Error Handling

`hurl` throws a `HurlError` on HTTP errors (4xx, 5xx), network failures, timeouts, aborts, and parse failures. It never resolves silently on bad status codes.

```ts
import hurl, { HurlError } from '@firekid/hurl'

try {
  await hurl.get('/users')
} catch (err) {
  if (err instanceof HurlError) {
    err.type        // 'HTTP_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT_ERROR' | 'ABORT_ERROR' | 'PARSE_ERROR'
    err.status      // 404
    err.statusText  // 'Not Found'
    err.data        // parsed error response body
    err.headers     // response headers
    err.requestId   // same ID as the request
    err.retries     // number of retries attempted
  }
}
```

## TypeScript

```ts
type User = { id: number; name: string }

const res = await hurl.get<User[]>('/users')
res.data

const created = await hurl.post<User>('/users', { name: 'John' })
created.data.id
```

## Response Shape

```ts
type HurlResponse<T> = {
  data: T
  status: number
  statusText: string
  headers: Record<string, string>
  requestId: string
  timing: {
    start: number
    end: number
    duration: number
  }
  fromCache: boolean
}
```

## Environment Support

`hurl` runs anywhere the Fetch API is available.

- Node.js 18 and above
- Cloudflare Workers
- Vercel Edge Functions
- Deno
- Bun

Exports both ESM (`import`) and CommonJS (`require`).

## API Reference

### hurl.get(url, options?)
Sends a GET request. Returns `Promise<HurlResponse<T>>`.

### hurl.post(url, body?, options?)
Sends a POST request. Body is auto-serialized to JSON if it is a plain object. Returns `Promise<HurlResponse<T>>`.

### hurl.put(url, body?, options?)
Sends a PUT request. Returns `Promise<HurlResponse<T>>`.

### hurl.patch(url, body?, options?)
Sends a PATCH request. Returns `Promise<HurlResponse<T>>`.

### hurl.delete(url, options?)
Sends a DELETE request. Returns `Promise<HurlResponse<T>>`.

### hurl.head(url, options?)
Sends a HEAD request. Returns `Promise<HurlResponse<void>>`.

### hurl.options(url, options?)
Sends an OPTIONS request. Returns `Promise<HurlResponse<T>>`.

### hurl.request(url, options?)
Sends a request with the method specified in options. Defaults to GET. Returns `Promise<HurlResponse<T>>`.

### hurl.all(requests)
Runs an array of requests in parallel. Returns a promise that resolves when all requests complete.

### hurl.create(defaults?)
Creates a new isolated instance with its own defaults, interceptors, and state.

### hurl.extend(defaults?)
Creates a new instance that inherits the current defaults and merges in the provided ones.

### hurl.defaults.set(defaults)
Sets global defaults for the current instance. Merged into every request.

### hurl.defaults.get()
Returns the current defaults object.

### hurl.defaults.reset()
Resets defaults to the values provided when the instance was created.

### hurl.interceptors.request.use(fn)
Registers a request interceptor. Returns a function that removes the interceptor when called.

### hurl.interceptors.response.use(fn)
Registers a response interceptor. Returns a function that removes the interceptor when called.

### hurl.interceptors.error.use(fn)
Registers an error interceptor. Returns a function that removes the interceptor when called.

### clearCache()
Clears the entire in-memory response cache.

```ts
import { clearCache } from '@firekid/hurl'
clearCache()
```

## License

MIT

---

<div align="center">

Built by Firekid♥️ — All rights reserved

</div>
