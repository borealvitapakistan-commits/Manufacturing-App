// ============================================================================
// Card Component
// ============================================================================

import { cn } from '@/lib/utils'

interface CardProps {
  title?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Card({ title, actions, children, className }: CardProps) {
  return (
    <div
      className={cn(
        'min-w-0 border-t border-zinc-200 bg-white py-4 sm:py-5',
        className
      )}
    >
      {(title || actions) && (
        <div className="mb-4 flex flex-col gap-2 border-b border-zinc-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
          {title && <h3 className="text-lg font-semibold tracking-tight text-zinc-950">{title}</h3>}
          {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

// Card variants
interface CardHeaderProps {
  children: React.ReactNode
  className?: string
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-3 border-b border-zinc-200 pb-3', className)}>
      {children}
    </div>
  )
}

interface CardTitleProps {
  children: React.ReactNode
  className?: string
}

export function CardTitle({ children, className }: CardTitleProps) {
  return (
    <h3 className={cn('text-lg font-semibold tracking-tight text-zinc-950', className)}>
      {children}
    </h3>
  )
}

interface CardContentProps {
  children: React.ReactNode
  className?: string
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={className}>{children}</div>
}

interface CardFooterProps {
  children: React.ReactNode
  className?: string
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn('mt-4 flex gap-2', className)}>
      {children}
    </div>
  )
}
