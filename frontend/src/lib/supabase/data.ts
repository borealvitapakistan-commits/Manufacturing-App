// Compatibility adapter for the migrated UI.
// Despite this legacy import path, every operation goes through Django.

import type {
  CreatePODocumentInput,
  CreatePurchaseOrderInput,
  FGCategory,
  FinishedGood,
  ManufacturingStage,
  PODocument,
  PurchaseOrderType,
  StageLifecycleInput
} from '@/types'
import { api, query } from '@/lib/api/client'

type Data<T> = { data: T }
// The copied Next.js screens define their own view-model interfaces. Keep the
// adapter permissive at this boundary while Django remains the source of truth.
type AnyRecord = any

const unwrap = <T>(response: Data<T>) => response.data

export async function initSupabase() {
  return api.get<{
    ok: boolean
    supabaseConfigured: boolean
    supabaseConnected: boolean
    supabaseCredentialMode: string
  }>('/health/')
}

export const initFirebase = initSupabase

export async function fetchBrands<T = unknown>(options?: { activeOnly?: boolean }): Promise<T[]> {
  return unwrap(await api.get<Data<T[]>>(`/brands${query({ activeOnly: options?.activeOnly, limit: 500 })}`))
}

export async function fetchBrand(id: string) {
  return unwrap(await api.get<Data<AnyRecord>>(`/brands/${id}`))
}

export async function saveBrand(brand: AnyRecord) {
  const { id, createdAt, updatedAt, ...payload } = brand
  const result = id
    ? unwrap(await api.put<Data<AnyRecord>>(`/brands/${id}`, payload))
    : unwrap(await api.post<Data<AnyRecord>>('/brands', payload))
  return result.id as string
}

export async function deleteBrand(id: string) {
  await api.delete(`/brands/${id}`)
}

export async function fetchProducts() {
  return unwrap(await api.get<Data<AnyRecord[]>>('/products?limit=500'))
}

export async function fetchProduct(id: string) {
  return unwrap(await api.get<Data<AnyRecord>>(`/products/${id}`))
}

export async function saveProduct(product: AnyRecord) {
  const { id, createdAt, updatedAt, ...payload } = product
  const result = id
    ? unwrap(await api.put<Data<AnyRecord>>(`/products/${id}`, payload))
    : unwrap(await api.post<Data<AnyRecord>>('/products', payload))
  return result.id as string
}

export async function deleteProduct(id: string) {
  await api.delete(`/products/${id}`)
}

export async function fetchProductsByRawMaterial(rawMaterialId: string) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(`/products/by-raw-material/${rawMaterialId}`)
  )
}

export async function fetchRawMaterials<T = unknown>(): Promise<T[]> {
  return unwrap(await api.get<Data<T[]>>('/raw-materials?limit=500'))
}

export async function fetchRawMaterialsByCategory<T = unknown>(categoryId: string): Promise<T[]> {
  return unwrap(await api.get<Data<T[]>>(`/raw-materials${query({ category_id: categoryId, limit: 500 })}`))
}

export async function fetchRawMaterialCategories<T = unknown>(options?: { activeOnly?: boolean }): Promise<T[]> {
  return unwrap(await api.get<Data<T[]>>(`/raw-material-categories${query({ activeOnly: options?.activeOnly, limit: 500 })}`))
}

export async function fetchRawMaterialCategory(id: string) {
  return unwrap(await api.get<Data<AnyRecord>>(`/raw-material-categories/${id}`))
}

export async function saveRawMaterialCategory(category: AnyRecord) {
  const { id, createdAt, updatedAt, ...payload } = category
  const result = id
    ? unwrap(await api.put<Data<AnyRecord>>(`/raw-material-categories/${id}`, payload))
    : unwrap(await api.post<Data<AnyRecord>>('/raw-material-categories', payload))
  return result.id as string
}

export async function deleteRawMaterialCategory(id: string) {
  await api.delete(`/raw-material-categories/${id}`)
}

export async function fetchRawMaterial(id: string) {
  return unwrap(await api.get<Data<AnyRecord>>(`/raw-materials/${id}`))
}

export async function saveRawMaterial(material: AnyRecord) {
  const { id, createdAt, updatedAt, ...payload } = material
  const result = id
    ? unwrap(await api.put<Data<AnyRecord>>(`/raw-materials/${id}`, payload))
    : unwrap(await api.post<Data<AnyRecord>>('/raw-materials', payload))
  return result.id as string
}

export async function deleteRawMaterial(id: string) {
  await api.delete(`/raw-materials/${id}`)
}

export async function fetchRawMaterialByCode(code: string) {
  return unwrap(
    await api.get<Data<AnyRecord | null>>(`/raw-materials/by-code/${encodeURIComponent(code)}`)
  )
}

export async function setRawMaterialStock(id: string, quantity: number) {
  return unwrap(
    await api.post<Data<AnyRecord>>('/raw-materials/set-stock', { id, quantity })
  )
}

export async function fetchLabelInventory(options?: {
  brandId?: string
  productId?: string
  activeOnly?: boolean
}) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(
      `/labels${query({ ...options, limit: 500 })}`
    )
  )
}

export async function fetchLabelInventoryByBrandProduct(brandId: string, productId: string) {
  return fetchLabelInventory({ brandId, productId, activeOnly: true })
}

export async function fetchLabelInventoryItem(id: string) {
  return unwrap(await api.get<Data<AnyRecord>>(`/labels/${id}`))
}

export async function saveLabelInventory(entry: AnyRecord) {
  const { id, brandName, productName, createdAt, updatedAt, ...payload } = entry
  const result = id
    ? unwrap(await api.put<Data<AnyRecord>>(`/labels/${id}`, payload))
    : unwrap(await api.post<Data<AnyRecord>>('/labels', payload))
  return result.id as string
}

export async function deleteLabelInventory(id: string) {
  await api.delete(`/labels/${id}`)
}

export async function fetchBatches(options?: {
  brandId?: string
  status?: string
  limit?: number
}) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(
      `/batches${query({ ...options, limit: options?.limit ?? 500 })}`
    )
  )
}

export async function fetchBatch(id: string) {
  return unwrap(await api.get<Data<AnyRecord>>(`/batches/${id}`))
}

export async function saveBatch(batch: AnyRecord) {
  const id = String(batch.id || '')
  const payload = {
    brandId: batch.brandId,
    productId: batch.productId,
    dosageForm: batch.dosageForm,
    unitsPerContainer: batch.unitsPerContainer ?? null,
    containerCount: batch.containerCount,
    totalUnits: batch.totalUnits ?? null,
    startTime: batch.startTime ?? null,
    endTime: batch.endTime ?? null,
    batchStatus: batch.batchStatus,
    currentStage: batch.currentStage,
    batchStartDate: batch.batchStartDate ?? null,
    batchStartTime: batch.batchStartTime ?? null,
    batchEndDate: batch.batchEndDate ?? null,
    batchEndTime: batch.batchEndTime ?? null,
    batchRemarks: batch.batchRemarks ?? null,
    reason: batch.reason ?? null,
    notes: batch.notes || '',
    manualBatchCode: batch.batchCode || undefined,
    createdBy: batch.createdBy ?? null,
    status: batch.status,
    hasMixing: batch.hasMixing,
    hasNJP: batch.hasNJP,
    hasAssembly: batch.hasAssembly
  }
  const result = id
    ? unwrap(await api.put<Data<AnyRecord>>(`/batches/${id}`, payload))
    : unwrap(await api.post<Data<AnyRecord>>('/batches', payload))
  return result.id as string
}

export async function deleteBatch(id: string) {
  await api.delete(`/batches/${id}`)
}

export async function deleteBatchCascade(id: string) {
  return unwrap(await api.delete<Data<AnyRecord>>(`/batches/${id}?cascade=true`))
}

export async function generateBatchCode(brandId: string, prefix: string) {
  const batches = await fetchBatches({ brandId, limit: 500 })
  const sequence = batches.reduce((max, row) => {
    const code = String(row.batchCode || '')
    const suffix = code.startsWith(prefix) ? code.slice(prefix.length) : ''
    const value = Number.parseInt(suffix, 10)
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return `${prefix}${String(sequence + 1).padStart(3, '0')}`
}

async function fetchStage(path: string, options?: { batchId?: string; brandId?: string }) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(
      `/batches/${path}${query({ ...options, limit: 500 })}`
    )
  )
}

export const fetchMixingReports = (options?: { batchId?: string; brandId?: string }) =>
  fetchStage('mixing-reports', options)
export const fetchNJPReports = (options?: { batchId?: string; brandId?: string }) =>
  fetchStage('njp-reports', options)
export const fetchAssemblyReports = (options?: { batchId?: string; brandId?: string }) =>
  fetchStage('assembly-reports', options)

export async function fetchLocalMixings(options?: { brandId?: string; limit?: number }) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(
      `/mixing${query({ ...options, limit: options?.limit ?? 500 })}`
    )
  )
}

export async function fetchLocalMixing(id: string) {
  return unwrap(await api.get<Data<AnyRecord>>(`/mixing/${id}`))
}

export async function saveLocalMixing(record: AnyRecord) {
  const { id, createdAt, updatedAt, totalFormulaQtyKg, ...payload } = record
  return unwrap(
    id
      ? await api.put<Data<AnyRecord>>(`/mixing/${id}`, payload)
      : await api.post<Data<AnyRecord>>('/mixing', payload)
  )
}

export async function deleteLocalMixing(id: string) {
  return unwrap(await api.delete<Data<AnyRecord>>(`/mixing/${id}`))
}

export async function startBatchStage(
  batchId: string,
  stage: ManufacturingStage,
  input: StageLifecycleInput = {}
) {
  return unwrap(
    await api.post<Data<AnyRecord>>(`/batches/${batchId}/stages/${stage}/start`, input)
  )
}

export async function completeBatchStage(
  batchId: string,
  stage: ManufacturingStage,
  input: AnyRecord
) {
  return unwrap(
    await api.post<Data<AnyRecord>>(`/batches/${batchId}/stages/${stage}/end`, input)
  )
}

export async function updateBatchStageLifecycle(
  batchId: string,
  stage: ManufacturingStage,
  input: StageLifecycleInput = {}
) {
  return unwrap(
    await api.put<Data<AnyRecord>>(`/batches/${batchId}/stages/${stage}/lifecycle`, input)
  )
}

export async function saveMixingReportWithDeduction(report: AnyRecord) {
  const batchId = String(report.batchId)
  const payload = {
    rmUsage: report.rmUsage || [],
    nonMedUsage: report.nonMedUsage || [],
    mixingDates: report.mixingDates || [],
    mixingNotes: report.mixingNotes || '',
    mixingDate: report.mixingDate ?? null,
    mixedPowderName: report.mixedPowderName ?? null,
    mixedPowderQtyKg: report.mixedPowderQtyKg ?? null,
    totalFormulaQtyKg: report.totalFormulaQtyKg ?? null,
    totalMixedQtyKg: report.totalMixedQtyKg ?? null,
    existingMixedPowderUsedKg: report.existingMixedPowderUsedKg ?? null,
    startDate: report.startDate ?? null,
    startTime: report.startTime ?? null,
    endDate: report.endDate ?? report.mixingDate ?? null,
    endTime: report.endTime ?? null,
    status: report.status,
    remarks: report.remarks ?? report.mixingNotes ?? null,
    reason: report.reason ?? null
  }
  if (report.id && report.status === 'In Mixing') {
    const result = unwrap(
      await api.post<Data<AnyRecord>>(`/batches/${batchId}/stages/mixing/end`, payload)
    )
    return result.report?.id || result.id
  }
  const result = unwrap(
    report.id
      ? await api.put<Data<AnyRecord>>(`/batches/${batchId}/mixing`, payload)
      : await api.post<Data<AnyRecord>>(`/batches/${batchId}/mixing`, payload)
  )
  return result.id
}

async function saveStage(stage: 'njp' | 'assembly', report: AnyRecord) {
  const { id, batchId, brandId, productId, batchCode, brandName, productName, createdAt, updatedAt, ...payload } = report
  const response = id
    ? await api.put<Data<AnyRecord>>(`/batches/${batchId}/${stage}`, payload)
    : await api.post<Data<AnyRecord>>(`/batches/${batchId}/${stage}`, payload)
  return unwrap(response).id
}

export const saveNJPReport = <T extends object>(report: T) =>
  saveStage('njp', report as AnyRecord)
export const saveAssemblyReport = <T extends object>(report: T) =>
  saveStage('assembly', report as AnyRecord)

export async function fetchFinishedGoods(options?: {
  category?: FGCategory
  brandId?: string
  productId?: string
  limit?: number
}) {
  return unwrap(
    await api.get<Data<FinishedGood[]>>(
      `/finished-goods${query({ ...options, limit: options?.limit ?? 500 })}`
    )
  )
}

export async function fetchFinishedGoodByBatch(batchId: string) {
  return unwrap(await api.get<Data<FinishedGood | null>>(`/finished-goods/by-batch/${batchId}`))
}

export async function fetchFinishedGoodHistory(finishedGoodId: string) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(
      `/finished-goods/history${query({ finishedGoodId })}`
    )
  )
}

export async function saveFinishedGood(entry: AnyRecord) {
  const { id, createdAt, updatedAt, ...payload } = entry
  const result = id
    ? unwrap(await api.put<Data<AnyRecord>>(`/finished-goods/${id}`, payload))
    : unwrap(await api.post<Data<AnyRecord>>('/finished-goods', payload))
  return result
}

export async function updateFinishedGoodWithHistory(
  id: string,
  updates: AnyRecord,
  reason: string
) {
  return saveFinishedGood({ id, ...updates, reason })
}

export async function deleteFinishedGood(id: string) {
  await api.delete(`/finished-goods/${id}`)
}

export async function fetchVendors(options?: { activeOnly?: boolean }) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(
      `/vendors${query({ active: options?.activeOnly ? true : undefined, limit: 500 })}`
    )
  )
}

export async function saveVendor(vendor: AnyRecord) {
  const { id, createdAt, updatedAt, ...payload } = vendor
  const result = id
    ? unwrap(await api.put<Data<AnyRecord>>(`/vendors/${id}`, payload))
    : unwrap(await api.post<Data<AnyRecord>>('/vendors', payload))
  return result.id as string
}

export async function deleteVendor(id: string) {
  await api.delete(`/vendors/${id}`)
}

export async function fetchPurchaseOrders(options?: {
  limit?: number
  status?: string
  orderType?: PurchaseOrderType
  vendorId?: string
  rawMaterialId?: string
  labelInventoryId?: string
  productId?: string
}) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(
      `/purchase-orders${query({ ...options, limit: options?.limit ?? 500 })}`
    )
  )
}

export async function savePurchaseOrder(input: CreatePurchaseOrderInput) {
  const { id, ...payload } = input
  return unwrap(
    id
      ? await api.put<Data<AnyRecord>>(`/purchase-orders/${id}`, payload)
      : await api.post<Data<AnyRecord>>('/purchase-orders', payload)
  )
}

export async function deletePurchaseOrder(id: string) {
  await api.delete(`/purchase-orders/${id}`)
}

export async function fetchEmployees() {
  return unwrap(await api.get<Data<AnyRecord[]>>('/employees?limit=500'))
}

export async function fetchEmployee(id: string) {
  return unwrap(await api.get<Data<AnyRecord>>(`/employees/${id}`))
}

export async function saveEmployee(employee: AnyRecord) {
  const { id, createdAt, updatedAt, ...payload } = employee
  const result = id
    ? unwrap(await api.put<Data<AnyRecord>>(`/employees/${id}`, payload))
    : unwrap(await api.post<Data<AnyRecord>>('/employees', payload))
  return result.id as string
}

export async function deleteEmployee(id: string) {
  await api.delete(`/employees/${id}`)
}

export async function fetchTimeEntries(employeeId?: string) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(`/time-entries${query({ employeeId, limit: 500 })}`)
  )
}

export async function saveTimeEntry(entry: AnyRecord, _upsertId?: string) {
  return unwrap(await api.post<Data<AnyRecord>>('/time-entries', entry)).id
}

export async function fetchWorkEntries(employeeId?: string) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(`/work-entries${query({ employeeId, limit: 500 })}`)
  )
}

export async function saveWorkEntry(entry: AnyRecord) {
  const { id, ...payload } = entry
  const result = id
    ? unwrap(await api.put<Data<AnyRecord>>(`/work-entries/${id}`, payload))
    : unwrap(await api.post<Data<AnyRecord>>('/work-entries', payload))
  return result.id
}

export async function fetchSalarySheets(employeeId?: string) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(`/salary-sheets${query({ employeeId, limit: 500 })}`)
  )
}

export async function saveSalarySheet(sheet: AnyRecord) {
  const result = unwrap(
    await api.post<Data<AnyRecord>>('/salary-sheets/generate', {
      employeeId: sheet.employeeId,
      year: sheet.year,
      month: sheet.month,
      otherDeductions: sheet.otherDeductions || 0,
      loanDeduction: sheet.totalLoanDeduction || 0,
      overtimePay: sheet.overtimePay || 0,
      bonus: sheet.bonus || 0,
      notes: sheet.notes || null,
      locked: sheet.locked === true
    })
  )
  return result.id
}

export async function fetchLoans(employeeId?: string) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(`/employee-loans${query({ employeeId, limit: 500 })}`)
  )
}

export async function saveLoan(loan: AnyRecord) {
  const { id, ...payload } = loan
  const result = id
    ? unwrap(await api.put<Data<AnyRecord>>(`/employee-loans/${id}`, payload))
    : unwrap(await api.post<Data<AnyRecord>>('/employee-loans', payload))
  return result.id
}

export async function fetchExpenseBooks<T = unknown>(): Promise<T[]> {
  return unwrap(await api.get<Data<T[]>>('/expense-books?limit=500'))
}

export async function fetchOpenExpenseBooks<T = unknown>(): Promise<T[]> {
  return unwrap(await api.get<Data<T[]>>('/expense-books?openOnly=true&limit=500'))
}

export async function saveLoanWithExpense(data: {
  employeeId: string
  amount: number
  note: string
  bookId: string
  givenFrom: string
}) {
  await api.post('/employee-loans/with-expense', data)
}

export async function fetchPODocuments(options?: {
  limit?: number
  status?: string
}): Promise<PODocument[]> {
  return unwrap(
    await api.get<Data<PODocument[]>>(
      `/po-documents${query({ ...options, limit: options?.limit ?? 200 })}`
    )
  )
}

export async function fetchPODocument(id: string): Promise<PODocument | null> {
  return unwrap(await api.get<Data<PODocument>>(`/po-documents/${id}`))
}

export async function savePODocument(input: CreatePODocumentInput): Promise<PODocument> {
  const { id, poNumber, ...payload } = input
  return unwrap(
    id
      ? await api.put<Data<PODocument>>(`/po-documents/${id}`, payload)
      : await api.post<Data<PODocument>>('/po-documents', payload)
  )
}

export async function deletePODocument(id: string) {
  await api.delete(`/po-documents/${id}`)
}

export async function fetchCompanySettings() {
  return unwrap(await api.get<Data<AnyRecord>>('/company-settings'))
}

export async function saveCompanySettings(settings: AnyRecord) {
  return unwrap(await api.put<Data<AnyRecord>>('/company-settings', settings))
}

export async function fetchExpenses(bookId?: string) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(`/expenses${query({ bookId, limit: 500 })}`)
  )
}

export async function saveExpense(expense: AnyRecord) {
  const { id, ...payload } = expense
  return unwrap(
    id
      ? await api.put<Data<AnyRecord>>(`/expenses/${id}`, payload)
      : await api.post<Data<AnyRecord>>('/expenses', payload)
  )
}

export async function deleteExpense(id: string) {
  await api.delete(`/expenses/${id}`)
}
