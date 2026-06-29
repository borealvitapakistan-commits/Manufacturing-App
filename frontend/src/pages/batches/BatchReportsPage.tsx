import { useEffect, useState } from 'react'

import { Card, Select } from '@/components/ui'
import { api } from '@/lib/api/client'
import { fetchBatches } from '@/lib/supabase/data'

type Batch = { id: string; batchCode: string; productName: string }
type Traceability = {
  batch: Record<string, unknown>
  mixing: Record<string, unknown> | null
  njp: Record<string, unknown> | null
  assembly: Record<string, unknown> | null
}

function DocumentSection({ title, data }: { title: string; data: Record<string, unknown> | null }) {
  return (
    <section className="border-t border-slate-200 py-4 first:border-t-0">
      <h3 className="font-semibold text-[#1D838D]">{title}</h3>
      {!data ? <p className="mt-2 text-sm text-slate-500">Not completed.</p> : (
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(data)
            .filter(([key, value]) => !['id', 'createdAt', 'updatedAt'].includes(key) && typeof value !== 'object')
            .map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{key}</dt>
                <dd className="mt-1 text-sm">{String(value ?? '-')}</dd>
              </div>
            ))}
        </dl>
      )}
    </section>
  )
}

export default function BatchReportsPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [selected, setSelected] = useState('')
  const [report, setReport] = useState<Traceability | null>(null)

  useEffect(() => {
    fetchBatches({ limit: 500 }).then(data => setBatches(data as Batch[]))
  }, [])

  useEffect(() => {
    if (!selected) return setReport(null)
    api.get<{ data: Traceability }>(`/reports/batch-traceability/${selected}/`)
      .then(response => setReport(response.data))
  }, [selected])

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-3xl font-bold">Batch Traceability Report</h1>
        <p className="mt-1 text-slate-600">One Django-composed record across every production stage.</p>
      </header>
      <Card title="Select Batch">
        <Select value={selected} onChange={event => setSelected(event.target.value)}>
          <option value="">Choose batch</option>
          {batches.map(batch => <option key={batch.id} value={batch.id}>{batch.batchCode} — {batch.productName}</option>)}
        </Select>
      </Card>
      {report && (
        <Card title={`Report ${String(report.batch.batchCode || '')}`}>
          <DocumentSection title="Batch" data={report.batch} />
          <DocumentSection title="Mixing" data={report.mixing} />
          <DocumentSection title="NJP" data={report.njp} />
          <DocumentSection title="Assembly" data={report.assembly} />
        </Card>
      )}
    </div>
  )
}
