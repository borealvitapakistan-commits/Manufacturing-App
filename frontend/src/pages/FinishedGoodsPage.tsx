// ============================================================================
// Finished Goods Page
// ============================================================================

'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Modal,
  NumberInput,
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
  fetchFinishedGoodHistory,
  fetchFinishedGoods,
  initSupabase,
  saveFinishedGood
} from '@/lib/supabase/data'
import { formatDate } from '@/lib/utils'
import type { FGCategory, FinishedGood, FinishedGoodHistory } from '@/types'

const tabs: Array<{ value: FGCategory; label: string }> = [
  { value: 'powder', label: 'Powders' },
  { value: 'capsule', label: 'Capsules' },
  { value: 'bottle', label: 'Bottles' }
]

interface EditForm {
  name: string
  location: string
  comments: string
  powderNo: string
  rackNo: string
  weightKg: string
  capsuleCode: string
  bucket: string
  capsuleMg: string
  capsuleWeightKg: string
  capsuleAmount: string
  capsuleStatus: string
  boxNo: string
  bottleTotal: string
  expiryDate: string
  reason: string
}

const defaultForm: EditForm = {
  name: '',
  location: '',
  comments: '',
  powderNo: '',
  rackNo: '',
  weightKg: '',
  capsuleCode: '',
  bucket: '',
  capsuleMg: '',
  capsuleWeightKg: '',
  capsuleAmount: '',
  capsuleStatus: '',
  boxNo: '',
  bottleTotal: '',
  expiryDate: '',
  reason: ''
}

function toNullableNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toNullableInteger(value: string): number | null {
  if (!value.trim()) return null
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function toDateInput(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'number') {
    return new Date(value).toISOString().slice(0, 10)
  }
  if (typeof value === 'string') {
    return value.includes('T') ? value.slice(0, 10) : value
  }
  return ''
}

function prettyFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (value) => value.toUpperCase())
}

function printValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function tabTitle(tab: FGCategory): string {
  if (tab === 'powder') return 'Powder'
  if (tab === 'capsule') return 'Capsule'
  return 'Bottle'
}

export default function FinishedGoodsPage() {
  const [activeTab, setActiveTab] = useState<FGCategory>('powder')
  const [rows, setRows] = useState<FinishedGood[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<FinishedGood | null>(null)
  const [form, setForm] = useState<EditForm>(defaultForm)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRows, setHistoryRows] = useState<FinishedGoodHistory[]>([])
  const [historyTarget, setHistoryTarget] = useState<FinishedGood | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    void loadData(activeTab)
  }, [activeTab])

  async function loadData(category: FGCategory) {
    try {
      setLoading(true)
      setError('')
      await initSupabase()
      const list = await fetchFinishedGoods({ category })
      setRows(list as FinishedGood[])
    } catch (err) {
      console.error('Failed to load finished goods:', err)
      setRows([])
      setError('Finished goods schema is missing. Run schemas: 01_types.sql, 16_finished_goods.sql, and 20_rls_policies.sql in Supabase SQL Editor.')
    } finally {
      setLoading(false)
    }
  }

  function startEdit(item: FinishedGood) {
    setEditing(item)
    setForm({
      name: item.name || '',
      location: item.location || '',
      comments: item.comments || '',
      powderNo: item.powderNo || '',
      rackNo: item.rackNo || '',
      weightKg: item.weightKg === null || item.weightKg === undefined ? '' : String(item.weightKg),
      capsuleCode: item.capsuleCode || '',
      bucket: item.bucket || '',
      capsuleMg: item.capsuleMg === null || item.capsuleMg === undefined ? '' : String(item.capsuleMg),
      capsuleWeightKg: item.capsuleWeightKg === null || item.capsuleWeightKg === undefined ? '' : String(item.capsuleWeightKg),
      capsuleAmount: item.capsuleAmount === null || item.capsuleAmount === undefined ? '' : String(item.capsuleAmount),
      capsuleStatus: item.capsuleStatus || '',
      boxNo: item.boxNo || '',
      bottleTotal: item.bottleTotal === null || item.bottleTotal === undefined ? '' : String(item.bottleTotal),
      expiryDate: toDateInput(item.expiryDate),
      reason: ''
    })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(defaultForm)
  }

  async function saveEdit() {
    if (!editing) return

    const reason = form.reason.trim()
    if (!reason) {
      setError('Reason is required for manual edits.')
      return
    }
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    if (!form.location.trim()) {
      setError('Location is required.')
      return
    }

    const capsuleAmount = toNullableInteger(form.capsuleAmount)
    const bottleTotal = toNullableInteger(form.bottleTotal)
    if (form.capsuleAmount.trim() && capsuleAmount === null) {
      setError('Capsule amount must be a whole number.')
      return
    }
    if (form.bottleTotal.trim() && bottleTotal === null) {
      setError('Bottle total must be a whole number.')
      return
    }

    try {
      setSaving(true)
      setError('')

      await saveFinishedGood({
        id: editing.id,
        reason,
        name: form.name.trim(),
        location: form.location.trim(),
        comments: form.comments.trim(),
        powderNo: form.powderNo.trim() || null,
        rackNo: form.rackNo.trim() || null,
        weightKg: toNullableNumber(form.weightKg),
        capsuleCode: form.capsuleCode.trim() || null,
        bucket: form.bucket.trim() || null,
        capsuleMg: toNullableNumber(form.capsuleMg),
        capsuleWeightKg: toNullableNumber(form.capsuleWeightKg),
        capsuleAmount,
        capsuleStatus: form.capsuleStatus.trim() || null,
        boxNo: form.boxNo.trim() || null,
        bottleTotal,
        expiryDate: form.expiryDate || null,
      })

      showToast({ message: 'Finished good updated', type: 'success' })
      cancelEdit()
      await loadData(activeTab)
    } catch (err) {
      console.error('Failed to update finished good:', err)
      setError(err instanceof Error ? err.message : 'Failed to update finished good.')
    } finally {
      setSaving(false)
    }
  }

  async function openHistory(item: FinishedGood) {
    try {
      setHistoryTarget(item)
      setHistoryOpen(true)
      setHistoryLoading(true)
      const history = await fetchFinishedGoodHistory(item.id)
      setHistoryRows(history as FinishedGoodHistory[])
    } catch (err) {
      console.error('Failed to load history:', err)
      showToast({ message: 'Failed to load history', type: 'error' })
      setHistoryRows([])
    } finally {
      setHistoryLoading(false)
    }
  }

  function closeHistory() {
    setHistoryOpen(false)
    setHistoryRows([])
    setHistoryTarget(null)
  }

  const editingTitle = useMemo(() => {
    if (!editing) return ''
    return `Edit ${tabTitle(editing.category)} Entry`
  }, [editing])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Finished Goods</h1>
        <p className="text-zinc-600">
          Track powders, capsules, and bottled products created from batches
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-100 p-3 text-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setActiveTab(tab.value)
              cancelEdit()
            }}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.value
                ? 'border-[#1D838D] bg-[#1D838D] text-white'
                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {editing && (
        <Card
          title={editingTitle}
          actions={(
            <div className="flex gap-2">
              <Button variant="ghost" onClick={cancelEdit}>Cancel</Button>
              <Button onClick={saveEdit} loading={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}
        >
          <div className="mb-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
            Batch: <span className="font-semibold">{editing.batchCode}</span> | Brand: {editing.brandName} | Product: {editing.productName}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Finished good name"
              />
            </div>
            <div>
              <Label>Location *</Label>
              <Input
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
                placeholder="Storage location"
              />
            </div>

            {editing.category === 'powder' && (
              <>
                <div>
                  <Label>Powder No.</Label>
                  <Input
                    value={form.powderNo}
                    onChange={(event) => setForm({ ...form, powderNo: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Rack No.</Label>
                  <Input
                    value={form.rackNo}
                    onChange={(event) => setForm({ ...form, rackNo: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Weight KG</Label>
                  <NumberInput
                    value={form.weightKg}
                    onChange={(event) => setForm({ ...form, weightKg: event.target.value })}
                  />
                </div>
              </>
            )}

            {editing.category === 'capsule' && (
              <>
                <div>
                  <Label>Capsule Code</Label>
                  <Input
                    value={form.capsuleCode}
                    onChange={(event) => setForm({ ...form, capsuleCode: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Bucket</Label>
                  <Input
                    value={form.bucket}
                    onChange={(event) => setForm({ ...form, bucket: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Capsule MG</Label>
                  <NumberInput
                    value={form.capsuleMg}
                    onChange={(event) => setForm({ ...form, capsuleMg: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Capsule Weight KG</Label>
                  <NumberInput
                    value={form.capsuleWeightKg}
                    onChange={(event) => setForm({ ...form, capsuleWeightKg: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Capsule Amount</Label>
                  <NumberInput
                    step="1"
                    value={form.capsuleAmount}
                    onChange={(event) => setForm({ ...form, capsuleAmount: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Input
                    value={form.capsuleStatus}
                    onChange={(event) => setForm({ ...form, capsuleStatus: event.target.value })}
                    placeholder="e.g., Released"
                  />
                </div>
              </>
            )}

            {editing.category === 'bottle' && (
              <>
                <div>
                  <Label>Box No.</Label>
                  <Input
                    value={form.boxNo}
                    onChange={(event) => setForm({ ...form, boxNo: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Total Bottles</Label>
                  <NumberInput
                    step="1"
                    value={form.bottleTotal}
                    onChange={(event) => setForm({ ...form, bottleTotal: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Expiry Date</Label>
                  <Input
                    type="date"
                    value={form.expiryDate}
                    onChange={(event) => setForm({ ...form, expiryDate: event.target.value })}
                  />
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <Label>Comments</Label>
              <TextArea
                rows={2}
                value={form.comments}
                onChange={(event) => setForm({ ...form, comments: event.target.value })}
                placeholder="Optional notes"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Reason *</Label>
              <TextArea
                rows={3}
                value={form.reason}
                onChange={(event) => setForm({ ...form, reason: event.target.value })}
                placeholder="Required reason for this manual change"
              />
            </div>
          </div>
        </Card>
      )}

      <Card title={tabs.find((tab) => tab.value === activeTab)?.label || 'Finished Goods'}>
        <Table>
          <TableHeader>
            <TableRow>
              {activeTab === 'powder' && (
                <>
                  <TableHead>Name</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Powder No.</TableHead>
                  <TableHead>Rack No.</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Weight KG</TableHead>
                  <TableHead>Actions</TableHead>
                </>
              )}
              {activeTab === 'capsule' && (
                <>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Bucket</TableHead>
                  <TableHead>MG</TableHead>
                  <TableHead>Weight KG</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </>
              )}
              {activeTab === 'bottle' && (
                <>
                  <TableHead>Name</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Box No.</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead>Actions</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoading colSpan={activeTab === 'capsule' ? 10 : activeTab === 'bottle' ? 8 : 7} />
            ) : rows.length === 0 ? (
              <TableEmpty
                colSpan={activeTab === 'capsule' ? 10 : activeTab === 'bottle' ? 8 : 7}
                message={`No ${tabTitle(activeTab).toLowerCase()} entries found.`}
              />
            ) : rows.map((item) => (
              <TableRow key={item.id}>
                {activeTab === 'powder' && (
                  <>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.batchCode}</TableCell>
                    <TableCell>{item.powderNo || '—'}</TableCell>
                    <TableCell>{item.rackNo || '—'}</TableCell>
                    <TableCell>{item.location || '—'}</TableCell>
                    <TableCell>{item.weightKg ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="subtle" size="sm" onClick={() => startEdit(item)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => void openHistory(item)}>History</Button>
                      </div>
                    </TableCell>
                  </>
                )}
                {activeTab === 'capsule' && (
                  <>
                    <TableCell>{item.capsuleCode || '—'}</TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.batchCode}</TableCell>
                    <TableCell>{item.bucket || '—'}</TableCell>
                    <TableCell>{item.capsuleMg ?? '—'}</TableCell>
                    <TableCell>{item.capsuleWeightKg ?? '—'}</TableCell>
                    <TableCell>{item.capsuleAmount ?? '—'}</TableCell>
                    <TableCell>{item.location || '—'}</TableCell>
                    <TableCell>{item.capsuleStatus || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="subtle" size="sm" onClick={() => startEdit(item)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => void openHistory(item)}>History</Button>
                      </div>
                    </TableCell>
                  </>
                )}
                {activeTab === 'bottle' && (
                  <>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.batchCode}</TableCell>
                    <TableCell>{item.boxNo || '—'}</TableCell>
                    <TableCell>{item.location || '—'}</TableCell>
                    <TableCell>{item.bottleTotal ?? '—'}</TableCell>
                    <TableCell>{item.expiryDate ? toDateInput(item.expiryDate) : '—'}</TableCell>
                    <TableCell>{item.comments || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="subtle" size="sm" onClick={() => startEdit(item)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => void openHistory(item)}>History</Button>
                      </div>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Modal
        open={historyOpen}
        onClose={closeHistory}
        title={`History ${historyTarget ? `- ${historyTarget.batchCode}` : ''}`}
        className="max-w-4xl"
      >
        {historyLoading ? (
          <div className="py-6 text-center text-zinc-500">Loading history...</div>
        ) : historyRows.length === 0 ? (
          <div className="py-6 text-center text-zinc-500">No history entries found.</div>
        ) : (
          <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
            {historyRows.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={entry.changeSource === 'manual' ? 'info' : 'success'}>
                      {entry.changeSource === 'manual' ? 'Manual' : 'Auto'}
                    </Badge>
                    <p className="text-sm font-semibold text-zinc-900">
                      {entry.changeType.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <p className="text-xs text-zinc-500">{formatDate(entry.createdAt)}</p>
                </div>

                {entry.reason && (
                  <p className="mt-2 text-sm text-zinc-700">
                    <span className="font-medium">Reason:</span> {entry.reason}
                  </p>
                )}

                <div className="mt-3 space-y-1 text-sm">
                  {Object.entries(entry.changes || {}).length === 0 ? (
                    <p className="text-zinc-500">No field-level diff captured.</p>
                  ) : (
                    Object.entries(entry.changes).map(([field, diff]) => (
                      <div key={field} className="grid gap-1 rounded-lg bg-zinc-50 p-2 sm:grid-cols-[180px_1fr]">
                        <p className="font-medium text-zinc-700">{prettyFieldName(field)}</p>
                        <p className="text-zinc-600">
                          <span className="font-medium">{printValue(diff.old)}</span> {' -> '}
                          <span className="font-medium">{printValue(diff.new)}</span>
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
