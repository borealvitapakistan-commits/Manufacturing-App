import { useEffect, useMemo, useState } from 'react'

import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableLoading,
  TableRow,
  useToast
} from '@/components/ui'
import {
  fetchLocalAssemblies,
  fetchLocalMixings,
  fetchLocalEncapsulations,
  initSupabase
} from '@/lib/supabase/data'
import type { FGCategory } from '@/types'

const tabs: Array<{ value: FGCategory; label: string; sectionTitle: string }> = [
  { value: 'powder', label: 'Powders', sectionTitle: 'Powders' },
  { value: 'capsule', label: 'Capsules', sectionTitle: 'Capsules' },
  { value: 'bottle', label: 'Bottles', sectionTitle: 'Bottles' }
]

type ReportAction = 'download' | 'print'

interface MixingPowderRow {
  id?: string
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
  mixingDate?: number | { seconds: number } | string | null
  startDate?: number | { seconds: number } | string | null
  createdAt?: number | { seconds: number } | string | null
  updatedAt?: number | { seconds: number } | string | null
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
  status?: string | null
  encapsulationStatus?: string | null
  encapsulation_status?: string | null
  productionDate?: number | { seconds: number } | string | null
  startDate?: number | { seconds: number } | string | null
  createdAt?: number | { seconds: number } | string | null
  updatedAt?: number | { seconds: number } | string | null
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
  startDate?: number | { seconds: number } | string | null
  createdAt?: number | { seconds: number } | string | null
  updatedAt?: number | { seconds: number } | string | null
}

interface AssemblyBatchCodeColumn {
  key: string
  label: string
  brandId?: string | null
  brandName?: string | null
}

interface ReportColumn<T = any> {
  label: string
  width: number
  get: (row: T) => string
}

interface ReportSection<T = any> {
  title: string
  columns: ReportColumn<T>[]
  rows: T[]
}

type PdfOrientation = 'portrait' | 'landscape'

interface PdfExportOptions {
  orientation?: PdfOrientation
  repeatHeadings?: boolean
}

interface DetailRow {
  field: string
  value: string
}

const detailColumns: ReportColumn<DetailRow>[] = [
  { label: 'Field', width: 130, get: row => row.field },
  { label: 'Value', width: 360, get: row => row.value }
]

const timeLogColumns: ReportColumn<Record<string, any>>[] = [
  { label: 'Date', width: 90, get: row => displayDate(row.date ?? row.startDate) },
  { label: 'Start Time', width: 80, get: row => stringOrDash(row.startTime) },
  { label: 'End Time', width: 80, get: row => stringOrDash(row.endTime) },
  { label: 'Remarks', width: 180, get: row => stringOrDash(row.remarks) }
]

const ingredientColumns: ReportColumn<Record<string, any>>[] = [
  { label: 'SR', width: 35, get: row => stringOrDash(row.clNo ?? row.sr ?? row.serialNo) },
  { label: 'RM Code', width: 80, get: row => stringOrDash(row.rawMaterialCode ?? row.code) },
  { label: 'Raw Material', width: 145, get: row => stringOrDash(row.rawMaterialName ?? row.name) },
  { label: 'Category', width: 90, get: row => stringOrDash(row.rawMaterialCategoryName ?? row.rmCategoryName ?? row.category) },
  { label: 'MG Dose Used', width: 85, get: row => stringOrDash(row.mgDoseUsed ?? row.doseMg ?? row.mgDose ?? row.dosageMg) },
  { label: 'KG Used', width: 75, get: row => stringOrDash(row.kgUsed ?? row.usedQtyKg ?? row.qtyUsedKg ?? row.requiredQtyKgThisMix) },
  { label: 'Percent Share', width: 85, get: row => stringOrDash(row.percentShare ?? row.ratioPercent) },
  { label: 'Qty Before KG', width: 85, get: row => stringOrDash(row.qtyBeforeKg) },
  { label: 'Qty After KG', width: 85, get: row => stringOrDash(row.qtyAfterKg) },
  { label: 'Remarks', width: 110, get: row => stringOrDash(row.remarks) }
]

function numberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stringOrDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

function formatKg(value: string | number | null | undefined): string {
  const parsed = numberOrNull(value)
  return parsed === null ? '-' : parsed.toFixed(4)
}

function formatNumber(value: string | number | null | undefined): string {
  const parsed = numberOrNull(value)
  if (parsed === null) return '-'
  return Number.isInteger(parsed) ? String(parsed) : String(parsed)
}

function parseDateMillis(value: unknown): number | null {
  if (!value) return null

  if (typeof value === 'number') {
    return value > 100000000000 ? value : value * 1000
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = Number((value as { seconds: number }).seconds)
    return Number.isFinite(seconds) ? seconds * 1000 : null
  }

  return null
}

function toDateInput(value: unknown): string {
  const millis = parseDateMillis(value)
  return millis === null ? '' : new Date(millis).toISOString().slice(0, 10)
}

function displayDate(value: unknown): string {
  return toDateInput(value) || '-'
}

function rangeStart(date: string): number | null {
  if (!date) return null
  const parsed = Date.parse(`${date}T00:00:00`)
  return Number.isFinite(parsed) ? parsed : null
}

function rangeEnd(date: string): number | null {
  if (!date) return null
  const parsed = Date.parse(`${date}T23:59:59.999`)
  return Number.isFinite(parsed) ? parsed : null
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function reportValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.map(reportValue).join(', ') : '-'
  if (typeof value === 'object') return '-'
  return String(value)
}

function detailRow(field: string, value: unknown): DetailRow {
  return { field, value: reportValue(value) }
}

function dateDetailRow(field: string, value: unknown): DetailRow {
  return { field, value: displayDate(value) }
}

function compactDetails(rows: DetailRow[]): DetailRow[] {
  return rows.filter(row => row.value !== '-')
}

function firstArray(record: Record<string, any>, keys: string[]): Record<string, any>[] {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value) && value.length) return value as Record<string, any>[]
  }
  return []
}

function sectionFromDetails(title: string, rows: DetailRow[]): ReportSection<DetailRow> {
  return {
    title,
    columns: detailColumns,
    rows: compactDetails(rows)
  }
}

function mixingPowderKg(record: MixingPowderRow): number | null {
  return (
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

function mixingProductCode(record: MixingPowderRow): string {
  return stringOrDash(
    record.productCode ??
      record.product_code ??
      record.productNo ??
      record.product_no ??
      record.productNumber ??
      record.product_number ??
      record.productNpn ??
      record.product_npn ??
      record.npn ??
      record.sku
  )
}

function mixingReportDate(record: MixingPowderRow): number | null {
  return (
    parseDateMillis(record.mixingDate) ??
    parseDateMillis(record.startDate) ??
    parseDateMillis(record.createdAt) ??
    parseDateMillis(record.updatedAt)
  )
}

function encapsulationCode(item: EncapsulationRow): string {
  return stringOrDash(item.encapsulationCode ?? item.encapsulation_code ?? item.code ?? item.lotNumber ?? item.lot_number)
}

function encapsulationMixingCode(item: EncapsulationRow): string {
  return stringOrDash(item.mixingCode ?? item.mixing_code ?? item.mixCode ?? item.mix_code ?? item.mixingName ?? item.mixing_name)
}

function encapsulationProductName(item: EncapsulationRow): string {
  return stringOrDash(item.productName ?? item.product_name ?? item.batchCode ?? item.batch_code ?? item.name)
}

function encapsulationLocation(item: EncapsulationRow): string {
  const location = String(item.location ?? item.rackNo ?? item.rack_no ?? '').trim()
  const bucket = String(item.bucket ?? item.bucketNo ?? item.bucket_no ?? '').trim()
  if (location && bucket) return `${location} / ${bucket}`
  if (location) return location
  if (bucket) return bucket
  return '-'
}

function encapsulationTfwMg(item: EncapsulationRow): string {
  return formatNumber(item.targetFillWeightMg ?? item.target_fill_weight_mg ?? item.tfwMg ?? item.tfw_mg)
}

function encapsulationTotalCapsulesFilledQty(item: EncapsulationRow): string {
  return formatNumber(
    item.totalCapsulesFilledQty ??
      item.total_capsules_filled_qty ??
      item.netCapsulesFilledQty ??
      item.net_capsules_filled_qty ??
      item.grossCapsulesFilledQty ??
      item.gross_capsules_filled_qty
  )
}

function encapsulationStatus(item: EncapsulationRow): string {
  return stringOrDash(item.status ?? item.encapsulationStatus ?? item.encapsulation_status)
}

function encapsulationReportDate(record: EncapsulationRow): number | null {
  return (
    parseDateMillis(record.productionDate) ??
    parseDateMillis(record.startDate) ??
    parseDateMillis(record.createdAt) ??
    parseDateMillis(record.updatedAt)
  )
}

function assemblyBatchCodeLines(item: AssemblyBottleRow): BrandBatchCode[] {
  const codes = item.brandBatchCodes || item.brand_batch_codes || []
  if (codes.length > 0) return codes

  const display = String(item.batchCodeDisplay || item.batch_code_display || '').trim()
  if (display.includes('Batch Code:')) {
    const lines = display.split(/\n+/).map(line => line.trim()).filter(Boolean)
    const parsed: BrandBatchCode[] = []
    for (let index = 0; index < lines.length; index += 2) {
      parsed.push({
        brandName: lines[index]?.replace(/Batch Code:\s*$/i, '').trim() || '',
        batchCode: lines[index + 1] || ''
      })
    }
    if (parsed.length > 1) return parsed
  }

  return [{
    brandId: item.brandId ?? item.brand_id ?? null,
    brandName: item.brandName ?? item.brand_name ?? null,
    batchCode: item.assemblyCode ?? item.assembly_code ?? item.batchCode ?? item.batch_code ?? item.code ?? ''
  }]
}

function normalizeColumnKey(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function batchCodeValue(code: BrandBatchCode): string {
  return String(code.batchCode || code.assemblyCode || '').trim()
}

function batchColumnKey(code: BrandBatchCode): string {
  return String(code.brandId || normalizeColumnKey(code.brandName) || normalizeColumnKey(code.codePrefix) || 'batch-code')
}

function addBatchColumn(map: Map<string, AssemblyBatchCodeColumn>, code: BrandBatchCode) {
  const key = batchColumnKey(code)
  if (map.has(key)) return

  const brandName = String(code.brandName || '').trim()
  map.set(key, {
    key,
    brandId: code.brandId,
    brandName,
    label: brandName ? `${brandName} Batch Code` : 'Batch Code'
  })
}

function collectAssemblyBatchColumns(rows: AssemblyBottleRow[]): AssemblyBatchCodeColumn[] {
  const columns = new Map<string, AssemblyBatchCodeColumn>()

  rows
    .filter(row => assemblyBatchCodeLines(row).length > 1)
    .forEach(row => assemblyBatchCodeLines(row).forEach(code => addBatchColumn(columns, code)))

  rows.forEach(row => assemblyBatchCodeLines(row).forEach(code => addBatchColumn(columns, code)))

  if (columns.size === 0) {
    columns.set('batch-code', { key: 'batch-code', label: 'Batch Code' })
  }

  return Array.from(columns.values())
}

function assemblyBatchCodeForColumn(item: AssemblyBottleRow, column: AssemblyBatchCodeColumn): string {
  const exact = assemblyBatchCodeLines(item).find(code => batchColumnKey(code) === column.key)
  if (exact) return batchCodeValue(exact) || '-'

  if (column.key === 'batch-code') {
    return stringOrDash(item.assemblyCode ?? item.assembly_code ?? item.batchCode ?? item.batch_code ?? item.code)
  }

  return '-'
}

function assemblyEncapsulationCode(item: AssemblyBottleRow): string {
  return stringOrDash(item.encapsulationCode ?? item.encapsulation_code)
}

function assemblyProductName(item: AssemblyBottleRow): string {
  return stringOrDash(item.productName ?? item.product_name)
}

function assemblyLocation(item: AssemblyBottleRow): string {
  const location = String(item.location ?? item.rackNo ?? item.rack_no ?? '').trim()
  const boxNo = String(item.boxNo ?? item.box_no ?? item.bucket ?? '').trim()
  if (location && boxNo) return `${location} / ${boxNo}`
  if (location) return location
  if (boxNo) return boxNo
  return '-'
}

function assemblyTotalBottles(item: AssemblyBottleRow): string {
  return formatNumber(
    item.bottleQuantity ??
      item.bottle_quantity ??
      item.totalBottlesMade ??
      item.total_bottles_made ??
      item.bottleTotal ??
      item.bottle_total
  )
}

function assemblyBatchCode(item: AssemblyBottleRow): string {
  return stringOrDash(item.batchCode ?? item.batch_code)
}

function assemblyCapsulesPerBottle(item: AssemblyBottleRow): string {
  return formatNumber(item.capsulesPerBottle ?? item.capsules_per_bottle ?? item.unitsPerBottle)
}

function assemblyTotalUnitsUsed(item: AssemblyBottleRow): string {
  return formatNumber(
    item.totalUnitsUsed ??
      item.total_units_used ??
      item.capsulesReceivedQty ??
      item.capsules_received_qty
  )
}

function assemblyAvailableBottleQuantity(item: AssemblyBottleRow): string {
  return formatNumber(
    item.availableBottleQuantity ?? item.available_bottle_quantity ?? item.remainingBottleQuantity
  )
}

function assemblyAvailableUnitsQty(item: AssemblyBottleRow): string {
  return formatNumber(item.availableUnitsQty ?? item.available_units_qty ?? item.remainingUnitsQty)
}

function assemblyFilledBottleWeight(item: AssemblyBottleRow): string {
  const weight = item.filledBottleWeight ?? item.filled_bottle_weight
  if (weight === null || weight === undefined || weight === '') return '-'
  const unit = item.weightUnit ?? item.weight_unit ?? 'g'
  return `${formatNumber(weight)} ${unit}`
}

function assemblyComments(item: AssemblyBottleRow): string {
  return stringOrDash(item.comments ?? item.remarks)
}

function assemblyStatus(item: AssemblyBottleRow): string {
  return stringOrDash(item.status ?? item.assemblyStatus ?? item.assembly_status)
}

function assemblyReportDate(record: AssemblyBottleRow): number | null {
  return (
    parseDateMillis(record.productionDate ?? record.production_date) ??
    parseDateMillis(record.startDate) ??
    parseDateMillis(record.createdAt) ??
    parseDateMillis(record.updatedAt)
  )
}

function inRange(value: number | null, from: string, to: string): boolean {
  const start = rangeStart(from)
  const end = rangeEnd(to)
  if (start === null && end === null) return true
  if (value === null) return false
  if (start !== null && value < start) return false
  if (end !== null && value > end) return false
  return true
}

function rangeLabel(from: string, to: string): string {
  if (from && to) return `${from} to ${to}`
  if (from) return `from ${from}`
  if (to) return `up to ${to}`
  return 'All dates'
}

const powderColumns: ReportColumn<MixingPowderRow>[] = [
  { label: 'Product Name', width: 160, get: row => row.productName || row.mixedPowderName || '-' },
  { label: 'Product Code', width: 110, get: mixingProductCode },
  { label: 'Mixing Code', width: 105, get: row => stringOrDash(row.mixingCode) },
  { label: 'Location', width: 90, get: row => stringOrDash(row.location || row.rackNo) },
  { label: 'Weight KG', width: 85, get: row => formatKg(mixingPowderKg(row)) }
]

const capsuleColumns: ReportColumn<EncapsulationRow>[] = [
  { label: 'Encapsulation Code', width: 95, get: encapsulationCode },
  { label: 'Mixing Code', width: 105, get: encapsulationMixingCode },
  { label: 'Product Name', width: 155, get: encapsulationProductName },
  { label: 'Location', width: 95, get: encapsulationLocation },
  { label: 'Target Fill Weight Mg', width: 110, get: encapsulationTfwMg },
  { label: 'Total Capsules Filled Qty', width: 130, get: encapsulationTotalCapsulesFilledQty },
  { label: 'Status', width: 90, get: encapsulationStatus }
]

function makeBottleColumns(batchColumns: AssemblyBatchCodeColumn[]): ReportColumn<AssemblyBottleRow>[] {
  return [
  ...batchColumns.map(column => ({
    label: column.label,
    width: 105,
    get: (row: AssemblyBottleRow) => assemblyBatchCodeForColumn(row, column)
  })),
  { label: 'Batch Code', width: 100, get: assemblyBatchCode },
  { label: 'Encapsulation Code', width: 85, get: assemblyEncapsulationCode },
  { label: 'Product Name', width: 130, get: assemblyProductName },
  { label: 'Location', width: 90, get: assemblyLocation },
  { label: 'Capsules/Units per Bottle', width: 100, get: assemblyCapsulesPerBottle },
  { label: 'Bottle Quantity', width: 90, get: assemblyTotalBottles },
  { label: 'Available Bottle Quantity', width: 110, get: assemblyAvailableBottleQuantity },
  { label: 'Total Units Used', width: 100, get: assemblyTotalUnitsUsed },
  { label: 'Available Units Qty', width: 110, get: assemblyAvailableUnitsQty },
  { label: 'Filled Bottle Weight', width: 100, get: assemblyFilledBottleWeight },
  { label: 'Production Date', width: 85, get: row => displayDate(row.productionDate ?? row.production_date) },
  { label: 'Expiry Date', width: 75, get: row => displayDate(row.expiryDate ?? row.expiry_date) },
  { label: 'Status', width: 80, get: assemblyStatus },
  { label: 'Comments', width: 115, get: assemblyComments }
  ]
}

function buildMixingDetailSections(row: MixingPowderRow): ReportSection[] {
  const record = row as Record<string, any>
  const medicinalIngredients = firstArray(record, ['medicinalIngredients', 'rawMaterials', 'byBookRawMaterials'])
  const nonMedicinalIngredients = firstArray(record, ['nonMedicinalIngredients', 'nonMedUsage', 'nmiRows'])
  const timeLogs = firstArray(record, ['mixingSessions', 'mixingTimeLogs', 'timeLogs'])
  const mixingBrands = firstArray(record, ['mixingBrands'])

  return [
    sectionFromDetails('Mixing / Powder Details', [
      detailRow('Mixing Code', record.mixingCode),
      detailRow('Brand', record.brandName ?? record.brandNames),
      detailRow('Product Name', record.productName ?? record.mixedPowderName),
      detailRow('Mixed Powder Name', record.mixedPowderName),
      detailRow('Product Code', mixingProductCode(row)),
      detailRow('Location', record.location ?? record.rackNo),
      detailRow('Status', record.status),
      detailRow('Total Kg in Mixing', record.totalKgInMixing ?? record.totalKg ?? record.totalMixingKg),
      detailRow('Available Mixed Powder Kg', record.availableMixedPowderKg ?? record.remainingMixedPowderKg ?? record.mixedPowderInventoryKg),
      detailRow('Existing Mixed Powder Source', record.existingMixedPowderSource),
      detailRow('Existing Mixed Powder Code', record.existingMixedPowderCode),
      detailRow('Existing Mixed Powder Used Kg', record.existingMixedPowderUsedKg),
      detailRow('Fresh Mixing Required Kg', record.freshMixingRequiredKg),
      detailRow('Calculated Fresh Raw Materials Total Kg', record.calculatedFreshRawMaterialsTotalKg),
      detailRow('Total Formula Qty Kg', record.totalFormulaQtyKg),
      detailRow('Total Mixed Qty Kg', record.totalMixedQtyKg),
      dateDetailRow('Mixing Date', record.mixingDate ?? record.startDate),
      detailRow('Start Time', record.startTime),
      dateDetailRow('End Date', record.endDate),
      detailRow('End Time', record.endTime),
      detailRow('Remarks', record.remarks),
      detailRow('Change Reason', record.changeReason ?? record.reason)
    ]),
    {
      title: 'Mixing Daily Time Log',
      columns: timeLogColumns,
      rows: timeLogs
    },
    {
      title: 'Medicinal Ingredients',
      columns: ingredientColumns,
      rows: medicinalIngredients
    },
    {
      title: 'Non-Medicinal Ingredients',
      columns: ingredientColumns,
      rows: nonMedicinalIngredients
    },
    {
      title: 'Mixing Brands',
      columns: [
        { label: 'Brand', width: 220, get: (item: Record<string, any>) => reportValue(item.brandName) },
        { label: 'Primary', width: 90, get: (item: Record<string, any>) => reportValue(item.isPrimary) }
      ],
      rows: mixingBrands
    }
  ]
}

function buildEncapsulationDetailSections(row: EncapsulationRow): ReportSection[] {
  const record = row as Record<string, any>
  const timeLogs = firstArray(record, ['encapsulationSessions', 'encapsulationTimeLogs', 'timeLogs'])
  const loadChecks = firstArray(record, ['loadChecks'])

  const sections: ReportSection[] = [
    sectionFromDetails('Encapsulation / Capsule Details', [
      detailRow('Encapsulation Code', encapsulationCode(row)),
      detailRow('Lot Number', record.lotNumber),
      detailRow('Mixing Code', encapsulationMixingCode(row)),
      detailRow('Mixing Name', record.mixingName),
      detailRow('Brand', record.brandName ?? record.brandNames),
      detailRow('Product Name', encapsulationProductName(row)),
      detailRow('Location', record.location ?? record.rackNo),
      detailRow('Bucket', record.bucket ?? record.bucketNo),
      detailRow('Capsule Size', record.capsuleSize),
      detailRow('Machine Model', record.machineModel),
      detailRow('Machine Speed', record.machineSpeed),
      detailRow('Raw Material Received Kg', record.rawMaterialReceivedKg),
      detailRow('Mixing Total Kg', record.mixingTotalKg),
      detailRow('Mixing Available Before Encapsulation Kg', record.mixingAvailableBeforeEncapsulationKg),
      detailRow('Mixing Used in Encapsulation Kg', record.mixingUsedInEncapsulationKg),
      detailRow('Mixing Available After Encapsulation Kg', record.mixingAvailableAfterEncapsulationKg ?? record.mixingAvailableKg),
      detailRow('Source Target Fill Weight Mg', record.sourceTargetFillWeightMg),
      detailRow('Target Fill Weight Mg', record.targetFillWeightMg ?? record.tfwMg),
      detailRow('Target Fill Weight Modified', record.targetFillWeightModified),
      detailRow('Empty Capsule Unit Weight Mg', record.emptyCapsuleUnitWeightMg),
      detailRow('Empty Capsule Weight Kg', record.emptyCapsuleWeightKg),
      detailRow('Total Capsules Produced Kg', record.totalCapsulesProducedKg),
      detailRow('Gross Capsules Filled Qty', record.grossCapsulesFilledQty),
      detailRow('Total Capsules Filled Qty', record.totalCapsulesFilledQty),
      detailRow('Net Capsules Filled Qty', record.netCapsulesFilledQty),
      detailRow('Rejected Capsules Qty', record.rejectedCapsulesQty),
      detailRow('Rejected Capsules Weight Kg', record.rejectedCapsulesWeightKg),
      detailRow('Available Capsules Qty', record.availableCapsulesQty ?? record.remainingCapsulesQty),
      detailRow('Yield Percent', record.yieldPercent),
      detailRow('Temperature C', record.temperatureC),
      detailRow('Temperature F', record.temperatureF),
      detailRow('Humidity Percent', record.humidityPercent),
      detailRow('Duster Check', record.dusterCheck),
      detailRow('Vacuum Check', record.vacuumCheck),
      dateDetailRow('Production Date', record.productionDate),
      dateDetailRow('Start Date', record.startDate),
      detailRow('Start Time', record.startTime),
      dateDetailRow('End Date', record.endDate),
      detailRow('End Time', record.endTime),
      detailRow('Status', encapsulationStatus(row)),
      detailRow('Operator Name', record.operatorName),
      detailRow('Remarks', record.remarks),
      detailRow('Change Reason', record.changeReason ?? record.reason)
    ]),
    {
      title: 'Encapsulation Daily Time Log',
      columns: timeLogColumns,
      rows: timeLogs
    }
  ]

  if (loadChecks.length) {
    sections.push({
      title: 'Encapsulation Load Checks',
      columns: [
        { label: 'Date', width: 80, get: item => displayDate(item.checkDate) },
        { label: 'Time', width: 65, get: item => reportValue(item.checkTime) },
        { label: 'Load', width: 70, get: item => reportValue(item.loadLabel) },
        { label: 'W1 Mg', width: 55, get: item => reportValue(item.w1Mg) },
        { label: 'W2 Mg', width: 55, get: item => reportValue(item.w2Mg) },
        { label: 'W3 Mg', width: 55, get: item => reportValue(item.w3Mg) },
        { label: 'W4 Mg', width: 55, get: item => reportValue(item.w4Mg) },
        { label: 'W5 Mg', width: 55, get: item => reportValue(item.w5Mg) },
        { label: 'Avg Mg', width: 60, get: item => reportValue(item.avgMg) },
        { label: 'Min Mg', width: 60, get: item => reportValue(item.minWeightMg) },
        { label: 'Max Mg', width: 60, get: item => reportValue(item.maxWeightMg) },
        { label: 'Samples', width: 60, get: item => reportValue(item.sampleCount) },
        { label: 'Operator', width: 100, get: item => reportValue(item.operatorName) },
        { label: 'Remarks', width: 120, get: item => reportValue(item.remarks) }
      ],
      rows: loadChecks
    })
  }

  return sections
}

function buildAssemblyDetailSections(row: AssemblyBottleRow, batchColumns: AssemblyBatchCodeColumn[]): ReportSection[] {
  const record = row as Record<string, any>
  const timeLogs = firstArray(record, ['assemblySessions', 'assemblyTimeLogs', 'timeLogs'])
  const batchRows = batchColumns.map(column => detailRow(column.label, assemblyBatchCodeForColumn(row, column)))

  return [
    sectionFromDetails('Assembly / Bottle Details', [
      ...batchRows,
      detailRow('Batch Code', assemblyBatchCode(row)),
      detailRow('Encapsulation Code', assemblyEncapsulationCode(row)),
      detailRow('Mixing Code', record.mixingCode),
      detailRow('Mixing Name', record.mixingName),
      detailRow('Brand', record.brandName ?? record.brandNames),
      detailRow('Product Name', assemblyProductName(row)),
      detailRow('Location', record.location ?? record.rackNo),
      detailRow('Box No.', record.boxNo ?? record.bucket),
      detailRow('Source Location', record.sourceLocation),
      detailRow('Source Bucket', record.sourceBucket),
      detailRow('Capsule Weight Mg', record.capsuleWeightMg ?? record.capsuleWeight),
      detailRow('Source Capsule Weight Mg', record.sourceCapsuleWeightMg),
      detailRow('Capsule Weight Modified', record.capsuleWeightModified),
      detailRow('Capsules/Units per Bottle', assemblyCapsulesPerBottle(row)),
      detailRow('Bottle Quantity', assemblyTotalBottles(row)),
      detailRow('Available Bottle Quantity', assemblyAvailableBottleQuantity(row)),
      detailRow('Total Units Used', assemblyTotalUnitsUsed(row)),
      detailRow('Available Units Qty', assemblyAvailableUnitsQty(row)),
      detailRow('Capsules Received Kg', record.capsulesReceivedKg),
      detailRow('Bottle Type', record.bottleCapsuleType ?? record.bottleSize ?? record.bottleCC),
      detailRow('Filled Bottle Weight', assemblyFilledBottleWeight(row)),
      detailRow('Total Labels Used', record.totalLabelsUsed),
      dateDetailRow('Production Date', record.productionDate ?? record.production_date),
      dateDetailRow('Expiry Date', record.expiryDate ?? record.expiry_date),
      dateDetailRow('Start Date', record.startDate),
      detailRow('Start Time', record.startTime),
      dateDetailRow('End Date', record.endDate),
      detailRow('End Time', record.endTime),
      dateDetailRow('Quality Control Date', record.qualityControlDate ?? record.qcDate),
      detailRow('Quality Control Start Time', record.qualityControlStartTime ?? record.qcStartTime),
      detailRow('Quality Control End Time', record.qualityControlEndTime ?? record.qcEndTime),
      dateDetailRow('Packaging Date', record.packagingDate ?? record.packageDate),
      detailRow('Packaging Start Time', record.packagingStartTime),
      detailRow('Packaging End Time', record.packagingEndTime),
      detailRow('Status', assemblyStatus(row)),
      detailRow('Operator Name', record.operatorName),
      detailRow('Comments', record.comments ?? record.remarks)
    ]),
    {
      title: 'Assembly Daily Time Log',
      columns: timeLogColumns,
      rows: timeLogs
    },
    {
      title: 'Assembly Brands',
      columns: [
        { label: 'Brand', width: 160, get: (item: Record<string, any>) => reportValue(item.brandName) },
        { label: 'Batch Code', width: 130, get: (item: Record<string, any>) => reportValue(item.batchCode) },
        { label: 'Bottles Qty', width: 90, get: (item: Record<string, any>) => reportValue(item.bottlesQty) },
        { label: 'Comments', width: 160, get: (item: Record<string, any>) => reportValue(item.comments) }
      ],
      rows: firstArray(record, ['brandBatchCodes'])
    }
  ]
}

function buildSpecificReportSections(
  tab: FGCategory,
  row: unknown,
  batchColumns: AssemblyBatchCodeColumn[]
): ReportSection[] {
  if (tab === 'powder') return buildMixingDetailSections(row as MixingPowderRow)
  if (tab === 'capsule') return buildEncapsulationDetailSections(row as EncapsulationRow)
  return buildAssemblyDetailSections(row as AssemblyBottleRow, batchColumns)
}

function buildPrintHtml(sections: ReportSection[], title: string, subtitle: string): string {
  const sectionsHtml = sections.map(section => `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      <table>
        <thead>
          <tr>${section.columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${section.rows.length === 0
            ? `<tr><td colspan="${section.columns.length}" class="empty">No records found.</td></tr>`
            : section.rows.map(row => `
                <tr>${section.columns.map(column => `<td>${escapeHtml(column.get(row)).replace(/\n/g, '<br>')}</td>`).join('')}</tr>
              `).join('')}
        </tbody>
      </table>
    </section>
  `).join('')

  return `<!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 28px; }
          h1 { margin: 0 0 6px; font-size: 24px; }
          p { margin: 0 0 22px; color: #4b5563; }
          h2 { margin: 26px 0 10px; font-size: 17px; }
          table { border-collapse: collapse; width: 100%; table-layout: fixed; }
          thead { display: table-header-group; }
          th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; font-size: 11px; word-break: break-word; }
          th { background: #1D838D; color: white; text-align: left; text-transform: uppercase; }
          .empty { text-align: center; color: #6b7280; padding: 18px; }
          @media print { body { margin: 12mm; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
        ${sectionsHtml}
      </body>
    </html>`
}

async function downloadPdf(
  sections: ReportSection[],
  fileName: string,
  title: string,
  subtitle: string,
  options: PdfExportOptions = {}
) {
  const { jsPDF } = await import('jspdf')
  const orientation = options.orientation ?? 'landscape'
  const repeatHeadings = options.repeatHeadings ?? true
  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 32
  const headerHeight = 24
  const rowHeight = 34
  let y = margin

  function drawDocumentHeader() {
    pdf.setTextColor(17, 24, 39)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(orientation === 'portrait' ? 16 : 18)
    pdf.text(title, margin, y)
    y += 18
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text(subtitle, margin, y)
    y += 28
  }

  function drawSectionTitle(sectionTitle: string) {
    pdf.setTextColor(17, 24, 39)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    pdf.text(sectionTitle, margin, y)
    y += 12
  }

  function drawTableHeader(section: ReportSection, availableWidth: number, scale: number) {
    let x = margin
    pdf.setFillColor(29, 131, 141)
    pdf.setDrawColor(209, 213, 219)
    pdf.rect(margin, y, availableWidth, headerHeight, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(255, 255, 255)
    section.columns.forEach(column => {
      const width = column.width * scale
      pdf.text(column.label.toUpperCase(), x + 4, y + 15, { maxWidth: width - 8 })
      x += width
    })
    y += headerHeight
    pdf.setTextColor(17, 24, 39)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
  }

  drawDocumentHeader()

  for (const section of sections) {
    const availableWidth = pageWidth - margin * 2
    const configuredWidth = section.columns.reduce((sum, column) => sum + column.width, 0)
    const scale = availableWidth / configuredWidth

    function ensurePage(space = rowHeight, repeatSectionHeader = false) {
      if (y + space <= pageHeight - margin) return
      pdf.addPage('a4', orientation)
      y = margin
      if (repeatHeadings) {
        drawDocumentHeader()
        if (repeatSectionHeader) {
          drawSectionTitle(section.title)
          drawTableHeader(section, availableWidth, scale)
        }
      }
    }

    ensurePage(58)
    drawSectionTitle(section.title)
    drawTableHeader(section, availableWidth, scale)

    if (section.rows.length === 0) {
      ensurePage(rowHeight, true)
      pdf.text('No records found.', margin + 4, y + 18)
      y += rowHeight
      continue
    }

    section.rows.forEach(row => {
      ensurePage(rowHeight, true)
      let x = margin
      section.columns.forEach(column => {
        const width = column.width * scale
        const text = column.get(row)
        const lines = pdf.splitTextToSize(text, width - 8) as string[]
        pdf.rect(x, y, width, rowHeight, 'D')
        pdf.text(lines.slice(0, 3), x + 4, y + 12)
        x += width
      })
      y += rowHeight
    })

    y += 18
  }

  pdf.save(`${safeFilePart(fileName)}.pdf`)
}

function printReport(sections: ReportSection[], title: string, subtitle: string) {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer')
  if (!printWindow) return false
  printWindow.document.write(buildPrintHtml(sections, title, subtitle))
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => printWindow.print(), 150)
  return true
}

export default function ManufacturingReportsPage() {
  const [activeTab, setActiveTab] = useState<FGCategory>('powder')
  const [mixingRows, setMixingRows] = useState<MixingPowderRow[]>([])
  const [encapsulationRows, setEncapsulationRows] = useState<EncapsulationRow[]>([])
  const [assemblyRows, setAssemblyRows] = useState<AssemblyBottleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rangeAction, setRangeAction] = useState<ReportAction | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [exporting, setExporting] = useState(false)
  const { showToast } = useToast()
  const assemblyBatchColumns = useMemo(
    () => collectAssemblyBatchColumns(assemblyRows),
    [assemblyRows]
  )
  const bottleColumns = useMemo(
    () => makeBottleColumns(assemblyBatchColumns),
    [assemblyBatchColumns]
  )

  useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true)
        setError('')
        await initSupabase()
        const [mixings, encapsulations, assemblies] = await Promise.all([
          fetchLocalMixings({ limit: 1000 }),
          fetchLocalEncapsulations({ limit: 1000 }),
          fetchLocalAssemblies({ limit: 1000 })
        ])
        setMixingRows(mixings as MixingPowderRow[])
        setEncapsulationRows(encapsulations as EncapsulationRow[])
        setAssemblyRows(assemblies as AssemblyBottleRow[])
      } catch (err) {
        console.error('Failed to load manufacturing reports:', err)
        setError(err instanceof Error ? err.message : 'Failed to load manufacturing reports.')
      } finally {
        setLoading(false)
      }
    }

    void loadReports()
  }, [])

  const activeSection = useMemo<ReportSection>(() => {
    if (activeTab === 'powder') return { title: 'Powders', columns: powderColumns, rows: mixingRows }
    if (activeTab === 'capsule') return { title: 'Capsules', columns: capsuleColumns, rows: encapsulationRows }
    return { title: 'Bottles', columns: bottleColumns, rows: assemblyRows }
  }, [activeTab, assemblyRows, bottleColumns, mixingRows, encapsulationRows])

  const rangedAssemblyRows = useMemo(
    () => assemblyRows.filter(row => inRange(assemblyReportDate(row), fromDate, toDate)),
    [assemblyRows, fromDate, toDate]
  )
  // Scope brand batch-code columns to the rows actually being exported, not the
  // entire unfiltered dataset - otherwise "Download All"/print for Bottles grows
  // one column per brand ever recorded and the report becomes unreadable/errors
  // out on large datasets.
  const rangedBottleColumns = useMemo(
    () => makeBottleColumns(collectAssemblyBatchColumns(rangedAssemblyRows)),
    [rangedAssemblyRows]
  )

  const rangedSections = useMemo<ReportSection[]>(() => [
    {
      title: 'Powders',
      columns: powderColumns,
      rows: mixingRows.filter(row => inRange(mixingReportDate(row), fromDate, toDate))
    },
    {
      title: 'Capsules',
      columns: capsuleColumns,
      rows: encapsulationRows.filter(row => inRange(encapsulationReportDate(row), fromDate, toDate))
    },
    {
      title: 'Bottles',
      columns: rangedBottleColumns,
      rows: rangedAssemblyRows
    }
  ], [fromDate, mixingRows, encapsulationRows, rangedAssemblyRows, rangedBottleColumns, toDate])

  async function handleRowAction(action: ReportAction, section: ReportSection, row: unknown) {
    const title = `${section.title} Manufacturing Report`
    const subtitle = 'Single detailed record report'
    const detailedSections = buildSpecificReportSections(activeTab, row, assemblyBatchColumns)

    if (action === 'print') {
      const opened = printReport(detailedSections, title, subtitle)
      if (!opened) showToast({ message: 'Allow popups to print this report.', type: 'error' })
      return
    }

    try {
      await downloadPdf(detailedSections, `${section.title}-manufacturing-detail-report`, title, subtitle, {
        orientation: 'portrait',
        repeatHeadings: true
      })
      showToast({ message: `${section.title} report downloaded`, type: 'success' })
    } catch (err) {
      console.error('Report PDF failed:', err)
      showToast({ message: 'PDF download failed.', type: 'error' })
    }
  }

  async function handleAllAction() {
    if (!rangeAction) return

    const title = 'Manufacturing Reports'
    const subtitle = `Date range: ${rangeLabel(fromDate, toDate)}`

    try {
      setExporting(true)
      if (rangeAction === 'print') {
        const opened = printReport(rangedSections, title, subtitle)
        if (!opened) showToast({ message: 'Allow popups to print reports.', type: 'error' })
      } else {
        await downloadPdf(rangedSections, `manufacturing-reports-${rangeLabel(fromDate, toDate)}`, title, subtitle)
        showToast({ message: 'Manufacturing reports downloaded', type: 'success' })
      }
      setRangeAction(null)
    } catch (err) {
      console.error('Manufacturing report export failed:', err)
      showToast({ message: 'Manufacturing report export failed.', type: 'error' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manufacturing Reports</h1>
          <p className="text-zinc-600">
            Download and print reports for powders, capsules, and bottled finished goods.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="subtle" onClick={() => setRangeAction('download')}>
            Download All
          </Button>
          <Button variant="subtle" onClick={() => setRangeAction('print')}>
            Print All
          </Button>
        </div>
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
            onClick={() => setActiveTab(tab.value)}
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

      <Card title={activeSection.title}>
        <Table>
          <TableHeader>
            <TableRow>
              {activeSection.columns.map(column => (
                <TableHead key={column.label}>{column.label}</TableHead>
              ))}
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableLoading colSpan={activeSection.columns.length + 1} />
            ) : activeSection.rows.length === 0 ? (
              <TableEmpty colSpan={activeSection.columns.length + 1} message={`No ${activeSection.title.toLowerCase()} records found.`} />
            ) : (
              activeSection.rows.map((row, index) => (
                <TableRow key={(row as { id?: string }).id || `${activeTab}-${index}`}>
                  {activeSection.columns.map(column => (
                    <TableCell key={column.label} className={column.label.includes('Code') || column.label === 'Product Name' ? 'font-medium' : undefined}>
                      {column.label === 'Status' && column.get(row) !== '-' ? (
                        <Badge variant="info">{column.get(row)}</Badge>
                      ) : column.label === 'Batch Code' ? (
                        <div className="whitespace-pre-line">{column.get(row)}</div>
                      ) : (
                        column.get(row)
                      )}
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => void handleRowAction('download', activeSection, row)}
                      >
                        Download
                      </Button>
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => void handleRowAction('print', activeSection, row)}
                      >
                        Print
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Modal
        open={rangeAction !== null}
        onClose={() => setRangeAction(null)}
        title={rangeAction === 'print' ? 'Print All Manufacturing Reports' : 'Download All Manufacturing Reports'}
        description="Choose a date range for Mixing, Encapsulation, and Assembly records."
        className="max-w-lg"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>From</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={event => setFromDate(event.target.value)}
            />
          </div>
          <div>
            <Label>To</Label>
            <Input
              type="date"
              value={toDate}
              onChange={event => setToDate(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          <p className="font-semibold">Selected range: {rangeLabel(fromDate, toDate)}</p>
          <p className="mt-1">
            Powders: {rangedSections[0].rows.length} | Capsules: {rangedSections[1].rows.length} | Bottles: {rangedSections[2].rows.length}
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRangeAction(null)} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={() => void handleAllAction()} loading={exporting}>
            {rangeAction === 'print' ? 'Print' : 'Download PDF'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
