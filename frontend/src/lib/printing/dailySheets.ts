// ============================================================================
// Daily/Monthly Sheet Print Builders
// ============================================================================

export type StagePrintType = 'mixing' | 'njp' | 'assembly'

interface PrintParams {
  stage: StagePrintType
  dailyDate: string
  brandName?: string
  reports: Array<Record<string, unknown>>
  batches: Array<Record<string, unknown>>
}

interface PrintResult {
  rowCount: number
  html: string
}

interface StageRow {
  sortTime: number
  values: string[]
}

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asObj) : []
}

function asNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'string') {
    const yyyyMmDd = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (yyyyMmDd) {
      const year = Number(yyyyMmDd[1])
      const month = Number(yyyyMmDd[2]) - 1
      const day = Number(yyyyMmDd[3])
      const d = new Date(year, month, day)
      return isNaN(d.getTime()) ? null : d
    }
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'object' && value !== null && 'seconds' in (value as Record<string, unknown>)) {
    const seconds = asNum((value as Record<string, unknown>).seconds)
    if (seconds === null) return null
    const d = new Date(seconds * 1000)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatDateShort(value: unknown): string {
  const date = toDate(value)
  if (!date) return '—'
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`
}

function formatNum(value: unknown, decimals = 3): string {
  const num = asNum(value)
  if (num === null) return '—'
  return num.toFixed(decimals)
}

function firstDate(values: unknown[]): Date | null {
  for (const value of values) {
    const date = toDate(value)
    if (date) return date
  }
  return null
}

function extractNjp(report: Record<string, unknown>): Record<string, unknown> {
  const capsuleData = asObj(report.capsuleData)
  return { ...capsuleData, ...report }
}

function extractAssembly(report: Record<string, unknown>): Record<string, unknown> {
  const finalQuantities = asObj(report.finalQuantities)
  return { ...finalQuantities, ...report }
}

function extractMixingDate(report: Record<string, unknown>): Date | null {
  const mixingDates = Array.isArray(report.mixingDates) ? report.mixingDates : []
  return firstDate([report.mixingDate, mixingDates[0], report.createdAt, report.updatedAt])
}

function extractNjpDate(report: Record<string, unknown>): Date | null {
  const source = extractNjp(report)
  return firstDate([source.productionDate, source.startDate, source.createdAt, source.updatedAt])
}

function extractAssemblyDate(report: Record<string, unknown>): Date | null {
  const source = extractAssembly(report)
  return firstDate([source.productionDate, source.createdAt, source.updatedAt])
}

function sumFromRows(rows: Array<Record<string, unknown>>, keys: string[]): number {
  return rows.reduce((total, row) => {
    for (const key of keys) {
      const value = asNum(row[key])
      if (value !== null) return total + value
    }
    return total
  }, 0)
}

function buildMixingRows(
  reports: Array<Record<string, unknown>>,
  batchMap: Map<string, Record<string, unknown>>,
  dailyDate: string
): StageRow[] {
  const rows: StageRow[] = []

  for (const report of reports) {
    const date = extractMixingDate(report)
    if (!date || dayKey(date) !== dailyDate) continue

    const batchId = asText(report.batchId)
    const batch = batchMap.get(batchId) || {}
    const rmUsage = asArray(report.rmUsage)
    const nonMedUsage = asArray(report.nonMedUsage)

    const totalActiveNo = rmUsage.length
    const totalActiveKg = sumFromRows(rmUsage, ['requiredQtyKgThisMix', 'usedQtyKg', 'requiredQtyKg'])
    const totalNmiNo = nonMedUsage.length
    const totalNmiKg = sumFromRows(nonMedUsage, ['requiredQtyKgThisMix', 'usedQtyKg', 'requiredQtyKg', 'requiredQtyKgFormula'])
    const totalBatchKg = asNum(report.totalMixedQtyKg) ?? (totalActiveKg + totalNmiKg)

    rows.push({
      sortTime: date.getTime(),
      values: [
        formatDateShort(date),
        asText(report.productName) || asText(batch.productName) || '—',
        asText(report.batchCode) || asText(batch.batchCode) || '—',
        String(totalActiveNo),
        formatNum(totalActiveKg, 4),
        String(totalNmiNo),
        formatNum(totalNmiKg, 4),
        formatNum(totalBatchKg, 4),
        asText(report.operatorName) || asText(report.doneBy) || '—',
        asText(report.mixingNotes) || asText(report.comments) || '—'
      ]
    })
  }

  return rows.sort((a, b) => a.sortTime - b.sortTime)
}

function averageActualWeight(loadChecks: Array<Record<string, unknown>>): number | null {
  const values = loadChecks
    .map((row) => asNum(row.avgWeightMg))
    .filter((value): value is number => value !== null)

  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildNjpRows(
  reports: Array<Record<string, unknown>>,
  batchMap: Map<string, Record<string, unknown>>,
  dailyDate: string
): StageRow[] {
  const rows: StageRow[] = []

  for (const report of reports) {
    const source = extractNjp(report)
    const date = extractNjpDate(source)
    if (!date || dayKey(date) !== dailyDate) continue

    const batchId = asText(source.batchId)
    const batch = batchMap.get(batchId) || {}
    const loadChecks = asArray(source.loadChecks)
    const actualWeight = asNum(source.actualWeightMg) ?? averageActualWeight(loadChecks)
    const temp = asNum(source.temperatureC)
    const humidity = asNum(source.humidityPercent)
    const tempHumidity = temp === null && humidity === null
      ? '—'
      : `${temp === null ? '-' : temp.toFixed(1)} C / ${humidity === null ? '-' : humidity.toFixed(1)}%`

    rows.push({
      sortTime: date.getTime(),
      values: [
        formatDateShort(date),
        asText(source.productName) || asText(batch.productName) || '—',
        asText(source.lotNumber) || asText(source.batchCode) || asText(batch.batchCode) || '—',
        formatNum(source.targetFillWeightMg, 3),
        actualWeight === null ? '—' : actualWeight.toFixed(3),
        formatNum(source.totalCapsulesFilledQty, 0),
        formatNum(source.totalCapsulesProducedKg, 3),
        asText(source.boxes) || asText(batch.containerCount) || '—',
        tempHumidity,
        asText(source.remarks) || '—'
      ]
    })
  }

  return rows.sort((a, b) => a.sortTime - b.sortTime)
}

function buildAssemblyRows(
  reports: Array<Record<string, unknown>>,
  batchMap: Map<string, Record<string, unknown>>,
  dailyDate: string
): StageRow[] {
  const rows: StageRow[] = []

  for (const report of reports) {
    const source = extractAssembly(report)
    const date = extractAssemblyDate(source)
    if (!date || dayKey(date) !== dailyDate) continue

    const batchId = asText(source.batchId)
    const batch = batchMap.get(batchId) || {}

    rows.push({
      sortTime: date.getTime(),
      values: [
        asText(source.productName) || asText(batch.productName) || '—',
        asText(source.batchCode) || asText(batch.batchCode) || '—',
        formatNum(source.capsuleWeightMg ?? source.capsuleWeight, 3),
        formatNum(source.filledBottleWeight, 3),
        formatNum(source.capsulesPerBottle, 0),
        formatNum(source.totalBottlesMade, 0),
        formatDateShort(source.productionDate),
        formatDateShort(source.expiryDate),
        asText(source.notes) || asText(source.remarks) || '—'
      ]
    })
  }

  return rows.sort((a, b) => a.sortTime - b.sortTime)
}

function getHeaders(stage: StagePrintType): string[] {
  if (stage === 'mixing') {
    return [
      'Sr',
      'Date',
      'Product Name',
      'Batch Number',
      'Total Active Ingredients (No.)',
      'Total Active Ingredients (kg)',
      'Total NMI (No.)',
      'Total NMI (kg)',
      'Total Batch (kg)',
      'Done By',
      'Remarks'
    ]
  }

  if (stage === 'njp') {
    return [
      'Sr',
      'Date',
      'Product Name',
      'Lot Number',
      'Label Claim (mg)',
      'Actual Weight (mg)',
      'Total Caps (Number)',
      'Total Caps (kg)',
      'Boxes',
      'Temperature / Humidity',
      'Remarks'
    ]
  }

  return [
    'Sr',
    'Product Name',
    'Batch Number',
    'Physical Capsule Weight (mg)',
    'Filled Bottle Weight',
    'Bottle Caps (90,120)',
    'Total Bottles Made',
    'Production Date',
    'Expiry Date',
    'Remarks'
  ]
}

function getTitle(stage: StagePrintType): string {
  if (stage === 'mixing') return 'Daily Mixing Sheet'
  if (stage === 'njp') return 'Daily NJP Sheet'
  return 'Daily Assembly Line Sheet'
}

function renderHtml(stage: StagePrintType, dailyDate: string, brandName: string, rows: StageRow[]): string {
  const headers = getHeaders(stage)
  const printDate = formatDateShort(dailyDate)
  const trHead = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')
  const trBody = rows
    .map((row, index) => {
      const cells = [String(index + 1), ...row.values]
      return `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
    })
    .join('')

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(getTitle(stage))}</title>
    <style>
      @page { size: landscape; margin: 10mm; }
      body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #111; }
      .page { padding: 10px; }
      h1 { margin: 0; text-align: center; font-size: 18px; }
      .meta { margin: 8px 0 10px; display: flex; justify-content: space-between; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #444; padding: 6px 4px; font-size: 11px; vertical-align: top; word-wrap: break-word; }
      th { background: #f0f0f0; font-weight: 600; text-align: center; }
      td { text-align: center; }
      .left { text-align: left; }
    </style>
  </head>
  <body>
    <div class="page">
      <h1>${escapeHtml(getTitle(stage))}</h1>
      <div class="meta">
        <div><strong>Date:</strong> ${escapeHtml(printDate)}</div>
        <div><strong>Brand:</strong> ${escapeHtml(brandName || 'All')}</div>
        <div><strong>Rows:</strong> ${rows.length}</div>
      </div>
      <table>
        <thead><tr>${trHead}</tr></thead>
        <tbody>${trBody}</tbody>
      </table>
    </div>
  </body>
</html>`
}

export function buildDailySheetHtml({
  stage,
  dailyDate,
  brandName,
  reports,
  batches
}: PrintParams): PrintResult {
  const batchMap = new Map<string, Record<string, unknown>>()
  for (const batch of batches) {
    const id = asText(batch.id)
    if (id) batchMap.set(id, batch)
  }

  const rows = stage === 'mixing'
    ? buildMixingRows(reports, batchMap, dailyDate)
    : stage === 'njp'
    ? buildNjpRows(reports, batchMap, dailyDate)
    : buildAssemblyRows(reports, batchMap, dailyDate)

  if (!rows.length) return { rowCount: 0, html: '' }

  return {
    rowCount: rows.length,
    html: renderHtml(stage, dailyDate, brandName || '', rows)
  }
}

interface MonthlyPrintParams {
  stage: StagePrintType
  monthlyMonth: string // YYYY-MM
  brandName?: string
  reports: Array<Record<string, unknown>>
  batches: Array<Record<string, unknown>>
}

interface YearlyPrintParams {
  stage: StagePrintType
  yearlyYear: string // YYYY
  brandName?: string
  reports: Array<Record<string, unknown>>
  batches: Array<Record<string, unknown>>
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

function parseMonth(monthlyMonth: string): { year: number; month: number; monthName: string } {
  const [yearRaw, monthRaw] = monthlyMonth.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const date = new Date(year, month - 1, 1)
  const monthName = date.toLocaleString('en-US', { month: 'short' })
  return {
    year: Number.isFinite(year) ? year : new Date().getFullYear(),
    month: Number.isFinite(month) ? month : new Date().getMonth() + 1,
    monthName
  }
}

function buildMixingMonthlyRows(
  reports: Array<Record<string, unknown>>,
  batchMap: Map<string, Record<string, unknown>>,
  monthlyMonth: string
): StageRow[] {
  const rows: StageRow[] = []

  for (const report of reports) {
    const date = extractMixingDate(report)
    if (!date || monthKey(date) !== monthlyMonth) continue

    const batchId = asText(report.batchId)
    const batch = batchMap.get(batchId) || {}
    const rmUsage = asArray(report.rmUsage)
    const nonMedUsage = asArray(report.nonMedUsage)
    const totalRmKg = sumFromRows(rmUsage, ['requiredQtyKgThisMix', 'usedQtyKg', 'requiredQtyKg'])
    const totalNmiKg = sumFromRows(nonMedUsage, ['requiredQtyKgThisMix', 'usedQtyKg', 'requiredQtyKg', 'requiredQtyKgFormula'])
    const stockKg = asNum(report.totalMixedQtyKg) ?? asNum(report.mixedPowderQtyKg) ?? (totalRmKg + totalNmiKg)
    const flowAgents = nonMedUsage
      .map((item) => asText(item.name))
      .filter(Boolean)
      .join(', ')

    rows.push({
      sortTime: date.getTime(),
      values: [
        formatDateShort(date),
        asText(report.productName) || asText(batch.productName) || '—',
        asText(report.batchCode) || asText(batch.batchCode) || '—',
        String(rmUsage.length),
        formatNum(totalRmKg, 4),
        flowAgents || '—',
        asText(report.mixingNotes) || asText(report.comments) || '—',
        formatNum(stockKg, 4)
      ]
    })
  }

  return rows.sort((a, b) => a.sortTime - b.sortTime)
}

function buildNjpMonthlyRows(
  reports: Array<Record<string, unknown>>,
  batchMap: Map<string, Record<string, unknown>>,
  monthlyMonth: string
): StageRow[] {
  const rows: StageRow[] = []

  for (const report of reports) {
    const source = extractNjp(report)
    const date = extractNjpDate(source)
    if (!date || monthKey(date) !== monthlyMonth) continue

    const batchId = asText(source.batchId)
    const batch = batchMap.get(batchId) || {}
    const linkValue = asText(source.batchCode) || asText(batch.batchCode) || '—'

    rows.push({
      sortTime: date.getTime(),
      values: [
        formatDateShort(date),
        asText(source.productName) || asText(batch.productName) || '—',
        asText(source.lotNumber) || asText(source.batchCode) || asText(batch.batchCode) || '—',
        formatNum(source.rawMaterialReceivedKg, 3),
        formatNum(source.targetFillWeightMg, 3),
        formatNum(source.totalCapsulesFilledQty, 0),
        linkValue,
        asText(source.remarks) || '—'
      ]
    })
  }

  return rows.sort((a, b) => a.sortTime - b.sortTime)
}

function buildAssemblyMonthlyRows(
  reports: Array<Record<string, unknown>>,
  batchMap: Map<string, Record<string, unknown>>,
  monthlyMonth: string
): StageRow[] {
  const rows: StageRow[] = []

  for (const report of reports) {
    const source = extractAssembly(report)
    const date = extractAssemblyDate(source)
    if (!date || monthKey(date) !== monthlyMonth) continue

    const batchId = asText(source.batchId)
    const batch = batchMap.get(batchId) || {}

    rows.push({
      sortTime: date.getTime(),
      values: [
        formatDateShort(date),
        asText(source.productName) || asText(batch.productName) || '—',
        asText(source.batchCode) || asText(batch.batchCode) || '—',
        formatDateShort(source.expiryDate),
        formatNum(source.capsulesPerBottle, 0),
        formatNum(source.totalBottlesMade, 0),
        formatNum(source.capsuleWeightMg ?? source.capsuleWeight, 3),
        asText(source.notes) || asText(source.remarks) || '—'
      ]
    })
  }

  return rows.sort((a, b) => a.sortTime - b.sortTime)
}

function getMonthlyHeaders(stage: StagePrintType): string[] {
  if (stage === 'mixing') {
    return [
      'Date',
      'Product Name',
      'Batch No.',
      'Total RM (Used)',
      'Total RM (Kg)',
      'Flow Agents (Ctrl+Enter)',
      'Comments',
      'Stock (Kg)'
    ]
  }

  if (stage === 'njp') {
    return [
      'Date',
      'Product Name',
      'Lot Number',
      'Raw material Received (kg)',
      'Target Fill Weight (mg)',
      'Total Capsules Filled: (Number)',
      'Link',
      'Comments'
    ]
  }

  return [
    'Date',
    'Product Name',
    'Batch No.',
    'Expiry Date',
    'Caps per bottle',
    'Total Bottles',
    'Mg caps',
    'Comments'
  ]
}

function getMonthlyTitle(stage: StagePrintType, monthlyMonth: string): string {
  const { monthName, year } = parseMonth(monthlyMonth)
  if (stage === 'mixing') return `Mixing Monthly Production Sheet - ${monthName} ${year}`
  if (stage === 'njp') return `NJP Production Sheet - ${monthName} ${year}`
  return `Latest Assembly Line Production Sheet - ${monthName} ${year}`
}

function renderMonthlyHtml(
  stage: StagePrintType,
  monthlyMonth: string,
  brandName: string,
  rows: StageRow[]
): string {
  const headers = getMonthlyHeaders(stage)
  const { monthName, year } = parseMonth(monthlyMonth)
  const trHead = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')
  const trBody = rows
    .map((row) => `<tr>${row.values.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(getMonthlyTitle(stage, monthlyMonth))}</title>
    <style>
      @page { size: landscape; margin: 10mm; }
      body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #111; }
      .page { padding: 10px; }
      h1 { margin: 0; text-align: center; font-size: 18px; }
      .meta { margin: 8px 0 10px; display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #444; padding: 6px 4px; font-size: 11px; vertical-align: top; word-wrap: break-word; }
      th { background: #f0f0f0; font-weight: 600; text-align: center; }
      td { text-align: center; }
    </style>
  </head>
  <body>
    <div class="page">
      <h1>${escapeHtml(getMonthlyTitle(stage, monthlyMonth))}</h1>
      <div class="meta">
        <div><strong>Month:</strong> ${escapeHtml(monthName)}</div>
        <div><strong>Year:</strong> ${escapeHtml(year)}</div>
        <div><strong>Brand:</strong> ${escapeHtml(brandName || 'All')}</div>
        <div><strong>Rows:</strong> ${rows.length}</div>
      </div>
      <table>
        <thead><tr>${trHead}</tr></thead>
        <tbody>${trBody}</tbody>
      </table>
    </div>
  </body>
</html>`
}

export function buildMonthlySheetHtml({
  stage,
  monthlyMonth,
  brandName,
  reports,
  batches
}: MonthlyPrintParams): PrintResult {
  const batchMap = new Map<string, Record<string, unknown>>()
  for (const batch of batches) {
    const id = asText(batch.id)
    if (id) batchMap.set(id, batch)
  }

  const rows = stage === 'mixing'
    ? buildMixingMonthlyRows(reports, batchMap, monthlyMonth)
    : stage === 'njp'
    ? buildNjpMonthlyRows(reports, batchMap, monthlyMonth)
    : buildAssemblyMonthlyRows(reports, batchMap, monthlyMonth)

  if (!rows.length) return { rowCount: 0, html: '' }

  return {
    rowCount: rows.length,
    html: renderMonthlyHtml(stage, monthlyMonth, brandName || '', rows)
  }
}

function buildMixingYearlyRows(
  reports: Array<Record<string, unknown>>,
  batchMap: Map<string, Record<string, unknown>>,
  yearlyYear: string
): StageRow[] {
  const rows: StageRow[] = []

  for (const report of reports) {
    const date = extractMixingDate(report)
    if (!date || date.getFullYear().toString() !== yearlyYear) continue

    const batchId = asText(report.batchId)
    const batch = batchMap.get(batchId) || {}
    const rmUsage = asArray(report.rmUsage)
    const nonMedUsage = asArray(report.nonMedUsage)
    const totalRmKg = sumFromRows(rmUsage, ['requiredQtyKgThisMix', 'usedQtyKg', 'requiredQtyKg'])
    const totalNmiKg = sumFromRows(nonMedUsage, ['requiredQtyKgThisMix', 'usedQtyKg', 'requiredQtyKg', 'requiredQtyKgFormula'])
    const stockKg = asNum(report.totalMixedQtyKg) ?? asNum(report.mixedPowderQtyKg) ?? (totalRmKg + totalNmiKg)
    const flowAgents = nonMedUsage
      .map((item) => asText(item.name))
      .filter(Boolean)
      .join(', ')

    rows.push({
      sortTime: date.getTime(),
      values: [
        formatDateShort(date),
        asText(report.productName) || asText(batch.productName) || '—',
        asText(report.batchCode) || asText(batch.batchCode) || '—',
        String(rmUsage.length),
        formatNum(totalRmKg, 4),
        flowAgents || '—',
        asText(report.mixingNotes) || asText(report.comments) || '—',
        formatNum(stockKg, 4)
      ]
    })
  }

  return rows.sort((a, b) => a.sortTime - b.sortTime)
}

function buildNjpYearlyRows(
  reports: Array<Record<string, unknown>>,
  batchMap: Map<string, Record<string, unknown>>,
  yearlyYear: string
): StageRow[] {
  const rows: StageRow[] = []

  for (const report of reports) {
    const source = extractNjp(report)
    const date = extractNjpDate(source)
    if (!date || date.getFullYear().toString() !== yearlyYear) continue

    const batchId = asText(source.batchId)
    const batch = batchMap.get(batchId) || {}

    rows.push({
      sortTime: date.getTime(),
      values: [
        formatDateShort(date),
        asText(source.productName) || asText(batch.productName) || '—',
        asText(source.batchCode) || asText(batch.batchCode) || asText(source.lotNumber) || '—',
        formatNum(source.targetFillWeightMg, 3),
        formatNum(source.rawMaterialReceivedKg, 3),
        formatNum(source.totalCapsulesProducedKg, 3),
        formatNum(source.totalCapsulesFilledQty, 0),
        asText(source.remarks) || '—'
      ]
    })
  }

  return rows.sort((a, b) => a.sortTime - b.sortTime)
}

function buildAssemblyYearlyRows(
  reports: Array<Record<string, unknown>>,
  batchMap: Map<string, Record<string, unknown>>,
  yearlyYear: string
): StageRow[] {
  const rows: StageRow[] = []

  for (const report of reports) {
    const source = extractAssembly(report)
    const date = extractAssemblyDate(source)
    if (!date || date.getFullYear().toString() !== yearlyYear) continue

    const batchId = asText(source.batchId)
    const batch = batchMap.get(batchId) || {}

    rows.push({
      sortTime: date.getTime(),
      values: [
        formatDateShort(date),
        asText(source.productName) || asText(batch.productName) || '—',
        asText(source.batchCode) || asText(batch.batchCode) || '—',
        formatDateShort(source.expiryDate),
        formatNum(source.capsulesPerBottle, 0),
        formatNum(source.totalBottlesMade, 0),
        asText(source.notes) || asText(source.remarks) || '—'
      ]
    })
  }

  return rows.sort((a, b) => a.sortTime - b.sortTime)
}

function getYearlyHeaders(stage: StagePrintType): string[] {
  if (stage === 'mixing') {
    return [
      'Date',
      'Product Name',
      'Batch No.',
      'Total RM (Used)',
      'Total RM (Kg)',
      'Flow Agents (Ctrl+Enter)',
      'Comments',
      'Stock (Kg)'
    ]
  }

  if (stage === 'njp') {
    return [
      'Date',
      'Product Name',
      'Batch No.',
      'Weight (mg)',
      'Empty Capsule (Used)',
      'Total Capsule (Kg)',
      'Total Capsule (QTY)',
      'Comments'
    ]
  }

  return [
    'Date',
    'Product Name',
    'Batch No.',
    'Expiry Date',
    'Caps per bottle',
    'Total Bottles',
    'Comments'
  ]
}

function getYearlyTitle(stage: StagePrintType, yearlyYear: string): string {
  if (stage === 'mixing') return `Mixing Production Sheet - ${yearlyYear}`
  if (stage === 'njp') return `NJP Production Sheet - ${yearlyYear}`
  return `Assembly Line Production Sheet - ${yearlyYear}`
}

function renderYearlyHtml(
  stage: StagePrintType,
  yearlyYear: string,
  brandName: string,
  rows: StageRow[]
): string {
  const headers = getYearlyHeaders(stage)
  const trHead = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')
  const trBody = rows
    .map((row) => `<tr>${row.values.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(getYearlyTitle(stage, yearlyYear))}</title>
    <style>
      @page { size: landscape; margin: 10mm; }
      body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #111; }
      .page { padding: 10px; }
      h1 { margin: 0; text-align: center; font-size: 18px; }
      .meta { margin: 8px 0 10px; display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #444; padding: 6px 4px; font-size: 11px; vertical-align: top; word-wrap: break-word; }
      th { background: #f0f0f0; font-weight: 600; text-align: center; }
      td { text-align: center; }
    </style>
  </head>
  <body>
    <div class="page">
      <h1>${escapeHtml(getYearlyTitle(stage, yearlyYear))}</h1>
      <div class="meta">
        <div><strong>Year:</strong> ${escapeHtml(yearlyYear)}</div>
        <div><strong>Brand:</strong> ${escapeHtml(brandName || 'All')}</div>
        <div><strong>Rows:</strong> ${rows.length}</div>
      </div>
      <table>
        <thead><tr>${trHead}</tr></thead>
        <tbody>${trBody}</tbody>
      </table>
    </div>
  </body>
</html>`
}

export function buildYearlySheetHtml({
  stage,
  yearlyYear,
  brandName,
  reports,
  batches
}: YearlyPrintParams): PrintResult {
  const batchMap = new Map<string, Record<string, unknown>>()
  for (const batch of batches) {
    const id = asText(batch.id)
    if (id) batchMap.set(id, batch)
  }

  const rows = stage === 'mixing'
    ? buildMixingYearlyRows(reports, batchMap, yearlyYear)
    : stage === 'njp'
    ? buildNjpYearlyRows(reports, batchMap, yearlyYear)
    : buildAssemblyYearlyRows(reports, batchMap, yearlyYear)

  if (!rows.length) return { rowCount: 0, html: '' }

  return {
    rowCount: rows.length,
    html: renderYearlyHtml(stage, yearlyYear, brandName || '', rows)
  }
}
