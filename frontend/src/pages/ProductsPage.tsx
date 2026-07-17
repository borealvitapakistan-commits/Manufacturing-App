// ============================================================================
// Products Page
// ============================================================================

'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Card,
  Button,
  Input,
  Select,
  Label,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
  ConfirmDialog,
  useToast
} from '@/components/ui'
import {
  initSupabase,
  fetchProducts,
  fetchRawMaterials,
  fetchRawMaterialCategories,
  saveProduct,
  deleteProduct
} from '@/lib/supabase/data'
import type { Product, ProductRawMaterial, ProductType, RawMaterial, RawMaterialCategory } from '@/types'

// ============================================================================
// Types
// ============================================================================

interface RMFormRow {
  id: string
  sr: number
  categoryId: string
  rawMaterialId: string
  rawMaterialCode: string | null
  rawMaterial: string
  labelClaim: string
}

interface FormState {
  name: string
  type: ProductType | ''
  npn: string
  rm: RMFormRow[]
}

type ProductView = 'products' | 'create-product'

// ============================================================================
// Helpers
// ============================================================================

const uid = () => Math.random().toString(36).slice(2, 9)

const PRODUCT_TYPE_OPTIONS: Array<{ value: ProductType; label: string }> = [
  { value: 'capsule', label: 'Capsule' },
  { value: 'tablets', label: 'Tablets' },
  { value: 'softgel', label: 'Softgel' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'lozengers', label: 'Lozengers' },
  { value: 'powder', label: 'Powder' }
]

const emptyRM = (sr: number = 1): RMFormRow => ({
  id: uid(),
  sr,
  categoryId: '',
  rawMaterialId: '',
  rawMaterialCode: null,
  rawMaterial: '',
  labelClaim: ''
})

const createDefaultForm = (): FormState => ({
  name: '',
  type: 'capsule',
  npn: '',
  rm: [emptyRM()]
})

function viewButtonClass(active: boolean): string {
  return `rounded-xl border px-4 py-2 text-sm font-medium transition ${
    active
      ? 'border-[#1D838D] bg-[#1D838D] text-white'
      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
  }`
}

// Parse label claim string to mg value
function parseLabelClaimToMg(claim: string): number {
  const str = (claim || '').toLowerCase().trim()
  const match = str.match(/([0-9]+(?:\.[0-9]+)?)\s*(mg|g|mcg|µg|ug)?/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  const unit = (match[2] || 'mg').toLowerCase()
  if (unit === 'g') return value * 1000
  if (unit === 'mcg' || unit === 'µg' || unit === 'ug') return value / 1000
  return value // mg
}

function normalizeText(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

function formatProductType(value: string | null | undefined): string {
  return PRODUCT_TYPE_OPTIONS.find(option => option.value === value)?.label || '-'
}

function findMatchingRawMaterial(
  row: ProductRawMaterial,
  rawMaterials: RawMaterial[]
): RawMaterial | null {
  if (row.rawMaterialId) {
    const byId = rawMaterials.find(rm => rm.id === row.rawMaterialId)
    if (byId) return byId
  }

  const code = normalizeText(row.rawMaterialCode)
  if (code) {
    const byCode = rawMaterials.find(rm => normalizeText(rm.code) === code)
    if (byCode) return byCode
  }

  const name = normalizeText(row.rawMaterial)
  if (name) {
    const byName = rawMaterials.find(rm => normalizeText(rm.name) === name)
    if (byName) return byName
  }

  return null
}

// ============================================================================
// Component
// ============================================================================

export default function ProductsPage() {
  const [activeView, setActiveView] = useState<ProductView>('products')
  const [products, setProducts] = useState<Product[]>([])
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [categories, setCategories] = useState<RawMaterialCategory[]>([])
  const [form, setForm] = useState<FormState>(createDefaultForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { showToast } = useToast()

  // Filter products based on search
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return products
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.npn || '').toLowerCase().includes(q)
    )
  }, [searchQuery, products])

  const rawMaterialById = useMemo(() => {
    return new Map(rawMaterials.map(rm => [rm.id, rm]))
  }, [rawMaterials])

  const activeCategories = useMemo(
    () => categories.filter(category => category.isActive !== false),
    [categories]
  )

  const otherCategory = useMemo(
    () => categories.find(category => category.name.trim().toLowerCase() === 'other') || null,
    [categories]
  )

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      await initSupabase()
      const [productList, materialList, categoryList] = await Promise.all([
        fetchProducts(),
        fetchRawMaterials(),
        fetchRawMaterialCategories({ activeOnly: true })
      ])
      setProducts(productList as Product[])
      setRawMaterials(materialList as RawMaterial[])
      setCategories(categoryList as RawMaterialCategory[])
    } catch (err) {
      console.error('Failed to load products:', err)
      setError('Failed to load products.')
    } finally {
      setLoading(false)
    }
  }

  function validateForm(): string | null {
    if (!form.name.trim()) return 'Product name is required.'
    if (!form.type) return 'Product type is required.'
    const filledRows = form.rm.filter(r => r.rawMaterialId || r.rawMaterial.trim() || r.labelClaim.trim())
    if (filledRows.length === 0) return 'Select at least one raw material.'
    if (filledRows.some(r => !r.categoryId)) return 'Select a raw material category for every RM row.'
    if (filledRows.some(r => !r.rawMaterialId)) return 'Select a raw material from the list for every RM row.'
    if (filledRows.some(r => !r.labelClaim.trim())) return 'Enter label claim for every selected raw material.'
    return null
  }

  async function handleSave() {
    setError('')
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setSaving(true)

      // Clean up RM rows - filter out empty ones and renumber
      const cleanedRM: ProductRawMaterial[] = form.rm
        .filter(r => r.rawMaterialId || r.rawMaterial.trim() || r.labelClaim.trim())
        .map((r, idx) => ({
          id: r.id,
          sr: idx + 1,
          categoryId: rawMaterialById.get(r.rawMaterialId)?.categoryId || r.categoryId || null,
          rawMaterial: rawMaterialById.get(r.rawMaterialId)?.name || r.rawMaterial.trim(),
          rawMaterialCode: rawMaterialById.get(r.rawMaterialId)?.code || r.rawMaterialCode || null,
          rawMaterialId: r.rawMaterialId,
          labelClaim: r.labelClaim.trim(),
          labelClaimMgPerUnit: parseLabelClaimToMg(r.labelClaim)
        }))

      const payload = {
        id: editingId || undefined,
        name: form.name.trim(),
        type: form.type || 'capsule',
        npn: form.npn.trim() || null,
        rm: cleanedRM
      }

      await saveProduct(payload)

      showToast({
        message: editingId ? 'Product updated' : 'Product created',
        type: 'success'
      })

      resetForm()
      setActiveView('products')
      await loadData()
    } catch (err) {
      console.error('Failed to save product:', err)
      setError(err instanceof Error ? err.message : 'Failed to save product.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return

    try {
      setDeleting(true)
      await deleteProduct(deleteTarget.id)
      setProducts(prev => prev.filter(p => p.id !== deleteTarget.id))
      showToast({ message: 'Product deleted', type: 'success' })
      setDeleteTarget(null)

      // Clear form if we were editing this product
      if (editingId === deleteTarget.id) {
        resetForm()
      }
    } catch (err) {
      console.error('Failed to delete product:', err)
      showToast({ message: 'Failed to delete product', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  function startEdit(product: Product) {
    setEditingId(product.id)
    setActiveView('create-product')
    setForm({
      name: product.name || '',
      type: product.type || 'capsule',
      npn: product.npn || '',
      rm: (product.rm || []).map((r, idx) => {
        const matchedMaterial = findMatchingRawMaterial(r, rawMaterials)
        return {
          id: r.id || uid(),
          sr: idx + 1,
          categoryId: matchedMaterial?.categoryId || r.categoryId || otherCategory?.id || '',
          rawMaterialId: matchedMaterial?.id || r.rawMaterialId || '',
          rawMaterialCode: matchedMaterial?.code || r.rawMaterialCode || null,
          rawMaterial: matchedMaterial?.name || r.rawMaterial || '',
          labelClaim: r.labelClaim || ''
        }
      })
    })
    // Add empty row if no RM
    if (!product.rm || product.rm.length === 0) {
      setForm(f => ({ ...f, rm: [emptyRM()] }))
    }
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setForm(createDefaultForm())
    setEditingId(null)
    setError('')
  }

  function addRMRow() {
    setForm(f => ({
      ...f,
      rm: [...f.rm, emptyRM(f.rm.length + 1)]
    }))
  }

  function removeRMRow(id: string) {
    setForm(f => ({
      ...f,
      rm: f.rm.filter(r => r.id !== id).map((r, i) => ({ ...r, sr: i + 1 }))
    }))
  }

  function updateRMRow(id: string, field: 'labelClaim', value: string) {
    setForm(f => ({
      ...f,
      rm: f.rm.map(r => r.id === id ? { ...r, [field]: value } : r)
    }))
  }

  function updateRMCategory(id: string, categoryId: string) {
    setForm(f => ({
      ...f,
      rm: f.rm.map(r => r.id === id
        ? {
            ...r,
            categoryId,
            rawMaterialId: '',
            rawMaterialCode: null,
            rawMaterial: ''
          }
        : r
      )
    }))
  }

  function updateRMSelection(id: string, rawMaterialId: string) {
    const material = rawMaterialById.get(rawMaterialId)
    setForm(f => ({
      ...f,
      rm: f.rm.map(r => r.id === id
        ? {
            ...r,
            categoryId: material?.categoryId || r.categoryId,
            rawMaterialId,
            rawMaterialCode: material?.code || null,
            rawMaterial: material?.name || ''
          }
        : r
      )
    }))
  }

  function renderRawMaterialSelect(row: RMFormRow) {
    const filteredMaterials = row.categoryId
      ? rawMaterials.filter(material => material.categoryId === row.categoryId)
      : []

    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <Label>Raw Material Category</Label>
            <Select
              value={row.categoryId}
              onChange={e => updateRMCategory(row.id, e.target.value)}
            >
              <option value="">Select Category</option>
              {activeCategories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="button"
            variant="subtle"
            className="w-full sm:w-auto"
            disabled={!otherCategory}
            onClick={() => otherCategory && updateRMCategory(row.id, otherCategory.id)}
          >
            Other
          </Button>
        </div>
        <div>
          <Label>Raw Material Name</Label>
          <Select
            value={row.rawMaterialId}
            onChange={e => updateRMSelection(row.id, e.target.value)}
            disabled={!row.categoryId}
          >
            <option value="">Select Raw Material</option>
            {filteredMaterials.map(material => (
              <option key={material.id} value={material.id}>
                {material.code} - {material.name} ({material.qty ?? 0} kg)
              </option>
            ))}
          </Select>
        </div>
        {!row.rawMaterialId && row.rawMaterial && (
          <p className="mt-1 text-xs text-amber-700">
            Previous typed value: {row.rawMaterial}. Select the matching raw material before saving.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Products</h1>
        <p className="text-zinc-600">Manage product definitions and raw material claims</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-100 text-rose-800 border border-rose-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={viewButtonClass(activeView === 'products')}
          onClick={() => {
            resetForm()
            setActiveView('products')
          }}
        >
          Products
        </button>
        <button
          type="button"
          className={viewButtonClass(activeView === 'create-product')}
          onClick={() => {
            resetForm()
            setActiveView('create-product')
          }}
        >
          Create Product
        </button>
      </div>

      {activeView === 'create-product' && (
        <Card
          title={editingId ? 'Edit Product' : 'Create Product'}
          actions={
            <div className="flex gap-2 flex-wrap">
              <Button variant="ghost" onClick={resetForm}>Clear</Button>
              <Button onClick={handleSave} loading={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Product Details */}
            <div className="grid max-w-6xl gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Label>Product Name *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Multivitamin 500mg"
                />
              </div>
              <div>
                <Label>Product Type *</Label>
                <Select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value as ProductType })}
                >
                  {PRODUCT_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>NPN</Label>
                <Input
                  value={form.npn}
                  onChange={e => setForm({ ...form, npn: e.target.value })}
                  placeholder="e.g., 80126068"
                />
              </div>
            </div>

            <div className="border-t border-zinc-200 pt-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-base font-semibold text-zinc-950">Raw Materials</h4>
                  <p className="text-sm text-zinc-500">Select a category, then choose the raw material and enter its label claim.</p>
                </div>
                <Button variant="subtle" onClick={addRMRow}>Add RM</Button>
              </div>

              <div className="space-y-4">
                {form.rm.map((r, idx) => (
                  <div key={r.id} className="rounded-lg border border-zinc-200 bg-white p-4">
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="font-semibold text-zinc-900">Raw Material {idx + 1}</div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeRMRow(r.id)}
                      >
                        Delete
                      </Button>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
                      <div>{renderRawMaterialSelect(r)}</div>
                      <div>
                        <Label>Label Claim</Label>
                        <Input
                          placeholder="e.g., 100 mg per capsule"
                          value={r.labelClaim}
                          onChange={e => updateRMRow(r.id, 'labelClaim', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeView === 'products' && (
        <Card
          title="Products"
          actions={
            <div className="flex gap-2 items-center w-full sm:w-auto">
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-11"
              />
            </div>
          }
        >
          {/* Mobile List */}
          <div className="md:hidden space-y-3">
            {loading ? (
              <div className="py-4 text-center text-zinc-500">Loading...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-4 text-center text-zinc-500">No products found.</div>
            ) : (
              filteredProducts.map(p => (
                <div key={p.id} className="rounded-xl border border-zinc-200 p-3 bg-white">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-zinc-500">Type: {formatProductType(p.type)}</div>
                  <div className="text-xs text-zinc-500">NPN: {p.npn || '-'}</div>
                  <div className="text-xs text-zinc-500 mb-2">RM count: {p.rm?.length || 0}</div>
                  <div className="flex gap-2">
                    <Button variant="subtle" size="sm" onClick={() => startEdit(p)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => setDeleteTarget(p)}>Delete</Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden min-w-0 md:block">
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-32">Type</TableHead>
                  <TableHead className="w-32">NPN</TableHead>
                  <TableHead className="w-24">RM count</TableHead>
                  <TableHead className="w-40">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableLoading colSpan={5} />
                ) : filteredProducts.length === 0 ? (
                  <TableEmpty colSpan={5} message="No products found." />
                ) : (
                  filteredProducts.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{formatProductType(p.type)}</TableCell>
                      <TableCell>{p.npn || '-'}</TableCell>
                      <TableCell>{p.rm?.length || 0}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="subtle" size="sm" onClick={() => startEdit(p)}>Edit</Button>
                          <Button variant="danger" size="sm" onClick={() => setDeleteTarget(p)}>Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Product?"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This may affect manufacturing records that use this product.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
