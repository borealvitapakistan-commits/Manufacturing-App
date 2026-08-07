// ============================================================================
// Vendors Page
// ============================================================================

'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableLoading,
  TableRow,
  TextArea,
  useToast
} from '@/components/ui'
import {
  deleteVendor,
  fetchVendors,
  initSupabase,
  saveVendor
} from '@/lib/supabase/data'
import type { Vendor, VendorCategory } from '@/types'

const vendorCategories: Array<{ value: VendorCategory; label: string }> = [
  { value: 'raw_material_supplier', label: 'Raw material supplier' },
  { value: 'bottles_jars', label: 'Bottles and jars' },
  { value: 'lid_supplier', label: 'Lid supplier' },
  { value: 'label_supplier', label: 'Label supplier' },
  { value: 'logistic', label: 'Logistic' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'shop', label: 'Shop' }
]

interface FormState {
  name: string
  vendorCode: string
  shortCode: string
  categories: VendorCategory[]
  phone: string
  email: string
  whatsapp: string
  country: string
  city: string
  address: string
  website: string
  paymentTerms: string
  notes: string
  isActive: boolean
}

const defaultForm: FormState = {
  name: '',
  vendorCode: '',
  shortCode: '',
  categories: [],
  phone: '',
  email: '',
  whatsapp: '',
  country: '',
  city: '',
  address: '',
  website: '',
  paymentTerms: '',
  notes: '',
  isActive: true
}

function categoryLabel(value: string): string {
  return vendorCategories.find(item => item.value === value)?.label || value
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [form, setForm] = useState<FormState>(defaultForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { showToast } = useToast()

  const filteredVendors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return vendors
    return vendors.filter(vendor =>
      vendor.name.toLowerCase().includes(q) ||
      String(vendor.vendorCode || '').toLowerCase().includes(q) ||
      (vendor.categories || []).some(category => categoryLabel(category).toLowerCase().includes(q))
    )
  }, [searchQuery, vendors])

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError('')
      await initSupabase()
      setVendors(await fetchVendors())
    } catch (err) {
      console.error('Failed to load vendors:', err)
      setError('Failed to load vendors. Check the /api/vendors/ backend endpoint.')
    } finally {
      setLoading(false)
    }
  }

  function validateForm(): string | null {
    if (!form.name.trim()) return 'Vendor name is required.'
    if (!form.vendorCode.trim()) return 'Vendor PO prefix is required.'
    if (!/^\d+$/.test(form.vendorCode.trim())) return 'Vendor PO prefix must be numeric, like 25 or 26.'
    if (form.categories.length === 0) return 'Select at least one vendor category.'
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
      await saveVendor({
        id: editingId || undefined,
        ...form,
        name: form.name.trim(),
        vendorCode: form.vendorCode.trim(),
        shortCode: form.shortCode.trim() || null
      })
      showToast({ message: editingId ? 'Vendor updated' : 'Vendor saved', type: 'success' })
      resetForm()
      await loadData()
    } catch (err) {
      console.error('Failed to save vendor:', err)
      setError(err instanceof Error ? err.message : 'Failed to save vendor.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      await deleteVendor(deleteTarget.id)
      setVendors(prev => prev.filter(vendor => vendor.id !== deleteTarget.id))
      setDeleteTarget(null)
      showToast({ message: 'Vendor deleted', type: 'success' })
      if (editingId === deleteTarget.id) resetForm()
    } catch (err) {
      console.error('Failed to delete vendor:', err)
      showToast({ message: 'Failed to delete vendor', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  function startEdit(vendor: Vendor) {
    setEditingId(vendor.id)
    setForm({
      name: vendor.name || '',
      vendorCode: vendor.vendorCode || '',
      shortCode: vendor.shortCode || '',
      categories: vendor.categories || [],
      phone: vendor.phone || '',
      email: vendor.email || '',
      whatsapp: vendor.whatsapp || '',
      country: vendor.country || '',
      city: vendor.city || '',
      address: vendor.address || '',
      website: vendor.website || '',
      paymentTerms: vendor.paymentTerms || '',
      notes: vendor.notes || '',
      isActive: vendor.isActive !== false
    })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setForm(defaultForm)
    setEditingId(null)
    setError('')
  }

  function toggleCategory(category: VendorCategory) {
    setForm(current => ({
      ...current,
      categories: current.categories.includes(category)
        ? current.categories.filter(item => item !== category)
        : [...current.categories, category]
    }))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vendors</h1>
        <p className="text-zinc-600">Save suppliers, printers, logistics partners, and PO prefixes</p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-100 p-3 text-rose-800">
          {error}
        </div>
      )}

      <Card
        title={editingId ? 'Edit Vendor' : 'Save Vendor'}
        actions={(
          <div className="flex flex-wrap gap-2">
            {editingId && <Button variant="ghost" onClick={resetForm}>Cancel</Button>}
            <Button onClick={handleSave} loading={saving}>
              {saving ? 'Saving...' : editingId ? 'Update Vendor' : 'Save Vendor'}
            </Button>
          </div>
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Vendor Name *</Label>
            <Input
              value={form.name}
              onChange={event => setForm({ ...form, name: event.target.value })}
              placeholder="e.g., Karachi Label Printer"
            />
          </div>
          <div>
            <Label>PO Prefix *</Label>
            <Input
              value={form.vendorCode}
              onChange={event => setForm({ ...form, vendorCode: event.target.value })}
              placeholder="e.g., 25"
            />
          </div>
          <div>
            <Label>Short Code</Label>
            <Input
              value={form.shortCode}
              onChange={event => setForm({ ...form, shortCode: event.target.value })}
              placeholder="e.g., KLP"
            />
          </div>
          <div className="flex items-end">
            <Checkbox
              id="vendor-active"
              label="Active vendor"
              checked={form.isActive}
              onChange={event => setForm({ ...form, isActive: event.target.checked })}
            />
          </div>

          <div className="sm:col-span-2">
            <Label>Vendor Category *</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {vendorCategories.map(category => (
                <Checkbox
                  key={category.value}
                  id={`vendor-category-${category.value}`}
                  label={category.label}
                  checked={form.categories.includes(category.value)}
                  onChange={() => toggleCategory(category.value)}
                />
              ))}
            </div>
          </div>

          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={form.whatsapp} onChange={event => setForm({ ...form, whatsapp: event.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
          </div>
          <div>
            <Label>Website</Label>
            <Input value={form.website} onChange={event => setForm({ ...form, website: event.target.value })} />
          </div>
          <div>
            <Label>Country</Label>
            <Input value={form.country} onChange={event => setForm({ ...form, country: event.target.value })} />
          </div>
          <div>
            <Label>City</Label>
            <Input value={form.city} onChange={event => setForm({ ...form, city: event.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} />
          </div>
          <div>
            <Label>Payment Terms</Label>
            <Input
              value={form.paymentTerms}
              onChange={event => setForm({ ...form, paymentTerms: event.target.value })}
              placeholder="e.g., 50% advance"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <TextArea
              rows={2}
              value={form.notes}
              onChange={event => setForm({ ...form, notes: event.target.value })}
            />
          </div>
        </div>
      </Card>

      <Card
        title="All Vendors"
        actions={(
          <Input
            placeholder="Search vendors..."
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            className="h-11"
          />
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>PO Prefix</TableHead>
              <TableHead>Categories</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoading colSpan={6} />
            ) : filteredVendors.length === 0 ? (
              <TableEmpty colSpan={6} message="No vendors found." />
            ) : (
              filteredVendors.map(vendor => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell className="font-mono font-semibold">{vendor.vendorCode || '-'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(vendor.categories || []).map(category => (
                        <span key={category} className="rounded-full bg-zinc-100 px-2 py-1 text-xs">
                          {categoryLabel(category)}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{vendor.phone || vendor.whatsapp || '-'}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2 py-1 text-xs ${
                      vendor.isActive !== false
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-zinc-100 text-zinc-600'
                    }`}>
                      {vendor.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="subtle" size="sm" onClick={() => startEdit(vendor)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(vendor)}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Vendor?"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Existing purchase orders will stay in history.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
