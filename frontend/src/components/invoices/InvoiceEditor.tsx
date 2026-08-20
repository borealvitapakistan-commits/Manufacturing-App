import { useState, type FormEvent } from 'react'
import { Button, Card, Input, Label, Select, TextArea } from '@/components/ui'
import type { CreateInvoiceInput, Invoice, PODocument } from '@/types'

export function InvoiceEditor({
  invoice,
  eligiblePOs,
  saving,
  readOnly = false,
  onSave,
  onDelete,
  onDone,
  onCancel,
}: {
  invoice: Invoice | null
  eligiblePOs: PODocument[]
  saving: boolean
  readOnly?: boolean
  onSave: (input: CreateInvoiceInput & { id?: string; file?: File | null }) => void
  onDelete?: () => void
  onDone?: () => void
  onCancel: () => void
}) {
  const [poNumber, setPoNumber] = useState(invoice?.poNumber || '')
  const [comments, setComments] = useState(invoice?.comments || '')
  const [file, setFile] = useState<File | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSave({ id: invoice?.id, poNumber, comments, file })
  }

  const title = invoice
    ? readOnly ? `Viewing — ${invoice.invoiceNumber} (read-only)` : `Edit — ${invoice.invoiceNumber}`
    : 'New Invoice'

  return (
    <Card title={title}>
      <form className="max-w-xl space-y-4" onSubmit={handleSubmit}>
        {readOnly && (
          <div className="rounded bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-500">
            Done — read-only. Its Purchase Order's items have already been added to inventory.
          </div>
        )}
        {invoice ? (
          <div>
            <Label>Purchase Order</Label>
            <Input value={invoice.poNumber} disabled />
          </div>
        ) : (
          <div>
            <Label>Purchase Order</Label>
            <Select value={poNumber} onChange={event => setPoNumber(event.target.value)} required>
              <option value="">Select a Purchase Order</option>
              {eligiblePOs.map(po => (
                <option key={po.id} value={po.poNumber}>
                  {po.poNumber} — {po.vendorName || 'No vendor'}
                </option>
              ))}
            </Select>
            {eligiblePOs.length === 0 && (
              <p className="mt-1 text-xs text-zinc-500">
                Every Purchase Order already has an Invoice attached.
              </p>
            )}
          </div>
        )}

        {!readOnly && (
          <div>
            <Label>Attach File{invoice ? ' (leave blank to keep the current file)' : ''}</Label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
              onChange={event => setFile(event.target.files?.[0] || null)}
              className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
            />
          </div>
        )}
        {invoice?.fileName && (
          <p className={readOnly ? '' : '-mt-2 text-xs text-zinc-500'}>
            {readOnly && <span className="text-xs text-zinc-500">File: </span>}
            {!readOnly && <span className="text-xs text-zinc-500">Current file: </span>}
            {invoice.fileUrl ? (
              <a href={invoice.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1D838D] underline">
                {invoice.fileName}
              </a>
            ) : (
              <span className="text-xs text-zinc-500">{invoice.fileName}</span>
            )}
          </p>
        )}

        <div>
          <Label>Comments</Label>
          <TextArea value={comments} onChange={event => setComments(event.target.value)} rows={4} disabled={readOnly} />
        </div>

        {readOnly ? (
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Back
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="flex gap-2">
              <Button type="submit" loading={saving} disabled={!invoice && !poNumber}>
                Save
              </Button>
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              {onDone && (
                <Button type="button" variant="secondary" onClick={onDone}>
                  Done
                </Button>
              )}
            </div>
            {onDelete && (
              <Button type="button" variant="danger" onClick={onDelete}>
                Delete
              </Button>
            )}
          </div>
        )}
      </form>
    </Card>
  )
}
