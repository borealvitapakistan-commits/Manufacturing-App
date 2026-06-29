// ============================================================================
// Modify Batch Page
// ============================================================================

import Link from 'next/link'
import { Button } from '@/components/ui'
import { BatchListManager } from '@/components/batch-workflow/BatchListManager'

export default function ModifyBatchPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Modify Batch & Stages</h1>
          <p className="text-zinc-600">Search batches, edit batch details, and start or end manufacturing stages.</p>
        </div>
        <Link href="/batches/manage">
          <Button variant="ghost">Back</Button>
        </Link>
      </div>

      <BatchListManager />
    </div>
  )
}
