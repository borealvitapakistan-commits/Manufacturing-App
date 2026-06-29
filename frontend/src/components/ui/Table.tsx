// ============================================================================
// Table Components
// ============================================================================

import { cn } from '@/lib/utils'

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  children: React.ReactNode
}

export function Table({ children, className, ...props }: TableProps) {
  return (
    <div className="-mx-4 overflow-x-auto overscroll-x-contain border-y border-zinc-200 sm:-mx-6 lg:-mx-8">
      <table className={cn('w-full min-w-[760px] border-collapse text-sm', className)} {...props}>
        {children}
      </table>
    </div>
  )
}

interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode
}

export function TableHeader({ children, className, ...props }: TableHeaderProps) {
  return (
    <thead className={className} {...props}>
      {children}
    </thead>
  )
}

interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode
}

export function TableBody({ children, className, ...props }: TableBodyProps) {
  return (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  )
}

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode
  clickable?: boolean
}

export function TableRow({ children, className, clickable, ...props }: TableRowProps) {
  return (
    <tr
      className={cn(
        'border-b border-zinc-200 bg-white',
        clickable && 'cursor-pointer hover:bg-[#EFEFEF]',
        className
      )}
      {...props}
    >
      {children}
    </tr>
  )
}

interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode
}

export function TableHead({ children, className, ...props }: TableHeadProps) {
  return (
    <th
      className={cn(
        'sticky top-0 z-[1] border-b border-zinc-300 bg-zinc-50 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 whitespace-nowrap',
        className
      )}
      {...props}
    >
      {children}
    </th>
  )
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode
}

export function TableCell({ children, className, ...props }: TableCellProps) {
  return (
    <td className={cn('max-w-[22rem] break-words px-3 py-3 align-top text-zinc-800', className)} {...props}>
      {children}
    </td>
  )
}

// Empty State
interface TableEmptyProps {
  message?: string
  colSpan: number
}

export function TableEmpty({ message = 'No data found', colSpan }: TableEmptyProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-zinc-500">
        {message}
      </td>
    </tr>
  )
}

// Loading State
interface TableLoadingProps {
  colSpan: number
}

export function TableLoading({ colSpan }: TableLoadingProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center">
        <div className="flex items-center justify-center gap-2">
          <svg
            className="animate-spin h-5 w-5 text-zinc-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-zinc-500">Loading...</span>
        </div>
      </td>
    </tr>
  )
}
