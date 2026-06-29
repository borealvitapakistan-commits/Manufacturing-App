// ============================================================================
// NJP Reports Page - Native Next.js Implementation
// ============================================================================

'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Card,
  Button,
  Input,
  NumberInput,
  TextArea,
  Label,
  Checkbox,
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
  saveNJPReport
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

interface LoadCheck {
  time: string
  loadLabel: string
  w1Mg: number | string | null
  w2Mg: number | string | null
  w3Mg: number | string | null
  w4Mg: number | string | null
  w5Mg: number | string | null
  avgWeightMg: number | null
}

interface NJPReport {
  id?: string
  batchId: string
  batchCode?: string
  brandId?: string
  brandName?: string
  productId?: string
  productName?: string
  lotNumber?: string
  capsuleSize?: string
  machineModel?: string
  machineSpeed?: string
  rawMaterialReceivedKg?: number | null
  targetFillWeightMg?: number | null
  totalCapsulesProducedKg?: number | null
  totalCapsulesFilledQty?: number | null
  rejectedCapsulesQty?: number | null
  temperatureC?: number | null
  temperatureF?: number | null
  humidityPercent?: number | null
  dusterCheck?: boolean
  vacuumCheck?: boolean
  yieldPercent?: number | null
  startDate?: number | { seconds: number } | null
  startTime?: string | null
  endDate?: number | { seconds: number } | null
  endTime?: string | null
  productionDate?: number | { seconds: number } | null
  status?: 'In NJP' | 'NJP Completed'
  loadChecks?: LoadCheck[]
  remarks?: string | null
  reason?: string | null
  operatorName?: string | null
  capsuleData?: Record<string, unknown>
  createdAt?: number | { seconds: number }
}

interface BatchStatusInfo {
  hasMixing: boolean
  hasNJP: boolean
  hasAssembly: boolean
  status: BatchStatus
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

function computeAvg(weights: (string | number | null)[]): number | null {
  const vals = weights.map(n => numOrNull(n)).filter((v): v is number => v !== null)
  if (!vals.length) return null
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.round(avg * 1000) / 1000
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
              Open NJP reports for this brand
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
  njpMap,
  statusMap,
  onSelect
}: {
  batches: Batch[]
  njpMap: Record<string, NJPReport>
  statusMap: Record<string, BatchStatusInfo>
  onSelect: (batch: Batch) => void
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
          <TableHead>NJP</TableHead>
          <TableHead>Workflow</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.length === 0 ? (
          <TableEmpty colSpan={8} message="No batches for this brand." />
        ) : (
          batches.map(batch => {
            const st = statusMap[batch.id] || {} as BatchStatusInfo
            const report = njpMap[batch.id]
            const hasNJP = isStageCompleted('njp', batch, report)
            const inProgress = isStageInProgress('njp', report)
            const status = !st.hasMixing ? 'Mixing pending' : (hasNJP ? 'Recorded' : inProgress ? 'In progress' : 'Pending')
            const disabled = !st.hasMixing

            return (
              <TableRow
                key={batch.id}
                className={disabled ? 'opacity-60' : 'cursor-pointer hover:bg-zinc-50'}
                onClick={() => !disabled && onSelect(batch)}
              >
                <TableCell className="font-semibold">{batch.batchCode}</TableCell>
                <TableCell>{batch.productName}</TableCell>
                <TableCell>{batch.containerCount ?? '—'}</TableCell>
                <TableCell>{batch.unitsPerContainer ?? '—'}</TableCell>
                <TableCell>{batch.status || 'draft'}</TableCell>
                <TableCell>{formatDate(batch.createdAt)}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      status === 'Recorded' ? 'success' :
                      status === 'In progress' ? 'warning' :
                      status === 'Mixing pending' ? 'error' : 'warning'
                    }
                  >
                    {status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {!st.hasMixing ? (
                    <Badge variant="error">Mixing pending</Badge>
                  ) : hasNJP ? (
                    st.hasAssembly ? (
                      <Badge variant="success">Assembly done</Badge>
                    ) : (
                      <Badge variant="success">Send to Assembly</Badge>
                    )
                  ) : (
                    <Badge variant="warning">Ready for NJP</Badge>
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
// NJP Form Modal
// ============================================================================

function NJPFormModal({
  batch,
  report,
  onSave,
  onClose
}: {
  batch: Batch
  report: NJPReport | null
  onSave: (data: NJPReport) => Promise<void>
  onClose: () => void
}) {
  const { showToast } = useToast()
  const [saving, setSaving] = useState(false)

  // Form state
  const [form, setForm] = useState({
    startDate: toDateInput(report?.startDate) || '',
    startTime: report?.startTime ?? '',
    endDate: toDateInput(report?.endDate ?? report?.productionDate) || '',
    endTime: report?.endTime ?? '',
    productionDate: toDateInput(report?.productionDate ?? batch?.createdAt) || '',
    lotNumber: report?.lotNumber ?? batch?.batchCode ?? '',
    capsuleSize: report?.capsuleSize ?? '',
    machineModel: report?.machineModel ?? '',
    machineSpeed: report?.machineSpeed ?? '',
    rawMaterialReceivedKg: report?.rawMaterialReceivedKg?.toString() ?? '',
    targetFillWeightMg: report?.targetFillWeightMg?.toString() ?? '',
    totalCapsulesProducedKg: report?.totalCapsulesProducedKg?.toString() ?? '',
    totalCapsulesFilledQty: report?.totalCapsulesFilledQty?.toString() ?? '',
    rejectedCapsulesQty: report?.rejectedCapsulesQty?.toString() ?? '',
    temperatureC: report?.temperatureC?.toString() ?? '',
    humidityPercent: report?.humidityPercent?.toString() ?? '',
    dusterCheck: report?.dusterCheck ?? false,
    vacuumCheck: report?.vacuumCheck ?? false,
    remarks: report?.remarks ?? '',
    operatorName: report?.operatorName ?? ''
  })

  // Load checks state (10 rows)
  const emptyLoad = (): LoadCheck => ({
    time: '',
    loadLabel: '',
    w1Mg: '',
    w2Mg: '',
    w3Mg: '',
    w4Mg: '',
    w5Mg: '',
    avgWeightMg: null
  })

  const [loadChecks, setLoadChecks] = useState<LoadCheck[]>(() => {
    const rows: LoadCheck[] = []
    const source = Array.isArray(report?.loadChecks) ? report.loadChecks : []
    for (let i = 0; i < 10; i++) {
      const src = source[i]
      if (src) {
        rows.push({
          time: src.time ?? '',
          loadLabel: src.loadLabel ?? '',
          w1Mg: src.w1Mg ?? '',
          w2Mg: src.w2Mg ?? '',
          w3Mg: src.w3Mg ?? '',
          w4Mg: src.w4Mg ?? '',
          w5Mg: src.w5Mg ?? '',
          avgWeightMg: src.avgWeightMg ?? null
        })
      } else {
        rows.push(emptyLoad())
      }
    }
    return rows
  })

  // Computed yield
  const yieldPercent = useMemo(() => {
    const total = numOrNull(form.totalCapsulesFilledQty)
    const rej = numOrNull(form.rejectedCapsulesQty) || 0
    if (!total || total <= 0) return null
    const y = ((total - rej) / total) * 100
    return Math.round(y * 100) / 100
  }, [form.totalCapsulesFilledQty, form.rejectedCapsulesQty])

  const handleLoadChange = (idx: number, field: keyof LoadCheck, value: string) => {
    setLoadChecks(rows => {
      const next = [...rows]
      const row = { ...next[idx], [field]: value }
      const avg = computeAvg([row.w1Mg, row.w2Mg, row.w3Mg, row.w4Mg, row.w5Mg])
      row.avgWeightMg = avg
      next[idx] = row
      return next
    })
  }

  const handleSubmit = async () => {
    try {
      setSaving(true)

      const filteredLoads = loadChecks
        .map(r => ({
          ...r,
          w1Mg: numOrNull(r.w1Mg),
          w2Mg: numOrNull(r.w2Mg),
          w3Mg: numOrNull(r.w3Mg),
          w4Mg: numOrNull(r.w4Mg),
          w5Mg: numOrNull(r.w5Mg),
          avgWeightMg: computeAvg([r.w1Mg, r.w2Mg, r.w3Mg, r.w4Mg, r.w5Mg])
        }))
        .filter(r =>
          r.time || r.loadLabel ||
          r.w1Mg !== null || r.w2Mg !== null || r.w3Mg !== null ||
          r.w4Mg !== null || r.w5Mg !== null
        )

      const tempC = numOrNull(form.temperatureC)

      const payload: NJPReport = {
        id: report?.id,
        batchId: batch.id,
        batchCode: batch.batchCode,
        brandId: batch.brandId,
        brandName: batch.brandName,
        productId: batch.productId,
        productName: batch.productName,
        lotNumber: form.lotNumber || batch.batchCode,
        capsuleSize: form.capsuleSize || undefined,
        machineModel: form.machineModel || undefined,
        machineSpeed: form.machineSpeed || undefined,
        rawMaterialReceivedKg: numOrNull(form.rawMaterialReceivedKg),
        targetFillWeightMg: numOrNull(form.targetFillWeightMg),
        totalCapsulesProducedKg: numOrNull(form.totalCapsulesProducedKg),
        totalCapsulesFilledQty: numOrNull(form.totalCapsulesFilledQty),
        rejectedCapsulesQty: numOrNull(form.rejectedCapsulesQty),
        temperatureC: tempC,
        temperatureF: tempC !== null ? (tempC * 9/5 + 32) : null,
        humidityPercent: numOrNull(form.humidityPercent),
        dusterCheck: form.dusterCheck,
        vacuumCheck: form.vacuumCheck,
        yieldPercent,
        startDate: form.startDate ? new Date(form.startDate).getTime() : null,
        startTime: form.startTime || null,
        endDate: form.endDate ? new Date(form.endDate).getTime() : null,
        endTime: form.endTime || null,
        productionDate: form.productionDate ? new Date(form.productionDate).getTime() : null,
        status: report?.status || undefined,
        loadChecks: filteredLoads,
        remarks: form.remarks || null,
        operatorName: form.operatorName || null
      }

      await onSave(payload)
      showToast({ message: 'NJP report saved', type: 'success' })
    } catch (err) {
      console.error('Save NJP failed:', err)
      showToast({ message: 'Failed to save NJP report', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`NJP Report – ${batch.batchCode} ${batch.productName}`}
      className="max-w-5xl"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-zinc-600">Brand: {batch.brandName}</p>
          <Badge variant="success">Mixing complete</Badge>
        </div>

        {/* Basic Info Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Product</Label>
            <Input value={batch.productName || ''} disabled />
          </div>
          <div>
            <Label>Batch / Lot Number</Label>
            <Input
              value={form.lotNumber}
              onChange={e => setForm({ ...form, lotNumber: e.target.value })}
            />
          </div>
          <div>
            <Label>Start Date</Label>
            <Input
              type="date"
              value={form.startDate}
              onChange={e => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label>Start Time</Label>
              <Input
                type="time"
                value={form.startTime}
                onChange={e => setForm({ ...form, startTime: e.target.value })}
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={e => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
            <div>
              <Label>End Time</Label>
              <Input
                type="time"
                value={form.endTime}
                onChange={e => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
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
            <Label>Capsule Size</Label>
            <Input
              placeholder="00 / 0 / 1 ..."
              value={form.capsuleSize}
              onChange={e => setForm({ ...form, capsuleSize: e.target.value })}
            />
          </div>
          <div>
            <Label>Machine Model</Label>
            <Input
              value={form.machineModel}
              onChange={e => setForm({ ...form, machineModel: e.target.value })}
            />
          </div>
          <div>
            <Label>Machine Speed</Label>
            <Input
              placeholder="e.g., 30000 caps/hr"
              value={form.machineSpeed}
              onChange={e => setForm({ ...form, machineSpeed: e.target.value })}
            />
          </div>
          <div>
            <Label>Raw Material Received (kg)</Label>
            <NumberInput
              value={form.rawMaterialReceivedKg}
              onChange={e => setForm({ ...form, rawMaterialReceivedKg: e.target.value })}
            />
          </div>
          <div>
            <Label>Target Fill Weight (mg)</Label>
            <NumberInput
              value={form.targetFillWeightMg}
              onChange={e => setForm({ ...form, targetFillWeightMg: e.target.value })}
            />
          </div>
          <div>
            <Label>Total Capsules Produced (kg)</Label>
            <NumberInput
              value={form.totalCapsulesProducedKg}
              onChange={e => setForm({ ...form, totalCapsulesProducedKg: e.target.value })}
            />
          </div>
          <div>
            <Label>Total Capsules Filled (qty)</Label>
            <NumberInput
              value={form.totalCapsulesFilledQty}
              onChange={e => setForm({ ...form, totalCapsulesFilledQty: e.target.value })}
            />
          </div>
          <div>
            <Label>Rejected Capsules (qty)</Label>
            <NumberInput
              value={form.rejectedCapsulesQty}
              onChange={e => setForm({ ...form, rejectedCapsulesQty: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label>Temperature (C)</Label>
              <NumberInput
                value={form.temperatureC}
                onChange={e => setForm({ ...form, temperatureC: e.target.value })}
              />
            </div>
            <div>
              <Label>Humidity (%RH)</Label>
              <NumberInput
                value={form.humidityPercent}
                onChange={e => setForm({ ...form, humidityPercent: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Checkbox
              checked={form.dusterCheck}
              onChange={e => setForm({ ...form, dusterCheck: e.target.checked })}
              label="Duster Check"
            />
            <Checkbox
              checked={form.vacuumCheck}
              onChange={e => setForm({ ...form, vacuumCheck: e.target.checked })}
              label="Vacuum Check"
            />
          </div>
          <div>
            <Label>Yield (%)</Label>
            <Input value={yieldPercent !== null ? yieldPercent.toString() : '—'} disabled />
          </div>
          <div>
            <Label>Operator Name</Label>
            <Input
              value={form.operatorName}
              onChange={e => setForm({ ...form, operatorName: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Remarks</Label>
            <TextArea
              rows={3}
              value={form.remarks}
              onChange={e => setForm({ ...form, remarks: e.target.value })}
            />
          </div>
        </div>

        {/* Load Checks Table */}
        <div>
          <h3 className="text-base font-semibold mb-2">Load & Weight of Capsules</h3>
          <div className="overflow-auto max-h-72">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Load</TableHead>
                  <TableHead>W1 (mg)</TableHead>
                  <TableHead>W2 (mg)</TableHead>
                  <TableHead>W3 (mg)</TableHead>
                  <TableHead>W4 (mg)</TableHead>
                  <TableHead>W5 (mg)</TableHead>
                  <TableHead>Avg (mg)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadChecks.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Input
                        value={row.time}
                        onChange={e => handleLoadChange(idx, 'time', e.target.value)}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.loadLabel}
                        onChange={e => handleLoadChange(idx, 'loadLabel', e.target.value)}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <NumberInput
                        value={row.w1Mg?.toString() ?? ''}
                        onChange={e => handleLoadChange(idx, 'w1Mg', e.target.value)}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <NumberInput
                        value={row.w2Mg?.toString() ?? ''}
                        onChange={e => handleLoadChange(idx, 'w2Mg', e.target.value)}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <NumberInput
                        value={row.w3Mg?.toString() ?? ''}
                        onChange={e => handleLoadChange(idx, 'w3Mg', e.target.value)}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <NumberInput
                        value={row.w4Mg?.toString() ?? ''}
                        onChange={e => handleLoadChange(idx, 'w4Mg', e.target.value)}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <NumberInput
                        value={row.w5Mg?.toString() ?? ''}
                        onChange={e => handleLoadChange(idx, 'w5Mg', e.target.value)}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.avgWeightMg !== null ? row.avgWeightMg : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-4 border-t border-zinc-200">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={saving} disabled={saving}>
            {saving ? 'Saving...' : 'Save NJP Report'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function NJPReportsPage() {
  const searchParams = useSearchParams()
  const requestedBrandId = searchParams.get('brandId')
  const requestedBatchId = searchParams.get('batchId')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [njpMap, setNjpMap] = useState<Record<string, NJPReport>>({})
  const [statusMap, setStatusMap] = useState<Record<string, BatchStatusInfo>>({})

  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [existingReport, setExistingReport] = useState<NJPReport | null>(null)

  const njpReportsForPrint = useMemo(
    () => Object.values(njpMap).map((entry) => entry as unknown as Record<string, unknown>),
    [njpMap]
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

      // Build NJP map
      const njp: Record<string, NJPReport> = {}
      ;(njpList as NJPReport[]).forEach(r => {
        if (r.batchId) njp[r.batchId] = r
      })
      setNjpMap(njp)

      // Build status map
      const map: Record<string, BatchStatusInfo> = {}
      ;(batchesList as Batch[]).forEach(b => {
        const mixingReport = (mixingList as { batchId: string; status?: string }[]).find(r => r.batchId === b.id) || null
        const njpReport = (njpList as NJPReport[]).find(r => r.batchId === b.id) || null
        const assemblyReport = (assemblyList as { batchId: string; status?: string }[]).find(r => r.batchId === b.id) || null
        const hasMixing = isStageCompleted('mixing', b, mixingReport)
        const hasNJP = isStageCompleted('njp', b, njpReport)
        const hasAssembly = isStageCompleted('assembly', b, assemblyReport)
        const derivedStatus = deriveStatusFromFlags({ hasMixing, hasNJP, hasAssembly, status: b.status })

        map[b.id] = {
          hasMixing,
          hasNJP,
          hasAssembly,
          status: derivedStatus
        }
      })
      setStatusMap(map)

      if (focusBatchId) {
        const targetBatch = (batchesList as Batch[]).find(batch => batch.id === focusBatchId)
        const targetStatus = targetBatch ? map[targetBatch.id] : null

        if (!targetBatch || !targetStatus) {
          setError('The selected batch was not found for this brand.')
        } else if (!targetStatus.hasMixing) {
          setError('Mixing must be completed before NJP.')
        } else {
          setSelectedBatch(targetBatch)
          setExistingReport(njp[targetBatch.id] || null)
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

  const handleSelectBatch = async (batch: Batch) => {
    const st = statusMap[batch.id]
    if (!st?.hasMixing) {
      setError('Mixing must be completed before NJP.')
      return
    }

    setSelectedBatch(batch)
    setExistingReport(njpMap[batch.id] || null)
  }

  const handleSaveReport = async (payload: NJPReport) => {
    await saveNJPReport(payload)

    // Update local state
    setNjpMap(prev => ({ ...prev, [payload.batchId]: { ...payload, id: payload.id || 'new' } }))
    setStatusMap(prev => ({
      ...prev,
      [payload.batchId]: {
        ...(prev[payload.batchId] || {} as BatchStatusInfo),
        hasMixing: true,
        hasNJP: true,
        status: 'assemblyPending' as BatchStatus
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
          <h1 className="text-2xl font-bold">NJP Reports</h1>
          <p className="text-zinc-600">
            Select a brand to manage NJP (capsule filling) reports
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
            stage="njp"
            brandName={selectedBrand?.name}
            reports={njpReportsForPrint}
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
            njpMap={njpMap}
            statusMap={statusMap}
            onSelect={handleSelectBatch}
          />
        </Card>
      )}

      {/* NJP Form Modal */}
      {selectedBatch && (
        <NJPFormModal
          batch={selectedBatch}
          report={existingReport}
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
