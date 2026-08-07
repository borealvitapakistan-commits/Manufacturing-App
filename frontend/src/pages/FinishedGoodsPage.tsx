// ============================================================================
// Finished Goods Page
// ============================================================================

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Modal,
  NumberInput,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableLoading,
  TableRow,
  TextArea,
  useToast
} from '@/components/ui'
import {
  deleteLocalAssembly,
  deleteLocalMixing,
  deleteLocalEncapsulation,
  fetchFinishedGoods,
  fetchFinishedGoodHistory,
  saveFinishedGood
} from '@/lib/supabase/data'
import { formatDate } from '@/lib/utils'
import type { FGCategory, FinishedGood, FinishedGoodHistory } from '@/types'

const tabs: Array<{ value: FGCategory; label: string }> = [
  { value: 'powder', label: 'Powders' },
  { value: 'capsule', label: 'Capsules' },
  { value: 'bottle', label: 'Bottles' }
]

interface EditForm {
  name: string
  location: string
  comments: string
  rackNo: string
  weightKg: string
  capsuleCode: string
  bucket: string
  capsuleMg: string
  capsuleWeightKg: string
  capsuleAmount: string
  capsuleStatus: string
  boxNo: string
  bottleTotal: string
  expiryDate: string
  reason: string
}

interface MixingPowderRow {
  id?: string
  brandName?: string | null
  productName?: string | null
  productCode?: string | null
  product_code?: string | null
  productNo?: string | null
  product_no?: string | null
  productNumber?: string | null
  product_number?: string | null
  productNpn?: string | null
  product_npn?: string | null
  npn?: string | null
  sku?: string | null
  mixingCode?: string | null
  location?: string | null
  rackNo?: string | null
  mixedPowderName?: string | null
  totalKgInMixing?: number | string | null
  totalKg?: number | string | null
  totalMixingKg?: number | string | null
  totalMixedQtyKg?: number | string | null
  totalFormulaQtyKg?: number | string | null
  availableMixedPowderKg?: number | string | null
  remainingMixedPowderKg?: number | string | null
  mixedPowderInventoryKg?: number | string | null
}

interface EncapsulationRow {
  id?: string

  encapsulationCode?: string | null
  encapsulation_code?: string | null
  code?: string | null
  lotNumber?: string | null
  lot_number?: string | null

  mixingCode?: string | null
  mixing_code?: string | null
  mixCode?: string | null
  mix_code?: string | null
  mixingName?: string | null
  mixing_name?: string | null

  productName?: string | null
  product_name?: string | null
  batchCode?: string | null
  batch_code?: string | null
  name?: string | null

  bucket?: string | null
  bucketNo?: string | null
  bucket_no?: string | null
  location?: string | null
  rackNo?: string | null
  rack_no?: string | null

  targetFillWeightMg?: number | string | null
  target_fill_weight_mg?: number | string | null
  tfwMg?: number | string | null
  tfw_mg?: number | string | null

  totalCapsulesFilledQty?: number | string | null
  total_capsules_filled_qty?: number | string | null
  netCapsulesFilledQty?: number | string | null
  net_capsules_filled_qty?: number | string | null
  grossCapsulesFilledQty?: number | string | null
  gross_capsules_filled_qty?: number | string | null

  availableCapsulesQty?: number | string | null
  available_capsules_qty?: number | string | null
  remainingCapsulesQty?: number | string | null
  remaining_capsules_qty?: number | string | null

  status?: string | null
  encapsulationStatus?: string | null
  encapsulation_status?: string | null

  capsuleMg?: number | string | null
  capsuleAmount?: number | string | null
  capsuleStatus?: string | null
}

interface BrandBatchCode {
  brandId?: string | null
  brandName?: string | null
  codePrefix?: string | null
  batchCode?: string | null
  assemblyCode?: string | null
}

interface AssemblyBottleRow {
  id?: string
  assemblyId?: string | null
  assembly_id?: string | null
  assemblyCode?: string | null
  assembly_code?: string | null
  code?: string | null
  brandId?: string | null
  brand_id?: string | null
  brandName?: string | null
  brand_name?: string | null
  batchCodeDisplay?: string | null
  batch_code_display?: string | null
  brandBatchCodes?: BrandBatchCode[] | null
  brand_batch_codes?: BrandBatchCode[] | null
  encapsulationCode?: string | null
  encapsulation_code?: string | null
  productName?: string | null
  product_name?: string | null
  batchNo?: string | null
  batch_no?: string | null
  batchCode?: string | null
  batch_code?: string | null
  location?: string | null
  rackNo?: string | null
  rack_no?: string | null
  boxNo?: string | null
  box_no?: string | null
  bucket?: string | null
  totalBottlesMade?: number | string | null
  total_bottles_made?: number | string | null
  bottleQuantity?: number | string | null
  bottle_quantity?: number | string | null
  bottleTotal?: number | string | null
  bottle_total?: number | string | null
  availableBottleQuantity?: number | string | null
  available_bottle_quantity?: number | string | null
  remainingBottleQuantity?: number | string | null
  capsulesPerBottle?: number | string | null
  capsules_per_bottle?: number | string | null
  unitsPerBottle?: number | string | null
  totalUnitsUsed?: number | string | null
  total_units_used?: number | string | null
  availableUnitsQty?: number | string | null
  available_units_qty?: number | string | null
  remainingUnitsQty?: number | string | null
  capsulesReceivedQty?: number | string | null
  capsules_received_qty?: number | string | null
  filledBottleWeight?: number | string | null
  filled_bottle_weight?: number | string | null
  weightUnit?: string | null
  weight_unit?: string | null
  productionDate?: number | { seconds: number } | string | null
  production_date?: number | { seconds: number } | string | null
  expiryDate?: number | { seconds: number } | string | null
  expiry_date?: number | { seconds: number } | string | null
  status?: string | null
  assemblyStatus?: string | null
  assembly_status?: string | null
  comments?: string | null
  remarks?: string | null
}

const defaultForm: EditForm = {
  name: '',
  location: '',
  comments: '',
  rackNo: '',
  weightKg: '',
  capsuleCode: '',
  bucket: '',
  capsuleMg: '',
  capsuleWeightKg: '',
  capsuleAmount: '',
  capsuleStatus: '',
  boxNo: '',
  bottleTotal: '',
  expiryDate: '',
  reason: ''
}

function toNullableNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toNullableInteger(value: string): number | null {
  if (!value.trim()) return null
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function toDateInput(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'number') {
    return new Date(value).toISOString().slice(0, 10)
  }
  if (typeof value === 'string') {
    return value.includes('T') ? value.slice(0, 10) : value
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = Number((value as { seconds: number }).seconds)
    return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString().slice(0, 10) : ''
  }
  return ''
}

function prettyFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (value) => value.toUpperCase())
}

function printValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function numberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stringOrDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function formatKg(value: string | number | null | undefined): string {
  const parsed = numberOrNull(value)
  return parsed === null ? '—' : parsed.toFixed(4)
}

function formatNumber(value: string | number | null | undefined): string {
  const parsed = numberOrNull(value)
  if (parsed === null) return '—'
  return Number.isInteger(parsed) ? String(parsed) : String(parsed)
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function recentMonthKeys(count: number): string[] {
  const now = new Date()
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  }
  return keys
}

function mixingPowderKg(record: MixingPowderRow): number | null {
  return (
    numberOrNull((record as { weightKg?: number | string | null }).weightKg) ??
    numberOrNull(record.availableMixedPowderKg) ??
    numberOrNull(record.remainingMixedPowderKg) ??
    numberOrNull(record.mixedPowderInventoryKg) ??
    numberOrNull(record.totalKgInMixing) ??
    numberOrNull(record.totalKg) ??
    numberOrNull(record.totalMixingKg) ??
    numberOrNull(record.totalMixedQtyKg) ??
    numberOrNull(record.totalFormulaQtyKg)
  )
}

function tabTitle(tab: FGCategory): string {
  if (tab === 'powder') return 'Powder'
  if (tab === 'capsule') return 'Capsule'
  return 'Bottle'
}

function encapsulationCode(item: EncapsulationRow): string {
  return stringOrDash(
    item.encapsulationCode ??
      item.encapsulation_code ??
      item.code ??
      item.lotNumber ??
      item.lot_number
  )
}

function encapsulationProductName(item: EncapsulationRow): string {
  return stringOrDash(
    item.productName ??
      item.product_name ??
      item.batchCode ??
      item.batch_code ??
      item.name
  )
}

function encapsulationAvailableCapsulesQty(item: EncapsulationRow): string {
  return formatNumber(
    item.availableCapsulesQty ??
      item.available_capsules_qty ??
      item.remainingCapsulesQty ??
      item.remaining_capsules_qty ??
      item.capsuleAmount
  )
}

function assemblyCodeValue(item: AssemblyBottleRow): string {
  return stringOrDash(item.assemblyCode ?? item.assembly_code ?? item.code)
}

function assemblyProductName(item: AssemblyBottleRow): string {
  return stringOrDash(item.productName ?? item.product_name)
}

function assemblyBatchCode(item: AssemblyBottleRow): string {
  return stringOrDash(item.batchCode ?? item.batch_code)
}

function assemblyAvailableBottleQuantity(item: AssemblyBottleRow): string {
  return formatNumber(
    item.availableBottleQuantity ?? item.available_bottle_quantity ?? item.remainingBottleQuantity
  )
}

export default function FinishedGoodsPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<FGCategory>('powder')
  const [rows, setRows] = useState<FinishedGood[]>([])
  const [mixingRows, setMixingRows] = useState<MixingPowderRow[]>([])
  const [encapsulationRows, setEncapsulationRows] = useState<EncapsulationRow[]>([])
  const [assemblyRows, setAssemblyRows] = useState<AssemblyBottleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<FinishedGood | null>(null)
  const [form, setForm] = useState<EditForm>(defaultForm)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRows, setHistoryRows] = useState<FinishedGoodHistory[]>([])
  const [historyTarget, setHistoryTarget] = useState<FinishedGood | null>(null)
  const { showToast } = useToast()
  const [activeMonth, setActiveMonth] = useState<string>(() => monthKey(new Date()))
  const monthOptions = useMemo(() => recentMonthKeys(6), [])
  const isCurrentMonth = activeMonth === monthKey(new Date())
  const activeTableColSpan =
    activeTab === 'bottle'
      ? (isCurrentMonth ? 6 : 5)
      : (isCurrentMonth ? 5 : 4)

  const loadRequestRef = useRef(0)

  useEffect(() => {
    void loadData(activeTab)
  }, [activeTab, activeMonth])

  async function loadData(category: FGCategory) {
    const requestId = ++loadRequestRef.current
    try {
      setLoading(true)
      setError('')
      const list = await fetchFinishedGoods({ category, month: activeMonth, limit: 200 })
      if (loadRequestRef.current !== requestId) return
      setRows(list as FinishedGood[])
      setMixingRows(category === 'powder' ? (list as MixingPowderRow[]) : [])
      setEncapsulationRows(category === 'capsule' ? (list as EncapsulationRow[]) : [])
      setAssemblyRows(category === 'bottle' ? (list as AssemblyBottleRow[]) : [])
    } catch (err) {
      if (loadRequestRef.current !== requestId) return
      console.error('Failed to load finished goods:', err)
      setRows([])
      setMixingRows([])
      setEncapsulationRows([])
      setAssemblyRows([])

      setError(`Failed to load ${tabTitle(category).toLowerCase()} finished goods records.`)
    } finally {
      if (loadRequestRef.current === requestId) {
        setLoading(false)
      }
    }
  }

  function startEdit(item: FinishedGood) {
    setEditing(item)
    setForm({
      name: item.name || '',
      location: item.location || '',
      comments: item.comments || '',
      rackNo: item.rackNo || '',
      weightKg: item.weightKg === null || item.weightKg === undefined ? '' : String(item.weightKg),
      capsuleCode: item.capsuleCode || '',
      bucket: item.bucket || '',
      capsuleMg: item.capsuleMg === null || item.capsuleMg === undefined ? '' : String(item.capsuleMg),
      capsuleWeightKg: item.capsuleWeightKg === null || item.capsuleWeightKg === undefined ? '' : String(item.capsuleWeightKg),
      capsuleAmount: item.capsuleAmount === null || item.capsuleAmount === undefined ? '' : String(item.capsuleAmount),
      capsuleStatus: item.capsuleStatus || '',
      boxNo: item.boxNo || '',
      bottleTotal: item.bottleTotal === null || item.bottleTotal === undefined ? '' : String(item.bottleTotal),
      expiryDate: toDateInput(item.expiryDate),
      reason: ''
    })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(defaultForm)
  }

  async function saveEdit() {
    if (!editing) return

    const reason = form.reason.trim()

    if (!reason) {
      setError('Reason is required for manual edits.')
      return
    }

    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }

    if (!form.location.trim()) {
      setError('Location is required.')
      return
    }

    const capsuleAmount = toNullableInteger(form.capsuleAmount)
    const bottleTotal = toNullableInteger(form.bottleTotal)

    if (form.capsuleAmount.trim() && capsuleAmount === null) {
      setError('Capsule amount must be a whole number.')
      return
    }

    if (form.bottleTotal.trim() && bottleTotal === null) {
      setError('Bottle total must be a whole number.')
      return
    }

    try {
      setSaving(true)
      setError('')

      await saveFinishedGood({
        id: editing.id,
        reason,
        name: form.name.trim(),
        location: form.location.trim(),
        comments: form.comments.trim(),
        rackNo: form.rackNo.trim() || null,
        weightKg: toNullableNumber(form.weightKg),
        capsuleCode: form.capsuleCode.trim() || null,
        bucket: form.bucket.trim() || null,
        capsuleMg: toNullableNumber(form.capsuleMg),
        capsuleWeightKg: toNullableNumber(form.capsuleWeightKg),
        capsuleAmount,
        capsuleStatus: form.capsuleStatus.trim() || null,
        boxNo: form.boxNo.trim() || null,
        bottleTotal,
        expiryDate: form.expiryDate || null
      })

      showToast({ message: 'Finished good updated', type: 'success' })
      cancelEdit()
      await loadData(activeTab)
    } catch (err) {
      console.error('Failed to update finished good:', err)
      setError(err instanceof Error ? err.message : 'Failed to update finished good.')
    } finally {
      setSaving(false)
    }
  }

  async function openHistory(item: FinishedGood) {
    try {
      setHistoryTarget(item)
      setHistoryOpen(true)
      setHistoryLoading(true)
      const history = await fetchFinishedGoodHistory(item.id)
      setHistoryRows(history as FinishedGoodHistory[])
    } catch (err) {
      console.error('Failed to load history:', err)
      showToast({ message: 'Failed to load history', type: 'error' })
      setHistoryRows([])
    } finally {
      setHistoryLoading(false)
    }
  }

  function closeHistory() {
    setHistoryOpen(false)
    setHistoryRows([])
    setHistoryTarget(null)
  }

  function openMixingEdit(item: MixingPowderRow) {
    if (!item.id) return
    navigate(`/mixing?edit=${encodeURIComponent(item.id)}`)
  }

  function openEncapsulationEdit(item: EncapsulationRow) {
    if (!item.id) return
    navigate(`/encapsulation?edit=${encodeURIComponent(item.id)}`)
  }

  function assemblyRecordId(item: AssemblyBottleRow): string | undefined {
    return item.assemblyId || item.assembly_id || item.id
  }

  function openAssemblyEdit(item: AssemblyBottleRow) {
    const id = assemblyRecordId(item)
    if (!id) return
    navigate(`/assembly?edit=${encodeURIComponent(id)}`)
  }

  async function deleteMixingPowder(item: MixingPowderRow) {
    if (!item.id) return

    const label = item.mixingCode || item.productName || 'this mixing'

    if (!window.confirm(`Delete ${label}?`)) return

    try {
      setLoading(true)
      setError('')
      await deleteLocalMixing(item.id)
      showToast({ message: 'Mixing deleted', type: 'success' })
      await loadData('powder')
    } catch (err) {
      console.error('Failed to delete mixing:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete mixing.')
    } finally {
      setLoading(false)
    }
  }

  async function deleteEncapsulationCapsule(item: EncapsulationRow) {
    if (!item.id) return

    const label = encapsulationCode(item) || encapsulationProductName(item) || 'this Encapsulation capsule record'

    if (!window.confirm(`Delete ${label}?`)) return

    try {
      setLoading(true)
      setError('')
      await deleteLocalEncapsulation(item.id)
      showToast({ message: 'Encapsulation capsule record deleted', type: 'success' })
      await loadData('capsule')
    } catch (err) {
      console.error('Failed to delete Encapsulation capsule record:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete Encapsulation capsule record.')
    } finally {
      setLoading(false)
    }
  }

  async function deleteAssemblyBottle(item: AssemblyBottleRow) {
    const id = assemblyRecordId(item)
    if (!id) return

    const label = assemblyCodeValue(item) || assemblyProductName(item) || 'this Assembly bottle record'

    if (!window.confirm(`Delete ${label}?`)) return

    try {
      setLoading(true)
      setError('')
      await deleteLocalAssembly(id)
      showToast({ message: 'Assembly bottle record deleted', type: 'success' })
      await loadData('bottle')
    } catch (err) {
      console.error('Failed to delete Assembly bottle record:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete Assembly bottle record.')
    } finally {
      setLoading(false)
    }
  }

  const editingTitle = useMemo(() => {
    if (!editing) return ''
    return `Edit ${tabTitle(editing.category)} Entry`
  }, [editing])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Finished Goods</h1>
        <p className="text-zinc-600">
          Track mixed powders, capsules, and bottled products through finished inventory
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-100 p-3 text-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setActiveTab(tab.value)
              cancelEdit()
            }}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.value
                ? 'border-[#1D838D] bg-[#1D838D] text-white'
                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {monthOptions.map((month) => (
          <button
            key={month}
            type="button"
            onClick={() => setActiveMonth(month)}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              activeMonth === month
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {monthLabel(month)}
          </button>
        ))}
      </div>

      {!isCurrentMonth && (
        <p className="text-sm text-zinc-500">
          Showing a read-only snapshot of {monthLabel(activeMonth)}. Editing is only available on the current month.
        </p>
      )}

      {editing && activeTab !== 'capsule' && (
        <Card
          title={editingTitle}
          actions={(
            <div className="flex gap-2">
              <Button variant="ghost" onClick={cancelEdit}>
                Cancel
              </Button>
              <Button onClick={saveEdit} loading={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}
        >
          <div className="mb-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
            Batch Code: <span className="font-semibold">{editing.batchCode}</span> | Brand: {editing.brandName} | Product: {editing.productName}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Finished good name"
              />
            </div>

            <div>
              <Label>Location *</Label>
              <Input
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
                placeholder="Storage location"
              />
            </div>

            {editing.category === 'powder' && (
              <>
                <div>
                  <Label>Rack No.</Label>
                  <Input
                    value={form.rackNo}
                    onChange={(event) => setForm({ ...form, rackNo: event.target.value })}
                  />
                </div>

                <div>
                  <Label>Weight KG</Label>
                  <NumberInput
                    value={form.weightKg}
                    onChange={(event) => setForm({ ...form, weightKg: event.target.value })}
                  />
                </div>
              </>
            )}

            {editing.category === 'bottle' && (
              <>
                <div>
                  <Label>Box No.</Label>
                  <Input
                    value={form.boxNo}
                    onChange={(event) => setForm({ ...form, boxNo: event.target.value })}
                  />
                </div>

                <div>
                  <Label>Total Bottles</Label>
                  <NumberInput
                    step="1"
                    value={form.bottleTotal}
                    onChange={(event) => setForm({ ...form, bottleTotal: event.target.value })}
                  />
                </div>

                <div>
                  <Label>Expiry Date</Label>
                  <Input
                    type="date"
                    value={form.expiryDate}
                    onChange={(event) => setForm({ ...form, expiryDate: event.target.value })}
                  />
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <Label>Comments</Label>
              <TextArea
                rows={2}
                value={form.comments}
                onChange={(event) => setForm({ ...form, comments: event.target.value })}
                placeholder="Optional notes"
              />
            </div>

            <div className="sm:col-span-2">
              <Label>Reason *</Label>
              <TextArea
                rows={3}
                value={form.reason}
                onChange={(event) => setForm({ ...form, reason: event.target.value })}
                placeholder="Required reason for this manual change"
              />
            </div>
          </div>
        </Card>
      )}

      <Card title={tabs.find((tab) => tab.value === activeTab)?.label || 'Finished Goods'}>
        <Table>
          <TableHeader>
            <TableRow>
              {activeTab === 'powder' && (
                <>
                  <TableHead className="w-12">Sr</TableHead>
                  <TableHead>Mixing Code</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Quantity</TableHead>
                  {isCurrentMonth && <TableHead>Actions</TableHead>}
                </>
              )}

              {activeTab === 'capsule' && (
                <>
                  <TableHead className="w-12">Sr</TableHead>
                  <TableHead>Encapsulation Code</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Quantity</TableHead>
                  {isCurrentMonth && <TableHead>Actions</TableHead>}
                </>
              )}

              {activeTab === 'bottle' && (
                <>
                  <TableHead className="w-12">Sr</TableHead>
                  <TableHead>Assembly Code</TableHead>
                  <TableHead>Batch Code</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Quantity</TableHead>
                  {isCurrentMonth && <TableHead>Actions</TableHead>}
                </>
              )}
            </TableRow>
          </TableHeader>

            <TableBody>
            {loading ? (
              <TableLoading colSpan={activeTableColSpan} />
            ) : activeTab === 'powder' ? (
              mixingRows.length === 0 ? (
                <TableEmpty colSpan={activeTableColSpan} message="No mixing records found." />
              ) : (
                mixingRows.map((item, index) => (
                  <TableRow key={item.id || item.mixingCode || item.productName || 'mixing-row'}>
                    <TableCell className="text-zinc-500">{index + 1}</TableCell>

                    <TableCell className="font-semibold">
                      {item.mixingCode || '—'}
                    </TableCell>

                    <TableCell className="font-medium">
                      {item.productName || item.mixedPowderName || '—'}
                    </TableCell>

                    <TableCell>
                      {formatKg(mixingPowderKg(item))}
                    </TableCell>

                    {isCurrentMonth && (
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() => openMixingEdit(item)}
                            disabled={!item.id}
                          >
                            Edit
                          </Button>

                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => void deleteMixingPowder(item)}
                            disabled={!item.id}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )
            ) : activeTab === 'capsule' ? (
              encapsulationRows.length === 0 ? (
                <TableEmpty colSpan={activeTableColSpan} message="No capsule entries found." />
              ) : (
                encapsulationRows.map((item, index) => (
                  <TableRow key={item.id || `${encapsulationCode(item)}-${index}`}>
                    <TableCell className="text-zinc-500">{index + 1}</TableCell>

                    <TableCell className="font-semibold">
                      {encapsulationCode(item)}
                    </TableCell>

                    <TableCell className="font-medium">
                      {encapsulationProductName(item)}
                    </TableCell>

                    <TableCell>
                      {encapsulationAvailableCapsulesQty(item)}
                    </TableCell>

                    {isCurrentMonth && (
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() => openEncapsulationEdit(item)}
                            disabled={!item.id}
                          >
                            Edit
                          </Button>

                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => void deleteEncapsulationCapsule(item)}
                            disabled={!item.id}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )
            ) : assemblyRows.length === 0 ? (
              <TableEmpty colSpan={activeTableColSpan} message="No Assembly bottle entries found." />
            ) : (
              assemblyRows.map((item, index) => (
                <TableRow key={item.id || `${assemblyCodeValue(item)}-${index}`}>
                  <TableCell className="text-zinc-500">{index + 1}</TableCell>

                  <TableCell className="font-semibold">
                    {assemblyCodeValue(item)}
                  </TableCell>

                  <TableCell>
                    {assemblyBatchCode(item)}
                  </TableCell>

                  <TableCell className="font-medium">
                    {assemblyProductName(item)}
                  </TableCell>

                  <TableCell>
                    {assemblyAvailableBottleQuantity(item)}
                  </TableCell>

                  {isCurrentMonth && (
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={() => openAssemblyEdit(item)}
                          disabled={!item.id}
                        >
                          Edit
                        </Button>

                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => void deleteAssemblyBottle(item)}
                          disabled={!item.id}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Modal
        open={historyOpen}
        onClose={closeHistory}
        title={`History ${historyTarget ? `- ${historyTarget.batchCode}` : ''}`}
        className="max-w-4xl"
      >
        {historyLoading ? (
          <div className="py-6 text-center text-zinc-500">Loading history...</div>
        ) : historyRows.length === 0 ? (
          <div className="py-6 text-center text-zinc-500">No history entries found.</div>
        ) : (
          <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
            {historyRows.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={entry.changeSource === 'manual' ? 'info' : 'success'}>
                      {entry.changeSource === 'manual' ? 'Manual' : 'Auto'}
                    </Badge>

                    <p className="text-sm font-semibold text-zinc-900">
                      {entry.changeType.replace(/_/g, ' ')}
                    </p>
                  </div>

                  <p className="text-xs text-zinc-500">
                    {formatDate(entry.createdAt)}
                  </p>
                </div>

                {entry.reason && (
                  <p className="mt-2 text-sm text-zinc-700">
                    <span className="font-medium">Reason:</span> {entry.reason}
                  </p>
                )}

                <div className="mt-3 space-y-1 text-sm">
                  {Object.entries(entry.changes || {}).length === 0 ? (
                    <p className="text-zinc-500">No field-level diff captured.</p>
                  ) : (
                    Object.entries(entry.changes).map(([field, diff]) => (
                      <div
                        key={field}
                        className="grid gap-1 rounded-lg bg-zinc-50 p-2 sm:grid-cols-[180px_1fr]"
                      >
                        <p className="font-medium text-zinc-700">
                          {prettyFieldName(field)}
                        </p>

                        <p className="text-zinc-600">
                          <span className="font-medium">{printValue(diff.old)}</span>
                          {' -> '}
                          <span className="font-medium">{printValue(diff.new)}</span>
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
