const API_BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '')
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 20000)

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function formatErrorDetails(details: unknown): string {
  if (!details || typeof details !== 'object') return ''

  if (Array.isArray(details)) {
    return details
      .map((item, index) => {
        if (typeof item === 'object' && item !== null) {
          const nested = formatErrorDetails(item)
          return nested ? `row ${index + 1}: ${nested}` : ''
        }

        return String(item)
      })
      .filter(Boolean)
      .join('; ')
  }

  return Object.entries(details as Record<string, unknown>)
    .map(([field, value]) => {
      const message = Array.isArray(value)
        ? value
            .map((item, index) => {
              if (typeof item === 'object' && item !== null) {
                const nested = formatErrorDetails(item)
                return nested ? `row ${index + 1}: ${nested}` : ''
              }

              return String(item)
            })
            .filter(Boolean)
            .join(', ')
        : typeof value === 'object' && value !== null
          ? formatErrorDetails(value)
          : String(value)
      return `${field}: ${message}`
    })
    .filter(Boolean)
    .join('; ')
}

function normalizeEndpoint(endpoint: string): string {
  const splitIndex = endpoint.search(/[?#]/)
  const path = splitIndex === -1 ? endpoint : endpoint.slice(0, splitIndex)
  const suffix = splitIndex === -1 ? '' : endpoint.slice(splitIndex)

  if (!path || path.endsWith('/')) return endpoint
  return `${path}/${suffix}`
}

export async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = window.localStorage.getItem('supabase_access_token')
  const controller = options.signal ? null : new AbortController()
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), API_TIMEOUT_MS)
    : undefined

  const isFormData = options.body instanceof FormData

  let response: Response
  try {
    response = await fetch(`${API_BASE}${normalizeEndpoint(endpoint)}`, {
      ...options,
      signal: options.signal ?? controller?.signal,
      headers: {
        // FormData bodies must NOT set Content-Type - the browser fills in
        // the multipart boundary itself, which a manual header would break.
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    })
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${Math.round(API_TIMEOUT_MS / 1000)} seconds.`, 408)
    }
    throw error
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
    }
  }

  const text = await response.text()
  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')

  if (!isJson) {
    throw new ApiError(
      response.ok
        ? `Expected JSON but received ${contentType || 'unknown content type'}.`
        : `Request failed (${response.status}): expected JSON but received ${contentType || 'unknown content type'}.`,
      response.status,
      text.slice(0, 500)
    )
  }

  let body: Record<string, unknown> = {}
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new ApiError('The backend returned invalid JSON.', response.status, text.slice(0, 500))
    }
  }

  if (!response.ok) {
    const detailMessage = formatErrorDetails(body.details)
    const message = [body.error || 'Request failed', detailMessage]
      .filter(Boolean)
      .join(': ')
    throw new ApiError(message, response.status, body.details)
  }
  return body as T
}

export function query(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  })
  const value = search.toString()
  return value ? `?${value}` : ''
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  postForm: <T>(endpoint: string, body: FormData) =>
    request<T>(endpoint, { method: 'POST', body }),
  putForm: <T>(endpoint: string, body: FormData) =>
    request<T>(endpoint, { method: 'PUT', body })
}
