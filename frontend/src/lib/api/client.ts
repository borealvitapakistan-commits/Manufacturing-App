const API_BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '')

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

export async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = window.localStorage.getItem('supabase_access_token')
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  })

  const text = await response.text()
  const body = text ? JSON.parse(text) : {}
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
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' })
}
