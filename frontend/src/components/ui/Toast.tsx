// ============================================================================
// Toast Component & Context
// ============================================================================

'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'

// Types
interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
}

interface ToastContextValue {
  showToast: (options: {
    message: string
    type?: Toast['type']
    duration?: number
  }) => void
}

// Context
const ToastContext = createContext<ToastContextValue>({
  showToast: () => {}
})

// Hook
export function useToast() {
  return useContext(ToastContext)
}

// Provider
interface ToastProviderProps {
  children: React.ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback(
    ({
      message,
      type = 'success',
      duration = 3000
    }: {
      message: string
      type?: Toast['type']
      duration?: number
    }) => {
      const id = Math.random().toString(36).slice(2, 9)

      setToasts((prev) => [...prev, { id, message, type }])

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, duration)
    },
    []
  )

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  )
}

// Container
interface ToastContainerProps {
  toasts: Toast[]
}

function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed inset-x-2 bottom-3 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

// Toast Item
interface ToastItemProps {
  toast: Toast
}

function ToastItem({ toast }: ToastItemProps) {
  const variants = {
    success: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    error: 'bg-rose-100 text-rose-900 border-rose-200',
    warning: 'bg-amber-100 text-amber-900 border-amber-200',
    info: 'bg-blue-100 text-blue-900 border-blue-200'
  }

  const icons = {
    success: '✔',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  }

  const iconColors = {
    success: 'text-emerald-700',
    error: 'text-rose-700',
    warning: 'text-amber-700',
    info: 'text-blue-700'
  }

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 shadow-sm animate-in slide-in-from-right sm:min-w-[260px]',
        variants[toast.type]
      )}
    >
      <span className={iconColors[toast.type]}>{icons[toast.type]}</span>
      <span className="text-sm">{toast.message}</span>
    </div>
  )
}
