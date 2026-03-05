import { HurlResponse } from '../types/index.js'
import { buildParseError } from './errors.js'
import { trackDownloadProgress } from '../features/progress.js'
import { ProgressCallback } from '../types/index.js'

export function parseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

export async function parseResponseBody(
  response: Response,
  requestId: string,
  method?: string,
  stream?: boolean,
  onDownloadProgress?: ProgressCallback
): Promise<unknown> {
  
  if (method === 'HEAD') return null

  
  if (response.status === 204) return null
  if (response.headers.get('content-length') === '0') return null

  
  if (stream) {
    return response.body
  }

  const contentType = response.headers.get('content-type') ?? ''

  // Binary content types: images, video, audio, arbitrary binary data
  const isBinary =
    contentType.includes('application/octet-stream') ||
    contentType.includes('image/') ||
    contentType.includes('video/') ||
    contentType.includes('audio/')

  
  if (onDownloadProgress && isBinary) {
    try {
      return await trackDownloadProgress(response, onDownloadProgress)
    } catch (e) {
      throw buildParseError((e as Error).message, requestId)
    }
  }

  try {
    if (contentType.includes('application/json')) {
      return await response.json()
    }

    if (contentType.includes('text/')) {
      return await response.text()
    }

    if (isBinary) {
      
      return await response.arrayBuffer()
    }

    
    return await response.text()
  } catch (e) {
    throw buildParseError((e as Error).message, requestId)
  }
}

export function buildResponse<T>(
  data: T,
  response: Response,
  requestId: string,
  start: number
): HurlResponse<T> {
  const end = Date.now()
  return {
    data,
    status: response.status,
    statusText: response.statusText,
    headers: parseHeaders(response.headers),
    requestId,
    timing: { start, end, duration: end - start },
    fromCache: false,
  }
}
