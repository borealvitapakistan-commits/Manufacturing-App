// ============================================================================
// Brands Page
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
import {
  Card,
  Button,
  Input,
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
  saveBrand,
  deleteBrand
} from '@/lib/supabase/data'
import { formatDate } from '@/lib/utils'
import type { Brand } from '@/types'

interface FormState {
  name: string
  codePrefix: string
  shortName: string
  contactName: string
  contactEmail: string
  addressLine1: string
  addressLine2: string
  city: string
  province: string
  country: string
  phone: string
  notes: string
  color: string
  logoUrl: string
  isActive: boolean
}

type BrandView = 'brands' | 'create-brand'

const defaultForm: FormState = {
  name: '',
  codePrefix: '',
  shortName: '',
  contactName: '',
  contactEmail: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  province: '',
  country: '',
  phone: '',
  notes: '',
  color: '#16a34a',
  logoUrl: '',
  isActive: true
}

function viewButtonClass(active: boolean): string {
  return `rounded-xl border px-4 py-2 text-sm font-medium transition ${
    active
      ? 'border-[#1D838D] bg-[#1D838D] text-white'
      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
  }`
}

export default function BrandsPage() {
  const [activeView, setActiveView] = useState<BrandView>('brands')
  const [brands, setBrands] = useState<Brand[]>([])
  const [form, setForm] = useState<FormState>(defaultForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      await initSupabase()
      const brandList = await fetchBrands()
      setBrands(brandList as Brand[])
    } catch (err) {
      console.error('Failed to load brands:', err)
      setError('Failed to load brands.')
    } finally {
      setLoading(false)
    }
  }

  function validateForm(): string | null {
    if (!form.name.trim()) return 'Brand name is required.'
    if (!form.codePrefix.trim()) return 'Code prefix is required.'
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
      const payload = {
        id: editingId || undefined,
        name: form.name.trim(),
        codePrefix: form.codePrefix.trim(),
        shortName: form.shortName.trim() || null,
        contactName: form.contactName.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        addressLine1: form.addressLine1.trim() || null,
        addressLine2: form.addressLine2.trim() || null,
        city: form.city.trim() || null,
        province: form.province.trim() || null,
        country: form.country.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        color: form.color || '#16a34a',
        logoUrl: form.logoUrl.trim() || null,
        isActive: form.isActive
      }

      await saveBrand(payload)

      showToast({
        message: editingId ? 'Brand updated' : 'Brand created',
        type: 'success'
      })

      resetForm()
      setActiveView('brands')
      await loadData()
    } catch (err) {
      console.error('Failed to save brand:', err)
      setError('Failed to save brand.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return

    try {
      setDeleting(true)
      await deleteBrand(deleteTarget.id)
      setBrands(prev => prev.filter(b => b.id !== deleteTarget.id))
      showToast({ message: 'Brand deleted', type: 'success' })
      setDeleteTarget(null)
    } catch (err) {
      console.error('Failed to delete brand:', err)
      showToast({ message: 'Failed to delete brand', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  function startEdit(brand: Brand) {
    setEditingId(brand.id)
    setActiveView('create-brand')
    setForm({
      name: brand.name || '',
      codePrefix: brand.codePrefix || '',
      shortName: brand.shortName || '',
      contactName: brand.contactName || '',
      contactEmail: brand.contactEmail || '',
      addressLine1: brand.addressLine1 || '',
      addressLine2: brand.addressLine2 || '',
      city: brand.city || '',
      province: brand.province || '',
      country: brand.country || '',
      phone: brand.phone || '',
      notes: brand.notes || '',
      color: brand.color || '#16a34a',
      logoUrl: brand.logoUrl || '',
      isActive: brand.isActive !== false
    })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setForm(defaultForm)
    setEditingId(null)
    setError('')
  }

  function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Logo must be an image file.')
      return
    }

    if (file.size > 500 * 1024) {
      setError('Logo image must be 500 KB or smaller.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm(prev => ({ ...prev, logoUrl: reader.result as string }))
        setError('')
      }
    }
    reader.onerror = () => setError('Failed to read logo image.')
    reader.readAsDataURL(file)
  }

  async function toggleActive(brand: Brand) {
    try {
      await saveBrand({
        id: brand.id,
        isActive: !brand.isActive
      })
      setBrands(prev =>
        prev.map(b =>
          b.id === brand.id ? { ...b, isActive: !b.isActive } : b
        )
      )
      showToast({
        message: `Brand ${brand.isActive ? 'deactivated' : 'activated'}`,
        type: 'success'
      })
    } catch (err) {
      console.error('Failed to toggle brand:', err)
      showToast({ message: 'Failed to update brand', type: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Brands</h1>
        <p className="text-zinc-600">Manage product brands and their code prefixes</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-100 text-rose-800 border border-rose-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={viewButtonClass(activeView === 'brands')}
          onClick={() => {
            resetForm()
            setActiveView('brands')
          }}
        >
          Brands
        </button>
        <button
          type="button"
          className={viewButtonClass(activeView === 'create-brand')}
          onClick={() => {
            resetForm()
            setActiveView('create-brand')
          }}
        >
          Create Brand
        </button>
      </div>

      {/* Form */}
      {activeView === 'create-brand' && (
      <Card
        title={editingId ? 'Edit Brand' : 'Create Brand'}
        actions={
          <div className="flex gap-2">
            {editingId && (
              <Button
                variant="ghost"
                onClick={() => {
                  resetForm()
                  setActiveView('brands')
                }}
              >
                Cancel
              </Button>
            )}
            <Button onClick={handleSave} loading={saving}>
              {saving ? 'Saving...' : editingId ? 'Update Brand' : 'Save Brand'}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Brand Name *</Label>
            <Input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., NutraLife"
            />
          </div>
          <div>
            <Label>Code Prefix *</Label>
            <Input
              value={form.codePrefix}
              onChange={e => setForm({ ...form, codePrefix: e.target.value })}
              placeholder="e.g., 786"
            />
          </div>
          <div>
            <Label>Short Name</Label>
            <Input
              value={form.shortName}
              onChange={e => setForm({ ...form, shortName: e.target.value })}
              placeholder="e.g., NL"
            />
          </div>
          <div>
            <Label>Contact Name</Label>
            <Input
              value={form.contactName}
              onChange={e => setForm({ ...form, contactName: e.target.value })}
              placeholder="e.g., Purchase Manager"
            />
          </div>
          <div>
            <Label>Contact Email</Label>
            <Input
              type="email"
              value={form.contactEmail}
              onChange={e => setForm({ ...form, contactEmail: e.target.value })}
              placeholder="e.g., purchasing@example.com"
            />
          </div>
          <div>
            <Label>Contact Phone</Label>
            <Input
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="e.g., 306-491-6117"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Address Line 1</Label>
            <Input
              value={form.addressLine1}
              onChange={e => setForm({ ...form, addressLine1: e.target.value })}
              placeholder="e.g., 2213B Hanselman Court"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Address Line 2</Label>
            <Input
              value={form.addressLine2}
              onChange={e => setForm({ ...form, addressLine2: e.target.value })}
              placeholder="Suite, unit, etc. (optional)"
            />
          </div>
          <div>
            <Label>City</Label>
            <Input
              value={form.city}
              onChange={e => setForm({ ...form, city: e.target.value })}
              placeholder="e.g., Saskatoon"
            />
          </div>
          <div>
            <Label>Province / State</Label>
            <Input
              value={form.province}
              onChange={e => setForm({ ...form, province: e.target.value })}
              placeholder="e.g., SK"
            />
          </div>
          <div>
            <Label>Country</Label>
            <Input
              value={form.country}
              onChange={e => setForm({ ...form, country: e.target.value })}
              placeholder="e.g., Canada"
            />
          </div>
          <div>
            <Label>Brand Color (used on PO documents)</Label>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="color"
                value={form.color}
                onChange={e => setForm({ ...form, color: e.target.value })}
                className="h-10 w-16 cursor-pointer rounded border border-zinc-300 p-0.5"
                title="Pick brand color"
              />
              <span className="text-sm font-mono text-zinc-500">{form.color}</span>
              <div className="h-6 w-24 rounded" style={{ backgroundColor: form.color }} />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label>Insert Logo (used on PO documents)</Label>
            <div className="mt-1 grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                value={form.logoUrl}
                onChange={e => setForm({ ...form, logoUrl: e.target.value })}
                placeholder="Paste logo URL or upload an image"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-300">
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    className="sr-only"
                  />
                </label>
                {form.logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setForm({ ...form, logoUrl: '' })}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            {form.logoUrl && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3">
                <img src={form.logoUrl} alt="Brand logo preview" className="h-12 max-w-[180px] object-contain" />
                <span className="text-xs text-zinc-500">Logo preview</span>
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <TextArea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Additional notes about this brand"
              rows={2}
            />
          </div>
          <div className="sm:col-span-2">
            <Checkbox
              id="isActive"
              label="Active (appears in dropdowns)"
              checked={form.isActive}
              onChange={e => setForm({ ...form, isActive: e.target.checked })}
            />
          </div>
        </div>
      </Card>
      )}

      {/* Table */}
      {activeView === 'brands' && (
      <Card title="Brands">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code Prefix</TableHead>
              <TableHead>Short Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Logo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoading colSpan={10} />
            ) : brands.length === 0 ? (
              <TableEmpty colSpan={10} message="No brands found. Add your first brand." />
            ) : (
              brands.map(brand => (
                <TableRow key={brand.id}>
                  <TableCell className="font-medium">{brand.name}</TableCell>
                  <TableCell className="font-mono">{brand.codePrefix}</TableCell>
                  <TableCell>{brand.shortName || '-'}</TableCell>
                  <TableCell>
                    {brand.contactName || brand.contactEmail || brand.phone ? (
                      <div className="max-w-[220px] text-xs leading-relaxed text-zinc-600">
                        {brand.contactName && <div className="font-medium text-zinc-800">{brand.contactName}</div>}
                        {brand.contactEmail && <div>{brand.contactEmail}</div>}
                        {brand.phone && <div>{brand.phone}</div>}
                      </div>
                    ) : (
                      <span className="text-zinc-400">No contact</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {brand.addressLine1 || brand.addressLine2 || brand.city || brand.province || brand.country ? (
                      <div className="max-w-[260px] text-xs leading-relaxed text-zinc-600">
                        <div className="font-medium text-zinc-800">{brand.addressLine1 || 'No street address'}</div>
                        {brand.addressLine2 && <div>{brand.addressLine2}</div>}
                        <div>{[brand.city, brand.province, brand.country].filter(Boolean).join(', ')}</div>
                      </div>
                    ) : (
                      <span className="text-zinc-400">No address</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full border border-zinc-200" style={{ backgroundColor: brand.color || '#16a34a' }} />
                      <span className="font-mono text-xs text-zinc-500">{brand.color || '#16a34a'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {brand.logoUrl ? (
                      <img src={brand.logoUrl} alt={`${brand.name} logo`} className="h-8 max-w-[96px] object-contain" />
                    ) : (
                      <span className="text-zinc-400">No logo</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleActive(brand)}
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        brand.isActive !== false
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {brand.isActive !== false ? 'Active' : 'Inactive'}
                    </button>
                  </TableCell>
                  <TableCell>{formatDate(brand.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => startEdit(brand)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setDeleteTarget(brand)}
                      >
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
        title="Delete Brand?"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
