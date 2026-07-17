// ============================================================================
// Core Types for Manufacturing Portal
// ============================================================================

// Brand Types
export interface Brand {
  id: string
  name: string
  codePrefix: string
  shortName: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  province: string | null
  country: string | null
  phone: string | null
  notes: string | null
  color: string
  logoUrl: string | null
  isActive: boolean
  createdAt: number
  updatedAt: number
}

export interface CreateBrandInput {
  name: string
  codePrefix: string
  shortName?: string
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  province?: string | null
  country?: string
  phone?: string | null
  notes?: string
  color?: string
  logoUrl?: string | null
  isActive?: boolean
}

// Product Types
export interface ProductRawMaterial {
  id?: string
  sr: number
  categoryId?: string | null
  rawMaterial: string
  rawMaterialCode: string | null
  rawMaterialId: string | null
  labelClaim: string
  labelClaimMgPerUnit: number
}

export type ProductType = 'capsule' | 'tablets' | 'softgel' | 'liquid' | 'lozengers' | 'powder'

export interface Product {
  id: string
  name: string
  type?: ProductType
  npn?: string | null
  rm: ProductRawMaterial[]
  createdAt?: number
  updatedAt?: number
}

export interface CreateProductInput {
  name: string
  type?: ProductType
  npn?: string | null
  rm: ProductRawMaterial[]
}

// Label Inventory Types
export type LabelInventoryType = ProductType
export type LabelDosageType = '60' | '90' | '120' | '180' | '240'

export interface LabelInventory {
  id: string
  brandId: string
  brandName: string
  productId: string
  productName: string
  type?: LabelInventoryType
  dosageType?: LabelDosageType
  labelName: string
  quantity: number
  reorderLevel: number
  notes: string | null
  isActive: boolean
  createdAt: number
  updatedAt: number
}

export interface CreateLabelInventoryInput {
  brandId: string
  productId: string
  type?: LabelInventoryType
  dosageType?: LabelDosageType
  labelName?: string
  quantity: number
  reorderLevel?: number
  notes?: string
  isActive?: boolean
}

export interface LabelStockValidationResult {
  hasShortage: boolean
  required: number
  available: number
  shortage: number
}

// Raw Material Types
export interface RawMaterialCategory {
  id: string
  name: string
  description?: string | null
  isActive: boolean
  createdAt: number
  updatedAt: number
}

export interface CreateRawMaterialCategoryInput {
  id?: string
  name: string
  description?: string | null
  isActive?: boolean
}

export interface RawMaterial {
  id: string
  code: string
  name: string
  qty: number
  qtyKg: number
  categoryId?: string | null
  category?: string | null
  location?: string | null
  coaLink?: string | null
  comments?: string | null
  pricePerKg: number
  createdAt: number
  updatedAt: number
}

export interface CreateRawMaterialInput {
  name: string
  qty: number
  categoryId?: string | null
  category?: string
  location?: string
  coaLink?: string | null
  comments?: string | null
  pricePerKg: number
  code?: string
}

// Employee Types
export interface Employee {
  id: string
  name: string
  salary: number
  department: string
  position: string
  joinDate: number
  isActive: boolean
  createdAt: number
  updatedAt: number
}

export interface CreateEmployeeInput {
  name: string
  salary: number
  department: string
  position: string
  joinDate?: number
  isActive?: boolean
}

// Expense Types
export interface Expense {
  id: string
  bookId: string
  category: string
  description: string
  amount: number
  date: number
  createdAt: number
  updatedAt: number
}

export interface ExpenseBook {
  id: string
  name: string
  description?: string
  createdAt: number
  updatedAt: number
}

export interface CreateExpenseInput {
  bookId: string
  category: string
  description: string
  amount: number
  date: number
}

// Vendor Types
export type VendorCategory =
  | 'raw_material_supplier'
  | 'bottles_jars'
  | 'lid_supplier'
  | 'label_supplier'
  | 'printer'
  | 'printing_vendor'
  | 'machine'
  | 'logistic'

export interface Vendor {
  id: string
  name: string
  shortCode: string | null
  vendorCode: string | null
  categories: VendorCategory[]
  email: string | null
  phone: string | null
  whatsapp: string | null
  country: string | null
  city: string | null
  address: string | null
  website: string | null
  paymentTerms: string | null
  notes: string | null
  isActive: boolean
  deleted?: boolean
  createdAt: number
  updatedAt: number
}

export interface CreateVendorInput {
  name: string
  shortCode?: string
  vendorCode: string
  categories?: VendorCategory[]
  phone?: string
  email?: string
  whatsapp?: string
  country?: string
  city?: string
  address?: string
  website?: string
  paymentTerms?: string
  notes?: string
  isActive?: boolean
}

// Purchase Order Types
export type PurchaseOrderType = 'raw_material' | 'label' | 'product' | 'bottles_lids'
export type PurchaseOrderStatus = 'given' | 'working' | 'sent' | 'received' | 'canceled'

export interface PurchaseOrder {
  id: string
  poNumber: string
  vendorId: string
  vendorName: string
  vendorCode: string
  orderType: PurchaseOrderType
  status: PurchaseOrderStatus
  itemName: string
  quantity: number
  unit: string | null
  unitPrice: number | null
  totalAmount: number | null
  brandId: string | null
  brandName: string | null
  productId: string | null
  productName: string | null
  rawMaterialId: string | null
  rawMaterialCode: string | null
  rawMaterialName: string | null
  labelInventoryId: string | null
  labelName: string | null
  location: string | null
  expectedDate: string | null
  receivedDate: string | null
  notes: string | null
  postedToInventory: boolean
  createdAt: number
  updatedAt: number
}

export interface CreatePurchaseOrderInput {
  id?: string
  vendorId: string
  orderType: PurchaseOrderType
  status: PurchaseOrderStatus
  itemName?: string
  quantity: number
  unit?: string | null
  unitPrice?: number | null
  brandId?: string | null
  productId?: string | null
  rawMaterialId?: string | null
  labelInventoryId?: string | null
  labelName?: string | null
  location?: string | null
  expectedDate?: string | null
  receivedDate?: string | null
  notes?: string | null
}

// API Response Types
export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface ApiErrorResponse {
  error: string
  details?: unknown
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

// Stock Validation Types
export interface StockValidationResult {
  hasShortages: boolean
  shortages: StockShortage[]
  usage: StockUsage[]
}

export interface StockShortage {
  rawMaterialId: string
  rawMaterialCode: string
  rawMaterialName: string
  required: number
  available: number
  shortage: number
}

export interface StockUsage {
  rawMaterialId: string
  rawMaterialCode: string
  rawMaterialName: string
  required: number
  available: number
}

// Finished Goods Types
export type FGCategory = 'powder' | 'capsule' | 'bottle'
export type FGChangeSource = 'auto' | 'manual'

export interface FinishedGood {
  id: string
  brandId?: string | null
  productId?: string | null
  batchCode?: string | null
  brandName?: string | null
  productName?: string | null
  category: FGCategory
  name: string
  location: string
  comments: string
  // Powder-specific
  powderNo: string | null
  rackNo: string | null
  weightKg: number | null
  // Capsule-specific
  capsuleCode: string | null
  bucket: string | null
  capsuleMg: number | null
  capsuleWeightKg: number | null
  capsuleAmount: number | null
  capsuleStatus: string | null
  // Bottle-specific
  boxNo: string | null
  bottleTotal: number | null
  expiryDate: string | null
  createdAt: number
  updatedAt: number
}

export interface FinishedGoodHistory {
  id: string
  finishedGoodId: string
  changeSource: FGChangeSource
  changeType: string
  changes: Record<string, { old: unknown; new: unknown }>
  reason: string | null
  createdAt: number
}

// Delete Cascade Result
export interface DeleteCascadeResult {
  restored: Record<string, number>
  deleted: {
    mixing: number
    njp: number
    assembly: number
  }
}

// PO Document Types
export type PODocumentStatus = 'draft' | 'sent' | 'received' | 'canceled'
export type PODocumentItemType = 'raw_material' | 'label' | 'product' | 'bottles_lids' | 'custom'

export interface PODocumentItem {
  id: string
  poDocumentId: string
  sr: number
  orderType: PODocumentItemType
  itemId: string | null
  itemName: string
  quantity: number
  unitPrice: number | null
  totalPrice: number | null
}

export interface PODocument {
  id: string
  poNumber: string
  vendorId: string | null
  vendorName: string
  vendorAddress: string | null
  shipToName: string
  shipToAddress: string | null
  shipToPhone: string | null
  brandId: string | null
  poDate: string
  termsConditions: string | null
  status: PODocumentStatus
  items: PODocumentItem[]
  createdAt: number
  updatedAt: number
}

export interface CreatePODocumentInput {
  id?: string
  poNumber?: string
  vendorId?: string | null
  vendorName?: string
  vendorAddress?: string | null
  shipToName?: string
  shipToAddress?: string | null
  shipToPhone?: string | null
  brandId?: string | null
  poDate?: string
  termsConditions?: string | null
  status?: PODocumentStatus
  items?: Array<{
    id?: string
    sr: number
    orderType: PODocumentItemType
    itemId?: string | null
    itemName: string
    quantity: number
    unitPrice?: number | null
    totalPrice?: number | null
  }>
}
