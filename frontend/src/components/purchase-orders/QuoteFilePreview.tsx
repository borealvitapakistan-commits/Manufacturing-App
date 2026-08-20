import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Quote } from '@/types'

const ZOOM_STEP = 0.1
const ZOOM_MIN = 0.3
const ZOOM_MAX = 3

// Renders whatever file type a Quote has attached, inline - PDF and images
// render natively in the browser, text files are decoded and shown as text,
// anything else (Word docs, etc.) falls back to a download link since
// browsers can't preview those inline. Zoom and the hand (pan) tool are
// scoped to this panel only - independent from the PO panel's own zoom.
export function QuoteFilePreview({ quote }: { quote: Quote }) {
  const [textContent, setTextContent] = useState<string | null>(null)
  const [textError, setTextError] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [handTool, setHandTool] = useState(false)
  const [panning, setPanning] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const panStart = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null)

  const fileType = quote.fileType || ''
  const isText = fileType.startsWith('text/')

  useEffect(() => {
    setTextContent(null)
    setTextError(false)
    if (!quote.fileUrl || !isText) return
    let cancelled = false
    fetch(quote.fileUrl)
      .then(response => response.text())
      .then(text => { if (!cancelled) setTextContent(text) })
      .catch(() => { if (!cancelled) setTextError(true) })
    return () => { cancelled = true }
  }, [quote.fileUrl, isText])

  // A new Quote gets a fresh view - carrying over the last one's zoom/pan
  // position onto unrelated content would be confusing.
  useEffect(() => {
    setZoom(1)
    setHandTool(false)
  }, [quote.id])

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!handTool || !scrollRef.current) return
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: scrollRef.current.scrollLeft,
      scrollTop: scrollRef.current.scrollTop,
    }
    scrollRef.current.setPointerCapture(e.pointerId)
    setPanning(true)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!panStart.current || !scrollRef.current) return
    scrollRef.current.scrollLeft = panStart.current.scrollLeft - (e.clientX - panStart.current.x)
    scrollRef.current.scrollTop = panStart.current.scrollTop - (e.clientY - panStart.current.y)
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    panStart.current = null
    setPanning(false)
    scrollRef.current?.releasePointerCapture(e.pointerId)
  }

  function renderContent() {
    if (!quote.fileUrl) {
      return (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-500">
          No file attached to {quote.quoteNumber}.
        </div>
      )
    }

    if (fileType.startsWith('image/')) {
      // Rendered at its natural size so the zoom control and hand tool
      // actually have something to scale/pan - a fit-to-width image never
      // overflows its box, which would make both controls no-ops. The
      // inline maxWidth is required, not just a Tailwind class: index.css
      // has an unlayered `img { max-width: 100% }` reset that otherwise
      // wins over any Tailwind utility regardless of specificity.
      return (
        <div className="p-3">
          <img
            src={quote.fileUrl}
            alt={quote.fileName ?? quote.quoteNumber}
            className="block h-auto select-none"
            style={{ maxWidth: 'none' }}
            draggable={false}
          />
        </div>
      )
    }

    if (fileType === 'application/pdf') {
      // Fixed base box (roughly a letter page) rather than 100%/100% - same
      // reasoning as the image above, so zoom has a real effect.
      return (
        <iframe
          src={quote.fileUrl}
          title={quote.fileName ?? quote.quoteNumber}
          style={{ width: 800, height: 1000, border: 0, display: 'block' }}
        />
      )
    }

    if (isText) {
      return (
        <pre className="whitespace-pre-wrap break-words p-4 text-xs text-zinc-800">
          {textError ? 'Could not load this file for preview.' : (textContent ?? 'Loading…')}
        </pre>
      )
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-zinc-600">
          Preview isn't available for this file type{fileType ? ` (${fileType})` : ''}.
        </p>
        <a
          href={quote.fileUrl}
          download={quote.fileName ?? undefined}
          className="text-sm font-medium text-[#1D838D] underline"
        >
          Download {quote.fileName ?? 'file'}
        </a>
      </div>
    )
  }

  const canZoom = !!quote.fileUrl

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-2 py-1">
        <button
          type="button"
          onClick={() => setHandTool(v => !v)}
          disabled={!canZoom}
          title={handTool ? 'Hand tool active — click to use the normal cursor' : 'Hand tool — drag to pan'}
          className={`rounded p-1.5 transition-colors disabled:opacity-30 ${
            handTool ? 'bg-[#1D838D] text-white' : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M9 11V3.5a1 1 0 112 0V9a.5.5 0 001 0V2.5a1 1 0 112 0V9a.5.5 0 001 0V5a1 1 0 112 0v6a6 6 0 01-6 6h-.5a5 5 0 01-4.435-2.684l-2.106-4.048a1.1 1.1 0 011.928-1.056L7 15V4a1 1 0 112 0v7z" />
          </svg>
        </button>
        <div className="mx-1 h-4 w-px bg-zinc-200" />
        <button
          type="button"
          onClick={() => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
          disabled={!canZoom || zoom <= ZOOM_MIN}
          title="Zoom out"
          className="rounded px-2 py-1 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          disabled={!canZoom}
          title="Reset zoom"
          className="min-w-[3.25rem] rounded px-1.5 py-1 text-center text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
          disabled={!canZoom || zoom >= ZOOM_MAX}
          title="Zoom in"
          className="rounded px-2 py-1 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
        >
          +
        </button>
      </div>
      <div
        ref={scrollRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="flex-1 overflow-auto"
        style={{ cursor: handTool ? (panning ? 'grabbing' : 'grab') : 'auto' }}
      >
        <div style={{ zoom }}>{renderContent()}</div>
      </div>
    </div>
  )
}
