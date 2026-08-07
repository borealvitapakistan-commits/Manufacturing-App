// ============================================================================
// Send Items Page - record goods sent out to a vendor, deducting the sent
// quantity from that entity's live inventory balance.
// ============================================================================

'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  ConfirmDialog,
  Input,
  Label,
  NumberInput,
  Select,
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
  deleteSentItem,
  fetchBrands,
  fetchSentItemSources,
  fetchSentItems,
  fetchVendors,
  initSupabase,
  saveSentItem
} from '@/lib/supabase/data'
import type { Brand, SentItem, SentItemSource, SentItemType, Vendor } from '@/types'

type SendItemsView = 'records' | 'send-items'

interface FormState {
  vendorId: string
  brandId: string
  itemType: SentItemType
  sourceId: string
  quantity: string
  sentAt: string
  notes: string
}

const ITEM_TYPE_OPTIONS: Array<{ value: SentItemType; label: string }> = [
  { value: 'assembly', label: 'Bottles (Assembly)' },
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'encapsulation', label: 'Capsule (Encapsulation)' },
  { value: 'mixing', label: 'Mixed Powder (Mixing)' },
  { value: 'label', label: 'Labels' }
]

function itemTypeLabel(value: string): string {
  return ITEM_TYPE_OPTIONS.find(option => option.value === value)?.label || value
}

function nowForInput(): string {
  const date = new Date()
  date.setSeconds(0, 0)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function toDateTimeInput(value: number | string | null | undefined): string {
  if (!value) return nowForInput()
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return nowForInput()
  date.setSeconds(0, 0)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function formatDateTime(value: number | string | null | undefined): string {
  if (!value) return '-'
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function emptyForm(): FormState {
  return {
    vendorId: '',
    brandId: '',
    itemType: 'assembly',
    sourceId: '',
    quantity: '',
    sentAt: nowForInput(),
    notes: ''
  }
}

function viewButtonClass(active: boolean): string {
  return `rounded-xl border px-4 py-2 text-sm font-medium transition ${
    active
      ? 'border-[#1D838D] bg-[#1D838D] text-white'
      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
  }`
}

export default function SendItemsPage() {
  const { showToast } = useToast()
  const [activeView, setActiveView] = useState<SendItemsView>('records')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [records, setRecords] = useState<SentItem[]>([])
  const [sources, setSources] = useState<SentItemSource[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [editingRecord, setEditingRecord] = useState<SentItem | null>(null)
  const [form, setForm] = useState<FormState>(() => emptyForm())
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<SentItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const vendorName = useMemo(() => {
    const map = new Map(vendors.map(vendor => [vendor.id, vendor.name]))
    return (id: string) => map.get(id) || '-'
  }, [vendors])

  async function loadPageData() {
    try {
      setLoading(true)
      setError('')
      await initSupabase()
      const [vendorList, brandList, recordList] = await Promise.all([
        fetchVendors({ activeOnly: true }),
        fetchBrands<Brand>({ activeOnly: true }),
        fetchSentItems({ limit: 500 })
      ])
      setVendors(vendorList as Vendor[])
      setBrands(brandList)
      setRecords(recordList as SentItem[])
    } catch (err) {
      console.error('Failed to load Send Items page:', err)
      setError(err instanceof Error ? err.message : 'Failed to load Send Items page.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPageData()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadSources() {
      try {
        setSourcesLoading(true)
        const result = await fetchSentItemSources({
          itemType: form.itemType,
          brandId: form.brandId || undefined
        })
        if (!cancelled) setSources(result as SentItemSource[])
      } catch (err) {
        console.error('Failed to load source options:', err)
        if (!cancelled) setSources([])
      } finally {
        if (!cancelled) setSourcesLoading(false)
      }
    }
    void loadSources()
    return () => {
      cancelled = true
    }
  }, [form.itemType, form.brandId])

  // Editing a record whose source has since been fully (or partly) consumed
  // by this very record won't appear in `sources` with enough headroom -
  // add back what this record itself already consumed, same pattern used on
  // the Assembly/Encapsulation forms.
  const availableSources = useMemo(() => {
    if (!editingRecord || editingRecord.sourceId === '' || form.itemType !== editingRecord.itemType) {
      return sources
    }
    const ownQuantity = Number(editingRecord.quantity) || 0
    const existing = sources.find(source => source.id === editingRecord.sourceId)
    if (existing) {
      return sources.map(source =>
        source.id === editingRecord.sourceId
          ? { ...source, availableQty: source.availableQty + ownQuantity }
          : source
      )
    }
    return [
      ...sources,
      {
        id: editingRecord.sourceId,
        inventoryItemId: editingRecord.inventoryItemId,
        itemName: editingRecord.itemName,
        itemCode: editingRecord.itemCode,
        availableQty: ownQuantity,
        label: `${editingRecord.itemCode} - ${editingRecord.itemName} (${ownQuantity} available)`
      }
    ]
  }, [sources, editingRecord, form.itemType])

  const selectedSource = useMemo(
    () => availableSources.find(source => source.id === form.sourceId) || null,
    [availableSources, form.sourceId]
  )

  const quantity = form.quantity === '' ? null : Number(form.quantity)

  const filteredRecords = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    if (!needle) return records
    return records.filter(record =>
      record.itemName.toLowerCase().includes(needle) ||
      record.itemCode.toLowerCase().includes(needle) ||
      vendorName(record.vendorId).toLowerCase().includes(needle)
    )
  }, [records, searchQuery, vendorName])

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleSelectItemType(itemType: SentItemType) {
    setForm(prev => ({ ...prev, itemType, sourceId: '' }))
  }

  function handleSelectBrand(brandId: string) {
    setForm(prev => ({ ...prev, brandId, sourceId: '' }))
  }

  function resetForm() {
    setEditingRecord(null)
    setForm(emptyForm())
    setError('')
  }

  function startEdit(record: SentItem) {
    setEditingRecord(record)
    setForm({
      vendorId: record.vendorId,
      brandId: record.brandId,
      itemType: record.itemType,
      sourceId: record.sourceId,
      quantity: String(record.quantity),
      sentAt: toDateTimeInput(record.sentAt),
      notes: record.notes || ''
    })
    setError('')
    setActiveView('send-items')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit() {
    if (!form.vendorId) {
      setError('Select the vendor these items are being sent to.')
      return
    }
    if (!form.brandId) {
      setError('Select the brand for this shipment.')
      return
    }
    if (!form.sourceId) {
      setError(`Select which ${itemTypeLabel(form.itemType)} record is being sent.`)
      return
    }
    if (quantity === null || quantity <= 0) {
      setError('Enter a Quantity greater than zero.')
      return
    }
    if (selectedSource && quantity > selectedSource.availableQty) {
      setError(
        `Only ${selectedSource.availableQty} available for this save; you entered ${quantity}. Use ${selectedSource.availableQty} or less.`
      )
      return
    }

    try {
      setSaving(true)
      setError('')

      const payload = {
        id: editingRecord?.id || undefined,
        vendorId: form.vendorId,
        brandId: form.brandId,
        itemType: form.itemType,
        sourceId: form.sourceId,
        quantity,
        sentAt: form.sentAt ? new Date(form.sentAt).toISOString() : undefined,
        notes: form.notes.trim() || null
      }

      await saveSentItem(payload)
      showToast({ message: editingRecord ? 'Send Item record updated' : 'Items sent and recorded', type: 'success' })
      resetForm()
      setActiveView('records')
      await loadPageData()
    } catch (err) {
      console.error('Failed to save Send Item record:', err)
      setError(err instanceof Error ? err.message : 'Failed to save Send Item record.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      await deleteSentItem(deleteTarget.id)
      setRecords(prev => prev.filter(record => record.id !== deleteTarget.id))
      setDeleteTarget(null)
      showToast({ message: 'Send Item record deleted', type: 'success' })
      if (editingRecord?.id === deleteTarget.id) resetForm()
    } catch (err) {
      console.error('Failed to delete Send Item record:', err)
      showToast({ message: 'Failed to delete Send Item record', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <div className="py-10 text-zinc-500">Loading Send Items...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Send Items</h1>
        <p className="text-zinc-600">Record goods sent out to a vendor and deduct them from finished-goods inventory.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-100 p-3 text-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={viewButtonClass(activeView === 'records')}
          onClick={() => setActiveView('records')}
        >
          Records
        </button>
        <button
          type="button"
          className={viewButtonClass(activeView === 'send-items')}
          onClick={() => setActiveView('send-items')}
        >
          Send Items
        </button>
      </div>

      {activeView === 'send-items' && (
        <Card
          title={editingRecord ? 'Edit Send Item' : 'Send Items'}
          actions={
            <div className="flex flex-wrap gap-2">
              {editingRecord && <Button variant="ghost" onClick={resetForm}>Cancel</Button>}
              <Button onClick={handleSubmit} loading={saving}>
                {saving ? 'Saving...' : editingRecord ? 'Update' : 'Send'}
              </Button>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Select Vendor *</Label>
              <Select value={form.vendorId} onChange={e => updateField('vendorId', e.target.value)}>
                <option value="">Select Vendor</option>
                {vendors.map(vendor => (
                  <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                ))}
              </Select>
              {vendors.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">No active vendors yet - add one on the Vendors page.</p>
              )}
            </div>

            <div>
              <Label>Select Brand *</Label>
              <Select value={form.brandId} onChange={e => handleSelectBrand(e.target.value)}>
                <option value="">Select Brand</option>
                {brands.map(brand => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Select Type *</Label>
              <Select
                value={form.itemType}
                onChange={e => handleSelectItemType(e.target.value as SentItemType)}
              >
                {ITEM_TYPE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              {form.itemType === 'raw_material' && (
                <p className="mt-1 text-xs text-zinc-500">Raw Material is not brand-specific - all raw materials are shown regardless of the selected brand.</p>
              )}
            </div>

            <div>
              <Label>Select {itemTypeLabel(form.itemType)} *</Label>
              <Select
                value={form.sourceId}
                onChange={e => updateField('sourceId', e.target.value)}
                disabled={sourcesLoading || availableSources.length === 0}
              >
                <option value="">
                  {sourcesLoading
                    ? 'Loading...'
                    : availableSources.length
                      ? `Select ${itemTypeLabel(form.itemType)}`
                      : 'No records with available quantity'}
                </option>
                {availableSources.map(source => (
                  <option key={source.id} value={source.id}>{source.label}</option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Quantity *</Label>
              <NumberInput
                value={form.quantity}
                onChange={e => updateField('quantity', e.target.value)}
              />
              {selectedSource && (
                <p className="mt-1 text-xs text-zinc-500">
                  Available for this save: {selectedSource.availableQty}
                  {quantity !== null ? `; remaining after save: ${Math.max(0, selectedSource.availableQty - quantity)}` : ''}
                </p>
              )}
            </div>

            <div>
              <Label>Date / Time</Label>
              <Input
                type="datetime-local"
                value={form.sentAt}
                onChange={e => updateField('sentAt', e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <TextArea
                rows={2}
                value={form.notes}
                onChange={e => updateField('notes', e.target.value)}
              />
            </div>
          </div>
        </Card>
      )}

      {activeView === 'records' && (
        <Card
          title="Records"
          actions={(
            <Input
              placeholder="Search records..."
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              className="h-11"
            />
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sr#</TableHead>
                <TableHead>Item Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Date/Time</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={7} />
              ) : filteredRecords.length === 0 ? (
                <TableEmpty colSpan={7} message="No Send Item records found." />
              ) : (
                filteredRecords.map((record, index) => (
                  <TableRow key={record.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium">{record.itemName}</TableCell>
                    <TableCell className="font-mono">{record.itemCode}</TableCell>
                    <TableCell>{vendorName(record.vendorId)}</TableCell>
                    <TableCell>{record.quantity}</TableCell>
                    <TableCell>{formatDateTime(record.sentAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="subtle" size="sm" onClick={() => startEdit(record)}>Edit</Button>
                        <Button variant="danger" size="sm" onClick={() => setDeleteTarget(record)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Send Item record?"
        description={`Are you sure you want to delete this record for "${deleteTarget?.itemName}"? The sent quantity will be restored to inventory.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
