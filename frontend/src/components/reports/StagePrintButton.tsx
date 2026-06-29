// ============================================================================
// Stage Print Button (Daily/Monthly/Yearly selector, Daily implemented)
// ============================================================================

'use client'

import { useState } from 'react'
import { Button, Input, Label, Modal, Select, useToast } from '@/components/ui'
import { buildDailySheetHtml, buildMonthlySheetHtml, buildYearlySheetHtml, type StagePrintType } from '@/lib/printing/dailySheets'

type PrintScope = 'daily' | 'monthly' | 'yearly'

interface StagePrintButtonProps {
  stage: StagePrintType
  brandName?: string
  reports: Array<Record<string, unknown>>
  batches: Array<Record<string, unknown>>
  disabled?: boolean
  buttonLabel?: string
}

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10)
}

function currentMonthInput(): string {
  return new Date().toISOString().slice(0, 7)
}

function currentYearInput(): string {
  return String(new Date().getFullYear())
}

function stageLabel(stage: StagePrintType): string {
  if (stage === 'mixing') return 'Mixing'
  if (stage === 'njp') return 'NJP'
  return 'Assembly'
}

function safeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report'
}

export function StagePrintButton({
  stage,
  brandName,
  reports,
  batches,
  disabled,
  buttonLabel = 'Print'
}: StagePrintButtonProps) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<PrintScope>('daily')
  const [dailyDate, setDailyDate] = useState(todayDateInput())
  const [monthlyMonth, setMonthlyMonth] = useState(currentMonthInput())
  const [yearlyYear, setYearlyYear] = useState(currentYearInput())
  const [processing, setProcessing] = useState(false)
  const { showToast } = useToast()

  function validateSelection(): boolean {
    if (scope === 'daily' && !dailyDate) {
      showToast({ message: 'Select a date for daily print.', type: 'error' })
      return false
    }
    if (scope === 'monthly' && !monthlyMonth) {
      showToast({ message: 'Select a month for monthly print.', type: 'error' })
      return false
    }
    if (scope === 'yearly' && !yearlyYear) {
      showToast({ message: 'Select a year for yearly print.', type: 'error' })
      return false
    }
    return true
  }

  function buildSheet() {
    return scope === 'daily'
      ? buildDailySheetHtml({
          stage,
          dailyDate,
          brandName,
          reports,
          batches
        })
      : scope === 'monthly'
      ? buildMonthlySheetHtml({
          stage,
          monthlyMonth,
          brandName,
          reports,
          batches
        })
      : buildYearlySheetHtml({
          stage,
          yearlyYear,
          brandName,
          reports,
          batches
        })
  }

  function emptyMessage() {
    return scope === 'daily'
      ? `No ${stageLabel(stage)} entries found for ${dailyDate}.`
      : scope === 'monthly'
      ? `No ${stageLabel(stage)} entries found for ${monthlyMonth}.`
      : `No ${stageLabel(stage)} entries found for ${yearlyYear}.`
  }

  async function handlePrint() {
    if (!validateSelection()) return
    try {
      setProcessing(true)
      const result = buildSheet()

      if (!result.rowCount) {
        showToast({ message: emptyMessage(), type: 'warning' })
        return
      }

      const printWindow = window.open('', '_blank', 'noopener,noreferrer')
      if (!printWindow) {
        showToast({ message: 'Unable to open print window. Allow popups and try again.', type: 'error' })
        return
      }

      printWindow.document.write(result.html)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => printWindow.print(), 150)
      setOpen(false)
    } catch (error) {
      console.error('Print generation failed:', error)
      showToast({ message: 'Failed to generate print sheet.', type: 'error' })
    } finally {
      setProcessing(false)
    }
  }

  async function handleDownload() {
    if (!validateSelection()) return
    try {
      setProcessing(true)
      const result = buildSheet()
      if (!result.rowCount) {
        showToast({ message: emptyMessage(), type: 'warning' })
        return
      }

      const range = scope === 'daily' ? dailyDate : scope === 'monthly' ? monthlyMonth : yearlyYear
      const blob = new Blob([result.html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${safeFilePart(stageLabel(stage))}-${scope}-${safeFilePart(range)}.html`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setOpen(false)
      showToast({ message: `${stageLabel(stage)} sheet downloaded`, type: 'success' })
    } catch (error) {
      console.error('Download generation failed:', error)
      showToast({ message: 'Failed to download print sheet.', type: 'error' })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <>
      <Button
        variant="subtle"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        {buttonLabel}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Print ${stageLabel(stage)} Sheet`}
        description="Choose Daily, Monthly, or Yearly report scope."
      >
        <div className="space-y-4">
          <div>
            <Label>Print Scope</Label>
            <Select
              value={scope}
              onChange={(event) => setScope(event.target.value as PrintScope)}
            >
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </div>

          {scope === 'daily' && (
            <div>
              <Label>Which Day?</Label>
              <Input
                type="date"
                value={dailyDate}
                onChange={(event) => setDailyDate(event.target.value)}
              />
            </div>
          )}

          {scope === 'monthly' && (
            <div>
              <Label>Which Month?</Label>
              <Input
                type="month"
                value={monthlyMonth}
                onChange={(event) => setMonthlyMonth(event.target.value)}
              />
            </div>
          )}

          {scope === 'yearly' && (
            <div>
              <Label>Which Year?</Label>
              <Input
                type="number"
                min="2000"
                max="2100"
                value={yearlyYear}
                onChange={(event) => setYearlyYear(event.target.value)}
              />
              <p className="mt-1 text-xs text-zinc-500">
                Enter year like 2026.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={processing}>
              Cancel
            </Button>
            <Button variant="subtle" onClick={() => void handleDownload()} loading={processing}>
              Download
            </Button>
            <Button onClick={() => void handlePrint()} loading={processing}>
              {processing ? 'Preparing...' : 'View / Print'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
