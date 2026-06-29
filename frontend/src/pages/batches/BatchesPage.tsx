// ============================================================================
// Batches Page - Main batch navigation
// ============================================================================

import Link from 'next/link'

const actions = [
  { href: '/batches/manage', type: 'Batch', title: 'Create Batch / Modify Batch' },
  { href: '/batches/workflow', type: 'Report', title: 'Manufacturing Reports' },
  { href: '/batches/view', type: 'List', title: 'View Batches' },
  { href: '/batches/pricing', type: 'Cost', title: 'View Pricing' },
  { href: '/batches/reports', type: 'Report', title: 'View Reports' }
]

export default function BatchesPage() {
  return (
    <div className="space-y-6">
      <header className="border-b border-zinc-200 pb-4">
        <h1 className="text-3xl font-bold tracking-tight">Batches</h1>
        <p className="mt-1 text-zinc-600">Manage batch production workflow</p>
      </header>

      <nav className="divide-y divide-zinc-200 border-y border-zinc-200">
        {actions.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="grid min-h-16 gap-2 px-3 py-3 transition hover:bg-[#EFEFEF] sm:grid-cols-[120px_1fr] sm:items-center"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-[#1D838D]">{item.type}</span>
            <span className="font-semibold text-zinc-950">{item.title}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
