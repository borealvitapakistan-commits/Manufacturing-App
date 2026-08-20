// Compatibility adapter for the migrated UI.
// Despite this legacy import path, every operation goes through Django.

import type {
  BottleLidInventory,
  CreateInvoiceInput,
  CreatePODocumentInput,
  CreatePurchaseOrderInput,
  CreateQuoteInput,
  CreateRequestToQuoteInput,
  FGCategory,
  FinishedGood,
  Invoice,
  PODocument,
  PurchaseOrderType,
  Quote,
  RequestToQuoteDocument
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

export async function fetchBottleLidInventory(options?: {
  bottleType?: string
  capsuleType?: string
}): Promise<BottleLidInventory[]> {
  return unwrap(
    await api.get<Data<BottleLidInventory[]>>(
      `/bottles-lids${query({ ...options, limit: 500 })}`
    )
  )
}

export async function saveBottleLidInventory(entry: AnyRecord) {
  const { id, createdAt, updatedAt, ...payload } = entry
  return unwrap(
    id
      ? await api.put<Data<AnyRecord>>(`/bottles-lids/${id}`, payload)
      : await api.post<Data<AnyRecord>>('/bottles-lids', payload)
  )
}

export async function deleteBottleLidInventory(id: string) {
  await api.delete(`/bottles-lids/${id}`)
}

export async function fetchInventoryRecords(recordType: string, limit = 200) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(
      `/inventory/records/${recordType}/${query({ limit })}`
    )
  )
}

// ============================================================================
// Standalone / Local Mixing
// Django routes:
//   GET    /api/manufacturing/mixing/
//   POST   /api/manufacturing/mixing/
//   GET    /api/manufacturing/mixing/<uuid:item_id>/
//   PUT    /api/manufacturing/mixing/<uuid:item_id>/
//   DELETE /api/manufacturing/mixing/<uuid:item_id>/
// ============================================================================

export async function fetchLocalMixings(options?: {
  brandId?: string
  productId?: string
  mixingCode?: string
  search?: string
  limit?: number
}) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(
      `/manufacturing/mixing/${query({ ...options, limit: options?.limit ?? 500 })}`
    )
  )
}

export async function fetchLocalMixing(id: string) {
  return unwrap(await api.get<Data<AnyRecord>>(`/manufacturing/mixing/${id}/`))
}

export async function saveLocalMixing(record: AnyRecord) {
  const { id, createdAt, updatedAt, ...payload } = record

  return unwrap(
    id
      ? await api.put<Data<AnyRecord>>(`/manufacturing/mixing/${id}/`, payload)
      : await api.post<Data<AnyRecord>>('/manufacturing/mixing/', payload)
  )
}

export async function deleteLocalMixing(id: string) {
  return unwrap(await api.delete<Data<AnyRecord>>(`/manufacturing/mixing/${id}/`))
}

// ============================================================================
// Standalone / Encapsulation
// Django routes:
//   GET    /api/manufacturing/encapsulation/
//   POST   /api/manufacturing/encapsulation/
//   GET    /api/manufacturing/encapsulation/<uuid:item_id>/
//   PUT    /api/manufacturing/encapsulation/<uuid:item_id>/
//   DELETE /api/manufacturing/encapsulation/<uuid:item_id>/
// ============================================================================

export async function fetchLocalEncapsulations(options?: {
  brandId?: string
  productId?: string
  mixingId?: string
  search?: string
  limit?: number
}) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(
      `/manufacturing/encapsulation/${query({ ...options, limit: options?.limit ?? 500 })}`
    )
  )
}

export async function fetchLocalEncapsulation(id: string) {
  return unwrap(await api.get<Data<AnyRecord>>(`/manufacturing/encapsulation/${id}/`))
}

export async function saveLocalEncapsulation(record: AnyRecord) {
  const { id, createdAt, updatedAt, ...payload } = record

  return unwrap(
    id
      ? await api.put<Data<AnyRecord>>(`/manufacturing/encapsulation/${id}/`, payload)
      : await api.post<Data<AnyRecord>>('/manufacturing/encapsulation/', payload)
  )
}

export async function deleteLocalEncapsulation(id: string) {
  return unwrap(await api.delete<Data<AnyRecord>>(`/manufacturing/encapsulation/${id}/`))
}

// ============================================================================
// Standalone / Local Assembly
// Django routes:
//   GET    /api/manufacturing/assembly/
//   POST   /api/manufacturing/assembly/
//   GET    /api/manufacturing/assembly/<uuid:item_id>/
//   PUT    /api/manufacturing/assembly/<uuid:item_id>/
//   DELETE /api/manufacturing/assembly/<uuid:item_id>/
// ============================================================================

export async function fetchLocalAssemblies(options?: {
  brandId?: string
  productId?: string
  encapsulationId?: string
  search?: string
  limit?: number
}) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(
      `/manufacturing/assembly/${query({ ...options, limit: options?.limit ?? 500 })}`
    )
  )
}

export async function fetchLocalAssembly(id: string) {
  return unwrap(await api.get<Data<AnyRecord>>(`/manufacturing/assembly/${id}/`))
}

export async function saveLocalAssembly(record: AnyRecord) {
  const { id, createdAt, updatedAt, ...payload } = record

  return unwrap(
    id
      ? await api.put<Data<AnyRecord>>(`/manufacturing/assembly/${id}/`, payload)
      : await api.post<Data<AnyRecord>>('/manufacturing/assembly/', payload)
  )
}

export async function deleteLocalAssembly(id: string) {
  return unwrap(await api.delete<Data<AnyRecord>>(`/manufacturing/assembly/${id}/`))
}

export async function fetchFinishedGoods(options?: {
  category?: FGCategory
  brandId?: string
  productId?: string
  month?: string
  limit?: number
}) {
  return unwrap(
    await api.get<Data<FinishedGood[]>>(
      `/finished-goods${query({ ...options, limit: options?.limit ?? 500 })}`
    )
  )
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

// ============================================================================
// Send Items (goods sent out to a vendor)
// ============================================================================

export async function fetchSentItemSources(options: {
  itemType: string
  brandId?: string
}) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(
      `/sent-items/sources/${query({ itemType: options.itemType, brandId: options.brandId })}`
    )
  )
}

export async function fetchSentItems(options?: {
  vendorId?: string
  brandId?: string
  itemType?: string
  search?: string
  limit?: number
}) {
  return unwrap(
    await api.get<Data<AnyRecord[]>>(
      `/sent-items/${query({ ...options, limit: options?.limit ?? 500 })}`
    )
  )
}

export async function saveSentItem(record: AnyRecord) {
  const { id, createdAt, updatedAt, ...payload } = record

  return unwrap(
    id
      ? await api.put<Data<AnyRecord>>(`/sent-items/${id}/`, payload)
      : await api.post<Data<AnyRecord>>('/sent-items/', payload)
  )
}

export async function deleteSentItem(id: string) {
  return unwrap(await api.delete<Data<AnyRecord>>(`/sent-items/${id}/`))
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

export async function fetchPODocumentHistory(id: string): Promise<PODocument[]> {
  return unwrap(await api.get<Data<PODocument[]>>(`/po-documents/${id}/history`))
}

export async function savePODocument(input: CreatePODocumentInput): Promise<PODocument> {
  const { id, poNumber, ...payload } = input

  return unwrap(
    id
      ? await api.put<Data<PODocument>>(`/po-documents/${id}`, payload)
      : await api.post<Data<PODocument>>('/po-documents', payload)
  )
}

export async function savePOPaymentProof(id: string, file: File): Promise<PODocument> {
  const form = new FormData()
  form.set('file', file)
  return unwrap(await api.postForm<Data<PODocument>>(`/po-documents/${id}/payment-proof`, form))
}

export async function deletePODocument(id: string) {
  await api.delete(`/po-documents/${id}`)
}

export async function fetchRequestToQuoteDocuments(options?: {
  limit?: number
  status?: string
}): Promise<RequestToQuoteDocument[]> {
  return unwrap(
    await api.get<Data<RequestToQuoteDocument[]>>(
      `/request-to-quote-documents${query({ ...options, limit: options?.limit ?? 200 })}`
    )
  )
}

export async function fetchRequestToQuoteDocument(id: string): Promise<RequestToQuoteDocument | null> {
  return unwrap(await api.get<Data<RequestToQuoteDocument>>(`/request-to-quote-documents/${id}`))
}

export async function fetchRequestToQuoteHistory(id: string): Promise<RequestToQuoteDocument[]> {
  return unwrap(await api.get<Data<RequestToQuoteDocument[]>>(`/request-to-quote-documents/${id}/history`))
}

export async function saveRequestToQuoteDocument(
  input: CreateRequestToQuoteInput
): Promise<RequestToQuoteDocument> {
  const { id, rtqNumber, ...payload } = input

  return unwrap(
    id
      ? await api.put<Data<RequestToQuoteDocument>>(`/request-to-quote-documents/${id}`, payload)
      : await api.post<Data<RequestToQuoteDocument>>('/request-to-quote-documents', payload)
  )
}

export async function deleteRequestToQuoteDocument(id: string) {
  await api.delete(`/request-to-quote-documents/${id}`)
}

export async function fetchQuotes(options?: { rtqNumber?: string; limit?: number }): Promise<Quote[]> {
  return unwrap(
    await api.get<Data<Quote[]>>(`/quotes${query({ ...options, limit: options?.limit ?? 200 })}`)
  )
}

export async function fetchQuote(id: string): Promise<Quote | null> {
  return unwrap(await api.get<Data<Quote>>(`/quotes/${id}`))
}

export async function saveQuote(
  input: CreateQuoteInput & { id?: string; file?: File | null }
): Promise<Quote> {
  const { id, file, ...fields } = input
  const form = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.set(key, String(value))
  })
  if (file) form.set('file', file)

  return unwrap(
    id
      ? await api.putForm<Data<Quote>>(`/quotes/${id}`, form)
      : await api.postForm<Data<Quote>>('/quotes', form)
  )
}

export async function deleteQuote(id: string) {
  await api.delete(`/quotes/${id}`)
}

export async function fetchInvoices(options?: { poNumber?: string; limit?: number }): Promise<Invoice[]> {
  return unwrap(
    await api.get<Data<Invoice[]>>(`/invoices${query({ ...options, limit: options?.limit ?? 200 })}`)
  )
}

export async function fetchInvoice(id: string): Promise<Invoice | null> {
  return unwrap(await api.get<Data<Invoice>>(`/invoices/${id}`))
}

export async function saveInvoice(
  input: CreateInvoiceInput & { id?: string; file?: File | null }
): Promise<Invoice> {
  const { id, file, ...fields } = input
  const form = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.set(key, String(value))
  })
  if (file) form.set('file', file)

  return unwrap(
    id
      ? await api.putForm<Data<Invoice>>(`/invoices/${id}`, form)
      : await api.postForm<Data<Invoice>>('/invoices', form)
  )
}

export async function deleteInvoice(id: string) {
  await api.delete(`/invoices/${id}`)
}

// Marks an Invoice Done - credits its linked PO's received quantities into
// inventory (raw materials, bottles/lids, labels) and locks the invoice.
export async function markInvoiceDone(id: string): Promise<Invoice> {
  return unwrap(await api.post<Data<Invoice>>(`/invoices/${id}/done`, {}))
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
