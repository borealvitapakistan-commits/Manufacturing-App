// ============================================================================
// Quote Page — the step between Request to Quote and Purchase Order: attach
// the vendor's actual quote document to an RTQ. One Quote per RTQ.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { QuoteEditor } from '@/components/quotes/QuoteEditor'
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
  deleteQuote,
  fetchQuotes,
  fetchRequestToQuoteDocuments,
  initSupabase,
  saveQuote,
} from '@/lib/supabase/data'
import { formatDate } from '@/lib/utils'
import type { CreateQuoteInput, Quote, RequestToQuoteDocument } from '@/types'

function viewButtonClass(active: boolean): string {
  return `rounded-xl border px-4 py-2 text-sm font-medium transition ${
    active
      ? 'border-[#1D838D] bg-[#1D838D] text-white'
      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
  }`
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [rtqDocs, setRtqDocs] = useState<RequestToQuoteDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingQuote, setEditingQuote] = useState<Quote | null | 'new'>(null)
  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { showToast } = useToast()

  useEffect(() => { void loadData() }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError('')
      await initSupabase()
      const [quoteList, rtqList] = await Promise.all([
        fetchQuotes({ limit: 500 }),
        fetchRequestToQuoteDocuments({ limit: 500 }),
      ])
      setQuotes(quoteList)
      setRtqDocs(rtqList)
    } catch (err) {
      console.error('Failed to load Quotes:', err)
      setError('Failed to load quotes.')
    } finally {
      setLoading(false)
    }
  }

  // RTQs that don't already have a Quote attached — a Quote is one-to-one
  // with its Request to Quote.
  const eligibleRtqs = useMemo(() => {
    const quoted = new Set(quotes.map(q => q.rtqNumber))
    return rtqDocs.filter(rtq => !quoted.has(rtq.rtqNumber))
  }, [quotes, rtqDocs])

  async function handleSave(input: CreateQuoteInput & { id?: string; file?: File | null }) {
    try {
      setSaving(true)
      const saved = await saveQuote(input)
      showToast({
        message: input.id ? `${saved.quoteNumber} updated` : `${saved.quoteNumber} created`,
        type: 'success',
      })
      setEditingQuote(null)
      await loadData()
    } catch (err) {
      console.error('Failed to save Quote:', err)
      showToast({ message: err instanceof Error ? err.message : 'Failed to save', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      await deleteQuote(deleteTarget.id)
      setQuotes(prev => prev.filter(q => q.id !== deleteTarget.id))
      setDeleteTarget(null)
      if (editingQuote !== null && editingQuote !== 'new' && editingQuote.id === deleteTarget.id) {
        setEditingQuote(null)
      }
      showToast({ message: 'Quote deleted', type: 'success' })
    } catch (err) {
      console.error(err)
      showToast({ message: 'Failed to delete', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const filteredQuotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return quotes
    return quotes.filter(quote =>
      quote.quoteNumber.toLowerCase().includes(q) ||
      quote.rtqNumber.toLowerCase().includes(q) ||
      (quote.fileName || '').toLowerCase().includes(q)
    )
  }, [quotes, searchQuery])

  const quoteObj = editingQuote === 'new' ? null : editingQuote

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quote</h1>
        <p className="text-zinc-600 text-sm">Attach the vendor's quote document to a Request to Quote</p>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={viewButtonClass(editingQuote === null)}
          onClick={() => setEditingQuote(null)}
        >
          Quotes
        </button>
        <button
          type="button"
          className={viewButtonClass(editingQuote !== null)}
          onClick={() => setEditingQuote('new')}
        >
          Create Quote
        </button>
      </div>

      {editingQuote !== null ? (
        <QuoteEditor
          quote={quoteObj}
          eligibleRtqs={eligibleRtqs}
          saving={saving}
          onSave={handleSave}
          onDelete={quoteObj ? () => setDeleteTarget(quoteObj) : undefined}
          onCancel={() => setEditingQuote(null)}
        />
      ) : (
        <Card
          title="Quotes"
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
                <TableHead>Quote Number</TableHead>
                <TableHead>Request to Quote</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={6} />
              ) : filteredQuotes.length === 0 ? (
                <TableEmpty colSpan={6} message="No quotes yet." />
              ) : (
                filteredQuotes.map(quote => (
                  <TableRow key={quote.id} clickable onClick={() => setEditingQuote(quote)}>
                    <TableCell className="font-mono font-semibold">{quote.quoteNumber}</TableCell>
                    <TableCell className="font-mono">{quote.rtqNumber}</TableCell>
                    <TableCell>{quote.fileName || '—'}</TableCell>
                    <TableCell className="max-w-xs truncate">{quote.comments || '—'}</TableCell>
                    <TableCell>{formatDate(quote.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={event => {
                            event.stopPropagation()
                            setEditingQuote(quote)
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={event => {
                            event.stopPropagation()
                            setDeleteTarget(quote)
                          }}
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

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Quote?"
        description={`Delete ${deleteTarget?.quoteNumber}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
