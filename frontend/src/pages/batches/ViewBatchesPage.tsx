// ============================================================================
// View Batches Page
// ============================================================================

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, useToast } from '@/components/ui'
import {
  initSupabase,
  fetchAssemblyReports,
  fetchBatches,
  fetchBrands,
  fetchFinishedGoods,
  fetchMixingReports,
  fetchNJPReports,
  fetchProducts,
  fetchRawMaterials
} from '@/lib/supabase/data'
import { calculateTotalUnits, deriveBatchStatus, isStageCompleted, mgToKg, parseLabelClaimToMg } from '@/lib/utils'
import type {
  Batch,
  BatchStatus,
  Brand,
  FinishedGood,
  MixingReport,
  NJPReport,
  Product,
  ProductRawMaterial,
  RawMaterial,
  RMUsageItem
} from '@/types'

type ViewStatus = 'Closed' | 'In Progress' | 'Stopped'

interface RawMaterialWithVendor extends RawMaterial {
  vendor?: string | null
  vendorName?: string | null
  supplier?: string | null
  supplierName?: string | null
}

interface AssemblyReportView {
  batchId: string
  batchCode?: string | null
  productName?: string | null
  productionDate?: number | { seconds: number } | string | null
  expiryDate?: number | { seconds: number } | string | null
  startTime?: string | null
  endTime?: string | null
  qualityControlStartTime?: string | null
  qualityControlEndTime?: string | null
  qcStartTime?: string | null
  qcEndTime?: string | null
  packagingStartTime?: string | null
  packagingEndTime?: string | null
  totalBottlesMade?: number | null
  capsulesReceivedQty?: number | null
  capsulesPerBottle?: number | null
  finalQuantities?: Record<string, unknown> | null
  createdAt?: number | { seconds: number } | string | null
}

interface RawMaterialLine {
  sr: number
  name: string
  code: string
  qtyKg: number | null
  vendor: string
  coaLink: string
  comments: string
}

interface BatchViewRow {
  batch: Batch
  product: Product | null
  mixingReport: MixingReport | null
  njpReport: NJPReport | null
  assemblyReport: AssemblyReportView | null
  finishedGood: FinishedGood | null
  productionDate: Date | null
  expiryDate: Date | null
  status: ViewStatus
  rawMaterials: RawMaterialLine[]
}

interface FullReportRange {
  from: string
  to: string
}

const statusStyles: Record<ViewStatus, string> = {
  Closed: 'bg-emerald-100 text-emerald-800',
  'In Progress': 'bg-sky-100 text-sky-800',
  Stopped: 'bg-rose-100 text-rose-800'
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return new Date(parsed)
    return null
  }
  if (typeof value === 'object' && 'seconds' in value && typeof (value as { seconds: number }).seconds === 'number') {
    return new Date((value as { seconds: number }).seconds * 1000)
  }
  return null
}

function toDateInput(date: Date | null): string {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}

function formatDateTime(date: Date | null): string {
  if (!date) return '-'
  return date.toLocaleString()
}

function formatReportDate(date: Date | null): string {
  if (!date) return '-'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

function formatPreparationDate(date: Date | null): string {
  if (!date) return '-'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${month}/${day}/${date.getFullYear()}`
}

function formatExpiry(date: Date | null): string {
  if (!date) return '-'
  const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase()
  return `${month}-${String(date.getFullYear()).slice(-2)}`
}

function formatBatchTime(value: string | null | undefined): string {
  const time = String(value || '').trim()
  if (!time) return '-'

  const match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return time

  const hours = Number(match[1])
  if (!Number.isFinite(hours)) return time

  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${match[2]} ${period}`
}

function formatPdfStatus(status: ViewStatus): string {
  if (status === 'Closed') return 'comp'
  if (status === 'In Progress') return 'prog'
  return 'stop'
}

function formatNumber(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-'
  return Number(value.toFixed(digits)).toLocaleString()
}

function getViewStatus(status: BatchStatus): ViewStatus {
  if (status === 'finalized') return 'Closed'
  if (status === 'mixingPending') return 'Stopped'
  return 'In Progress'
}

function getDosageLabel(batch: Batch): string {
  const unit = Number(batch.unitsPerContainer || 0)
  const dosageLabels: Record<string, string> = {
    capsule: unit === 1 ? 'cap' : 'caps',
    tablet: unit === 1 ? 'tablet' : 'tablets',
    softgel: unit === 1 ? 'softgel' : 'softgels',
    lozenge: unit === 1 ? 'lozenge' : 'lozenges',
    oil: 'ml',
    liquid: 'ml',
    other: 'units'
  }
  const label = dosageLabels[batch.dosageForm] || batch.dosageForm
  return unit > 0 ? `${unit} ${label}` : label
}

function getTotalQty(batch: Batch): string {
  if (batch.totalUnits !== null && batch.totalUnits !== undefined) {
    return Number(batch.totalUnits).toLocaleString()
  }
  return '-'
}

function readTextField(source: unknown, keys: string[]): string {
  if (!source || typeof source !== 'object') return ''
  const record = source as Record<string, unknown>

  for (const key of keys) {
    const value = record[key]
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim()
    }
  }

  return ''
}

function getNpn(row: BatchViewRow): string {
  return readTextField(row.product, ['npn', 'npnNumber', 'npnCode', 'naturalProductNumber', 'productNpn']) ||
    readTextField(row.batch, ['npn', 'npnNumber', 'npnCode', 'naturalProductNumber', 'productNpn']) ||
    '-'
}

function getPreparationDate(row: BatchViewRow): Date | null {
  return toDate(row.batch.createdAt) || row.productionDate
}

function getBlendingDate(row: BatchViewRow): Date | null {
  const mixingDates = row.mixingReport?.mixingDates || []
  return (
    toDate(row.mixingReport?.mixingDate) ||
    toDate(mixingDates[0]) ||
    toDate(row.mixingReport?.createdAt) ||
    getPreparationDate(row)
  )
}

function getBlendingTotalKg(row: BatchViewRow): number | null {
  const reportTotal = Number(row.mixingReport?.totalMixedQtyKg ?? row.mixingReport?.totalFormulaQtyKg)
  if (Number.isFinite(reportTotal)) return reportTotal

  const rawMaterialTotal = row.rawMaterials.reduce((sum, line) => {
    return sum + (Number.isFinite(line.qtyKg) ? Number(line.qtyKg) : 0)
  }, 0)

  return rawMaterialTotal > 0 ? rawMaterialTotal : null
}

function getBlendingStartTime(row: BatchViewRow): string {
  const startTime =
    row.mixingReport?.startTime ||
    readTextField(row.mixingReport, ['blendingStartTime', 'mixingStartTime', 'timeStart']) ||
    row.batch.endTime

  return formatBatchTime(startTime)
}

function getBlendingEndTime(row: BatchViewRow): string {
  const endTime =
    row.mixingReport?.endTime ||
    readTextField(row.mixingReport, ['blendingEndTime', 'mixingEndTime', 'timeEnd']) ||
    getEncapsulationStartTimeValue(row)

  return formatBatchTime(endTime)
}

function getCapsuleDataValue(row: BatchViewRow, keys: string[]): unknown {
  const capsuleData = row.njpReport?.capsuleData
  if (!capsuleData || typeof capsuleData !== 'object') return undefined
  const record = capsuleData as Record<string, unknown>

  for (const key of keys) {
    const value = record[key]
    if (value !== null && value !== undefined && String(value).trim()) return value
  }

  return undefined
}

function getEncapsulationStartTimeValue(row: BatchViewRow): string {
  return row.njpReport?.startTime || String(getCapsuleDataValue(row, ['startTime', 'timeStart']) || '')
}

function getEncapsulationDate(row: BatchViewRow): Date | null {
  return (
    toDate(row.njpReport?.productionDate) ||
    toDate(row.njpReport?.startDate) ||
    toDate(getCapsuleDataValue(row, ['productionDate', 'startDate'])) ||
    toDate(row.njpReport?.createdAt) ||
    getBlendingDate(row)
  )
}

function getEncapsulationLot(row: BatchViewRow): string {
  return (
    row.njpReport?.lotNumber ||
    readTextField(row.njpReport, ['batchCode', 'njpCode']) ||
    readTextField(row.njpReport?.capsuleData, ['lotNumber', 'batchCode', 'njpCode']) ||
    row.batch.batchCode ||
    '-'
  )
}

function getEncapsulationCapsCount(row: BatchViewRow): string {
  const reportCount = Number(row.njpReport?.totalCapsulesFilledQty ?? getCapsuleDataValue(row, ['totalCapsulesFilledQty']))
  if (Number.isFinite(reportCount)) return reportCount.toLocaleString()
  return getTotalQty(row.batch)
}

function getEncapsulationStartTime(row: BatchViewRow): string {
  const startTime = getEncapsulationStartTimeValue(row)
  return formatBatchTime(startTime || getBlendingEndTime(row))
}

function getEncapsulationEndTime(row: BatchViewRow): string {
  const endTime = row.njpReport?.endTime || String(getCapsuleDataValue(row, ['endTime']) || '')
  return formatBatchTime(endTime)
}

function getAssemblyValue(row: BatchViewRow, keys: string[]): unknown {
  const report = row.assemblyReport
  const finalQuantities = report?.finalQuantities
  const sources = [
    report && typeof report === 'object' ? report as unknown as Record<string, unknown> : null,
    finalQuantities && typeof finalQuantities === 'object' ? finalQuantities as Record<string, unknown> : null
  ].filter((source): source is Record<string, unknown> => Boolean(source))

  for (const source of sources) {
    for (const key of keys) {
      const value = source[key]
      if (value !== null && value !== undefined && String(value).trim()) return value
    }
  }

  return undefined
}

function getQualityControlDate(row: BatchViewRow): Date | null {
  return (
    toDate(getAssemblyValue(row, ['qualityControlDate', 'qcDate'])) ||
    toDate(row.assemblyReport?.productionDate) ||
    toDate(row.assemblyReport?.createdAt) ||
    getEncapsulationDate(row)
  )
}

function getQualityControlStartTime(row: BatchViewRow): string {
  const startTime = String(getAssemblyValue(row, ['qualityControlStartTime', 'qcStartTime']) || '')
  return formatBatchTime(startTime || getEncapsulationEndTime(row))
}

function getQualityControlEndTime(row: BatchViewRow): string {
  const endTime = String(getAssemblyValue(row, [
    'qualityControlEndTime',
    'qcEndTime',
    'packagingStartTime',
    'startTime'
  ]) || '')
  return formatBatchTime(endTime)
}

function getPackagingDate(row: BatchViewRow): Date | null {
  return (
    toDate(getAssemblyValue(row, ['packagingDate', 'packageDate'])) ||
    toDate(row.assemblyReport?.productionDate) ||
    toDate(row.assemblyReport?.createdAt) ||
    getQualityControlDate(row)
  )
}

function getPackagingStartTime(row: BatchViewRow): string {
  const startTime = String(getAssemblyValue(row, ['packagingStartTime', 'startTime']) || '')
  return formatBatchTime(startTime || getQualityControlEndTime(row))
}

function getPackagingEndTime(row: BatchViewRow): string {
  const endTime = String(getAssemblyValue(row, ['packagingEndTime', 'endTime']) || '')
  return formatBatchTime(endTime)
}

function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-'
  return Math.round(value).toLocaleString()
}

function getFinishedDate(row: BatchViewRow): Date | null {
  const bottleFinishedGood = row.finishedGood?.category === 'bottle' ? row.finishedGood : null

  return (
    toDate(bottleFinishedGood?.updatedAt) ||
    toDate(bottleFinishedGood?.createdAt) ||
    toDate(row.assemblyReport?.productionDate) ||
    toDate(row.assemblyReport?.createdAt) ||
    getPackagingDate(row)
  )
}

function getCapsSize(row: BatchViewRow): string {
  const assemblyCaps = Number(row.assemblyReport?.capsulesPerBottle ?? getAssemblyValue(row, ['capsulesPerBottle']))
  if (Number.isFinite(assemblyCaps) && assemblyCaps > 0) return formatInteger(assemblyCaps)

  const batchCaps = Number(row.batch.unitsPerContainer)
  if (Number.isFinite(batchCaps) && batchCaps > 0) return formatInteger(batchCaps)

  return '-'
}

function getFinishedUnitCount(row: BatchViewRow): string {
  const bottleTotal = row.finishedGood?.category === 'bottle' ? Number(row.finishedGood.bottleTotal) : NaN
  if (Number.isFinite(bottleTotal) && bottleTotal >= 0) return formatInteger(bottleTotal)

  const assemblyBottles = Number(row.assemblyReport?.totalBottlesMade ?? getAssemblyValue(row, ['totalBottlesMade']))
  if (Number.isFinite(assemblyBottles) && assemblyBottles >= 0) return formatInteger(assemblyBottles)

  const containers = Number(row.batch.containerCount)
  if (Number.isFinite(containers) && containers >= 0) return formatInteger(containers)

  return '-'
}

function getFormulationStatus(row: BatchViewRow): string {
  return Array.isArray(row.product?.rm) && row.product.rm.length > 0 ? 'YES' : 'NO'
}

function getVendor(rawMaterial: RawMaterialWithVendor | null | undefined): string {
  return (
    rawMaterial?.vendorName ||
    rawMaterial?.vendor ||
    rawMaterial?.supplierName ||
    rawMaterial?.supplier ||
    '-'
  )
}

function getCoaLink(rawMaterial: RawMaterialWithVendor | null | undefined, source: unknown): string {
  return (
    readTextField(source, ['coaLink', 'coaUrl', 'certificateUrl', 'documentUrl', 'fileUrl', 'coaFile', 'coaName']) ||
    readTextField(rawMaterial, ['coaLink', 'coaUrl', 'certificateUrl', 'documentUrl', 'fileUrl', 'coaFile', 'coaName']) ||
    '-'
  )
}

function getMaterialComments(rawMaterial: RawMaterialWithVendor | null | undefined, source: unknown): string {
  return (
    readTextField(source, ['comments', 'comment', 'notes', 'remarks']) ||
    readTextField(rawMaterial, ['comments', 'comment', 'notes', 'remarks']) ||
    '-'
  )
}

function makeRawMaterialMaps(rawMaterials: RawMaterialWithVendor[]) {
  const byId = new Map<string, RawMaterialWithVendor>()
  const byCode = new Map<string, RawMaterialWithVendor>()
  const byName = new Map<string, RawMaterialWithVendor>()

  for (const rm of rawMaterials) {
    if (rm.id) byId.set(rm.id, rm)
    if (rm.code) byCode.set(rm.code.trim().toLowerCase(), rm)
    if (rm.name) byName.set(rm.name.trim().toLowerCase(), rm)
  }

  return { byId, byCode, byName }
}

function findRawMaterial(
  item: ProductRawMaterial | RMUsageItem,
  maps: ReturnType<typeof makeRawMaterialMaps>
): RawMaterialWithVendor | null {
  const rawMaterialId = 'rawMaterialId' in item ? item.rawMaterialId : ''
  const rawMaterialCode = 'rawMaterialCode' in item ? item.rawMaterialCode : ''
  const rawMaterialName = 'rawMaterialName' in item ? item.rawMaterialName : 'rawMaterial' in item ? item.rawMaterial : ''

  return (
    (rawMaterialId ? maps.byId.get(rawMaterialId) : null) ||
    (rawMaterialCode ? maps.byCode.get(rawMaterialCode.trim().toLowerCase()) : null) ||
    (rawMaterialName ? maps.byName.get(rawMaterialName.trim().toLowerCase()) : null) ||
    null
  )
}

function buildRawMaterials(
  batch: Batch,
  product: Product | null,
  mixingReport: MixingReport | null,
  rawMaterialMaps: ReturnType<typeof makeRawMaterialMaps>
): RawMaterialLine[] {
  const usage = [
    ...((mixingReport?.rmUsage || []) as RMUsageItem[]),
    ...((mixingReport?.nonMedUsage || []) as RMUsageItem[])
  ].filter(item => item.rawMaterialName || item.rawMaterialCode)

  if (usage.length > 0) {
    return usage.map((item, index) => {
      const rm = findRawMaterial(item, rawMaterialMaps)
      const qtyKg = Number(item.requiredQtyKgThisMix ?? item.usedQtyKg ?? item.requiredQtyKg)
      return {
        sr: index + 1,
        name: item.rawMaterialName || rm?.name || '-',
        code: item.rawMaterialCode || rm?.code || '-',
        qtyKg: Number.isFinite(qtyKg) ? qtyKg : null,
        vendor: getVendor(rm),
        coaLink: getCoaLink(rm, item),
        comments: getMaterialComments(rm, item)
      }
    })
  }

  if (Array.isArray(batch.inventoryUsage) && batch.inventoryUsage.length > 0) {
    return batch.inventoryUsage.map((item, index) => {
      const rm = findRawMaterial(item, rawMaterialMaps)
      const qtyKg = Number(item.requiredQtyKg ?? item.usedQtyKg)
      return {
        sr: index + 1,
        name: item.rawMaterialName || rm?.name || '-',
        code: item.rawMaterialCode || rm?.code || '-',
        qtyKg: Number.isFinite(qtyKg) ? qtyKg : null,
        vendor: getVendor(rm),
        coaLink: getCoaLink(rm, item),
        comments: getMaterialComments(rm, item)
      }
    })
  }

  if (!product?.rm?.length) return []

  const totalUnits = batch.totalUnits ?? calculateTotalUnits(batch.unitsPerContainer, batch.containerCount, true)
  return product.rm.map((item, index) => {
    const rm = findRawMaterial(item, rawMaterialMaps)
    const claimMg = item.labelClaimMgPerUnit || parseLabelClaimToMg(item.labelClaim) || 0
    const qtyKg = totalUnits && claimMg ? mgToKg(totalUnits * claimMg) : null

    return {
      sr: index + 1,
      name: rm?.name || item.rawMaterial || '-',
      code: rm?.code || item.rawMaterialCode || '-',
      qtyKg,
      vendor: getVendor(rm),
      coaLink: getCoaLink(rm, item),
      comments: getMaterialComments(rm, item)
    }
  })
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'batch-report'
}

function filterRowsByDate(rows: BatchViewRow[], range: FullReportRange): BatchViewRow[] {
  const from = range.from ? new Date(`${range.from}T00:00:00`) : null
  const to = range.to ? new Date(`${range.to}T23:59:59.999`) : null

  return rows.filter(row => {
    const date = row.productionDate
    if (!date) return false
    if (from && date < from) return false
    if (to && date > to) return false
    return true
  })
}

async function renderBatchReportPdf(options: {
  rows: BatchViewRow[]
  mode: 'view' | 'download'
  title: string
  fileName: string
  range?: FullReportRange
  includePreparationPage?: boolean
  previewWindow?: Window | null
}) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: options.includePreparationPage ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 32
  const contentWidth = pageWidth - margin * 2
  let y = 36

  function addPageIfNeeded(height: number) {
    if (y + height <= pageHeight - margin) return
    pdf.addPage()
    y = margin
  }

  function textLines(text: string, width: number) {
    return pdf.splitTextToSize(text || '-', width) as string[]
  }

  function drawLine(offset = 0) {
    pdf.setDrawColor(160, 160, 160)
    pdf.line(margin, y + offset, pageWidth - margin, y + offset)
  }

  function drawHeader() {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(15)
    pdf.setTextColor(17, 24, 39)
    pdf.text(options.title, margin, y)

    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(75, 85, 99)
    const rangeText = options.range
      ? `day / date: ${options.range.from || 'Start'} to ${options.range.to || 'End'}`
      : `day / date: ${formatReportDate(new Date())}`
    pdf.text(rangeText, pageWidth - margin, y, { align: 'right' })
    y += 18
    drawLine()
    y += 18

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(17, 24, 39)
    pdf.text('#', margin, y)
    pdf.text('Product Name', margin + 24, y)
    pdf.text('Batch No.', margin + 205, y)
    pdf.text('PD', margin + 282, y)
    pdf.text('ED', margin + 337, y)
    pdf.text('Time Start', margin + 392, y)
    pdf.text('Time End', margin + 456, y)
    pdf.text('ST', margin + 520, y)
    y += 7
    drawLine()
    y += 15
  }

  function drawRawMaterialTable(lines: RawMaterialLine[]) {
    const col = {
      sr: margin + 18,
      name: margin + 70,
      code: margin + 245,
      qty: margin + 345,
      vendor: margin + 450
    }

    addPageIfNeeded(42)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(47, 111, 88)
    pdf.text('Sr', col.sr, y)
    pdf.text('Raw Material', col.name, y)
    pdf.text('RM-Code', col.code, y)
    pdf.text('QTY(kg)', col.qty, y)
    pdf.text('Vendor', col.vendor, y)
    y += 8
    drawLine()
    y += 13

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(17, 24, 39)

    if (lines.length === 0) {
      pdf.text('-', col.name, y)
      y += 20
      return
    }

    for (const line of lines) {
      const nameLines = textLines(line.name, 150)
      const rowHeight = Math.max(18, nameLines.length * 10 + 6)
      addPageIfNeeded(rowHeight + 6)

      pdf.text(String(line.sr), col.sr, y)
      pdf.text(nameLines, col.name, y)
      pdf.text(textLines(line.code, 82), col.code, y)
      pdf.text(formatNumber(line.qtyKg), col.qty, y)
      pdf.text(textLines(line.vendor, 84), col.vendor, y)
      y += rowHeight
    }
  }

  function drawReceivingPage() {
    const receivingPageWidth = pdf.internal.pageSize.getWidth()
    const receivingPageHeight = pdf.internal.pageSize.getHeight()
    const receivingMargin = 20
    const headingHeight = 26
    const headerHeight = 22
    const green = { r: 47, g: 116, b: 31 }
    const lightGreen = { r: 106, g: 168, b: 79 }
    const columns = [
      { key: 'sr', label: 'Sr', width: 28, align: 'right' as const, style: 'bolditalic' as const },
      { key: 'product', label: 'Product Names', width: 118, align: 'left' as const, style: 'bolditalic' as const },
      { key: 'date', label: 'Production Dates', width: 88, align: 'center' as const, style: 'bolditalic' as const },
      { key: 'material', label: 'Raw Materials', width: 212, align: 'left' as const, style: 'normal' as const },
      { key: 'lot', label: 'Lot no (PHF)', width: 78, align: 'left' as const, style: 'bolditalic' as const },
      { key: 'qty', label: 'Quantity in Kg', width: 82, align: 'right' as const, style: 'bold' as const },
      { key: 'coa', label: 'COA Link', width: 154, align: 'left' as const, style: 'normal' as const },
      { key: 'comments', label: 'Comments', width: 42, align: 'left' as const, style: 'normal' as const }
    ]
    const tableWidth = columns.reduce((sum, col) => sum + col.width, 0)
    const tableX = (receivingPageWidth - tableWidth) / 2
    let receivingY = 28

    function splitCellText(text: string, width: number) {
      const value = String(text || '')
      return value ? pdf.splitTextToSize(value, width - 8) as string[] : ['']
    }

    function drawCellText(
      lines: string[],
      x: number,
      width: number,
      cellY: number,
      height: number,
      align: 'left' | 'center' | 'right',
      style: 'normal' | 'bold' | 'bolditalic' = 'normal'
    ) {
      const padding = 5
      const textX = align === 'left'
        ? x + padding
        : align === 'right'
        ? x + width - padding
        : x + width / 2
      const startY = cellY + Math.max(11, (height - lines.length * 8) / 2 + 8)
      pdf.setFont('helvetica', style)
      pdf.text(lines, textX, startY, { align })
    }

    function drawReceivingHeader() {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(18)
      pdf.setTextColor(17, 24, 39)
      pdf.text('Full Batch Report', receivingPageWidth / 2, receivingY, { align: 'center' })
      receivingY += 14

      if (options.range) {
        const rangeText = `day / date: ${options.range.from || 'Start'} to ${options.range.to || 'End'}`
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)
        pdf.setTextColor(75, 85, 99)
        pdf.text(rangeText, receivingPageWidth / 2, receivingY, { align: 'center' })
        receivingY += 12
      }

      pdf.setLineWidth(1)
      pdf.setDrawColor(17, 24, 39)
      pdf.setFillColor(green.r, green.g, green.b)
      pdf.rect(tableX, receivingY, tableWidth, headingHeight, 'FD')

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(18)
      pdf.setTextColor(255, 255, 255)
      pdf.text('RECEIVING', receivingPageWidth / 2, receivingY + 19, { align: 'center' })
      receivingY += headingHeight

      pdf.setFontSize(9)
      let x = tableX
      for (const col of columns) {
        pdf.setFillColor(lightGreen.r, lightGreen.g, lightGreen.b)
        pdf.rect(x, receivingY, col.width, headerHeight, 'FD')
        drawCellText([col.label], x, col.width, receivingY, headerHeight, 'center', 'bold')
        x += col.width
      }
      receivingY += headerHeight
    }

    function addReceivingPageIfNeeded(rowHeight: number) {
      if (receivingY + rowHeight <= receivingPageHeight - receivingMargin) return
      pdf.addPage('a4', 'landscape')
      receivingY = 28
      drawReceivingHeader()
    }

    drawReceivingHeader()

    if (options.rows.length === 0) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setTextColor(17, 24, 39)
      pdf.text('No batches found for this date range.', tableX, receivingY + 20)
      return
    }

    pdf.setFontSize(8)
    pdf.setTextColor(17, 24, 39)

    options.rows.forEach((row, batchIndex) => {
      const rawLines = row.rawMaterials.length > 0
        ? row.rawMaterials
        : [{
          sr: 1,
          name: '-',
          code: '-',
          qtyKg: null,
          vendor: '-',
          coaLink: '-',
          comments: '-'
        }]

      rawLines.forEach((line, lineIndex) => {
        const showBatchValues = lineIndex === 0
        const values = {
          sr: showBatchValues ? String(batchIndex + 1) : '',
          product: showBatchValues ? row.batch.productName || row.product?.name || '-' : '',
          date: showBatchValues ? formatPreparationDate(getPreparationDate(row)) : '',
          material: line.name === '-' ? '' : line.name,
          lot: showBatchValues ? row.batch.batchCode || '-' : '',
          qty: line.qtyKg !== null ? formatNumber(line.qtyKg, 8) : '',
          coa: line.coaLink === '-' ? '' : line.coaLink,
          comments: line.comments === '-' ? '' : line.comments
        }
        const cellLines = columns.map(col => splitCellText(values[col.key as keyof typeof values], col.width))
        const maxLines = Math.max(...cellLines.map(lines => lines.length))
        const rowHeight = Math.max(20, maxLines * 8 + 8)

        addReceivingPageIfNeeded(rowHeight)

        let x = tableX
        columns.forEach((col, colIndex) => {
          pdf.setDrawColor(209, 213, 219)
          pdf.setFillColor(255, 255, 255)
          pdf.rect(x, receivingY, col.width, rowHeight, 'D')
          pdf.setTextColor(17, 24, 39)
          drawCellText(cellLines[colIndex], x, col.width, receivingY, rowHeight, col.align, col.style)
          x += col.width
        })

        receivingY += rowHeight
      })
    })
  }

  function drawPreparationPage() {
    pdf.addPage('a4', 'landscape')

    const prepPageWidth = pdf.internal.pageSize.getWidth()
    const prepPageHeight = pdf.internal.pageSize.getHeight()
    const prepMargin = 28
    const headingHeight = 30
    const headerHeight = 22
    const green = { r: 47, g: 116, b: 31 }
    const columns = [
      { key: 'sr', label: 'Sr', width: 36, align: 'center' as const },
      { key: 'date', label: 'PREPARATION DATE', width: 96, align: 'center' as const },
      { key: 'product', label: 'Product', width: 188, align: 'left' as const },
      { key: 'lot', label: 'Lot Number', width: 82, align: 'right' as const },
      { key: 'npn', label: 'NPN', width: 78, align: 'right' as const },
      { key: 'count', label: 'Caps Count / 5g scoop', width: 128, align: 'right' as const },
      { key: 'start', label: 'Time Start', width: 82, align: 'right' as const },
      { key: 'end', label: 'Time End', width: 82, align: 'right' as const }
    ]
    const tableWidth = columns.reduce((sum, col) => sum + col.width, 0)
    const tableX = (prepPageWidth - tableWidth) / 2
    let prepY = 34

    function drawCellText(text: string | string[], x: number, width: number, cellY: number, height: number, align: 'left' | 'center' | 'right') {
      const padding = 6
      const textX = align === 'left'
        ? x + padding
        : align === 'right'
        ? x + width - padding
        : x + width / 2
      const lines = Array.isArray(text) ? text : [text]
      const startY = cellY + Math.max(12, (height - lines.length * 9) / 2 + 8)
      pdf.text(lines, textX, startY, { align })
    }

    function drawPreparationHeader() {
      pdf.setLineWidth(1)
      pdf.setDrawColor(17, 24, 39)
      pdf.setFillColor(green.r, green.g, green.b)
      pdf.rect(tableX, prepY, tableWidth, headingHeight, 'FD')

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(20)
      pdf.setTextColor(255, 255, 255)
      pdf.text('PREPARATION', prepPageWidth / 2, prepY + 21, { align: 'center' })
      prepY += headingHeight

      pdf.setFontSize(9)
      let x = tableX
      for (const col of columns) {
        pdf.setFillColor(106, 168, 79)
        pdf.rect(x, prepY, col.width, headerHeight, 'FD')
        drawCellText(col.label, x, col.width, prepY, headerHeight, 'center')
        x += col.width
      }
      prepY += headerHeight
    }

    function addPreparationPageIfNeeded(rowHeight: number) {
      if (prepY + rowHeight <= prepPageHeight - prepMargin) return
      pdf.addPage('a4', 'landscape')
      prepY = 34
      drawPreparationHeader()
    }

    drawPreparationHeader()

    if (options.rows.length === 0) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setTextColor(17, 24, 39)
      pdf.text('No batches found for this date range.', tableX, prepY + 20)
      return
    }

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(17, 24, 39)

    options.rows.forEach((row, index) => {
      const values = {
        sr: String(index + 1),
        date: formatPreparationDate(getPreparationDate(row)),
        product: row.batch.productName || row.product?.name || '-',
        lot: row.batch.batchCode || '-',
        npn: getNpn(row),
        count: getTotalQty(row.batch),
        start: formatBatchTime(row.batch.startTime),
        end: formatBatchTime(row.batch.endTime)
      }
      const productLines = textLines(values.product, columns[2].width - 12)
      const rowHeight = Math.max(24, productLines.length * 9 + 12)

      addPreparationPageIfNeeded(rowHeight)

      let x = tableX
      for (const col of columns) {
        const cellText = col.key === 'product'
          ? productLines
          : values[col.key as keyof typeof values]

        pdf.setDrawColor(17, 24, 39)
        pdf.setFillColor(255, 255, 255)
        pdf.rect(x, prepY, col.width, rowHeight, 'D')
        drawCellText(cellText, x, col.width, prepY, rowHeight, col.align)
        x += col.width
      }

      prepY += rowHeight
    })
  }

  function drawBlendingPage() {
    pdf.addPage('a4', 'landscape')

    const blendPageWidth = pdf.internal.pageSize.getWidth()
    const blendPageHeight = pdf.internal.pageSize.getHeight()
    const blendMargin = 28
    const headingHeight = 30
    const headerHeight = 22
    const green = { r: 47, g: 116, b: 31 }
    const columns = [
      { key: 'date', label: 'BLENDING DATE', width: 112, align: 'center' as const },
      { key: 'product', label: 'PRODUCT NAME', width: 188, align: 'left' as const },
      { key: 'lot', label: 'LOT NUMBER', width: 86, align: 'right' as const },
      { key: 'npn', label: 'NPN', width: 150, align: 'right' as const },
      { key: 'totalKg', label: 'TOTAL KG AT THE END', width: 124, align: 'right' as const },
      { key: 'start', label: 'TIME START', width: 82, align: 'right' as const },
      { key: 'end', label: 'TIME END', width: 82, align: 'right' as const }
    ]
    const tableWidth = columns.reduce((sum, col) => sum + col.width, 0)
    const tableX = (blendPageWidth - tableWidth) / 2
    let blendY = 34

    function drawCellText(text: string | string[], x: number, width: number, cellY: number, height: number, align: 'left' | 'center' | 'right') {
      const padding = 6
      const textX = align === 'left'
        ? x + padding
        : align === 'right'
        ? x + width - padding
        : x + width / 2
      const lines = Array.isArray(text) ? text : [text]
      const startY = cellY + Math.max(12, (height - lines.length * 9) / 2 + 8)
      pdf.text(lines, textX, startY, { align })
    }

    function drawBlendingHeader() {
      pdf.setLineWidth(1)
      pdf.setDrawColor(17, 24, 39)
      pdf.setFillColor(green.r, green.g, green.b)
      pdf.rect(tableX, blendY, tableWidth, headingHeight, 'FD')

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(20)
      pdf.setTextColor(255, 255, 255)
      pdf.text('BLENDING', blendPageWidth / 2, blendY + 21, { align: 'center' })
      blendY += headingHeight

      pdf.setFontSize(9)
      let x = tableX
      for (const col of columns) {
        pdf.setFillColor(106, 168, 79)
        pdf.rect(x, blendY, col.width, headerHeight, 'FD')
        drawCellText(col.label, x, col.width, blendY, headerHeight, 'center')
        x += col.width
      }
      blendY += headerHeight
    }

    function addBlendingPageIfNeeded(rowHeight: number) {
      if (blendY + rowHeight <= blendPageHeight - blendMargin) return
      pdf.addPage('a4', 'landscape')
      blendY = 34
      drawBlendingHeader()
    }

    drawBlendingHeader()

    if (options.rows.length === 0) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setTextColor(17, 24, 39)
      pdf.text('No batches found for this date range.', tableX, blendY + 20)
      return
    }

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(17, 24, 39)

    options.rows.forEach(row => {
      const values = {
        date: formatPreparationDate(getBlendingDate(row)),
        product: row.batch.productName || row.product?.name || '-',
        lot: row.batch.batchCode || '-',
        npn: getNpn(row),
        totalKg: formatNumber(getBlendingTotalKg(row)),
        start: getBlendingStartTime(row),
        end: getBlendingEndTime(row)
      }
      const productLines = textLines(values.product, columns[1].width - 12)
      const rowHeight = Math.max(24, productLines.length * 9 + 12)

      addBlendingPageIfNeeded(rowHeight)

      let x = tableX
      for (const col of columns) {
        const cellText = col.key === 'product'
          ? productLines
          : values[col.key as keyof typeof values]

        pdf.setDrawColor(17, 24, 39)
        pdf.setFillColor(255, 255, 255)
        pdf.rect(x, blendY, col.width, rowHeight, 'D')
        drawCellText(cellText, x, col.width, blendY, rowHeight, col.align)
        x += col.width
      }

      blendY += rowHeight
    })
  }

  function drawEncapsulationPage() {
    pdf.addPage('a4', 'landscape')

    const encPageWidth = pdf.internal.pageSize.getWidth()
    const encPageHeight = pdf.internal.pageSize.getHeight()
    const encMargin = 24
    const headingHeight = 30
    const headerHeight = 30
    const green = { r: 47, g: 116, b: 31 }
    const columns = [
      { key: 'date', label: ['ENCAPSULATION', 'DATE'], width: 82, align: 'center' as const },
      { key: 'product', label: 'PRODUCT NAME', width: 154, align: 'left' as const },
      { key: 'lot', label: 'LOT NUMBER', width: 96, align: 'right' as const },
      { key: 'npn', label: 'NPN', width: 96, align: 'right' as const },
      { key: 'scoop', label: ['Caps Count / 5g', 'scoop'], width: 86, align: 'right' as const },
      { key: 'start', label: 'TIME START', width: 96, align: 'right' as const },
      { key: 'end', label: 'TIME END', width: 96, align: 'right' as const },
      { key: 'caps', label: 'CAPS COUNT', width: 86, align: 'right' as const }
    ]
    const tableWidth = columns.reduce((sum, col) => sum + col.width, 0)
    const tableX = (encPageWidth - tableWidth) / 2
    let encY = 34

    function drawCellText(text: string | string[], x: number, width: number, cellY: number, height: number, align: 'left' | 'center' | 'right') {
      const padding = 5
      const textX = align === 'left'
        ? x + padding
        : align === 'right'
        ? x + width - padding
        : x + width / 2
      const lines = Array.isArray(text) ? text : [text]
      const startY = cellY + Math.max(12, (height - lines.length * 9) / 2 + 8)
      pdf.text(lines, textX, startY, { align })
    }

    function drawEncapsulationHeader() {
      pdf.setLineWidth(1)
      pdf.setDrawColor(17, 24, 39)
      pdf.setFillColor(green.r, green.g, green.b)
      pdf.rect(tableX, encY, tableWidth, headingHeight, 'FD')

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(20)
      pdf.setTextColor(255, 255, 255)
      pdf.text('ENCAPSULATION', encPageWidth / 2, encY + 21, { align: 'center' })
      encY += headingHeight

      pdf.setFontSize(9)
      let x = tableX
      for (const col of columns) {
        pdf.setFillColor(106, 168, 79)
        pdf.rect(x, encY, col.width, headerHeight, 'FD')
        drawCellText(col.label, x, col.width, encY, headerHeight, 'center')
        x += col.width
      }
      encY += headerHeight
    }

    function addEncapsulationPageIfNeeded(rowHeight: number) {
      if (encY + rowHeight <= encPageHeight - encMargin) return
      pdf.addPage('a4', 'landscape')
      encY = 34
      drawEncapsulationHeader()
    }

    drawEncapsulationHeader()

    if (options.rows.length === 0) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setTextColor(17, 24, 39)
      pdf.text('No batches found for this date range.', tableX, encY + 20)
      return
    }

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(17, 24, 39)

    options.rows.forEach(row => {
      const capsCount = getEncapsulationCapsCount(row)
      const values = {
        date: formatPreparationDate(getEncapsulationDate(row)),
        product: row.batch.productName || row.product?.name || '-',
        lot: getEncapsulationLot(row),
        npn: getNpn(row),
        scoop: getTotalQty(row.batch),
        start: getEncapsulationStartTime(row),
        end: getEncapsulationEndTime(row),
        caps: capsCount
      }
      const productLines = textLines(values.product, columns[1].width - 10)
      const rowHeight = Math.max(24, productLines.length * 9 + 12)

      addEncapsulationPageIfNeeded(rowHeight)

      let x = tableX
      for (const col of columns) {
        const cellText = col.key === 'product'
          ? productLines
          : values[col.key as keyof typeof values]

        pdf.setDrawColor(17, 24, 39)
        pdf.setFillColor(255, 255, 255)
        pdf.rect(x, encY, col.width, rowHeight, 'D')
        drawCellText(cellText, x, col.width, encY, rowHeight, col.align)
        x += col.width
      }

      encY += rowHeight
    })
  }

  function drawQualityControlPage() {
    pdf.addPage('a4', 'landscape')

    const qcPageWidth = pdf.internal.pageSize.getWidth()
    const qcPageHeight = pdf.internal.pageSize.getHeight()
    const qcMargin = 24
    const headingHeight = 30
    const headerHeight = 44
    const green = { r: 47, g: 116, b: 31 }
    const columns = [
      { key: 'date', label: ['QUALITY', 'CONTROL', 'DATE'], width: 86, align: 'center' as const },
      { key: 'sr', label: 'Sr', width: 44, align: 'center' as const },
      { key: 'product', label: 'Product', width: 144, align: 'left' as const },
      { key: 'lot', label: 'Lot Number', width: 86, align: 'right' as const },
      { key: 'npn', label: 'NPN', width: 96, align: 'right' as const },
      { key: 'count', label: 'Caps Count / 5g scoop', width: 128, align: 'right' as const },
      { key: 'start', label: 'Time Start', width: 132, align: 'right' as const },
      { key: 'end', label: 'Time End', width: 106, align: 'right' as const }
    ]
    const tableWidth = columns.reduce((sum, col) => sum + col.width, 0)
    const tableX = (qcPageWidth - tableWidth) / 2
    let qcY = 34

    function drawCellText(text: string | string[], x: number, width: number, cellY: number, height: number, align: 'left' | 'center' | 'right') {
      const padding = 5
      const textX = align === 'left'
        ? x + padding
        : align === 'right'
        ? x + width - padding
        : x + width / 2
      const lines = Array.isArray(text) ? text : [text]
      const startY = cellY + Math.max(12, (height - lines.length * 9) / 2 + 8)
      pdf.text(lines, textX, startY, { align })
    }

    function drawQualityControlHeader() {
      pdf.setLineWidth(1)
      pdf.setDrawColor(17, 24, 39)
      pdf.setFillColor(green.r, green.g, green.b)
      pdf.rect(tableX, qcY, tableWidth, headingHeight, 'FD')

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(20)
      pdf.setTextColor(255, 255, 255)
      pdf.text('QUALITY CONTROL', qcPageWidth / 2, qcY + 21, { align: 'center' })
      qcY += headingHeight

      pdf.setFontSize(9)
      let x = tableX
      for (const col of columns) {
        pdf.setFillColor(106, 168, 79)
        pdf.rect(x, qcY, col.width, headerHeight, 'FD')
        drawCellText(col.label, x, col.width, qcY, headerHeight, 'center')
        x += col.width
      }
      qcY += headerHeight
    }

    function addQualityControlPageIfNeeded(rowHeight: number) {
      if (qcY + rowHeight <= qcPageHeight - qcMargin) return
      pdf.addPage('a4', 'landscape')
      qcY = 34
      drawQualityControlHeader()
    }

    drawQualityControlHeader()

    if (options.rows.length === 0) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setTextColor(17, 24, 39)
      pdf.text('No batches found for this date range.', tableX, qcY + 20)
      return
    }

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(17, 24, 39)

    options.rows.forEach((row, index) => {
      const values = {
        date: formatPreparationDate(getQualityControlDate(row)),
        sr: String(index + 1),
        product: row.batch.productName || row.product?.name || '-',
        lot: getEncapsulationLot(row),
        npn: getNpn(row),
        count: getTotalQty(row.batch),
        start: getQualityControlStartTime(row),
        end: getQualityControlEndTime(row)
      }
      const productLines = textLines(values.product, columns[2].width - 10)
      const rowHeight = Math.max(24, productLines.length * 9 + 12)

      addQualityControlPageIfNeeded(rowHeight)

      let x = tableX
      for (const col of columns) {
        const cellText = col.key === 'product'
          ? productLines
          : values[col.key as keyof typeof values]

        pdf.setDrawColor(17, 24, 39)
        pdf.setFillColor(255, 255, 255)
        pdf.rect(x, qcY, col.width, rowHeight, 'D')
        drawCellText(cellText, x, col.width, qcY, rowHeight, col.align)
        x += col.width
      }

      qcY += rowHeight
    })
  }

  function drawPackagingPage() {
    pdf.addPage('a4', 'landscape')

    const packPageWidth = pdf.internal.pageSize.getWidth()
    const packPageHeight = pdf.internal.pageSize.getHeight()
    const packMargin = 28
    const headingHeight = 30
    const headerHeight = 22
    const green = { r: 47, g: 116, b: 31 }
    const columns = [
      { key: 'date', label: 'PACKAGE DATE', width: 112, align: 'center' as const },
      { key: 'product', label: 'PRODUCT NAME', width: 174, align: 'left' as const },
      { key: 'lot', label: 'LOT NUMBER', width: 96, align: 'right' as const },
      { key: 'count', label: 'CAPS COUNT / 5g scoop', width: 154, align: 'right' as const },
      { key: 'start', label: 'TIME START', width: 112, align: 'right' as const },
      { key: 'end', label: 'TIME END', width: 112, align: 'right' as const }
    ]
    const tableWidth = columns.reduce((sum, col) => sum + col.width, 0)
    const tableX = (packPageWidth - tableWidth) / 2
    let packY = 34

    function drawCellText(text: string | string[], x: number, width: number, cellY: number, height: number, align: 'left' | 'center' | 'right') {
      const padding = 6
      const textX = align === 'left'
        ? x + padding
        : align === 'right'
        ? x + width - padding
        : x + width / 2
      const lines = Array.isArray(text) ? text : [text]
      const startY = cellY + Math.max(12, (height - lines.length * 9) / 2 + 8)
      pdf.text(lines, textX, startY, { align })
    }

    function drawPackagingHeader() {
      pdf.setLineWidth(1)
      pdf.setDrawColor(17, 24, 39)
      pdf.setFillColor(green.r, green.g, green.b)
      pdf.rect(tableX, packY, tableWidth, headingHeight, 'FD')

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(18)
      pdf.setTextColor(255, 255, 255)
      pdf.text('PACKAGING ASEMBLY LINE', packPageWidth / 2, packY + 21, { align: 'center' })
      packY += headingHeight

      pdf.setFontSize(9)
      let x = tableX
      for (const col of columns) {
        pdf.setFillColor(106, 168, 79)
        pdf.rect(x, packY, col.width, headerHeight, 'FD')
        drawCellText(col.label, x, col.width, packY, headerHeight, 'center')
        x += col.width
      }
      packY += headerHeight
    }

    function addPackagingPageIfNeeded(rowHeight: number) {
      if (packY + rowHeight <= packPageHeight - packMargin) return
      pdf.addPage('a4', 'landscape')
      packY = 34
      drawPackagingHeader()
    }

    drawPackagingHeader()

    if (options.rows.length === 0) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setTextColor(17, 24, 39)
      pdf.text('No batches found for this date range.', tableX, packY + 20)
      return
    }

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(17, 24, 39)

    options.rows.forEach(row => {
      const values = {
        date: formatPreparationDate(getPackagingDate(row)),
        product: row.batch.productName || row.assemblyReport?.productName || row.product?.name || '-',
        lot: row.batch.batchCode || '-',
        count: getTotalQty(row.batch),
        start: getPackagingStartTime(row),
        end: getPackagingEndTime(row)
      }
      const productLines = textLines(values.product, columns[1].width - 12)
      const rowHeight = Math.max(24, productLines.length * 9 + 12)

      addPackagingPageIfNeeded(rowHeight)

      let x = tableX
      for (const col of columns) {
        const cellText = col.key === 'product'
          ? productLines
          : values[col.key as keyof typeof values]

        pdf.setDrawColor(17, 24, 39)
        pdf.setFillColor(255, 255, 255)
        pdf.rect(x, packY, col.width, rowHeight, 'D')
        drawCellText(cellText, x, col.width, packY, rowHeight, col.align)
        x += col.width
      }

      packY += rowHeight
    })
  }

  function drawFinishedProductPage() {
    pdf.addPage('a4', 'landscape')

    const finishedPageWidth = pdf.internal.pageSize.getWidth()
    const finishedPageHeight = pdf.internal.pageSize.getHeight()
    const finishedMargin = 28
    const headingHeight = 30
    const headerHeight = 22
    const green = { r: 47, g: 116, b: 31 }
    const columns = [
      { key: 'sr', label: 'S#', width: 54, align: 'center' as const },
      { key: 'date', label: 'FINSIHED DATE', width: 88, align: 'center' as const },
      { key: 'product', label: 'PRODUCT NAME', width: 160, align: 'left' as const },
      { key: 'lot', label: 'LOT NUMBER', width: 88, align: 'right' as const },
      { key: 'npn', label: 'NPN', width: 88, align: 'right' as const },
      { key: 'capsSize', label: 'Caps Size', width: 118, align: 'right' as const },
      { key: 'units', label: 'NUMBER OF UNITS', width: 110, align: 'right' as const },
      { key: 'formula', label: 'FORMULATION', width: 84, align: 'center' as const }
    ]
    const tableWidth = columns.reduce((sum, col) => sum + col.width, 0)
    const tableX = (finishedPageWidth - tableWidth) / 2
    let finishedY = 34

    function drawCellText(text: string | string[], x: number, width: number, cellY: number, height: number, align: 'left' | 'center' | 'right') {
      const padding = 5
      const textX = align === 'left'
        ? x + padding
        : align === 'right'
        ? x + width - padding
        : x + width / 2
      const lines = Array.isArray(text) ? text : [text]
      const startY = cellY + Math.max(12, (height - lines.length * 9) / 2 + 8)
      pdf.text(lines, textX, startY, { align })
    }

    function drawFinishedHeader() {
      pdf.setLineWidth(1)
      pdf.setDrawColor(17, 24, 39)
      pdf.setFillColor(green.r, green.g, green.b)
      pdf.rect(tableX, finishedY, tableWidth, headingHeight, 'FD')

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(20)
      pdf.setTextColor(255, 255, 255)
      pdf.text('FINISHED PRODUCT LOG', finishedPageWidth / 2, finishedY + 21, { align: 'center' })
      finishedY += headingHeight

      pdf.setFontSize(9)
      let x = tableX
      for (const col of columns) {
        pdf.setFillColor(106, 168, 79)
        pdf.rect(x, finishedY, col.width, headerHeight, 'FD')
        drawCellText(col.label, x, col.width, finishedY, headerHeight, 'center')
        x += col.width
      }
      finishedY += headerHeight
    }

    function addFinishedPageIfNeeded(rowHeight: number) {
      if (finishedY + rowHeight <= finishedPageHeight - finishedMargin) return
      pdf.addPage('a4', 'landscape')
      finishedY = 34
      drawFinishedHeader()
    }

    drawFinishedHeader()

    if (options.rows.length === 0) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setTextColor(17, 24, 39)
      pdf.text('No batches found for this date range.', tableX, finishedY + 20)
      return
    }

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(17, 24, 39)

    options.rows.forEach((row, index) => {
      const values = {
        sr: String(index + 1),
        date: formatPreparationDate(getFinishedDate(row)),
        product: row.finishedGood?.productName || row.batch.productName || row.product?.name || '-',
        lot: row.finishedGood?.batchCode || row.batch.batchCode || '-',
        npn: getNpn(row),
        capsSize: getCapsSize(row),
        units: getFinishedUnitCount(row),
        formula: getFormulationStatus(row)
      }
      const productLines = textLines(values.product, columns[2].width - 10)
      const rowHeight = Math.max(24, productLines.length * 9 + 12)

      addFinishedPageIfNeeded(rowHeight)

      let x = tableX
      for (const col of columns) {
        const cellText = col.key === 'product'
          ? productLines
          : values[col.key as keyof typeof values]

        pdf.setDrawColor(17, 24, 39)
        pdf.setFillColor(255, 255, 255)
        pdf.rect(x, finishedY, col.width, rowHeight, 'D')
        drawCellText(cellText, x, col.width, finishedY, rowHeight, col.align)
        x += col.width
      }

      finishedY += rowHeight
    })
  }

  if (options.includePreparationPage) {
    drawReceivingPage()
    drawPreparationPage()
    drawBlendingPage()
    drawEncapsulationPage()
    drawQualityControlPage()
    drawPackagingPage()
    drawFinishedProductPage()
  } else {
    drawHeader()

    if (options.rows.length === 0) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.text('No batches found for this date range.', margin, y)
    }

    options.rows.forEach((row, index) => {
      addPageIfNeeded(92)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.setTextColor(17, 24, 39)

      const productLines = textLines(row.batch.productName || row.product?.name || '-', 160)
      const summaryHeight = Math.max(22, productLines.length * 11 + 4)

      pdf.text(String(index + 1), margin, y)
      pdf.text(productLines, margin + 24, y)
      pdf.text(row.batch.batchCode || '-', margin + 205, y)
      pdf.text(formatReportDate(row.productionDate), margin + 282, y)
      pdf.text(formatExpiry(row.expiryDate), margin + 337, y)
      pdf.text(formatBatchTime(row.batch.startTime), margin + 392, y)
      pdf.text(formatBatchTime(row.batch.endTime), margin + 456, y)
      pdf.text(formatPdfStatus(row.status), margin + 520, y)
      y += summaryHeight
      drawRawMaterialTable(row.rawMaterials)
      y += 14
      pdf.setDrawColor(209, 213, 219)
      pdf.line(margin, y - 6, margin + contentWidth, y - 6)
      y += 6
    })
  }

  if (options.mode === 'view') {
    const blobUrl = String(pdf.output('bloburl'))
    if (options.previewWindow) {
      options.previewWindow.location.href = blobUrl
    } else {
      window.open(blobUrl, '_blank', 'noopener,noreferrer')
    }
    return
  }

  pdf.save(`${sanitizeFileName(options.fileName)}.pdf`)
}

export default function ViewBatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rawMaterials, setRawMaterials] = useState<RawMaterialWithVendor[]>([])
  const [mixingReports, setMixingReports] = useState<MixingReport[]>([])
  const [njpReports, setNjpReports] = useState<NJPReport[]>([])
  const [assemblyReports, setAssemblyReports] = useState<AssemblyReportView[]>([])
  const [finishedGoods, setFinishedGoods] = useState<FinishedGood[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBrandId, setSelectedBrandId] = useState('')
  const [dateModalOpen, setDateModalOpen] = useState(false)
  const [dateRange, setDateRange] = useState<FullReportRange>({ from: '', to: '' })
  const [loading, setLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(false)
  const { showToast } = useToast()

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      await initSupabase()

      const [batchList, brandList, productList, rawMaterialList, mixingList, njpList, assemblyList, finishedGoodList] = await Promise.all([
        fetchBatches(),
        fetchBrands<Brand>({ activeOnly: true }),
        fetchProducts(),
        fetchRawMaterials<RawMaterialWithVendor>(),
        fetchMixingReports(),
        fetchNJPReports(),
        fetchAssemblyReports(),
        fetchFinishedGoods()
      ])

      setBatches(batchList as Batch[])
      setBrands(brandList)
      setProducts(productList as Product[])
      setRawMaterials(rawMaterialList)
      setMixingReports(mixingList as MixingReport[])
      setNjpReports(njpList as NJPReport[])
      setAssemblyReports(assemblyList as AssemblyReportView[])
      setFinishedGoods(finishedGoodList as FinishedGood[])
    } catch (error) {
      console.error('Failed to load view batches data:', error)
      showToast({ message: 'Failed to load view batches data', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo<BatchViewRow[]>(() => {
    const productsById = new Map(products.map(product => [product.id, product]))
    const mixingByBatchId = new Map(mixingReports.map(report => [report.batchId, report]))
    const njpByBatchId = new Map(njpReports.map(report => [report.batchId, report]))
    const assemblyByBatchId = new Map(assemblyReports.map(report => [report.batchId, report]))
    const finishedGoodByBatchId = new Map(finishedGoods.map(item => [item.batchId, item]))
    const rawMaterialMaps = makeRawMaterialMaps(rawMaterials)

    return batches.map(batch => {
      const product = productsById.get(batch.productId) || null
      const mixingReport = mixingByBatchId.get(batch.id) || null
      const njpReport = njpByBatchId.get(batch.id) || null
      const assemblyReport = assemblyByBatchId.get(batch.id) || null
      const finishedGood = finishedGoodByBatchId.get(batch.id) || null
      const status = deriveBatchStatus({
        hasMixing: isStageCompleted('mixing', batch, mixingReport),
        hasNJP: isStageCompleted('njp', batch, njpReport),
        hasAssembly: isStageCompleted('assembly', batch, assemblyReport),
        status: batch.status
      })

      return {
        batch,
        product,
        mixingReport,
        njpReport,
        assemblyReport,
        finishedGood,
        productionDate: toDate(assemblyReport?.productionDate) || toDate(batch.createdAt),
        expiryDate: toDate(assemblyReport?.expiryDate),
        status: getViewStatus(status),
        rawMaterials: buildRawMaterials(batch, product, mixingReport, rawMaterialMaps)
      }
    })
  }, [assemblyReports, batches, finishedGoods, mixingReports, njpReports, products, rawMaterials])

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    return rows.filter(row => {
      if (selectedBrandId && row.batch.brandId !== selectedBrandId) return false
      if (!query) return true
      return (
        row.batch.productName.toLowerCase().includes(query) ||
        row.batch.batchCode.toLowerCase().includes(query) ||
        row.batch.brandName.toLowerCase().includes(query)
      )
    })
  }, [rows, searchTerm, selectedBrandId])

  const selectedBrandName = brands.find(brand => brand.id === selectedBrandId)?.name
  const hasFilters = Boolean(searchTerm.trim() || selectedBrandId)

  async function handleReport(
    mode: 'view' | 'download',
    reportRows: BatchViewRow[],
    title: string,
    fileName: string,
    range?: FullReportRange,
    includePreparationPage = false
  ) {
    const previewWindow = mode === 'view'
      ? window.open('', '_blank', 'noopener,noreferrer')
      : null

    if (mode === 'view' && !previewWindow) {
      showToast({ message: 'Allow popups to view the batch report', type: 'error' })
      return
    }

    try {
      setReportLoading(true)
      await renderBatchReportPdf({ rows: reportRows, mode, title, fileName, range, includePreparationPage, previewWindow })
      if (mode === 'download') {
        showToast({ message: 'Batch report downloaded', type: 'success' })
      }
    } catch (error) {
      console.error('Failed to generate batch report:', error)
      if (previewWindow) previewWindow.close()
      showToast({ message: 'Failed to generate batch report', type: 'error' })
    } finally {
      setReportLoading(false)
    }
  }

  function handleFullReport(mode: 'view' | 'download') {
    if (dateRange.from && dateRange.to && new Date(dateRange.from) > new Date(dateRange.to)) {
      showToast({ message: 'From date cannot be after To date', type: 'error' })
      return
    }

    const selectedRows = filterRowsByDate(filteredRows, dateRange)
    const rangeName = [dateRange.from || 'start', dateRange.to || 'end'].join('-to-')
    void handleReport(mode, selectedRows, 'Full Batch Report', `full-batch-report-${rangeName}`, dateRange, true)
    setDateModalOpen(false)
  }

  function handleSingleReport(mode: 'view' | 'download', row: BatchViewRow) {
    void handleReport(mode, [row], `${row.batch.batchCode} Batch Report`, `batch-${row.batch.batchCode}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">View Batches</h1>
        </div>
        <Link href="/batches" className="text-sm font-medium text-[#1D838D] hover:text-[#006F7A]">
          Back to Batches
        </Link>
      </div>

      <div className="pt-16">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px_auto] lg:items-center">
          <div className="relative">
            <label htmlFor="view-batches-search" className="sr-only">
              Search product name or batch code
            </label>
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#1D838D]">
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <input
              id="view-batches-search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search product name or batch code..."
              className="h-12 w-full border border-zinc-300 bg-white pl-11 pr-4 text-sm font-medium text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30"
            />
          </div>

          <div className="relative">
            <label htmlFor="view-batches-brand-filter" className="sr-only">
              Filter by brand
            </label>
            <select
              id="view-batches-brand-filter"
              value={selectedBrandId}
              onChange={(event) => setSelectedBrandId(event.target.value)}
              className="h-12 w-full appearance-none border border-zinc-300 bg-white px-4 pr-10 text-sm font-semibold text-zinc-800 outline-none transition focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30"
            >
              <option value="">All brands</option>
              {brands.map(brand => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#1D838D]">
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>

          <Button
            variant="ghost"
            className="h-12 justify-center px-4"
            disabled={!hasFilters}
            onClick={() => {
              setSearchTerm('')
              setSelectedBrandId('')
            }}
          >
            Clear
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600">
            <span className="border-l-2 border-zinc-300 px-3 py-1">
              {selectedBrandName ? `Brand: ${selectedBrandName}` : 'All brands'}
            </span>
            <span className="border-l-2 border-zinc-300 px-3 py-1">
              Matches: {filteredRows.length}
            </span>
          </div>

          <button
            type="button"
            disabled={loading || reportLoading}
            onClick={() => {
              const today = new Date()
              setDateRange({
                from: dateRange.from || toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
                to: dateRange.to || toDateInput(today)
              })
              setDateModalOpen(true)
            }}
            className="h-11 border-2 border-zinc-700 px-7 text-sm font-bold uppercase tracking-wide text-[#2F765D] transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Full Report
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border-b border-zinc-200">
        <table className="min-w-[1320px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50/60 text-xs uppercase tracking-wide text-zinc-600">
              <th className="px-2 py-3 font-bold">Production Date</th>
              <th className="px-2 py-3 font-bold">Brand</th>
              <th className="px-2 py-3 font-bold">Product</th>
              <th className="px-2 py-3 font-bold">Batch Number</th>
              <th className="px-2 py-3 font-bold">Type</th>
              <th className="px-2 py-3 font-bold">Total Unit</th>
              <th className="px-2 py-3 font-bold">Total Qty</th>
              <th className="px-2 py-3 font-bold">Time Start</th>
              <th className="px-2 py-3 font-bold">Time End</th>
              <th className="px-2 py-3 font-bold">Exp Date</th>
              <th className="px-2 py-3 font-bold">Status</th>
              <th className="px-2 py-3 text-center font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="px-2 py-8 text-center text-zinc-500">
                  Loading batches...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-2 py-8 text-center text-zinc-500">
                  No batches found.
                </td>
              </tr>
            ) : (
              filteredRows.map(row => (
                <tr key={row.batch.id} className="border-b border-zinc-200 text-zinc-700">
                  <td className="px-2 py-4 whitespace-nowrap">{formatDateTime(row.productionDate)}</td>
                  <td className="px-2 py-4">{row.batch.brandName}</td>
                  <td className="px-2 py-4">{row.batch.productName}</td>
                  <td className="px-2 py-4 font-bold text-zinc-900">{row.batch.batchCode}</td>
                  <td className="px-2 py-4 font-bold text-zinc-800">{getDosageLabel(row.batch)}</td>
                  <td className="px-2 py-4">{Number(row.batch.containerCount || 0).toLocaleString()}</td>
                  <td className="px-2 py-4">{getTotalQty(row.batch)}</td>
                  <td className="px-2 py-4 whitespace-nowrap">{formatBatchTime(row.batch.startTime)}</td>
                  <td className="px-2 py-4 whitespace-nowrap">{formatBatchTime(row.batch.endTime)}</td>
                  <td className="px-2 py-4 font-bold text-zinc-800">{formatExpiry(row.expiryDate)}</td>
                  <td className="px-2 py-4">
                    <span className={`inline-flex min-w-20 justify-center rounded-full px-3 py-1 text-xs font-bold ${statusStyles[row.status]}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-2 py-4">
                    <div className="flex justify-center gap-3">
                      <button
                        type="button"
                        disabled={reportLoading}
                        onClick={() => handleSingleReport('view', row)}
                        className="min-h-10 rounded-full bg-emerald-100 px-7 text-sm font-bold text-[#2F765D] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        disabled={reportLoading}
                        onClick={() => handleSingleReport('download', row)}
                        className="min-h-10 rounded-full bg-emerald-100 px-5 text-sm font-bold text-[#2F765D] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Download
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {dateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-[2.5rem] border-[3px] border-zinc-700 bg-white px-16 pb-6 pt-20 shadow-xl">
            <button
              type="button"
              onClick={() => setDateModalOpen(false)}
              className="absolute -right-4 -top-9 flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-red-950 bg-red-800 text-4xl font-bold text-white shadow"
              aria-label="Close"
            >
              X
            </button>

            <div className="grid gap-8 sm:grid-cols-2">
              <div>
                <p className="text-4xl font-bold tracking-wide text-[#2F765D]">FROM</p>
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(event) => setDateRange(prev => ({ ...prev, from: event.target.value }))}
                  className="mt-8 w-full border-0 border-b-4 border-zinc-700 bg-transparent px-1 pb-1 text-3xl font-bold text-zinc-800 outline-none focus:border-[#2F765D]"
                />
              </div>
              <div>
                <p className="text-4xl font-bold tracking-wide text-[#2F765D]">TO</p>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(event) => setDateRange(prev => ({ ...prev, to: event.target.value }))}
                  className="mt-8 w-full border-0 border-b-4 border-zinc-700 bg-transparent px-1 pb-1 text-3xl font-bold text-zinc-800 outline-none focus:border-[#2F765D]"
                />
              </div>
            </div>

            <div className="mt-4 h-3 border-4 border-zinc-300" />

            <div className="mt-16 grid grid-cols-2 divide-x-4 divide-zinc-300 text-center">
              <button
                type="button"
                disabled={reportLoading}
                onClick={() => handleFullReport('view')}
                className="py-6 text-4xl font-bold tracking-wide text-[#2F765D] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                VIEW
              </button>
              <button
                type="button"
                disabled={reportLoading}
                onClick={() => handleFullReport('download')}
                className="py-6 text-4xl font-bold tracking-wide text-[#2F765D] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                DOWNLOAD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
