// ============================================================================
// Assembly Reports Page - Native Next.js Implementation
// ============================================================================

'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Card,
  Button,
  Input,
  NumberInput,
  TextArea,
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
  fetchMixingReports,
  fetchNJPReports,
  fetchAssemblyReports,
  saveAssemblyReport
} from '@/lib/supabase/data'
import { StagePrintButton } from '@/components/reports/StagePrintButton'
import { isStageCompleted, isStageInProgress } from '@/lib/utils'
import type { Brand, BatchStatus } from '@/types'

// ============================================================================
// Types
// ============================================================================

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
  status?: BatchStatus
  hasMixing?: boolean
  hasNJP?: boolean
  hasAssembly?: boolean
  createdAt?: number | { seconds: number }
}

interface AssemblyReport {
  id?: string
  batchId: string
  batchCode?: string
  brandId?: string
  brandName?: string
  productId?: string
  productName?: string
  capsuleWeightMg?: number | null
  filledBottleWeight?: number | null
  capsulesReceivedKg?: number | null
  capsulesReceivedQty?: number | null
  productionDate?: number | { seconds: number } | null
  expiryDate?: number | { seconds: number } | null
  startDate?: number | { seconds: number } | null
  startTime?: string | null
  endDate?: number | { seconds: number } | null
  endTime?: string | null
  qualityControlDate?: number | { seconds: number } | null
  qualityControlStartTime?: string | null
  qualityControlEndTime?: string | null
  packagingDate?: number | { seconds: number } | null
  packagingStartTime?: string | null
  packagingEndTime?: string | null
  totalBottlesMade?: number | null
  bottleCC?: number | null
  capsulesPerBottle?: number | null
  receivedCapsuleBucketNumber?: string | null
  receivedCapsulesProductionDate?: number | { seconds: number } | null
  operatorName?: string | null
  notes?: string | null
  status?: 'In Assembly' | 'Assembly Completed'
  remarks?: string | null
  reason?: string | null
  finalQuantities?: Record<string, unknown>
  createdAt?: number | { seconds: number }
}

interface BatchStatusInfo {
  hasMixing: boolean
  hasNJP: boolean
  hasAssembly: boolean
  status: BatchStatus
  assembly?: AssemblyReport | null
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

function formatDate(ts: number | { seconds: number } | null | undefined): string {
  const d = toDate(ts)
  if (!d || isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function numOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v))
  return Number.isFinite(n) ? n : null
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
              Open assembly reports for this brand
            </p>
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// Status Pill Component
// ============================================================================

function StatusPill({ ok, text }: { ok?: boolean; text: string }) {
  return (
    <Badge variant={ok ? 'success' : 'warning'}>
      {text}
    </Badge>
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
          <TableHead>Status</TableHead>
          <TableHead>Created At</TableHead>
          <TableHead>Workflow</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.length === 0 ? (
          <TableEmpty colSpan={7} message="No batches for this brand." />
        ) : (
          batches.map(batch => {
            const st = statusMap[batch.id] || {} as BatchStatusInfo
            const inProgress = isStageInProgress('assembly', st.assembly)
            const disabled = !st.hasMixing || !st.hasNJP

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
                <TableCell>{batch.status || 'draft'}</TableCell>
                <TableCell>{formatDate(batch.createdAt)}</TableCell>
                <TableCell>
                  {st.hasMixing ? (
                    st.hasNJP ? (
                      st.hasAssembly ? (
                        <Badge variant="success">Assembly done</Badge>
                      ) : inProgress ? (
                        <Badge variant="warning">Assembly in progress</Badge>
                      ) : (
                        <Badge variant="warning">Assembly pending</Badge>
                      )
                    ) : (
                      <Badge variant="error">NJP pending</Badge>
                    )
                  ) : (
                    <Badge variant="error">Mixing pending</Badge>
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
// Assembly Form Modal
// ============================================================================

function AssemblyFormModal({
  batch,
  report,
  status,
  onSave,
  onClose
}: {
  batch: Batch
  report: AssemblyReport | null
  status: BatchStatusInfo
  onSave: (data: AssemblyReport) => Promise<void>
  onClose: () => void
}) {
  const { showToast } = useToast()
  const [saving, setSaving] = useState(false)

  // Form state
  const [form, setForm] = useState({
    capsuleWeightMg: report?.capsuleWeightMg?.toString() ?? '',
    filledBottleWeight: report?.filledBottleWeight?.toString() ?? '',
    capsulesReceivedKg: report?.capsulesReceivedKg?.toString() ?? '',
    capsulesReceivedQty: report?.capsulesReceivedQty?.toString() ?? '',
    productionDate: toDateInput(report?.productionDate ?? batch?.createdAt) || '',
    expiryDate: toDateInput(report?.expiryDate) || '',
    startDate: toDateInput(report?.startDate ?? report?.qualityControlDate ?? report?.productionDate ?? batch?.createdAt) || '',
    endDate: toDateInput(report?.endDate ?? report?.packagingDate ?? report?.productionDate ?? batch?.createdAt) || '',
    qualityControlDate: toDateInput(report?.qualityControlDate ?? report?.productionDate ?? batch?.createdAt) || '',
    qualityControlStartTime: report?.qualityControlStartTime ?? '',
    qualityControlEndTime: report?.qualityControlEndTime ?? '',
    packagingDate: toDateInput(report?.packagingDate ?? report?.productionDate ?? batch?.createdAt) || '',
    packagingStartTime: report?.packagingStartTime ?? '',
    packagingEndTime: report?.packagingEndTime ?? '',
    totalBottlesMade: report?.totalBottlesMade?.toString() ?? batch?.containerCount?.toString() ?? '',
    bottleCC: report?.bottleCC?.toString() ?? '',
    capsulesPerBottle: report?.capsulesPerBottle?.toString() ?? batch?.unitsPerContainer?.toString() ?? '',
    receivedCapsuleBucketNumber: report?.receivedCapsuleBucketNumber ?? '',
    receivedCapsulesProductionDate: toDateInput(report?.receivedCapsulesProductionDate) || '',
    operatorName: report?.operatorName ?? '',
    notes: report?.notes ?? ''
  })

  const canFinalize = status?.hasMixing && status?.hasNJP

  const handleSubmit = async () => {
    if (!canFinalize) {
      showToast({ message: 'Complete Mixing and NJP before finalizing Assembly', type: 'error' })
      return
    }

    try {
      setSaving(true)

      const payload: AssemblyReport = {
        id: report?.id,
        batchId: batch.id,
        batchCode: batch.batchCode,
        brandId: batch.brandId,
        brandName: batch.brandName,
        productId: batch.productId,
        productName: batch.productName,
        capsuleWeightMg: numOrNull(form.capsuleWeightMg),
        filledBottleWeight: numOrNull(form.filledBottleWeight),
        capsulesReceivedKg: numOrNull(form.capsulesReceivedKg),
        capsulesReceivedQty: numOrNull(form.capsulesReceivedQty),
        productionDate: form.productionDate ? new Date(form.productionDate).getTime() : null,
        expiryDate: form.expiryDate ? new Date(form.expiryDate).getTime() : null,
        startDate: form.startDate ? new Date(form.startDate).getTime() : null,
        startTime: form.qualityControlStartTime || null,
        endDate: form.endDate ? new Date(form.endDate).getTime() : null,
        endTime: form.packagingEndTime || null,
        qualityControlDate: form.qualityControlDate ? new Date(form.qualityControlDate).getTime() : null,
        qualityControlStartTime: form.qualityControlStartTime || null,
        qualityControlEndTime: form.qualityControlEndTime || null,
        packagingDate: form.packagingDate ? new Date(form.packagingDate).getTime() : null,
        packagingStartTime: form.packagingStartTime || null,
        packagingEndTime: form.packagingEndTime || null,
        totalBottlesMade: numOrNull(form.totalBottlesMade),
        bottleCC: numOrNull(form.bottleCC),
        capsulesPerBottle: numOrNull(form.capsulesPerBottle),
        receivedCapsuleBucketNumber: form.receivedCapsuleBucketNumber || null,
        receivedCapsulesProductionDate: form.receivedCapsulesProductionDate
          ? new Date(form.receivedCapsulesProductionDate).getTime()
          : null,
        operatorName: form.operatorName || null,
        notes: form.notes || null,
        status: report?.status || undefined,
        remarks: form.notes || null
      }

      await onSave(payload)
      showToast({ message: 'Assembly report saved and batch finalized', type: 'success' })
    } catch (err) {
      console.error('Save Assembly failed:', err)
      showToast({ message: 'Failed to save assembly report', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`Assembly Report – ${batch.batchCode} ${batch.productName}`}
      className="max-w-4xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-zinc-600">Brand: {batch.brandName}</p>
          <StatusPill ok text="Add Batch data" />
          <StatusPill ok={status?.hasMixing} text="Mixing complete" />
          <StatusPill ok={status?.hasNJP} text="NJP complete" />
        </div>

        {/* Form Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Product</Label>
            <Input value={batch.productName || ''} disabled />
          </div>
          <div>
            <Label>Batch Code</Label>
            <Input value={batch.batchCode || ''} disabled />
          </div>
          <div>
            <Label>Production Date</Label>
            <Input
              type="date"
              value={form.productionDate}
              onChange={e => setForm({ ...form, productionDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Expiry Date</Label>
            <Input
              type="date"
              value={form.expiryDate}
              onChange={e => setForm({ ...form, expiryDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Stage Start Date</Label>
            <Input
              type="date"
              value={form.startDate}
              onChange={e => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Stage End Date</Label>
            <Input
              type="date"
              value={form.endDate}
              onChange={e => setForm({ ...form, endDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Quality Control Date</Label>
            <Input
              type="date"
              value={form.qualityControlDate}
              onChange={e => setForm({ ...form, qualityControlDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Quality Control Start Time</Label>
            <Input
              type="time"
              value={form.qualityControlStartTime}
              onChange={e => setForm({ ...form, qualityControlStartTime: e.target.value })}
            />
          </div>
          <div>
            <Label>Quality Control End Time</Label>
            <Input
              type="time"
              value={form.qualityControlEndTime}
              onChange={e => setForm({ ...form, qualityControlEndTime: e.target.value })}
            />
          </div>
          <div>
            <Label>Packaging Date</Label>
            <Input
              type="date"
              value={form.packagingDate}
              onChange={e => setForm({ ...form, packagingDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Packaging Start Time</Label>
            <Input
              type="time"
              value={form.packagingStartTime}
              onChange={e => setForm({ ...form, packagingStartTime: e.target.value })}
            />
          </div>
          <div>
            <Label>Packaging End Time</Label>
            <Input
              type="time"
              value={form.packagingEndTime}
              onChange={e => setForm({ ...form, packagingEndTime: e.target.value })}
            />
          </div>
          <div>
            <Label>Total Bottles Made</Label>
            <NumberInput
              value={form.totalBottlesMade}
              onChange={e => setForm({ ...form, totalBottlesMade: e.target.value })}
            />
          </div>
          <div>
            <Label>Capsules per Bottle</Label>
            <NumberInput
              value={form.capsulesPerBottle}
              onChange={e => setForm({ ...form, capsulesPerBottle: e.target.value })}
            />
          </div>
          <div>
            <Label>Capsule Weight (mg)</Label>
            <NumberInput
              value={form.capsuleWeightMg}
              onChange={e => setForm({ ...form, capsuleWeightMg: e.target.value })}
            />
          </div>
          <div>
            <Label>Filled Bottle Weight</Label>
            <NumberInput
              value={form.filledBottleWeight}
              onChange={e => setForm({ ...form, filledBottleWeight: e.target.value })}
            />
          </div>
          <div>
            <Label>Capsules Received (kg)</Label>
            <NumberInput
              value={form.capsulesReceivedKg}
              onChange={e => setForm({ ...form, capsulesReceivedKg: e.target.value })}
            />
          </div>
          <div>
            <Label>Received Capsules Quantity</Label>
            <NumberInput
              value={form.capsulesReceivedQty}
              onChange={e => setForm({ ...form, capsulesReceivedQty: e.target.value })}
            />
          </div>
          <div>
            <Label>Bottle CC</Label>
            <NumberInput
              value={form.bottleCC}
              onChange={e => setForm({ ...form, bottleCC: e.target.value })}
            />
          </div>
          <div>
            <Label>Received Capsule Bucket Number</Label>
            <Input
              value={form.receivedCapsuleBucketNumber}
              onChange={e => setForm({ ...form, receivedCapsuleBucketNumber: e.target.value })}
            />
          </div>
          <div>
            <Label>Received Capsules Production Date</Label>
            <Input
              type="date"
              value={form.receivedCapsulesProductionDate}
              onChange={e => setForm({ ...form, receivedCapsulesProductionDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Operator Name</Label>
            <Input
              value={form.operatorName}
              onChange={e => setForm({ ...form, operatorName: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes / Description</Label>
            <TextArea
              rows={3}
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        {/* Warning for incomplete prerequisites */}
        {!canFinalize && (
          <div className="p-3 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
            {!status?.hasMixing && !status?.hasNJP
              ? 'Mixing and NJP records are required before finalizing.'
              : !status?.hasMixing
              ? 'Mixing record is missing.'
              : 'NJP record is missing.'}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-4 border-t border-zinc-200">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            loading={saving}
            disabled={saving || !canFinalize}
          >
            {saving ? 'Saving...' : 'Finalize Batch'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function AssemblyReportsPage() {
  const searchParams = useSearchParams()
  const requestedBrandId = searchParams.get('brandId')
  const requestedBatchId = searchParams.get('batchId')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [assemblyMap, setAssemblyMap] = useState<Record<string, AssemblyReport>>({})
  const [statusMap, setStatusMap] = useState<Record<string, BatchStatusInfo>>({})

  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [existingReport, setExistingReport] = useState<AssemblyReport | null>(null)

  const assemblyReportsForPrint = useMemo(
    () => Object.values(assemblyMap).map((entry) => entry as unknown as Record<string, unknown>),
    [assemblyMap]
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
      const brandList = await fetchBrands({ activeOnly: true })
      setBrands(brandList as Brand[])
    } catch (err) {
      console.error('Initial load failed:', err)
      setError('Failed to load brands.')
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

      // Build assembly map
      const assembly: Record<string, AssemblyReport> = {}
      ;(assemblyList as AssemblyReport[]).forEach(r => {
        if (r.batchId) assembly[r.batchId] = r
      })
      setAssemblyMap(assembly)

      // Build status map
      const map: Record<string, BatchStatusInfo> = {}
      ;(batchesList as Batch[]).forEach(b => {
        const mixingReport = (mixingList as { batchId: string; status?: string }[]).find(r => r.batchId === b.id) || null
        const njpReport = (njpList as { batchId: string; status?: string }[]).find(r => r.batchId === b.id) || null
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
          assembly: assemblyReport
        }
      })
      setStatusMap(map)

      if (focusBatchId) {
        const targetBatch = (batchesList as Batch[]).find(batch => batch.id === focusBatchId)
        const targetStatus = targetBatch ? map[targetBatch.id] : null

        if (!targetBatch || !targetStatus) {
          setError('The selected batch was not found for this brand.')
        } else if (!targetStatus.hasMixing || !targetStatus.hasNJP) {
          setError('Cannot open assembly until mixing and NJP are both complete.')
        } else {
          setSelectedBatch(targetBatch)
          setExistingReport(assembly[targetBatch.id] || null)
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
    setExistingReport(null)
    loadBrandData(brand, requestedBatchId)
  }, [brands, requestedBrandId, requestedBatchId, loadBrandData])

  const handleSelectBrand = (brand: Brand) => {
    setSelectedBrand(brand)
    setSelectedBatch(null)
    setExistingReport(null)
    loadBrandData(brand)
  }

  const handleSelectBatch = (batch: Batch, status: BatchStatusInfo) => {
    const st = status || statusMap[batch.id]
    if (!st?.hasMixing || !st?.hasNJP) {
      setError('Cannot open assembly until mixing and NJP are both complete.')
      return
    }

    setSelectedBatch(batch)
    setExistingReport(assemblyMap[batch.id] || null)
  }

  const handleSaveReport = async (payload: AssemblyReport) => {
    await saveAssemblyReport(payload)

    // Update local state
    setAssemblyMap(prev => ({ ...prev, [payload.batchId]: { ...payload, id: payload.id || 'new' } }))
    setStatusMap(prev => ({
      ...prev,
      [payload.batchId]: {
        ...(prev[payload.batchId] || {} as BatchStatusInfo),
        hasMixing: true,
        hasNJP: true,
        hasAssembly: true,
        status: 'finalized' as BatchStatus
      }
    }))
    setSelectedBatch(null)
    setExistingReport(null)
  }

  const handleBackToBrands = () => {
    setSelectedBrand(null)
    setBatches([])
    setSelectedBatch(null)
    setExistingReport(null)
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
          <h1 className="text-2xl font-bold">Assembly Reports</h1>
          <p className="text-zinc-600">
            Select a brand to manage assembly and finalize batches
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
            stage="assembly"
            brandName={selectedBrand?.name}
            reports={assemblyReportsForPrint}
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

      {/* Assembly Form Modal */}
      {selectedBatch && (
        <AssemblyFormModal
          batch={selectedBatch}
          report={existingReport}
          status={statusMap[selectedBatch.id]}
          onSave={handleSaveReport}
          onClose={() => {
            setSelectedBatch(null)
            setExistingReport(null)
          }}
        />
      )}
    </div>
  )
}
