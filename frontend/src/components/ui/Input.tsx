// ============================================================================
// Input Components
// ============================================================================

'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

// Base Input
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <div className="w-full">
      <input
        ref={ref}
        className={cn(
          'min-h-12 w-full border bg-white px-3 py-2 text-base outline-none focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30 sm:text-sm',
          error ? 'border-rose-500' : 'border-zinc-300',
          className
        )}
        {...props}
      />
      {error && <span className="text-xs text-rose-600 mt-1">{error}</span>}
    </div>
  )
)
Input.displayName = 'Input'

// Number Input
export type NumberInputProps = Omit<InputProps, 'type'>

const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (props, ref) => (
    <Input
      ref={ref}
      type="number"
      step="any"
      inputMode="decimal"
      {...props}
    />
  )
)
NumberInput.displayName = 'NumberInput'

// Select
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => (
    <div className="w-full">
      <select
        ref={ref}
        className={cn(
          'min-h-12 w-full border bg-white px-3 py-2 text-base focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30 sm:text-sm',
          error ? 'border-rose-500' : 'border-zinc-300',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <span className="text-xs text-rose-600 mt-1">{error}</span>}
    </div>
  )
)
Select.displayName = 'Select'

// TextArea
export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
}

const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, error, ...props }, ref) => (
    <div className="w-full">
      <textarea
        ref={ref}
        className={cn(
          'min-h-28 w-full border bg-white px-3 py-2 text-base focus:border-[#1D838D] focus:ring-2 focus:ring-[#1D838D]/30 sm:text-sm',
          error ? 'border-rose-500' : 'border-zinc-300',
          className
        )}
        {...props}
      />
      {error && <span className="text-xs text-rose-600 mt-1">{error}</span>}
    </div>
  )
)
TextArea.displayName = 'TextArea'

// Label
export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>

const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('text-sm font-semibold text-zinc-700', className)}
      {...props}
    />
  )
)
Label.displayName = 'Label'

// Checkbox
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="checkbox"
        id={id}
        className={cn('h-5 w-5 border-zinc-300', className)}
        {...props}
      />
      {label && (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      )}
    </div>
  )
)
Checkbox.displayName = 'Checkbox'

export { Input, NumberInput, Select, TextArea, Label, Checkbox }
