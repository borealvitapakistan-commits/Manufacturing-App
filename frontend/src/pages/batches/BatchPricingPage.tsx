import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

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
import { fetchBatches } from '@/lib/supabase/data'

type Batch = {
  id: string
  batchCode: string
  productName: string
  containerCount?: number
  unitsPerContainer?: number | null
}
type PricingLine = {
  sr: number
  rawMaterialCode?: string
  rawMaterialName?: string
  labelClaim?: string
  computedWeightKg: number
  pricePerKg: number
  cost: number
}

type PricingReport = {
  totalCapsulesNeeded: number
  pricingLines: PricingLine[]
  rawMaterialCost: number
  capsuleCost: number
  bottleCost: number
  lidCost: number
  labelCost: number
  packagingCost: number
  labourCost: number
  grandTotal: number
  costPerBottle: number
  grandTotalCAD: number | null
}

const defaults = {
  quantity: '0',
  capsPerBottle: '60',
  capsPricePer75000: '1000',
  bottleUnitCost: '0.5',
  lidUnitCost: '0.1',
  labelUnitCost: '0.15',
  labourCost: '0',
  cadRate: ''
}

export default function BatchPricingPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [selected, setSelected] = useState('')
  const [form, setForm] = useState(defaults)
  const [report, setReport] = useState<PricingReport | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchBatches({ limit: 500 }).then(data => setBatches(data as Batch[]))
  }, [])

  function selectBatch(batchId: string) {
    setSelected(batchId)
    setReport(null)
    const batch = batches.find(item => item.id === batchId)
    if (batch) {
      setForm(current => ({
        ...current,
        quantity: String(batch.containerCount || 0),
        capsPerBottle: String(batch.unitsPerContainer || 0)
      }))
    }
  }

  async function calculate() {
    if (!selected) return
    setLoading(true)
    setError('')
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, value === '' ? null : Number(value)])
      )
      const response = await api.post<{ data: PricingReport }>(
        `/reports/batch-pricing/${selected}/`,
        payload
      )
      setReport(response.data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to calculate pricing.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-3xl font-bold">Batch Pricing</h1>
        <p className="mt-1 text-slate-600">
          Original RM, capsule, packaging, labour and CAD formulas calculated by Django.
        </p>
      </header>

      <Card title="Batch Inputs">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Batch</Label>
            <Select value={selected} onChange={event => selectBatch(event.target.value)}>
              <option value="">Choose batch</option>
              {batches.map(batch => (
                <option key={batch.id} value={batch.id}>
                  {batch.batchCode} — {batch.productName}
                </option>
              ))}
            </Select>
          </div>
          <PricingInput label="Quantity (bottles)" field="quantity" form={form} setForm={setForm} />
          <PricingInput label="Capsules per bottle" field="capsPerBottle" form={form} setForm={setForm} />
          <PricingInput label="Capsule price per 75,000" field="capsPricePer75000" form={form} setForm={setForm} />
          <PricingInput label="Bottle unit cost" field="bottleUnitCost" form={form} setForm={setForm} />
          <PricingInput label="Lid unit cost" field="lidUnitCost" form={form} setForm={setForm} />
          <PricingInput label="Label unit cost" field="labelUnitCost" form={form} setForm={setForm} />
          <PricingInput label="Labour cost" field="labourCost" form={form} setForm={setForm} />
          <PricingInput label="CAD rate (optional)" field="cadRate" form={form} setForm={setForm} />
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4">
          <Button onClick={calculate} disabled={!selected || loading}>
            {loading ? 'Calculating...' : 'Calculate Pricing'}
          </Button>
        </div>
      </Card>

      <Card title="Table 1 — Raw Materials">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Label Claim</TableHead>
              <TableHead>Weight kg</TableHead>
              <TableHead>Price/kg</TableHead>
              <TableHead>Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!report || report.pricingLines.length === 0 ? (
              <TableEmpty colSpan={6} message="Select a batch and calculate pricing." />
            ) : report.pricingLines.map(line => (
              <TableRow key={`${line.rawMaterialCode}-${line.sr}`}>
                <TableCell>{line.rawMaterialCode || '-'}</TableCell>
                <TableCell>{line.rawMaterialName || '-'}</TableCell>
                <TableCell>{line.labelClaim || '-'}</TableCell>
                <TableCell>{line.computedWeightKg.toFixed(6)}</TableCell>
                <TableCell>{line.pricePerKg.toFixed(2)}</TableCell>
                <TableCell>{line.cost.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {report && (
        <Card title="Pricing Summary">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Summary label="Total capsules" value={report.totalCapsulesNeeded} />
            <Summary label="Raw materials" value={report.rawMaterialCost} />
            <Summary label="Capsules" value={report.capsuleCost} />
            <Summary label="Bottles" value={report.bottleCost} />
            <Summary label="Lids" value={report.lidCost} />
            <Summary label="Labels" value={report.labelCost} />
            <Summary label="Packaging total" value={report.packagingCost} />
            <Summary label="Labour" value={report.labourCost} />
            <Summary label="Grand total USD" value={report.grandTotal} />
            <Summary label="Cost per bottle" value={report.costPerBottle} />
            <Summary label="Grand total CAD" value={report.grandTotalCAD} />
          </div>
        </Card>
      )}
    </div>
  )
}

function PricingInput({
  label,
  field,
  form,
  setForm
}: {
  label: string
  field: keyof typeof defaults
  form: typeof defaults
  setForm: Dispatch<SetStateAction<typeof defaults>>
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        min="0"
        step="any"
        value={form[field]}
        onChange={event => setForm(current => ({ ...current, [field]: event.target.value }))}
      />
    </div>
  )
}

function Summary({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold">{value === null ? '—' : Number(value).toFixed(2)}</p>
    </div>
  )
}
