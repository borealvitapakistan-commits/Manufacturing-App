// ============================================================================
// Labels Page
// ============================================================================

'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Button,
  Input,
  NumberInput,
  Select,
  TextArea,
  Label,
  Checkbox,
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
  fetchBrands,
  fetchProducts,
  fetchLabelInventory,
  saveLabelInventory,
  deleteLabelInventory
} from '@/lib/supabase/data'
import { formatDate } from '@/lib/utils'
import type { Brand, Product, LabelDosageType, LabelInventory, LabelInventoryType } from '@/types'

interface FormState {
  brandId: string
  productId: string
  type: LabelInventoryType
  dosageType: LabelDosageType
  labelName: string
  quantity: string
  reorderLevel: string
  notes: string
  isActive: boolean
}

type LabelView = 'labels' | 'create-label'

const defaultForm: FormState = {
  brandId: '',
  productId: '',
  type: 'capsule',
  dosageType: '60',
  labelName: 'Standard Label',
  quantity: '',
  reorderLevel: '0',
  notes: '',
  isActive: true
}

const LABEL_TYPE_OPTIONS: Array<{ value: LabelInventoryType; label: string }> = [
  { value: 'capsule', label: 'Capsule' },
  { value: 'tablets', label: 'Tablets' },
  { value: 'softgel', label: 'Softgel' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'lozengers', label: 'Lozengers' },
  { value: 'powder', label: 'Powder' }
]

const DOSAGE_TYPE_OPTIONS: LabelDosageType[] = ['60', '90', '120', '180', '240']

function viewButtonClass(active: boolean): string {
  return `rounded-xl border px-4 py-2 text-sm font-medium transition ${
    active
      ? 'border-[#1D838D] bg-[#1D838D] text-white'
      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
  }`
}

function formatLabelType(value: string | null | undefined): string {
  return LABEL_TYPE_OPTIONS.find(option => option.value === value)?.label || '-'
}

export default function LabelsPage() {
  const [activeView, setActiveView] = useState<LabelView>('labels')
  const [labels, setLabels] = useState<LabelInventory[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState<FormState>(defaultForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<LabelInventory | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { showToast } = useToast()

  const activeBrands = useMemo(() => brands.filter((brand) => brand.isActive !== false), [brands])

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError('')
      await initSupabase()

      const [brandList, productList] = await Promise.all([
        fetchBrands(),
        fetchProducts()
      ])

      setBrands(brandList as Brand[])
      setProducts(productList as Product[])

      try {
        const labelList = await fetchLabelInventory()
        setLabels(labelList as LabelInventory[])
      } catch (labelError) {
        console.error('Label inventory schema not available:', labelError)
        setLabels([])
        setError('Label inventory table is missing or outdated. Run the Supabase migrations through 018_product_label_types_and_raw_material_categories.sql.')
      }
    } catch (err) {
      console.error('Failed to load labels:', err)
      setError('Failed to load labels.')
    } finally {
      setLoading(false)
    }
  }

  function validateForm(): string | null {
    if (!form.brandId) return 'Brand is required.'
    if (!form.productId) return 'Product is required.'
    if (!form.type) return 'Type is required.'
    if (!form.dosageType) return 'Dosage type is required.'
    if (!form.labelName.trim()) return 'Label name is required.'

    const quantity = Number(form.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) {
      return 'Quantity must be 0 or greater.'
    }

    const reorderLevel = Number(form.reorderLevel)
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      return 'Reorder level must be 0 or greater.'
    }

    return null
  }

  async function handleSave() {
    setError('')
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    const brand = brands.find((item) => item.id === form.brandId)
    const product = products.find((item) => item.id === form.productId)

    if (!brand || !product) {
      setError('Selected brand or product is invalid.')
      return
    }

    try {
      setSaving(true)
      await saveLabelInventory({
        id: editingId || undefined,
        brandId: form.brandId,
        brandName: brand.name,
        productId: form.productId,
        productName: product.name,
        type: form.type,
        dosageType: form.dosageType,
        labelName: form.labelName.trim(),
        quantity: Number(form.quantity) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        notes: form.notes.trim() || null,
        isActive: form.isActive
      })

      showToast({
        message: editingId ? 'Label inventory updated' : 'Label inventory created',
        type: 'success'
      })

      resetForm()
      setActiveView('labels')
      await loadData()
    } catch (err) {
      console.error('Failed to save label inventory:', err)
      setError(err instanceof Error ? err.message : 'Failed to save label inventory.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return

    try {
      setDeleting(true)
      await deleteLabelInventory(deleteTarget.id)
      setLabels((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      showToast({ message: 'Label inventory deleted', type: 'success' })
    } catch (err) {
      console.error('Failed to delete label inventory:', err)
      showToast({ message: 'Failed to delete label inventory', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  function startEdit(item: LabelInventory) {
    setEditingId(item.id)
    setActiveView('create-label')
    setForm({
      brandId: item.brandId,
      productId: item.productId,
      type: item.type || 'capsule',
      dosageType: item.dosageType || '60',
      labelName: item.labelName || 'Standard Label',
      quantity: String(item.quantity ?? 0),
      reorderLevel: String(item.reorderLevel ?? 0),
      notes: item.notes || '',
      isActive: item.isActive !== false
    })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setForm(defaultForm)
    setEditingId(null)
    setError('')
  }

  async function toggleActive(item: LabelInventory) {
    try {
      await saveLabelInventory({
        id: item.id,
        isActive: item.isActive === false
      })

      setLabels((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? { ...entry, isActive: !(item.isActive !== false) }
            : entry
        )
      )

      showToast({
        message: item.isActive !== false ? 'Label entry deactivated' : 'Label entry activated',
        type: 'success'
      })
    } catch (err) {
      console.error('Failed to toggle label entry:', err)
      showToast({ message: 'Failed to update label entry', type: 'error' })
    }
  }

  const lowStockCount = labels.filter((item) => {
    if (item.isActive === false) return false
    return Number(item.quantity || 0) <= Number(item.reorderLevel || 0)
  }).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Labels</h1>
        <p className="text-zinc-600">Manage product label inventory by brand and product</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-100 text-rose-800 border border-rose-200">
          {error}
        </div>
      )}

      {lowStockCount > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 text-amber-900 border border-amber-200">
          Warning: {lowStockCount} label entries are at or below reorder level.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={viewButtonClass(activeView === 'labels')}
          onClick={() => {
            resetForm()
            setActiveView('labels')
          }}
        >
          Labels
        </button>
        <button
          type="button"
          className={viewButtonClass(activeView === 'create-label')}
          onClick={() => {
            resetForm()
            setActiveView('create-label')
          }}
        >
          Create Label
        </button>
      </div>

      {activeView === 'create-label' && (
      <Card
        title={editingId ? 'Edit Label' : 'Create Label'}
        actions={(
          <div className="flex gap-2">
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>Cancel</Button>
            )}
            <Button onClick={handleSave} loading={saving}>
              {saving ? 'Saving...' : editingId ? 'Update Label' : 'Save Label'}
            </Button>
          </div>
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Brand *</Label>
            <Select
              value={form.brandId}
              onChange={(e) => setForm({ ...form, brandId: e.target.value })}
            >
              <option value="">-- Select Brand --</option>
              {activeBrands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Product *</Label>
            <Select
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            >
              <option value="">-- Select Product --</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Label Name *</Label>
            <Input
              value={form.labelName}
              onChange={(e) => setForm({ ...form, labelName: e.target.value })}
              placeholder="e.g., Standard Label"
            />
          </div>
          <div>
            <Label>Type *</Label>
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as LabelInventoryType })}
            >
              {LABEL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Dosage Type *</Label>
            <Select
              value={form.dosageType}
              onChange={(e) => setForm({ ...form, dosageType: e.target.value as LabelDosageType })}
            >
              {DOSAGE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Quantity *</Label>
            <NumberInput
              min="0"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="e.g., 5000"
            />
          </div>

          <div>
            <Label>Reorder Level</Label>
            <NumberInput
              min="0"
              value={form.reorderLevel}
              onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
              placeholder="e.g., 1000"
            />
          </div>
          <div className="flex items-end">
            <Checkbox
              id="labels-is-active"
              label="Active entry"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
          </div>

          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <TextArea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional notes for purchasing or printing"
            />
          </div>
        </div>
      </Card>
      )}

      {activeView === 'labels' && (
      <Card title="Labels">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Dosage</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Reorder Level</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoading colSpan={10} />
            ) : labels.length === 0 ? (
              <TableEmpty colSpan={10} message="No label inventory found. Add your first entry." />
            ) : (
              labels.map((item) => {
                const quantity = Number(item.quantity || 0)
                const reorderLevel = Number(item.reorderLevel || 0)
                const isLowStock = item.isActive !== false && quantity <= reorderLevel

                return (
                  <TableRow key={item.id}>
                    <TableCell>{item.brandName}</TableCell>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell>{formatLabelType(item.type)}</TableCell>
                    <TableCell>{item.dosageType || '-'}</TableCell>
                    <TableCell className="font-medium">{item.labelName}</TableCell>
                    <TableCell>{quantity}</TableCell>
                    <TableCell>{reorderLevel}</TableCell>
                    <TableCell>
                      {item.isActive === false ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-zinc-100 text-zinc-600">
                          Inactive
                        </span>
                      ) : isLowStock ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-800">
                          Low Stock
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-800">
                          Sufficient
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(item.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={() => startEdit(item)}
                        >
                          Edit
                        </Button>

                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={() => void toggleActive(item)}
                        >
                          {item.isActive !== false ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeleteTarget(item)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Label Entry?"
        description={`Are you sure you want to delete "${deleteTarget?.labelName}" for ${deleteTarget?.brandName}?`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
