import { Link } from 'react-router-dom'

interface InventoryLink {
  href: string
  label: string
  title: string
  description: string
}

const inventoryLinks: InventoryLink[] = [
  {
    href: '/bottles-lids',
    label: 'Bottles / Lids',
    title: 'Bottles / Lids',
    description: 'Manage capsule bottles, jars, and lid inventory quantities.'
  },
  {
    href: '/raw-materials',
    label: 'Raw Materials',
    title: 'Raw Materials',
    description: 'Manage raw material stock, categories, vendors, and COA references.'
  },
  {
    href: '/labels',
    label: 'Labels',
    title: 'Labels',
    description: 'Manage label inventory by brand, product, type, and dosage.'
  }
]

function inventoryButtonClass(): string {
  return 'rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50'
}

export default function InventoryPage() {
  return (
    <div className="space-y-7">
      <header className="border-b border-slate-200 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Manage the day-to-day inventory screens for bottles, lids, raw materials, and labels.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        {inventoryLinks.map((item) => (
          <Link key={item.href} to={item.href} className={inventoryButtonClass()}>
            {item.label}
          </Link>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold">Inventory</h2>
        <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
          {inventoryLinks.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="grid gap-2 px-3 py-4 transition hover:bg-[#EFEFEF] sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1D838D]">
                Inventory
              </p>
              <div>
                <p className="font-semibold text-slate-950">{item.title}</p>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
