// ============================================================================
// Raw Materials Page
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
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
  deleteRawMaterialCategory,
  fetchRawMaterialCategories,
  fetchRawMaterials,
  saveRawMaterialCategory,
  saveRawMaterial,
  deleteRawMaterial
} from '@/lib/supabase/data'
import type { RawMaterial, RawMaterialCategory } from '@/types'

interface FormState {
  name: string
  qty: string
  categoryId: string
  category: string
  location: string
  coaLink: string
  comments: string
  pricePerKg: string
}

const defaultForm: FormState = {
  name: '',
  qty: '',
  categoryId: '',
  category: '',
  location: '',
  coaLink: '',
  comments: '',
  pricePerKg: ''
}

interface CategoryFormState {
  name: string
  description: string
  isActive: boolean
}

type RawMaterialsView = 'materials' | 'create-material' | 'create-category' | 'categories'

const defaultCategoryForm: CategoryFormState = {
  name: '',
  description: '',
  isActive: true
}

function viewButtonClass(active: boolean): string {
  return `rounded-xl border px-4 py-2 text-sm font-medium transition ${
    active
      ? 'border-[#1D838D] bg-[#1D838D] text-white'
      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
  }`
}

// ============================================================================
// Code Generation Logic (from legacy)
// ============================================================================

function generateNameCode(nameOnly: string | string[]): string {
  const parts = Array.isArray(nameOnly) ? nameOnly : nameOnly.trim().split(/\s+/)

  if (!parts.length) return 'UNK'

  if (parts.length === 1) {
    return parts[0].substring(0, 3).toUpperCase()
  }

  if (parts.length === 2) {
    return (
      parts[0].substring(0, 3).toUpperCase() +
      '_' +
      parts[1].substring(0, 3).toUpperCase()
    )
  }

  const first = parts[0].substring(0, 3).toUpperCase()
  const second = parts[1].substring(0, 3).toUpperCase()
  const remaining = parts.slice(2).map(w => w[0].toUpperCase()).join('')

  return `${first}_${second}_${remaining}`
}

function parseMaterialParts(fullName: string): { nameWords: string[]; chemicalText: string; extractRatio: string } {
  const raw = (fullName || '').trim()
  if (!raw) return { nameWords: [], chemicalText: '', extractRatio: '' }

  const extractMatch = raw.match(/\b(\d+\s*:\s*\d+)\b/)
  const extractRatio = extractMatch ? extractMatch[1].replace(/\s+/g, '') : ''

  // Prefer % inside parentheses; otherwise fall back to any % token
  const parenChem = raw.match(/\(([^)]*?%[^)]*)\)/)
  let chemicalText = parenChem ? parenChem[1] : ''
  if (!chemicalText) {
    const anyPercent = raw.match(/[^()]*?(\d+(?:\.\d+)?)\s*%/)
    if (anyPercent) chemicalText = anyPercent[0].trim()
  }

  const nameWithoutParens = raw.replace(/\([^)]*\)/g, ' ')
  const cleanedName = nameWithoutParens
    .replace(/\b\d+\s*:\s*\d+\b/g, ' ')
    .replace(/(\d+(?:\.\d+)?)\s*%/g, ' ')
  const nameWords = cleanedName.split(/\s+/).filter(Boolean)

  return { nameWords, chemicalText, extractRatio }
}

function buildChemicalCode(chemicalText: string): string {
  if (!chemicalText) return ''
  const percentMatch = chemicalText.match(/(\d+(?:\.\d+)?)\s*%/)
  if (!percentMatch) return ''
  const percent = percentMatch[1] + '%'
  const chemOnly = chemicalText.replace(/(\d+(?:\.\d+)?)\s*%/g, '').trim()
  const chemWords = chemOnly.split(/\s+/).filter(Boolean)
  if (!chemWords.length) return percent
  const chemAbbrev = chemWords.map(w => w.substring(0, 3).toUpperCase()).join('_')
  return `${chemAbbrev}_${percent}`
}

function generateRMCode(fullName: string): string {
  const parts = parseMaterialParts(fullName)
  const nameCode = generateNameCode(parts.nameWords)
  const chemicalCode = buildChemicalCode(parts.chemicalText)
  const extractCode = parts.extractRatio

  const final = ['RM-' + nameCode]
  if (chemicalCode) final.push(chemicalCode)
  if (extractCode) final.push(extractCode)

  return final.join('-')
}

function normalizeText(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

// ============================================================================
// Component
// ============================================================================

export default function RawMaterialsPage() {
  const [activeView, setActiveView] = useState<RawMaterialsView>('materials')
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [categories, setCategories] = useState<RawMaterialCategory[]>([])
  const [form, setForm] = useState<FormState>(defaultForm)
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(defaultCategoryForm)
  const [categoryEditingId, setCategoryEditingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<RawMaterial | null>(null)
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<RawMaterialCategory | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [categorySaving, setCategorySaving] = useState(false)
  const [categoryDeleting, setCategoryDeleting] = useState(false)
  const { showToast } = useToast()
  const editingMaterial = materials.find(m => m.id === editingId) || null

  const activeCategories = categories.filter(category => category.isActive !== false)
  const otherCategory = categories.find(category => normalizeText(category.name) === 'other') || null

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      await initSupabase()
      const [list, categoryList] = await Promise.all([
        fetchRawMaterials(),
        fetchRawMaterialCategories()
      ])
      setMaterials(list as RawMaterial[])
      setCategories(categoryList as RawMaterialCategory[])
      const defaultCategory = (categoryList as RawMaterialCategory[]).find(
        category => normalizeText(category.name) === 'other'
      )
      if (defaultCategory && !editingId) {
        setForm(prev => prev.categoryId ? prev : { ...prev, categoryId: defaultCategory.id })
      }
    } catch (err) {
      console.error('Failed to load raw materials:', err)
      setError('Failed to load raw materials.')
    } finally {
      setLoading(false)
    }
  }

  function validateForm(): string | null {
    if (!form.name.trim()) return 'Material name is required.'
    if (!form.categoryId && !otherCategory) return 'Create or select a material category.'
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

      const code = generateRMCode(form.name.trim())
      const selectedCategory = categories.find(category => category.id === (form.categoryId || otherCategory?.id))

      const payload = {
        id: editingId || undefined,
        name: form.name.trim(),
        code,
        qty: Number(form.qty) || 0,
        categoryId: form.categoryId || otherCategory?.id || null,
        category: selectedCategory?.name || form.category.trim() || null,
        location: form.location.trim() || null,
        coaLink: form.coaLink.trim() || null,
        comments: form.comments.trim() || null,
        pricePerKg: Number(form.pricePerKg) || 0
      }

      await saveRawMaterial(payload)

      showToast({
        message: editingId ? 'Material updated' : 'Material created',
        type: 'success'
      })

      resetForm()
      setActiveView('materials')
      await loadData()
    } catch (err) {
      console.error('Failed to save material:', err)
      setError('Failed to save material.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCategorySave() {
    setError('')
    if (!categoryForm.name.trim()) {
      setError('Category name is required.')
      return
    }

    try {
      setCategorySaving(true)
      await saveRawMaterialCategory({
        id: categoryEditingId || undefined,
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || null,
        isActive: categoryForm.isActive
      })
      showToast({
        message: categoryEditingId ? 'Category updated' : 'Category created',
        type: 'success'
      })
      resetCategoryForm()
      setActiveView('categories')
      await loadData()
    } catch (err) {
      console.error('Failed to save category:', err)
      setError('Failed to save category.')
    } finally {
      setCategorySaving(false)
    }
  }

  async function handleCategoryDelete() {
    if (!categoryDeleteTarget) return

    try {
      setCategoryDeleting(true)
      await deleteRawMaterialCategory(categoryDeleteTarget.id)
      setCategories(prev => prev.filter(category => category.id !== categoryDeleteTarget.id))
      setCategoryDeleteTarget(null)
      showToast({ message: 'Category deleted', type: 'success' })
    } catch (err) {
      console.error('Failed to delete category:', err)
      showToast({ message: 'Cannot delete category while raw materials use it', type: 'error' })
    } finally {
      setCategoryDeleting(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return

    try {
      setDeleting(true)
      await deleteRawMaterial(deleteTarget.id)
      setMaterials(prev => prev.filter(m => m.id !== deleteTarget.id))
      showToast({ message: 'Material deleted', type: 'success' })
      setDeleteTarget(null)
    } catch (err) {
      console.error('Failed to delete material:', err)
      showToast({ message: 'Failed to delete material', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  function startEdit(material: RawMaterial) {
    const matchedCategory = material.categoryId
      ? categories.find(category => category.id === material.categoryId)
      : categories.find(category => normalizeText(category.name) === normalizeText(material.category || ''))
    setEditingId(material.id)
    setActiveView('create-material')
    setForm({
      name: material.name || '',
      qty: material.qty?.toString() || '',
      categoryId: matchedCategory?.id || otherCategory?.id || '',
      category: material.category || '',
      location: material.location || '',
      coaLink: material.coaLink || '',
      comments: material.comments || '',
      pricePerKg: material.pricePerKg?.toString() || ''
    })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startCategoryEdit(category: RawMaterialCategory) {
    setCategoryEditingId(category.id)
    setActiveView('create-category')
    setCategoryForm({
      name: category.name || '',
      description: category.description || '',
      isActive: category.isActive !== false
    })
  }

  function resetForm() {
    setForm({ ...defaultForm, categoryId: otherCategory?.id || '' })
    setEditingId(null)
    setError('')
  }

  function resetCategoryForm() {
    setCategoryForm(defaultCategoryForm)
    setCategoryEditingId(null)
  }

  // Preview the generated code as user types
  const previewCode = form.name.trim() ? generateRMCode(form.name.trim()) : '—'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Raw Materials</h1>
        <p className="text-zinc-600">Manage raw material inventory and pricing</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-100 text-rose-800 border border-rose-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={viewButtonClass(activeView === 'materials')}
          onClick={() => {
            resetForm()
            resetCategoryForm()
            setActiveView('materials')
          }}
        >
          Raw Materials
        </button>
        <button
          type="button"
          className={viewButtonClass(activeView === 'create-material')}
          onClick={() => {
            resetForm()
            resetCategoryForm()
            setActiveView('create-material')
          }}
        >
          Create Raw Material
        </button>
        <button
          type="button"
          className={viewButtonClass(activeView === 'create-category')}
          onClick={() => {
            resetForm()
            resetCategoryForm()
            setActiveView('create-category')
          }}
        >
          Create Category
        </button>
        <button
          type="button"
          className={viewButtonClass(activeView === 'categories')}
          onClick={() => {
            resetForm()
            resetCategoryForm()
            setActiveView('categories')
          }}
        >
          Categories
        </button>
      </div>

      {activeView === 'create-material' && (
      <Card
        title={editingId ? 'Edit Raw Material' : 'Create Raw Material'}
        actions={
          <div className="flex gap-2">
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>Cancel</Button>
            )}
            {editingId && editingMaterial && (
              <Button
                variant="danger"
                onClick={() => setDeleteTarget(editingMaterial)}
              >
                Delete
              </Button>
            )}
            <Button onClick={handleSave} loading={saving}>
              {saving ? 'Saving...' : editingId ? 'Update Material' : 'Save Material'}
            </Button>
          </div>
        }
      >
        <div className="grid max-w-5xl gap-5 md:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Material Name *</Label>
            <Input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Curcumin (Curcuminoids 95%) 10:1"
            />
            <p className="mt-1 text-sm text-zinc-500">
              Code preview: <span className="font-mono font-semibold">{previewCode}</span>
            </p>
          </div>
          <div>
            <Label>Quantity (KG)</Label>
            <NumberInput
              value={form.qty}
              onChange={e => setForm({ ...form, qty: e.target.value })}
              placeholder="e.g., 100"
            />
          </div>
          <div>
            <Label>Category</Label>
            <Select
              value={form.categoryId}
              onChange={e => {
                const category = categories.find(item => item.id === e.target.value)
                setForm({ ...form, categoryId: e.target.value, category: category?.name || '' })
              }}
            >
              <option value="">-- Select Category --</option>
              {activeCategories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={e => setForm({ ...form, location: e.target.value })}
              placeholder="e.g., Rack A-3"
            />
          </div>
          <div>
            <Label>COA Link</Label>
            <Input
              value={form.coaLink}
              onChange={e => setForm({ ...form, coaLink: e.target.value })}
              placeholder="Certificate file name or URL"
            />
          </div>
          <div>
            <Label>Comments</Label>
            <Input
              value={form.comments}
              onChange={e => setForm({ ...form, comments: e.target.value })}
              placeholder="Optional receiving notes"
            />
          </div>
          <div>
            <Label>Price per KG (USD)</Label>
            <NumberInput
              value={form.pricePerKg}
              onChange={e => setForm({ ...form, pricePerKg: e.target.value })}
              placeholder="e.g., 25.50"
              step="0.01"
            />
          </div>
        </div>
      </Card>
      )}

      {activeView === 'create-category' && (
      <Card
        title={categoryEditingId ? 'Edit Category' : 'Create Category'}
        actions={(
          <div className="flex gap-2">
            <Button
              variant="subtle"
              onClick={() => setCategoryForm({ ...categoryForm, name: 'Other', description: 'Default category for uncategorized raw materials.' })}
            >
              Use Other Defaults
            </Button>
            {categoryEditingId && (
              <Button variant="ghost" onClick={resetCategoryForm}>Cancel</Button>
            )}
            <Button onClick={handleCategorySave} loading={categorySaving}>
              {categorySaving ? 'Saving...' : categoryEditingId ? 'Update Category' : 'Create Category'}
            </Button>
          </div>
        )}
      >
        <div className="max-w-4xl space-y-5">
          <div>
            <Label>Category Name *</Label>
            <Input
              value={categoryForm.name}
              onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
              placeholder="e.g., Botanical Extracts"
            />
          </div>
          <div>
            <Label>Description</Label>
            <TextArea
              rows={5}
              value={categoryForm.description}
              onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })}
              placeholder="Optional category notes"
            />
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <Checkbox
              id="raw-material-category-active"
              label="Active category"
              checked={categoryForm.isActive}
              onChange={e => setCategoryForm({ ...categoryForm, isActive: e.target.checked })}
            />
          </div>
        </div>
      </Card>
      )}

      {activeView === 'categories' && (
      <Card title="Categories">
        <div className="divide-y divide-zinc-200 border-y border-zinc-200">
          {categories.length === 0 ? (
            <div className="py-3 text-sm text-zinc-500">No categories found.</div>
          ) : (
            categories.map(category => (
              <div key={category.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold">{category.name}</div>
                  <div className="text-sm text-zinc-500">{category.description || '-'}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="subtle" size="sm" onClick={() => startCategoryEdit(category)}>Edit</Button>
                  {normalizeText(category.name) !== 'other' && (
                    <Button variant="danger" size="sm" onClick={() => setCategoryDeleteTarget(category)}>Delete</Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
      )}

      {activeView === 'materials' && (
      <Card title="Raw Materials">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Sr</TableHead>
              <TableHead>RM Code</TableHead>
              <TableHead>Raw Material name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Remaining Qty (KG)</TableHead>
              <TableHead>COA Link</TableHead>
              <TableHead>Comments</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoading colSpan={9} />
            ) : materials.length === 0 ? (
              <TableEmpty colSpan={9} message="No raw materials yet. Add your first material!" />
            ) : (
              materials.map((material, index) => (
                <TableRow key={material.id}>
                  <TableCell className="text-zinc-500">{index + 1}</TableCell>
                  <TableCell className="font-mono font-semibold">{material.code}</TableCell>
                  <TableCell>{material.name}</TableCell>
                  <TableCell>{material.category || categories.find(category => category.id === material.categoryId)?.name || '-'}</TableCell>
                  <TableCell>{material.qty ?? 0}</TableCell>
                  <TableCell>{material.coaLink || '-'}</TableCell>
                  <TableCell>{material.comments || '-'}</TableCell>
                  <TableCell>{material.location || '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="subtle" size="sm" onClick={() => startEdit(material)}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(material)}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Material?"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This may affect products that use this material.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
      <ConfirmDialog
        open={!!categoryDeleteTarget}
        onClose={() => setCategoryDeleteTarget(null)}
        onConfirm={handleCategoryDelete}
        title="Delete Category?"
        description={`Are you sure you want to delete "${categoryDeleteTarget?.name}"? Categories used by raw materials cannot be deleted.`}
        confirmLabel="Delete"
        variant="danger"
        loading={categoryDeleting}
      />
    </div>
  )
}
