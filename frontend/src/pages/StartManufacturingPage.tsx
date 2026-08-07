import { Link } from 'react-router-dom'

interface StartManufacturingLink {
  href: string
  title: string
  description: string
}

const manufacturingLinks: StartManufacturingLink[] = [
  {
    href: '/mixing',
    title: 'Mixing',
    description: 'Create a mixing record and produce mixed powder for manufacturing.'
  },
  {
    href: '/encapsulation',
    title: 'Encapsulation',
    description: 'Create an encapsulation record from available mixed powder.'
  },
  {
    href: '/assembly',
    title: 'Assembly',
    description: 'Create an assembly record from completed encapsulation capsules.'
  }
]

function startButtonClass(): string {
  return 'rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50'
}

export default function StartManufacturingPage() {
  return (
    <div className="space-y-7">
      <header className="border-b border-slate-200 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight">Start Manufacturing</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Create manufacturing records for mixing, encapsulation, and assembly.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        {manufacturingLinks.map((item) => (
          <Link key={item.href} to={item.href} className={startButtonClass()}>
            {item.title}
          </Link>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold">Manufacturing Steps</h2>
        <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
          {manufacturingLinks.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="grid gap-2 px-3 py-4 transition hover:bg-[#EFEFEF] sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1D838D]">
                Create
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
