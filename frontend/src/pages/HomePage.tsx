import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '@/lib/api/client'

const modules = [
  ['/brands', 'Brands', 'Maintain brand codes, identity and status.', 'Master Data'],
  ['/raw-materials', 'Raw Materials', 'Manage stock, locations and purchase costs.', 'Inventory'],
  ['/labels', 'Labels', 'Track label stock by brand and product.', 'Inventory'],
  ['/products', 'Products', 'Define formulas and label claims.', 'Master Data'],
  ['/batches', 'Batches', 'Create and track production workflow stages.', 'Workflow'],
  ['/finished-goods', 'Finished Goods', 'Track powder, capsule and bottle inventory.', 'Inventory'],
  ['/employees', 'Employees', 'Attendance, work logs, loans and payroll.', 'HR'],
  ['/expenses', 'Expenses', 'Manage books, ledger entries and carry balances.', 'Finance'],
  ['/vendors', 'Vendors', 'Supplier details and purchase-order prefixes.', 'Master Data'],
  ['/purchase-orders', 'Purchase Orders', 'Create multi-line documents and PDF exports.', 'Purchasing']
]

export default function HomePage() {
  const [status, setStatus] = useState('Checking Django backend…')
  const [healthy, setHealthy] = useState(false)

  useEffect(() => {
    api.get<{
      ok: boolean
      supabaseConfigured: boolean
      supabaseConnected: boolean
      supabaseCredentialMode: string
    }>('/health/')
      .then(result => {
        setHealthy(result.ok && result.supabaseConnected)
        setStatus(
          result.supabaseConnected
            ? `Django API connected to Supabase (${result.supabaseCredentialMode}).`
            : result.supabaseConfigured
              ? 'Django API is running, but the live Supabase connection failed.'
              : 'Django API is running, but Supabase credentials are not configured.'
        )
      })
      .catch(error => setStatus(`Django API connection failed: ${error.message}`))
  }, [])

  return (
    <div className="space-y-7">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1D838D]">
          Herbal Manufacturing System
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Operations Launchpad</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          React TypeScript frontend with Django as the single business and data API.
        </p>
      </header>

      <div className={`border-l-4 p-3 text-sm ${
        healthy
          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
          : 'border-amber-500 bg-amber-50 text-amber-800'
      }`}>
        {status}
      </div>

      <section>
        <h2 className="text-lg font-semibold">All Sections</h2>
        <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
          {modules.map(([href, title, description, type]) => (
            <Link
              key={href}
              to={href}
              className="grid gap-2 px-3 py-4 transition hover:bg-[#EFEFEF] sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{type}</p>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-sm text-slate-600">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
