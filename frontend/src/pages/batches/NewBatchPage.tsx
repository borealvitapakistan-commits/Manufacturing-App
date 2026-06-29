// ============================================================================
// Add/Edit Batch Page
// ============================================================================

'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  Button,
  Input,
  NumberInput,
  Select,
  TextArea,
  Label,
  Checkbox,
  useToast
} from '@/components/ui'
import {
  initSupabase,
  fetchBrands,
  fetchProducts,
  fetchRawMaterials,
  fetchLabelInventory,
  saveBatch,
  fetchBatch,
  generateBatchCode
} from '@/lib/supabase/data'
import { isUnitBasedForm, calculateTotalUnits, parseLabelClaimToMg, mgToKg } from '@/lib/utils'
import type { Batch, Brand, Product, RawMaterial, LabelInventory, DosageForm } from '@/types'

const DOSAGE_FORMS: DosageForm[] = ['capsule', 'tablet', 'softgel', 'lozenge', 'oil', 'liquid', 'other']
const RM_NOT_ENOUGH_MESSAGE = 'RM is not enough to make this batch of products.'
type RmResolutionOption = 'alternatives' | 'split' | 'main' | 'order'

function todayInput(): string {
  return new Date().toISOString().slice(0, 10)
}

function toDateInput(value: unknown): string {
  if (!value) return ''
  const date = typeof value === 'number' ? new Date(value) : value instanceof Date ? value : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function dateInputToMs(value: string): number | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

interface RmAlternative {
  id: string
  code: string
  name: string
  available: number
}

interface RmShortageItem {
  key: string
  rawMaterialId: string | null
  rawMaterialCode: string
  rawMaterialName: string
  required: number
  available: number
  shortage: number
  category: string | null
  alternatives: RmAlternative[]
}

interface StockPlanState {
  shortages: RmShortageItem[]
  selections: Record<string, RmResolutionOption>
}

interface FormState {
  brandId: string
  productId: string
  dosageForm: DosageForm | ''
  unitsPerContainer: string
  containerCount: string
  batchStartDate: string
  startTime: string
  endTime: string
  notes: string
  manualBatchCodeEnabled: boolean
  manualBatchCode: string
  currentBatchCode: string
}

const defaultForm: FormState = {
  brandId: '',
  productId: '',
  dosageForm: '',
  unitsPerContainer: '',
  containerCount: '',
  batchStartDate: todayInput(),
  startTime: '',
  endTime: '',
  notes: '',
  manualBatchCodeEnabled: false,
  manualBatchCode: '',
  currentBatchCode: ''
}

function AddBatchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')

  const [brands, setBrands] = useState<Brand[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [labelInventory, setLabelInventory] = useState<LabelInventory[]>([])
  const [labelsReady, setLabelsReady] = useState(true)
  const [form, setForm] = useState<FormState>(defaultForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [stockPlan, setStockPlan] = useState<StockPlanState | null>(null)
  const { showToast } = useToast()

  // Derived values
  const isUnitBased = useMemo(() => isUnitBasedForm(form.dosageForm), [form.dosageForm])
  const totalUnits = useMemo(() => {
    return calculateTotalUnits(
      form.unitsPerContainer ? Number(form.unitsPerContainer) : null,
      Number(form.containerCount) || 0,
      isUnitBased
    )
  }, [form.unitsPerContainer, form.containerCount, isUnitBased])

  const activeBrands = useMemo(() => brands.filter(b => b.isActive !== false), [brands])
  const labelWarning = useMemo(() => {
    if (!labelsReady) return null
    if (!form.brandId || !form.productId) return null

    const required = Math.max(0, Number(form.containerCount) || 0)
    if (required <= 0) return null

    const available = labelInventory
      .filter(item =>
        item.brandId === form.brandId &&
        item.productId === form.productId &&
        item.isActive !== false
      )
      .reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0)

    const shortage = Math.max(0, required - available)
    if (shortage <= 0) return null

    return { required, available, shortage }
  }, [labelsReady, form.brandId, form.productId, form.containerCount, labelInventory])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (editId && brands.length > 0) {
      loadBatchForEdit(editId)
    }
  }, [editId, brands])

  async function loadData() {
    try {
      setLoading(true)
      await initSupabase()

      const [brandList, productList, rmList] = await Promise.all([
        fetchBrands(),
        fetchProducts(),
        fetchRawMaterials()
      ])

      setBrands(brandList as Brand[])
      setProducts(productList as Product[])
      setRawMaterials(rmList as RawMaterial[])

      try {
        const labelList = await fetchLabelInventory({ activeOnly: true })
        setLabelInventory(labelList as LabelInventory[])
        setLabelsReady(true)
      } catch (labelError) {
        console.warn('Label inventory unavailable:', labelError)
        setLabelInventory([])
        setLabelsReady(false)
      }
    } catch (err) {
      console.error('Failed to load data:', err)
      setError('Failed to load data. Please refresh.')
    } finally {
      setLoading(false)
    }
  }

  async function loadBatchForEdit(id: string) {
    try {
      const batch = await fetchBatch(id) as Batch | null
      if (batch) {
        setForm({
          brandId: batch.brandId || '',
          productId: batch.productId || '',
          dosageForm: batch.dosageForm || '',
          unitsPerContainer: batch.unitsPerContainer?.toString() || '',
          containerCount: batch.containerCount?.toString() || '',
          batchStartDate: toDateInput(batch.batchStartDate || batch.createdAt) || todayInput(),
          startTime: batch.startTime || '',
          endTime: batch.endTime || '',
          notes: batch.notes || '',
          manualBatchCodeEnabled: false,
          manualBatchCode: batch.batchCode || '',
          currentBatchCode: batch.batchCode || ''
        })
      }
    } catch (err) {
      console.error('Failed to load batch:', err)
      setError('Failed to load batch for editing.')
    }
  }

  function validateForm(): string | null {
    if (!form.brandId) return 'Select a brand.'
    if (!form.productId) return 'Select a product.'
    if (!form.dosageForm) return 'Select a dosage form.'
    const containers = Number(form.containerCount)
    if (!Number.isFinite(containers) || containers <= 0) return 'Enter number of containers.'
    if (isUnitBased) {
      const upc = Number(form.unitsPerContainer)
      if (!Number.isFinite(upc) || upc <= 0) return 'Enter units per container.'
      if (!totalUnits || totalUnits <= 0) return 'Total units cannot be zero.'
    }
    return null
  }

  function validateStock(): { shortages: RmShortageItem[]; usage: unknown[] } {
    const product = products.find(p => p.id === form.productId)
    if (!product || !totalUnits) return { shortages: [], usage: [] }

    const rmMap = new Map(rawMaterials.map(rm => [rm.id, rm]))
    const rmCodeMap = new Map(rawMaterials.map(rm => [(rm.code || '').trim().toLowerCase(), rm]))
    const rmNameMap = new Map(rawMaterials.map(rm => [(rm.name || '').trim().toLowerCase(), rm]))
    const usage: unknown[] = []
    const shortages: RmShortageItem[] = []

    for (const [index, rm] of (product.rm || []).entries()) {
      const rmDoc =
        (rm.rawMaterialId ? rmMap.get(rm.rawMaterialId) : null) ||
        (rm.rawMaterialCode ? rmCodeMap.get(rm.rawMaterialCode.trim().toLowerCase()) : null) ||
        (rm.rawMaterial ? rmNameMap.get(rm.rawMaterial.trim().toLowerCase()) : null) ||
        null

      const mgPerUnit = parseLabelClaimToMg(rm.labelClaim) || rm.labelClaimMgPerUnit
      if (!mgPerUnit) continue

      const requiredKg = mgToKg(totalUnits * mgPerUnit)
      const availableKg = rmDoc?.qty || 0
      const category = (rmDoc?.category || '').trim() || null
      const alternatives = category
        ? rawMaterials
          .filter(alt =>
            alt.id !== rmDoc?.id &&
            (alt.category || '').trim().toLowerCase() === category.toLowerCase()
          )
          .map(alt => ({
            id: alt.id,
            code: alt.code,
            name: alt.name,
            available: +Number(alt.qty || 0).toFixed(4)
          }))
        : []

      const item = {
        rawMaterialId: rm.rawMaterialId || rmDoc?.id || null,
        rawMaterialCode: rm.rawMaterialCode || rmDoc?.code || `RM-${index + 1}`,
        rawMaterialName: rmDoc?.name || rm.rawMaterial || 'Unknown RM',
        required: +requiredKg.toFixed(4),
        available: +availableKg.toFixed(4)
      }

      usage.push(item)

      if (requiredKg > availableKg) {
        shortages.push({
          key: `${rm.rawMaterialId || 'missing'}-${index}`,
          ...item,
          shortage: +(requiredKg - availableKg).toFixed(4),
          category,
          alternatives
        })
      }
    }

    return { shortages, usage }
  }

  function getAlternativeTotal(item: RmShortageItem): number {
    return +item.alternatives.reduce((sum, alt) => sum + Math.max(0, Number(alt.available || 0)), 0).toFixed(4)
  }

  function getDefaultSelection(item: RmShortageItem): RmResolutionOption {
    const altTotal = getAlternativeTotal(item)
    if (item.available > 0 && altTotal > 0) return 'split'
    if (altTotal > 0) return 'alternatives'
    return 'order'
  }

  function optionDisabled(item: RmShortageItem, option: RmResolutionOption): boolean {
    const altTotal = getAlternativeTotal(item)
    if (option === 'main') return item.available < item.required
    if (option === 'alternatives') return altTotal <= 0
    if (option === 'split') return item.available <= 0 || altTotal <= 0
    return false
  }

  function mergeNotes(baseNotes: string, stockPlanNotes?: string): string {
    const base = (baseNotes || '').trim()
    const plan = (stockPlanNotes || '').trim()
    if (!plan) return base
    if (!base) return `RM Plan:\n${plan}`
    return `${base}\n\nRM Plan:\n${plan}`
  }

  async function handleSave() {
    setError('')
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    const brand = brands.find(b => b.id === form.brandId)
    const product = products.find(p => p.id === form.productId)
    if (!brand || !product) {
      setError('Brand or product missing.')
      return
    }

    // Check stock
    if (isUnitBased) {
      const { shortages } = validateStock()
      if (shortages.length > 0) {
        const selections: Record<string, RmResolutionOption> = {}
        for (const item of shortages) {
          selections[item.key] = getDefaultSelection(item)
        }
        setError(RM_NOT_ENOUGH_MESSAGE)
        setStockPlan({ shortages, selections })
        return
      }
    }

    await persistBatch(brand, product)
  }

  async function persistBatch(brand: Brand, product: Product, stockPlanNotes?: string) {
    try {
      setSaving(true)

      // Generate batch code if needed
      let batchCode = form.currentBatchCode
      if (!batchCode) {
        if (form.manualBatchCodeEnabled && form.manualBatchCode.trim()) {
          batchCode = form.manualBatchCode.trim()
        } else {
          batchCode = await generateBatchCode(brand.id, brand.codePrefix)
        }
      }

      const payload = {
        id: editId || undefined,
        brandId: brand.id,
        brandName: brand.name,
        brandCodePrefix: brand.codePrefix,
        batchCode,
        productId: product.id,
        productName: product.name,
        dosageForm: form.dosageForm,
        unitsPerContainer: isUnitBased ? Number(form.unitsPerContainer) : null,
        containerCount: Number(form.containerCount) || 0,
        totalUnits: isUnitBased ? totalUnits : null,
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        batchStatus: 'Batch Created',
        currentStage: 'batch',
        batchStartDate: dateInputToMs(form.batchStartDate),
        batchStartTime: form.startTime || null,
        batchEndTime: form.endTime || null,
        batchRemarks: mergeNotes(form.notes || '', stockPlanNotes) || null,
        notes: mergeNotes(form.notes || '', stockPlanNotes),
        status: 'mixingPending',
        hasMixing: false,
        hasNJP: false,
        hasAssembly: false,
        inventoryDeducted: false
      }

      await saveBatch(payload)

      showToast({
        message: editId ? 'Batch updated and RM inventory updated' : 'Batch created and RM inventory updated',
        type: 'success'
      })

      setStockPlan(null)
      router.push('/batches')
    } catch (err) {
      console.error('Failed to save batch:', err)
      setError(err instanceof Error ? err.message : 'Failed to save batch.')
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setForm(defaultForm)
    setError('')
    setStockPlan(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{editId ? 'Edit Batch' : 'Create Batch'}</h1>
          <p className="text-zinc-600">Create a new production batch</p>
        </div>
        <Link href="/batches">
          <Button variant="ghost">Back to Batches</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/batches/mixing">
          <Card className="hover:border-[#1D838D] transition cursor-pointer">
            <div className="text-center py-3 min-h-20 flex flex-col items-center justify-center">
              <div className="text-2xl mb-1">🧪</div>
              <div className="font-medium text-sm sm:text-base leading-snug">Mixing</div>
            </div>
          </Card>
        </Link>
        <Link href="/batches/njp">
          <Card className="hover:border-[#1D838D] transition cursor-pointer">
            <div className="text-center py-3 min-h-20 flex flex-col items-center justify-center">
              <div className="text-2xl mb-1">💊</div>
              <div className="font-medium text-sm sm:text-base leading-snug">NJP</div>
            </div>
          </Card>
        </Link>
        <Link href="/batches/assembly">
          <Card className="hover:border-[#1D838D] transition cursor-pointer">
            <div className="text-center py-3 min-h-20 flex flex-col items-center justify-center">
              <div className="text-2xl mb-1">📋</div>
              <div className="font-medium text-sm sm:text-base leading-snug">Assembly</div>
            </div>
          </Card>
        </Link>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-100 text-rose-800 border border-rose-200">
          {error}
        </div>
      )}

      <Card
        title={editId ? 'Edit Batch' : 'Create Batch'}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" onClick={resetForm}>Reset Form</Button>
            <Button onClick={handleSave} loading={saving}>
              {saving ? 'Saving...' : 'Save Batch'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Brand & Product */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Brand</Label>
              <Select
                value={form.brandId}
                onChange={e => setForm({ ...form, brandId: e.target.value })}
              >
                <option value="">— Select Brand —</option>
                {activeBrands.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.codePrefix})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Product</Label>
              <Select
                value={form.productId}
                onChange={e => setForm({ ...form, productId: e.target.value })}
              >
                <option value="">— Select Product —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Dosage & Units */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Dosage Form</Label>
              <Select
                value={form.dosageForm}
                onChange={e => setForm({ ...form, dosageForm: e.target.value as DosageForm })}
              >
                <option value="">— Select —</option>
                {DOSAGE_FORMS.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Units per Container</Label>
              <NumberInput
                value={form.unitsPerContainer}
                onChange={e => setForm({ ...form, unitsPerContainer: e.target.value })}
                disabled={!isUnitBased}
                placeholder={isUnitBased ? 'e.g., 60, 90, 120' : 'Not applicable'}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Number of Containers</Label>
              <NumberInput
                value={form.containerCount}
                onChange={e => setForm({ ...form, containerCount: e.target.value })}
                placeholder="e.g., 200"
              />
            </div>
            <div>
              <Label>Total Units</Label>
              <Input
                value={isUnitBased ? (totalUnits ?? 0) : 'Not applicable'}
                disabled
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Batch Start Date</Label>
              <Input
                type="date"
                value={form.batchStartDate}
                onChange={e => setForm({ ...form, batchStartDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Time Start</Label>
              <Input
                type="time"
                value={form.startTime}
                onChange={e => setForm({ ...form, startTime: e.target.value })}
              />
            </div>
            <div>
              <Label>Time End</Label>
              <Input
                type="time"
                value={form.endTime}
                onChange={e => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
          </div>

          {!labelsReady && (
            <div className="p-3 rounded-lg bg-zinc-100 text-zinc-700 border border-zinc-200 text-sm">
              Label inventory schema is not deployed yet.
            </div>
          )}

          {labelWarning && (
            <div className="p-3 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-sm">
              Warning: Labels not enough. Order them. Required: {labelWarning.required}, Available: {labelWarning.available}, Short by: {labelWarning.shortage}.
            </div>
          )}

          {/* Batch Code */}
          <div className="space-y-2">
            <Checkbox
              id="manualCode"
              label="Enter batch code manually"
              checked={form.manualBatchCodeEnabled}
              onChange={e => setForm({ ...form, manualBatchCodeEnabled: e.target.checked })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Batch Code</Label>
                <Input
                  value={form.manualBatchCode}
                  onChange={e => setForm({ ...form, manualBatchCode: e.target.value })}
                  disabled={!form.manualBatchCodeEnabled}
                  placeholder={editId ? 'Using existing code' : 'Auto-generated'}
                />
              </div>
              <div className="text-sm text-zinc-600 flex items-end">
                {editId ? (
                  <span>Current: <span className="font-semibold">{form.currentBatchCode || '—'}</span></span>
                ) : (
                  <span>Format: brand prefix + sequence (e.g., 786001)</span>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes (optional)</Label>
            <TextArea
              rows={3}
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Any remarks about this batch"
            />
          </div>
        </div>
      </Card>

      {/* Stock Plan Modal */}
      {stockPlan && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-auto bg-black/40 px-2 py-2 sm:items-start sm:px-3 sm:py-8">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-5xl overflow-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-4rem)] sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Raw Material Not Enough</h2>
                <p className="text-sm text-zinc-600">
                  Some required RMs are low or unavailable. Add stock before creating this batch.
                </p>
              </div>
              <Button variant="ghost" className="self-start sm:self-auto" onClick={() => setStockPlan(null)}>Close</Button>
            </div>
            <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              <table className="min-w-[900px] text-xs sm:min-w-full sm:text-sm">
                <thead>
                  <tr className="text-left border-b border-zinc-200">
                    <th className="py-2 pr-2">Code</th>
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">Family / Category</th>
                    <th className="py-2 pr-2">Required (kg)</th>
                    <th className="py-2 pr-2">Available (kg)</th>
                    <th className="py-2 pr-2">Short by (kg)</th>
                    <th className="py-2 pr-2">Alternatives in Family</th>
                    <th className="py-2 pr-2">Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {stockPlan.shortages.map(item => (
                    <tr key={item.key} className="border-b border-zinc-100 align-top">
                      <td className="py-2 pr-2 font-semibold">{item.rawMaterialCode}</td>
                      <td className="py-2 pr-2">{item.rawMaterialName}</td>
                      <td className="py-2 pr-2">{item.category || '—'}</td>
                      <td className="py-2 pr-2">{item.required}</td>
                      <td className="py-2 pr-2">{item.available}</td>
                      <td className="py-2 pr-2 text-rose-700 font-semibold">{item.shortage}</td>
                      <td className="py-2 pr-2">
                        {item.alternatives.length > 0 ? (
                          <div className="space-y-1">
                            {item.alternatives.map(alt => (
                              <div key={alt.id} className="text-xs">
                                <span className="font-semibold">{alt.code}</span>
                                <span className="text-zinc-600"> ({alt.available} kg)</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-500">No family alternatives</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 min-w-[340px]">
                        <Select
                          value={stockPlan.selections[item.key] || getDefaultSelection(item)}
                          onChange={e => {
                            const selected = e.target.value as RmResolutionOption
                            setStockPlan(prev => {
                              if (!prev) return prev
                              return {
                                ...prev,
                                selections: { ...prev.selections, [item.key]: selected }
                              }
                            })
                          }}
                        >
                          <option value="alternatives" disabled={optionDisabled(item, 'alternatives')}>
                            1- you can use other RMs in list
                          </option>
                          <option value="split" disabled={optionDisabled(item, 'split')}>
                            2- you can use this one fully and the remaining is from other ones
                          </option>
                          <option value="main" disabled={optionDisabled(item, 'main')}>
                            3- you can use this (if the rm required is available)
                          </option>
                          <option value="order">
                            4- Order
                          </option>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <Link href="/raw-materials">
                <Button variant="subtle">Go to Raw Materials</Button>
              </Link>
              <Button variant="ghost" onClick={() => setStockPlan(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AddBatchPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="text-zinc-500">Loading...</div></div>}>
      <AddBatchContent />
    </Suspense>
  )
}
