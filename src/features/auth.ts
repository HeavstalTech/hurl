import { AuthConfig } from '../types/index.js'

function toBase64(str: string): string {
  
  if (typeof globalThis !== 'undefined' && (globalThis as any).Buffer) {
    return (globalThis as any).Buffer.from(str).toString('base64')
  }
  
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  )
}

export function applyAuth(headers: Record<string, string>, query: Record<string, string>, auth: AuthConfig) {
  if (auth.type === 'bearer') {
    headers['Authorization'] = `Bearer ${auth.token}`
  }

  if (auth.type === 'basic') {
    const encoded = toBase64(`${auth.username}:${auth.password}`)
    headers['Authorization'] = `Basic ${encoded}`
  }

  if (auth.type === 'apikey') {
    if (auth.in === 'query') {
      query[auth.key] = auth.value
    } else {
      headers[auth.key] = auth.value
    }
  }
}
