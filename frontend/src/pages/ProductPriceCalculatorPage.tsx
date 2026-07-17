import { useEffect, useMemo, useRef, useState } from 'react'

import {
  Button,
  Card,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui'
import { api } from '@/lib/api/client'
import { fetchProducts } from '@/lib/supabase/data'
import type { Product } from '@/types'

type PricingLine = {
  sr: number
  rawMaterialId?: string | null
  rawMaterialCode?: string | null
  rawMaterialName?: string | null
  labelClaim?: string | null
  computedWeightKg: number
  requiredKg?: number
  pricePerKg: number
  cost: number
}

type PricingReport = {
  product: Product
  unitsPerContainer: number
  containerCount: number
  totalUnits: number
  pricingLines: PricingLine[]
  rawMaterialCost: number
  capsuleCost: number
  bottleCost: number
  lidCost: number
  labelCost: number
  packagingCost: number
  grandTotal: number
  costPerContainer: number
  cadRate: number | null
  grandTotalCAD: number | null
}

type CurrencyRateReport = {
  base: string
  target: string
  rate: number
  date?: string | null
  source?: string | null
}

const defaults = {
  unitsPerContainer: '120',
  containerCount: '0',
  capsPricePer75000: '1000',
  bottleUnitCost: '0.5',
  lidUnitCost: '0.1',
  labelUnitCost: '0.15',
  cadRate: ''
}

const unitsPerBottleOptions = ['60', '90', '120', '180', '240']

const productUnitLabels: Record<NonNullable<Product['type']>, string> = {
  capsule: 'Capsule',
  tablets: 'Tablets',
  softgel: 'Softgel',
  liquid: 'Liquid',
  lozengers: 'Lozengers',
  powder: 'Powder'
}

type PricingForm = typeof defaults
type PriceOverrides = Record<string, string>

function toNumber(value: string | number | null | undefined): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function lineKey(line: PricingLine): string {
  return line.rawMaterialId || line.rawMaterialCode || String(line.sr)
}

function money(value: number | null | undefined, currency = 'USD'): string {
  if (value === null || value === undefined) return '-'
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ${currency}`
}

function numberText(value: number | null | undefined, decimals = 4): string {
  if (value === null || value === undefined) return '-'
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

function rateText(value: number): string {
  return Number(value).toFixed(6).replace(/\.?0+$/, '')
}

function productUnitLabel(product: Product | null): string {
  if (!product?.type) return ''
  return productUnitLabels[product.type] || ''
}

function calculatePackaging(form: PricingForm, totalUnits: number, containerCount: number) {
  const capsuleCost = toNumber(form.capsPricePer75000) / 75_000 * totalUnits
  const bottleCost = toNumber(form.bottleUnitCost) * containerCount
  const lidCost = toNumber(form.lidUnitCost) * containerCount
  const labelCost = toNumber(form.labelUnitCost) * containerCount
  return {
    capsuleCost,
    bottleCost,
    lidCost,
    labelCost,
    packagingCost: capsuleCost + bottleCost + lidCost + labelCost
  }
}

function applyPriceOverrides(report: PricingReport, form: PricingForm, overrides: PriceOverrides): PricingReport {
  const lines = report.pricingLines.map(line => {
    const override = overrides[lineKey(line)]
    const pricePerKg = override === undefined || override === '' ? line.pricePerKg : toNumber(override)
    const requiredKg = line.requiredKg ?? line.computedWeightKg
    return {
      ...line,
      pricePerKg,
      cost: Number((requiredKg * pricePerKg).toFixed(4))
    }
  })
  const rawMaterialCost = lines.reduce((sum, line) => sum + line.cost, 0)
  const packaging = calculatePackaging(form, report.totalUnits, report.containerCount)
  const grandTotal = rawMaterialCost + packaging.packagingCost
  const cadRate = form.cadRate === '' ? null : toNumber(form.cadRate)

  return {
    ...report,
    pricingLines: lines,
    rawMaterialCost: Number(rawMaterialCost.toFixed(4)),
    capsuleCost: Number(packaging.capsuleCost.toFixed(4)),
    bottleCost: Number(packaging.bottleCost.toFixed(4)),
    lidCost: Number(packaging.lidCost.toFixed(4)),
    labelCost: Number(packaging.labelCost.toFixed(4)),
    packagingCost: Number(packaging.packagingCost.toFixed(4)),
    grandTotal: Number(grandTotal.toFixed(4)),
    costPerContainer: report.containerCount ? Number((grandTotal / report.containerCount).toFixed(4)) : 0,
    cadRate,
    grandTotalCAD: cadRate === null ? null : Number((grandTotal * cadRate).toFixed(4))
  }
}

export default function ProductPriceCalculatorPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [form, setForm] = useState<PricingForm>(defaults)
  const [priceOverrides, setPriceOverrides] = useState<PriceOverrides>({})
  const [serverReport, setServerReport] = useState<PricingReport | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cadLoading, setCadLoading] = useState(false)
  const [cadStatus, setCadStatus] = useState('')
  const pricingRequestRef = useRef(0)

  useEffect(() => {
    fetchProducts().then(data => setProducts(data as Product[]))
  }, [])

  useEffect(() => {
    loadCadRate()
  }, [])

  const selectedProduct = useMemo(
    () => products.find(product => product.id === selectedProductId) || null,
    [products, selectedProductId]
  )
  const selectedUnitLabel = productUnitLabel(selectedProduct)
  const unitsPerBottleLabel = selectedUnitLabel
    ? `Units (${selectedUnitLabel}) per Bottle`
    : 'Units per Bottle'
  const totalUnitsLabel = selectedUnitLabel
    ? `Total units (${selectedUnitLabel})`
    : 'Total units'

  const totalUnits = toNumber(form.unitsPerContainer) * toNumber(form.containerCount)

  const report = useMemo(
    () => serverReport ? applyPriceOverrides(serverReport, form, priceOverrides) : null,
    [form, priceOverrides, serverReport]
  )

  useEffect(() => {
    if (!selectedProductId) {
      setServerReport(null)
      setError('')
      return
    }
    if (toNumber(form.unitsPerContainer) <= 0 || toNumber(form.containerCount) <= 0) {
      setServerReport(null)
      setError('')
      return
    }

    const timer = window.setTimeout(() => {
      refreshPricingReport()
    }, 250)

    return () => window.clearTimeout(timer)
  }, [selectedProductId, form.unitsPerContainer, form.containerCount])

  function selectProduct(productId: string) {
    setSelectedProductId(productId)
    setServerReport(null)
    setPriceOverrides({})
  }

  function updateForm(field: keyof PricingForm, value: string) {
    setForm(current => ({ ...current, [field]: value }))
    if (field === 'unitsPerContainer' || field === 'containerCount') {
      setServerReport(null)
      setPriceOverrides({})
    }
  }

  async function loadCadRate(force = false) {
    setCadLoading(true)
    setCadStatus(force ? 'Refreshing CAD rate...' : 'Loading CAD rate...')
    try {
      const response = await api.get<{ data: CurrencyRateReport }>('/reports/currency-rate/')
      const nextRate = rateText(response.data.rate)
      setForm(current => {
        if (!force && current.cadRate !== '') return current
        return { ...current, cadRate: nextRate }
      })
      const source = response.data.source ? ` from ${response.data.source}` : ''
      const date = response.data.date ? ` (${response.data.date})` : ''
      setCadStatus(`CAD rate loaded${source}${date}.`)
    } catch (caught) {
      setCadStatus(
        caught instanceof Error
          ? `${caught.message} Enter CAD rate manually.`
          : 'Could not load CAD rate. Enter CAD rate manually.'
      )
    } finally {
      setCadLoading(false)
    }
  }

  async function refreshPricingReport() {
    if (!selectedProductId) {
      return
    }
    if (toNumber(form.unitsPerContainer) <= 0) {
      return
    }
    if (toNumber(form.containerCount) <= 0) {
      return
    }

    const requestId = pricingRequestRef.current + 1
    pricingRequestRef.current = requestId
    setLoading(true)
    setError('')
    try {
      const response = await api.post<{ data: PricingReport }>(
        `/reports/product-pricing/${selectedProductId}/`,
        {
          unitsPerContainer: toNumber(form.unitsPerContainer),
          containerCount: toNumber(form.containerCount),
          capsPricePer75000: toNumber(form.capsPricePer75000),
          bottleUnitCost: toNumber(form.bottleUnitCost),
          lidUnitCost: toNumber(form.lidUnitCost),
          labelUnitCost: toNumber(form.labelUnitCost),
          cadRate: form.cadRate === '' ? null : toNumber(form.cadRate),
          rawMaterialPrices: Object.fromEntries(
            Object.entries(priceOverrides)
              .filter(([, value]) => value !== '')
              .map(([key, value]) => [key, toNumber(value)])
          )
        }
      )
      if (pricingRequestRef.current !== requestId) return
      setServerReport(response.data)
      setPriceOverrides(
        Object.fromEntries(
          response.data.pricingLines.map(line => [lineKey(line), String(line.pricePerKg)])
        )
      )
    } catch (caught) {
      if (pricingRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'Failed to calculate pricing.')
    } finally {
      if (pricingRequestRef.current === requestId) {
        setLoading(false)
      }
    }
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-3xl font-bold">Product Price Calculator</h1>
        <p className="mt-1 text-slate-600">
          Product-based raw material and packaging pricing.
        </p>
      </header>

      {error && (
        <div className="border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Pricing Inputs">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Product</Label>
              <Select value={selectedProductId} onChange={event => selectProduct(event.target.value)}>
                <option value="">Select product</option>
                {products.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.name}{product.npn ? ` - NPN ${product.npn}` : ''}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{unitsPerBottleLabel}</Label>
              <Select
                value={form.unitsPerContainer}
                onChange={event => updateForm('unitsPerContainer', event.target.value)}
              >
                {unitsPerBottleOptions.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
            <PricingInput label="Number of Bottles" field="containerCount" form={form} updateForm={updateForm} />
            <div>
              <Label>{totalUnitsLabel}</Label>
              <Input value={String(totalUnits || 0)} disabled />
            </div>
            <div>
              <div className="flex items-center justify-between gap-3">
                <Label>CAD rate</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={cadLoading}
                  onClick={() => loadCadRate(true)}
                >
                  Refresh CAD
                </Button>
              </div>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.cadRate}
                onChange={event => updateForm('cadRate', event.target.value)}
              />
              {cadStatus && (
                <p className="mt-1 text-xs text-slate-500">{cadStatus}</p>
              )}
            </div>
          </div>
        </Card>

        <Card title="Packaging Costs">
          <div className="grid gap-4 md:grid-cols-2">
            <PricingInput label="Capsule price per 75,000" field="capsPricePer75000" form={form} updateForm={updateForm} />
            <PricingInput label="Bottle unit cost" field="bottleUnitCost" form={form} updateForm={updateForm} />
            <PricingInput label="Lid unit cost" field="lidUnitCost" form={form} updateForm={updateForm} />
            <PricingInput label="Label unit cost" field="labelUnitCost" form={form} updateForm={updateForm} />
          </div>
          {loading && (
            <p className="mt-4 text-sm font-semibold text-[#1D838D]">Updating pricing...</p>
          )}
        </Card>
      </div>

      <Card title="Raw Materials">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">SR</TableHead>
              <TableHead>Raw Material</TableHead>
              <TableHead className="w-40">Label Claim</TableHead>
              <TableHead className="w-36">Required KG</TableHead>
              <TableHead className="w-40">Price per KG</TableHead>
              <TableHead className="w-36">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!report || report.pricingLines.length === 0 ? (
              <TableEmpty
                colSpan={6}
                message={loading ? 'Updating pricing...' : 'Select a product and enter number of bottles.'}
              />
            ) : report.pricingLines.map(line => (
              <TableRow key={`${lineKey(line)}-${line.sr}`}>
                <TableCell>{line.sr}</TableCell>
                <TableCell className="font-medium">
                  {line.rawMaterialName || '-'}
                  {line.rawMaterialCode && (
                    <span className="mt-1 block font-mono text-xs text-zinc-500">{line.rawMaterialCode}</span>
                  )}
                </TableCell>
                <TableCell>{line.labelClaim || '-'}</TableCell>
                <TableCell>{numberText(line.requiredKg ?? line.computedWeightKg, 6)}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={priceOverrides[lineKey(line)] ?? String(line.pricePerKg)}
                    onChange={event => setPriceOverrides(current => ({
                      ...current,
                      [lineKey(line)]: event.target.value
                    }))}
                  />
                </TableCell>
                <TableCell>{money(line.cost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card title="Cost Summary">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Summary label="Raw Materials" value={report?.rawMaterialCost ?? null} />
          <Summary label="Packaging" value={report?.packagingCost ?? null} />
          <Summary label="Per Container" value={report?.costPerContainer ?? null} />
          <Summary label="Grand Total USD" value={report?.grandTotal ?? null} strong />
          <Summary label="Grand Total CAD" value={report?.grandTotalCAD ?? null} currency="CAD" strong />
        </div>
      </Card>
    </div>
  )
}

function PricingInput({
  label,
  field,
  form,
  updateForm
}: {
  label: string
  field: keyof PricingForm
  form: PricingForm
  updateForm: (field: keyof PricingForm, value: string) => void
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        min="0"
        step="any"
        value={form[field]}
        onChange={event => updateForm(field, event.target.value)}
      />
    </div>
  )
}

function Summary({
  label,
  value,
  currency = 'USD',
  strong = false
}: {
  label: string
  value: number | null
  currency?: string
  strong?: boolean
}) {
  return (
    <div className="border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={strong ? 'text-lg font-bold text-[#1D838D]' : 'font-semibold'}>
        {money(value, currency)}
      </p>
    </div>
  )
}
