// ============================================================================
// Mixing Reports Page - Native Next.js Implementation
// Standalone Mixing with multi-day timing, editable RM/NMI rows, and disclaimer
// ============================================================================

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Card,
  Button,
  Input,
  NumberInput,
  Label,
  Checkbox,
  Select,
  TextArea,
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
  mgDoseUsed?: string | number | null
  usedQtyKg: string
  kgUsed?: string | number | null
  requiredQtyKgThisMix?: string | number | null
  requiredQtyKgFormula?: string | number | null
  percentShare?: string | number | null
  ratioPercent?: string | number | null
  remarks?: string | null
}

interface LocalMixingRecord {
  id?: string
  brandId?: string
  brandName?: string
  brandIds?: string[]
  brandNames?: string[]
  brands?: LocalBrandRef[]
  productId?: string
  productName: string
  mixingCode?: string
  location?: string | null
  rackNo?: string | null
  status?: string | null

  startDate?: number | null
  startTime?: string | null
  endDate?: number | null
  endTime?: string | null
  mixingDate?: number | null
  mixingDates?: (number | string)[]
  mixingSessions?: LocalMixingSession[]

  mixedPowderName?: string | null
  existingMixedPowderId?: string | null
  existingMixedPowderCode?: string | null
  existingMixedPowderSource?: string | null
  existingMixedPowder?: {
    id?: string
    mixingCode?: string
    source?: string
    productId?: string
    name?: string
    usedKg?: number | string | null
  } | null
  existingMixedPowderUsedKg?: number | string | null
  medicinalIngredients?: LocalMixingRow[]
  nonMedicinalIngredients?: LocalMixingRow[]

  // Legacy aliases kept because old saved records may still contain them.
  byBookRawMaterials?: LocalMixingRow[]
  pragmaticRawMaterials?: LocalMixingRow[]
  rmUsage?: LocalMixingRow[]
  nonMedUsage?: LocalMixingRow[]

  totalKgInMixing?: number | string | null
  totalKg?: number | string | null
  totalMixingKg?: number | string | null
  totalMixedQtyKg?: number | string | null
  freshMixingRequiredKg?: number | string | null
  calculatedFreshRawMaterialsTotalKg?: number | string | null
  mixedPowderInventoryKg?: number | string | null
  availableMixedPowderKg?: number | string | null
  remainingMixedPowderKg?: number | string | null

  remarks?: string | null
  reason?: string | null
  changeReason?: string | null
  editDisclaimer?: string | null
  revisionNo?: number
  totalFormulaQtyKg?: number | string
  createdAt?: number
  updatedAt?: number
}

interface LocalBrandRef {
  id?: string | null
  brandId?: string | null
  name?: string | null
  brandName?: string | null
  codePrefix?: string | null
  code_prefix?: string | null
}

interface LocalMixingFormState {
  id?: string
  brandId: string
  brandName: string
  brandIds: string[]
  brandNames: string[]
  productId: string
  productName: string
  mixingCode: string
  rackNo: string
  autoGenerateCode: boolean
  mixingSessions: LocalMixingSessionForm[]
  mixedPowderName: string
  reuseExistingMixing: boolean
  existingMixedPowderId: string
  existingMixedPowderCode: string
  existingMixedPowderSource: string
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
  code?: string | null
  productCode?: string | null
  product_code?: string | null
  productNo?: string | null
  product_no?: string | null
  productNumber?: string | null
  product_number?: string | null
  npn?: string | null
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

interface ExistingPowderOption {
  key: string
  id: string
  source: 'mixing'
  productId: string
  code: string
  name: string
  availableKg: number
  totalKg: number
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
  mgDoseUsed: '',
  usedQtyKg: '',
  kgUsed: '',
  remarks: ''
})

const emptyLocalMixingForm = (): LocalMixingFormState => ({
  brandId: '',
  brandName: '',
  brandIds: [],
  brandNames: [],
  productId: '',
  productName: '',
  mixingCode: '',
  rackNo: '',
  autoGenerateCode: true,
  mixingSessions: [emptySessionRow()],
  mixedPowderName: '',
  reuseExistingMixing: false,
  existingMixedPowderId: '',
  existingMixedPowderCode: '',
  existingMixedPowderSource: '',
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

function roundLocalNumber(value: string | number | null | undefined, decimals = 6): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Number(parsed.toFixed(decimals))
}

function formUsesExistingPowder(form: Pick<LocalMixingFormState, 'reuseExistingMixing' | 'existingMixedPowderId' | 'mixedPowderName' | 'existingMixedPowderUsedKg'>): boolean {
  return Boolean(
    form.reuseExistingMixing ||
      form.existingMixedPowderId ||
      form.mixedPowderName.trim() ||
      form.existingMixedPowderUsedKg
  )
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
          doseMg: rowDoseMg(row),
          mgDoseUsed: rowDoseMg(row),
          usedQtyKg: formatKgInput(roundLocalNumber(row.usedQtyKg || row.kgUsed)),
          kgUsed: formatKgInput(roundLocalNumber(row.usedQtyKg || row.kgUsed)),
          requiredQtyKgThisMix: formatKgInput(roundLocalNumber(row.usedQtyKg || row.kgUsed)),
          requiredQtyKgFormula: formatKgInput(roundLocalNumber(row.requiredQtyKgFormula || row.usedQtyKg || row.kgUsed)),
          percentShare: formatKgInput(roundLocalNumber(row.percentShare || row.ratioPercent)),
          ratioPercent: formatKgInput(roundLocalNumber(row.percentShare || row.ratioPercent)),
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
      optionalNumber(row.doseMg ?? row.mgDoseUsed) !== null ||
      toLocalNumber(row.usedQtyKg || row.kgUsed) > 0 ||
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

    if (rowDoseMg(row) === null) {
      return forceNMI
        ? `Dosage mg is required in ${rowLabel}.`
        : `MG dose used is required in ${rowLabel}.`
    }

    if (toLocalNumber(row.usedQtyKg || row.kgUsed) <= 0) {
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
  const powderKg = formUsesExistingPowder(form)
    ? toLocalNumber(form.existingMixedPowderUsedKg)
    : 0
  const rowTotal = [
    ...form.medicinalIngredients,
    ...form.nonMedicinalIngredients
  ].reduce((sum, row) => sum + toLocalNumber(row.usedQtyKg || row.kgUsed), 0)
  return roundLocalNumber(powderKg + rowTotal)
}

function formatKgInput(value: number): string {
  if (!Number.isFinite(value)) return ''
  return value.toFixed(6).replace(/\.?0+$/, '')
}

function rowDoseMg(row: Partial<LocalMixingRow | RawMaterialFormula>): number | null {
  return (
    optionalNumber(row.doseMg) ??
    optionalNumber((row as LocalMixingRow).mgDoseUsed) ??
    optionalNumber(row.labelClaimMgPerUnit) ??
    parseLabelClaimToMg(String((row as RawMaterialFormula).labelClaim || ''))
  )
}

function effectiveMaterialMixKg(form: LocalMixingFormState): number | null {
  const totalMixKg = optionalNumber(form.totalKgInMixing)
  if (totalMixKg === null || totalMixKg <= 0) return null

  const existingPowderKg = formUsesExistingPowder(form)
    ? toLocalNumber(form.existingMixedPowderUsedKg)
    : 0

  const effectiveKg = totalMixKg - existingPowderKg
  return effectiveKg > 0 ? effectiveKg : null
}

function calculateTotalDoseMg(rows: LocalMixingRow[]): number {
  return rows.reduce((sum, row) => {
    const doseMg = rowDoseMg(row)
    return doseMg !== null && doseMg > 0 ? sum + doseMg : sum
  }, 0)
}

function calculateRowKgText(
  row: LocalMixingRow,
  totalDoseMg: number,
  totalMaterialKg: number | null
): string {
  const doseMg = rowDoseMg(row)

  if (doseMg === null || doseMg <= 0) return ''
  if (totalMaterialKg === null || totalMaterialKg <= 0) return ''
  if (totalDoseMg <= 0) return ''

  return formatKgInput((totalMaterialKg * doseMg) / totalDoseMg)
}

function calculateRowPercentText(row: LocalMixingRow, totalDoseMg: number): string {
  const doseMg = rowDoseMg(row)

  if (doseMg === null || doseMg <= 0) return ''
  if (totalDoseMg <= 0) return ''

  return formatKgInput((doseMg / totalDoseMg) * 100)
}

function displayKgValue(row: LocalMixingRow, totalDoseMg: number, totalMaterialKg: number | null): string {
  const savedUsedQty = optionalNumber(row.usedQtyKg)
  const savedKgUsed = optionalNumber(row.kgUsed)

  if (savedUsedQty !== null && savedUsedQty > 0) return String(row.usedQtyKg)
  if (savedKgUsed !== null && savedKgUsed > 0) return String(row.kgUsed)

  return calculateRowKgText(row, totalDoseMg, totalMaterialKg)
}

function recalculateRowsKgFromMg(
  medicinalRows: LocalMixingRow[],
  nonMedicinalRows: LocalMixingRow[],
  totalMaterialKg: number | null
): {
  medicinalIngredients: LocalMixingRow[]
  nonMedicinalIngredients: LocalMixingRow[]
} {
  const clearCalculatedKg = (row: LocalMixingRow): LocalMixingRow => {
    const doseMg = rowDoseMg(row)

    if (doseMg === null || doseMg <= 0) return row

    return {
      ...row,
      usedQtyKg: '',
      kgUsed: '',
      requiredQtyKgThisMix: '',
      requiredQtyKgFormula: '',
      percentShare: '',
      ratioPercent: ''
    }
  }

  if (totalMaterialKg === null || totalMaterialKg <= 0) {
    return {
      medicinalIngredients: medicinalRows.map(clearCalculatedKg),
      nonMedicinalIngredients: nonMedicinalRows.map(clearCalculatedKg)
    }
  }

  const allRows = [...medicinalRows, ...nonMedicinalRows]
  const totalDoseMg = calculateTotalDoseMg(allRows)

  if (totalDoseMg <= 0) {
    return {
      medicinalIngredients: medicinalRows,
      nonMedicinalIngredients: nonMedicinalRows
    }
  }

  const applyCalculation = (row: LocalMixingRow): LocalMixingRow => {
    const doseMg = rowDoseMg(row)

    if (doseMg === null || doseMg <= 0) {
      return {
        ...row,
        usedQtyKg: '',
        kgUsed: '',
        requiredQtyKgThisMix: '',
        requiredQtyKgFormula: '',
        percentShare: '',
        ratioPercent: ''
      }
    }

    const percentText = calculateRowPercentText(row, totalDoseMg)
    const kgText = calculateRowKgText(row, totalDoseMg, totalMaterialKg)

    return {
      ...row,
      doseMg,
      mgDoseUsed: doseMg,
      usedQtyKg: kgText,
      kgUsed: kgText,
      requiredQtyKgThisMix: kgText,
      requiredQtyKgFormula: kgText,
      percentShare: percentText,
      ratioPercent: percentText
    }
  }

  return {
    medicinalIngredients: medicinalRows.map(applyCalculation),
    nonMedicinalIngredients: nonMedicinalRows.map(applyCalculation)
  }
}

function recalculateFormKg(form: LocalMixingFormState): LocalMixingFormState {
  const calculated = recalculateRowsKgFromMg(
    form.medicinalIngredients,
    form.nonMedicinalIngredients,
    effectiveMaterialMixKg(form)
  )

  return {
    ...form,
    medicinalIngredients: calculated.medicinalIngredients,
    nonMedicinalIngredients: calculated.nonMedicinalIngredients
  }
}

function formHasDoseRows(form: LocalMixingFormState): boolean {
  return [...form.medicinalIngredients, ...form.nonMedicinalIngredients].some(row => {
    const doseMg = rowDoseMg(row)
    return doseMg !== null && doseMg > 0
  })
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

function brandRefKey(ref: LocalBrandRef): string {
  return String(ref.id || ref.brandId || ref.name || ref.brandName || '')
    .trim()
    .toLowerCase()
}

function normalizeBrandRefs(refs: LocalBrandRef[]): LocalBrandRef[] {
  const seen = new Set<string>()
  const normalized: LocalBrandRef[] = []

  refs.forEach(ref => {
    const next = {
      id: String(ref.id || ref.brandId || '').trim(),
      name: String(ref.name || ref.brandName || '').trim(),
      codePrefix: String(ref.codePrefix || ref.code_prefix || '').trim()
    }
    const key = brandRefKey(next)
    if (!key || seen.has(key)) return
    seen.add(key)
    normalized.push(next)
  })

  return normalized
}

function brandRefsFromMixingRecord(record?: LocalMixingRecord | null): LocalBrandRef[] {
  if (!record) return []

  const refs: LocalBrandRef[] = []
  ;(record.brands || []).forEach(brand => refs.push(brand))

  const ids = Array.isArray(record.brandIds) ? record.brandIds : []
  const names = Array.isArray(record.brandNames) ? record.brandNames : []
  ids.forEach((id, index) => refs.push({ id, name: names[index] || '' }))
  names.forEach((name, index) => refs.push({ id: ids[index] || '', name }))

  refs.push({ id: record.brandId || '', name: record.brandName || '' })

  return normalizeBrandRefs(refs)
}

function brandRefsFromForm(form: LocalMixingFormState, brands: Brand[]): LocalBrandRef[] {
  const ids = form.brandIds.length ? form.brandIds : form.brandId ? [form.brandId] : []
  const refs = ids.map((id, index) => {
    const brand = brands.find(item => item.id === id)
    return {
      id,
      name: brand?.name || form.brandNames[index] || (id === form.brandId ? form.brandName : ''),
      codePrefix: brand?.codePrefix || ''
    }
  })

  if (!refs.length && (form.brandId || form.brandName)) {
    const brand = brands.find(item => item.id === form.brandId)
    refs.push({
      id: form.brandId,
      name: brand?.name || form.brandName,
      codePrefix: brand?.codePrefix || ''
    })
  }

  return normalizeBrandRefs(refs)
}

function formFromLocalRecord(record?: LocalMixingRecord | null): LocalMixingFormState {
  if (!record) return emptyLocalMixingForm()
  const brandRefs = brandRefsFromMixingRecord(record)
  const primaryBrand = brandRefs[0]

  const medicinalRows = [
    ...(record.medicinalIngredients || []),
    ...(record.medicinalIngredients?.length ? [] : record.byBookRawMaterials || []),
    ...(record.medicinalIngredients?.length ? [] : record.pragmaticRawMaterials || []),
    ...(record.medicinalIngredients?.length ? [] : record.rmUsage || [])
  ].map(row =>
    normalizeCategoryFields({
      ...row,
      doseMg: rowDoseMg(row) ?? '',
      mgDoseUsed: rowDoseMg(row) ?? '',
      usedQtyKg: String(row.usedQtyKg ?? row.kgUsed ?? ''),
      kgUsed: String(row.usedQtyKg ?? row.kgUsed ?? '')
    })
  )

  const nmiRows = [
    ...(record.nonMedicinalIngredients || []),
    ...(record.nonMedicinalIngredients?.length ? [] : record.nonMedUsage || [])
  ].map(row =>
    normalizeCategoryFields(
      {
        ...row,
        doseMg: rowDoseMg(row) ?? '',
        mgDoseUsed: rowDoseMg(row) ?? '',
        usedQtyKg: String(row.usedQtyKg ?? row.kgUsed ?? ''),
        kgUsed: String(row.usedQtyKg ?? row.kgUsed ?? '')
      },
      true
    )
  )

  const savedTotalKg =
    record.totalKgInMixing ??
    record.totalKg ??
    record.totalMixingKg ??
    record.totalMixedQtyKg ??
    record.totalFormulaQtyKg ??
    ''
  const hasExistingPowder =
    Boolean(record.existingMixedPowderId || record.existingMixedPowder?.id) ||
    Boolean(record.existingMixedPowderUsedKg) ||
    Boolean(record.mixedPowderName)

  return {
    id: record.id,
    brandId: primaryBrand?.id || record.brandId || '',
    brandName: primaryBrand?.name || record.brandName || '',
    brandIds: brandRefs.map(brand => String(brand.id || brand.brandId || '')).filter(Boolean),
    brandNames: brandRefs.map(brand => String(brand.name || brand.brandName || '')).filter(Boolean),
    productId: record.productId || '',
    productName: record.productName || '',
    mixingCode: record.mixingCode || '',
    rackNo: record.location || record.rackNo || '',
    autoGenerateCode: false,
    mixingSessions: recordSessionsToForm(record),
    mixedPowderName: record.mixedPowderName || '',
    reuseExistingMixing: hasExistingPowder,
    existingMixedPowderId: record.existingMixedPowderId || record.existingMixedPowder?.id || '',
    existingMixedPowderCode: record.existingMixedPowderCode || record.existingMixedPowder?.mixingCode || '',
    existingMixedPowderSource: record.existingMixedPowderSource || record.existingMixedPowder?.source || '',
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
      mgDoseUsed: doseMg ?? '',
      usedQtyKg: '',
      kgUsed: '',
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
  const dose = rowDoseMg(row)
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

function recordTotalMixKg(record: LocalMixingRecord): number {
  return toLocalNumber(
    record.totalKgInMixing ??
      record.totalKg ??
      record.totalMixingKg ??
      record.totalMixedQtyKg ??
      record.totalFormulaQtyKg
  )
}

function recordAvailablePowderKg(record: LocalMixingRecord): number {
  const available =
    optionalNumber(record.availableMixedPowderKg) ??
    optionalNumber(record.remainingMixedPowderKg)
  return available === null ? recordTotalMixKg(record) : available
}

function buildExistingPowderOptions({
  records,
  productId,
  currentId
}: {
  records: LocalMixingRecord[]
  productId: string
  currentId?: string
}): ExistingPowderOption[] {
  if (!productId) return []

  // Only saved mixing records can be reused here - the backend only knows how
  // to consume existing powder from a `mixings` row (source === 'mixing').
  return records
    .filter(record => record.productId === productId && record.id !== currentId)
    .map(record => {
      const totalKg = recordTotalMixKg(record)
      const availableKg = recordAvailablePowderKg(record)
      return {
        key: `mixing:${record.id}`,
        id: String(record.id || ''),
        source: 'mixing' as const,
        productId: String(record.productId || ''),
        code: record.mixingCode || '',
        name: record.mixedPowderName || record.mixingCode || record.productName || 'Saved mixing powder',
        availableKg,
        totalKg
      }
    })
    .filter(option => option.id && option.availableKg > 0)
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
  totalDoseMg,
  totalMaterialKg,
  onChange
}: {
  title?: string
  rows: LocalMixingRow[]
  modified: boolean
  forceNMI?: boolean
  rawMaterials: RawMaterial[]
  categoryOptions: RmCategoryOption[]
  totalDoseMg: number
  totalMaterialKg: number | null
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
          <p className="text-xs text-zinc-500">
            KG Used is auto-calculated from MG Dose Used and Total Kg in Mixing.
          </p>
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
          const kgValue = displayKgValue(row, totalDoseMg, totalMaterialKg)

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
                    value={String(row.doseMg ?? row.mgDoseUsed ?? '')}
                    onChange={event => updateRow(index, 'doseMg', event.target.value)}
                  />
                </div>

                <div>
                  <Label>KG Used</Label>
                  <NumberInput
                    min="0"
                    value={kgValue}
                    onChange={event => updateRow(index, 'usedQtyKg', event.target.value)}
                    placeholder=""
                    readOnly
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

function LocalMixingFormPanel({
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
  const [form, setForm] = useState<LocalMixingFormState>(() => recalculateFormKg(formFromLocalRecord(record)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const totalKg = useMemo(() => calculateLocalTotal(form), [form])
  const totalRequiredKg = optionalNumber(form.totalKgInMixing)
  const existingPowderKg = formUsesExistingPowder(form)
    ? toLocalNumber(form.existingMixedPowderUsedKg)
    : 0
  const freshMixingRequiredKg = totalRequiredKg === null
    ? null
    : Math.max(0, totalRequiredKg - existingPowderKg)
  const calculatedFreshMaterialsTotalKg = useMemo(
    () =>
      roundLocalNumber(
        [...form.medicinalIngredients, ...form.nonMedicinalIngredients].reduce(
          (sum, row) => sum + toLocalNumber(row.usedQtyKg || row.kgUsed),
          0
        )
      ),
    [form.medicinalIngredients, form.nonMedicinalIngredients]
  )

  const totalMaterialKg = useMemo(
    () => effectiveMaterialMixKg(form),
    [form.totalKgInMixing, form.mixedPowderName, form.existingMixedPowderUsedKg, form.reuseExistingMixing]
  )

  const totalDoseMg = useMemo(
    () => calculateTotalDoseMg([...form.medicinalIngredients, ...form.nonMedicinalIngredients]),
    [form.medicinalIngredients, form.nonMedicinalIngredients]
  )

  const selectedBrandIds = useMemo(
    () => Array.from(new Set((form.brandIds.length ? form.brandIds : form.brandId ? [form.brandId] : []).filter(Boolean))),
    [form.brandId, form.brandIds]
  )

  const selectedBrands = useMemo(
    () =>
      selectedBrandIds.map((brandId, index) => {
        const brand = brands.find(item => item.id === brandId)
        return {
          id: brandId,
          name: brand?.name || form.brandNames[index] || (brandId === form.brandId ? form.brandName : brandId),
          codePrefix: brand?.codePrefix || ''
        }
      }),
    [brands, form.brandId, form.brandName, form.brandNames, selectedBrandIds]
  )

  const selectedBrandSet = useMemo(() => new Set(selectedBrandIds), [selectedBrandIds])

  const availableProducts = useMemo(() => {
    if (!selectedBrandIds.length) return []
    const linkedProductIds = new Set(
      brandProductLinks
        .filter(link => selectedBrandSet.has(link.brandId))
        .map(link => link.productId)
    )
    return linkedProductIds.size
      ? products.filter(product => linkedProductIds.has(product.id))
      : products
  }, [brandProductLinks, products, selectedBrandIds.length, selectedBrandSet])

  const selectedProduct = useMemo(
    () => products.find(item => item.id === form.productId) || null,
    [form.productId, products]
  )
  const existingPowderOptions = useMemo(
    () =>
      buildExistingPowderOptions({
        records,
        productId: form.productId,
        currentId: form.id
      }),
    [form.id, form.productId, records]
  )
  const selectedExistingPowderKey = form.existingMixedPowderId
    ? `${form.existingMixedPowderSource || 'mixing'}:${form.existingMixedPowderId}`
    : ''
  const selectedExistingPowder = useMemo(
    () => existingPowderOptions.find(option => option.key === selectedExistingPowderKey) || null,
    [existingPowderOptions, selectedExistingPowderKey]
  )
  const selectedRemainingKg = selectedExistingPowder
    ? Math.max(0, selectedExistingPowder.availableKg - existingPowderKg)
    : null
  const hasAvailableExistingPowder = existingPowderOptions.length > 0

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
    setForm(recalculateFormKg(formFromLocalRecord(record)))
    setError('')
  }, [record])

  const updateField = (field: keyof LocalMixingFormState, value: string | boolean) => {
    setForm(prev => {
      const next = {
        ...prev,
        [field]: value
      }

      if (
        field === 'totalKgInMixing' ||
        field === 'existingMixedPowderUsedKg' ||
        field === 'mixedPowderName'
      ) {
        return recalculateFormKg(next)
      }

      return next
    })
  }

  const resetBrandDependentFields = (
    prev: LocalMixingFormState,
    brandIds: string[],
    brandNames: string[]
  ): LocalMixingFormState => ({
    ...prev,
    brandId: brandIds[0] || '',
    brandName: brandNames[0] || '',
    brandIds,
    brandNames,
    productId: '',
    productName: '',
    mixedPowderName: '',
    reuseExistingMixing: false,
    existingMixedPowderId: '',
    existingMixedPowderCode: '',
    existingMixedPowderSource: '',
    existingMixedPowderUsedKg: '',
    medicinalIngredients: [emptyMaterialRow()]
  })

  const handleAddBrand = (brandId: string) => {
    if (!brandId) return
    const brand = brands.find(item => item.id === brandId)
    if (!brand) return

    setForm(prev => {
      const currentIds = prev.brandIds.length ? prev.brandIds : prev.brandId ? [prev.brandId] : []
      if (currentIds.includes(brandId)) return prev
      const nextIds = [...currentIds, brandId]
      const nextNames = nextIds.map(id => {
        const row = brands.find(item => item.id === id)
        if (row) return row.name
        const existingIndex = currentIds.indexOf(id)
        return existingIndex >= 0 ? prev.brandNames[existingIndex] || prev.brandName : ''
      })
      return resetBrandDependentFields(prev, nextIds, nextNames)
    })
  }

  const handleRemoveBrand = (brandId: string) => {
    setForm(prev => {
      const currentIds = prev.brandIds.length ? prev.brandIds : prev.brandId ? [prev.brandId] : []
      const nextIds = currentIds.filter(id => id !== brandId)
      const nextNames = nextIds.map(id => {
        const row = brands.find(item => item.id === id)
        const existingIndex = currentIds.indexOf(id)
        return row?.name || prev.brandNames[existingIndex] || (id === prev.brandId ? prev.brandName : '')
      })
      return resetBrandDependentFields(prev, nextIds, nextNames)
    })
  }

  const handleProductChange = (productId: string) => {
    const product = products.find(item => item.id === productId)
    const formulaRows = productFormulaRows(product, rawMaterialsMap)
    setForm(prev =>
      recalculateFormKg({
        ...prev,
        productId,
        productName: product?.name || '',
        mixedPowderName: '',
        reuseExistingMixing: false,
        existingMixedPowderId: '',
        existingMixedPowderCode: '',
        existingMixedPowderSource: '',
        existingMixedPowderUsedKg: '',
        medicinalIngredients: formulaRows.length ? formulaRows : [emptyMaterialRow()]
      })
    )
  }

  const handleExistingPowderChange = (key: string) => {
    const option = existingPowderOptions.find(item => item.key === key)
    setForm(prev =>
      recalculateFormKg({
        ...prev,
        reuseExistingMixing: Boolean(option),
        existingMixedPowderId: option?.id || '',
        existingMixedPowderCode: option?.code || '',
        existingMixedPowderSource: option?.source || '',
        mixedPowderName: option?.name || '',
        existingMixedPowderUsedKg: option
          ? prev.existingMixedPowderUsedKg &&
            toLocalNumber(prev.existingMixedPowderUsedKg) <= option.availableKg
            ? prev.existingMixedPowderUsedKg
            : ''
          : ''
      })
    )
  }

  const handleMixingMethodChange = (reuseExistingMixing: boolean) => {
    setForm(prev => {
      const next = {
        ...prev,
        reuseExistingMixing
      }

      if (!reuseExistingMixing) {
        next.mixedPowderName = ''
        next.existingMixedPowderId = ''
        next.existingMixedPowderCode = ''
        next.existingMixedPowderSource = ''
        next.existingMixedPowderUsedKg = ''
      }

      return recalculateFormKg(next)
    })
  }

  const validateBeforeSave = (currentForm: LocalMixingFormState = form): string => {
    const mixedPowderName = currentForm.mixedPowderName.trim()
    const sessions = normalizeSessionRows(currentForm.mixingSessions)
    const hasAnyTiming = sessions.some(row => row.date || row.startTime || row.endTime)
    const totalMixKg = optionalNumber(currentForm.totalKgInMixing)
    const hasExistingPowder = formUsesExistingPowder(currentForm)
    const existingPowderKg = hasExistingPowder
      ? toLocalNumber(currentForm.existingMixedPowderUsedKg)
      : 0
    const hasDoseRows = formHasDoseRows(currentForm)
    const freshKg = totalMixKg === null ? null : totalMixKg - existingPowderKg
    const freshRowsTotal = roundLocalNumber(
      [...currentForm.medicinalIngredients, ...currentForm.nonMedicinalIngredients].reduce(
        (sum, row) => sum + toLocalNumber(row.usedQtyKg || row.kgUsed),
        0
      )
    )

    if (!(currentForm.brandIds.length || currentForm.brandId)) return 'Brand is required.'
    if (!currentForm.productId) return 'Product is required.'
    if (!currentForm.autoGenerateCode && !currentForm.mixingCode.trim()) return 'Mixing code is required.'
    if (currentForm.reuseExistingMixing && !currentForm.existingMixedPowderId && !mixedPowderName) {
      return hasAvailableExistingPowder
        ? `Select which saved mixing for ${currentForm.productName || 'this product'} should be reused before entering kg.`
        : `No saved mixing is available for ${currentForm.productName || 'this product'}. Choose Create fresh mixing or save a mixing first.`
    }
    if (hasExistingPowder && !currentForm.existingMixedPowderUsedKg) {
      return 'Enter how many kg to take from the existing mixing. Example: if 30 kg is available and you need 10 kg, type 10.'
    }
    if (existingPowderKg < 0) return 'Existing mixed powder used kg cannot be negative. Enter 0 or a positive kg value.'
    if (hasDoseRows && (totalMixKg === null || totalMixKg <= 0)) {
      return 'Total Kg in Mixing is required to auto-calculate KG used from MG dose.'
    }
    if (hasExistingPowder && totalMixKg !== null && existingPowderKg >= totalMixKg) {
      return `Existing mixed powder used (${formatLocalKg(existingPowderKg)} kg) must be less than Total Kg in Mixing (${formatLocalKg(totalMixKg)} kg), so the system can calculate the fresh balance.`
    }
    if (selectedExistingPowder && existingPowderKg > selectedExistingPowder.availableKg) {
      return `Selected saved mixing has ${formatLocalKg(selectedExistingPowder.availableKg)} kg available; you entered ${formatLocalKg(existingPowderKg)} kg. Use ${formatLocalKg(selectedExistingPowder.availableKg)} kg or less.`
    }
    if (freshKg !== null && freshKg > 0 && Math.abs(freshRowsTotal - freshKg) > 0.001) {
      return `Fresh mixing required is ${formatLocalKg(freshKg)} kg, but calculated raw materials total is ${formatLocalKg(freshRowsTotal)} kg. Check Total Kg in Mixing, reused kg, or MG dose values.`
    }
    if (!hasAnyTiming) return 'Add at least one mixing date with start time.'

    for (const [index, session] of sessions.entries()) {
      const hasAnyValue = session.date || session.startTime || session.endTime || session.remarks
      if (!hasAnyValue) continue
      if (!session.date) return `Date is required in day ${index + 1}.`
      if (!session.startTime) return `Start time is required in day ${index + 1}.`
    }

    const materialSelectionError = validateDropdownMaterialRows(currentForm.medicinalIngredients)
    if (materialSelectionError) return materialSelectionError

    const nmiSelectionError = validateDropdownMaterialRows(currentForm.nonMedicinalIngredients, {
      forceNMI: true
    })
    if (nmiSelectionError) return nmiSelectionError

    const hasMaterial = normalizeLocalRows(currentForm.medicinalIngredients).length > 0
    const hasNMI = normalizeLocalRows(currentForm.nonMedicinalIngredients, true).length > 0

    if (!hasMaterial && !hasNMI && !mixedPowderName) {
      return 'Add at least one medicinal ingredient, NMI, or existing mixed powder.'
    }

    if (materialsModified && !currentForm.changeReason.trim()) {
      return 'Change reason is required because raw materials or dose were modified.'
    }

    return ''
  }

  const handleSave = async () => {
    const preparedForm = recalculateFormKg(form)
    const validationError = validateBeforeSave(preparedForm)

    if (validationError) {
      setForm(preparedForm)
      setError(validationError)
      return
    }

    setSaving(true)
    setError('')
    try {
      setForm(preparedForm)
      await onSave(preparedForm)
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
    <Card title={record?.id ? 'Edit Mixing' : 'Create Mixing'}>
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
            <Select value="" onChange={event => handleAddBrand(event.target.value)}>
              <option value="">{selectedBrandIds.length ? 'Add another brand' : 'Select Brand'}</option>
              {brands.filter(brand => !selectedBrandSet.has(brand.id)).map(brand => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
            {selectedBrands.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedBrands.map(brand => (
                  <span
                    key={brand.id}
                    className="inline-flex items-center gap-2 border border-cyan-200 bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-800"
                  >
                    {brand.name}
                    <button
                      type="button"
                      className="text-cyan-700 hover:text-cyan-950"
                      onClick={() => handleRemoveBrand(brand.id)}
                    >
                      Remove
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Product</Label>
            <Select
              value={form.productId}
              onChange={event => handleProductChange(event.target.value)}
              disabled={!selectedBrandIds.length}
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
            <Label>Location</Label>
            <Input
              value={form.rackNo}
              onChange={event => updateField('rackNo', event.target.value)}
              placeholder="e.g., R1"
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
              Enter total mix kg first. KG Used is calculated from each MG dose. Calculated material total: {formatLocalKg(totalKg)} kg.
            </p>
          </div>

          <div className="space-y-3 border border-zinc-200 bg-zinc-50 p-4 md:col-span-2">
            <div className="flex flex-col gap-1">
              <Label>Mixing Method</Label>
              <p className="text-xs text-zinc-600">
                {form.productId
                  ? hasAvailableExistingPowder
                    ? `${existingPowderOptions.length} saved mixing option${existingPowderOptions.length === 1 ? '' : 's'} available for this product.`
                    : 'No saved mixing is available for this product yet.'
                  : 'Select a product to check saved mixing availability.'}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex cursor-pointer gap-3 border border-zinc-200 bg-white p-3">
                <input
                  type="radio"
                  name="mixingMethod"
                  checked={!form.reuseExistingMixing}
                  onChange={() => handleMixingMethodChange(false)}
                />
                <span>
                  <span className="block font-semibold">Create fresh mixing</span>
                  <span className="block text-xs text-zinc-600">
                    Calculate all raw materials from the full Total Kg in Mixing.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer gap-3 border border-zinc-200 bg-white p-3">
                <input
                  type="radio"
                  name="mixingMethod"
                  checked={form.reuseExistingMixing}
                  onChange={() => handleMixingMethodChange(true)}
                  disabled={!form.productId}
                />
                <span>
                  <span className="block font-semibold">Reuse existing saved mixing</span>
                  <span className="block text-xs text-zinc-600">
                    Take partial kg from old mixing and calculate only the fresh balance.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div>
            <Label>Existing Mixed Powder</Label>
            <Select
              value={selectedExistingPowderKey}
              onChange={event => handleExistingPowderChange(event.target.value)}
              disabled={!form.reuseExistingMixing || !form.productId || existingPowderOptions.length === 0}
            >
              <option value="">
                {!form.productId
                  ? 'Select product first'
                  : existingPowderOptions.length
                    ? 'Select saved mixing'
                    : 'No saved mixing available'}
              </option>
              {existingPowderOptions.map(option => (
                <option key={option.key} value={option.key}>
                  {option.code ? `${option.code} - ` : ''}{option.name} ({formatLocalKg(option.availableKg)} kg available)
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-zinc-500">
              Only saved mixing/powder for this product is shown.
            </p>
          </div>

          <div>
            <Label>Existing Mixed Powder Used Kg</Label>
            <NumberInput
              min="0"
              value={form.existingMixedPowderUsedKg}
              onChange={event => updateField('existingMixedPowderUsedKg', event.target.value)}
              disabled={!form.reuseExistingMixing || (!form.existingMixedPowderId && !form.mixedPowderName.trim())}
            />
            {selectedExistingPowder && (
              <p className="mt-1 text-[11px] text-zinc-500">
                Available now: {formatLocalKg(selectedExistingPowder.availableKg)} kg.
                Remaining after save: {formatLocalKg(selectedRemainingKg ?? selectedExistingPowder.availableKg)} kg.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 border border-zinc-200 bg-zinc-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <div className="font-semibold text-zinc-600">Total Required Mixing</div>
            <div className="mt-1 text-lg font-bold">{formatLocalKg(totalRequiredKg ?? 0)} kg</div>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">Existing Mixed Powder Used</div>
            <div className="mt-1 text-lg font-bold">{formatLocalKg(existingPowderKg)} kg</div>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">Fresh Mixing Required</div>
            <div className="mt-1 text-lg font-bold">{formatLocalKg(freshMixingRequiredKg ?? 0)} kg</div>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">Calculated Fresh Raw Materials Total</div>
            <div className="mt-1 text-lg font-bold">{formatLocalKg(calculatedFreshMaterialsTotalKg)} kg</div>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">Selected Mixing Remaining</div>
            <div className="mt-1 text-lg font-bold">
              {selectedRemainingKg === null ? '-' : `${formatLocalKg(selectedRemainingKg)} kg`}
            </div>
          </div>
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
          totalDoseMg={totalDoseMg}
          totalMaterialKg={totalMaterialKg}
          onChange={rows =>
            setForm(prev =>
              recalculateFormKg({
                ...prev,
                medicinalIngredients: rows
              })
            )
          }
        />

        <LocalMaterialRowsEditor
          title="Non-Medicinal Ingredients"
          rows={form.nonMedicinalIngredients}
          modified={false}
          forceNMI
          rawMaterials={rawMaterials}
          categoryOptions={categoryOptions}
          totalDoseMg={totalDoseMg}
          totalMaterialKg={totalMaterialKg}
          onChange={rows =>
            setForm(prev =>
              recalculateFormKg({
                ...prev,
                nonMedicinalIngredients: rows
              })
            )
          }
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
            <Button type="button" onClick={handleSave} loading={saving}>
              Save Mixing
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function MixingPage() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit') || ''
  const [records, setRecords] = useState<LocalMixingRecord[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [brandProductLinks, setBrandProductLinks] = useState<{ brandId: string; productId: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

  const selectedRecord = useMemo(
    () => (editId ? records.find(record => record.id === editId) || null : null),
    [editId, records]
  )

  const closeForm = () => {
    navigate('/finished-goods')
  }

  const handleSave = async (form: LocalMixingFormState) => {
    const preparedForm = recalculateFormKg(form)
    const mixingSessions = sessionsToPayload(preparedForm.mixingSessions)
    const firstSession = firstPayloadSession(mixingSessions)
    const lastSession = lastPayloadSession(mixingSessions)
    const normalizedMedicinalRows = normalizeLocalRows(preparedForm.medicinalIngredients)
    const normalizedNonMedicinalRows = normalizeLocalRows(preparedForm.nonMedicinalIngredients, true)
    const finalTotalKg = preparedForm.totalKgInMixing
      ? roundLocalNumber(preparedForm.totalKgInMixing)
      : calculateLocalTotal(preparedForm)
    const hasExistingPowder = formUsesExistingPowder(preparedForm)
    const existingPowderUsedKg = hasExistingPowder
      ? roundLocalNumber(preparedForm.existingMixedPowderUsedKg)
      : 0
    const freshMixingRequired = roundLocalNumber(Math.max(0, finalTotalKg - existingPowderUsedKg))
    const calculatedFreshMaterialsTotal = roundLocalNumber(
      [...normalizedMedicinalRows, ...normalizedNonMedicinalRows].reduce(
        (sum, row) => sum + toLocalNumber(row.usedQtyKg || row.kgUsed),
        0
      )
    )
    const selectedProduct = products.find(product => product.id === preparedForm.productId)
    const productCode =
      selectedProduct?.productCode ||
      selectedProduct?.product_code ||
      selectedProduct?.productNo ||
      selectedProduct?.product_no ||
      selectedProduct?.productNumber ||
      selectedProduct?.product_number ||
      selectedProduct?.code ||
      selectedProduct?.npn ||
      ''
    const selectedBrandRefs = brandRefsFromForm(preparedForm, brands)
    const primaryBrand = selectedBrandRefs[0]

    const payload = {
      id: preparedForm.id,
      brandId: primaryBrand?.id || preparedForm.brandId,
      brandName: primaryBrand?.name || preparedForm.brandName.trim(),
      brandIds: selectedBrandRefs.map(brand => String(brand.id || brand.brandId || '')).filter(Boolean),
      brandNames: selectedBrandRefs.map(brand => String(brand.name || brand.brandName || '')).filter(Boolean),
      brands: selectedBrandRefs.map(brand => ({
        id: String(brand.id || brand.brandId || ''),
        name: String(brand.name || brand.brandName || ''),
        codePrefix: String(brand.codePrefix || brand.code_prefix || '')
      })),
      productId: preparedForm.productId,
      productName: preparedForm.productName.trim(),
      productCode,
      npn: selectedProduct?.npn || '',
      mixingCode: preparedForm.autoGenerateCode ? '' : preparedForm.mixingCode.trim(),
      location: preparedForm.rackNo.trim(),
      rackNo: preparedForm.rackNo.trim(),
      mixingSessions,
      mixingTimeLogs: mixingSessions,
      timeLogs: mixingSessions,
      mixingDates: mixingSessions.map(session => session.date).filter(Boolean),
      mixingDate: firstSession?.date || null,
      startDate: firstSession?.startDate || null,
      startTime: firstSession?.startTime || null,
      endDate: lastSession?.endDate || null,
      endTime: lastSession?.endTime || null,

      mixedPowderName: preparedForm.productName.trim(),
      existingMixedPowderId: preparedForm.existingMixedPowderId || null,
      existingMixedPowderCode: preparedForm.existingMixedPowderCode || null,
      existingMixedPowderSource: preparedForm.existingMixedPowderSource || null,
      existingMixedPowderUsedKg: hasExistingPowder
        ? existingPowderUsedKg
        : null,
      existingMixedPowder: preparedForm.existingMixedPowderId
        ? {
            id: preparedForm.existingMixedPowderId,
            mixingCode: preparedForm.existingMixedPowderCode,
            source: preparedForm.existingMixedPowderSource || 'mixing',
            productId: preparedForm.productId,
            name: preparedForm.mixedPowderName.trim() || preparedForm.existingMixedPowderCode,
            usedKg: existingPowderUsedKg
          }
        : undefined,

      medicinalIngredients: normalizedMedicinalRows,
      nonMedicinalIngredients: normalizedNonMedicinalRows,
      totalKgInMixing: finalTotalKg,
      totalKg: finalTotalKg,
      totalMixingKg: finalTotalKg,
      totalMixedQtyKg: finalTotalKg,
      totalFormulaQtyKg: finalTotalKg,
      freshMixingRequiredKg: freshMixingRequired,
      calculatedFreshRawMaterialsTotalKg: calculatedFreshMaterialsTotal,

      // Legacy aliases kept during transition.
      byBookRawMaterials: normalizedMedicinalRows,
      pragmaticRawMaterials: [],
      nonMedUsage: normalizedNonMedicinalRows,
      rmUsage: normalizedMedicinalRows,

      remarks: preparedForm.remarks.trim(),
      reason: preparedForm.changeReason.trim(),
      changeReason: preparedForm.changeReason.trim(),
      editDisclaimer: EDIT_DISCLAIMER
    }

    await saveLocalMixing(payload)
    showToast({ message: 'Mixing saved', type: 'success' })
    await loadRecords()
    closeForm()
  }

  const handleDelete = async (record: LocalMixingRecord) => {
    if (!record.id) return
    await deleteLocalMixing(record.id)
    showToast({ message: 'Mixing deleted', type: 'success' })
    await loadRecords()
    closeForm()
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <Card title={editId ? 'Edit Mixing' : 'Create Mixing'}>
          <div className="py-10 text-center text-sm font-medium text-zinc-500">
            Loading mixing form...
          </div>
        </Card>
      ) : editId && !selectedRecord ? (
        <Card title="Mixing Not Found">
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              The selected mixing record was not found. It may have been deleted or the link is old.
            </p>
          </div>
        </Card>
      ) : (
        <LocalMixingFormPanel
          record={selectedRecord}
          brands={brands}
          products={products}
          rawMaterials={rawMaterials}
          brandProductLinks={brandProductLinks}
          records={records}
          onClose={closeForm}
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
