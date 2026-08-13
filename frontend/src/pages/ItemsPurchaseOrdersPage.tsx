import { Link } from 'react-router-dom'

interface ItemsPurchaseOrdersLink {
  href: string
  title: string
  description: string
}

const itemsPurchaseOrdersLinks: ItemsPurchaseOrdersLink[] = [
  {
    href: '/vendors',
    title: 'Vendors',
    description: 'Manage suppliers, manufacturers, shops and their PO prefixes.'
  },
  {
    href: '/request-to-quote',
    title: 'Request to Quote',
    description: 'Send vendors a request to quote prices, with PDF export.'
  },
  {
    href: '/quotes',
    title: 'Quote',
    description: "Attach the vendor's quote document to a Request to Quote."
  },
  {
    href: '/purchase-orders',
    title: 'Purchase Orders',
    description: 'Create formal purchase order documents with PDF export.'
  },
  {
    href: '/invoices',
    title: 'Invoices',
    description: "Attach the vendor's invoice document to a Purchase Order."
  },
  {
    href: '/send-items',
    title: 'Send Items',
    description: 'Record goods sent to a vendor and deduct them from finished-goods inventory.'
  }
]

function itemsButtonClass(): string {
  return 'rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50'
}

export default function ItemsPurchaseOrdersPage() {
  return (
    <div className="space-y-7">
      <header className="border-b border-slate-200 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight">Items and Purchase Orders</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Manage vendors, sent items, purchase orders, and requests to quote from one area.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        {itemsPurchaseOrdersLinks.map((item) => (
          <Link key={item.href} to={item.href} className={itemsButtonClass()}>
            {item.title}
          </Link>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold">Items and Purchase Orders</h2>
        <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
          {itemsPurchaseOrdersLinks.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="grid gap-2 px-3 py-4 transition hover:bg-[#EFEFEF] sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1D838D]">
                Open
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
