// ============================================================================
// Utility Functions
// ============================================================================

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Batch, BatchStatus, ManufacturingStage } from '@/types'

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
 * Derive batch status from flags
 */
export function deriveBatchStatus(batch: {
  hasMixing?: boolean
  hasNJP?: boolean
  hasAssembly?: boolean
  status?: string
}): BatchStatus {
  if (batch.hasAssembly || batch.status === 'finalized') return 'finalized'
  if (batch.hasNJP || batch.status === 'assemblyPending') return 'assemblyPending'
  if (batch.hasMixing || batch.status === 'ngpPending') return 'ngpPending'
  return 'mixingPending'
}

export function isStageReportCompleted(stage: ManufacturingStage, report: unknown): boolean {
  if (!report || typeof report !== 'object') return false
  const status = String((report as { status?: unknown }).status || '')
  if (stage === 'mixing') return status === 'Mixing Completed'
  if (stage === 'njp') return status === 'NJP Completed'
  return status === 'Assembly Completed'
}

export function isStageCompleted(
  stage: ManufacturingStage,
  batch: { hasMixing?: boolean; hasNJP?: boolean; hasAssembly?: boolean },
  report?: unknown
): boolean {
  if (stage === 'mixing') return Boolean(batch.hasMixing || isStageReportCompleted(stage, report))
  if (stage === 'njp') return Boolean(batch.hasNJP || isStageReportCompleted(stage, report))
  return Boolean(batch.hasAssembly || isStageReportCompleted(stage, report))
}

export function isStageInProgress(stage: ManufacturingStage, report: unknown): boolean {
  if (!report || typeof report !== 'object') return false
  const status = String((report as { status?: unknown }).status || '')
  if (stage === 'mixing') return status === 'In Mixing'
  if (stage === 'njp') return status === 'In NJP'
  return status === 'In Assembly'
}

export function getBatchLifecycleLabel(batch: Partial<Batch>): string {
  if (batch.batchStatus) return batch.batchStatus
  return getStatusLabel(deriveBatchStatus(batch))
}

/**
 * Get next workflow stage info
 */
export function getNextStage(status: BatchStatus): {
  label: string
  route: string
  action: string
} | null {
  switch (status) {
    case 'mixingPending':
      return { label: 'Send to Mixing', route: 'mixing', action: 'Start mixing process' }
    case 'ngpPending':
      return { label: 'Go to NJP', route: 'njp', action: 'Start encapsulation' }
    case 'assemblyPending':
      return { label: 'Go to Assembly', route: 'assembly', action: 'Start packaging' }
    case 'finalized':
      return null
  }
}

/**
 * Get status display label
 */
export function getStatusLabel(status: BatchStatus): string {
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
}

/**
 * Get status color classes
 */
export function getStatusColor(status: BatchStatus): string {
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
