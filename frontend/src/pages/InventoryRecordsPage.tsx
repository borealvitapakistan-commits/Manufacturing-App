import { useEffect, useMemo, useState } from 'react'

import { fetchInventoryRecords } from '@/lib/supabase/data'

type InventoryRecordKey = 'items' | 'lots' | 'balances' | 'movements' | 'locations'

interface InventoryRecordTable {
  key: InventoryRecordKey
  label: string
  title: string
  description: string
}

const inventoryRecordTables: InventoryRecordTable[] = [
  {
    key: 'items',
    label: 'Inventory Items',
    title: 'Inventory Items',
    description: 'Master inventory item rows used by raw materials, labels, bottles, and finished goods.'
  },
  {
    key: 'lots',
    label: 'Inventory Lots',
    title: 'Inventory Lots',
    description: 'Lot-level traceability records with source, location, status, and expiry details.'
  },
  {
    key: 'balances',
    label: 'Inventory Balances',
    title: 'Inventory Balances',
    description: 'Current stock balances at item, lot, and location level.'
  },
  {
    key: 'movements',
    label: 'Inventory Movements',
    title: 'Inventory Movements',
    description: 'Every stock movement recorded by receiving, manufacturing, adjustments, and consumption.'
  },
  {
    key: 'locations',
    label: 'Inventory Locations',
    title: 'Inventory Locations',
    description: 'Storage locations used by lots and balances.'
  }
]

function recordButtonClass(active: boolean): string {
  return active
    ? 'rounded-xl border border-[#1D838D] bg-[#1D838D] px-4 py-2 text-sm font-medium text-white shadow-[inset_0_0_0_2px_#111827]'
    : 'rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50'
}

function formatColumnName(column: string): string {
  return column.replace(/_/g, ' ').toUpperCase()
}

function isIdColumn(column: string): boolean {
  const normalized = column.toLowerCase()
  return normalized === 'id' || normalized.endsWith('_id')
}

function isHiddenRecordColumn(column: string): boolean {
  return isIdColumn(column) || column.toLowerCase() === 'metadata'
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '-'
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

export default function InventoryRecordsPage() {
  const [activeTable, setActiveTable] = useState<InventoryRecordKey>('items')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const activeConfig =
    inventoryRecordTables.find((table) => table.key === activeTable) ?? inventoryRecordTables[0]

  useEffect(() => {
    let mounted = true

    setLoading(true)
    setError(null)

    fetchInventoryRecords(activeTable, 200)
      .then((data) => {
        if (!mounted) return
        setRows(Array.isArray(data) ? (data as Record<string, unknown>[]) : [])
      })
      .catch((err: unknown) => {
        if (!mounted) return
        setRows([])
        setError(err instanceof Error ? err.message : 'Failed to load inventory records.')
      })
      .finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [activeTable])

  const columns = useMemo(() => {
    const seen = new Set<string>()
    const orderedColumns: string[] = []

    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!seen.has(key) && !isHiddenRecordColumn(key)) {
          seen.add(key)
          orderedColumns.push(key)
        }
      })
    })

    return orderedColumns
  }, [rows])

  return (
    <div className="space-y-7">
      <header className="border-b border-slate-200 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight">Records</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Inspect the core inventory record tables used for traceability and stock movement.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        {inventoryRecordTables.map((table) => (
          <button
            key={table.key}
            type="button"
            onClick={() => setActiveTable(table.key)}
            className={recordButtonClass(activeTable === table.key)}
          >
            {table.label}
          </button>
        ))}
      </div>

      <section>
        <div className="border-b border-slate-200 pb-5">
          <h2 className="text-lg font-semibold">{activeConfig.title}</h2>
          <p className="mt-1 max-w-4xl text-sm text-slate-600">{activeConfig.description}</p>
        </div>

        {error ? (
          <div className="mt-5 border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto border-y border-slate-200">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  SR
                </th>
                {columns.map((column) => (
                  <th
                    key={column}
                    className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600"
                  >
                    {formatColumnName(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={Math.max(columns.length + 1, 1)}>
                    Loading records...
                  </td>
                </tr>
              ) : columns.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={1}>
                    No records found.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={`${activeTable}-${index}`} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                      {index + 1}
                    </td>
                    {columns.map((column) => (
                      <td key={column} className="px-4 py-3 text-slate-800">
                        <span className="block max-w-[360px] overflow-hidden text-ellipsis whitespace-nowrap">
                          {formatCellValue(row[column])}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
