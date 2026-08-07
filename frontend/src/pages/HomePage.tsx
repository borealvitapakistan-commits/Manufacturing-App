import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '@/lib/api/client'

interface ModuleLink {
  href: string
  title: string
  description: string
  type: string
}

const traceabilityModules: ModuleLink[] = [
  {
    href: '/start-manufacturing',
    title: 'Start Manufacturing',
    description: 'Create mixing, encapsulation, and assembly records from one manufacturing area.',
    type: 'Traceability'
  },
  {
    href: '/inventory-management',
    title: 'Inventory Management',
    description: 'Open inventory, records, and finished goods from one inventory area.',
    type: 'Traceability'
  },
  {
    href: '/manufacturing-reports',
    title: 'Manufacturing Reports',
    description: 'Download and print reports for powders, capsules and bottles.',
    type: 'Traceability'
  },
  {
    href: '/products',
    title: 'Products',
    description: 'Define product formulas and material requirements.',
    type: 'Traceability'
  },
  {
    href: '/product-price-calculator',
    title: 'Product Price Calculator',
    description: 'Calculate product formula, packaging and CAD pricing.',
    type: 'Traceability'
  },
  {
    href: '/brands',
    title: 'Brands',
    description: 'Maintain brand codes, identity and active status.',
    type: 'Traceability'
  },
  {
    href: '/vendors',
    title: 'Vendors',
    description: 'Manage suppliers, manufacturers, shops and their PO prefixes.',
    type: 'Traceability'
  },
  {
    href: '/send-items',
    title: 'Send Items',
    description: 'Record goods sent to a vendor and deduct them from finished-goods inventory.',
    type: 'Traceability'
  }
]

const underDevelopmentModules: ModuleLink[] = [
  {
    href: '/purchase-orders',
    title: 'Purchase Orders',
    description: 'Purchasing documents remain available while core traceability is connected.',
    type: 'Under development'
  },
  {
    href: '/employees',
    title: 'Employees',
    description: 'HR tools remain available but are outside the current traceability priority.',
    type: 'Under development'
  },
  {
    href: '/expenses',
    title: 'Expenses',
    description: 'Finance tools remain available but are outside the current traceability priority.',
    type: 'Under development'
  }
]

function ModuleRows({
  modules,
  development = false
}: {
  modules: ModuleLink[]
  development?: boolean
}) {
  return (
    <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
      {modules.map((item) => (
        <Link
          key={item.href}
          to={item.href}
          className={`grid gap-2 px-3 py-4 transition hover:bg-[#EFEFEF] sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center ${
            development ? 'text-slate-500' : ''
          }`}
        >
          <p className={`text-xs font-semibold uppercase tracking-wide ${
            development ? 'text-amber-700' : 'text-[#1D838D]'
          }`}>
            {item.type}
          </p>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-slate-950">{item.title}</p>
              <p className="mt-1 text-sm text-slate-600">{item.description}</p>
            </div>
            {development && (
              <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Under development
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

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
        <h2 className="text-lg font-semibold">Traceability Core</h2>
        <ModuleRows modules={traceabilityModules} />
      </section>

      <section>
        <h2 className="text-lg font-semibold">Under Development</h2>
        <ModuleRows modules={underDevelopmentModules} development />
      </section>
    </div>
  )
}
