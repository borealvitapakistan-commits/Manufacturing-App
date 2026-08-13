import { useState, type FormEvent } from 'react'
import { Button, Card, Input, Label, Select, TextArea } from '@/components/ui'
import type { CreateQuoteInput, Quote, RequestToQuoteDocument } from '@/types'

export function QuoteEditor({
  quote,
  eligibleRtqs,
  saving,
  onSave,
  onDelete,
  onCancel,
}: {
  quote: Quote | null
  eligibleRtqs: RequestToQuoteDocument[]
  saving: boolean
  onSave: (input: CreateQuoteInput & { id?: string; file?: File | null }) => void
  onDelete?: () => void
  onCancel: () => void
}) {
  const [rtqNumber, setRtqNumber] = useState(quote?.rtqNumber || '')
  const [comments, setComments] = useState(quote?.comments || '')
  const [file, setFile] = useState<File | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSave({ id: quote?.id, rtqNumber, comments, file })
  }

  return (
    <Card title={quote ? `Edit — ${quote.quoteNumber}` : 'New Quote'}>
      <form className="max-w-xl space-y-4" onSubmit={handleSubmit}>
        {quote ? (
          <div>
            <Label>Request to Quote</Label>
            <Input value={quote.rtqNumber} disabled />
          </div>
        ) : (
          <div>
            <Label>Request to Quote</Label>
            <Select value={rtqNumber} onChange={event => setRtqNumber(event.target.value)} required>
              <option value="">Select a Request to Quote</option>
              {eligibleRtqs.map(rtq => (
                <option key={rtq.id} value={rtq.rtqNumber}>
                  {rtq.rtqNumber} — {rtq.vendorName || 'No vendor'}
                </option>
              ))}
            </Select>
            {eligibleRtqs.length === 0 && (
              <p className="mt-1 text-xs text-zinc-500">
                Every Request to Quote already has a Quote attached.
              </p>
            )}
          </div>
        )}

        <div>
          <Label>Attach File{quote ? ' (leave blank to keep the current file)' : ''}</Label>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
            onChange={event => setFile(event.target.files?.[0] || null)}
            className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
          />
          {quote?.fileName && (
            <p className="mt-1 text-xs text-zinc-500">
              Current file:{' '}
              {quote.fileUrl ? (
                <a href={quote.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[#1D838D] underline">
                  {quote.fileName}
                </a>
              ) : (
                quote.fileName
              )}
            </p>
          )}
        </div>

        <div>
          <Label>Comments</Label>
          <TextArea value={comments} onChange={event => setComments(event.target.value)} rows={4} />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex gap-2">
            <Button type="submit" loading={saving} disabled={!quote && !rtqNumber}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}
