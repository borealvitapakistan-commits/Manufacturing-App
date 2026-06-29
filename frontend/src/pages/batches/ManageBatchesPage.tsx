// ============================================================================
// Create or Modify Batch Page
// ============================================================================

import Link from 'next/link'
import { Card, Button } from '@/components/ui'

const options = [
  {
    href: '/batches/new',
    title: 'Create Batch',
    description: 'Open the form to create a new production batch.',
    color: 'bg-cyan-50 hover:bg-cyan-100 border-cyan-200 text-cyan-700'
  },
  {
    href: '/batches/manage/modify',
    title: 'Modify Batch',
    description: 'Edit batch details and update manufacturing stages.',
    color: 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700'
  }
]

export default function ManageBatchPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Create Batch / Modify Batch</h1>
          <p className="text-zinc-600">Create a batch, or modify its details and manufacturing stages.</p>
        </div>
        <Link href="/batches">
          <Button variant="ghost">Back to Batches</Button>
        </Link>
      </div>

      <Card title="Select an Option">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((option) => (
            <Link
              key={option.href}
              href={option.href}
              className={`rounded-xl border-2 p-5 text-left transition-all ${option.color}`}
            >
              <p className="text-lg font-semibold">{option.title}</p>
              <p className="mt-1 text-sm text-zinc-600">{option.description}</p>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}
