// ============================================================================
// Badge Component
// ============================================================================

import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'bg-zinc-100 text-zinc-800',
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    error: 'bg-rose-100 text-rose-800',
    info: 'bg-blue-100 text-blue-800'
  }

  return (
    <span
      className={cn(
        'inline-flex px-2 py-1 rounded-full text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

// Status Badge
interface StatusBadgeProps {
  status: string
  onClick?: () => void
  className?: string
}

export function StatusBadge({ status, onClick, className }: StatusBadgeProps) {
  const statusConfig: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    mixingPending: { label: 'Send to Mixing', variant: 'success' },
    ngpPending: { label: 'Mixing Complete -> Encapsulation', variant: 'warning' },
    assemblyPending: { label: 'Encapsulation Complete -> Assembly', variant: 'warning' },
    finalized: { label: 'Finalized', variant: 'success' }
  }

  const config = statusConfig[status] || { label: status, variant: 'default' as const }

  return (
    <span
      className={cn(
        'inline-flex px-3 py-1 rounded-full text-xs font-semibold',
        config.variant === 'success' && 'bg-emerald-100 text-emerald-800',
        config.variant === 'warning' && 'bg-amber-100 text-amber-800',
        onClick && status !== 'finalized' && 'cursor-pointer hover:opacity-80',
        className
      )}
      onClick={onClick}
    >
      {config.label}
    </span>
  )
}

// Check Badge
interface CheckBadgeProps {
  checked: boolean
  className?: string
}

export function CheckBadge({ checked, className }: CheckBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex w-5 h-5 items-center justify-center rounded-full text-xs font-bold',
        checked ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
        className
      )}
    >
      {checked ? '✔' : '✖'}
    </span>
  )
}
