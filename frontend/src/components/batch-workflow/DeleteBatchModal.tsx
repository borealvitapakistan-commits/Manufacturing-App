// ============================================================================
// Delete Batch Modal
// ============================================================================

'use client'

import { Modal, Button, CheckBadge } from '@/components/ui'
import type { Batch, BatchStatus } from '@/types'

interface DeleteBatchModalProps {
  batch: Batch
  status: {
    hasMixing: boolean
    hasNJP: boolean
    hasAssembly: boolean
    status: BatchStatus
  }
  onCancel: () => void
  onConfirm: () => void
  loading?: boolean
}

export function DeleteBatchModal({
  batch,
  status,
  onCancel,
  onConfirm,
  loading = false
}: DeleteBatchModalProps) {
  const isFinalized = status.status === 'finalized'

  return (
    <Modal
      open={true}
      onClose={onCancel}
      title="Delete batch and related records?"
      className="border-rose-200"
    >
      {isFinalized && (
        <p className="text-sm text-amber-700 mb-3">
          Warning: This batch is finalized.
        </p>
      )}

      <div className="space-y-3 text-sm">
        <div>
          <strong>Batch:</strong> {batch.batchCode} – {batch.productName}
        </div>

        <div>This batch currently has:</div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckBadge checked={true} />
            <span>Add Batch data</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckBadge checked={status.hasMixing} />
            <span>Mixing record</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckBadge checked={status.hasNJP} />
            <span>NJP record</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckBadge checked={status.hasAssembly} />
            <span>Assembly record</span>
          </div>
        </div>

        <div className="border rounded-lg p-3 bg-rose-50 border-rose-200">
          <p className="font-semibold text-rose-800 mb-1">This will also:</p>
          <ul className="list-disc pl-5 space-y-1 text-rose-800">
            {status.hasAssembly && <li>Delete Assembly record</li>}
            {status.hasNJP && <li>Delete NJP record</li>}
            {status.hasMixing && <li>Delete Mixing record</li>}
            {batch.inventoryDeducted && <li>Restore deducted raw materials</li>}
            <li>Delete the Batch record</li>
          </ul>
        </div>

        <p className="text-xs text-rose-700">
          This will reverse the raw material deduction for this batch and
          permanently remove this batch and its process records.
        </p>
      </div>

      <div className="mt-4 flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>
          Delete & Restore Inventory
        </Button>
      </div>
    </Modal>
  )
}
