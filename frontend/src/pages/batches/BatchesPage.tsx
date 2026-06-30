// ============================================================================
// Batches Page - Main batch navigation
// ============================================================================

import Link from 'next/link'

const actions = [
  { href: '/batches/manage', type: 'Batch', title: 'Create Batch / Modify Batch' },
  { href: '/batches/assembly', type: 'Batch', title: 'Assembly' },
  { href: '/batches/workflow', type: 'Report', title: 'Manufacturing Reports' },
  { href: '/batches/view', type: 'List', title: 'View Batches' },
  { href: '/batches/reports', type: 'Report', title: 'View Reports' },
  { href: '/batches/pricing', type: 'Under development', title: 'View Pricing', status: 'Under development' }
]

export default function BatchesPage() {
  return (
    <div className="space-y-6">
      <header className="border-b border-zinc-200 pb-4">
        <h1 className="text-3xl font-bold tracking-tight">Batch</h1>
        <p className="mt-1 text-zinc-600">Create batches and manage assembly inside the batch record.</p>
      </header>

      <nav className="divide-y divide-zinc-200 border-y border-zinc-200">
        {actions.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="grid min-h-16 gap-2 px-3 py-3 transition hover:bg-[#EFEFEF] sm:grid-cols-[150px_1fr] sm:items-center"
          >
            <span className={`text-xs font-semibold uppercase tracking-wide ${
              item.status ? 'text-amber-700' : 'text-[#1D838D]'
            }`}>
              {item.type}
            </span>
            <span className="flex flex-wrap items-center gap-2 font-semibold text-zinc-950">
              {item.title}
              {item.status && (
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                  {item.status}
                </span>
              )}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
