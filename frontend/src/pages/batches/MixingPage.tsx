// ============================================================================
// Mixing Reports Page - Native Next.js Implementation
// Standalone Mixing with multi-day timing, editable RM/NMI rows, and disclaimer
// ============================================================================

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Card,
  Button,
  Input,
  NumberInput,
  Label,
  Checkbox,
  Select,
  TextArea,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  Modal,
  useToast
} from '@/components/ui'
import {
  deleteLocalMixing,
  fetchBrands,
  fetchLabelInventory,
  fetchLocalMixings,
  fetchProducts,
  fetchRawMaterials,
  saveLocalMixing
} from '@/lib/supabase/data'
import type { Brand } from '@/types'

const EDIT_DISCLAIMER =
  'This mixing record is fully editable. If any raw material is added, removed, or any dose/quantity is changed, the updated saved version will be treated as the effective mixing record and should be reviewed before use.'

// NMI raw materials come from the Raw Material category named MMA.
const NMI_CATEGORY = 'MMA'


interface LocalMixingSession {
  date?: number | null
  startDate?: number | null
  startTime?: string | null
  endDate?: number | null
  endTime?: string | null
  remarks?: string | null
}

interface LocalMixingSessionForm {
  date: string
  startTime: string
  endTime: string
  remarks: string
}

interface LocalMixingRow {
  clNo?: number
  rawMaterialId?: string
  rawMaterialCode?: string
  rawMaterialName: string
  name?: string

  rmCategoryId?: string
  rmCategoryCode?: string
  rmCategoryName?: string
  rawMaterialCategoryId?: string
  rawMaterialCategoryCode?: string
  rawMaterialCategoryName?: string
  categoryId?: string
  categoryCode?: string
  categoryName?: string
  category?: string

  isNMI?: boolean
  isNonMedicinal?: boolean

  labelClaimMgPerUnit?: string | number | null
  doseMg?: string | number | null
  usedQtyKg: string
  remarks?: string | null
}

interface LocalMixingRecord {
  id?: string
  brandId?: string
  brandName?: string
  productId?: string
  productName: string
  mixingCode?: string
  status?: string | null

  startDate?: number | null
  startTime?: string | null
  endDate?: number | null
  endTime?: string | null
  mixingDate?: number | null
  mixingDates?: (number | string)[]
  mixingSessions?: LocalMixingSession[]

  mixedPowderName?: string | null
  existingMixedPowderUsedKg?: number | string | null
  medicinalIngredients?: LocalMixingRow[]
  nonMedicinalIngredients?: LocalMixingRow[]

  // Legacy aliases kept because old saved records may still contain them.
  byBookRawMaterials?: LocalMixingRow[]
  pragmaticRawMaterials?: LocalMixingRow[]
  nonMedUsage?: LocalMixingRow[]

  totalKgInMixing?: number | string | null
  totalKg?: number | string | null
  totalMixingKg?: number | string | null
  totalMixedQtyKg?: number | string | null

  remarks?: string | null
  reason?: string | null
  changeReason?: string | null
  editDisclaimer?: string | null
  revisionNo?: number
  totalFormulaQtyKg?: number | string
  createdAt?: number
  updatedAt?: number
}

interface LocalMixingFormState {
  id?: string
  brandId: string
  brandName: string
  productId: string
  productName: string
  mixingCode: string
  autoGenerateCode: boolean
  mixingSessions: LocalMixingSessionForm[]
  mixedPowderName: string
  existingMixedPowderUsedKg: string
  medicinalIngredients: LocalMixingRow[]
  nonMedicinalIngredients: LocalMixingRow[]
  totalKgInMixing: string
  remarks: string
  changeReason: string
}

interface Product {
  id: string
  name: string
  rm?: RawMaterialFormula[]
}

interface RawMaterialFormula {
  rawMaterialId?: string
  rawMaterialCode?: string
  rawMaterial?: string
  rawMaterialName?: string
  labelClaim?: string
  labelClaimMgPerUnit?: number | string | null
  doseMg?: number | string | null
  category?: string
  categoryName?: string
  categoryCode?: string
  rmCategoryId?: string
  rmCategoryName?: string
  rmCategoryCode?: string
  rawMaterialCategoryId?: string
  rawMaterialCategoryName?: string
  rawMaterialCategoryCode?: string
}

interface RawMaterial {
  id: string
  name: string
  code?: string
  rawMaterialCode?: string
  qty?: number
  qtyKg?: number
  category?: string
  categoryId?: string
  categoryName?: string
  categoryCode?: string
  family?: string
  familyId?: string
  familyName?: string
  familyCode?: string
  rmCategoryId?: string
  rmCategoryName?: string
  rmCategoryCode?: string
  rawMaterialCategoryId?: string
  rawMaterialCategoryName?: string
  rawMaterialCategoryCode?: string
  isNMI?: boolean
  isNonMedicinal?: boolean
}

interface RmCategoryOption {
  id: string
  code: string
  name: string
  isNMI?: boolean
}

const emptySessionRow = (): LocalMixingSessionForm => ({
  date: '',
  startTime: '',
  endTime: '',
  remarks: ''
})

const emptyMaterialRow = (forceNMI = false): LocalMixingRow => ({
  rawMaterialId: '',
  rawMaterialCode: '',
  rawMaterialName: '',
  rmCategoryId: forceNMI ? NMI_CATEGORY : '',
  rmCategoryCode: forceNMI ? NMI_CATEGORY : '',
  rmCategoryName: forceNMI ? NMI_CATEGORY : '',
  rawMaterialCategoryId: forceNMI ? NMI_CATEGORY : '',
  rawMaterialCategoryCode: forceNMI ? NMI_CATEGORY : '',
  rawMaterialCategoryName: forceNMI ? NMI_CATEGORY : '',
  category: forceNMI ? NMI_CATEGORY : '',
  isNMI: forceNMI,
  isNonMedicinal: forceNMI,
  doseMg: '',
  usedQtyKg: '',
  remarks: ''
})

const emptyLocalMixingForm = (): LocalMixingFormState => ({
  brandId: '',
  brandName: '',
  productId: '',
  productName: '',
  mixingCode: '',
  autoGenerateCode: true,
  mixingSessions: [emptySessionRow()],
  mixedPowderName: '',
  existingMixedPowderUsedKg: '',
  medicinalIngredients: [emptyMaterialRow()],
  nonMedicinalIngredients: [emptyMaterialRow(true)],
  totalKgInMixing: '',
  remarks: '',
  changeReason: ''
})

function localToDateInput(value: number | string | null | undefined): string {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function localDateInputToMs(value: string): number | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function toLocalNumber(value: string | number | null | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalNumber(value: string | number | null | undefined): number | null {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatLocalKg(value: string | number | null | undefined): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(4) : '0.0000'
}

function formatShortDate(value: number | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString()
}

function isNmiText(value: unknown): boolean {
  const text = String(value || '').trim().toLowerCase()
  return [
    'mma',
    'nmi',
    'non medicinal',
    'non-medicinal',
    'non medicinal ingredient',
    'non-medicinal ingredient',
    'non medicinal ingredients',
    'non-medicinal ingredients'
  ].includes(text)
}

function getCategoryId(item?: any | null): string {
  return String(
    item?.rmCategoryId ||
      item?.rawMaterialCategoryId ||
      item?.categoryId ||
      (isNmiText(getCategoryName(item)) ? NMI_CATEGORY : '') ||
      ''
  )
}

function getCategoryCode(item?: any | null): string {
  return String(
    item?.rmCategoryCode ||
      item?.rawMaterialCategoryCode ||
      item?.categoryCode ||
      String(item?.familyCode || '') ||
      (isNmiText(getCategoryName(item)) ? NMI_CATEGORY : '') ||
      ''
  )
}

function getCategoryName(item?: any | null): string {
  return String(
    item?.rmCategoryName ||
      item?.rawMaterialCategoryName ||
      item?.categoryName ||
      item?.category ||
      String(item?.familyName || '') ||
      String(item?.family || '') ||
      ''
  ).trim()
}

function rowIsNMI(row: Partial<LocalMixingRow | RawMaterial>): boolean {
  return Boolean(
    row.isNMI ||
      row.isNonMedicinal ||
      isNmiText(getCategoryCode(row)) ||
      isNmiText(getCategoryName(row))
  )
}

function categoryKeyFromRow(row: Partial<LocalMixingRow | RawMaterial | RawMaterialFormula>): string {
  return (getCategoryId(row) || getCategoryCode(row) || getCategoryName(row)).trim()
}

function normalizeCategoryFields(row: LocalMixingRow, forceNMI = false): LocalMixingRow {
  const isNMI = forceNMI || rowIsNMI(row)
  const categoryId = isNMI ? NMI_CATEGORY : getCategoryId(row)
  const categoryCode = isNMI ? NMI_CATEGORY : getCategoryCode(row)
  const categoryName = isNMI ? NMI_CATEGORY : getCategoryName(row)

  return {
    ...row,
    rmCategoryId: categoryId,
    rmCategoryCode: categoryCode,
    rmCategoryName: categoryName,
    rawMaterialCategoryId: categoryId,
    rawMaterialCategoryCode: categoryCode,
    rawMaterialCategoryName: categoryName,
    categoryId,
    categoryCode,
    categoryName,
    category: categoryName || categoryCode,
    isNMI,
    isNonMedicinal: isNMI
  }
}

function normalizeLocalRows(rows: LocalMixingRow[], forceNMI = false): LocalMixingRow[] {
  return rows
    .map((row, index) => {
      const cleanRow = normalizeCategoryFields(
        {
          ...row,
          clNo: index + 1,
          rawMaterialId: row.rawMaterialId || '',
          rawMaterialCode: String(row.rawMaterialCode || '').trim(),
          rawMaterialName: String(row.rawMaterialName || row.name || '').trim(),
          name: String(row.rawMaterialName || row.name || '').trim(),
          labelClaimMgPerUnit: optionalNumber(row.labelClaimMgPerUnit),
          doseMg: optionalNumber(row.doseMg),
          usedQtyKg: String(toLocalNumber(row.usedQtyKg)),
          remarks: String(row.remarks || '').trim()
        },
        forceNMI
      )

      return cleanRow
    })
    .filter(row => {
      return (
        row.rawMaterialId ||
        row.rawMaterialCode ||
        row.rawMaterialName ||
        toLocalNumber(row.usedQtyKg) > 0 ||
        optionalNumber(row.doseMg) !== null
      )
    })
}

function materialRowHasUserInput(row: LocalMixingRow): boolean {
  return Boolean(
    row.rawMaterialId ||
      row.rawMaterialCode ||
      row.rawMaterialName ||
      optionalNumber(row.doseMg) !== null ||
      toLocalNumber(row.usedQtyKg) > 0 ||
      String(row.remarks || '').trim()
  )
}

function validateDropdownMaterialRows(
  rows: LocalMixingRow[],
  options: { forceNMI?: boolean } = {}
): string {
  const forceNMI = options.forceNMI === true

  for (const [index, row] of rows.entries()) {
    if (!materialRowHasUserInput(row)) continue

    const rowLabel = forceNMI ? `NMI row ${index + 1}` : `medicinal ingredient row ${index + 1}`

    if (!row.rawMaterialId) {
      return forceNMI
        ? `Select NMI from dropdown in ${rowLabel}. Manual NMI name is not allowed.`
        : `Select raw material name from dropdown in ${rowLabel}. Manual raw material name is not allowed.`
    }

    if (optionalNumber(row.doseMg) === null) {
      return forceNMI
        ? `Dosage mg is required in ${rowLabel}.`
        : `MG dose used is required in ${rowLabel}.`
    }

    if (toLocalNumber(row.usedQtyKg) <= 0) {
      return `KG used must be greater than 0 in ${rowLabel}.`
    }
  }

  return ''
}

function normalizeSessionRows(rows: LocalMixingSessionForm[]): LocalMixingSessionForm[] {
  const normalized = rows
    .map(row => ({
      date: row.date || '',
      startTime: row.startTime || '',
      endTime: row.endTime || '',
      remarks: row.remarks || ''
    }))
    .filter(row => row.date || row.startTime || row.endTime || row.remarks)

  return normalized.length ? normalized : [emptySessionRow()]
}

function sessionsToPayload(rows: LocalMixingSessionForm[]): LocalMixingSession[] {
  return normalizeSessionRows(rows)
    .map(row => {
      const dateMs = localDateInputToMs(row.date)
      return {
        date: dateMs,
        startDate: dateMs,
        startTime: row.startTime || null,
        endDate: dateMs,
        endTime: row.endTime || null,
        remarks: row.remarks.trim() || null
      }
    })
    .filter(row => row.date || row.startTime || row.endTime || row.remarks)
}

function firstPayloadSession(rows: LocalMixingSession[]): LocalMixingSession | null {
  return rows.length ? rows[0] : null
}

function lastPayloadSession(rows: LocalMixingSession[]): LocalMixingSession | null {
  return rows.length ? rows[rows.length - 1] : null
}

function calculateLocalTotal(form: LocalMixingFormState): number {
  const powderKg = form.mixedPowderName.trim()
    ? toLocalNumber(form.existingMixedPowderUsedKg)
    : 0
  const rowTotal = [
    ...form.medicinalIngredients,
    ...form.nonMedicinalIngredients
  ].reduce((sum, row) => sum + toLocalNumber(row.usedQtyKg), 0)
  return Number((powderKg + rowTotal).toFixed(4))
}

function recordSessionsToForm(record: LocalMixingRecord): LocalMixingSessionForm[] {
  if (Array.isArray(record.mixingSessions) && record.mixingSessions.length) {
    return record.mixingSessions.map(session => ({
      date: localToDateInput(session.date ?? session.startDate ?? null),
      startTime: session.startTime || '',
      endTime: session.endTime || '',
      remarks: session.remarks || ''
    }))
  }

  if (record.startDate || record.endDate || record.startTime || record.endTime || record.mixingDate) {
    return [
      {
        date: localToDateInput(record.startDate || record.mixingDate || record.endDate || null),
        startTime: record.startTime || '',
        endTime: record.endTime || '',
        remarks: record.remarks || ''
      }
    ]
  }

  return [emptySessionRow()]
}

function formFromLocalRecord(record?: LocalMixingRecord | null): LocalMixingFormState {
  if (!record) return emptyLocalMixingForm()

  const medicinalRows = [
    ...(record.medicinalIngredients || []),
    ...(record.medicinalIngredients?.length ? [] : record.byBookRawMaterials || []),
    ...(record.medicinalIngredients?.length ? [] : record.pragmaticRawMaterials || [])
  ].map(row => normalizeCategoryFields({ ...row, usedQtyKg: String(row.usedQtyKg ?? '') }))

  const nmiRows = [
    ...(record.nonMedicinalIngredients || []),
    ...(record.nonMedicinalIngredients?.length ? [] : record.nonMedUsage || [])
  ].map(row =>
    normalizeCategoryFields({ ...row, usedQtyKg: String(row.usedQtyKg ?? '') }, true)
  )

  const savedTotalKg =
    record.totalKgInMixing ??
    record.totalKg ??
    record.totalMixingKg ??
    record.totalMixedQtyKg ??
    record.totalFormulaQtyKg ??
    ''

  return {
    id: record.id,
    brandId: record.brandId || '',
    brandName: record.brandName || '',
    productId: record.productId || '',
    productName: record.productName || '',
    mixingCode: record.mixingCode || '',
    autoGenerateCode: false,
    mixingSessions: recordSessionsToForm(record),
    mixedPowderName: record.mixedPowderName || '',
    existingMixedPowderUsedKg:
      record.existingMixedPowderUsedKg === null || record.existingMixedPowderUsedKg === undefined
        ? ''
        : String(record.existingMixedPowderUsedKg),
    medicinalIngredients: medicinalRows.length ? medicinalRows : [emptyMaterialRow()],
    nonMedicinalIngredients: nmiRows.length ? nmiRows : [emptyMaterialRow(true)],
    totalKgInMixing: savedTotalKg === null || savedTotalKg === undefined ? '' : String(savedTotalKg),
    remarks: record.remarks || '',
    changeReason: record.changeReason || record.reason || ''
  }
}

function parseLabelClaimToMg(label: string = ''): number | null {
  const s = String(label).toLowerCase()
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)/)
  if (!m) return null
  const val = parseFloat(m[1])
  if (!Number.isFinite(val)) return null
  if (s.includes(' mcg') || s.includes('µg') || s.includes(' ug')) return val / 1000
  if (s.includes(' g')) return val * 1000
  return val
}

function rawMaterialName(rawMaterial?: RawMaterial | null): string {
  return rawMaterial?.name || ''
}

function rawMaterialCode(rawMaterial?: RawMaterial | null): string {
  return rawMaterial?.code || rawMaterial?.rawMaterialCode || ''
}

function productFormulaRows(
  product?: Product | null,
  rawMaterialsMap: Record<string, RawMaterial> = {}
): LocalMixingRow[] {
  return (product?.rm || []).map(row => {
    const rawMaterial = row.rawMaterialId ? rawMaterialsMap[row.rawMaterialId] : undefined
    const doseMg =
      optionalNumber(row.doseMg) ??
      optionalNumber(row.labelClaimMgPerUnit) ??
      parseLabelClaimToMg(row.labelClaim || '')

    return normalizeCategoryFields({
      rawMaterialId: row.rawMaterialId || rawMaterial?.id || '',
      rawMaterialCode: row.rawMaterialCode || rawMaterialCode(rawMaterial),
      rawMaterialName: row.rawMaterial || row.rawMaterialName || rawMaterialName(rawMaterial) || row.rawMaterialCode || '',
      rmCategoryId: getCategoryId(row) || getCategoryId(rawMaterial),
      rmCategoryCode: getCategoryCode(row) || getCategoryCode(rawMaterial),
      rmCategoryName: getCategoryName(row) || getCategoryName(rawMaterial),
      labelClaimMgPerUnit: doseMg ?? '',
      doseMg: doseMg ?? '',
      usedQtyKg: '',
      remarks: ''
    })
  })
}

function materialIdentity(row: LocalMixingRow): string {
  return String(row.rawMaterialId || row.rawMaterialCode || row.rawMaterialName || '')
    .trim()
    .toLowerCase()
}

function materialDose(row: LocalMixingRow): string {
  const dose = optionalNumber(row.doseMg ?? row.labelClaimMgPerUnit)
  return dose === null ? '' : String(dose)
}

function isModifiedFromFormula(rows: LocalMixingRow[], product?: Product | null, rawMaterialsMap: Record<string, RawMaterial> = {}): boolean {
  if (!product) return false
  const formula = productFormulaRows(product, rawMaterialsMap)
    .map(row => `${materialIdentity(row)}:${materialDose(row)}`)
    .filter(Boolean)
  const current = rows
    .map(row => `${materialIdentity(row)}:${materialDose(row)}`)
    .filter(value => value !== ':')

  if (formula.length !== current.length) return true
  return formula.some((value, index) => value !== current[index])
}

function nextMixingCode(records: LocalMixingRecord[], currentId?: string): string {
  let highest = 0
  records.forEach(record => {
    if (currentId && record.id === currentId) return
    const code = String(record.mixingCode || '')
    if (code.startsWith('MIX-') && /^\d+$/.test(code.slice(4))) {
      highest = Math.max(highest, Number(code.slice(4)))
    }
  })
  return `MIX-${String(highest + 1).padStart(4, '0')}`
}

function buildRawMaterialsMap(rawMaterials: RawMaterial[]): Record<string, RawMaterial> {
  const map: Record<string, RawMaterial> = {}
  rawMaterials.forEach(rawMaterial => {
    map[rawMaterial.id] = rawMaterial
  })
  return map
}

function buildCategoryOptions(rawMaterials: RawMaterial[]): RmCategoryOption[] {
  const map = new Map<string, RmCategoryOption>()

  rawMaterials.forEach(rawMaterial => {
    const isNMI = rowIsNMI(rawMaterial)
    const id = isNMI ? NMI_CATEGORY : getCategoryId(rawMaterial)
    const code = isNMI ? NMI_CATEGORY : getCategoryCode(rawMaterial)
    const name = isNMI ? NMI_CATEGORY : getCategoryName(rawMaterial)
    const key = id || code || name

    if (!key) return

    map.set(key, {
      id: id || key,
      code: code || key,
      name: name || code || key,
      isNMI
    })
  })

  map.set(NMI_CATEGORY, {
    id: NMI_CATEGORY,
    code: NMI_CATEGORY,
    name: NMI_CATEGORY,
    isNMI: true
  })

  return Array.from(map.values()).sort((a, b) => {
    if (a.isNMI && !b.isNMI) return 1
    if (!a.isNMI && b.isNMI) return -1
    return a.name.localeCompare(b.name)
  })
}

function materialMatchesCategory(rawMaterial: RawMaterial, categoryKey: string, forceNMI = false): boolean {
  if (!categoryKey) return !forceNMI || rowIsNMI(rawMaterial)
  if (forceNMI) return rowIsNMI(rawMaterial)
  return [
    getCategoryId(rawMaterial),
    getCategoryCode(rawMaterial),
    getCategoryName(rawMaterial)
  ].some(value => String(value || '') === categoryKey)
}

function applyRawMaterialToRow(row: LocalMixingRow, rawMaterial?: RawMaterial, forceNMI = false): LocalMixingRow {
  if (!rawMaterial) {
    return normalizeCategoryFields(
      {
        ...row,
        rawMaterialId: '',
        rawMaterialCode: '',
        rawMaterialName: ''
      },
      forceNMI
    )
  }

  return normalizeCategoryFields(
    {
      ...row,
      rawMaterialId: rawMaterial.id,
      rawMaterialCode: rawMaterialCode(rawMaterial),
      rawMaterialName: rawMaterialName(rawMaterial),
      rmCategoryId: forceNMI ? NMI_CATEGORY : getCategoryId(rawMaterial),
      rmCategoryCode: forceNMI ? NMI_CATEGORY : getCategoryCode(rawMaterial),
      rmCategoryName: forceNMI ? NMI_CATEGORY : getCategoryName(rawMaterial),
      categoryId: forceNMI ? NMI_CATEGORY : getCategoryId(rawMaterial),
      categoryCode: forceNMI ? NMI_CATEGORY : getCategoryCode(rawMaterial),
      categoryName: forceNMI ? NMI_CATEGORY : getCategoryName(rawMaterial),
      category: forceNMI ? NMI_CATEGORY : getCategoryName(rawMaterial)
    },
    forceNMI
  )
}

function formatTimingSummary(record: LocalMixingRecord): string {
  const sessions = record.mixingSessions || []
  if (sessions.length) {
    const first = sessions[0]
    const last = sessions[sessions.length - 1]
    const prefix = `${formatShortDate(first.date || first.startDate || null)} ${first.startTime || ''}`.trim()
    const suffix = `${formatShortDate(last.date || last.endDate || null)} ${last.endTime || ''}`.trim()
    if (sessions.length > 1) return `${prefix} → ${suffix} (${sessions.length} days)`
    return `${prefix || '—'} → ${last.endTime || '—'}`
  }

  const start = `${formatShortDate(record.startDate || record.mixingDate || null)} ${record.startTime || ''}`.trim()
  const end = `${formatShortDate(record.endDate || null)} ${record.endTime || ''}`.trim()
  return `${start || '—'} → ${end || '—'}`
}

function LocalTimingRowsEditor({
  rows,
  onChange
}: {
  rows: LocalMixingSessionForm[]
  onChange: (rows: LocalMixingSessionForm[]) => void
}) {
  const updateRow = (index: number, field: keyof LocalMixingSessionForm, value: string) => {
    const next = [...rows]
    next[index] = { ...next[index], [field]: value }
    onChange(next)
  }

  const addRow = () => onChange([...rows, emptySessionRow()])

  const removeRow = (index: number) => {
    const next = rows.filter((_, rowIndex) => rowIndex !== index)
    onChange(next.length ? next : [emptySessionRow()])
  }

  return (
    <div className="space-y-3 border border-zinc-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Mixing Daily Time Log</h3>
          <p className="text-xs text-zinc-500">
            Use one row per day. This keeps start and end time attached to the correct date.
          </p>
        </div>
        <Button type="button" variant="subtle" size="sm" onClick={addRow}>
          Add Day
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-3 rounded-lg border border-zinc-100 p-3 md:grid-cols-[11rem_10rem_10rem_1fr_auto]">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={row.date}
                onChange={event => updateRow(index, 'date', event.target.value)}
              />
            </div>
            <div>
              <Label>Start Time</Label>
              <Input
                type="time"
                value={row.startTime}
                onChange={event => updateRow(index, 'startTime', event.target.value)}
              />
            </div>
            <div>
              <Label>End Time</Label>
              <Input
                type="time"
                value={row.endTime}
                onChange={event => updateRow(index, 'endTime', event.target.value)}
              />
              <p className="mt-1 text-[11px] text-zinc-500">Can stay blank until the day is complete.</p>
            </div>
            <div>
              <Label>Day Remarks</Label>
              <Input
                value={row.remarks}
                onChange={event => updateRow(index, 'remarks', event.target.value)}
                placeholder="Example: Day 1 mixing completed"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => removeRow(index)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LocalMaterialRowsEditor({
  title = 'Raw Materials',
  rows,
  modified,
  forceNMI = false,
  rawMaterials,
  categoryOptions,
  onChange
}: {
  title?: string
  rows: LocalMixingRow[]
  modified: boolean
  forceNMI?: boolean
  rawMaterials: RawMaterial[]
  categoryOptions: RmCategoryOption[]
  onChange: (rows: LocalMixingRow[]) => void
}) {
  const updateRow = (index: number, field: keyof LocalMixingRow, value: string | boolean) => {
    const next = [...rows]
    next[index] = normalizeCategoryFields(
      { ...next[index], [field]: value } as LocalMixingRow,
      forceNMI
    )
    onChange(next)
  }

  const updateCategory = (index: number, categoryKey: string) => {
    const category = categoryOptions.find(option => option.id === categoryKey || option.code === categoryKey || option.name === categoryKey)
    const isNMI = forceNMI || category?.isNMI || isNmiText(categoryKey)
    const next = [...rows]
    next[index] = normalizeCategoryFields(
      {
        ...next[index],
        rawMaterialId: '',
        rawMaterialCode: '',
        rawMaterialName: '',
        rmCategoryId: isNMI ? NMI_CATEGORY : category?.id || categoryKey,
        rmCategoryCode: isNMI ? NMI_CATEGORY : category?.code || categoryKey,
        rmCategoryName: isNMI ? NMI_CATEGORY : category?.name || categoryKey,
        categoryId: isNMI ? NMI_CATEGORY : category?.id || categoryKey,
        categoryCode: isNMI ? NMI_CATEGORY : category?.code || categoryKey,
        categoryName: isNMI ? NMI_CATEGORY : category?.name || categoryKey,
        category: isNMI ? NMI_CATEGORY : category?.name || categoryKey
      },
      isNMI
    )
    onChange(next)
  }

  const updateMaterial = (index: number, rawMaterialId: string) => {
    const rawMaterial = rawMaterials.find(item => item.id === rawMaterialId)
    const next = [...rows]
    next[index] = applyRawMaterialToRow(next[index], rawMaterial, forceNMI)
    onChange(next)
  }

  const addRow = () => onChange([...rows, emptyMaterialRow(forceNMI)])

  const removeRow = (index: number) => {
    const next = rows.filter((_, rowIndex) => rowIndex !== index)
    onChange(next.length ? next : [emptyMaterialRow(forceNMI)])
  }

  return (
    <div className="space-y-3 border border-zinc-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-base font-semibold">{title}</h3>
            {modified && (
              <span className="relative inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                Modified
                <button
                  type="button"
                  className="group relative flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-amber-500 text-[11px]"
                  aria-label="Modified formulation note"
                >
                  i
                  <span className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-80 -translate-x-1/2 rounded-md border border-zinc-200 bg-white p-3 text-left text-xs font-medium text-zinc-700 shadow-lg group-hover:block group-focus:block group-active:block">
                    {EDIT_DISCLAIMER}
                  </span>
                </button>
              </span>
            )}
          </div>
          {forceNMI && (
            <p className="text-xs text-zinc-500">
              NMI options are loaded automatically from Raw Materials category MMA. No category selection is needed here.
            </p>
          )}
        </div>
        <Button type="button" variant="subtle" size="sm" onClick={addRow}>
          {forceNMI ? 'Add NMI' : 'Add Medicinal Ingredient'}
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => {
          const selectedCategoryKey = forceNMI ? NMI_CATEGORY : categoryKeyFromRow(row)
          const filteredRawMaterials = rawMaterials.filter(rawMaterial =>
            materialMatchesCategory(rawMaterial, selectedCategoryKey, forceNMI)
          )
          return (
            <div key={index} className="space-y-3 rounded-lg border border-zinc-100 p-3">
              <div className={forceNMI ? 'grid gap-3 lg:grid-cols-[1fr_10rem_10rem_auto]' : 'grid gap-3 lg:grid-cols-[12rem_1fr_10rem_10rem_auto]'}>
                {!forceNMI && (
                  <div>
                    <Label>Raw Material Category</Label>
                    <Select
                      value={selectedCategoryKey}
                      onChange={event => updateCategory(index, event.target.value)}
                    >
                      <option value="">Select Category</option>
                      {categoryOptions
                        .filter(option => !option.isNMI)
                        .map(option => (
                          <option key={`${option.id}-${option.code}-${option.name}`} value={option.id || option.code || option.name}>
                            {option.name}
                          </option>
                        ))}
                    </Select>
                  </div>
                )}

                <div>
                  <Label>{forceNMI ? 'Select NMI' : 'Raw Material Name'}</Label>
                  <Select
                    value={row.rawMaterialId || ''}
                    onChange={event => updateMaterial(index, event.target.value)}
                  >
                    <option value="">{forceNMI ? 'Select NMI' : 'Select Raw Material'}</option>
                    {filteredRawMaterials.map(rawMaterial => (
                      <option key={rawMaterial.id} value={rawMaterial.id}>
                        {rawMaterialCode(rawMaterial) ? `${rawMaterialCode(rawMaterial)} — ` : ''}{rawMaterialName(rawMaterial)}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label>{forceNMI ? 'Dosage mg' : 'MG Dose Used'}</Label>
                  <NumberInput
                    min="0"
                    value={String(row.doseMg ?? '')}
                    onChange={event => updateRow(index, 'doseMg', event.target.value)}
                  />
                </div>

                <div>
                  <Label>KG Used</Label>
                  <NumberInput
                    min="0"
                    value={row.usedQtyKg}
                    onChange={event => updateRow(index, 'usedQtyKg', event.target.value)}
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => removeRow(index)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <div className="grid gap-3">
                <div>
                  <Label>Remarks</Label>
                  <Input
                    value={row.remarks || ''}
                    onChange={event => updateRow(index, 'remarks', event.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LocalMixingFormModal({
  record,
  brands,
  products,
  rawMaterials,
  brandProductLinks,
  records,
  onClose,
  onSave,
  onDelete
}: {
  record?: LocalMixingRecord | null
  brands: Brand[]
  products: Product[]
  rawMaterials: RawMaterial[]
  brandProductLinks: { brandId: string; productId: string }[]
  records: LocalMixingRecord[]
  onClose: () => void
  onSave: (form: LocalMixingFormState) => Promise<void>
  onDelete: (record: LocalMixingRecord) => Promise<void>
}) {
  const rawMaterialsMap = useMemo(() => buildRawMaterialsMap(rawMaterials), [rawMaterials])
  const categoryOptions = useMemo(() => buildCategoryOptions(rawMaterials), [rawMaterials])
  const [form, setForm] = useState<LocalMixingFormState>(() => formFromLocalRecord(record))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const totalKg = useMemo(() => calculateLocalTotal(form), [form])

  const availableProducts = useMemo(() => {
    if (!form.brandId) return []
    const linkedProductIds = new Set(
      brandProductLinks
        .filter(link => link.brandId === form.brandId)
        .map(link => link.productId)
    )
    return linkedProductIds.size
      ? products.filter(product => linkedProductIds.has(product.id))
      : products
  }, [brandProductLinks, form.brandId, products])

  const selectedProduct = useMemo(
    () => products.find(item => item.id === form.productId) || null,
    [form.productId, products]
  )

  const generatedCode = useMemo(
    () => (form.productId ? nextMixingCode(records, form.id) : ''),
    [form.id, form.productId, records]
  )

  const displayMixingCode = form.autoGenerateCode ? generatedCode : form.mixingCode

  const materialsModified = useMemo(
    () => isModifiedFromFormula(form.medicinalIngredients, selectedProduct, rawMaterialsMap),
    [form.medicinalIngredients, rawMaterialsMap, selectedProduct]
  )

  useEffect(() => {
    setForm(formFromLocalRecord(record))
    setError('')
  }, [record])

  const updateField = (field: keyof LocalMixingFormState, value: string | boolean) => {
    setForm(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'mixedPowderName' && typeof value === 'string' && !value.trim()
        ? { existingMixedPowderUsedKg: '' }
        : {})
    }))
  }

  const handleBrandChange = (brandId: string) => {
    const brand = brands.find(item => item.id === brandId)
    setForm(prev => ({
      ...prev,
      brandId,
      brandName: brand?.name || '',
      productId: '',
      productName: '',
      medicinalIngredients: [emptyMaterialRow()]
    }))
  }

  const handleProductChange = (productId: string) => {
    const product = products.find(item => item.id === productId)
    const formulaRows = productFormulaRows(product, rawMaterialsMap)
    setForm(prev => ({
      ...prev,
      productId,
      productName: product?.name || '',
      medicinalIngredients: formulaRows.length ? formulaRows : [emptyMaterialRow()]
    }))
  }

  const validateBeforeSave = (): string => {
    const mixedPowderName = form.mixedPowderName.trim()
    const sessions = normalizeSessionRows(form.mixingSessions)
    const hasAnyTiming = sessions.some(row => row.date || row.startTime || row.endTime)

    if (!form.brandId) return 'Brand is required.'
    if (!form.productId) return 'Product is required.'
    if (!form.autoGenerateCode && !form.mixingCode.trim()) return 'Mixing code is required.'
    if (mixedPowderName && !form.existingMixedPowderUsedKg) return 'Existing mixed powder used kg is required.'
    if (!hasAnyTiming) return 'Add at least one mixing date with start time.'

    for (const [index, session] of sessions.entries()) {
      const hasAnyValue = session.date || session.startTime || session.endTime || session.remarks
      if (!hasAnyValue) continue
      if (!session.date) return `Date is required in day ${index + 1}.`
      if (!session.startTime) return `Start time is required in day ${index + 1}.`
    }

    const materialSelectionError = validateDropdownMaterialRows(form.medicinalIngredients)
    if (materialSelectionError) return materialSelectionError

    const nmiSelectionError = validateDropdownMaterialRows(form.nonMedicinalIngredients, {
      forceNMI: true
    })
    if (nmiSelectionError) return nmiSelectionError

    const hasMaterial = normalizeLocalRows(form.medicinalIngredients).length > 0
    const hasNMI = normalizeLocalRows(form.nonMedicinalIngredients, true).length > 0

    if (!hasMaterial && !hasNMI && !mixedPowderName) {
      return 'Add at least one medicinal ingredient, NMI, or existing mixed powder.'
    }

    if (materialsModified && !form.changeReason.trim()) {
      return 'Change reason is required because raw materials or dose were modified.'
    }

    return ''
  }

  const handleSave = async () => {
    const validationError = validateBeforeSave()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError('')
    try {
      await onSave(form)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save mixing.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!record?.id) return
    if (!window.confirm('Delete this mixing record?')) return
    setSaving(true)
    setError('')
    try {
      await onDelete(record)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete mixing.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={record?.id ? 'Edit Mixing' : 'Create Mixing'}
      className="max-w-7xl"
      closeOnBackdrop={false}
    >
      <div className="space-y-5">
        {error && (
          <div className="border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          {EDIT_DISCLAIMER}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Brand</Label>
            <Select value={form.brandId} onChange={event => handleBrandChange(event.target.value)}>
              <option value="">Select Brand</option>
              {brands.map(brand => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Product</Label>
            <Select
              value={form.productId}
              onChange={event => handleProductChange(event.target.value)}
              disabled={!form.brandId}
            >
              <option value="">Select Product</option>
              {availableProducts.map(product => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <Label>Mixing Code</Label>
              <Checkbox
                label="Auto-generate"
                checked={form.autoGenerateCode}
                onChange={event => updateField('autoGenerateCode', event.target.checked)}
              />
            </div>
            <Input
              value={displayMixingCode}
              placeholder="Auto-generated"
              disabled={form.autoGenerateCode}
              onChange={event => updateField('mixingCode', event.target.value)}
            />
          </div>

          <div>
            <Label>Total Kg in Mixing</Label>
            <NumberInput
              min="0"
              value={form.totalKgInMixing}
              onChange={event => updateField('totalKgInMixing', event.target.value)}
              placeholder={formatLocalKg(totalKg)}
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Enter the final/manual total kg. Calculated material total: {formatLocalKg(totalKg)} kg.
            </p>
          </div>

          <div>
            <Label>Mixed Powder Name <span className="text-xs font-normal text-amber-700">TBD / later discussion</span></Label>
            <Input
              value={form.mixedPowderName}
              onChange={event => updateField('mixedPowderName', event.target.value)}
              placeholder="Optional existing mixed powder"
            />
          </div>

          {form.mixedPowderName.trim() && (
            <div>
              <Label>Existing Mixed Powder Used Kg</Label>
              <NumberInput
                min="0"
                value={form.existingMixedPowderUsedKg}
                onChange={event => updateField('existingMixedPowderUsedKg', event.target.value)}
              />
            </div>
          )}
        </div>

        <LocalTimingRowsEditor
          rows={form.mixingSessions}
          onChange={rows => setForm(prev => ({ ...prev, mixingSessions: rows }))}
        />

        <LocalMaterialRowsEditor
          title="Medicinal Ingredients"
          rows={form.medicinalIngredients}
          modified={materialsModified}
          rawMaterials={rawMaterials}
          categoryOptions={categoryOptions}
          onChange={rows => setForm(prev => ({ ...prev, medicinalIngredients: rows }))}
        />

        <LocalMaterialRowsEditor
          title="Non-Medicinal Ingredients"
          rows={form.nonMedicinalIngredients}
          modified={false}
          forceNMI
          rawMaterials={rawMaterials}
          categoryOptions={categoryOptions}
          onChange={rows => setForm(prev => ({ ...prev, nonMedicinalIngredients: rows }))}
        />

        <div className="grid gap-4 md:grid-cols-[1fr_1fr_14rem] md:items-end">
          <div>
            <Label>Remarks</Label>
            <TextArea
              value={form.remarks}
              onChange={event => updateField('remarks', event.target.value)}
              placeholder="General mixing remarks"
            />
          </div>

          <div>
            <Label>Change Reason</Label>
            <TextArea
              value={form.changeReason}
              onChange={event => updateField('changeReason', event.target.value)}
              placeholder="Required if RM is added/removed or dose is changed"
            />
          </div>

          <div className="border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-semibold text-zinc-600">Calculated Materials Kg</div>
            <div className="mt-2 text-2xl font-bold">{formatLocalKg(totalKg)}</div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {record?.id && (
              <Button type="button" variant="danger" onClick={handleDelete} disabled={saving}>
                Delete Mixing
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Close
            </Button>
            <Button type="button" onClick={handleSave} loading={saving}>
              Save Mixing
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function MixingReportsPage() {
  const { showToast } = useToast()
  const [records, setRecords] = useState<LocalMixingRecord[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [brandProductLinks, setBrandProductLinks] = useState<{ brandId: string; productId: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<LocalMixingRecord | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('')

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      const [mixingData, brandData, productData, rawMaterialData, labelData] = await Promise.all([
        fetchLocalMixings(),
        fetchBrands<Brand>({ activeOnly: true }),
        fetchProducts(),
        fetchRawMaterials(),
        fetchLabelInventory({ activeOnly: true })
      ])

      setRecords(mixingData as LocalMixingRecord[])
      setBrands(brandData)
      setProducts(productData as Product[])
      setRawMaterials(rawMaterialData as RawMaterial[])
      setBrandProductLinks(
        (labelData as { brandId?: string; productId?: string }[])
          .filter(link => link.brandId && link.productId)
          .map(link => ({
            brandId: String(link.brandId),
            productId: String(link.productId)
          }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mixing records.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    return records.filter(record => {
      if (brandFilter && record.brandId !== brandFilter) return false
      if (!query) return true

      const mainText = [
        record.mixingCode,
        record.brandName,
        record.productName,
        record.remarks
      ]
        .join(' ')
        .toLowerCase()

      if (mainText.includes(query)) return true

      const allRows = [
        ...(record.medicinalIngredients || []),
        ...(record.nonMedicinalIngredients || []),
        ...(record.byBookRawMaterials || []),
        ...(record.pragmaticRawMaterials || []),
        ...(record.nonMedUsage || [])
      ]

      return allRows.some(row =>
        [
          row.rawMaterialCode,
          row.rawMaterialName,
          row.rmCategoryName,
          row.rmCategoryCode,
          row.category
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)
      )
    })
  }, [brandFilter, records, search])

  const openCreate = () => {
    setSelectedRecord(null)
    setCreating(true)
  }

  const closeModal = () => {
    setSelectedRecord(null)
    setCreating(false)
  }

  const handleSave = async (form: LocalMixingFormState) => {
    const mixingSessions = sessionsToPayload(form.mixingSessions)
    const firstSession = firstPayloadSession(mixingSessions)
    const lastSession = lastPayloadSession(mixingSessions)

    const payload = {
      id: form.id,
      brandId: form.brandId,
      brandName: form.brandName.trim(),
      productId: form.productId,
      productName: form.productName.trim(),
      mixingCode: form.autoGenerateCode ? '' : form.mixingCode.trim(),
      mixingSessions,
      mixingTimeLogs: mixingSessions,
      timeLogs: mixingSessions,
      mixingDates: mixingSessions.map(session => session.date).filter(Boolean),
      mixingDate: firstSession?.date || null,
      startDate: firstSession?.startDate || null,
      startTime: firstSession?.startTime || null,
      endDate: lastSession?.endDate || null,
      endTime: lastSession?.endTime || null,

      mixedPowderName: form.mixedPowderName.trim(),
      existingMixedPowderUsedKg: form.mixedPowderName.trim()
        ? toLocalNumber(form.existingMixedPowderUsedKg)
        : null,

      medicinalIngredients: normalizeLocalRows(form.medicinalIngredients),
      nonMedicinalIngredients: normalizeLocalRows(form.nonMedicinalIngredients, true),
      totalKgInMixing: form.totalKgInMixing ? toLocalNumber(form.totalKgInMixing) : calculateLocalTotal(form),
      totalKg: form.totalKgInMixing ? toLocalNumber(form.totalKgInMixing) : calculateLocalTotal(form),
      totalMixingKg: form.totalKgInMixing ? toLocalNumber(form.totalKgInMixing) : calculateLocalTotal(form),
      totalMixedQtyKg: form.totalKgInMixing ? toLocalNumber(form.totalKgInMixing) : calculateLocalTotal(form),

      // Legacy aliases kept during transition.
      byBookRawMaterials: normalizeLocalRows(form.medicinalIngredients),
      pragmaticRawMaterials: [],
      nonMedUsage: normalizeLocalRows(form.nonMedicinalIngredients, true),

      remarks: form.remarks.trim(),
      reason: form.changeReason.trim(),
      changeReason: form.changeReason.trim(),
      editDisclaimer: EDIT_DISCLAIMER
    }

    await saveLocalMixing(payload)
    showToast({ message: 'Mixing saved', type: 'success' })
    closeModal()
    await loadRecords()
  }

  const handleDelete = async (record: LocalMixingRecord) => {
    if (!record.id) return
    await deleteLocalMixing(record.id)
    showToast({ message: 'Mixing deleted', type: 'success' })
    closeModal()
    await loadRecords()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mixing</h1>
          <p className="text-sm text-zinc-600">
            Create, edit, and track mixing records with daily time logs and medicinal ingredients, MMA-based NMI rows, and total kg data.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          Add Mixing
        </Button>
      </div>

      {error && (
        <div className="border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">
          {error}
        </div>
      )}

      <Card title="Filters">
        <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
          <div>
            <Label>Search</Label>
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search by mixing code, product, brand, ingredient, category..."
            />
          </div>
          <div>
            <Label>Brand</Label>
            <Select value={brandFilter} onChange={event => setBrandFilter(event.target.value)}>
              <option value="">All Brands</option>
              {brands.map(brand => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <Card
        title="Mixing Records"
        actions={
          <span className="rounded-full bg-[#e0f7fa] px-3 py-1 text-sm font-semibold text-[#006F7A]">
            {filteredRecords.length} shown
          </span>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sr</TableHead>
              <TableHead>Mixing Code</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Total Kg</TableHead>
              <TableHead>Revision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableEmpty colSpan={7} message="Loading..." />
            ) : filteredRecords.length === 0 ? (
              <TableEmpty colSpan={7} message="No mixing records found." />
            ) : (
              filteredRecords.map((record, index) => (
                <TableRow
                  key={record.id || index}
                  clickable
                  onClick={() => setSelectedRecord(record)}
                >
                  <TableCell className="font-semibold">{index + 1}</TableCell>
                  <TableCell className="font-semibold">{record.mixingCode || '-'}</TableCell>
                  <TableCell>{record.brandName || '-'}</TableCell>
                  <TableCell>{record.productName || '-'}</TableCell>
                  <TableCell>{formatTimingSummary(record)}</TableCell>
                  <TableCell>{formatLocalKg(record.totalKgInMixing ?? record.totalKg ?? record.totalMixingKg ?? record.totalMixedQtyKg ?? record.totalFormulaQtyKg)}</TableCell>
                  <TableCell>{record.revisionNo || 1}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {(creating || selectedRecord) && (
        <LocalMixingFormModal
          record={selectedRecord}
          brands={brands}
          products={products}
          rawMaterials={rawMaterials}
          brandProductLinks={brandProductLinks}
          records={records}
          onClose={closeModal}
          onSave={async form => {
            setSaving(true)
            try {
              await handleSave(form)
            } finally {
              setSaving(false)
            }
          }}
          onDelete={async record => {
            setSaving(true)
            try {
              await handleDelete(record)
            } finally {
              setSaving(false)
            }
          }}
        />
      )}

      {saving && (
        <div className="fixed bottom-4 right-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          Saving...
        </div>
      )}
    </div>
  )
}
