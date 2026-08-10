// ============================================================================
// Purchase Orders Page — formal PO documents with PDF export
// ============================================================================

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PODocumentEditor,
  type PODocumentEditorHandle,
  type PODocumentPrintData,
} from '@/components/purchase-orders/PODocumentEditor'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableLoading,
  TableRow,
  useToast,
} from '@/components/ui'
import {
  deletePODocument,
  fetchBrands,
  fetchLabelInventory,
  fetchPODocuments,
  fetchProducts,
  fetchRawMaterials,
  fetchVendors,
  initSupabase,
  savePODocument,
} from '@/lib/supabase/data'
import { formatDate } from '@/lib/utils'
import type {
  Brand,
  CreatePODocumentInput,
  LabelInventory,
  PODocument,
  PODocumentStatus,
  Product,
  RawMaterial,
  Vendor,
} from '@/types'

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PODocumentStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  received: 'Received',
  canceled: 'Canceled',
}

function statusVariant(s: PODocumentStatus): 'default' | 'info' | 'success' | 'error' {
  if (s === 'sent') return 'info'
  if (s === 'received') return 'success'
  if (s === 'canceled') return 'error'
  return 'default'
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  const [docs, setDocs] = useState<PODocument[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [labels, setLabels] = useState<LabelInventory[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [editingDoc, setEditingDoc] = useState<PODocument | null | 'new'>(null)
  const [deleteTarget, setDeleteTarget] = useState<PODocument | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  const printRef = useRef<HTMLDivElement>(null!)
  const editorRef = useRef<PODocumentEditorHandle>(null)
  const { showToast } = useToast()

  useEffect(() => { void loadData() }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError('')
      await initSupabase()
      const [docList, vendorList, brandList, productList, materialList, labelList] = await Promise.all([
        fetchPODocuments({ limit: 200 }),
        fetchVendors(),
        fetchBrands(),
        fetchProducts(),
        fetchRawMaterials(),
        fetchLabelInventory(),
      ])
      setDocs(docList)
      setVendors(vendorList)
      setBrands(brandList as Brand[])
      setProducts(productList as Product[])
      setRawMaterials(materialList as RawMaterial[])
      setLabels(labelList as LabelInventory[])
    } catch (err) {
      console.error('Failed to load PO documents:', err)
      setError('Failed to load purchase orders.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(input: CreatePODocumentInput) {
    try {
      setSaving(true)
      const saved = await savePODocument(input)
      showToast({ message: input.id ? 'PO document updated' : `PO ${saved.poNumber} created`, type: 'success' })
      setEditingDoc(saved)
      await loadData()
    } catch (err) {
      console.error('Failed to save PO document:', err)
      showToast({ message: err instanceof Error ? err.message : 'Failed to save', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      await deletePODocument(deleteTarget.id)
      setDocs(prev => prev.filter(d => d.id !== deleteTarget.id))
      setDeleteTarget(null)
      if (editingDoc && editingDoc !== 'new' && editingDoc.id === deleteTarget.id) {
        setEditingDoc(null)
      }
      showToast({ message: 'PO document deleted', type: 'success' })
    } catch (err) {
      console.error(err)
      showToast({ message: 'Failed to delete', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  // ── PDF / Print ─────────────────────────────────────────────────────────────

  function handlePrint() {
    window.print()
  }

  function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const normalized = clean.length === 3
      ? clean.split('').map(c => c + c).join('')
      : clean
    const parsed = parseInt(normalized, 16)
    if (Number.isNaN(parsed)) return { r: 22, g: 163, b: 74 }
    return {
      r: (parsed >> 16) & 255,
      g: (parsed >> 8) & 255,
      b: parsed & 255,
    }
  }

  function sanitizeFileName(name: string) {
    return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'PO-document'
  }

  function readBlobAsDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  }

  function readImageSize(dataUrl: string) {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height })
      image.onerror = () => reject(new Error('Logo image could not be loaded'))
      image.src = dataUrl
    })
  }

  async function getPdfImage(source: string) {
    if (!source) return null

    try {
      let dataUrl = source
      if (!source.startsWith('data:image/')) {
        const response = await fetch(source, { mode: 'cors' })
        if (!response.ok) return null
        dataUrl = await readBlobAsDataUrl(await response.blob())
      }

      const match = dataUrl.match(/^data:image\/(png|jpe?g);/i)
      if (!match) return null
      const size = await readImageSize(dataUrl)
      return {
        dataUrl,
        format: match[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG',
        ...size,
      }
    } catch {
      return null
    }
  }

  async function renderPODocumentPdf(data: PODocumentPrintData) {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 36
    const contentWidth = pageWidth - margin * 2
    const accent = hexToRgb(data.accentColor)
    let y = 34

    function setText(hex = '#111827') {
      const color = hexToRgb(hex)
      pdf.setTextColor(color.r, color.g, color.b)
    }

    function addPageIfNeeded(nextHeight: number) {
      if (y + nextHeight <= pageHeight - margin) return
      pdf.addPage()
      y = margin
    }

    function textLines(text: string, width: number) {
      return pdf.splitTextToSize(text || '', width) as string[]
    }

    pdf.setFillColor(accent.r, accent.g, accent.b)
    pdf.rect(0, 0, pageWidth, 8, 'F')

    const logo = await getPdfImage(data.logoUrl)
    if (logo) {
      const maxLogoWidth = 170
      const maxLogoHeight = 70
      const logoRatio = logo.width && logo.height ? logo.width / logo.height : 1
      let logoWidth = maxLogoWidth
      let logoHeight = logoWidth / logoRatio
      if (logoHeight > maxLogoHeight) {
        logoHeight = maxLogoHeight
        logoWidth = logoHeight * logoRatio
      }
      pdf.addImage(logo.dataUrl, logo.format, margin, y, logoWidth, logoHeight)
    }

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(22)
    setText(data.accentColor)
    pdf.text('Purchase Order', pageWidth - margin, y + 14, { align: 'right' })

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    setText('#4b5563')
    pdf.text(`Date ${data.poDate || '-'}`, pageWidth - margin, y + 34, { align: 'right' })
    pdf.text(`P.O. number ${data.poNumber}`, pageWidth - margin, y + 52, { align: 'right' })

    y = 125
    pdf.setDrawColor(229, 231, 235)
    pdf.line(margin, y - 12, pageWidth - margin, y - 12)
    pdf.line(margin, y + 78, pageWidth - margin, y + 78)

    const columnWidth = (contentWidth - 24) / 2
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    setText('#6b7280')
    pdf.text('VENDOR', margin, y)
    pdf.text('SHIP TO', margin + columnWidth + 24, y)

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    setText('#111827')
    pdf.text(textLines(data.vendorName || '-', columnWidth), margin, y + 18)
    pdf.text(textLines(data.shipToName || '-', columnWidth), margin + columnWidth + 24, y + 18)

    pdf.setFontSize(8)
    setText('#4b5563')
    pdf.text(textLines(data.vendorAddress || '-', columnWidth), margin, y + 34)
    pdf.text(textLines([data.shipToAddress, data.shipToPhone].filter(Boolean).join('\n') || '-', columnWidth), margin + columnWidth + 24, y + 34)

    y += 108
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    setText('#4b5563')
    pdf.text('SR', margin, y)
    pdf.text('DESCRIPTION', margin + 35, y)
    pdf.text('QTY', pageWidth - margin - 170, y, { align: 'right' })
    pdf.text('UNIT PRICE', pageWidth - margin - 82, y, { align: 'right' })
    pdf.text('TOTAL', pageWidth - margin, y, { align: 'right' })
    y += 8
    pdf.setDrawColor(209, 213, 219)
    pdf.line(margin, y, pageWidth - margin, y)
    y += 16

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    setText('#111827')

    for (const item of data.items) {
      const description = textLines(item.itemName || '-', contentWidth - 260)
      const rowHeight = Math.max(22, description.length * 11 + 8)
      addPageIfNeeded(rowHeight)

      pdf.text(String(item.sr), margin, y)
      pdf.text(description, margin + 35, y)
      pdf.text(item.quantity.toLocaleString(), pageWidth - margin - 170, y, { align: 'right' })
      pdf.text(item.unitPrice == null ? '-' : `$${item.unitPrice.toFixed(2)}`, pageWidth - margin - 82, y, { align: 'right' })
      pdf.text(`$${item.totalPrice.toFixed(2)}`, pageWidth - margin, y, { align: 'right' })
      y += rowHeight
      pdf.setDrawColor(243, 244, 246)
      pdf.line(margin, y - 8, pageWidth - margin, y - 8)
    }

    y += 12
    addPageIfNeeded(90)
    if (data.termsConditions) {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      setText('#6b7280')
      pdf.text('TERMS AND CONDITIONS', margin, y)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      setText('#4b5563')
      pdf.text(textLines(data.termsConditions, contentWidth - 180), margin, y + 16)
    }

    addPageIfNeeded(120)
    let summaryY = y + 20
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    setText('#4b5563')
    pdf.text(`Subtotal   $${data.subtotal.toFixed(2)}`, pageWidth - margin, summaryY, { align: 'right' })

    if (data.gstPercent) {
      summaryY += 14
      pdf.text(
        `GST (${data.gstPercent}%)   $${((data.subtotal * data.gstPercent) / 100).toFixed(2)}`,
        pageWidth - margin,
        summaryY,
        { align: 'right' }
      )
    }
    if (data.othersPercent) {
      summaryY += 14
      pdf.text(
        `Others (${data.othersPercent}%)   $${((data.subtotal * data.othersPercent) / 100).toFixed(2)}`,
        pageWidth - margin,
        summaryY,
        { align: 'right' }
      )
    }
    if (data.shippingPercent) {
      summaryY += 14
      pdf.text(
        `Shipping (${data.shippingPercent}%)   $${((data.subtotal * data.shippingPercent) / 100).toFixed(2)}`,
        pageWidth - margin,
        summaryY,
        { align: 'right' }
      )
    }

    summaryY += 10
    pdf.setDrawColor(209, 213, 219)
    pdf.line(pageWidth - margin - 170, summaryY, pageWidth - margin, summaryY)

    summaryY += 20
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    setText(data.accentColor)
    pdf.text(`Grand Total   $${data.grandTotal.toFixed(2)}`, pageWidth - margin, summaryY, { align: 'right' })

    pdf.setFillColor(accent.r, accent.g, accent.b)
    pdf.rect(0, pageHeight - 8, pageWidth, 8, 'F')

    pdf.save(`${sanitizeFileName(data.poNumber)}.pdf`)
  }

  async function handleDownloadPDF() {
    const data = editorRef.current?.getPrintData()
    if (!data) return
    setPdfLoading(true)
    try {
      await renderPODocumentPdf(data)
    } catch (err) {
      console.error('PDF generation failed:', err)
      showToast({ message: 'PDF download failed. Try Print PDF.', type: 'error' })
    } finally {
      setPdfLoading(false)
    }
  }

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filteredDocs = useMemo(() => {
    let result = docs
    if (vendorFilter) {
      result = result.filter(d => d.vendorId === vendorFilter)
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      result = result.filter(d =>
        d.poNumber.toLowerCase().includes(q) ||
        d.vendorName.toLowerCase().includes(q) ||
        STATUS_LABELS[d.status].toLowerCase().includes(q)
      )
    }
    return result
  }, [docs, searchQuery, vendorFilter])

  // ── Editor view ────────────────────────────────────────────────────────────

  if (editingDoc !== null) {
    const docObj = editingDoc === 'new' ? null : editingDoc
    return (
      <div className="space-y-4">
        {/* PDF / Print toolbar — hidden on print */}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <h1 className="text-xl font-bold">
            {docObj ? `Edit — ${docObj.poNumber}` : 'New Purchase Order'}
          </h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-zinc-600">
                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9h8v2H6v-2zm8-4a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
              </svg>
              Print PDF
            </button>
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={pdfLoading}
              className="flex items-center gap-1.5 rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-zinc-600">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              {pdfLoading ? 'Generating…' : 'Download PDF'}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 print:hidden">{error}</div>
        )}

        <PODocumentEditor
          ref={editorRef}
          doc={docObj}
          vendors={vendors}
          brands={brands}
          rawMaterials={rawMaterials}
          products={products}
          labels={labels}
          saving={saving}
          onSave={handleSave}
          onDelete={docObj ? () => setDeleteTarget(docObj) : undefined}
          onBack={() => setEditingDoc(null)}
          printRef={printRef}
        />

        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Delete Purchase Order?"
          description={`Delete ${deleteTarget?.poNumber}? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          loading={deleting}
        />
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-zinc-600 text-sm">Create formal purchase order documents with PDF export</p>
        </div>
        <Button onClick={() => setEditingDoc('new')}>+ New Purchase Order</Button>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      )}

      <Card
        title="All Purchase Orders"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={vendorFilter}
              onChange={e => setVendorFilter(e.target.value)}
              className="h-9 w-48"
            >
              <option value="">All vendors</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
            <Input
              placeholder="Search…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-9 w-48"
            />
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoading colSpan={8} />
            ) : filteredDocs.length === 0 ? (
              <TableEmpty colSpan={8} message="No purchase orders yet." />
            ) : (
              filteredDocs.map(doc => {
                return (
                  <TableRow key={doc.id} clickable onClick={() => setEditingDoc(doc)}>
                    <TableCell className="font-mono font-semibold">{doc.poNumber}</TableCell>
                    <TableCell>{doc.poDate}</TableCell>
                    <TableCell>{doc.vendorName || '—'}</TableCell>
                    <TableCell>{doc.items.length}</TableCell>
                    <TableCell>${doc.grandTotal.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(doc.status)}>{STATUS_LABELS[doc.status]}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(doc.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            setDeleteTarget(doc)
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Purchase Order?"
        description={`Delete ${deleteTarget?.poNumber}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
