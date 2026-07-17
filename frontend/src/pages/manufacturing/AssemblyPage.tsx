'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  Button,
  Input,
  Label,
  NumberInput,
  TextArea,
  useToast
} from '@/components/ui'
import {
  fetchBrands,
  fetchBottleLidInventory,
  fetchLabelInventory,
  fetchLocalAssembly,
  fetchLocalNJPs,
  fetchProducts,
  saveLocalAssembly
} from '@/lib/supabase/data'
import type { Brand, Product } from '@/types'

interface LocalBrandRef {
  id?: string | null
  brandId?: string | null
  name?: string | null
  brandName?: string | null
  codePrefix?: string | null
  code_prefix?: string | null
}

interface BrandBatchCode {
  brandId?: string | null
  brandName?: string | null
  codePrefix?: string | null
  batchCode?: string | null
  assemblyCode?: string | null
}

interface LocalNJPRecord {
  id: string
  njpCode?: string | null
  mixingCode?: string | null
  mixingName?: string | null
  brandId?: string | null
  brandName?: string | null
  brandIds?: string[] | null
  brandNames?: string[] | null
  brands?: LocalBrandRef[] | null
  isMultiBrand?: boolean | null
  productId?: string | null
  productName?: string | null
  location?: string | null
  rackNo?: string | null
  bucket?: string | null
  productionDate?: number | { seconds: number } | string | null
  targetFillWeightMg?: number | string | null
  emptyCapsuleUnitWeightMg?: number | string | null
  capsuleWeightMg?: number | string | null
  capsuleWeight?: number | string | null
  totalCapsulesProducedKg?: number | string | null
  totalCapsulesFilledQty?: number | string | null
  netCapsulesFilledQty?: number | string | null
  grossCapsulesFilledQty?: number | string | null
  availableCapsulesQty?: number | string | null
  remainingCapsulesQty?: number | string | null
  availableCapsuleQty?: number | string | null
}

interface LocalAssemblyRecord {
  id?: string
  assemblyCode?: string | null
  batchCode?: string | null
  batchCodeDisplay?: string | null
  brandBatchCodes?: BrandBatchCode[] | null
  njpId?: string | null
  brandId?: string | null
  brandName?: string | null
  brandIds?: string[] | null
  brandNames?: string[] | null
  brands?: LocalBrandRef[] | null
  isMultiBrand?: boolean | null
  productId?: string | null
  productName?: string | null
  location?: string | null
  bucket?: string | null
  boxNo?: string | null
  capsuleWeightMg?: number | string | null
  capsulesReceivedQty?: number | string | null
  capsulesReceivedKg?: number | string | null
  bottleCC?: number | string | null
  filledBottleWeight?: number | string | null
  capsulesPerBottle?: number | string | null
  totalBottlesMade?: number | string | null
  looseCapsulesQty?: number | string | null
  remainingCapsulesAfterBottlingQty?: number | string | null
  bottleLidId?: string | null
  bottleType?: string | null
  bottleCapsuleType?: string | null
  bottleSize?: string | null
  bottleInventoryBeforeQty?: number | string | null
  bottleInventoryUsedQty?: number | string | null
  bottleInventoryAfterQty?: number | string | null
  labelId?: string | null
  totalLabelsUsed?: number | string | null
  labelInventoryBeforeQty?: number | string | null
  labelInventoryUsedQty?: number | string | null
  labelInventoryAfterQty?: number | string | null
  productionDate?: number | { seconds: number } | string | null
  expiryDate?: number | { seconds: number } | string | null
  qualityControlDate?: number | { seconds: number } | string | null
  qcDate?: number | { seconds: number } | string | null
  qualityControlStartTime?: string | null
  qualityControlEndTime?: string | null
  qcStartTime?: string | null
  qcEndTime?: string | null
  packagingDate?: number | { seconds: number } | string | null
  packageDate?: number | { seconds: number } | string | null
  packagingStartTime?: string | null
  packagingEndTime?: string | null
  receivedCapsuleBucketNumber?: string | null
  receivedCapsulesProductionDate?: number | { seconds: number } | string | null
  status?: 'Underprocess' | 'Completed' | 'In Assembly' | 'Assembly Completed' | string | null
  comments?: string | null
  remarks?: string | null
  operatorName?: string | null
  assemblySessions?: AssemblyTimeLogSource[]
  assemblyTimeLogs?: AssemblyTimeLogSource[]
  timeLogs?: AssemblyTimeLogSource[]
}

interface BottleLidRecord {
  id: string
  bottleType?: string | null
  bottle_type?: string | null
  capsuleType?: string | null
  capsule_type?: string | null
  quantity?: number | string | null
}

interface LabelInventoryRecord {
  id: string
  brandId?: string | null
  productId?: string | null
  labelName?: string | null
  type?: string | null
  dosageType?: string | null
  quantity?: number | string | null
  isActive?: boolean | null
}

interface AssemblyTimeLogSource {
  date?: number | { seconds: number } | string | null
  startDate?: number | { seconds: number } | string | null
  startTime?: string | null
  endDate?: number | { seconds: number } | string | null
  endTime?: string | null
  remarks?: string | null
}

interface AssemblyForm {
  assemblyCode: string
  brandId: string
  productId: string
  njpId: string
  bottleLidId: string
  location: string
  boxNo: string
  capsuleWeightMg: string
  capsulesReceivedQty: string
  bottleCC: string
  filledBottleWeight: string
  capsulesPerBottle: string
  labelId: string
  productionDate: string
  expiryDate: string
  qualityControlDate: string
  qualityControlStartTime: string
  qualityControlEndTime: string
  packagingDate: string
  packagingStartTime: string
  packagingEndTime: string
  status: 'Underprocess' | 'Completed'
  comments: string
  operatorName: string
}

interface AssemblyTimeLogForm {
  date: string
  startTime: string
  endTime: string
  remarks: string
}

const capsuleBottleSizes = ['200', '250', '300'] as const

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

function numOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function integerOrNull(value: string | number | null | undefined): number | null {
  const number = numOrNull(value)
  return number === null ? null : Math.max(0, Math.trunc(number))
}

function formatInteger(value: number | string | null | undefined): string {
  const number = numOrNull(value)
  return number === null ? '-' : String(Math.trunc(number))
}

function formatNumber(value: number | string | null | undefined, decimals = 4): string {
  const number = numOrNull(value)
  return number === null ? '-' : number.toFixed(decimals)
}

function totalCapsulesFromNJP(record: LocalNJPRecord | null | undefined): number {
  if (!record) return 0
  return Number(
    record.totalCapsulesFilledQty ??
    record.netCapsulesFilledQty ??
    record.grossCapsulesFilledQty ??
    0
  ) || 0
}

function availableCapsulesFromNJP(record: LocalNJPRecord | null | undefined): number {
  if (!record) return 0
  return Number(
    record.availableCapsulesQty ??
    record.remainingCapsulesQty ??
    record.availableCapsuleQty ??
    totalCapsulesFromNJP(record)
  ) || 0
}

function bottleLidType(record: BottleLidRecord | null | undefined): string {
  return String(record?.bottleType ?? record?.bottle_type ?? '').trim().toLowerCase()
}

function bottleLidCapsuleType(record: BottleLidRecord | null | undefined): string {
  return normalizeBottleSize(record?.capsuleType ?? record?.capsule_type ?? '')
}

function normalizeBottleSize(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const parsed = Number(raw)
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? String(parsed) : raw
}

function bottleLidQuantity(record: BottleLidRecord | null | undefined): number {
  const value = Number(record?.quantity ?? 0)
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

function bottleLidOptionLabel(record: BottleLidRecord): string {
  const capsuleType = bottleLidCapsuleType(record) || '-'
  return `Capsule ${capsuleType} (${bottleLidQuantity(record)} bottles available)`
}

function labelQuantity(record: LabelInventoryRecord | null | undefined): number {
  const value = Number(record?.quantity ?? 0)
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

function labelOptionLabel(record: LabelInventoryRecord): string {
  const name = record.labelName || record.type || 'Label'
  const dosage = record.dosageType ? ` ${record.dosageType}` : ''
  return `${name}${dosage} (${labelQuantity(record)} available)`
}

function capsuleWeightMgFromNJP(record: LocalNJPRecord | null | undefined): number {
  if (!record) return 0
  const explicit = Number(record.capsuleWeightMg ?? record.capsuleWeight ?? 0)
  if (Number.isFinite(explicit) && explicit > 0) return explicit

  const target = Number(record.targetFillWeightMg ?? 0) || 0
  const empty = Number(record.emptyCapsuleUnitWeightMg ?? 0) || 0
  if (target > 0 || empty > 0) return target + empty

  const producedKg = Number(record.totalCapsulesProducedKg ?? 0) || 0
  const count = totalCapsulesFromNJP(record)
  return producedKg > 0 && count > 0 ? (producedKg * 1_000_000) / count : 0
}

function capsulesKg(capsulesQty: number | null, capsuleWeightMg: number | null): number | null {
  if (capsulesQty === null || capsuleWeightMg === null || capsulesQty <= 0 || capsuleWeightMg <= 0) return null
  return Math.round(((capsulesQty * capsuleWeightMg) / 1_000_000) * 1_000_000) / 1_000_000
}

function njpOptionLabel(record: LocalNJPRecord): string {
  const code = record.njpCode || 'No NJP code'
  const product = record.productName || record.mixingName || 'Capsules'
  const available = availableCapsulesFromNJP(record)
  return `${code} - ${product} (${available} capsules available)`
}

function brandOptionLabel(brand: Brand): string {
  return brand.codePrefix ? `${brand.name} (${brand.codePrefix})` : brand.name
}

function productOptionLabel(product: Product): string {
  const productRecord = product as Product & {
    productCode?: string | null
    code?: string | null
    sku?: string | null
  }
  const code = productRecord.productCode || productRecord.code || productRecord.npn || productRecord.sku
  return code ? `${product.name} (${code})` : product.name
}

function normalizeBrandRefsFromNJP(record: LocalNJPRecord | null | undefined): LocalBrandRef[] {
  if (!record) return []
  const refs: LocalBrandRef[] = []
  ;(record.brands || []).forEach(brand => refs.push(brand))

  const ids = Array.isArray(record.brandIds) ? record.brandIds : []
  const names = Array.isArray(record.brandNames) ? record.brandNames : []
  ids.forEach((id, index) => refs.push({ id, name: names[index] || '' }))
  names.forEach((name, index) => refs.push({ id: ids[index] || '', name }))
  refs.push({ id: record.brandId || '', name: record.brandName || '' })

  const seen = new Set<string>()
  return refs
    .map(ref => ({
      id: String(ref.id || ref.brandId || '').trim(),
      name: String(ref.name || ref.brandName || '').trim(),
      codePrefix: String(ref.codePrefix || ref.code_prefix || '').trim()
    }))
    .filter(ref => {
      const key = (ref.id || ref.name).toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function njpHasBrand(record: LocalNJPRecord, brandId: string): boolean {
  if (!brandId) return true
  return normalizeBrandRefsFromNJP(record).some(brand => brand.id === brandId || brand.brandId === brandId)
}

function brandNamesFromNJP(record: LocalNJPRecord | null | undefined): string {
  const names = normalizeBrandRefsFromNJP(record)
    .map(brand => String(brand.name || brand.brandName || '').trim())
    .filter(Boolean)
  return names.length ? names.join(', ') : String(record?.brandName || '').trim()
}

function batchCodeLines(record: LocalAssemblyRecord | null | undefined, selectedNJP: LocalNJPRecord | null): BrandBatchCode[] {
  if (record?.brandBatchCodes?.length) return record.brandBatchCodes
  const refs = normalizeBrandRefsFromNJP(selectedNJP)
  if (refs.length <= 1) return []
  return refs.map(brand => ({
    brandId: brand.id || brand.brandId || '',
    brandName: brand.name || brand.brandName || '',
    codePrefix: brand.codePrefix || brand.code_prefix || '',
    batchCode: ''
  }))
}

function emptyTimeLog(): AssemblyTimeLogForm {
  return {
    date: todayInput(),
    startTime: '',
    endTime: '',
    remarks: ''
  }
}

function emptyForm(): AssemblyForm {
  return {
    assemblyCode: '',
    brandId: '',
    productId: '',
    njpId: '',
    bottleLidId: '',
    location: '',
    boxNo: '',
    capsuleWeightMg: '',
    capsulesReceivedQty: '',
    bottleCC: '',
    filledBottleWeight: '',
    capsulesPerBottle: '',
    labelId: '',
    productionDate: todayInput(),
    expiryDate: '',
    qualityControlDate: '',
    qualityControlStartTime: '',
    qualityControlEndTime: '',
    packagingDate: '',
    packagingStartTime: '',
    packagingEndTime: '',
    status: 'Underprocess',
    comments: '',
    operatorName: ''
  }
}

function normalizeStatus(value: LocalAssemblyRecord['status']): AssemblyForm['status'] {
  const text = String(value || '').toLowerCase()
  return text === 'completed' || text === 'assembly completed' ? 'Completed' : 'Underprocess'
}

function sourceTimeLogs(record: LocalAssemblyRecord): AssemblyTimeLogSource[] {
  return record.assemblySessions?.length
    ? record.assemblySessions
    : record.assemblyTimeLogs?.length
      ? record.assemblyTimeLogs
      : record.timeLogs || []
}

function timeLogsFromRecord(record: LocalAssemblyRecord): AssemblyTimeLogForm[] {
  const rows = sourceTimeLogs(record)
  if (!rows.length) return [emptyTimeLog()]

  return rows.map(row => ({
    date: toDateInput(row.date || row.startDate) || todayInput(),
    startTime: row.startTime || '',
    endTime: row.endTime || '',
    remarks: row.remarks || ''
  }))
}

export default function AssemblyCreatePage() {
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [brands, setBrands] = useState<Brand[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [njpRows, setNjpRows] = useState<LocalNJPRecord[]>([])
  const [bottleLids, setBottleLids] = useState<BottleLidRecord[]>([])
  const [labels, setLabels] = useState<LabelInventoryRecord[]>([])
  const [editingRecord, setEditingRecord] = useState<LocalAssemblyRecord | null>(null)
  const [form, setForm] = useState<AssemblyForm>(() => emptyForm())
  const [timeLogs, setTimeLogs] = useState<AssemblyTimeLogForm[]>(() => [emptyTimeLog()])

  const availableProducts = useMemo(() => {
    if (!form.brandId) return []
    const productIds = new Set(
      njpRows
        .filter(row => njpHasBrand(row, form.brandId) && row.productId)
        .map(row => row.productId as string)
    )
    return products.filter(product => productIds.has(product.id))
  }, [form.brandId, njpRows, products])

  const availableNJPs = useMemo(
    () => njpRows.filter(row => (
      (!form.brandId || njpHasBrand(row, form.brandId)) &&
      (!form.productId || row.productId === form.productId)
    )),
    [form.brandId, form.productId, njpRows]
  )

  const selectedNJP = useMemo(
    () => njpRows.find(item => item.id === form.njpId) || null,
    [form.njpId, njpRows]
  )
  const selectedNJPBrandRefs = useMemo(
    () => normalizeBrandRefsFromNJP(selectedNJP),
    [selectedNJP]
  )
  const selectedNJPIsMultiBrand = selectedNJPBrandRefs.length > 1
  const visibleBatchCodeLines = useMemo(
    () => batchCodeLines(editingRecord, selectedNJP),
    [editingRecord, selectedNJP]
  )
  const selectedNJPAvailable = useMemo(
    () => availableCapsulesFromNJP(selectedNJP),
    [selectedNJP]
  )
  const previousUsageForSameNJP = useMemo(() => {
    if (!editingRecord || !selectedNJP || editingRecord.njpId !== selectedNJP.id) return 0
    return Number(editingRecord.capsulesReceivedQty || 0) || 0
  }, [editingRecord, selectedNJP])
  const availableForThisSave = selectedNJPAvailable + previousUsageForSameNJP
  const capsulesReceivedQty = integerOrNull(form.capsulesReceivedQty)
  const capsuleWeightMg = numOrNull(form.capsuleWeightMg)
  const calculatedCapsulesKg = capsulesKg(capsulesReceivedQty, capsuleWeightMg)
  const capsulesPerBottle = integerOrNull(form.capsulesPerBottle)
  const calculatedBottles = capsulesReceivedQty !== null && capsulesPerBottle && capsulesPerBottle > 0
    ? Math.floor(capsulesReceivedQty / capsulesPerBottle)
    : null
  const looseCapsules = capsulesReceivedQty !== null && calculatedBottles !== null && capsulesPerBottle
    ? capsulesReceivedQty - (calculatedBottles * capsulesPerBottle)
    : null
  const selectedBottleSize = normalizeBottleSize(form.bottleCC)
  const matchingBottleLids = useMemo(
    () => bottleLids.filter(item => !selectedBottleSize || bottleLidCapsuleType(item) === selectedBottleSize),
    [bottleLids, selectedBottleSize]
  )
  const selectedBottleLid = useMemo(
    () => matchingBottleLids.find(item => item.id === form.bottleLidId) || null,
    [matchingBottleLids, form.bottleLidId]
  )
  const bottleLidForSave = selectedBottleLid || (!form.bottleLidId && selectedBottleSize && matchingBottleLids.length === 1 ? matchingBottleLids[0] : null)
  const previousBottleUsageForSameRecord = useMemo(() => {
    if (!editingRecord || !bottleLidForSave || editingRecord.bottleLidId !== bottleLidForSave.id) return 0
    return Number(editingRecord.totalBottlesMade || 0) || 0
  }, [editingRecord, bottleLidForSave])
  const bottleInventoryAvailableForThisSave = bottleLidForSave
    ? bottleLidQuantity(bottleLidForSave) + previousBottleUsageForSameRecord
    : 0
  const bottleInventoryRemainingAfterSave = bottleLidForSave && calculatedBottles !== null
    ? Math.max(0, bottleInventoryAvailableForThisSave - calculatedBottles)
    : null

  // Total Labels Used always equals Total Bottles Made - one label per bottle.
  const totalLabelsUsed = calculatedBottles
  const matchingLabels = useMemo(
    () => labels.filter(item => item.brandId === form.brandId && item.productId === form.productId),
    [labels, form.brandId, form.productId]
  )
  const selectedLabel = useMemo(
    () => matchingLabels.find(item => item.id === form.labelId) || null,
    [matchingLabels, form.labelId]
  )
  const labelForSave = selectedLabel || (!form.labelId && matchingLabels.length === 1 ? matchingLabels[0] : null)
  const previousLabelUsageForSameRecord = useMemo(() => {
    if (!editingRecord || !labelForSave || editingRecord.labelId !== labelForSave.id) return 0
    return Number(editingRecord.totalLabelsUsed || 0) || 0
  }, [editingRecord, labelForSave])
  const labelInventoryAvailableForThisSave = labelForSave
    ? labelQuantity(labelForSave) + previousLabelUsageForSameRecord
    : 0
  const labelInventoryRemainingAfterSave = labelForSave && totalLabelsUsed !== null
    ? Math.max(0, labelInventoryAvailableForThisSave - totalLabelsUsed)
    : null

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')
        const [brandList, productList, njps, bottleInventory, labelInventory, assembly] = await Promise.all([
          fetchBrands<Brand>({ activeOnly: true }),
          fetchProducts(),
          fetchLocalNJPs({ limit: 500 }),
          fetchBottleLidInventory({ bottleType: 'capsule' }),
          fetchLabelInventory({ activeOnly: true }),
          editId ? fetchLocalAssembly(editId) : Promise.resolve(null)
        ])
        setBrands(brandList)
        setProducts(productList as Product[])
        const njpList = njps as LocalNJPRecord[]
        setNjpRows(njpList)
        setBottleLids(
          (bottleInventory as BottleLidRecord[]).filter(row => bottleLidType(row) === 'capsule')
        )
        setLabels(labelInventory as LabelInventoryRecord[])

        if (assembly) {
          const record = assembly as LocalAssemblyRecord
          const sourceNJP = njpList.find(item => item.id === record.njpId) || null
          const sourceBrandRefs = normalizeBrandRefsFromNJP(sourceNJP)
          setEditingRecord(record)
          setForm({
            assemblyCode: record.assemblyCode || record.batchCode || '',
            brandId: record.brandId || sourceBrandRefs[0]?.id || sourceNJP?.brandId || '',
            productId: record.productId || sourceNJP?.productId || '',
            njpId: record.njpId || '',
            bottleLidId: record.bottleLidId || '',
            location: record.location || '',
            boxNo: record.boxNo || record.bucket || '',
            capsuleWeightMg: record.capsuleWeightMg === null || record.capsuleWeightMg === undefined ? '' : String(record.capsuleWeightMg),
            capsulesReceivedQty: record.capsulesReceivedQty === null || record.capsulesReceivedQty === undefined ? '' : String(record.capsulesReceivedQty),
            bottleCC: normalizeBottleSize(record.bottleCapsuleType ?? record.bottleSize ?? record.bottleCC ?? ''),
            filledBottleWeight: record.filledBottleWeight === null || record.filledBottleWeight === undefined ? '' : String(record.filledBottleWeight),
            capsulesPerBottle: record.capsulesPerBottle === null || record.capsulesPerBottle === undefined ? '' : String(record.capsulesPerBottle),
            labelId: record.labelId || '',
            productionDate: toDateInput(record.productionDate) || todayInput(),
            expiryDate: toDateInput(record.expiryDate),
            qualityControlDate: toDateInput(record.qualityControlDate || record.qcDate),
            qualityControlStartTime: record.qualityControlStartTime || record.qcStartTime || '',
            qualityControlEndTime: record.qualityControlEndTime || record.qcEndTime || '',
            packagingDate: toDateInput(record.packagingDate || record.packageDate),
            packagingStartTime: record.packagingStartTime || '',
            packagingEndTime: record.packagingEndTime || '',
            status: normalizeStatus(record.status),
            comments: record.comments || record.remarks || '',
            operatorName: record.operatorName || ''
          })
          setTimeLogs(timeLogsFromRecord(record))
        }
      } catch (err) {
        console.error('Failed to load Assembly form:', err)
        setError(err instanceof Error ? err.message : 'Failed to load Assembly form.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [editId])

  useEffect(() => {
    if (!selectedBottleSize) {
      if (form.bottleLidId) setForm(prev => ({ ...prev, bottleLidId: '' }))
      return
    }

    const current = bottleLids.find(item => item.id === form.bottleLidId)
    if (current && bottleLidCapsuleType(current) !== selectedBottleSize) {
      setForm(prev => ({ ...prev, bottleLidId: '' }))
      return
    }

    if (form.bottleLidId || matchingBottleLids.length !== 1) return
    setForm(prev => ({ ...prev, bottleLidId: matchingBottleLids[0].id }))
  }, [bottleLids, form.bottleLidId, matchingBottleLids, selectedBottleSize])

  useEffect(() => {
    const current = labels.find(item => item.id === form.labelId)
    if (current && (current.brandId !== form.brandId || current.productId !== form.productId)) {
      setForm(prev => ({ ...prev, labelId: '' }))
      return
    }

    if (form.labelId || matchingLabels.length !== 1) return
    setForm(prev => ({ ...prev, labelId: matchingLabels[0].id }))
  }, [labels, form.labelId, form.brandId, form.productId, matchingLabels])

  const updateField = <K extends keyof AssemblyForm>(key: K, value: AssemblyForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const clearNJPDerivedFields = (prev: AssemblyForm): AssemblyForm => ({
    ...prev,
    njpId: '',
    capsuleWeightMg: '',
    capsulesReceivedQty: ''
  })

  const handleSelectBrand = (brandId: string) => {
    setForm(prev => ({
      ...clearNJPDerivedFields(prev),
      brandId,
      productId: ''
    }))
  }

  const handleSelectProduct = (productId: string) => {
    setForm(prev => ({
      ...clearNJPDerivedFields(prev),
      productId
    }))
  }

  const handleSelectNJP = (njpId: string) => {
    const source = njpRows.find(item => item.id === njpId) || null
    const sourceBrandRefs = normalizeBrandRefsFromNJP(source)
    setForm(prev => ({
      ...prev,
      brandId: source && prev.brandId && njpHasBrand(source, prev.brandId)
        ? prev.brandId
        : sourceBrandRefs[0]?.id || source?.brandId || prev.brandId,
      productId: source?.productId || prev.productId,
      njpId,
      capsuleWeightMg: source ? String(capsuleWeightMgFromNJP(source) || '') : '',
      capsulesReceivedQty: source ? String(availableCapsulesFromNJP(source) || '') : '',
      productionDate: prev.productionDate || todayInput()
    }))
  }

  const handleTimeLogChange = (index: number, field: keyof AssemblyTimeLogForm, value: string) => {
    setTimeLogs(rows => {
      const next = [...rows]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const addTimeLog = () => setTimeLogs(rows => [...rows, emptyTimeLog()])

  const removeTimeLog = (index: number) => {
    setTimeLogs(rows => rows.length <= 1 ? [emptyTimeLog()] : rows.filter((_, idx) => idx !== index))
  }

  const handleReset = () => {
    setEditingRecord(null)
    setForm(emptyForm())
    setTimeLogs([emptyTimeLog()])
    setError('')
  }

  const handleSubmit = async () => {
    if (!form.brandId) {
      setError('Select the brand first.')
      return
    }
    if (!form.productId) {
      setError('Select the product for this Assembly.')
      return
    }
    if (!form.njpId) {
      setError('Select the NJP capsule record you want to use for Assembly.')
      return
    }
    if (!selectedNJP) {
      setError('Selected NJP record was not found. Refresh the page and select NJP again.')
      return
    }
    if (capsulesReceivedQty === null || capsulesReceivedQty <= 0) {
      setError('Enter how many capsules you want to use for Assembly.')
      return
    }
    if (capsulesReceivedQty > availableForThisSave) {
      setError(
        `Selected NJP has ${availableForThisSave} capsules available for this save; you entered ${capsulesReceivedQty}. Use ${availableForThisSave} capsules or less.`
      )
      return
    }
    if (capsulesPerBottle !== null && capsulesPerBottle <= 0) {
      setError('Capsules Per Bottle must be greater than zero.')
      return
    }
    if (capsulesPerBottle && calculatedBottles !== null && calculatedBottles <= 0) {
      setError('Capsules Received Qty is not enough to make one bottle with the entered Capsules Per Bottle.')
      return
    }
    if (calculatedBottles !== null && calculatedBottles > 0) {
      if (!selectedBottleSize) {
        setError('Select Bottle Type before saving Assembly.')
        return
      }
      if (matchingBottleLids.length === 0) {
        setError(`Capsule ${selectedBottleSize} bottles are not available in Bottles / Lids. Add Capsule ${selectedBottleSize} bottles before creating Assembly.`)
        return
      }
      if (!bottleLidForSave) {
        setError(`Select the Capsule ${selectedBottleSize} bottle inventory entry from Bottles / Lids before saving Assembly.`)
        return
      }
      if (calculatedBottles > bottleInventoryAvailableForThisSave) {
        setError(
          `Capsule ${selectedBottleSize} bottles are not enough. Available: ${bottleInventoryAvailableForThisSave}, required: ${calculatedBottles}. Add more Capsule ${selectedBottleSize} bottles in Bottles / Lids or reduce Total Bottles Made.`
        )
        return
      }
      if (matchingLabels.length === 0) {
        setError('Labels for this brand/product are not available in Labels inventory. Add labels before creating Assembly.')
        return
      }
      if (!labelForSave) {
        setError('Select the label inventory entry to use for this Assembly.')
        return
      }
      if (totalLabelsUsed !== null && totalLabelsUsed > labelInventoryAvailableForThisSave) {
        setError(
          `Labels are not enough. Available: ${labelInventoryAvailableForThisSave}, required: ${totalLabelsUsed}. Add more labels in Labels inventory or reduce Total Bottles Made.`
        )
        return
      }
    }

    try {
      setSaving(true)
      setError('')

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

      const payload = {
        id: editId || undefined,
        assemblyCode: selectedNJPIsMultiBrand ? undefined : form.assemblyCode.trim() || undefined,
        brandId: form.brandId,
        productId: form.productId,
        njpId: form.njpId,
        location: form.location.trim() || undefined,
        boxNo: form.boxNo.trim() || undefined,
        capsuleWeightMg,
        capsuleWeight: capsuleWeightMg,
        capsulesReceivedQty,
        capsulesReceivedKg: calculatedCapsulesKg,
        bottleCC: numOrNull(selectedBottleSize),
        filledBottleWeight: numOrNull(form.filledBottleWeight),
        capsulesPerBottle,
        totalBottlesMade: calculatedBottles,
        looseCapsulesQty: looseCapsules,
        remainingCapsulesAfterBottlingQty: looseCapsules,
        bottleLidId: bottleLidForSave?.id || undefined,
        bottleType: bottleLidForSave ? 'capsule' : undefined,
        bottleCapsuleType: selectedBottleSize || bottleLidCapsuleType(bottleLidForSave),
        bottleSize: selectedBottleSize || bottleLidCapsuleType(bottleLidForSave),
        labelId: labelForSave?.id || undefined,
        totalLabelsUsed,
        productionDate: dateInputToMs(form.productionDate),
        expiryDate: dateInputToMs(form.expiryDate),
        startDate: firstTimeLog?.startDate ?? null,
        startTime: firstTimeLog?.startTime ?? null,
        endDate: lastTimeLog?.endDate ?? null,
        endTime: lastTimeLog?.endTime ?? null,
        assemblySessions: cleanedTimeLogs,
        assemblyTimeLogs: cleanedTimeLogs,
        timeLogs: cleanedTimeLogs,
        qualityControlDate: dateInputToMs(form.qualityControlDate),
        qcDate: dateInputToMs(form.qualityControlDate),
        qualityControlStartTime: form.qualityControlStartTime || null,
        qualityControlEndTime: form.qualityControlEndTime || null,
        qcStartTime: form.qualityControlStartTime || null,
        qcEndTime: form.qualityControlEndTime || null,
        packagingDate: dateInputToMs(form.packagingDate),
        packageDate: dateInputToMs(form.packagingDate),
        packagingStartTime: form.packagingStartTime || null,
        packagingEndTime: form.packagingEndTime || null,
        status: form.status,
        comments: form.comments.trim() || null,
        operatorName: form.operatorName.trim() || null,
      }

      const saved = await saveLocalAssembly(payload)
      showToast({ message: 'Assembly saved from selected NJP record', type: 'success' })
      const [refreshedNjps, refreshedBottleInventory, refreshedLabels] = await Promise.all([
        fetchLocalNJPs({ limit: 500 }),
        fetchBottleLidInventory({ bottleType: 'capsule' }),
        fetchLabelInventory({ activeOnly: true })
      ])
      setNjpRows(refreshedNjps as LocalNJPRecord[])
      setBottleLids(
        (refreshedBottleInventory as BottleLidRecord[]).filter(row => bottleLidType(row) === 'capsule')
      )
      setLabels(refreshedLabels as LabelInventoryRecord[])
      setEditingRecord(saved as LocalAssemblyRecord)
      if (!editId) handleReset()
    } catch (err) {
      console.error('Failed to save Assembly:', err)
      setError(err instanceof Error ? err.message : 'Failed to save Assembly.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="py-10 text-zinc-500">Loading Assembly form...</div>
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200 pb-4">
        <h1 className="text-2xl font-bold">{editId ? 'Edit Assembly' : 'Create Assembly'}</h1>
      </div>

      {error && (
        <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      <section className="border-b border-zinc-200 pb-6">
        <div className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <Label>Brand</Label>
              <select
                className="min-h-12 w-full border border-zinc-300 bg-white px-3 py-2 text-base focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30 sm:text-sm"
                value={form.brandId}
                onChange={event => handleSelectBrand(event.target.value)}
              >
                <option value="">Select Brand</option>
                {brands.map(brand => (
                  <option key={brand.id} value={brand.id}>
                    {brandOptionLabel(brand)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Product</Label>
              <select
                className="min-h-12 w-full border border-zinc-300 bg-white px-3 py-2 text-base focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30 sm:text-sm disabled:bg-zinc-100 disabled:text-zinc-500"
                value={form.productId}
                onChange={event => handleSelectProduct(event.target.value)}
                disabled={!form.brandId}
              >
                <option value="">
                  {form.brandId ? 'Select Product' : 'Select Brand first'}
                </option>
                {availableProducts.map(product => (
                  <option key={product.id} value={product.id}>
                    {productOptionLabel(product)}
                  </option>
                ))}
              </select>
              {form.brandId && availableProducts.length === 0 && (
                <p className="mt-2 text-sm text-amber-700">
                  No product with saved NJP is available for this brand yet.
                </p>
              )}
            </div>

            <div>
              <Label>NJP Capsule Record</Label>
              <select
                className="min-h-12 w-full border border-zinc-300 bg-white px-3 py-2 text-base focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30 sm:text-sm disabled:bg-zinc-100 disabled:text-zinc-500"
                value={form.njpId}
                onChange={event => handleSelectNJP(event.target.value)}
                disabled={!form.productId}
              >
                <option value="">
                  {form.productId ? 'Select NJP' : 'Select Product first'}
                </option>
                {availableNJPs.map(row => (
                  <option key={row.id} value={row.id}>
                    {njpOptionLabel(row)}
                  </option>
                ))}
              </select>
              {form.productId && availableNJPs.length === 0 && (
                <p className="mt-2 text-sm text-amber-700">
                  No NJP capsule record is available for this product yet.
                </p>
              )}
            </div>
          </div>

          {njpRows.length === 0 && (
            <p className="text-sm text-amber-700">
              No NJP capsule record is available yet. Create NJP first, then create Assembly from it.
            </p>
          )}

          {selectedNJP && (
            <div className="grid gap-3 border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">NJP Code</p>
                <p className="font-semibold">{selectedNJP.njpCode || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Mixing Code</p>
                <p className="font-semibold">{selectedNJP.mixingCode || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Product</p>
                <p className="font-semibold">{selectedNJP.productName || selectedNJP.mixingName || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Brand</p>
                <p className="font-semibold">{brandNamesFromNJP(selectedNJP) || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Available Capsules</p>
                <p className="font-semibold">{availableForThisSave}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Capsule Weight</p>
                <p className="font-semibold">{formatNumber(capsuleWeightMgFromNJP(selectedNJP), 4)} mg</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="border-b border-zinc-200 pb-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Assembly Details</h2>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={handleReset}>Reset Form</Button>
            <Button type="button" onClick={handleSubmit} loading={saving} disabled={saving}>
              Save Assembly
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label>Batch Code</Label>
            {selectedNJPIsMultiBrand || visibleBatchCodeLines.length > 1 ? (
              <div className="min-h-12 border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm">
                {visibleBatchCodeLines.map((item, index) => (
                  <div key={`${item.brandId || item.brandName || index}-${index}`} className={index ? 'mt-2' : ''}>
                    <span className="font-semibold">
                      {item.brandName || item.brandId || `Brand ${index + 1}`} Batch Code:
                    </span>
                    <div className="text-base text-zinc-900">
                      {item.batchCode || item.assemblyCode || 'Auto-generated from brand prefix'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Input
                placeholder="Auto-generated from brand prefix, e.g. 786001"
                value={form.assemblyCode}
                disabled
              />
            )}
          </div>
          <div>
            <Label>NJP Code</Label>
            <Input value={selectedNJP?.njpCode || ''} disabled />
          </div>
          <div>
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={event => updateField('location', event.target.value)}
              placeholder="e.g., Packing Room"
            />
          </div>
          <div>
            <Label>Box No.</Label>
            <Input
              value={form.boxNo}
              onChange={event => updateField('boxNo', event.target.value)}
              placeholder="e.g., Box 1"
            />
          </div>
          <div>
            <Label>Capsule Weight Mg</Label>
            <NumberInput
              value={form.capsuleWeightMg}
              onChange={event => updateField('capsuleWeightMg', event.target.value)}
            />
          </div>
          <div>
            <Label>Capsules Received Qty</Label>
            <NumberInput
              step="1"
              value={form.capsulesReceivedQty}
              onChange={event => updateField('capsulesReceivedQty', event.target.value)}
            />
            {selectedNJP && (
              <p className="mt-1 text-xs text-zinc-500">
                Available for this save: {availableForThisSave}; remaining after save: {Math.max(0, availableForThisSave - (capsulesReceivedQty || 0))}
              </p>
            )}
          </div>
          <div>
            <Label>Capsules Received Kg</Label>
            <NumberInput value={calculatedCapsulesKg === null ? '' : String(calculatedCapsulesKg)} disabled />
          </div>
          <div>
            <Label>Capsules Per Bottle</Label>
            <NumberInput
              step="1"
              value={form.capsulesPerBottle}
              onChange={event => updateField('capsulesPerBottle', event.target.value)}
            />
          </div>
          <div>
            <Label>Bottle Type</Label>
            <select
              className="min-h-12 w-full border border-zinc-300 bg-white px-3 py-2 text-base focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30 sm:text-sm"
              value={form.bottleCC}
              onChange={event => setForm(prev => ({
                ...prev,
                bottleCC: event.target.value,
                bottleLidId: ''
              }))}
            >
              <option value="">Select Bottle Type</option>
              {capsuleBottleSizes.map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              Matches the Capsule bottle size from Bottles / Lids.
            </p>
          </div>
          <div>
            <Label>Bottle/Lid Inventory</Label>
            <select
              className="min-h-12 w-full border border-zinc-300 bg-white px-3 py-2 text-base focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30 sm:text-sm disabled:bg-zinc-100 disabled:text-zinc-500"
              value={form.bottleLidId}
              onChange={event => updateField('bottleLidId', event.target.value)}
              disabled={!selectedBottleSize || matchingBottleLids.length === 0}
            >
              <option value="">
                {!selectedBottleSize
                  ? 'Select Bottle Type first'
                  : matchingBottleLids.length
                    ? `Select Capsule ${selectedBottleSize} bottle stock`
                    : `No Capsule ${selectedBottleSize} bottle stock available`}
              </option>
              {matchingBottleLids.map(row => (
                <option key={row.id} value={row.id}>
                  {bottleLidOptionLabel(row)}
                </option>
              ))}
            </select>
            {bottleLidForSave ? (
              <p className="mt-1 text-xs text-zinc-500">
                Required: {calculatedBottles ?? 0}; available for this save: {bottleInventoryAvailableForThisSave}; remaining after save: {bottleInventoryRemainingAfterSave ?? '-'}.
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-700">
                {selectedBottleSize
                  ? `Add Capsule ${selectedBottleSize} bottles in Bottles / Lids before saving Assembly.`
                  : 'Select Bottle Type before choosing Bottles / Lids inventory.'}
              </p>
            )}
          </div>
          <div>
            <Label>Total Bottles Made</Label>
            <NumberInput value={calculatedBottles === null ? '' : String(calculatedBottles)} disabled />
          </div>
          <div>
            <Label>Label Inventory</Label>
            <select
              className="min-h-12 w-full border border-zinc-300 bg-white px-3 py-2 text-base focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30 sm:text-sm disabled:bg-zinc-100 disabled:text-zinc-500"
              value={form.labelId}
              onChange={event => updateField('labelId', event.target.value)}
              disabled={!form.brandId || !form.productId || matchingLabels.length === 0}
            >
              <option value="">
                {!form.brandId || !form.productId
                  ? 'Select Brand and Product first'
                  : matchingLabels.length
                    ? 'Select label stock'
                    : 'No label stock available for this brand/product'}
              </option>
              {matchingLabels.map(row => (
                <option key={row.id} value={row.id}>
                  {labelOptionLabel(row)}
                </option>
              ))}
            </select>
            {labelForSave ? (
              <p className="mt-1 text-xs text-zinc-500">
                Required: {totalLabelsUsed ?? 0}; available for this save: {labelInventoryAvailableForThisSave}; remaining after save: {labelInventoryRemainingAfterSave ?? '-'}.
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-700">
                {form.brandId && form.productId
                  ? 'Add labels for this brand/product in Labels inventory before saving Assembly.'
                  : 'Select Brand and Product before choosing label inventory.'}
              </p>
            )}
          </div>
          <div>
            <Label>Total Labels Used</Label>
            <NumberInput value={totalLabelsUsed === null ? '' : String(totalLabelsUsed)} disabled />
            <p className="mt-1 text-xs text-zinc-500">
              Auto-calculated: one label per bottle made.
            </p>
          </div>
          <div>
            <Label>Remaining Capsules Qty</Label>
            <NumberInput value={looseCapsules === null ? '' : String(looseCapsules)} disabled />
            <p className="mt-1 text-xs text-zinc-500">
              Capsules left after complete bottles.
            </p>
          </div>
          <div>
            <Label>Filled Bottle Weight</Label>
            <NumberInput
              value={form.filledBottleWeight}
              onChange={event => updateField('filledBottleWeight', event.target.value)}
            />
          </div>
          <div>
            <Label>Production Date</Label>
            <Input
              type="date"
              value={form.productionDate}
              onChange={event => updateField('productionDate', event.target.value)}
            />
          </div>
          <div>
            <Label>Expiry Date</Label>
            <Input
              type="date"
              value={form.expiryDate}
              onChange={event => updateField('expiryDate', event.target.value)}
            />
          </div>
          <div>
            <Label>Status</Label>
            <select
              className="min-h-12 w-full border border-zinc-300 bg-white px-3 py-2 text-base focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30 sm:text-sm"
              value={form.status}
              onChange={event => updateField('status', event.target.value as AssemblyForm['status'])}
            >
              <option value="Underprocess">Underprocess</option>
              <option value="Completed">Completed</option>
            </select>
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
            <h2 className="text-lg font-semibold">Assembly Daily Time Log</h2>
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
                  placeholder="Example: Day 1 assembly completed"
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
        <h2 className="mb-4 text-lg font-semibold">Quality Control</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <Label>QC Date</Label>
            <Input
              type="date"
              value={form.qualityControlDate}
              onChange={event => updateField('qualityControlDate', event.target.value)}
            />
          </div>
          <div>
            <Label>QC Start Time</Label>
            <Input
              type="time"
              value={form.qualityControlStartTime}
              onChange={event => updateField('qualityControlStartTime', event.target.value)}
            />
          </div>
          <div>
            <Label>QC End Time</Label>
            <Input
              type="time"
              value={form.qualityControlEndTime}
              onChange={event => updateField('qualityControlEndTime', event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-200 pb-6">
        <h2 className="mb-4 text-lg font-semibold">Packaging</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <Label>Packaging Date</Label>
            <Input
              type="date"
              value={form.packagingDate}
              onChange={event => updateField('packagingDate', event.target.value)}
            />
          </div>
          <div>
            <Label>Packaging Start Time</Label>
            <Input
              type="time"
              value={form.packagingStartTime}
              onChange={event => updateField('packagingStartTime', event.target.value)}
            />
          </div>
          <div>
            <Label>Packaging End Time</Label>
            <Input
              type="time"
              value={form.packagingEndTime}
              onChange={event => updateField('packagingEndTime', event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="pb-6">
        <div>
          <div>
            <Label>Comments</Label>
            <TextArea
              value={form.comments}
              onChange={event => updateField('comments', event.target.value)}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
