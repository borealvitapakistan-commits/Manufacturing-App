import { Link } from 'react-router-dom'

interface InventoryHubLink {
  href: string
  title: string
  description: string
  type: string
}

const inventoryLinks: InventoryHubLink[] = [
  {
    href: '/inventory',
    title: 'Inventory',
    description: 'Open bottles and lids, raw materials, and labels inventory.',
    type: 'Inventory'
  },
  {
    href: '/inventory-records',
    title: 'Records',
    description: 'Inspect inventory items, lots, balances, locations, and movement history.',
    type: 'Records'
  },
  {
    href: '/finished-goods',
    title: 'Finished Goods',
    description: 'View powders, capsules and bottles after manufacturing operations.',
    type: 'Finished Goods'
  }
]

function inventoryHubButtonClass(): string {
  return 'rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50'
}

export default function InventoryManagementPage() {
  return (
    <div className="space-y-7">
      <header className="border-b border-slate-200 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight">Inventory Management</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Open inventory, records, and finished goods from one clear inventory area.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        {inventoryLinks.map((item) => (
          <Link key={item.href} to={item.href} className={inventoryHubButtonClass()}>
            {item.title}
          </Link>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold">Inventory Management</h2>
        <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
          {inventoryLinks.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="grid gap-2 px-3 py-4 transition hover:bg-[#EFEFEF] sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1D838D]">
                {item.type}
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
