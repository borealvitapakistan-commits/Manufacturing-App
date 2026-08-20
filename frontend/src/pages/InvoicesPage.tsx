// ============================================================================
// Invoices Page — the final step in the procurement pipeline: attach the
// vendor's actual invoice document to a Purchase Order. One Invoice per PO.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { InvoiceEditor } from '@/components/invoices/InvoiceEditor'
import {
  Button,
  Card,
  ConfirmDialog,
  Input,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableLoading,
  TableRow,
  useToast,
} from '@/components/ui'
import {
  deleteInvoice,
  fetchInvoices,
  fetchPODocuments,
  initSupabase,
  markInvoiceDone,
  saveInvoice,
} from '@/lib/supabase/data'
import { formatDate } from '@/lib/utils'
import type { CreateInvoiceInput, Invoice, PODocument } from '@/types'

function viewButtonClass(active: boolean): string {
  return `rounded-xl border px-4 py-2 text-sm font-medium transition ${
    active
      ? 'border-[#1D838D] bg-[#1D838D] text-white'
      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
  }`
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [poDocs, setPoDocs] = useState<PODocument[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null | 'new'>(null)
  const [editingReadOnly, setEditingReadOnly] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [doneTarget, setDoneTarget] = useState<Invoice | null>(null)
  const [marking, setMarking] = useState(false)
  const { showToast } = useToast()

  useEffect(() => { void loadData() }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError('')
      await initSupabase()
      const [invoiceList, poList] = await Promise.all([
        fetchInvoices({ limit: 500 }),
        fetchPODocuments({ limit: 500 }),
      ])
      setInvoices(invoiceList)
      setPoDocs(poList)
    } catch (err) {
      console.error('Failed to load Invoices:', err)
      setError('Failed to load invoices.')
    } finally {
      setLoading(false)
    }
  }

  // POs that don't already have an Invoice attached — an Invoice is
  // one-to-one with its Purchase Order.
  const eligiblePOs = useMemo(() => {
    const invoiced = new Set(invoices.map(inv => inv.poNumber))
    return poDocs.filter(po => !invoiced.has(po.poNumber))
  }, [invoices, poDocs])

  async function handleSave(input: CreateInvoiceInput & { id?: string; file?: File | null }) {
    try {
      setSaving(true)
      const saved = await saveInvoice(input)
      showToast({
        message: input.id ? `${saved.invoiceNumber} updated` : `${saved.invoiceNumber} created`,
        type: 'success',
      })
      setEditingInvoice(null)
      setEditingReadOnly(false)
      await loadData()
    } catch (err) {
      console.error('Failed to save Invoice:', err)
      showToast({ message: err instanceof Error ? err.message : 'Failed to save', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      await deleteInvoice(deleteTarget.id)
      setInvoices(prev => prev.filter(inv => inv.id !== deleteTarget.id))
      setDeleteTarget(null)
      if (editingInvoice !== null && editingInvoice !== 'new' && editingInvoice.id === deleteTarget.id) {
        setEditingInvoice(null)
      }
      showToast({ message: 'Invoice deleted', type: 'success' })
    } catch (err) {
      console.error(err)
      showToast({ message: 'Failed to delete', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  // Credits the linked PO's received quantities into inventory (raw
  // materials, bottles/lids, labels) and locks the invoice - see
  // InvoiceService.mark_done on the backend for the actual crediting logic.
  async function handleConfirmDone() {
    if (!doneTarget) return
    try {
      setMarking(true)
      const updated = await markInvoiceDone(doneTarget.id)
      showToast({ message: `${updated.invoiceNumber} marked Done — stock updated`, type: 'success' })
      setDoneTarget(null)
      if (editingInvoice !== null && editingInvoice !== 'new' && editingInvoice.id === updated.id) {
        setEditingInvoice(updated)
        setEditingReadOnly(true)
      }
      await loadData()
    } catch (err) {
      console.error('Failed to mark Invoice done:', err)
      showToast({ message: err instanceof Error ? err.message : 'Failed to mark done', type: 'error' })
    } finally {
      setMarking(false)
    }
  }

  const filteredInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter(invoice =>
      invoice.invoiceNumber.toLowerCase().includes(q) ||
      invoice.poNumber.toLowerCase().includes(q) ||
      (invoice.fileName || '').toLowerCase().includes(q)
    )
  }, [invoices, searchQuery])

  const invoiceObj = editingInvoice === 'new' ? null : editingInvoice

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Invoices</h1>
        <p className="text-zinc-600 text-sm">Attach the vendor's invoice document to a Purchase Order</p>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={viewButtonClass(editingInvoice === null)}
          onClick={() => { setEditingInvoice(null); setEditingReadOnly(false) }}
        >
          Invoices
        </button>
        <button
          type="button"
          className={viewButtonClass(editingInvoice !== null)}
          onClick={() => { setEditingInvoice('new'); setEditingReadOnly(false) }}
        >
          Create Invoice
        </button>
      </div>

      {editingInvoice !== null ? (
        <InvoiceEditor
          invoice={invoiceObj}
          eligiblePOs={eligiblePOs}
          saving={saving}
          readOnly={editingReadOnly}
          onSave={handleSave}
          onDelete={invoiceObj && !editingReadOnly ? () => setDeleteTarget(invoiceObj) : undefined}
          onDone={invoiceObj && !editingReadOnly ? () => setDoneTarget(invoiceObj) : undefined}
          onCancel={() => { setEditingInvoice(null); setEditingReadOnly(false) }}
        />
      ) : (
        <Card
          title="Invoices"
          actions={
            <Input
              placeholder="Search…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-9 w-48"
            />
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice Number</TableHead>
                <TableHead>Purchase Order</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={6} />
              ) : filteredInvoices.length === 0 ? (
                <TableEmpty colSpan={6} message="No invoices yet." />
              ) : (
                filteredInvoices.map(invoice => {
                  const isDone = invoice.status === 'done'
                  return (
                    <TableRow
                      key={invoice.id}
                      clickable
                      onClick={() => { setEditingInvoice(invoice); setEditingReadOnly(isDone) }}
                    >
                      <TableCell className="font-mono font-semibold">
                        {invoice.invoiceNumber}
                        {isDone && (
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Done
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono">{invoice.poNumber}</TableCell>
                      <TableCell>{invoice.fileName || '—'}</TableCell>
                      <TableCell className="max-w-xs truncate">{invoice.comments || '—'}</TableCell>
                      <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {isDone ? (
                            <Button
                              variant="subtle"
                              size="sm"
                              onClick={event => {
                                event.stopPropagation()
                                setEditingInvoice(invoice)
                                setEditingReadOnly(true)
                              }}
                            >
                              View
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="subtle"
                                size="sm"
                                onClick={event => {
                                  event.stopPropagation()
                                  setEditingInvoice(invoice)
                                  setEditingReadOnly(false)
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={event => {
                                  event.stopPropagation()
                                  setDoneTarget(invoice)
                                }}
                              >
                                Done
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={event => {
                                  event.stopPropagation()
                                  setDeleteTarget(invoice)
                                }}
                              >
                                Delete
                              </Button>
                            </>
                          )}
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
        title="Delete Invoice?"
        description={`Delete ${deleteTarget?.invoiceNumber}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />

      <ConfirmDialog
        open={!!doneTarget}
        onClose={() => setDoneTarget(null)}
        onConfirm={handleConfirmDone}
        title="Mark as Done?"
        description={`Mark ${doneTarget?.invoiceNumber} as Done? The quantities on ${doneTarget?.poNumber} will be added to inventory (raw materials, bottles/lids, labels), and this invoice will become read-only — no longer editable or deletable.`}
        confirmLabel="Done"
        loading={marking}
      />
    </div>
  )
}
