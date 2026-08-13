// ============================================================================
// Purchase Orders Page — formal PO documents with PDF export
// ============================================================================

'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
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
  fetchPODocument,
  fetchPODocumentHistory,
  fetchPODocuments,
  fetchProducts,
  fetchQuotes,
  fetchRawMaterials,
  fetchRequestToQuoteDocuments,
  fetchVendors,
  initSupabase,
  savePODocument,
  savePOPaymentProof,
} from '@/lib/supabase/data'
import { formatDate } from '@/lib/utils'
import type {
  Brand,
  CreatePODocumentInput,
  LabelInventory,
  PODocument,
  PODocumentStatus,
  Product,
  Quote,
  RawMaterial,
  RequestToQuoteDocument,
  Vendor,
} from '@/types'

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PODocumentStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  received: 'Received',
  canceled: 'Canceled',
  approved: 'Approved',
}

function statusVariant(s: PODocumentStatus): 'default' | 'info' | 'success' | 'error' {
  if (s === 'sent') return 'info'
  if (s === 'received' || s === 'approved') return 'success'
  if (s === 'canceled') return 'error'
  return 'default'
}

function viewButtonClass(active: boolean): string {
  return `rounded-xl border px-4 py-2 text-sm font-medium transition ${
    active
      ? 'border-[#1D838D] bg-[#1D838D] text-white'
      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
  }`
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  const [docs, setDocs] = useState<PODocument[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [labels, setLabels] = useState<LabelInventory[]>([])
  const [rtqDocs, setRtqDocs] = useState<RequestToQuoteDocument[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [editingDoc, setEditingDoc] = useState<PODocument | null | 'new'>(null)
  const [editingReadOnly, setEditingReadOnly] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PODocument | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  // ── Version history (expand/collapse per PO number) ──────────────────────────
  const [expandedNumbers, setExpandedNumbers] = useState<Set<string>>(new Set())
  const [historyByNumber, setHistoryByNumber] = useState<Record<string, PODocument[]>>({})
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({})

  const printRef = useRef<HTMLDivElement>(null!)
  const editorRef = useRef<PODocumentEditorHandle>(null)
  const { showToast } = useToast()
  const location = useLocation()

  useEffect(() => { void loadData() }, [])

  useEffect(() => {
    const openDoc = (location.state as { openDoc?: PODocument } | null)?.openDoc
    if (openDoc) {
      setEditingReadOnly(false)
      setEditingDoc(openDoc)
      window.history.replaceState({}, '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError('')
      await initSupabase()
      const [docList, vendorList, brandList, productList, materialList, labelList, rtqList, quoteList] = await Promise.all([
        fetchPODocuments({ limit: 200 }),
        fetchVendors(),
        fetchBrands(),
        fetchProducts(),
        fetchRawMaterials(),
        fetchLabelInventory(),
        fetchRequestToQuoteDocuments({ limit: 500 }),
        fetchQuotes({ limit: 500 }),
      ])
      setDocs(docList)
      setVendors(vendorList)
      setBrands(brandList as Brand[])
      setProducts(productList as Product[])
      setRawMaterials(materialList as RawMaterial[])
      setLabels(labelList as LabelInventory[])
      setRtqDocs(rtqList)
      setQuotes(quoteList)
    } catch (err) {
      console.error('Failed to load PO documents:', err)
      setError('Failed to load purchase orders.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(input: CreatePODocumentInput, paymentProofFile?: File | null) {
    try {
      setSaving(true)
      let saved = await savePODocument(input)
      if (paymentProofFile) {
        saved = await savePOPaymentProof(saved.id, paymentProofFile)
      }
      showToast({
        message: input.id ? `${saved.poNumber} — new version saved (v${saved.version})` : `PO ${saved.poNumber} created`,
        type: 'success',
      })
      setEditingDoc(saved)
      setEditingReadOnly(false)
      // The cached history for this PO number is now stale (missing the
      // version we just saved) - clear it so re-expanding refetches.
      setHistoryByNumber(prev => {
        const next = { ...prev }
        delete next[saved.poNumber]
        return next
      })
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
      setDocs(prev => prev.filter(d => d.poNumber !== deleteTarget.poNumber))
      setHistoryByNumber(prev => {
        const next = { ...prev }
        delete next[deleteTarget.poNumber]
        return next
      })
      setExpandedNumbers(prev => {
        const next = new Set(prev)
        next.delete(deleteTarget.poNumber)
        return next
      })
      setDeleteTarget(null)
      if (editingDoc && editingDoc !== 'new' && editingDoc.poNumber === deleteTarget.poNumber) {
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

  // ── Version history ───────────────────────────────────────────────────────

  async function openVersion(doc: PODocument, readOnly: boolean) {
    setEditingReadOnly(readOnly)
    setEditingDoc(doc)
    // History rows omit the (potentially large) Payment Proof file content -
    // fetch the full record so its download link is available once opened.
    try {
      const full = await fetchPODocument(doc.id)
      if (full) setEditingDoc(full)
    } catch (err) {
      console.error('Failed to load full PO document:', err)
    }
  }

  async function toggleExpand(doc: PODocument) {
    const number = doc.poNumber
    setExpandedNumbers(prev => {
      const next = new Set(prev)
      if (next.has(number)) {
        next.delete(number)
      } else {
        next.add(number)
      }
      return next
    })
    if (historyByNumber[number] || historyLoading[number]) return
    setHistoryLoading(prev => ({ ...prev, [number]: true }))
    try {
      const rows = await fetchPODocumentHistory(doc.id)
      setHistoryByNumber(prev => ({ ...prev, [number]: rows }))
    } catch (err) {
      console.error('Failed to load Purchase Order history:', err)
      showToast({ message: 'Failed to load version history', type: 'error' })
    } finally {
      setHistoryLoading(prev => ({ ...prev, [number]: false }))
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
    pdf.setFontSize(24)
    setText(data.accentColor)
    pdf.text('Purchase Order', pageWidth - margin, y + 16, { align: 'right' })

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    setText('#111827')
    pdf.text('DATE', pageWidth - margin, y + 38, { align: 'right' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    setText('#4b5563')
    pdf.text(data.poDate || '-', pageWidth - margin, y + 52, { align: 'right' })

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    setText('#111827')
    pdf.text('PO NUMBER', pageWidth - margin, y + 70, { align: 'right' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    setText('#4b5563')
    pdf.text(data.poNumber, pageWidth - margin, y + 84, { align: 'right' })

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

    // Explicit column grid (Sr# | Description | QTY | Unit price | Total price),
    // full bordered table matching the reference PO's grid layout.
    const colSrWidth = 34
    const colQtyWidth = 55
    const colPriceWidth = 75
    const colTotalWidth = 85
    const colDescWidth = contentWidth - colSrWidth - colQtyWidth - colPriceWidth - colTotalWidth
    const gx0 = margin
    const gx1 = gx0 + colSrWidth
    const gx2 = gx1 + colDescWidth
    const gx3 = gx2 + colQtyWidth
    const gx4 = gx3 + colPriceWidth
    const gx5 = gx4 + colTotalWidth

    const headerTop = y - 15
    const headerHeight = 22
    pdf.setFillColor(accent.r, accent.g, accent.b)
    pdf.rect(gx0, headerTop, contentWidth, headerHeight, 'F')
    pdf.setDrawColor(255, 255, 255)
    ;[gx1, gx2, gx3, gx4].forEach(x => pdf.line(x, headerTop, x, headerTop + headerHeight))
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(255, 255, 255)
    pdf.text('Sr#', gx0 + 6, y)
    pdf.text('Description', gx1 + 6, y)
    pdf.text('QTY', gx3 - 6, y, { align: 'right' })
    pdf.text('Unit price', gx4 - 6, y, { align: 'right' })
    pdf.text('Total price', gx5 - 6, y, { align: 'right' })
    y += 18

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)

    data.items.forEach((item, index) => {
      const description = textLines(item.itemName || '-', colDescWidth - 12)
      const rowHeight = Math.max(24, description.length * 11 + 10)
      addPageIfNeeded(rowHeight)

      const rowTop = y - 10
      if (index % 2 === 1) {
        pdf.setFillColor(246, 247, 248)
        pdf.rect(gx0, rowTop, contentWidth, rowHeight, 'F')
      }

      // Sr# / Qty / Unit price / Total price are vertically centered against
      // the (possibly multi-line) description, which is top-aligned.
      const centerY = rowTop + rowHeight / 2 + 3
      setText('#111827')
      pdf.text(String(item.sr), gx0 + 6, centerY)
      pdf.text(description, gx1 + 6, y)
      pdf.text(item.quantity.toLocaleString(), gx3 - 6, centerY, { align: 'right' })
      pdf.text(item.unitPrice == null ? '-' : item.unitPrice.toFixed(2), gx4 - 6, centerY, { align: 'right' })
      pdf.text(`$${item.totalPrice.toFixed(2)}`, gx5 - 6, centerY, { align: 'right' })

      pdf.setDrawColor(209, 213, 219)
      ;[gx0, gx1, gx2, gx3, gx4, gx5].forEach(x => pdf.line(x, rowTop, x, rowTop + rowHeight))
      pdf.line(gx0, rowTop + rowHeight, gx5, rowTop + rowHeight)

      y += rowHeight
    })

    y += 16
    addPageIfNeeded(150)

    // Note box (left) + Subtotal/GST/Other/Shipping/Total block (right),
    // side by side — matches the reference PO layout.
    const summaryBoxWidth = 200
    const summaryX = pageWidth - margin - summaryBoxWidth
    const noteBoxWidth = summaryX - margin - 20
    const boxTop = y

    pdf.setFillColor(accent.r, accent.g, accent.b)
    pdf.rect(margin, boxTop, noteBoxWidth, 18, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(255, 255, 255)
    pdf.text('Note', margin + 6, boxTop + 12)
    pdf.setDrawColor(209, 213, 219)
    pdf.rect(margin, boxTop + 18, noteBoxWidth, 80)
    if (data.termsConditions) {
      setText('#4b5563')
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.text(textLines(data.termsConditions, noteBoxWidth - 12), margin + 6, boxTop + 32)
    }

    // Totals — bordered rows with alternating fill, matching the reference's mini-table.
    const summaryRowHeight = 18
    const summaryRows: Array<{ label: string; value: string }> = [
      { label: 'SUBTOTAL', value: `$${data.subtotal.toFixed(2)}` },
      {
        label: `GST${data.gstPercent ? ` (${data.gstPercent}%)` : ''}`,
        value: `$${((data.subtotal * data.gstPercent) / 100).toFixed(2)}`,
      },
      { label: 'OTHER', value: `$${data.othersValue.toFixed(2)}` },
      { label: 'SHIPPING', value: `$${data.shippingValue.toFixed(2)}` },
    ]
    let ty = boxTop
    summaryRows.forEach((row, index) => {
      if (index % 2 === 1) {
        pdf.setFillColor(246, 247, 248)
        pdf.rect(summaryX - 8, ty, summaryBoxWidth + 8, summaryRowHeight, 'F')
      }
      pdf.setFont('helvetica', index === 0 ? 'bold' : 'normal')
      pdf.setFontSize(9)
      setText(index === 0 ? '#111827' : '#4b5563')
      pdf.text(row.label, summaryX, ty + 13)
      pdf.text(row.value, pageWidth - margin, ty + 13, { align: 'right' })
      ty += summaryRowHeight
    })
    pdf.setDrawColor(209, 213, 219)
    pdf.rect(summaryX - 8, boxTop, summaryBoxWidth + 8, summaryRowHeight * summaryRows.length)
    for (let i = 1; i < summaryRows.length; i++) {
      const ly = boxTop + summaryRowHeight * i
      pdf.line(summaryX - 8, ly, pageWidth - margin, ly)
    }

    pdf.setFillColor(accent.r, accent.g, accent.b)
    pdf.rect(summaryX - 8, ty, summaryBoxWidth + 8, 24, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(255, 255, 255)
    pdf.text('TOTAL', summaryX, ty + 16)
    pdf.text(`$ ${data.grandTotal.toFixed(2)}`, pageWidth - margin, ty + 16, { align: 'right' })
    ty += 24

    y = Math.max(boxTop + 100, ty + 20)

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

  // RTQs eligible to link a new PO to: must already have a Quote attached,
  // and not already be linked to a PO.
  const eligibleRtqs = useMemo(() => {
    const quoteByRtq = new Map(quotes.map(q => [q.rtqNumber, q.quoteNumber]))
    return rtqDocs
      .filter(rtq => rtq.status !== 'moved_to_po' && quoteByRtq.has(rtq.rtqNumber))
      .map(rtq => ({ ...rtq, quoteNumber: quoteByRtq.get(rtq.rtqNumber)! }))
  }, [rtqDocs, quotes])

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

  // ── Render ─────────────────────────────────────────────────────────────────

  const docObj = editingDoc === 'new' ? null : editingDoc

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Purchase Orders</h1>
        <p className="text-zinc-600 text-sm">Create formal purchase order documents with PDF export</p>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 print:hidden">{error}</div>
      )}

      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          className={viewButtonClass(editingDoc === null)}
          onClick={() => { setEditingDoc(null); setEditingReadOnly(false) }}
        >
          Purchase Orders
        </button>
        <button
          type="button"
          className={viewButtonClass(editingDoc !== null)}
          onClick={() => { setEditingDoc('new'); setEditingReadOnly(false) }}
        >
          Create Purchase Order
        </button>
      </div>

      {editingDoc !== null && (
        <div className="space-y-4">
          {/* PDF / Print toolbar — hidden on print */}
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <h2 className="text-lg font-semibold">
              {docObj
                ? editingReadOnly
                  ? `Viewing — ${docObj.poNumber} (v${docObj.version}, read-only)`
                  : `Edit — ${docObj.poNumber}`
                : 'New Purchase Order'}
            </h2>
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

          <PODocumentEditor
            ref={editorRef}
            doc={docObj}
            vendors={vendors}
            brands={brands}
            rawMaterials={rawMaterials}
            products={products}
            labels={labels}
            eligibleRtqs={eligibleRtqs}
            saving={saving}
            readOnly={editingReadOnly}
            onSave={handleSave}
            onDelete={docObj && !editingReadOnly ? () => setDeleteTarget(docObj) : undefined}
            onBack={() => { setEditingDoc(null); setEditingReadOnly(false) }}
            printRef={printRef}
          />
        </div>
      )}

      {editingDoc === null && (
        <Card
          title="Purchase Orders"
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
                <TableHead>Brand</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={4} />
              ) : filteredDocs.length === 0 ? (
                <TableEmpty colSpan={4} message="No purchase orders yet." />
              ) : (
                filteredDocs.map(doc => {
                  const expanded = expandedNumbers.has(doc.poNumber)
                  const brandName = brands.find(b => b.id === doc.brandId)?.name
                  return (
                    <Fragment key={doc.id}>
                      <TableRow clickable onClick={() => void toggleExpand(doc)}>
                        <TableCell className="font-mono font-semibold">{doc.poNumber}</TableCell>
                        <TableCell>{brandName || '—'}</TableCell>
                        <TableCell>{doc.vendorName || '—'}</TableCell>
                        <TableCell>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className={`h-4 w-4 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                          >
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                          </svg>
                        </TableCell>
                      </TableRow>

                      {expanded && (
                        <TableRow>
                          <TableCell colSpan={4} className="bg-zinc-50 p-0">
                            {historyLoading[doc.poNumber] ? (
                              <div className="p-4 text-center text-sm text-zinc-400">Loading version history…</div>
                            ) : (
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
                                  {(historyByNumber[doc.poNumber] ?? []).map(version => (
                                    <TableRow
                                      key={version.id}
                                      clickable
                                      onClick={() => openVersion(version, !version.isLatest)}
                                    >
                                      <TableCell className="font-mono font-semibold">
                                        {version.poNumber}
                                        {version.isLatest && (
                                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                            Latest
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell>{version.poDate}</TableCell>
                                      <TableCell>{version.vendorName || '—'}</TableCell>
                                      <TableCell>{version.items.length}</TableCell>
                                      <TableCell>${version.grandTotal.toFixed(2)}</TableCell>
                                      <TableCell>
                                        <Badge variant={statusVariant(version.status)}>{STATUS_LABELS[version.status]}</Badge>
                                      </TableCell>
                                      <TableCell>{formatDate(version.createdAt)}</TableCell>
                                      <TableCell>
                                        <div className="flex gap-2">
                                          <Button
                                            variant="subtle"
                                            size="sm"
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              openVersion(version, !version.isLatest)
                                            }}
                                          >
                                            {version.isLatest ? 'Edit' : 'View'}
                                          </Button>
                                          <Button
                                            variant="danger"
                                            size="sm"
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              setDeleteTarget(version)
                                            }}
                                          >
                                            Delete
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </Card>
      )}

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
