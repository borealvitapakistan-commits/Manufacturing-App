// ============================================================================
// Mixing Reports Page - Native Next.js Implementation
// ============================================================================

'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Card,
  Button,
  Input,
  NumberInput,
  Label,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  Badge,
  Modal,
  useToast
} from '@/components/ui'
import {
  initSupabase,
  fetchBrands,
  fetchBatches,
  fetchProducts,
  fetchRawMaterials,
  fetchMixingReports,
  fetchNJPReports,
  fetchAssemblyReports,
  updateBatchStageLifecycle,
  saveMixingReportWithDeduction
} from '@/lib/supabase/data'
import { StagePrintButton } from '@/components/reports/StagePrintButton'
import { isStageCompleted, isStageInProgress } from '@/lib/utils'
import type { Brand, BatchStatus } from '@/types'

// ============================================================================
// Types
// ============================================================================

interface Product {
  id: string
  name: string
  rm?: RawMaterialFormula[]
}

interface RawMaterialFormula {
  rawMaterialId?: string
  rawMaterialCode?: string
  rawMaterial?: string
  labelClaim?: string
  labelClaimMgPerUnit?: number
}

interface RawMaterial {
  id: string
  name: string
  code?: string
  qty?: number
  qtyKg?: number
}

interface Batch {
  id: string
  batchCode: string
  brandId: string
  brandName?: string
  brandCodePrefix?: string
  productId: string
  productName?: string
  containerCount?: number
  unitsPerContainer?: number
  totalUnits?: number
  status?: BatchStatus
  hasMixing?: boolean
  hasNJP?: boolean
  hasAssembly?: boolean
  inventoryDeducted?: boolean
  inventoryDeductionSource?: 'none' | 'batch' | 'mixing'
}

interface MixingReport {
  id?: string
  batchId: string
  mixingDate?: number | { seconds: number }
  startDate?: number | { seconds: number } | null
  startTime?: string | null
  endDate?: number | { seconds: number } | null
  endTime?: string | null
  status?: 'In Mixing' | 'Mixing Completed'
  remarks?: string | null
  reason?: string | null
  mixedPowderName?: string
  mixedPowderQtyKg?: number
  rmUsage?: RmUsageItem[]
  nonMedUsage?: NonMedItem[]
  mixingDates?: string[]
  mixingNotes?: string
  productName?: string
  batchCode?: string
  createdAt?: number | { seconds: number }
}

interface NjpReport {
  id: string
  batchId: string
  productionDate?: number | { seconds: number }
  status?: 'In NJP' | 'NJP Completed'
}

interface AssemblyReport {
  id: string
  batchId: string
  productionDate?: number | { seconds: number }
  status?: 'In Assembly' | 'Assembly Completed'
}

interface RmUsageItem {
  clNo: number
  rawMaterialId: string
  rawMaterialCode: string
  rawMaterialName: string
  requiredQtyKgFormula: number
  requiredQtyKgThisMix: number
  qtyBeforeKg: number
  qtyAfterKg: number
}

interface NonMedItem {
  clNo: number
  name: string
  requiredQtyKgFormula: number
  requiredQtyKgThisMix: number
  qtyBeforeKg: number
  qtyAfterKg: number
}

interface BatchStatusInfo {
  hasMixing: boolean
  hasNJP: boolean
  hasAssembly: boolean
  status: BatchStatus
  njp?: NjpReport | null
  assembly?: AssemblyReport | null
  mixing?: MixingReport | null
}

// ============================================================================
// Helpers
// ============================================================================

function toDate(ts: number | { seconds: number } | null | undefined): Date | null {
  if (!ts) return null
  if (typeof ts === 'object' && 'seconds' in ts) {
    return new Date(ts.seconds * 1000)
  }
  return new Date(ts)
}

function toDateInput(ts: number | { seconds: number } | null | undefined): string {
  const d = toDate(ts)
  if (!d || isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function dateInputToMs(value: string): number | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function formatDate(ts: number | { seconds: number } | null | undefined): string {
  const d = toDate(ts)
  if (!d || isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function parseLabelClaimToMg(label: string = ''): number | null {
  const s = String(label).toLowerCase()
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)/)
  if (!m) return null
  const val = parseFloat(m[1])
  if (!isFinite(val)) return null
  if (s.includes(' mcg') || s.includes('µg') || s.includes(' ug')) return val / 1000
  if (s.includes(' g')) return val * 1000
  return val
}

function deriveStatusFromFlags(flags: {
  hasMixing?: boolean
  hasNJP?: boolean
  hasAssembly?: boolean
  status?: string
}): BatchStatus {
  if (flags.hasAssembly || flags.status === 'finalized') return 'finalized'
  if (flags.hasNJP || flags.status === 'assemblyPending') return 'assemblyPending'
  if (flags.hasMixing || flags.status === 'ngpPending') return 'ngpPending'
  return 'mixingPending'
}

// ============================================================================
// Brand Grid Component
// ============================================================================

function BrandGrid({
  brands,
  selectedId,
  onSelect
}: {
  brands: Brand[]
  selectedId?: string
  onSelect: (brand: Brand) => void
}) {
  const colors = [
    { bg: 'bg-cyan-50', hover: 'hover:bg-cyan-100', border: 'border-cyan-200', text: 'text-cyan-700' },
    { bg: 'bg-purple-50', hover: 'hover:bg-purple-100', border: 'border-purple-200', text: 'text-purple-700' },
    { bg: 'bg-orange-50', hover: 'hover:bg-orange-100', border: 'border-orange-200', text: 'text-orange-700' },
    { bg: 'bg-green-50', hover: 'hover:bg-green-100', border: 'border-green-200', text: 'text-green-700' },
    { bg: 'bg-blue-50', hover: 'hover:bg-blue-100', border: 'border-blue-200', text: 'text-blue-700' },
    { bg: 'bg-rose-50', hover: 'hover:bg-rose-100', border: 'border-rose-200', text: 'text-rose-700' }
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {brands.map((brand, idx) => {
        const color = colors[idx % colors.length]
        const isSelected = selectedId === brand.id
        return (
          <button
            key={brand.id}
            onClick={() => onSelect(brand)}
            className={`
              p-5 rounded-xl border-2 text-left transition-all
              ${color.bg} ${color.hover} ${color.border}
              ${isSelected ? 'ring-2 ring-offset-2 ring-[#1D838D]' : ''}
            `}
          >
            <p className={`font-semibold text-lg ${color.text}`}>
              {brand.name} ({brand.codePrefix})
            </p>
            <p className="text-sm text-zinc-600 mt-1">
              Open mixing reports for this brand
            </p>
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// Batch Table Component
// ============================================================================

function BatchTable({
  batches,
  statusMap,
  onSelect
}: {
  batches: Batch[]
  statusMap: Record<string, BatchStatusInfo>
  onSelect: (batch: Batch, status: BatchStatusInfo) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Batch Code</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Total Bottles</TableHead>
          <TableHead>Units/Bottle</TableHead>
          <TableHead>Mixing</TableHead>
          <TableHead>NJP</TableHead>
          <TableHead>Assembly</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.length === 0 ? (
          <TableEmpty colSpan={7} message="No batches for this brand." />
        ) : (
          batches.map(batch => {
            const st = statusMap[batch.id] || {} as BatchStatusInfo
            const status = st.status || deriveStatusFromFlags(batch)
            const disabled = status !== 'mixingPending' && !st.mixing

            return (
              <TableRow
                key={batch.id}
                className={disabled ? 'opacity-60' : 'cursor-pointer hover:bg-zinc-50'}
                onClick={() => !disabled && onSelect(batch, st)}
              >
                <TableCell className="font-semibold">{batch.batchCode}</TableCell>
                <TableCell>{batch.productName}</TableCell>
                <TableCell>{batch.containerCount ?? '—'}</TableCell>
                <TableCell>{batch.unitsPerContainer ?? '—'}</TableCell>
                <TableCell>
                  {st.hasMixing ? (
                    <Badge variant="success">Mixing done</Badge>
                  ) : (
                    <Badge variant="warning">Mixing pending</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {st.hasMixing ? (
                    st.hasNJP ? (
                      <Badge variant="success">NJP done</Badge>
                    ) : (
                      <Badge variant="warning">Send to NJP</Badge>
                    )
                  ) : (
                    <Badge variant="error">Complete mixing first</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!st.hasNJP ? (
                    <Badge variant="warning">Do NJP before assembly</Badge>
                  ) : st.hasAssembly ? (
                    <Badge variant="success">Assembly done</Badge>
                  ) : (
                    <Badge variant="warning">Assembly pending</Badge>
                  )}
                </TableCell>
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
  )
}

// ============================================================================
// Mixing Form Modal
// ============================================================================

function MixingFormModal({
  batch,
  product,
  rawMaterialsMap,
  njp,
  assembly,
  mixingReport,
  onClose,
  onSaved
}: {
  batch: Batch
  product: Product | null
  rawMaterialsMap: Record<string, RawMaterial>
  njp?: NjpReport | null
  assembly?: AssemblyReport | null
  mixingReport?: MixingReport | null
  onClose: () => void
  onSaved: (options?: { timingOnly?: boolean }) => void
}) {
  const { showToast } = useToast()
  const locked = Boolean(mixingReport?.id && !isStageInProgress('mixing', mixingReport))

  const [startDate, setStartDate] = useState(
    toDateInput(mixingReport?.startDate ?? mixingReport?.mixingDate) || ''
  )
  const [endDate, setEndDate] = useState(
    toDateInput(mixingReport?.endDate ?? mixingReport?.mixingDate) || ''
  )
  const [startTime, setStartTime] = useState(mixingReport?.startTime || '')
  const [endTime, setEndTime] = useState(mixingReport?.endTime || '')
  const [mixedPowderName, setMixedPowderName] = useState(mixingReport?.mixedPowderName || '')
  const [mixedPowderQtyKg, setMixedPowderQtyKg] = useState<string>(
    mixingReport?.mixedPowderQtyKg?.toString() ?? ''
  )
  const [nonMedUsage, setNonMedUsage] = useState<NonMedItem[]>(
    (mixingReport?.nonMedUsage as NonMedItem[]) || []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [shortageModal, setShortageModal] = useState<{
    code: string
    name: string
    required: number
    available: number
    shortBy: number
  }[] | null>(null)

  // Calculate RM usage from formula
  const rmUsageFormula = useMemo(() => {
    const totalUnits = Number(batch.totalUnits) ||
      ((Number(batch.unitsPerContainer) || 0) * (Number(batch.containerCount) || 0))

    if (!product || !Array.isArray(product.rm)) return []

    return product.rm.map((r, idx) => {
      let rmId = r.rawMaterialId || null
      let rmDoc = rmId ? rawMaterialsMap[rmId] : null

      if (!rmDoc) {
        const codeLower = (r.rawMaterialCode || '').toLowerCase()
        const nameLower = (r.rawMaterial || '').toLowerCase()
        rmDoc = Object.values(rawMaterialsMap).find(rm =>
          (codeLower && (rm.code || '').toLowerCase() === codeLower) ||
          (nameLower && (rm.name || '').toLowerCase() === nameLower)
        ) || null
        if (rmDoc) rmId = rmDoc.id
      }

      const mgPerUnit = parseLabelClaimToMg(r.labelClaim || '') ||
        (typeof r.labelClaimMgPerUnit === 'number' ? r.labelClaimMgPerUnit : null)
      const requiredKg = mgPerUnit ? (totalUnits * mgPerUnit) / 1_000_000 : 0
      const currentQtyKg = rmDoc ? Number(rmDoc.qty || rmDoc.qtyKg) || 0 : 0
      const wasDeductedAtBatch = batch.inventoryDeductionSource === 'batch'
      const before = wasDeductedAtBatch
        ? +(currentQtyKg + requiredKg).toFixed(4)
        : currentQtyKg

      return {
        clNo: idx + 1,
        rawMaterialId: rmId || '',
        rawMaterialCode: r.rawMaterialCode || rmDoc?.code || '',
        rawMaterialName: r.rawMaterial || rmDoc?.name || '',
        requiredQtyKgFormula: +(requiredKg || 0).toFixed(4),
        requiredQtyKgThisMix: +requiredKg.toFixed(4),
        qtyBeforeKg: before,
        qtyAfterKg: wasDeductedAtBatch
          ? +currentQtyKg.toFixed(4)
          : +(before - (requiredKg || 0)).toFixed(4)
      }
    }).filter(u => u.rawMaterialId)
  }, [batch, product, rawMaterialsMap])

  // Calculate total formula qty
  const totalFormulaQtyKg = useMemo(() => {
    const rmSum = rmUsageFormula.reduce((s, u) => s + (u.requiredQtyKgFormula || 0), 0)
    const nonSum = nonMedUsage.reduce((s, u) => s + (Number(u.requiredQtyKgFormula) || 0), 0)
    return +(rmSum + nonSum).toFixed(4)
  }, [rmUsageFormula, nonMedUsage])

  // Calculate mixing plan with scaling
  const mixingPlan = useMemo(() => {
    const T = totalFormulaQtyKg || 0
    const E = mixedPowderQtyKg ? Number(mixedPowderQtyKg) : 0
    const errors: string[] = []

    if (E < 0) errors.push('Existing mixed powder cannot be negative.')
    if (E > T) errors.push(`Existing mixed powder (${E.toFixed(3)} kg) cannot exceed total required (${T.toFixed(3)} kg).`)

    const N = Math.max(0, T - E)
    const scale = T > 0 ? (N / T) : 0

    // Scale RM usage
    const scaledRm = rmUsageFormula.map(u => {
      const formula = Number(u.requiredQtyKgFormula) || 0
      const before = Number(u.qtyBeforeKg) || 0
      const reqThis = +(formula * scale).toFixed(4)
      const after = +(before - reqThis).toFixed(4)
      return { ...u, requiredQtyKgThisMix: reqThis, qtyAfterKg: after, qtyBeforeKg: before }
    })

    // Scale non-med usage
    const scaledNon = nonMedUsage.map(n => {
      const formula = Number(n.requiredQtyKgFormula) || 0
      const before = Number(n.qtyBeforeKg) || 0
      const reqThis = +(formula * scale).toFixed(4)
      const after = +(before - reqThis).toFixed(4)
      return { ...n, requiredQtyKgThisMix: reqThis, qtyAfterKg: after, qtyBeforeKg: before }
    })

    return { T, E, N, scale, errors, scaledRm, scaledNon }
  }, [totalFormulaQtyKg, mixedPowderQtyKg, rmUsageFormula, nonMedUsage])

  const { scaledRm, scaledNon } = mixingPlan
  const planErrors = mixingPlan.errors || []
  const shortages = useMemo(() => scaledRm.filter(u => (u.qtyAfterKg ?? 0) < 0), [scaledRm])

  const addNonMed = () => {
    setNonMedUsage(prev => [
      ...prev,
      {
        clNo: prev.length + 1,
        name: '',
        requiredQtyKgFormula: 0,
        requiredQtyKgThisMix: 0,
        qtyBeforeKg: 0,
        qtyAfterKg: 0
      }
    ])
  }

  const updateNonMed = (idx: number, field: string, value: string | number) => {
    setNonMedUsage(prev => {
      const next = [...prev]
      next[idx] = {
        ...next[idx],
        [field]: field.includes('Qty') ? (parseFloat(String(value)) || 0) : value
      }
      return next
    })
  }

  const removeNonMed = (idx: number) => {
    setNonMedUsage(prev =>
      prev.filter((_, i) => i !== idx).map((n, i) => ({ ...n, clNo: i + 1 }))
    )
  }

  const finalizeMixing = async () => {
    try {
      setSaving(true)
      setError('')

      if (shortages.length) {
        setShortageModal(shortages.map(s => ({
          code: s.rawMaterialCode,
          name: s.rawMaterialName,
          required: s.requiredQtyKgThisMix,
          available: s.qtyBeforeKg ?? 0,
          shortBy: s.requiredQtyKgThisMix - (s.qtyBeforeKg ?? 0)
        })))
        return
      }

      const startDateMs = dateInputToMs(startDate)
      const endDateMs = dateInputToMs(endDate)
      const reportData = {
        id: mixingReport?.id,
        batchId: batch.id,
        batchCode: batch.batchCode,
        brandId: batch.brandId,
        brandName: batch.brandName,
        productId: batch.productId,
        productName: batch.productName,
        mixingDate: endDateMs ?? startDateMs,
        startDate: startDateMs,
        startTime: startTime || null,
        endDate: endDateMs,
        endTime: endTime || null,
        status: mixingReport?.status || undefined,
        mixedPowderName: mixedPowderName || null,
        mixedPowderQtyKg: mixedPowderQtyKg ? Number(mixedPowderQtyKg) : null,
        totalFormulaQtyKg,
        totalMixedQtyKg: mixingPlan.N,
        existingMixedPowderUsedKg: mixingPlan.E,
        rmUsage: scaledRm.map(u => ({
          clNo: u.clNo,
          rawMaterialId: u.rawMaterialId,
          rawMaterialCode: u.rawMaterialCode,
          rawMaterialName: u.rawMaterialName,
          requiredQtyKgFormula: u.requiredQtyKgFormula,
          requiredQtyKgThisMix: u.requiredQtyKgThisMix,
          qtyBeforeKg: u.qtyBeforeKg,
          qtyAfterKg: u.qtyAfterKg
        })),
        nonMedUsage: scaledNon.map(n => ({
          ...n,
          qtyBeforeKg: n.qtyBeforeKg ?? n.requiredQtyKgThisMix,
          qtyAfterKg: (n.qtyBeforeKg ?? n.requiredQtyKgThisMix) - n.requiredQtyKgThisMix
        }))
      }

      await saveMixingReportWithDeduction(reportData)
      showToast({ message: 'Mixing complete and inventory updated', type: 'success' })
      onSaved()
    } catch (err: unknown) {
      console.error('Mixing transaction failed:', err)
      const error = err as { shortage?: { rawMaterialCode: string; rawMaterialName: string; requiredQtyKgThisMix?: number; currentQty?: number; qtyBeforeKg?: number; shortBy?: number }[]; message?: string }
      if (error.shortage) {
        setShortageModal(error.shortage.map(s => ({
          code: s.rawMaterialCode,
          name: s.rawMaterialName,
          required: Number(s.requiredQtyKgThisMix) || 0,
          available: s.currentQty ?? s.qtyBeforeKg ?? 0,
          shortBy: s.shortBy ?? ((Number(s.requiredQtyKgThisMix) || 0) - (s.currentQty ?? 0))
        })))
      } else {
        setError(`Failed to save mixing report: ${error?.message || err}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const saveTimingOnly = async () => {
    try {
      setSaving(true)
      setError('')

      await updateBatchStageLifecycle(batch.id, 'mixing', {
        startDate: dateInputToMs(startDate),
        startTime: startTime || null,
        endDate: dateInputToMs(endDate),
        endTime: endTime || null,
        status: mixingReport?.status,
        remarks: mixingReport?.remarks ?? null,
        reason: mixingReport?.reason ?? null
      })

      showToast({ message: 'Mixing timing updated', type: 'success' })
      onSaved({ timingOnly: true })
    } catch (err: unknown) {
      console.error('Mixing timing update failed:', err)
      const message = err instanceof Error ? err.message : 'Failed to update mixing timing.'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal
        open={true}
        onClose={onClose}
        title={`Mixing Report – ${batch.batchCode} ${batch.productName}`}
        className="max-w-5xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">Brand: {batch.brandName}</p>

          {error && (
            <div className="p-3 rounded-lg bg-rose-100 text-rose-800 border border-rose-200">
              {error}
            </div>
          )}

          {/* Basic Info Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Product</Label>
              <Input value={batch.productName || ''} disabled />
            </div>
            <div>
              <Label>Batch Code</Label>
              <Input value={batch.batchCode} disabled />
            </div>
            <div>
              <Label>NJP Date</Label>
              <Input value={njp ? formatDate(njp.productionDate) : '—'} disabled />
            </div>
            <div>
              <Label>Assembly Date</Label>
              <Input value={assembly ? formatDate(assembly.productionDate) : '—'} disabled />
            </div>
            <div>
              <Label>Mixing Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Mixing Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <Label>Mixing End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Mixing End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
              />
            </div>
            <div>
              <Label>Mixed Powder Name</Label>
              <Input
                value={mixedPowderName}
                disabled={locked}
                onChange={e => setMixedPowderName(e.target.value)}
              />
            </div>
            <div>
              <Label>Existing Mixed Powder Used (kg) — optional</Label>
              <NumberInput
                value={mixedPowderQtyKg}
                disabled={locked}
                onChange={e => setMixedPowderQtyKg(e.target.value)}
              />
            </div>
            <div>
              <Label>Total Formula Qty (kg)</Label>
              <Input value={totalFormulaQtyKg.toString()} disabled />
            </div>
          </div>

          {/* Plan Errors */}
          {planErrors.length > 0 && (
            <div className="p-3 rounded-lg bg-rose-100 text-rose-800 border border-rose-200">
              {planErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          {/* Raw Materials Table */}
          <div>
            <h3 className="text-base font-semibold mb-2">Raw Materials (auto)</h3>
            <div className="overflow-auto max-h-64">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">CL</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Formula Qty (kg)</TableHead>
                    <TableHead>Available (kg)</TableHead>
                    <TableHead>Used (kg)</TableHead>
                    <TableHead>After (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scaledRm.length === 0 ? (
                    <TableEmpty colSpan={7} message="No RM linked." />
                  ) : (
                    scaledRm.map(u => (
                      <TableRow key={u.rawMaterialId}>
                        <TableCell>{u.clNo}</TableCell>
                        <TableCell className="font-semibold">{u.rawMaterialCode}</TableCell>
                        <TableCell>{u.rawMaterialName}</TableCell>
                        <TableCell>{u.requiredQtyKgFormula.toFixed(4)}</TableCell>
                        <TableCell>{(u.qtyBeforeKg ?? 0).toFixed(4)}</TableCell>
                        <TableCell>{u.requiredQtyKgThisMix.toFixed(4)}</TableCell>
                        <TableCell className={u.qtyAfterKg < 0 ? 'text-rose-700 font-semibold' : ''}>
                          {u.qtyAfterKg.toFixed(4)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Non-medicinal Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold">Non-medicinal Ingredients</h3>
              {!locked && (
                <Button variant="subtle" size="sm" onClick={addNonMed}>
                  + Add Ingredient
                </Button>
              )}
            </div>
            <div className="overflow-auto max-h-48">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">CL</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Formula Qty (kg)</TableHead>
                    <TableHead>Used (kg)</TableHead>
                    <TableHead>After (kg)</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nonMedUsage.length === 0 ? (
                    <TableEmpty colSpan={6} message="None added yet." />
                  ) : (
                    scaledNon.map((n, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>
                          <Input
                            value={n.name}
                            disabled={locked}
                            onChange={e => updateNonMed(idx, 'name', e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <NumberInput
                            value={nonMedUsage[idx].requiredQtyKgFormula?.toString() ?? ''}
                            disabled={locked}
                            onChange={e => updateNonMed(idx, 'requiredQtyKgFormula', e.target.value)}
                          />
                        </TableCell>
                        <TableCell>{n.requiredQtyKgThisMix.toFixed(4)}</TableCell>
                        <TableCell>{(n.qtyAfterKg ?? 0).toFixed(4)}</TableCell>
                        <TableCell>
                          {!locked && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => removeNonMed(idx)}
                            >
                              Delete
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4 border-t border-zinc-200">
            <Button variant="subtle" onClick={() => window.print()}>Print</Button>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {locked ? (
              <Button
                onClick={saveTimingOnly}
                loading={saving}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Timing'}
              </Button>
            ) : (
              <Button
                onClick={finalizeMixing}
                loading={saving}
                disabled={saving || scaledRm.length === 0 || planErrors.length > 0}
              >
                {saving ? 'Saving...' : 'Finalize Mixing & Deduct Inventory'}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Shortage Modal */}
      {shortageModal && (
        <Modal
          open={true}
          onClose={() => setShortageModal(null)}
          title="Insufficient Stock"
        >
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              You cannot finalize this mixing. The following raw materials are short.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Required (kg)</TableHead>
                  <TableHead>Available (kg)</TableHead>
                  <TableHead>Short by (kg)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shortageModal.map((s, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-semibold">{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{(s.required || 0).toFixed(4)}</TableCell>
                    <TableCell>{(s.available || 0).toFixed(4)}</TableCell>
                    <TableCell className="text-rose-700 font-semibold">
                      {(s.shortBy || 0).toFixed(4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setShortageModal(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function MixingReportsPage() {
  const { showToast } = useToast()
  const searchParams = useSearchParams()
  const requestedBrandId = searchParams.get('brandId')
  const requestedBatchId = searchParams.get('batchId')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, BatchStatusInfo>>({})
  const [products, setProducts] = useState<Product[]>([])
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])

  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [selectedMeta, setSelectedMeta] = useState<BatchStatusInfo | null>(null)

  const rawMaterialsMap = useMemo(() => {
    const map: Record<string, RawMaterial> = {}
    rawMaterials.forEach(r => { map[r.id] = r })
    return map
  }, [rawMaterials])

  const productsMap = useMemo(() => {
    const map: Record<string, Product> = {}
    products.forEach(p => { map[p.id] = p })
    return map
  }, [products])

  const mixingReportsForPrint = useMemo(
    () =>
      Object.values(statusMap)
        .map((entry) => entry.mixing)
        .filter((entry): entry is MixingReport => Boolean(entry))
        .map((entry) => entry as unknown as Record<string, unknown>),
    [statusMap]
  )

  const batchRowsForPrint = useMemo(
    () => batches.map((batch) => batch as unknown as Record<string, unknown>),
    [batches]
  )

  // Initial data load
  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadInitialData() {
    try {
      setLoading(true)
      await initSupabase()
      const [brandList, productList, rmList] = await Promise.all([
        fetchBrands({ activeOnly: true }),
        fetchProducts(),
        fetchRawMaterials()
      ])
      setBrands(brandList as Brand[])
      setProducts(productList as Product[])
      setRawMaterials(rmList as RawMaterial[])
    } catch (err) {
      console.error('Initial load failed:', err)
      setError('Failed to load initial data.')
    } finally {
      setLoading(false)
    }
  }

  const loadBrandData = useCallback(async (brand: Brand, focusBatchId?: string | null) => {
    try {
      setPending(true)
      setError('')

      const [batchesList, mixingList, njpList, assemblyList] = await Promise.all([
        fetchBatches({ brandId: brand.id }),
        fetchMixingReports({ brandId: brand.id }),
        fetchNJPReports({ brandId: brand.id }),
        fetchAssemblyReports({ brandId: brand.id })
      ])

      setBatches(batchesList as Batch[])

      // Build status map
      const map: Record<string, BatchStatusInfo> = {}
      ;(batchesList as Batch[]).forEach(b => {
        const mixingReport = (mixingList as MixingReport[]).find(r => r.batchId === b.id) || null
        const njpReport = (njpList as NjpReport[]).find(r => r.batchId === b.id) || null
        const assemblyReport = (assemblyList as AssemblyReport[]).find(r => r.batchId === b.id) || null
        const hasMixing = isStageCompleted('mixing', b, mixingReport)
        const hasNJP = isStageCompleted('njp', b, njpReport)
        const hasAssembly = isStageCompleted('assembly', b, assemblyReport)
        const derivedStatus = deriveStatusFromFlags({ hasMixing, hasNJP, hasAssembly, status: b.status })

        map[b.id] = {
          hasMixing,
          hasNJP,
          hasAssembly,
          status: derivedStatus,
          njp: njpReport,
          assembly: assemblyReport,
          mixing: mixingReport
        }
      })
      setStatusMap(map)

      if (focusBatchId) {
        const targetBatch = (batchesList as Batch[]).find(batch => batch.id === focusBatchId)
        const targetStatus = targetBatch ? map[targetBatch.id] : null

        if (!targetBatch || !targetStatus) {
          setError('The selected batch was not found for this brand.')
        } else if ((targetStatus.status || targetBatch.status) !== 'mixingPending' && !targetStatus.mixing) {
          setError('This batch is not in Mixing stage.')
        } else {
          setSelectedBatch(targetBatch)
          setSelectedMeta(targetStatus)
        }
      }
    } catch (err) {
      console.error(err)
      setError('Failed to load batches/reports for this brand.')
    } finally {
      setPending(false)
    }
  }, [])

  useEffect(() => {
    if (!requestedBrandId || brands.length === 0) return

    const brand = brands.find(item => item.id === requestedBrandId)
    if (!brand) {
      setError('The selected brand was not found.')
      return
    }

    setSelectedBrand(brand)
    setSelectedBatch(null)
    setSelectedMeta(null)
    loadBrandData(brand, requestedBatchId)
  }, [brands, requestedBrandId, requestedBatchId, loadBrandData])

  const handleSelectBrand = (brand: Brand) => {
    setSelectedBrand(brand)
    loadBrandData(brand)
  }

  const handleSelectBatch = (batch: Batch, status: BatchStatusInfo) => {
    const st = status || statusMap[batch.id] || {} as BatchStatusInfo
    const batchStatus = st.status || batch.status

    if (batchStatus && batchStatus !== 'mixingPending' && !st.mixing) {
      setError('This batch is not in Mixing stage.')
      return
    }

    setSelectedBatch(batch)
    setSelectedMeta(st)
  }

  const handleMixingSaved = (options?: { timingOnly?: boolean }) => {
    setSelectedBatch(null)
    setSelectedMeta(null)
    if (selectedBrand) {
      loadBrandData(selectedBrand)
    }
    if (!options?.timingOnly) {
      showToast({ message: 'Mixing complete. Send to NJP next.', type: 'success' })
    }
  }

  const handleBackToBrands = () => {
    setSelectedBrand(null)
    setBatches([])
    setSelectedBatch(null)
    setSelectedMeta(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Mixing Reports</h1>
          <p className="text-zinc-600">
            Select a brand to manage mixing reports
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedBrand && (
            <>
              <span className="text-sm text-zinc-600">Brand:</span>
              <span className="font-semibold">{selectedBrand.name} ({selectedBrand.codePrefix})</span>
            </>
          )}
          <StagePrintButton
            stage="mixing"
            brandName={selectedBrand?.name}
            reports={mixingReportsForPrint}
            batches={batchRowsForPrint}
            disabled={!selectedBrand || pending}
          />
          {selectedBrand && (
            <Button variant="ghost" onClick={handleBackToBrands}>Back to brands</Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-100 text-rose-800 border border-rose-200">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Brand Selection */}
      <Card title="Select a Brand">
        <BrandGrid
          brands={brands}
          selectedId={selectedBrand?.id}
          onSelect={handleSelectBrand}
        />
      </Card>

      {/* Batch Table */}
      {selectedBrand && (
        <Card
          title={`Batches for ${selectedBrand.name}`}
          actions={pending && <span className="text-sm text-zinc-500">Loading...</span>}
        >
          <BatchTable
            batches={batches}
            statusMap={statusMap}
            onSelect={handleSelectBatch}
          />
        </Card>
      )}

      {/* Mixing Form Modal */}
      {selectedBatch && (
        <MixingFormModal
          batch={selectedBatch}
          product={productsMap[selectedBatch.productId] || null}
          rawMaterialsMap={rawMaterialsMap}
          njp={selectedMeta?.njp}
          assembly={selectedMeta?.assembly}
          mixingReport={selectedMeta?.mixing}
          onClose={() => {
            setSelectedBatch(null)
            setSelectedMeta(null)
          }}
          onSaved={handleMixingSaved}
        />
      )}
    </div>
  )
}
