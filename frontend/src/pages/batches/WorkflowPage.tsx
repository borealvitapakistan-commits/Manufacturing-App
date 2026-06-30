import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import {
  Badge,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableLoading,
  TableRow,
  useToast
} from '@/components/ui'
import { StagePrintButton } from '@/components/reports/StagePrintButton'
import {
  fetchAssemblyReports,
  fetchBatches,
  fetchMixingReports,
  fetchNJPReports,
  initSupabase
} from '@/lib/supabase/data'
import {
  deriveBatchStatus,
  formatDate,
  isStageCompleted,
  isStageInProgress
} from '@/lib/utils'
import type {
  AssemblyReport,
  Batch,
  ManufacturingStage,
  MixingReport,
  NJPReport
} from '@/types'

type FilterMode = 'incomplete' | 'completed' | 'all'

interface WorkflowRow {
  batch: Batch
  mixing: MixingReport | null
  njp: NJPReport | null
  assembly: AssemblyReport | null
  mixingDone: boolean
  njpDone: boolean
  assemblyDone: boolean
}

const STAGE_LABEL: Record<ManufacturingStage, string> = {
  mixing: 'Mixing',
  njp: 'NJP',
  assembly: 'Assembly'
}

function formatTime(value: string | null | undefined): string {
  const raw = String(value || '').trim()
  if (!raw) return '-'
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return raw
  const hour = Number(match[1])
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${match[2]} ${suffix}`
}

function formatReportDate(value: unknown): string {
  return value ? formatDate(value) : '-'
}

function stageReport(row: WorkflowRow, stage: ManufacturingStage) {
  if (stage === 'mixing') return row.mixing
  if (stage === 'njp') return row.njp
  return row.assembly
}

function stageComplete(row: WorkflowRow, stage: ManufacturingStage): boolean {
  if (stage === 'mixing') return row.mixingDone
  if (stage === 'njp') return row.njpDone
  return row.assemblyDone
}

function stageRoute(row: WorkflowRow, stage: ManufacturingStage): string {
  const basePath = stage === 'assembly' ? '/batches/assembly' : `/${stage}`
  return `${basePath}?batchId=${row.batch.id}&brandId=${row.batch.brandId}`
}

function formatStageName(value: string | null | undefined): string {
  const text = String(value || '').trim()
  if (!text) return '-'
  return text.replace(/_/g, ' ')
}

function batchStatusLabel(batch: Batch, status: ReturnType<typeof deriveBatchStatus>): string {
  if (batch.batchStatus) return batch.batchStatus
  if (status === 'mixingPending') return 'Batch Created'
  if (status === 'ngpPending') return 'Mixing Completed -> NJP'
  if (status === 'assemblyPending') return 'NJP Completed -> Assembly'
  return 'Completed'
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function stageStatus(row: WorkflowRow, stage: ManufacturingStage): string {
  const report = stageReport(row, stage)
  if (stageComplete(row, stage)) return 'Completed'
  if (isStageInProgress(stage, report)) return 'In progress'
  if (stage === 'mixing') return 'Not started'
  if (stage === 'njp') return row.mixingDone ? 'Ready' : 'Waiting'
  return row.mixingDone && row.njpDone ? 'Ready' : 'Waiting'
}

function stageBadgeVariant(status: string): 'success' | 'warning' | 'default' {
  if (status === 'Completed') return 'success'
  if (status === 'In progress' || status === 'Ready') return 'warning'
  return 'default'
}

function reportField(report: MixingReport | NJPReport | AssemblyReport | null, key: 'startDate' | 'endDate' | 'startTime' | 'endTime' | 'remarks' | 'reason'): unknown {
  return report ? report[key] : null
}

function buildBatchStageHtml(row: WorkflowRow): string {
  const derivedStatus = deriveBatchStatus({
    hasMixing: row.mixingDone,
    hasNJP: row.njpDone,
    hasAssembly: row.assemblyDone,
    status: row.batch.status
  })
  const stages = (['mixing', 'njp', 'assembly'] as ManufacturingStage[]).map(stage => {
    const report = stageReport(row, stage)
    return {
      stage: STAGE_LABEL[stage],
      status: stageStatus(row, stage),
      startDate: formatReportDate(reportField(report, 'startDate')),
      startTime: formatTime(String(reportField(report, 'startTime') || '')),
      endDate: formatReportDate(reportField(report, 'endDate')),
      endTime: formatTime(String(reportField(report, 'endTime') || '')),
      remarks: String(reportField(report, 'remarks') || '-'),
      reason: String(reportField(report, 'reason') || '-')
    }
  })

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(row.batch.batchCode)} Manufacturing Stages</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .meta { margin: 0 0 18px; color: #4b5563; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-size: 12px; text-transform: uppercase; }
    .badge { display: inline-block; border-radius: 999px; padding: 4px 10px; background: #e0f2fe; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Manufacturing Stage Report</h1>
  <p class="meta">Batch ${escapeHtml(row.batch.batchCode)} - ${escapeHtml(row.batch.productName)}</p>
  <p><strong>Brand:</strong> ${escapeHtml(row.batch.brandName)}<br>
  <strong>Batch Status:</strong> ${escapeHtml(batchStatusLabel(row.batch, derivedStatus))}<br>
  <strong>Current Stage:</strong> ${escapeHtml(formatStageName(row.batch.currentStage || derivedStatus))}<br>
  <strong>Started:</strong> ${escapeHtml(formatReportDate(row.batch.batchStartDate || row.batch.createdAt))} ${escapeHtml(formatTime(row.batch.batchStartTime || row.batch.startTime))}</p>
  <table>
    <thead>
      <tr>
        <th>Stage</th>
        <th>Status</th>
        <th>Start</th>
        <th>End</th>
        <th>Remarks</th>
        <th>Reason</th>
      </tr>
    </thead>
    <tbody>
      ${stages.map(stage => `
        <tr>
          <td>${escapeHtml(stage.stage)}</td>
          <td><span class="badge">${escapeHtml(stage.status)}</span></td>
          <td>${escapeHtml(stage.startDate)}<br>${escapeHtml(stage.startTime)}</td>
          <td>${escapeHtml(stage.endDate)}<br>${escapeHtml(stage.endTime)}</td>
          <td>${escapeHtml(stage.remarks)}</td>
          <td>${escapeHtml(stage.reason)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`
}

function downloadBatchStageReport(row: WorkflowRow) {
  const html = buildBatchStageHtml(row)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const filePart = row.batch.batchCode.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'batch'
  link.href = url
  link.download = `${filePart}-manufacturing-stages.html`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function StageCell({
  row,
  stage
}: {
  row: WorkflowRow
  stage: ManufacturingStage
}) {
  const report = stageReport(row, stage)
  const status = stageStatus(row, stage)
  const canOpen = Boolean(report) || status === 'Ready'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={stageBadgeVariant(status)}>{status}</Badge>
      {canOpen && (
        <Link href={stageRoute(row, stage)}>
          <Button size="sm" variant="subtle">Open</Button>
        </Link>
      )}
    </div>
  )
}

export default function WorkflowPage() {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [batches, setBatches] = useState<Batch[]>([])
  const [mixingReports, setMixingReports] = useState<MixingReport[]>([])
  const [njpReports, setNjpReports] = useState<NJPReport[]>([])
  const [assemblyReports, setAssemblyReports] = useState<AssemblyReport[]>([])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      await initSupabase()
      const [batchList, mixingList, njpList, assemblyList] = await Promise.all([
        fetchBatches({ limit: 500 }),
        fetchMixingReports(),
        fetchNJPReports(),
        fetchAssemblyReports()
      ])
      setBatches(batchList as Batch[])
      setMixingReports(mixingList as MixingReport[])
      setNjpReports(njpList as NJPReport[])
      setAssemblyReports(assemblyList as AssemblyReport[])
    } catch (error) {
      console.error('Failed to load manufacturing reports:', error)
      showToast({ message: 'Failed to load manufacturing reports', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo<WorkflowRow[]>(() => {
    const mixingByBatch = new Map(mixingReports.map(report => [report.batchId, report]))
    const njpByBatch = new Map(njpReports.map(report => [report.batchId, report]))
    const assemblyByBatch = new Map(assemblyReports.map(report => [report.batchId, report]))

    return batches.map(batch => {
      const mixing = mixingByBatch.get(batch.id) || null
      const njp = njpByBatch.get(batch.id) || null
      const assembly = assemblyByBatch.get(batch.id) || null
      return {
        batch,
        mixing,
        njp,
        assembly,
        mixingDone: isStageCompleted('mixing', batch, mixing),
        njpDone: isStageCompleted('njp', batch, njp),
        assemblyDone: isStageCompleted('assembly', batch, assembly)
      }
    })
  }, [assemblyReports, batches, mixingReports, njpReports])

  const filteredRows = rows.filter(row => {
    if (filter === 'completed') return row.assemblyDone || row.batch.status === 'finalized'
    if (filter === 'incomplete') return !row.assemblyDone && row.batch.status !== 'finalized'
    return true
  })

  const incompleteCount = rows.filter(row => !row.assemblyDone && row.batch.status !== 'finalized').length
  const completedCount = rows.length - incompleteCount
  const reportBatches = batches.map(batch => batch as unknown as Record<string, unknown>)

  return (
    <div className="space-y-6">
      <header className="border-b border-zinc-200 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Manufacturing Reports</h1>
            <p className="mt-1 text-zinc-600">View every batch stage and download manufacturing status reports.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/batches/manage/modify">
              <Button>Modify Batch & Stages</Button>
            </Link>
            <Link href="/batches/view">
              <Button variant="ghost">Complete Batch Report</Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 border-y border-zinc-200 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {(['all', 'incomplete', 'completed'] as FilterMode[]).map(mode => (
            <Button
              key={mode}
              variant={filter === mode ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilter(mode)}
            >
              {mode === 'all' ? `All (${rows.length})` : mode === 'incomplete' ? `Incomplete (${incompleteCount})` : `Completed (${completedCount})`}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <StagePrintButton
            stage="mixing"
            reports={mixingReports.map(report => report as unknown as Record<string, unknown>)}
            batches={reportBatches}
            disabled={loading}
            buttonLabel="Mixing Download"
          />
          <StagePrintButton
            stage="njp"
            reports={njpReports.map(report => report as unknown as Record<string, unknown>)}
            batches={reportBatches}
            disabled={loading}
            buttonLabel="NJP Download"
          />
          <StagePrintButton
            stage="assembly"
            reports={assemblyReports.map(report => report as unknown as Record<string, unknown>)}
            batches={reportBatches}
            disabled={loading}
            buttonLabel="Assembly Download"
          />
        </div>
      </div>

      <Card
        title="Batch Stage Reports"
        actions={<span className="text-sm font-semibold text-zinc-600">{filteredRows.length} shown</span>}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Batch Status</TableHead>
              <TableHead>Current Stage</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Mixing</TableHead>
              <TableHead>NJP</TableHead>
              <TableHead>Assembly</TableHead>
              <TableHead>Download</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoading colSpan={9} />
            ) : filteredRows.length === 0 ? (
              <TableEmpty colSpan={9} message="No batches in this view." />
            ) : (
              filteredRows.map(row => {
                const derivedStatus = deriveBatchStatus({
                  hasMixing: row.mixingDone,
                  hasNJP: row.njpDone,
                  hasAssembly: row.assemblyDone,
                  status: row.batch.status
                })
                return (
                  <TableRow key={row.batch.id}>
                    <TableCell className="font-semibold">{row.batch.batchCode}</TableCell>
                    <TableCell>{row.batch.productName}</TableCell>
                    <TableCell>
                      <Badge variant={row.assemblyDone ? 'success' : 'warning'}>
                        {batchStatusLabel(row.batch, derivedStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatStageName(row.batch.currentStage || derivedStatus)}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{formatDate(row.batch.batchStartDate || row.batch.createdAt)}</div>
                        <div className="text-xs text-zinc-500">{formatTime(row.batch.batchStartTime || row.batch.startTime)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StageCell row={row} stage="mixing" />
                    </TableCell>
                    <TableCell>
                      <StageCell row={row} stage="njp" />
                    </TableCell>
                    <TableCell>
                      <StageCell row={row} stage="assembly" />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="subtle" onClick={() => downloadBatchStageReport(row)}>
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

    </div>
  )
}
