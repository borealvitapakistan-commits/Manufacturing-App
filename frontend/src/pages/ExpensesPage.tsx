import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Card,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
  TextArea,
  useToast
} from '@/components/ui'
import { api } from '@/lib/api/client'
import {
  deleteExpense,
  fetchExpenseBooks,
  fetchExpenses,
  saveExpense
} from '@/lib/supabase/data'

type Book = {
  id: string
  name: string
  description?: string | null
  currency: string
  openingBalanceCurrent: number
  status: 'open' | 'closed'
  isActive: boolean
  pendingCarryAmount?: number
  hasPendingCarry?: boolean
}

type Expense = {
  id: string
  bookId: string
  date?: number | null
  description?: string | null
  givenFrom?: string | null
  givenTo?: string | null
  amount: number
  direction: 'debit' | 'credit'
  type?: string | null
}

const defaultExpense = {
  date: new Date().toISOString().slice(0, 10),
  description: '',
  givenFrom: '',
  givenTo: '',
  amount: '',
  direction: 'debit' as 'debit' | 'credit',
  type: 'Manufacturing'
}

export default function ExpensesPage() {
  const { showToast } = useToast()
  const [books, setBooks] = useState<Book[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [bookName, setBookName] = useState('')
  const [opening, setOpening] = useState('')
  const [form, setForm] = useState(defaultExpense)
  const [closing, setClosing] = useState<Book | null>(null)
  const [closeMode, setCloseMode] = useState<'later' | 'transfer' | 'new'>('later')
  const [targetBookId, setTargetBookId] = useState('')
  const [newBookName, setNewBookName] = useState('')
  const [sourceDescription, setSourceDescription] = useState('')
  const [pullSourceId, setPullSourceId] = useState('')

  const selected = books.find(book => book.id === selectedId) || null

  async function loadBooks() {
    const data = await fetchExpenseBooks<Book>()
    setBooks(data)
    setSelectedId(current => current || data[0]?.id || '')
  }

  async function loadExpenses(bookId: string) {
    setExpenses(await fetchExpenses(bookId) as Expense[])
  }

  useEffect(() => {
    loadBooks().catch(error => showToast({ message: error.message, type: 'error' }))
  }, [])

  useEffect(() => {
    if (selectedId) {
      loadExpenses(selectedId).catch(error => showToast({ message: error.message, type: 'error' }))
    } else {
      setExpenses([])
    }
  }, [selectedId])

  const totals = useMemo(() => {
    const debit = expenses.filter(row => row.direction === 'debit').reduce((sum, row) => sum + Number(row.amount), 0)
    const credit = expenses.filter(row => row.direction === 'credit').reduce((sum, row) => sum + Number(row.amount), 0)
    const balance = Number(selected?.openingBalanceCurrent || 0) + credit - debit
    return { debit, credit, balance }
  }, [expenses, selected])

  const openTargets = books.filter(
    book => book.id !== closing?.id && book.status === 'open' && book.isActive !== false
  )
  const pendingCarryBooks = books.filter(
    book =>
      book.id !== selected?.id &&
      book.status === 'closed' &&
      book.hasPendingCarry &&
      Number(book.pendingCarryAmount || 0) !== 0
  )

  async function createBook() {
    if (!bookName.trim()) return
    await api.post('/expense-books', {
      name: bookName.trim(),
      currency: 'PKR',
      openingBalanceCurrent: Number(opening) || 0,
      openingAdjustments: Number(opening)
        ? [{ id: crypto.randomUUID(), date: Date.now(), amount: Number(opening), note: 'Opening balance' }]
        : [],
      status: 'open',
      isActive: true
    })
    setBookName('')
    setOpening('')
    await loadBooks()
  }

  async function addExpense() {
    if (!selected || !form.amount) return
    await saveExpense({
      bookId: selected.id,
      date: new Date(form.date).getTime(),
      description: form.description,
      givenFrom: form.givenFrom,
      givenTo: form.givenTo,
      amount: Number(form.amount),
      direction: form.direction,
      type: form.type,
      tags: []
    })
    setForm(defaultExpense)
    await loadExpenses(selected.id)
  }

  async function closeBook() {
    if (!closing) return
    if (closeMode === 'transfer' && !targetBookId) {
      showToast({ message: 'Select a target expense book.', type: 'error' })
      return
    }
    await api.post(`/expense-books/${closing.id}/close`, {
      mode: closeMode,
      targetBookId: closeMode === 'transfer' ? targetBookId : null,
      newBookName: closeMode === 'new' ? newBookName : null,
      sourceDescription: sourceDescription || null
    })
    setClosing(null)
    setCloseMode('later')
    setTargetBookId('')
    setNewBookName('')
    setSourceDescription('')
    await loadBooks()
  }

  async function reopenBook(book: Book) {
    await api.post(`/expense-books/${book.id}/reopen`, {})
    await loadBooks()
  }

  async function pullCarry() {
    if (!selected || !pullSourceId) return
    await api.post(`/expense-books/${pullSourceId}/pull-carry`, {
      targetBookId: selected.id
    })
    setPullSourceId('')
    await Promise.all([loadBooks(), loadExpenses(selected.id)])
    showToast({ message: 'Previous balance added to this book.', type: 'success' })
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-3xl font-bold">Expenses</h1>
        <p className="mt-1 text-slate-600">Django-managed expense books and ledgers.</p>
      </header>

      <Card title="Expense Books">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <Input placeholder="New book name" value={bookName} onChange={event => setBookName(event.target.value)} />
          <Input type="number" placeholder="Opening balance" value={opening} onChange={event => setOpening(event.target.value)} />
          <Button onClick={createBook}>Create Book</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {books.map(book => (
            <button
              key={book.id}
              onClick={() => setSelectedId(book.id)}
              className={`border px-3 py-2 text-left text-sm ${
                selectedId === book.id ? 'border-[#1D838D] bg-[#e0f7fa]' : 'border-slate-200'
              }`}
            >
              <span className="font-semibold">{book.name}</span>
              <span className="ml-2 text-slate-500">{book.status}</span>
            </button>
          ))}
        </div>
      </Card>

      {selected && (
        <>
          <Card title={selected.name}>
            <div className="grid gap-3 sm:grid-cols-4">
              <div><p className="text-xs text-slate-500">Opening</p><p className="font-semibold">{Number(selected.openingBalanceCurrent).toFixed(2)}</p></div>
              <div><p className="text-xs text-slate-500">Debit</p><p className="font-semibold">{totals.debit.toFixed(2)}</p></div>
              <div><p className="text-xs text-slate-500">Credit</p><p className="font-semibold">{totals.credit.toFixed(2)}</p></div>
              <div><p className="text-xs text-slate-500">Balance</p><p className="font-semibold">{totals.balance.toFixed(2)} {selected.currency}</p></div>
            </div>
            <div className="mt-4 flex gap-2">
              {selected.status === 'open'
                ? <Button variant="danger" onClick={() => setClosing(selected)}>Close Book</Button>
                : <Button variant="subtle" onClick={() => reopenBook(selected)}>Reopen Book</Button>}
            </div>
          </Card>

          {selected.status === 'open' && (
            <>
              {pendingCarryBooks.length > 0 && (
                <Card title="Add Previous Amount from Closed Book">
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <Select value={pullSourceId} onChange={event => setPullSourceId(event.target.value)}>
                      <option value="">Select closed expense book</option>
                      {pendingCarryBooks.map(book => (
                        <option key={book.id} value={book.id}>
                          {book.name} ({Number(book.pendingCarryAmount || 0).toFixed(2)})
                        </option>
                      ))}
                    </Select>
                    <Button onClick={pullCarry} disabled={!pullSourceId}>Add Previous Amount</Button>
                  </div>
                </Card>
              )}

              <Card title="Add Ledger Entry">
                <div className="grid gap-3 md:grid-cols-3">
                  <div><Label>Date</Label><Input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></div>
                  <div><Label>Direction</Label><Select value={form.direction} onChange={event => setForm({ ...form, direction: event.target.value as 'debit' | 'credit' })}><option value="debit">Debit</option><option value="credit">Credit</option></Select></div>
                  <div><Label>Amount</Label><Input type="number" min="0" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></div>
                  <div><Label>Given From</Label><Input value={form.givenFrom} onChange={event => setForm({ ...form, givenFrom: event.target.value })} /></div>
                  <div><Label>Given To</Label><Input value={form.givenTo} onChange={event => setForm({ ...form, givenTo: event.target.value })} /></div>
                  <div><Label>Type</Label><Input value={form.type} onChange={event => setForm({ ...form, type: event.target.value })} /></div>
                  <div className="md:col-span-3"><Label>Description</Label><TextArea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></div>
                </div>
                <div className="mt-3"><Button onClick={addExpense}>Save Entry</Button></div>
              </Card>
            </>
          )}

          <Card title="Ledger">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Direction</TableHead><TableHead>Amount</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {expenses.length === 0 ? <TableEmpty colSpan={5} message="No ledger entries." /> : expenses.map(row => (
                  <TableRow key={row.id}>
                    <TableCell>{row.date ? new Date(row.date).toLocaleDateString() : '-'}</TableCell>
                    <TableCell>{row.description || '-'}</TableCell>
                    <TableCell>{row.direction}</TableCell>
                    <TableCell>{Number(row.amount).toFixed(2)}</TableCell>
                    <TableCell><Button variant="danger" onClick={async () => { await deleteExpense(row.id); await loadExpenses(selected.id) }}>Delete</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {closing && (
        <Card title={`Close ${closing.name}`}>
          <p className="mb-3 text-sm text-slate-600">
            Final balance: {totals.balance.toFixed(2)} {closing.currency}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Balance handling</Label>
              <Select
                value={closeMode}
                onChange={event => setCloseMode(event.target.value as 'later' | 'transfer' | 'new')}
              >
                <option value="later">Keep as pending carry</option>
                <option value="transfer">Transfer to open book</option>
                <option value="new">Create next-period book</option>
              </Select>
            </div>
            {closeMode === 'transfer' && (
              <div>
                <Label>Target book</Label>
                <Select value={targetBookId} onChange={event => setTargetBookId(event.target.value)}>
                  <option value="">Select target book</option>
                  {openTargets.map(book => <option key={book.id} value={book.id}>{book.name}</option>)}
                </Select>
              </div>
            )}
            {closeMode === 'new' && (
              <div>
                <Label>New book name</Label>
                <Input value={newBookName} onChange={event => setNewBookName(event.target.value)} />
              </div>
            )}
            {totals.balance < 0 && closeMode !== 'later' && (
              <div>
                <Label>Deficit source</Label>
                <Input
                  placeholder="Owner funds / main cash"
                  value={sourceDescription}
                  onChange={event => setSourceDescription(event.target.value)}
                />
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="danger" onClick={closeBook}>Close Book</Button>
            <Button variant="subtle" onClick={() => setClosing(null)}>Cancel</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
