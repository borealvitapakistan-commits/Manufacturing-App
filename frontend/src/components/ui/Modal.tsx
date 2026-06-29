// ============================================================================
// Modal Component
// ============================================================================

'use client'

import { useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
  showCloseButton?: boolean
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true
}: ModalProps) {
  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose()
      }
    },
    [closeOnEscape, onClose]
  )

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', handleKeyDown)
    } else {
      document.body.style.overflow = 'auto'
    }

    return () => {
      document.body.style.overflow = 'auto'
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center overflow-auto px-2 py-2 sm:items-start sm:px-3 sm:py-8"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={cn(
          'relative max-h-[calc(100dvh-1rem)] w-full max-w-xl overflow-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-4rem)] sm:p-5',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <button
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-black"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        )}

        {(title || description) && (
          <div className="mb-4">
            {title && (
              <h2 className="text-lg font-semibold">{title}</h2>
            )}
            {description && (
              <p className="text-sm text-zinc-600">{description}</p>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  )
}

// Confirm Dialog
interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      className={variant === 'danger' ? 'border-rose-200' : undefined}
    >
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
