// ============================================================================
// PO Document Editor
// Editable purchase-order document with inline pencil-icon fields,
// type-driven description dropdowns, auto-calculated totals, and brand color.
// ============================================================================

'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type {
  Brand,
  CreatePODocumentInput,
  LabelInventory,
  PODocument,
  PODocumentItem,
  PODocumentItemType,
  Product,
  RawMaterial,
  Vendor,
} from '@/types'

// ── Pencil icon ──────────────────────────────────────────────────────────────

function PencilIcon({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-3.5 w-3.5 ${className}`}
      style={style}
    >
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
    </svg>
  )
}

// ── Inline editable field ─────────────────────────────────────────────────────

interface InlineFieldProps {
  value: string
  placeholder?: string
  multiline?: boolean
  className?: string
  accentColor: string
  onSave: (v: string) => void
}

function InlineField({ value, placeholder = '—', multiline = false, className = '', accentColor, onSave }: InlineFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => { setDraft(value) }, [value])

  function open() { setDraft(value); setEditing(true) }
  function commit() { onSave(draft); setEditing(false) }
  function cancel() { setEditing(false) }
  function setInputNode(node: HTMLInputElement | HTMLTextAreaElement | null) {
    inputRef.current = node
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (editing) {
    const inputClassName = `w-full rounded border px-2 py-0.5 text-sm outline-none ring-1 ${className}`
    const inputStyle = { borderColor: accentColor }
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(e.target.value)
    }
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !multiline) commit()
      if (e.key === 'Escape') cancel()
    }

    return multiline
      ? (
        <textarea
          ref={setInputNode}
          value={draft}
          onChange={handleChange}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          rows={3}
          className={`${inputClassName} resize-none`}
          style={inputStyle}
        />
      )
      : (
        <input
          ref={setInputNode}
          value={draft}
          onChange={handleChange}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className={inputClassName}
          style={inputStyle}
        />
      )
  }

  return (
    <button
      type="button"
      onClick={open}
      className={`group flex items-start gap-1 text-left hover:opacity-80 ${className}`}
    >
      <span className={value ? '' : 'italic text-zinc-400'}>{value || placeholder}</span>
      <PencilIcon className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: accentColor }} />
    </button>
  )
}

// ── Inline date field ─────────────────────────────────────────────────────────

interface InlineDateProps {
  value: string
  accentColor: string
  onSave: (v: string) => void
}

function InlineDate({ value, accentColor, onSave }: InlineDateProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])

  function open() { setDraft(value); setEditing(true) }
  function commit() { onSave(draft); setEditing(false) }

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const displayDate = value ? new Date(value + 'T00:00:00').toLocaleDateString('en-CA') : '—'

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="rounded border px-2 py-0.5 text-sm outline-none ring-1"
        style={{ borderColor: accentColor }}
      />
    )
  }

  return (
    <button type="button" onClick={open} className="group flex items-center gap-1 hover:opacity-80">
      <span>{displayDate}</span>
      <PencilIcon className="opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: accentColor }} />
    </button>
  )
}

// ── Line item row ─────────────────────────────────────────────────────────────

interface LineItemRowProps {
  item: PODocumentItem
  sr: number
  accentColor: string
  rawMaterials: RawMaterial[]
  products: Product[]
  labels: LabelInventory[]
  onChange: (updated: PODocumentItem) => void
  onDelete: () => void
}

const ORDER_TYPE_LABELS: Record<PODocumentItemType, string> = {
  raw_material: 'Raw Material',
  label: 'Label',
  product: 'Product',
  bottles_lids: 'Bottles / Lids',
  custom: 'Custom',
}

function LineItemRow({ item, sr, accentColor, rawMaterials, products, labels, onChange, onDelete }: LineItemRowProps) {
  function set(patch: Partial<PODocumentItem>) {
    const updated = { ...item, ...patch }
    // auto-calc total
    if (patch.quantity !== undefined || patch.unitPrice !== undefined) {
      const q = patch.quantity !== undefined ? patch.quantity : item.quantity
      const u = patch.unitPrice !== undefined ? patch.unitPrice : item.unitPrice
      updated.totalPrice = (q != null && u != null) ? q * u : null
    }
    onChange(updated)
  }

  function handleTypeChange(orderType: PODocumentItemType) {
    set({ orderType, itemId: null, itemName: '' })
  }

  function handleItemSelect(id: string) {
    let name = ''
    if (item.orderType === 'raw_material') {
      const rm = rawMaterials.find(r => r.id === id)
      name = rm ? `${rm.code} - ${rm.name}` : ''
    } else if (item.orderType === 'product') {
      name = products.find(p => p.id === id)?.name ?? ''
    } else if (item.orderType === 'label') {
      const l = labels.find(x => x.id === id)
      name = l ? `${l.brandName} - ${l.productName} - ${l.labelName}` : ''
    }
    set({ itemId: id, itemName: name })
  }

  const total = item.totalPrice ?? (item.quantity != null && item.unitPrice != null ? item.quantity * item.unitPrice : null)

  return (
    <tr className="border-b border-zinc-100 print:border-zinc-200">
      {/* Sr# */}
      <td className="py-2 pl-3 pr-2 text-center text-sm text-zinc-500 w-10 print:py-1">{sr}</td>

      {/* Description */}
      <td className="py-2 px-2 print:py-1">
        <div className="flex flex-col gap-1">
          {/* type selector — hidden on print */}
          <select
            value={item.orderType}
            onChange={e => handleTypeChange(e.target.value as PODocumentItemType)}
            className="text-xs text-zinc-500 border border-zinc-200 rounded px-1 py-0.5 print:hidden"
          >
            {Object.entries(ORDER_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          {/* item selector — hidden on print */}
          {item.orderType === 'raw_material' && (
            <select
              value={item.itemId ?? ''}
              onChange={e => handleItemSelect(e.target.value)}
              className="text-sm border border-zinc-200 rounded px-1 py-0.5 print:hidden"
              style={{ borderColor: item.itemId ? accentColor : undefined }}
            >
              <option value="">Select raw material…</option>
              {rawMaterials.map(r => <option key={r.id} value={r.id}>{r.code} – {r.name}</option>)}
            </select>
          )}
          {item.orderType === 'product' && (
            <select
              value={item.itemId ?? ''}
              onChange={e => handleItemSelect(e.target.value)}
              className="text-sm border border-zinc-200 rounded px-1 py-0.5 print:hidden"
            >
              <option value="">Select product…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {item.orderType === 'label' && (
            <select
              value={item.itemId ?? ''}
              onChange={e => handleItemSelect(e.target.value)}
              className="text-sm border border-zinc-200 rounded px-1 py-0.5 print:hidden"
            >
              <option value="">Select label…</option>
              {labels.map(l => <option key={l.id} value={l.id}>{l.brandName} – {l.productName} – {l.labelName}</option>)}
            </select>
          )}

          {/* editable name (always visible, shown on print) */}
          {(item.orderType === 'custom' || item.orderType === 'bottles_lids') ? (
            <input
              value={item.itemName}
              onChange={e => set({ itemName: e.target.value })}
              placeholder="Enter description…"
              className="text-sm border-b border-zinc-200 focus:outline-none focus:border-current px-0.5"
              style={{ borderColor: accentColor }}
            />
          ) : (
            <span className="text-sm font-medium">{item.itemName || <span className="italic text-zinc-400">—select above—</span>}</span>
          )}
        </div>
      </td>

      {/* Qty */}
      <td className="py-2 px-2 text-right w-32 print:py-1">
        <input
          type="number"
          min="0"
          value={item.quantity === 0 ? '' : item.quantity}
          onChange={e => set({ quantity: parseFloat(e.target.value) || 0 })}
          className="w-full text-right text-sm border-b border-zinc-200 focus:outline-none focus:border-current px-1 py-0.5"
          style={{ borderColor: accentColor }}
          placeholder="0"
        />
      </td>

      {/* Unit price */}
      <td className="py-2 px-2 text-right w-36 print:py-1">
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.unitPrice ?? ''}
          onChange={e => set({ unitPrice: e.target.value ? parseFloat(e.target.value) : null })}
          className="w-full text-right text-sm border-b border-zinc-200 focus:outline-none focus:border-current px-1 py-0.5"
          style={{ borderColor: accentColor }}
          placeholder="0.00"
        />
      </td>

      {/* Total price */}
      <td className="py-2 px-2 text-right w-36 font-medium text-sm print:py-1">
        {total != null ? total.toFixed(2) : '—'}
      </td>

      {/* Delete — hidden on print */}
      <td className="py-2 pl-1 pr-3 w-8 print:hidden">
        <button
          type="button"
          onClick={onDelete}
          className="text-zinc-300 hover:text-rose-500 transition-colors"
          title="Remove row"
        >
          <TrashIcon />
        </button>
      </td>
    </tr>
  )
}

// ── Main editor ───────────────────────────────────────────────────────────────

export interface PODocumentEditorProps {
  doc: PODocument | null
  vendors: Vendor[]
  brands: Brand[]
  rawMaterials: RawMaterial[]
  products: Product[]
  labels: LabelInventory[]
  saving: boolean
  readOnly?: boolean
  onSave: (input: CreatePODocumentInput) => Promise<void>
  onDelete?: () => void
  onBack: () => void
  printRef: React.RefObject<HTMLDivElement>
}

export interface PODocumentPrintData {
  poNumber: string
  poDate: string
  accentColor: string
  logoUrl: string
  vendorName: string
  vendorAddress: string
  shipToName: string
  shipToAddress: string
  shipToPhone: string
  termsConditions: string
  subtotal: number
  gstPercent: number
  othersValue: number
  shippingValue: number
  grandTotal: number
  items: Array<{
    sr: number
    itemName: string
    quantity: number
    unitPrice: number | null
    totalPrice: number
  }>
}

export interface PODocumentEditorHandle {
  getPrintData: () => PODocumentPrintData
}

function emptyItem(sr: number): PODocumentItem {
  return {
    id: `new-${Date.now()}-${sr}`,
    poDocumentId: '',
    sr,
    orderType: 'raw_material',
    itemId: null,
    itemName: '',
    quantity: 0,
    unitPrice: null,
    totalPrice: null,
  }
}

export const PODocumentEditor = forwardRef<PODocumentEditorHandle, PODocumentEditorProps>(function PODocumentEditor({
  doc,
  vendors,
  brands,
  rawMaterials,
  products,
  labels,
  saving,
  readOnly = false,
  onSave,
  onDelete,
  onBack,
  printRef,
}: PODocumentEditorProps, ref) {
  function formatBrandAddress(brand: Brand | null | undefined, separator: ', ' | '\n' = ', ') {
    if (!brand) return ''
    return [
      brand.addressLine1,
      brand.addressLine2,
      brand.city && brand.province ? `${brand.city}, ${brand.province}` : (brand.city || brand.province),
      brand.country,
    ].filter(Boolean).join(separator)
  }

  const initialBrand = doc?.brandId ? brands.find(b => b.id === doc.brandId) : null

  // ── State ──────────────────────────────────────────────────────────────────
  const [vendorId, setVendorId] = useState(doc?.vendorId ?? '')
  const [vendorAddress, setVendorAddress] = useState(doc?.vendorAddress ?? '')
  const [shipToName, setShipToName] = useState(doc?.shipToName ?? initialBrand?.name ?? '')
  const [shipToAddress, setShipToAddress] = useState(
    doc?.shipToAddress ?? formatBrandAddress(initialBrand)
  )
  const [shipToPhone, setShipToPhone] = useState(doc?.shipToPhone ?? initialBrand?.phone ?? '')
  const [brandId, setBrandId] = useState(doc?.brandId ?? '')
  const [poDate, setPoDate] = useState(doc?.poDate ?? new Date().toISOString().slice(0, 10))
  const [termsConditions, setTermsConditions] = useState(doc?.termsConditions ?? '')
  const [items, setItems] = useState<PODocumentItem[]>(
    doc?.items.length ? doc.items : [emptyItem(1)]
  )
  const [gstPercent, setGstPercent] = useState(doc?.gstPercent ?? 0)
  const [othersValue, setOthersValue] = useState(doc?.othersValue ?? 0)
  const [shippingValue, setShippingValue] = useState(doc?.shippingValue ?? 0)

  // Derived vendor / brand info
  const selectedVendor = vendors.find(v => v.id === vendorId)
  const selectedBrand = brands.find(b => b.id === brandId)
  const accentColor = selectedBrand?.color || '#16a34a'
  const documentLogoUrl = selectedBrand?.logoUrl || ''

  function formatVendorAddress(vendor: Vendor) {
    return [vendor.address, vendor.city, vendor.country, vendor.phone].filter(Boolean).join(', ')
  }

  function handleVendorChange(nextVendorId: string) {
    setVendorId(nextVendorId)
    if (nextVendorId && nextVendorId !== vendorId) {
      const vendor = vendors.find(v => v.id === nextVendorId)
      if (vendor) setVendorAddress(formatVendorAddress(vendor))
    }
  }

  function handleBrandChange(nextBrandId: string) {
    setBrandId(nextBrandId)
    const nextBrand = brands.find(b => b.id === nextBrandId)
    setShipToName(nextBrand?.name ?? '')
    setShipToAddress(formatBrandAddress(nextBrand))
    setShipToPhone(nextBrand?.phone ?? '')
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  function addRow() {
    setItems(prev => [...prev, emptyItem(prev.length + 1)])
  }

  function updateItem(idx: number, updated: PODocumentItem) {
    setItems(prev => prev.map((item, i) => i === idx ? updated : item))
  }

  function deleteItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, sr: i + 1 })))
  }

  const subtotal = items.reduce((sum, item) => {
    const t = item.totalPrice ?? (item.quantity != null && item.unitPrice != null ? item.quantity * item.unitPrice : 0)
    return sum + (t || 0)
  }, 0)
  // GST is a percentage of the subtotal; Others and Shipping are flat
  // dollar amounts added directly (e.g. subtotal 40 + shipping 90 = 130).
  const grandTotal = subtotal + (subtotal * (gstPercent || 0)) / 100 + (othersValue || 0) + (shippingValue || 0)

  useImperativeHandle(ref, () => ({
    getPrintData: () => ({
      poNumber: doc?.poNumber ?? 'Draft PO',
      poDate,
      accentColor,
      logoUrl: documentLogoUrl,
      vendorName: selectedVendor?.name ?? '',
      vendorAddress,
      shipToName,
      shipToAddress,
      shipToPhone,
      termsConditions,
      subtotal,
      gstPercent,
      othersValue,
      shippingValue,
      grandTotal,
      items: items.map((item, idx) => {
        const totalPrice = item.totalPrice ?? (item.quantity != null && item.unitPrice != null ? item.quantity * item.unitPrice : 0)
        return {
          sr: idx + 1,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice ?? null,
          totalPrice: totalPrice || 0,
        }
      }),
    }),
  }), [
    accentColor,
    doc?.poNumber,
    documentLogoUrl,
    gstPercent,
    grandTotal,
    items,
    othersValue,
    poDate,
    selectedVendor?.name,
    shippingValue,
    shipToAddress,
    shipToName,
    shipToPhone,
    subtotal,
    termsConditions,
    vendorAddress,
  ])

  const handleSave = useCallback(async () => {
    await onSave({
      id: doc?.id,
      vendorId: vendorId || null,
      vendorName: selectedVendor?.name ?? '',
      vendorAddress: vendorAddress || null,
      shipToName,
      shipToAddress: shipToAddress || null,
      shipToPhone: shipToPhone || null,
      brandId: brandId || null,
      poDate,
      termsConditions: termsConditions || null,
      status: doc?.status ?? 'draft',
      gstPercent,
      othersValue,
      shippingValue,
      items: items.map((item, idx) => ({
        id: item.id?.startsWith('new-') ? undefined : item.id,
        sr: idx + 1,
        orderType: item.orderType,
        itemId: item.itemId ?? null,
        itemName: item.itemName,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? null,
        totalPrice: item.totalPrice ?? null,
      })),
    })
  }, [doc, vendorId, selectedVendor, vendorAddress, shipToName, shipToAddress, shipToPhone, brandId, poDate, termsConditions, gstPercent, othersValue, shippingValue, items, onSave])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar — hidden on print */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to list
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Brand selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-600">PO brand: *</label>
            <select
              value={brandId}
              onChange={e => handleBrandChange(e.target.value)}
              disabled={readOnly}
              className="rounded border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100 disabled:text-zinc-500"
            >
              <option value="">— none —</option>
              {brands.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {selectedBrand && (
              <div className="h-5 w-5 rounded-full border border-zinc-200" style={{ backgroundColor: accentColor }} />
            )}
          </div>

          {readOnly ? (
            <span className="rounded bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-500">
              {doc?.status === 'approved' ? 'Approved — read-only' : 'Read-only — historical version'}
            </span>
          ) : (
            <>
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-100 transition-colors"
                >
                  Delete
                </button>
              )}
              {doc && (
                <button
                  type="button"
                  className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Sent
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded px-4 py-1.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: accentColor }}
              >
                {saving ? 'Saving…' : doc ? 'Update PO' : 'Save PO'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── PO Document ─────────────────────────────────────────────────────── */}
      <div
        ref={printRef}
        id="po-document"
        className={`bg-white shadow-sm border border-zinc-200 rounded-lg mx-auto print:shadow-none print:border-none print:rounded-none ${
          readOnly ? 'pointer-events-none' : ''
        }`}
        style={{ maxWidth: 900 }}
      >
        {/* Accent stripe */}
        <div className="h-2 rounded-t-lg print:rounded-none" style={{ backgroundColor: accentColor }} />

        <div className="p-8 print:p-6">
          {/* Header: logo area + address */}
          <div className="mb-6 flex items-start gap-6">
            <div className="flex-1">
              {/* Logo placeholder — inline editable logo URL on hover */}
              <div className="mb-1 flex items-center gap-2">
                {documentLogoUrl ? (
                  <img src={documentLogoUrl} alt="logo" className="h-auto w-auto max-h-24 max-w-[260px] object-contain" />
                ) : (
                  <div
                    className="flex h-12 w-32 items-center justify-center rounded border-2 border-dashed text-xs text-zinc-400 print:border-zinc-200"
                    style={{ borderColor: accentColor + '66' }}
                  >
                    LOGO
                  </div>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              <h1 className="text-2xl font-bold" style={{ color: accentColor }}>Purchase Order</h1>
              <div className="mb-3 mt-1 text-sm text-zinc-700">
                <span className="mr-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Date</span>
                <InlineDate value={poDate} accentColor={accentColor} onSave={setPoDate} />
              </div>
              <div className="text-xs text-zinc-500 mb-0.5">
                <span className="font-medium">P.O. number</span>
              </div>
              <div className="text-sm font-mono font-semibold">
                {doc?.poNumber ?? <span className="italic text-zinc-400 font-normal">auto-generated on save</span>}
              </div>
            </div>
          </div>

          {/* Vendor selector — hidden on print, shown via vendorName */}
          <div className="mb-4 print:hidden">
            <label className="block text-xs font-medium text-zinc-500 mb-1">Vendor (select to auto-fill)</label>
            <select
              value={vendorId}
              onChange={e => handleVendorChange(e.target.value)}
              className="w-full max-w-xs rounded border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value="">— select vendor —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.vendorCode ?? v.shortCode ?? '—'})</option>)}
            </select>
          </div>

          {/* Vendor + Ship To two-column section */}
          <div className="mb-6 grid grid-cols-2 gap-6 border-t border-b border-zinc-100 py-4 print:border-zinc-200">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Vendor</p>
              <div className="text-sm font-medium mb-1">
                {selectedVendor?.name ?? (vendorId ? '—' : <span className="italic text-zinc-400">—select vendor above—</span>)}
              </div>
              <InlineField
                value={vendorAddress}
                placeholder="Vendor address…"
                multiline
                accentColor={accentColor}
                className="text-xs text-zinc-600 leading-relaxed"
                onSave={setVendorAddress}
              />
              {selectedVendor?.phone && <p className="mt-0.5 text-xs text-zinc-500">{selectedVendor.phone}</p>}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Ship to</p>
              <div className="text-sm font-medium mb-1">
                <InlineField value={shipToName} placeholder="Company name…" accentColor={accentColor} onSave={setShipToName} />
              </div>
              <InlineField
                value={shipToAddress}
                placeholder="Address…"
                multiline
                accentColor={accentColor}
                className="text-xs text-zinc-600 leading-relaxed"
                onSave={setShipToAddress}
              />
              {shipToPhone ? (
                <p className="mt-0.5 text-xs text-zinc-500">
                  <InlineField value={shipToPhone} placeholder="Phone…" accentColor={accentColor} onSave={setShipToPhone} />
                </p>
              ) : (
                <p className="mt-0.5 print:hidden">
                  <InlineField value="" placeholder="Phone…" accentColor={accentColor} onSave={setShipToPhone} />
                </p>
              )}
            </div>
          </div>

          {/* Line items table */}
          <table className="w-full table-fixed border-collapse text-sm mb-4">
            <thead>
              <tr style={{ backgroundColor: accentColor + '18' }}>
                <th className="py-2 pl-3 pr-2 text-left text-xs font-semibold w-10" style={{ color: accentColor }}>Sr#</th>
                <th className="py-2 px-2 text-left text-xs font-semibold" style={{ color: accentColor }}>Description</th>
                <th className="py-2 px-2 text-right text-xs font-semibold w-32" style={{ color: accentColor }}>Qty</th>
                <th className="py-2 px-2 text-right text-xs font-semibold w-36" style={{ color: accentColor }}>Unit price</th>
                <th className="py-2 px-2 text-right text-xs font-semibold w-36" style={{ color: accentColor }}>Total price</th>
                <th className="py-2 pl-1 pr-3 w-8 print:hidden" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <LineItemRow
                  key={item.id}
                  item={item}
                  sr={idx + 1}
                  accentColor={accentColor}
                  rawMaterials={rawMaterials}
                  products={products}
                  labels={labels}
                  onChange={updated => updateItem(idx, updated)}
                  onDelete={() => deleteItem(idx)}
                />
              ))}
            </tbody>
          </table>

          {/* Add row button — hidden on print */}
          <button
            type="button"
            onClick={addRow}
            className="mb-6 flex items-center gap-1.5 text-sm transition-colors print:hidden hover:opacity-80"
            style={{ color: accentColor }}
          >
            <PlusIcon />
            Add line item
          </button>

          {/* Footer: Terms + Subtotal */}
          <div className="flex items-start gap-6">
            {/* Terms and conditions */}
            <div className="flex-1">
              <p className="mb-1 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Terms and conditions</p>
              <div className="rounded border border-zinc-200 p-3 min-h-[80px] print:border-zinc-300">
                {true /* always show inline editor */ && (
                  <textarea
                    value={termsConditions}
                    onChange={e => setTermsConditions(e.target.value)}
                    placeholder="Optional — e.g. Please ship everything other than Goldenseal…"
                    rows={3}
                    className="w-full resize-none text-xs text-zinc-600 outline-none placeholder:text-zinc-300"
                  />
                )}
              </div>
            </div>

            {/* Subtotal + GST / Others / Shipping + Grand Total */}
            <div className="shrink-0 text-right min-w-[220px]">
              <div className="flex items-center justify-between gap-8 border-t border-zinc-200 pt-3 print:border-zinc-300">
                <span className="text-sm text-zinc-500">Subtotal</span>
                <span className="text-sm font-medium">${subtotal.toFixed(2)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-8">
                <label className="text-sm text-zinc-500">GST %</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={gstPercent === 0 ? '' : gstPercent}
                  onChange={e => setGstPercent(parseFloat(e.target.value) || 0)}
                  className="w-20 text-right text-sm border-b border-zinc-200 focus:outline-none focus:border-current px-0.5"
                  style={{ borderColor: accentColor }}
                  placeholder="0"
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-8">
                <label className="text-sm text-zinc-500">Others ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={othersValue === 0 ? '' : othersValue}
                  onChange={e => setOthersValue(parseFloat(e.target.value) || 0)}
                  className="w-20 text-right text-sm border-b border-zinc-200 focus:outline-none focus:border-current px-0.5"
                  style={{ borderColor: accentColor }}
                  placeholder="0"
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-8">
                <label className="text-sm text-zinc-500">Shipping ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shippingValue === 0 ? '' : shippingValue}
                  onChange={e => setShippingValue(parseFloat(e.target.value) || 0)}
                  className="w-20 text-right text-sm border-b border-zinc-200 focus:outline-none focus:border-current px-0.5"
                  style={{ borderColor: accentColor }}
                  placeholder="0"
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-8 border-t border-zinc-200 pt-3 print:border-zinc-300">
                <span className="text-sm font-semibold" style={{ color: accentColor }}>Grand Total</span>
                <span className="text-xl font-bold" style={{ color: accentColor }}>${grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom accent stripe */}
        <div className="h-1 rounded-b-lg print:rounded-none" style={{ backgroundColor: accentColor }} />
      </div>
    </div>
  )
})
