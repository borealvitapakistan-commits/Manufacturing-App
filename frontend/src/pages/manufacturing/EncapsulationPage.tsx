import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
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
  useToast
} from '@/components/ui'
import {
  fetchLocalEncapsulation,
  fetchLocalMixings,
  saveLocalEncapsulation
} from '@/lib/supabase/data'

const EMPTY_CAPSULE_UNIT_WEIGHT_MG = 123

// ============================================================================
// Types
// ============================================================================


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


interface LocalMixingRecord {
  id: string
  mixingCode?: string | null
  mixedPowderName?: string | null
  brandId?: string | null
  brandName?: string | null
  brandIds?: string[] | null
  brandNames?: string[] | null
  brands?: LocalBrandRef[] | null
  productId?: string | null
  productName?: string | null
  rackNo?: string | null
  location?: string | null
  totalKgInMixing?: number | string | null
  totalKg?: number | string | null
  totalMixingKg?: number | string | null
  totalMixedQtyKg?: number | string | null
  totalFormulaQtyKg?: number | string | null
  availableMixedPowderKg?: number | string | null
  remainingMixedPowderKg?: number | string | null
  availablePowderKg?: number | string | null
  medicinalIngredients?: LocalMixingIngredient[]
  nonMedicinalIngredients?: LocalMixingIngredient[]
  rmUsage?: LocalMixingIngredient[]
  nonMedUsage?: LocalMixingIngredient[]
}

interface LocalBrandRef {
  id?: string | null
  brandId?: string | null
  name?: string | null
  brandName?: string | null
  codePrefix?: string | null
  code_prefix?: string | null
}

interface LocalMixingIngredient {
  doseMg?: number | string | null
  mgDoseUsed?: number | string | null
  mgDose?: number | string | null
  dosageMg?: number | string | null
  nmiDosageMg?: number | string | null
  labelClaimMgPerUnit?: number | string | null
  labelClaimMg?: number | string | null
}

interface LocalEncapsulationForm {
  mixingId: string
  encapsulationCode: string
  lotNumber: string
  capsuleSize: string
  location: string
  bucket: string
  machineModel: string
  machineSpeed: string
  rawMaterialReceivedKg: string
  targetFillWeightMg: string
  totalCapsulesProducedKg: string
  totalCapsulesFilledQty: string
  rejectedCapsulesQty: string
  temperatureC: string
  humidityPercent: string
  dusterCheck: boolean
  vacuumCheck: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  productionDate: string
  status: 'Underprocess' | 'Completed'
  remarks: string
  reason: string
  operatorName: string
}

interface LocalEncapsulationTimeLogForm {
  date: string
  startTime: string
  endTime: string
  remarks: string
}

interface LocalEncapsulationTimeLogSource {
  date?: number | { seconds: number } | string | null
  startDate?: number | { seconds: number } | string | null
  startTime?: string | null
  endDate?: number | { seconds: number } | string | null
  endTime?: string | null
  remarks?: string | null
}

interface LocalEncapsulationRecord {
  id: string
  mixingId?: string | null
  mixingCode?: string | null
  encapsulationCode?: string | null
  lotNumber?: string | null
  capsuleSize?: string | null
  location?: string | null
  rackNo?: string | null
  bucket?: string | null
  machineModel?: string | null
  machineSpeed?: string | null
  rawMaterialReceivedKg?: number | string | null
  mixingUsedInEncapsulationKg?: number | string | null
  targetFillWeightMg?: number | string | null
  totalCapsulesProducedKg?: number | string | null
  totalCapsulesFilledQty?: number | string | null
  netCapsulesFilledQty?: number | string | null
  rejectedCapsulesQty?: number | string | null
  temperatureC?: number | string | null
  humidityPercent?: number | string | null
  dusterCheck?: boolean | null
  vacuumCheck?: boolean | null
  startDate?: number | { seconds: number } | string | null
  startTime?: string | null
  endDate?: number | { seconds: number } | string | null
  endTime?: string | null
  productionDate?: number | { seconds: number } | string | null
  status?: LocalEncapsulationForm['status'] | 'In Encapsulation' | 'Encapsulation Completed' | string | null
  remarks?: string | null
  reason?: string | null
  changeReason?: string | null
  operatorName?: string | null
  encapsulationSessions?: LocalEncapsulationTimeLogSource[]
  encapsulationTimeLogs?: LocalEncapsulationTimeLogSource[]
  timeLogs?: LocalEncapsulationTimeLogSource[]
  loadChecks?: Partial<LoadCheck>[]
  availableCapsulesQty?: number | string | null
  remainingCapsulesQty?: number | string | null
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


function todayInput(): string {
  return new Date().toISOString().slice(0, 10)
}

function toDate(value: number | { seconds: number } | string | null | undefined): Date | null {
  if (!value) return null
  if (typeof value === 'object' && 'seconds' in value) return new Date(value.seconds * 1000)
  if (typeof value === 'string') {
    const parsed = value.includes('-') ? new Date(value) : new Date(Number(value))
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toDateInput(value: number | { seconds: number } | string | null | undefined): string {
  const date = toDate(value)
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}

function dateInputToMs(value: string): number | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day).getTime()
}

function integerOrNull(value: string | number | null | undefined): number | null {
  const number = numOrNull(value)
  return number === null ? null : Math.max(0, Math.trunc(number))
}

function kgFromMixing(record: LocalMixingRecord | null | undefined): number {
  if (!record) return 0
  return Number(
    record.totalKgInMixing ??
    record.totalKg ??
    record.totalMixingKg ??
    record.totalMixedQtyKg ??
    record.totalFormulaQtyKg ??
    0
  ) || 0
}

function availableKgFromMixing(record: LocalMixingRecord | null | undefined): number {
  if (!record) return 0
  return Number(
    record.availableMixedPowderKg ??
    record.remainingMixedPowderKg ??
    record.availablePowderKg ??
    kgFromMixing(record)
  ) || 0
}

function doseMgFromIngredient(row: LocalMixingIngredient): number {
  return Number(
    row.mgDoseUsed ??
    row.doseMg ??
    row.mgDose ??
    row.dosageMg ??
    row.nmiDosageMg ??
    row.labelClaimMgPerUnit ??
    row.labelClaimMg ??
    0
  ) || 0
}

function targetFillWeightFromMixing(record: LocalMixingRecord | null | undefined): number {
  if (!record) return 0
  const medicinalRows = record.medicinalIngredients?.length
    ? record.medicinalIngredients
    : record.rmUsage || []
  const nmiRows = record.nonMedicinalIngredients?.length
    ? record.nonMedicinalIngredients
    : record.nonMedUsage || []
  return [...medicinalRows, ...nmiRows].reduce(
    (total, row) => total + doseMgFromIngredient(row),
    0
  )
}

function capsulesFromMixKg(mixKg: number, targetFillWeightMg: string | number | null | undefined): number | null {
  const targetMg = Number(targetFillWeightMg)
  if (!Number.isFinite(targetMg) || targetMg <= 0 || mixKg <= 0) return null
  const targetKg = targetMg / 1_000_000
  return Math.floor(mixKg / targetKg)
}

function rejectedCapsulesCount(value: string | number | null | undefined): number {
  const number = numOrNull(value)
  return number === null ? 0 : Math.max(0, Math.trunc(number))
}

function emptyCapsuleWeightKg(capsulesCount: string | number | null | undefined): number | null {
  const count = Number(capsulesCount)
  if (!Number.isFinite(count) || count <= 0) return null
  return Math.round((count * EMPTY_CAPSULE_UNIT_WEIGHT_MG / 1_000_000) * 1_000_000) / 1_000_000
}

function totalCapsulesProducedKg(
  capsulesCount: string | number | null | undefined,
  targetFillWeightMg: string | number | null | undefined
): number | null {
  const count = Number(capsulesCount)
  const targetMg = Number(targetFillWeightMg)
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(targetMg) || targetMg <= 0) return null
  return Math.round((count * (targetMg + EMPTY_CAPSULE_UNIT_WEIGHT_MG) / 1_000_000) * 1_000_000) / 1_000_000
}

function capsuleQuantitySummary(
  mixKg: number,
  targetFillWeightMg: string | number | null | undefined,
  rejectedValue: string | number | null | undefined
) {
  const grossCapsules = capsulesFromMixKg(mixKg, targetFillWeightMg)
  const rejected = rejectedCapsulesCount(rejectedValue)
  if (grossCapsules === null) {
    return {
      grossCapsules: null,
      netCapsules: null,
      rejected,
      producedKg: null,
      emptyCapsuleKg: null,
      yieldPercent: null
    }
  }
  const netCapsules = Math.max(0, grossCapsules - rejected)
  const producedKg = totalCapsulesProducedKg(netCapsules, targetFillWeightMg)
  const emptyCapsuleKg = emptyCapsuleWeightKg(netCapsules)
  const yieldPercent = grossCapsules > 0
    ? Math.round((netCapsules / grossCapsules) * 10000) / 100
    : 0
  return {
    grossCapsules,
    netCapsules,
    rejected,
    producedKg,
    emptyCapsuleKg,
    yieldPercent
  }
}

function mixingDisplayName(record: LocalMixingRecord | null | undefined): string {
  if (!record) return ''
  return record.productName || record.mixedPowderName || record.mixingCode || 'Saved mixing'
}

function mixingLocation(record: LocalMixingRecord | null | undefined): string {
  if (!record) return ''
  return record.location || record.rackNo || ''
}

function brandNamesFromMixing(record: LocalMixingRecord | null | undefined): string {
  if (!record) return ''
  const names: string[] = []
  ;(record.brands || []).forEach(brand => {
    const name = String(brand.name || brand.brandName || '').trim()
    if (name && !names.includes(name)) names.push(name)
  })
  ;(record.brandNames || []).forEach(name => {
    const value = String(name || '').trim()
    if (value && !names.includes(value)) names.push(value)
  })
  const fallback = String(record.brandName || '').trim()
  if (fallback && !names.includes(fallback)) names.push(fallback)
  return names.join(', ')
}

function mixingOptionLabel(record: LocalMixingRecord): string {
  const code = record.mixingCode || 'No code'
  const name = mixingDisplayName(record)
  return name && name !== code ? `${code} - ${name}` : code
}

function formatKgValue(value: number | string | null | undefined): string {
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toFixed(4)} kg` : '-'
}

function emptyLoadCheck(): LoadCheck {
  return {
    time: '',
    loadLabel: '',
    w1Mg: '',
    w2Mg: '',
    w3Mg: '',
    w4Mg: '',
    w5Mg: '',
    avgWeightMg: null
  }
}

function emptyEncapsulationTimeLog(): LocalEncapsulationTimeLogForm {
  return {
    date: todayInput(),
    startTime: '',
    endTime: '',
    remarks: ''
  }
}

function emptyLocalEncapsulationForm(): LocalEncapsulationForm {
  return {
    mixingId: '',
    encapsulationCode: '',
    lotNumber: '',
    capsuleSize: '00',
    location: '',
    bucket: '',
    machineModel: '',
    machineSpeed: '',
    rawMaterialReceivedKg: '',
    targetFillWeightMg: '',
    totalCapsulesProducedKg: '',
    totalCapsulesFilledQty: '',
    rejectedCapsulesQty: '',
    temperatureC: '',
    humidityPercent: '',
    dusterCheck: false,
    vacuumCheck: false,
    startDate: todayInput(),
    startTime: '',
    endDate: '',
    endTime: '',
    productionDate: todayInput(),
    status: 'Underprocess',
    remarks: '',
    reason: '',
    operatorName: ''
  }
}

function formValue(value: string | number | boolean | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

function normalizeEncapsulationStatus(value: LocalEncapsulationRecord['status']): LocalEncapsulationForm['status'] {
  const text = String(value || '').trim().toLowerCase()
  return text === 'completed' || text === 'encapsulation completed' ? 'Completed' : 'Underprocess'
}

function sourceTimeLogs(record: LocalEncapsulationRecord): LocalEncapsulationTimeLogSource[] {
  return record.encapsulationSessions?.length
    ? record.encapsulationSessions
    : record.encapsulationTimeLogs?.length
      ? record.encapsulationTimeLogs
      : record.timeLogs || []
}

function timeLogsFromRecord(record: LocalEncapsulationRecord): LocalEncapsulationTimeLogForm[] {
  const rows = sourceTimeLogs(record)
  if (!rows.length) return [emptyEncapsulationTimeLog()]

  return rows.map(row => ({
    date: toDateInput(row.date || row.startDate) || todayInput(),
    startTime: row.startTime || '',
    endTime: row.endTime || '',
    remarks: row.remarks || ''
  }))
}

function loadChecksFromRecord(record: LocalEncapsulationRecord): LoadCheck[] {
  const rows = record.loadChecks || []
  if (!rows.length) return [emptyLoadCheck()]

  return rows.map(row => ({
    time: formValue(row.time),
    loadLabel: formValue(row.loadLabel),
    w1Mg: row.w1Mg ?? '',
    w2Mg: row.w2Mg ?? '',
    w3Mg: row.w3Mg ?? '',
    w4Mg: row.w4Mg ?? '',
    w5Mg: row.w5Mg ?? '',
    avgWeightMg: row.avgWeightMg ?? computeAvg([row.w1Mg ?? null, row.w2Mg ?? null, row.w3Mg ?? null, row.w4Mg ?? null, row.w5Mg ?? null])
  }))
}

function formFromRecord(record: LocalEncapsulationRecord): LocalEncapsulationForm {
  return {
    mixingId: record.mixingId || '',
    encapsulationCode: record.encapsulationCode || '',
    lotNumber: record.lotNumber || record.mixingCode || '',
    capsuleSize: record.capsuleSize || '00',
    location: record.location || record.rackNo || '',
    bucket: record.bucket || '',
    machineModel: record.machineModel || '',
    machineSpeed: record.machineSpeed || '',
    rawMaterialReceivedKg: formValue(record.rawMaterialReceivedKg ?? record.mixingUsedInEncapsulationKg),
    targetFillWeightMg: formValue(record.targetFillWeightMg),
    totalCapsulesProducedKg: formValue(record.totalCapsulesProducedKg),
    totalCapsulesFilledQty: formValue(record.totalCapsulesFilledQty ?? record.netCapsulesFilledQty),
    rejectedCapsulesQty: formValue(record.rejectedCapsulesQty),
    temperatureC: formValue(record.temperatureC),
    humidityPercent: formValue(record.humidityPercent),
    dusterCheck: record.dusterCheck === true,
    vacuumCheck: record.vacuumCheck === true,
    startDate: toDateInput(record.startDate) || todayInput(),
    startTime: record.startTime || '',
    endDate: toDateInput(record.endDate),
    endTime: record.endTime || '',
    productionDate: toDateInput(record.productionDate) || todayInput(),
    status: normalizeEncapsulationStatus(record.status),
    remarks: record.remarks || '',
    reason: record.reason || record.changeReason || '',
    operatorName: record.operatorName || ''
  }
}

// ============================================================================
// Local Encapsulation Create Page
// ============================================================================

export default function EncapsulationCreatePage() {
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [mixings, setMixings] = useState<LocalMixingRecord[]>([])
  const [editingRecord, setEditingRecord] = useState<LocalEncapsulationRecord | null>(null)
  const [form, setForm] = useState<LocalEncapsulationForm>(() => emptyLocalEncapsulationForm())
  const [timeLogs, setTimeLogs] = useState<LocalEncapsulationTimeLogForm[]>(() => [emptyEncapsulationTimeLog()])
  const [loadChecks, setLoadChecks] = useState<LoadCheck[]>(() => [emptyLoadCheck()])

  const selectedMixing = useMemo(
    () => mixings.find(item => item.id === form.mixingId) || null,
    [mixings, form.mixingId]
  )
  const sourceTargetFillWeightMg = useMemo(
    () => targetFillWeightFromMixing(selectedMixing),
    [selectedMixing]
  )
  const targetFillWeightChanged = Boolean(
    selectedMixing &&
    sourceTargetFillWeightMg > 0 &&
    numOrNull(form.targetFillWeightMg) !== null &&
    Math.abs((numOrNull(form.targetFillWeightMg) || 0) - sourceTargetFillWeightMg) > 0.0001
  )

  const encapsulationMixKg = useMemo(() => {
    const received = numOrNull(form.rawMaterialReceivedKg)
    if (received !== null) return received
    return availableKgFromMixing(selectedMixing)
  }, [form.rawMaterialReceivedKg, selectedMixing])
  const currentCapsuleSummary = useMemo(
    () => capsuleQuantitySummary(encapsulationMixKg, form.targetFillWeightMg, form.rejectedCapsulesQty),
    [form.rejectedCapsulesQty, form.targetFillWeightMg, encapsulationMixKg]
  )
  const yieldPercent = currentCapsuleSummary.yieldPercent
  const currentEmptyCapsuleWeightKg = currentCapsuleSummary.emptyCapsuleKg
  const currentAvailableMixingKg = useMemo(
    () => availableKgFromMixing(selectedMixing),
    [selectedMixing]
  )
  const previousUsageForSameMixing = useMemo(() => {
    if (!editingRecord || !selectedMixing || editingRecord.mixingId !== selectedMixing.id) return 0
    return Number(editingRecord.rawMaterialReceivedKg ?? editingRecord.mixingUsedInEncapsulationKg ?? 0) || 0
  }, [editingRecord, selectedMixing])
  const availableForThisSave = currentAvailableMixingKg + previousUsageForSameMixing
  const remainingMixingAfterEncapsulation = useMemo(() => {
    const used = numOrNull(form.rawMaterialReceivedKg)
    if (!selectedMixing || used === null) return null
    return Math.max(0, availableForThisSave - used)
  }, [availableForThisSave, form.rawMaterialReceivedKg, selectedMixing])

  useEffect(() => {
    async function loadEncapsulationForm() {
      try {
        setLoading(true)
        setError('')
        const [rows, record] = await Promise.all([
          fetchLocalMixings({ limit: 200 }),
          editId ? fetchLocalEncapsulation(editId) : Promise.resolve(null)
        ])
        setMixings(rows as LocalMixingRecord[])
        if (record) {
          const encapsulationRecord = record as LocalEncapsulationRecord
          setEditingRecord(encapsulationRecord)
          setForm(formFromRecord(encapsulationRecord))
          setTimeLogs(timeLogsFromRecord(encapsulationRecord))
          setLoadChecks(loadChecksFromRecord(encapsulationRecord))
        } else {
          setEditingRecord(null)
          setForm(emptyLocalEncapsulationForm())
          setTimeLogs([emptyEncapsulationTimeLog()])
          setLoadChecks([emptyLoadCheck()])
        }
      } catch (err) {
        console.error('Failed to load Encapsulation form:', err)
        setError(err instanceof Error ? err.message : 'Failed to load Encapsulation form.')
      } finally {
        setLoading(false)
      }
    }

    loadEncapsulationForm()
  }, [editId])

  const updateField = <K extends keyof LocalEncapsulationForm>(key: K, value: LocalEncapsulationForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSelectMixing = (mixingId: string) => {
    const mixing = mixings.find(item => item.id === mixingId) || null
    const targetFillWeightMg = targetFillWeightFromMixing(mixing)
    const restoredUsageKg =
      editingRecord && mixing && editingRecord.mixingId === mixing.id
        ? Number(editingRecord.rawMaterialReceivedKg ?? editingRecord.mixingUsedInEncapsulationKg ?? 0) || 0
        : 0
    const mixKg = availableKgFromMixing(mixing) + restoredUsageKg
    const capsuleSummary = capsuleQuantitySummary(
      mixKg,
      targetFillWeightMg > 0 ? String(targetFillWeightMg) : '',
      form.rejectedCapsulesQty
    )
    setForm(prev => ({
      ...prev,
      mixingId,
      lotNumber: mixing?.mixingCode || '',
      location: mixingLocation(mixing),
      rawMaterialReceivedKg: mixing ? String(mixKg) : '',
      targetFillWeightMg: targetFillWeightMg > 0 ? String(targetFillWeightMg) : '',
      totalCapsulesFilledQty: capsuleSummary.netCapsules === null ? '' : String(capsuleSummary.netCapsules),
      totalCapsulesProducedKg: capsuleSummary.producedKg === null ? '' : String(capsuleSummary.producedKg)
    }))
  }

  useEffect(() => {
    if (!selectedMixing || !form.targetFillWeightMg) return
    const capsuleSummary = capsuleQuantitySummary(encapsulationMixKg, form.targetFillWeightMg, form.rejectedCapsulesQty)
    setForm(prev => {
      const nextValue = capsuleSummary.netCapsules === null ? '' : String(capsuleSummary.netCapsules)
      const nextProducedKg = capsuleSummary.producedKg === null ? '' : String(capsuleSummary.producedKg)
      if (prev.totalCapsulesFilledQty === nextValue && prev.totalCapsulesProducedKg === nextProducedKg) return prev
      return { ...prev, totalCapsulesFilledQty: nextValue, totalCapsulesProducedKg: nextProducedKg }
    })
  }, [selectedMixing, form.targetFillWeightMg, form.rejectedCapsulesQty, encapsulationMixKg])

  const handleLoadChange = (index: number, field: keyof LoadCheck, value: string) => {
    setLoadChecks(rows => {
      const next = [...rows]
      const row = { ...next[index], [field]: value }
      row.avgWeightMg = computeAvg([row.w1Mg, row.w2Mg, row.w3Mg, row.w4Mg, row.w5Mg])
      next[index] = row
      return next
    })
  }

  const handleTimeLogChange = (index: number, field: keyof LocalEncapsulationTimeLogForm, value: string) => {
    setTimeLogs(rows => {
      const next = [...rows]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const addTimeLog = () => setTimeLogs(rows => [...rows, emptyEncapsulationTimeLog()])

  const removeTimeLog = (index: number) => {
    setTimeLogs(rows => rows.length <= 1 ? [emptyEncapsulationTimeLog()] : rows.filter((_, idx) => idx !== index))
  }

  const addLoadCheck = () => setLoadChecks(rows => [...rows, emptyLoadCheck()])

  const removeLoadCheck = (index: number) => {
    setLoadChecks(rows => rows.length <= 1 ? [emptyLoadCheck()] : rows.filter((_, idx) => idx !== index))
  }

  const handleReset = () => {
    if (editingRecord) {
      setForm(formFromRecord(editingRecord))
      setTimeLogs(timeLogsFromRecord(editingRecord))
      setLoadChecks(loadChecksFromRecord(editingRecord))
    } else {
      setForm(emptyLocalEncapsulationForm())
      setTimeLogs([emptyEncapsulationTimeLog()])
      setLoadChecks([emptyLoadCheck()])
    }
    setError('')
  }

  const handleSubmit = async () => {
    if (!form.mixingId) {
      setError('Select the Mixing you want to use for Encapsulation.')
      return
    }
    if (!selectedMixing) {
      setError('Selected Mixing was not found. Refresh the page and select Mixing again.')
      return
    }

    const usedMixingKg = numOrNull(form.rawMaterialReceivedKg)
    const availableMixingKg = availableForThisSave
    if (usedMixingKg === null || usedMixingKg <= 0) {
      setError('Enter how many kg of available Mixing you want to use for Encapsulation.')
      return
    }
    if (usedMixingKg > availableMixingKg + 0.0005) {
      setError(
        `Selected Mixing has ${availableMixingKg.toFixed(4)} kg available; you entered ${usedMixingKg.toFixed(4)} kg. Use ${availableMixingKg.toFixed(4)} kg or less.`
      )
      return
    }
    if (
      currentCapsuleSummary.grossCapsules !== null &&
      currentCapsuleSummary.rejected > currentCapsuleSummary.grossCapsules
    ) {
      setError(
        `Rejected Capsules Qty cannot be greater than total calculated capsules (${currentCapsuleSummary.grossCapsules}).`
      )
      return
    }

    try {
      setSaving(true)
      setError('')

      const cleanedLoadChecks = loadChecks
        .map(row => ({
          time: row.time,
          loadLabel: row.loadLabel,
          w1Mg: numOrNull(row.w1Mg),
          w2Mg: numOrNull(row.w2Mg),
          w3Mg: numOrNull(row.w3Mg),
          w4Mg: numOrNull(row.w4Mg),
          w5Mg: numOrNull(row.w5Mg),
          avgWeightMg: computeAvg([row.w1Mg, row.w2Mg, row.w3Mg, row.w4Mg, row.w5Mg])
        }))
        .filter(row =>
          row.time ||
          row.loadLabel ||
          row.w1Mg !== null ||
          row.w2Mg !== null ||
          row.w3Mg !== null ||
          row.w4Mg !== null ||
          row.w5Mg !== null
        )

      const temperatureC = numOrNull(form.temperatureC)
      const cleanedTimeLogs = timeLogs
        .map(row => {
          const date = dateInputToMs(row.date)
          return {
            date,
            startDate: date,
            startTime: row.startTime || null,
            endDate: date,
            endTime: row.endTime || null,
            remarks: row.remarks.trim() || null
          }
        })
        .filter(row => row.date || row.startTime || row.endTime || row.remarks)
      const firstTimeLog = cleanedTimeLogs[0]
      const lastTimeLog = cleanedTimeLogs[cleanedTimeLogs.length - 1]
      const calculatedEmptyCapsuleWeightKg = emptyCapsuleWeightKg(form.totalCapsulesFilledQty)
      const payload = {
        id: editId || undefined,
        mixingId: form.mixingId,
        encapsulationCode: form.encapsulationCode.trim() || undefined,
        lotNumber: selectedMixing?.mixingCode || form.lotNumber.trim() || undefined,
        capsuleSize: form.capsuleSize.trim() || undefined,
        location: form.location.trim() || undefined,
        bucket: form.bucket.trim() || undefined,
        machineModel: form.machineModel.trim() || undefined,
        machineSpeed: form.machineSpeed.trim() || undefined,
        rawMaterialReceivedKg: numOrNull(form.rawMaterialReceivedKg),
        targetFillWeightMg: numOrNull(form.targetFillWeightMg),
        totalCapsulesProducedKg: numOrNull(form.totalCapsulesProducedKg),
        totalCapsulesFilledQty: integerOrNull(form.totalCapsulesFilledQty),
        grossCapsulesFilledQty: currentCapsuleSummary.grossCapsules,
        netCapsulesFilledQty: integerOrNull(form.totalCapsulesFilledQty),
        emptyCapsuleUnitWeightMg: EMPTY_CAPSULE_UNIT_WEIGHT_MG,
        emptyCapsuleWeightMg: calculatedEmptyCapsuleWeightKg === null ? null : calculatedEmptyCapsuleWeightKg * 1_000_000,
        emptyCapsuleWeightKg: calculatedEmptyCapsuleWeightKg,
        rejectedCapsulesQty: integerOrNull(form.rejectedCapsulesQty),
        rejectedCapsulesWeightKg: totalCapsulesProducedKg(
          currentCapsuleSummary.rejected,
          form.targetFillWeightMg
        ),
        temperatureC,
        temperatureF: temperatureC !== null ? Math.round((temperatureC * 9 / 5 + 32) * 100) / 100 : null,
        humidityPercent: numOrNull(form.humidityPercent),
        dusterCheck: form.dusterCheck,
        vacuumCheck: form.vacuumCheck,
        yieldPercent,
        startDate: firstTimeLog?.startDate ?? null,
        startTime: firstTimeLog?.startTime ?? null,
        endDate: lastTimeLog?.endDate ?? null,
        endTime: lastTimeLog?.endTime ?? null,
        productionDate: firstTimeLog?.date ?? null,
        encapsulationSessions: cleanedTimeLogs,
        encapsulationTimeLogs: cleanedTimeLogs,
        timeLogs: cleanedTimeLogs,
        status: form.status,
        loadChecks: cleanedLoadChecks,
        remarks: form.remarks.trim() || null,
        reason: form.reason.trim() || null,
        operatorName: form.operatorName.trim() || null
      }

      const saved = await saveLocalEncapsulation(payload)
      try {
        const refreshedMixings = await fetchLocalMixings({ limit: 200 })
        setMixings(refreshedMixings as LocalMixingRecord[])
      } catch (refreshError) {
        console.error('Encapsulation saved, but failed to refresh Mixing availability:', refreshError)
      }
      showToast({ message: editId ? 'Encapsulation updated' : 'Encapsulation saved from selected Mixing', type: 'success' })
      if (editId && saved) {
        const savedRecord = saved as LocalEncapsulationRecord
        setEditingRecord(savedRecord)
        setForm(formFromRecord(savedRecord))
        setTimeLogs(timeLogsFromRecord(savedRecord))
        setLoadChecks(loadChecksFromRecord(savedRecord))
      } else {
        handleReset()
      }
    } catch (err) {
      console.error('Failed to save Encapsulation:', err)
      setError(err instanceof Error ? err.message : 'Failed to save Encapsulation.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="py-10 text-zinc-500">Loading Encapsulation form...</div>
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200 pb-4">
        <h1 className="text-2xl font-bold">{editId ? 'Edit Encapsulation' : 'Create Encapsulation'}</h1>
      </div>

      {error && (
        <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      <section className="border-b border-zinc-200 pb-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <Label>Mixing</Label>
            <select
              className="min-h-12 w-full border border-zinc-300 bg-white px-3 py-2 text-base focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30 sm:text-sm"
              value={form.mixingId}
              onChange={event => handleSelectMixing(event.target.value)}
            >
              <option value="">Select Mixing</option>
              {mixings.map(mixing => (
                <option key={mixing.id} value={mixing.id}>
                  {mixingOptionLabel(mixing)}
                </option>
              ))}
            </select>
            {mixings.length === 0 && (
              <p className="mt-2 text-sm text-amber-700">
                No saved Mixing is available yet. Create Mixing first, then create Encapsulation from it.
              </p>
            )}
          </div>

          {selectedMixing && (
            <div className="lg:col-span-2 grid gap-3 border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Mixing Code</p>
                <p className="font-semibold">{selectedMixing.mixingCode || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Mixing Name</p>
                <p className="font-semibold">{mixingDisplayName(selectedMixing)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Brand</p>
                <p className="font-semibold">{brandNamesFromMixing(selectedMixing) || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Location</p>
                <p className="font-semibold">{mixingLocation(selectedMixing) || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Product</p>
                <p className="font-semibold">{selectedMixing.productName || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Total Mixing</p>
                <p className="font-semibold">{formatKgValue(kgFromMixing(selectedMixing))}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Available Mixing</p>
                <p className="font-semibold">{formatKgValue(availableKgFromMixing(selectedMixing))}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="border-b border-zinc-200 pb-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Encapsulation Details</h2>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={handleReset}>Reset Form</Button>
            <Button type="button" onClick={handleSubmit} loading={saving} disabled={saving}>
              {editId ? 'Update Encapsulation' : 'Save Encapsulation'}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label>Encapsulation Code</Label>
            <Input
              placeholder="Auto-generated"
              value={form.encapsulationCode}
              onChange={event => updateField('encapsulationCode', event.target.value)}
            />
          </div>
          <div>
            <Label>Mixing Code</Label>
            <Input
              value={selectedMixing?.mixingCode || form.lotNumber || ''}
              disabled
            />
          </div>
          <div>
            <Label>Capsule Size</Label>
            <select
              className="min-h-12 w-full border border-zinc-300 bg-white px-3 py-2 text-base focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30 sm:text-sm"
              value={form.capsuleSize}
              onChange={event => updateField('capsuleSize', event.target.value)}
            >
              <option value="00">00</option>
              <option value="0">0</option>
            </select>
          </div>
          <div>
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={event => updateField('location', event.target.value)}
              placeholder="e.g., R1"
            />
          </div>
          <div>
            <Label>Bucket</Label>
            <Input
              value={form.bucket}
              onChange={event => updateField('bucket', event.target.value)}
              placeholder="e.g., B1"
            />
          </div>
          <div>
            <Label>Machine Model</Label>
            <Input
              value={form.machineModel}
              onChange={event => updateField('machineModel', event.target.value)}
            />
          </div>
          <div>
            <Label>Machine Speed</Label>
            <Input
              value={form.machineSpeed}
              onChange={event => updateField('machineSpeed', event.target.value)}
            />
          </div>
          <div>
            <Label>Available Mixing Used Kg</Label>
            <NumberInput
              value={form.rawMaterialReceivedKg}
              onChange={event => updateField('rawMaterialReceivedKg', event.target.value)}
            />
            {selectedMixing && (
              <p className="mt-1 text-xs text-zinc-500">
                Encapsulation formulas use this kg from Available Mixing, not Total Mixing. Available for this save: {availableForThisSave.toFixed(4)} kg
                {remainingMixingAfterEncapsulation === null ? '' : `; remaining after save: ${remainingMixingAfterEncapsulation.toFixed(4)} kg`}
              </p>
            )}
          </div>
          <div>
            <Label className="inline-flex items-center gap-2">
              Target Fill Weight Mg
              {targetFillWeightChanged && (
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-400 bg-amber-50 text-xs font-bold text-amber-700"
                  title="You have changed this value. It is not according to the MG scale taken from Mixing."
                >
                  i
                </span>
              )}
            </Label>
            <NumberInput
              value={form.targetFillWeightMg}
              onChange={event => updateField('targetFillWeightMg', event.target.value)}
            />
            {sourceTargetFillWeightMg > 0 && (
              <p className="mt-1 text-xs text-zinc-500">
                Mixing MG total: {sourceTargetFillWeightMg} mg
              </p>
            )}
          </div>
          <div>
            <Label>Total Capsules Filled Qty</Label>
            <NumberInput
              value={form.totalCapsulesFilledQty}
              disabled
            />
            {currentCapsuleSummary.grossCapsules !== null && (
              <p className="mt-1 text-xs text-zinc-500">
                Gross calculated: {currentCapsuleSummary.grossCapsules}; rejected: {currentCapsuleSummary.rejected}; good capsules: {currentCapsuleSummary.netCapsules}
              </p>
            )}
            {editingRecord && (
              <p className="mt-1 text-xs text-zinc-500">
                Available for Assembly: {Number(editingRecord.availableCapsulesQty ?? editingRecord.remainingCapsulesQty ?? 0)} capsules
                {' '}(capsules already used by Assembly are not counted here).
              </p>
            )}
          </div>
          <div>
            <Label>Total Capsules Produced Kg</Label>
            <NumberInput
              value={form.totalCapsulesProducedKg}
              disabled
            />
            <p className="mt-1 text-xs text-zinc-500">
              Good capsules only after rejected qty. Includes fill weight plus {EMPTY_CAPSULE_UNIT_WEIGHT_MG} mg per empty capsule
              {currentEmptyCapsuleWeightKg === null ? '' : ` (${currentEmptyCapsuleWeightKg.toFixed(6)} kg empty capsules)`}
            </p>
          </div>
          <div>
            <Label>Rejected Capsules Qty</Label>
            <NumberInput
              value={form.rejectedCapsulesQty}
              onChange={event => updateField('rejectedCapsulesQty', event.target.value)}
            />
          </div>
          <div>
            <Label>Yield Percent</Label>
            <Input value={yieldPercent === null ? '-' : String(yieldPercent)} disabled />
          </div>
          <div>
            <Label>Status</Label>
            <select
              className="min-h-12 w-full border border-zinc-300 bg-white px-3 py-2 text-base focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30 sm:text-sm"
              value={form.status}
              onChange={event => updateField('status', event.target.value as LocalEncapsulationForm['status'])}
            >
              <option value="Underprocess">Underprocess</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
          <div>
            <Label>Temperature C</Label>
            <NumberInput
              value={form.temperatureC}
              onChange={event => updateField('temperatureC', event.target.value)}
            />
          </div>
          <div>
            <Label>Humidity Percent</Label>
            <NumberInput
              value={form.humidityPercent}
              onChange={event => updateField('humidityPercent', event.target.value)}
            />
          </div>
          <div className="flex items-center gap-6">
            <Checkbox
              checked={form.dusterCheck}
              onChange={event => updateField('dusterCheck', event.target.checked)}
              label="Duster Check"
            />
            <Checkbox
              checked={form.vacuumCheck}
              onChange={event => updateField('vacuumCheck', event.target.checked)}
              label="Vacuum Check"
            />
          </div>
          <div>
            <Label>Operator Name</Label>
            <Input
              value={form.operatorName}
              onChange={event => updateField('operatorName', event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-200 pb-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Encapsulation Daily Time Log</h2>
            <p className="text-sm text-zinc-600">
              Use one row per day. This keeps start and end time attached to the correct date.
            </p>
          </div>
          <Button type="button" variant="subtle" onClick={addTimeLog}>Add Day</Button>
        </div>

        <div className="space-y-3">
          {timeLogs.map((row, index) => (
            <div
              key={index}
              className="grid gap-4 border border-zinc-200 p-4 lg:grid-cols-[minmax(140px,1fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)_minmax(220px,2fr)_auto]"
            >
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={row.date}
                  onChange={event => handleTimeLogChange(index, 'date', event.target.value)}
                />
              </div>
              <div>
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={row.startTime}
                  onChange={event => handleTimeLogChange(index, 'startTime', event.target.value)}
                />
              </div>
              <div>
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={row.endTime}
                  onChange={event => handleTimeLogChange(index, 'endTime', event.target.value)}
                />
                <p className="mt-1 text-xs text-zinc-500">Can stay blank until the day is complete.</p>
              </div>
              <div>
                <Label>Day Remarks</Label>
                <Input
                  placeholder="Example: Day 1 Encapsulation completed"
                  value={row.remarks}
                  onChange={event => handleTimeLogChange(index, 'remarks', event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="danger" onClick={() => removeTimeLog(index)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-zinc-200 pb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Encapsulation Load Checks</h2>
          <Button type="button" variant="subtle" onClick={addLoadCheck}>Add Load</Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Load</TableHead>
                <TableHead>W1 Mg</TableHead>
                <TableHead>W2 Mg</TableHead>
                <TableHead>W3 Mg</TableHead>
                <TableHead>W4 Mg</TableHead>
                <TableHead>W5 Mg</TableHead>
                <TableHead>Avg Mg</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadChecks.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Input
                      value={row.time}
                      onChange={event => handleLoadChange(index, 'time', event.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.loadLabel}
                      onChange={event => handleLoadChange(index, 'loadLabel', event.target.value)}
                    />
                  </TableCell>
                  {(['w1Mg', 'w2Mg', 'w3Mg', 'w4Mg', 'w5Mg'] as const).map(field => (
                    <TableCell key={field}>
                      <NumberInput
                        value={row[field]?.toString() ?? ''}
                        onChange={event => handleLoadChange(index, field, event.target.value)}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="font-semibold">
                    {row.avgWeightMg === null ? '-' : row.avgWeightMg}
                  </TableCell>
                  <TableCell>
                    <Button type="button" variant="danger" size="sm" onClick={() => removeLoadCheck(index)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="pb-6">
        <div className="grid gap-4">
          <div>
            <Label>Remarks</Label>
            <TextArea
              value={form.remarks}
              onChange={event => updateField('remarks', event.target.value)}
            />
          </div>
          <div>
            <Label>Reason</Label>
            <TextArea
              value={form.reason}
              onChange={event => updateField('reason', event.target.value)}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
