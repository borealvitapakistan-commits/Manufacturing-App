// ============================================================================
// Utility Functions
// ============================================================================

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format timestamp-like values to locale string
 */
export function formatDate(ts: unknown): string {
  if (!ts) return '—'

  let date: Date | null = null

  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof ts.toDate === 'function') {
    date = ts.toDate()
  } else if (ts && typeof ts === 'object' && 'seconds' in ts && typeof (ts as {seconds: number}).seconds === 'number') {
    const { seconds, nanoseconds = 0 } = ts as { seconds: number; nanoseconds?: number }
    date = new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000))
  } else if (typeof ts === 'number') {
    date = new Date(ts)
  } else if (ts instanceof Date) {
    date = ts
  }

  if (!date || isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDateShort(ts: unknown): string {
  if (!ts) return '—'

  let date: Date | null = null

  if (typeof ts === 'number') {
    date = new Date(ts)
  } else if (ts instanceof Date) {
    date = ts
  }

  if (!date || isNaN(date.getTime())) return '—'
  return date.toISOString().split('T')[0]
}

/**
 * Parse label claim string to mg value
 * Examples: "500mg" → 500, "1g" → 1000, "50mcg" → 0.05
 */
export function parseLabelClaimToMg(label: string): number | null {
  const s = String(label || '').toLowerCase()
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*(mg|mcg|µg|ug|g)?/)
  if (!m) return null

  const val = parseFloat(m[1])
  if (!isFinite(val)) return null

  const unit = m[2]
  if (unit === 'mcg' || unit === 'µg' || unit === 'ug') {
    return val / 1000 // mcg to mg
  }
  if (unit === 'g') {
    return val * 1000 // g to mg
  }
  return val // Default: mg
}

/**
 * Convert mg to kg
 */
export function mgToKg(mg: number): number {
  return mg / 1_000_000
}

/**
 * Get status display label
 */
export function getStatusLabel(status: string): string {
  switch (status) {
    case 'mixingPending':
      return 'New / Send to Mixing'
    case 'ngpPending':
      return 'Mixing Complete – Go to NJP'
    case 'assemblyPending':
      return 'NJP Complete – Go to Assembly'
    case 'finalized':
      return 'Finalized'
  }
  return status
}

/**
 * Get status color classes
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'mixingPending':
      return 'bg-emerald-100 text-emerald-800'
    case 'ngpPending':
      return 'bg-amber-100 text-amber-800'
    case 'assemblyPending':
      return 'bg-amber-100 text-amber-800'
    case 'finalized':
      return 'bg-emerald-100 text-emerald-800'
  }
  return 'bg-zinc-100 text-zinc-800'
}

/**
 * Check if dosage form is unit-based
 */
export const UNIT_BASED_FORMS = ['capsule', 'tablet', 'softgel', 'lozenge', 'oil'] as const

export function isUnitBasedForm(dosageForm: string): boolean {
  return UNIT_BASED_FORMS.includes(dosageForm.toLowerCase() as typeof UNIT_BASED_FORMS[number])
}

/**
 * Calculate total units
 */
export function calculateTotalUnits(
  unitsPerContainer: number | null,
  containerCount: number,
  isUnitBased: boolean
): number | null {
  if (!isUnitBased) return null
  const upc = Number(unitsPerContainer) || 0
  const containers = Number(containerCount) || 0
  const total = upc * containers
  return isFinite(total) ? total : null
}

/**
 * Generate a unique ID (for client-side temporary IDs)
 */
export function generateId(): string {
  return Math.random().toString(36).slice(2, 11)
}

/**
 * Sanitize nested data (remove undefined values)
 */
export function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(sanitizeForFirestore).filter((v) => v !== undefined) as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    Object.entries(value).forEach(([k, v]) => {
      const cleaned = sanitizeForFirestore(v)
      if (cleaned !== undefined) out[k] = cleaned
    })
    return out as T
  }
  return value === undefined ? (undefined as T) : value
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString()
}

/**
 * Format currency (default USD)
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount)
}

/**
 * Round to decimal places
 */
export function roundTo(num: number, decimals: number): number {
  return +(Math.round(Number(num + 'e' + decimals)) + 'e-' + decimals)
}
