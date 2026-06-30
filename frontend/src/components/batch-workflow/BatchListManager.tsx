// ============================================================================
// Batch List Manager - Modify existing batches
// ============================================================================

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Badge,
  Card,
  Button,
  Input,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
  useToast
} from '@/components/ui'
import {
  initSupabase,
  fetchBatches,
  fetchLabelInventory,
  fetchMixingReports,
  fetchNJPReports,
  fetchAssemblyReports,
  fetchBrands,
  deleteBatchCascade
} from '@/lib/supabase/data'
import {
  formatDate,
  deriveBatchStatus,
  isStageCompleted,
  isStageInProgress
} from '@/lib/utils'
import type {
  AssemblyReport,
  Batch,
  BatchStatus,
  Brand,
  LabelInventory,
  ManufacturingStage,
  MixingReport,
  NJPReport
} from '@/types'
import { DeleteBatchModal } from '@/components/batch-workflow/DeleteBatchModal'

interface LabelStatus {
  isEnough: boolean
  required: number
  available: number
  shortage: number
}

interface BatchStageState {
  hasMixing: boolean
  hasNJP: boolean
  hasAssembly: boolean
  status: BatchStatus
  mixing: MixingReport | null
  njp: NJPReport | null
  assembly: AssemblyReport | null
}

function batchStatusLabel(batch: Batch, status: BatchStatus): string {
  if (batch.batchStatus) return batch.batchStatus
  if (status === 'mixingPending') return 'Batch Created'
  if (status === 'ngpPending') return 'Mixing Completed -> NJP'
  if (status === 'assemblyPending') return 'NJP Completed -> Assembly'
  return 'Completed'
}

function getStageReport(status: BatchStageState, stage: ManufacturingStage) {
  if (stage === 'mixing') return status.mixing
  if (stage === 'njp') return status.njp
  return status.assembly
}

function isStageDone(status: BatchStageState, stage: ManufacturingStage): boolean {
  if (stage === 'mixing') return status.hasMixing
  if (stage === 'njp') return status.hasNJP
  return status.hasAssembly
}

function StageStatusCell({
  status,
  stage
}: {
  status: BatchStageState
  stage: ManufacturingStage
}) {
  const report = getStageReport(status, stage)
  const done = isStageDone(status, stage)
  const inProgress = isStageInProgress(stage, report)

  if (done) {
    return <Badge variant="success">Completed</Badge>
  }

  if (inProgress) {
    return <Badge variant="warning">In progress</Badge>
  }

  if (stage === 'njp' && !status.hasMixing) {
    return <Badge variant="default">Waiting</Badge>
  }

  if (stage === 'assembly' && (!status.hasMixing || !status.hasNJP)) {
    return <Badge variant="default">Waiting</Badge>
  }

  return <Badge variant="warning">Ready</Badge>
}

export function BatchListManager() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBrandId, setSelectedBrandId] = useState('')
  const [statusMap, setStatusMap] = useState<Record<string, BatchStageState>>({})
  const [labelStatusMap, setLabelStatusMap] = useState<Record<string, LabelStatus>>({})
  const [labelsReady, setLabelsReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<{ batch: Batch; status: typeof statusMap[string] } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { showToast } = useToast()

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      await initSupabase()

      const [batchList, brandList, mixingList, njpList, assemblyList] = await Promise.all([
        fetchBatches({ limit: 500 }),
        fetchBrands<Brand>({ activeOnly: true }).catch((brandError) => {
          console.warn('Brand list unavailable:', brandError)
          return [] as Brand[]
        }),
        fetchMixingReports(),
        fetchNJPReports(),
        fetchAssemblyReports()
      ])

      setBatches(batchList as Batch[])
      setBrands(brandList)

      // Build status map
      const map: typeof statusMap = {}
      for (const batch of batchList as Batch[]) {
        const mixingReport = (mixingList as MixingReport[]).find(r => r.batchId === batch.id) || null
        const njpReport = (njpList as NJPReport[]).find(r => r.batchId === batch.id) || null
        const assemblyReport = (assemblyList as AssemblyReport[]).find(r => r.batchId === batch.id) || null
        const hasMixing = isStageCompleted('mixing', batch, mixingReport)
        const hasNJP = isStageCompleted('njp', batch, njpReport)
        const hasAssembly = isStageCompleted('assembly', batch, assemblyReport)
        const status = deriveBatchStatus({ hasMixing, hasNJP, hasAssembly, status: batch.status })
        map[batch.id] = {
          hasMixing,
          hasNJP,
          hasAssembly,
          status,
          mixing: mixingReport,
          njp: njpReport,
          assembly: assemblyReport
        }
      }
      setStatusMap(map)

      let labelInventory: LabelInventory[] = []
      let nextLabelsReady = true
      try {
        labelInventory = (await fetchLabelInventory({ activeOnly: true })) as LabelInventory[]
      } catch (labelError) {
        console.warn('Label inventory unavailable:', labelError)
        nextLabelsReady = false
      }
      setLabelsReady(nextLabelsReady)

      if (!nextLabelsReady) {
        setLabelStatusMap({})
        return
      }

      const availableByBatchKey = new Map<string, number>()
      for (const item of labelInventory) {
        const key = `${item.brandId}::${item.productId}`
        const current = availableByBatchKey.get(key) || 0
        availableByBatchKey.set(key, current + Math.max(0, Number(item.quantity || 0)))
      }

      const nextLabelStatusMap: Record<string, LabelStatus> = {}
      for (const batch of batchList as Batch[]) {
        const key = `${batch.brandId}::${batch.productId}`
        const required = Math.max(0, Number(batch.containerCount || 0))
        const available = Math.max(0, Number(availableByBatchKey.get(key) || 0))
        const shortage = Math.max(0, required - available)

        nextLabelStatusMap[batch.id] = {
          isEnough: shortage === 0,
          required,
          available,
          shortage
        }
      }
      setLabelStatusMap(nextLabelStatusMap)
    } catch (error) {
      console.error('Failed to load batches:', error)
      showToast({ message: 'Failed to load batches', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredBatches = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    return batches.filter((batch) => {
      const matchesBrand = selectedBrandId ? batch.brandId === selectedBrandId : true
      if (!matchesBrand) return false

      if (!query) return true

      return (
        batch.productName.toLowerCase().includes(query) ||
        batch.batchCode.toLowerCase().includes(query)
      )
    })
  }, [batches, searchTerm, selectedBrandId])

  const selectedBrandName = brands.find((brand) => brand.id === selectedBrandId)?.name
  const hasFilters = searchTerm.trim().length > 0 || selectedBrandId.length > 0

  async function handleDelete() {
    if (!deleteTarget) return

    try {
      setDeleting(true)
      await deleteBatchCascade(deleteTarget.batch.id)
      setBatches(prev => prev.filter(b => b.id !== deleteTarget.batch.id))
      setStatusMap(prev => {
        const next = { ...prev }
        delete next[deleteTarget.batch.id]
        return next
      })
      showToast({
        message: `Batch ${deleteTarget.batch.batchCode} deleted. Inventory restored.`,
        type: 'success'
      })
      setDeleteTarget(null)
    } catch (error) {
      console.error('Failed to delete batch:', error)
      showToast({ message: 'Failed to delete batch', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Batches Table */}
      <div id="view-batches" className="scroll-mt-24">
      <Card
        title="Modify Batch & Stages"
        actions={
          <span className="rounded-full bg-[#e0f7fa] px-3 py-1 text-xs font-semibold text-[#006F7A]">
            {loading ? 'Loading batches' : `${filteredBatches.length} of ${batches.length} shown`}
          </span>
        }
      >
        <div className="mb-4 border-y border-zinc-200 py-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px_auto] lg:items-center">
            <div className="relative">
              <label htmlFor="batch-live-search" className="sr-only">
                Search by product name or batch code
              </label>
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#1D838D]">
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>
              <input
                id="batch-live-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search product name or batch code..."
                className="h-12 w-full border border-zinc-300 bg-white pl-11 pr-4 text-sm font-medium text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30"
              />
            </div>

            <div className="relative">
              <label htmlFor="batch-brand-filter" className="sr-only">
                Filter by brand
              </label>
              <select
                id="batch-brand-filter"
                value={selectedBrandId}
                onChange={(event) => setSelectedBrandId(event.target.value)}
                className="h-12 w-full appearance-none border border-zinc-300 bg-white px-4 pr-10 text-sm font-semibold text-zinc-800 outline-none transition focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30"
              >
                <option value="">All brands</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#1D838D]">
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>

            <Button
              variant="ghost"
              className="h-12 justify-center px-4"
              disabled={!hasFilters}
              onClick={() => {
                setSearchTerm('')
                setSelectedBrandId('')
              }}
            >
              Clear
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600">
            <span className="border-l-2 border-zinc-300 px-3 py-1">
              {selectedBrandName ? `Brand: ${selectedBrandName}` : 'All brands'}
            </span>
            <span className="border-l-2 border-zinc-300 px-3 py-1">
              Matches: {filteredBatches.length}
            </span>
            {searchTerm.trim() && (
              <span className="border-l-2 border-zinc-300 px-3 py-1">
                Query: {searchTerm.trim()}
              </span>
            )}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Batch Code</TableHead>
              <TableHead>Dosage</TableHead>
              <TableHead>Containers</TableHead>
              <TableHead>Total Units</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Current Stage</TableHead>
              <TableHead>Mixing</TableHead>
              <TableHead>NJP</TableHead>
              <TableHead>Assembly</TableHead>
              <TableHead>Labels</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoading colSpan={14} />
            ) : batches.length === 0 ? (
              <TableEmpty colSpan={14} message="No batches yet. Create your first batch!" />
            ) : filteredBatches.length === 0 ? (
              <TableEmpty colSpan={14} message="No batches match this search." />
            ) : (
              filteredBatches.map(batch => {
                const st = statusMap[batch.id] || {
                  hasMixing: false,
                  hasNJP: false,
                  hasAssembly: false,
                  status: 'mixingPending' as BatchStatus,
                  mixing: null,
                  njp: null,
                  assembly: null
                }
                const labelStatus = labelStatusMap[batch.id]
                return (
                  <TableRow key={batch.id} clickable>
                    <TableCell>{formatDate(batch.createdAt)}</TableCell>
                    <TableCell>{batch.brandName}</TableCell>
                    <TableCell>{batch.productName}</TableCell>
                    <TableCell className="font-semibold">{batch.batchCode}</TableCell>
                    <TableCell>{batch.dosageForm}</TableCell>
                    <TableCell>{batch.containerCount}</TableCell>
                    <TableCell>{batch.totalUnits ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={st.hasAssembly ? 'success' : 'warning'}>
                        {batchStatusLabel(batch, st.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{batch.currentStage || st.status}</TableCell>
                    <TableCell>
                      <StageStatusCell
                        status={st}
                        stage="mixing"
                      />
                    </TableCell>
                    <TableCell>
                      <StageStatusCell
                        status={st}
                        stage="njp"
                      />
                    </TableCell>
                    <TableCell>
                      <StageStatusCell
                        status={st}
                        stage="assembly"
                      />
                    </TableCell>
                    <TableCell>
                      {!labelsReady ? (
                        <span className="text-zinc-500 text-xs">
                          Label schema not deployed
                        </span>
                      ) : labelStatus ? (
                        labelStatus.isEnough ? (
                          <span className="text-emerald-700 text-xs font-medium">
                            Enough ({labelStatus.available}/{labelStatus.required})
                          </span>
                        ) : (
                          <span className="text-amber-700 text-xs font-semibold">
                            Warning: Labels not enough. Order them.
                          </span>
                        )
                      ) : (
                        <span className="text-zinc-500 text-xs">Checking...</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Link href={`/batches/new?edit=${batch.id}`}>
                          <Button variant="subtle" size="sm">Edit</Button>
                        </Link>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget({ batch, status: st })
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteBatchModal
          batch={deleteTarget.batch}
          status={deleteTarget.status}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}

    </div>
  )
}
