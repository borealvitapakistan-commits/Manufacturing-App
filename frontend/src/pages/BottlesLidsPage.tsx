import { useEffect, useState } from 'react'

import {
  Button,
  Card,
  ConfirmDialog,
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
  useToast
} from '@/components/ui'
import {
  deleteBottleLidInventory,
  fetchBottleLidInventory,
  initSupabase,
  saveBottleLidInventory
} from '@/lib/supabase/data'
import { formatDate } from '@/lib/utils'

type BottleType = 'capsule' | 'jar'
type CapsuleType = '200' | '250' | '300'
type PageView = 'bottles-lids' | 'create'

interface BottleLidRecord {
  id: string
  bottleType: BottleType
  capsuleType: CapsuleType | null
  quantity: number
  createdAt?: number | string | null
  updatedAt?: number | string | null
}

interface BottleLidForm {
  bottleType: BottleType
  capsuleType: CapsuleType
  quantity: string
}

const defaultForm: BottleLidForm = {
  bottleType: 'capsule',
  capsuleType: '200',
  quantity: ''
}

const capsuleTypes: CapsuleType[] = ['200', '250', '300']

function viewButtonClass(active: boolean): string {
  return `rounded-xl border px-4 py-2 text-sm font-medium transition ${
    active
      ? 'border-[#1D838D] bg-[#1D838D] text-white'
      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
  }`
}

function formatBottleType(value: string | null | undefined): string {
  if (value === 'capsule') return 'Capsule'
  if (value === 'jar') return 'Jar'
  return '-'
}

export default function BottlesLidsPage() {
  const [activeView, setActiveView] = useState<PageView>('bottles-lids')
  const [items, setItems] = useState<BottleLidRecord[]>([])
  const [form, setForm] = useState<BottleLidForm>(defaultForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BottleLidRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const { showToast } = useToast()

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError('')
      await initSupabase()
      const rows = await fetchBottleLidInventory()
      setItems(rows as BottleLidRecord[])
    } catch (err) {
      console.error('Failed to load bottles/lids:', err)
      setError(err instanceof Error ? err.message : 'Failed to load bottles/lids inventory.')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setForm(defaultForm)
    setEditingId(null)
    setError('')
  }

  function startEdit(item: BottleLidRecord) {
    setEditingId(item.id)
    setForm({
      bottleType: item.bottleType || 'capsule',
      capsuleType: item.capsuleType || '200',
      quantity: String(item.quantity ?? 0)
    })
    setActiveView('create')
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function validateForm(): string | null {
    if (!form.bottleType) return 'Bottle type is required.'
    if (form.bottleType === 'capsule' && !form.capsuleType) return 'Bottle size is required for Capsule bottles.'
    const quantity = Number(form.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) return 'Quantity must be 0 or greater.'
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
      await saveBottleLidInventory({
        id: editingId || undefined,
        bottleType: form.bottleType,
        capsuleType: form.bottleType === 'capsule' ? form.capsuleType : null,
        quantity: Math.trunc(Number(form.quantity) || 0)
      })
      showToast({
        message: editingId ? 'Bottles/Lids entry updated' : 'Bottles/Lids entry created',
        type: 'success'
      })
      resetForm()
      setActiveView('bottles-lids')
      await loadData()
    } catch (err) {
      console.error('Failed to save bottles/lids:', err)
      setError(err instanceof Error ? err.message : 'Failed to save bottles/lids entry.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return

    try {
      setDeleting(true)
      await deleteBottleLidInventory(deleteTarget.id)
      setItems(prev => prev.filter(item => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      showToast({ message: 'Bottles/Lids entry deleted', type: 'success' })
    } catch (err) {
      console.error('Failed to delete bottles/lids:', err)
      showToast({ message: 'Failed to delete bottles/lids entry', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bottles / Lids</h1>
        <p className="text-zinc-600">Manage bottle and lid inventory quantities</p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-100 p-3 text-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={viewButtonClass(activeView === 'bottles-lids')}
          onClick={() => {
            resetForm()
            setActiveView('bottles-lids')
          }}
        >
          Bottles / Lids
        </button>
        <button
          type="button"
          className={viewButtonClass(activeView === 'create')}
          onClick={() => {
            resetForm()
            setActiveView('create')
          }}
        >
          Create Bottles / Lids
        </button>
      </div>

      {activeView === 'create' && (
        <Card
          title={editingId ? 'Edit Bottles / Lids' : 'Create Bottles / Lids'}
          actions={(
            <div className="flex gap-2">
              {editingId && <Button variant="ghost" onClick={resetForm}>Cancel</Button>}
              <Button onClick={handleSave} loading={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </Button>
            </div>
          )}
        >
          <div className="grid max-w-4xl gap-5 md:grid-cols-2">
            <div>
              <Label>Bottle Type *</Label>
              <Select
                value={form.bottleType}
                onChange={event => {
                  const bottleType = event.target.value as BottleType
                  setForm({
                    ...form,
                    bottleType,
                    capsuleType: bottleType === 'capsule' ? form.capsuleType : '200'
                  })
                }}
              >
                <option value="capsule">Capsule</option>
                <option value="jar">Jar</option>
              </Select>
            </div>

            {form.bottleType === 'capsule' && (
              <div>
                <Label>Bottle Size *</Label>
                <Select
                  value={form.capsuleType}
                  onChange={event => setForm({ ...form, capsuleType: event.target.value as CapsuleType })}
                >
                  {capsuleTypes.map(type => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div>
              <Label>Quantity *</Label>
              <NumberInput
                min="0"
                value={form.quantity}
                onChange={event => setForm({ ...form, quantity: event.target.value })}
                placeholder="e.g., 5000"
              />
            </div>
          </div>
        </Card>
      )}

      {activeView === 'bottles-lids' && (
        <Card title="Bottles / Lids">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bottle Type</TableHead>
                <TableHead>Bottle Size</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={5} />
              ) : items.length === 0 ? (
                <TableEmpty colSpan={5} message="No bottles/lids inventory found. Add your first entry." />
              ) : (
                items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>{formatBottleType(item.bottleType)}</TableCell>
                    <TableCell>{item.bottleType === 'capsule' ? item.capsuleType || '-' : '-'}</TableCell>
                    <TableCell>{Number(item.quantity || 0)}</TableCell>
                    <TableCell>{formatDate(item.createdAt || null)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="subtle" size="sm" onClick={() => startEdit(item)}>
                          Edit
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setDeleteTarget(item)}>
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

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Bottles/Lids Entry?"
        description={`Are you sure you want to delete this ${formatBottleType(deleteTarget?.bottleType).toLowerCase()} entry?`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
