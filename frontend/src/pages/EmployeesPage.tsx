// ============================================================================
// Employees Page - Full HR Management
// ============================================================================

'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Card,
  Button,
  Input,
  NumberInput,
  Select,
  TextArea,
  Label,
  Checkbox,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  ConfirmDialog,
  useToast
} from '@/components/ui'
import {
  initSupabase,
  fetchBrands,
  fetchEmployees,
  saveEmployee,
  deleteEmployee,
  fetchTimeEntries,
  saveTimeEntry,
  fetchWorkEntries,
  saveWorkEntry,
  fetchSalarySheets,
  saveSalarySheet,
  fetchLoans,
  saveLoan,
  fetchOpenExpenseBooks,
  saveLoanWithExpense
} from '@/lib/supabase/data'
import type { Brand } from '@/types'

// ============================================================================
// Types
// ============================================================================

interface Employee {
  id: string
  fullName: string
  phone?: string | null
  email?: string | null
  brandIds: string[]
  primaryBrandId?: string | null
  roleTitle?: string | null
  payType: 'monthly' | 'hourly' | 'perTask'
  baseSalaryMonthly?: number | null
  hourlyRate?: number | null
  perTaskRate?: number | null
  currency: string
  isActive: boolean
  joinDate?: number | null
  endDate?: number | null
  notes?: string | null
}

interface TimeEntry {
  id: string
  employeeId: string
  date: number | { seconds: number }
  timeIn?: string
  timeOut?: string
  hoursWorked?: number
  status: 'present' | 'leave' | 'absent'
  leaveType?: string | null
}

interface WorkEntry {
  id: string
  employeeId: string
  brandId?: string
  date: number | { seconds: number }
  description?: string
  hours?: number
  quantity?: number
  unit?: string
  batchCode?: string
}

interface SalarySheet {
  id: string
  employeeId: string
  year: number
  month: number
  totalDaysPresent: number
  totalDaysLeave: number
  totalHoursWorked: number
  totalTasks?: number
  baseSalary: number
  totalLoanDeduction: number
  otherDeductions?: number
  netPayable: number
  currency: string
  notes?: string
  locked: boolean
}

interface Loan {
  id: string
  employeeId: string
  amount: number
  date: number | { seconds: number }
  description?: string
}

interface ExpenseBook {
  id: string
  name: string
  isActive: boolean
  status: string
}

// ============================================================================
// Helpers
// ============================================================================

const PAY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  hourly: 'Hourly',
  perTask: 'Per Task'
}

function toDate(ts: number | { seconds: number } | null | undefined): Date | null {
  if (!ts) return null
  if (typeof ts === 'object' && 'seconds' in ts) {
    return new Date(ts.seconds * 1000)
  }
  return new Date(ts)
}

function toDateInput(ts: number | { seconds: number } | null | undefined): string {
  const d = toDate(ts)
  if (!d || isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function formatDateDisplay(ts: number | { seconds: number } | null | undefined): string {
  const d = toDate(ts)
  if (!d || isNaN(d.getTime())) return '—'
  return d.toLocaleDateString()
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function diffHours(inTime: string, outTime: string): number {
  const parseMinutes = (hhmm: string) => {
    if (!hhmm) return null
    const [h, m] = hhmm.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return null
    return h * 60 + m
  }
  const a = parseMinutes(inTime)
  const b = parseMinutes(outTime)
  if (a == null || b == null || b <= a) return 0
  return +((b - a) / 60).toFixed(2)
}

// ============================================================================
// Sub-Components
// ============================================================================

function Tabs({ tabs, value, onChange }: {
  tabs: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-zinc-200 mb-4">
      {tabs.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`px-3 py-2 text-sm font-medium rounded-t transition ${
            value === t.value
              ? 'bg-white border border-zinc-200 border-b-white -mb-px'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function MultiCheck({ options, value, onChange }: {
  options: { id: string; name: string; codePrefix?: string }[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const selected = new Set(value || [])
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(Array.from(next))
  }
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {options.map(opt => (
        <label key={opt.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.has(opt.id)}
            onChange={() => toggle(opt.id)}
          />
          <span>{opt.name} ({opt.codePrefix || ''})</span>
        </label>
      ))}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function EmployeesPage() {
  const [tab, setTab] = useState('employees')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { showToast } = useToast()

  // Data
  const [employees, setEmployees] = useState<Employee[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [attendance, setAttendance] = useState<TimeEntry[]>([])
  const [workLogs, setWorkLogs] = useState<WorkEntry[]>([])
  const [salaries, setSalaries] = useState<SalarySheet[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [expenseBooks, setExpenseBooks] = useState<ExpenseBook[]>([])

  // Employee Form
  const [empForm, setEmpForm] = useState({
    id: '',
    fullName: '',
    phone: '',
    email: '',
    brandIds: [] as string[],
    primaryBrandId: '',
    roleTitle: '',
    payType: 'monthly' as 'monthly' | 'hourly' | 'perTask',
    baseSalaryMonthly: '',
    hourlyRate: '',
    perTaskRate: '',
    currency: 'PKR',
    isActive: true,
    joinDate: '',
    endDate: '',
    notes: ''
  })
  const [savingEmp, setSavingEmp] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)

  // Selected employee for other tabs
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')

  // Attendance
  const [attMonth, setAttMonth] = useState(() => new Date().toISOString().slice(0, 7))

  // Work Log
  const [workMonth, setWorkMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [workBrandFilter, setWorkBrandFilter] = useState('')
  const [workForm, setWorkForm] = useState({
    date: '',
    brandId: '',
    description: '',
    hours: '',
    quantity: '',
    unit: '',
    batchCode: ''
  })

  // Salary
  const [salaryForm, setSalaryForm] = useState({
    month: '',
    deductions: '',
    loanDeduction: '',
    currency: 'PKR',
    notes: ''
  })

  // Loans
  const [loanForm, setLoanForm] = useState({
    amount: '',
    direction: 'borrow' as 'borrow' | 'repay',
    date: '',
    note: ''
  })
  const [loanDialog, setLoanDialog] = useState<{
    isOpen: boolean
    employee: Employee | null
    amount: string
    note: string
    bookId: string
    givenFrom: string
  }>({
    isOpen: false,
    employee: null,
    amount: '',
    note: '',
    bookId: '',
    givenFrom: ''
  })

  const brandMap = useMemo(() => {
    const map: Record<string, Brand> = {}
    brands.forEach(b => { map[b.id] = b })
    return map
  }, [brands])

  const selectedEmployee = useMemo(
    () => employees.find(e => e.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId]
  )

  // ============================================================================
  // Load Data
  // ============================================================================

  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadInitialData() {
    try {
      setLoading(true)
      await initSupabase()
      const [brandList, empList, books] = await Promise.all([
        fetchBrands({ activeOnly: true }),
        fetchEmployees(),
        fetchOpenExpenseBooks()
      ])
      setBrands(brandList as Brand[])
      setEmployees(empList as Employee[])
      setExpenseBooks(books as ExpenseBook[])
    } catch (err) {
      console.error('Failed to load data:', err)
      setError('Failed to load data.')
    } finally {
      setLoading(false)
    }
  }

  async function loadAttendance(empId: string) {
    const data = await fetchTimeEntries(empId)
    setAttendance(data as TimeEntry[])
  }

  async function loadWorkLogs(empId: string) {
    const data = await fetchWorkEntries(empId)
    setWorkLogs(data as WorkEntry[])
  }

  async function loadSalaries(empId: string) {
    const data = await fetchSalarySheets(empId)
    setSalaries(data as SalarySheet[])
  }

  async function loadLoans(empId: string) {
    const data = await fetchLoans(empId)
    setLoans(data as Loan[])
  }

  // ============================================================================
  // Employee CRUD
  // ============================================================================

  function resetEmpForm() {
    setEmpForm({
      id: '',
      fullName: '',
      phone: '',
      email: '',
      brandIds: [],
      primaryBrandId: '',
      roleTitle: '',
      payType: 'monthly',
      baseSalaryMonthly: '',
      hourlyRate: '',
      perTaskRate: '',
      currency: 'PKR',
      isActive: true,
      joinDate: '',
      endDate: '',
      notes: ''
    })
  }

  async function handleSaveEmployee() {
    if (!empForm.fullName.trim()) {
      setError('Full name is required.')
      return
    }
    setSavingEmp(true)
    setError('')
    try {
      await saveEmployee({
        id: empForm.id || undefined,
        fullName: empForm.fullName,
        phone: empForm.phone,
        email: empForm.email,
        brandIds: empForm.brandIds,
        primaryBrandId: empForm.primaryBrandId,
        roleTitle: empForm.roleTitle,
        payType: empForm.payType,
        baseSalaryMonthly: empForm.baseSalaryMonthly ? Number(empForm.baseSalaryMonthly) : null,
        hourlyRate: empForm.hourlyRate ? Number(empForm.hourlyRate) : null,
        perTaskRate: empForm.perTaskRate ? Number(empForm.perTaskRate) : null,
        currency: empForm.currency,
        isActive: empForm.isActive,
        joinDate: empForm.joinDate ? new Date(empForm.joinDate).getTime() : null,
        endDate: empForm.endDate ? new Date(empForm.endDate).getTime() : null,
        notes: empForm.notes
      })
      showToast({ message: empForm.id ? 'Employee updated' : 'Employee created', type: 'success' })
      const emps = await fetchEmployees()
      setEmployees(emps as Employee[])
      resetEmpForm()
    } catch (err) {
      console.error(err)
      setError('Failed to save employee.')
    } finally {
      setSavingEmp(false)
    }
  }

  function handleEditEmployee(emp: Employee) {
    setEmpForm({
      id: emp.id,
      fullName: emp.fullName || '',
      phone: emp.phone || '',
      email: emp.email || '',
      brandIds: emp.brandIds || [],
      primaryBrandId: emp.primaryBrandId || '',
      roleTitle: emp.roleTitle || '',
      payType: emp.payType || 'monthly',
      baseSalaryMonthly: emp.baseSalaryMonthly?.toString() || '',
      hourlyRate: emp.hourlyRate?.toString() || '',
      perTaskRate: emp.perTaskRate?.toString() || '',
      currency: emp.currency || 'PKR',
      isActive: emp.isActive !== false,
      joinDate: toDateInput(emp.joinDate),
      endDate: toDateInput(emp.endDate),
      notes: emp.notes || ''
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDeleteEmployee() {
    if (!deleteTarget) return
    try {
      await deleteEmployee(deleteTarget.id)
      setEmployees(prev => prev.filter(e => e.id !== deleteTarget.id))
      showToast({ message: 'Employee deleted', type: 'success' })
      setDeleteTarget(null)
    } catch (err) {
      console.error(err)
      showToast({ message: 'Failed to delete employee', type: 'error' })
    }
  }

  function openEmployeeDetails(emp: Employee) {
    setSelectedEmployeeId(emp.id)
    setSalaryForm(f => ({ ...f, currency: emp.currency || 'PKR' }))
    Promise.all([
      loadAttendance(emp.id),
      loadWorkLogs(emp.id),
      loadSalaries(emp.id),
      loadLoans(emp.id)
    ])
    setTab('attendance')
  }

  // ============================================================================
  // Attendance
  // ============================================================================

  const filteredAttendance = useMemo(() => {
    if (!selectedEmployeeId || !attMonth) return []
    const [y, m] = attMonth.split('-').map(Number)
    return attendance.filter(a => {
      if (a.employeeId !== selectedEmployeeId) return false
      const d = toDate(a.date)
      if (!d) return false
      return d.getFullYear() === y && d.getMonth() + 1 === m
    })
  }, [attendance, selectedEmployeeId, attMonth])

  const attendanceTotals = useMemo(() => {
    const present = filteredAttendance.filter(r => r.status === 'present').length
    const leave = filteredAttendance.filter(r => r.status === 'leave').length
    const hours = filteredAttendance
      .filter(r => r.status === 'present')
      .reduce((s, r) => s + (r.hoursWorked || 0), 0)
    return { present, leave, hours }
  }, [filteredAttendance])

  async function handleSaveAttendance(dateStr: string, data: Partial<TimeEntry>) {
    if (!selectedEmployeeId) return
    const isLeave = !!data.leaveType && data.leaveType !== 'none'
    const hasIn = !!data.timeIn
    const hasOut = !!data.timeOut

    let status: 'present' | 'leave' | 'absent' = 'absent'
    if (isLeave) status = 'leave'
    else if (hasIn || hasOut) status = 'present'

    let hoursWorked: number | null = null
    if (!isLeave && hasIn && hasOut) {
      hoursWorked = diffHours(data.timeIn!, data.timeOut!)
    }

    try {
      await saveTimeEntry({
        employeeId: selectedEmployeeId,
        date: new Date(dateStr).getTime(),
        status,
        hoursWorked,
        timeIn: isLeave ? '' : (data.timeIn || ''),
        timeOut: isLeave ? '' : (data.timeOut || ''),
        leaveType: isLeave ? data.leaveType : null
      }, `${selectedEmployeeId}_${dateStr}`)
      await loadAttendance(selectedEmployeeId)
    } catch (err) {
      console.error(err)
      showToast({ message: 'Failed to save attendance', type: 'error' })
    }
  }

  // ============================================================================
  // Work Logs
  // ============================================================================

  const filteredWorkLogs = useMemo(() => {
    if (!selectedEmployeeId || !workMonth) return []
    const [y, m] = workMonth.split('-').map(Number)
    return workLogs.filter(w => {
      if (w.employeeId !== selectedEmployeeId) return false
      const d = toDate(w.date)
      if (!d) return false
      const okMonth = d.getFullYear() === y && d.getMonth() + 1 === m
      const okBrand = !workBrandFilter || w.brandId === workBrandFilter
      return okMonth && okBrand
    })
  }, [workLogs, selectedEmployeeId, workMonth, workBrandFilter])

  const workTotals = useMemo(() => {
    return {
      tasks: filteredWorkLogs.reduce((s, r) => s + (r.quantity || 0), 0)
    }
  }, [filteredWorkLogs])

  async function handleSaveWork() {
    if (!selectedEmployeeId || !workForm.date) {
      setError('Employee and date required.')
      return
    }
    try {
      await saveWorkEntry({
        employeeId: selectedEmployeeId,
        brandId: workForm.brandId,
        date: new Date(workForm.date).getTime(),
        description: workForm.description,
        hours: workForm.hours ? Number(workForm.hours) : null,
        quantity: workForm.quantity ? Number(workForm.quantity) : null,
        unit: workForm.unit,
        batchCode: workForm.batchCode
      })
      showToast({ message: 'Work entry saved', type: 'success' })
      await loadWorkLogs(selectedEmployeeId)
      setWorkForm({
        date: '',
        brandId: '',
        description: '',
        hours: '',
        quantity: '',
        unit: '',
        batchCode: ''
      })
    } catch (err) {
      console.error(err)
      showToast({ message: 'Failed to save work entry', type: 'error' })
    }
  }

  // ============================================================================
  // Salary
  // ============================================================================

  const salaryPreview = useMemo(() => {
    if (!selectedEmployee) return { gross: 0, net: 0 }
    let gross = 0
    if (selectedEmployee.payType === 'monthly') {
      gross = selectedEmployee.baseSalaryMonthly || 0
    } else if (selectedEmployee.payType === 'hourly') {
      gross = (selectedEmployee.hourlyRate || 0) * attendanceTotals.hours
    } else if (selectedEmployee.payType === 'perTask') {
      gross = (selectedEmployee.perTaskRate || 0) * workTotals.tasks
    }
    const deductions = Number(salaryForm.deductions) || 0
    const loanDeduction = Number(salaryForm.loanDeduction) || 0
    const net = Math.max(0, gross - deductions - loanDeduction)
    return { gross, net }
  }, [selectedEmployee, attendanceTotals, workTotals, salaryForm])

  const loanBalance = useMemo(() => {
    return loans.reduce((sum, l) => sum + (l.amount || 0), 0)
  }, [loans])

  async function handleSaveSalary(lock: boolean = false) {
    if (!selectedEmployeeId || !salaryForm.month) {
      setError('Employee and month required.')
      return
    }
    const [yStr, mStr] = salaryForm.month.split('-')
    const year = Number(yStr) || 0
    const month = Number(mStr) || 0

    try {
      await saveSalarySheet({
        employeeId: selectedEmployeeId,
        year,
        month,
        totalDaysPresent: attendanceTotals.present,
        totalDaysLeave: attendanceTotals.leave,
        totalHoursWorked: attendanceTotals.hours,
        totalTasks: workTotals.tasks,
        baseSalary: salaryPreview.gross,
        totalLoanDeduction: Number(salaryForm.loanDeduction) || 0,
        otherDeductions: Number(salaryForm.deductions) || 0,
        netPayable: salaryPreview.net,
        currency: salaryForm.currency,
        notes: salaryForm.notes,
        locked: lock
      })

      showToast({ message: 'Salary sheet saved', type: 'success' })
      await Promise.all([loadSalaries(selectedEmployeeId), loadLoans(selectedEmployeeId)])
      setSalaryForm(f => ({ ...f, month: '', deductions: '', loanDeduction: '', notes: '' }))
    } catch (err) {
      console.error(err)
      showToast({ message: 'Failed to save salary', type: 'error' })
    }
  }

  // ============================================================================
  // Loans
  // ============================================================================

  async function handleSaveLoan() {
    if (!selectedEmployeeId || !loanForm.amount) {
      setError('Employee and amount required.')
      return
    }
    const amt = Math.abs(Number(loanForm.amount)) * (loanForm.direction === 'repay' ? -1 : 1)

    if (amt > 0 && loanForm.direction === 'borrow') {
      if (expenseBooks.length === 0) {
        setError('No open expense books available.')
        return
      }
      setLoanDialog({
        isOpen: true,
        employee: selectedEmployee,
        amount: amt.toString(),
        note: loanForm.note,
        bookId: expenseBooks[0]?.id || '',
        givenFrom: ''
      })
      return
    }

    try {
      await saveLoan({
        employeeId: selectedEmployeeId,
        amount: amt,
        date: loanForm.date ? new Date(loanForm.date).getTime() : Date.now(),
        description: loanForm.note
      })
      showToast({ message: 'Loan/repayment saved', type: 'success' })
      await loadLoans(selectedEmployeeId)
      setLoanForm({ amount: '', direction: 'borrow', date: '', note: '' })
    } catch (err) {
      console.error(err)
      showToast({ message: 'Failed to save loan', type: 'error' })
    }
  }

  async function handleConfirmLoanExpense() {
    const { employee, amount, note, bookId, givenFrom } = loanDialog
    if (!employee || !bookId || !givenFrom || Number(amount) <= 0) {
      setError('Book, given from, and amount are required.')
      return
    }

    try {
      await saveLoanWithExpense({
        employeeId: employee.id,
        amount: Number(amount),
        note,
        bookId,
        givenFrom
      })
      showToast({ message: 'Loan and expense recorded', type: 'success' })
      await loadLoans(employee.id)
      setLoanDialog({ isOpen: false, employee: null, amount: '', note: '', bookId: '', givenFrom: '' })
      setLoanForm({ amount: '', direction: 'borrow', date: '', note: '' })
    } catch (err) {
      console.error(err)
      showToast({ message: 'Failed to save loan & expense', type: 'error' })
    }
  }

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Employees</h1>
        <p className="text-zinc-600">
          Manage employees, attendance, work logs, and payroll
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-100 text-rose-800 border border-rose-200">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'employees', label: 'Manage Employees' },
          { value: 'attendance', label: 'Time & Attendance' },
          { value: 'work', label: 'Work Log' },
          { value: 'salary', label: 'Salary' }
        ]}
      />

      {/* ============== MANAGE EMPLOYEES TAB ============== */}
      {tab === 'employees' && (
        <>
          <Card
            title={empForm.id ? 'Edit Employee' : 'Add Employee'}
            actions={
              <div className="flex gap-2">
                {empForm.id && <Button variant="ghost" onClick={resetEmpForm}>Cancel</Button>}
                <Button onClick={handleSaveEmployee} loading={savingEmp}>
                  {savingEmp ? 'Saving...' : 'Save'}
                </Button>
              </div>
            }
          >
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <Label>Full Name *</Label>
                  <Input
                    value={empForm.fullName}
                    onChange={e => setEmpForm({ ...empForm, fullName: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={empForm.phone}
                      onChange={e => setEmpForm({ ...empForm, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      value={empForm.email}
                      onChange={e => setEmpForm({ ...empForm, email: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Role / Title</Label>
                  <Input
                    value={empForm.roleTitle}
                    onChange={e => setEmpForm({ ...empForm, roleTitle: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Join Date</Label>
                    <Input
                      type="date"
                      value={empForm.joinDate}
                      onChange={e => setEmpForm({ ...empForm, joinDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={empForm.endDate}
                      onChange={e => setEmpForm({ ...empForm, endDate: e.target.value })}
                    />
                  </div>
                </div>
                <Checkbox
                  id="empActive"
                  label="Active"
                  checked={empForm.isActive}
                  onChange={e => setEmpForm({ ...empForm, isActive: e.target.checked })}
                />
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Brand Assignments</Label>
                  <MultiCheck
                    options={brands}
                    value={empForm.brandIds}
                    onChange={ids => setEmpForm({ ...empForm, brandIds: ids })}
                  />
                </div>
                <div>
                  <Label>Primary Brand</Label>
                  <Select
                    value={empForm.primaryBrandId}
                    onChange={e => setEmpForm({ ...empForm, primaryBrandId: e.target.value })}
                  >
                    <option value="">— Select —</option>
                    {empForm.brandIds.map(id => (
                      <option key={id} value={id}>{brandMap[id]?.name || id}</option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Pay Type</Label>
                    <Select
                      value={empForm.payType}
                      onChange={e => setEmpForm({ ...empForm, payType: e.target.value as 'monthly' | 'hourly' | 'perTask' })}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="hourly">Hourly</option>
                      <option value="perTask">Per Task</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Select
                      value={empForm.currency}
                      onChange={e => setEmpForm({ ...empForm, currency: e.target.value })}
                    >
                      <option value="PKR">PKR</option>
                      <option value="CAD">CAD</option>
                      <option value="USD">USD</option>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Monthly Salary</Label>
                    <NumberInput
                      value={empForm.baseSalaryMonthly}
                      onChange={e => setEmpForm({ ...empForm, baseSalaryMonthly: e.target.value })}
                      disabled={empForm.payType !== 'monthly'}
                    />
                  </div>
                  <div>
                    <Label>Hourly Rate</Label>
                    <NumberInput
                      value={empForm.hourlyRate}
                      onChange={e => setEmpForm({ ...empForm, hourlyRate: e.target.value })}
                      disabled={empForm.payType !== 'hourly'}
                    />
                  </div>
                  <div>
                    <Label>Per Task Rate</Label>
                    <NumberInput
                      value={empForm.perTaskRate}
                      onChange={e => setEmpForm({ ...empForm, perTaskRate: e.target.value })}
                      disabled={empForm.payType !== 'perTask'}
                    />
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <TextArea
                    rows={2}
                    value={empForm.notes}
                    onChange={e => setEmpForm({ ...empForm, notes: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card title="Employee Directory">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Primary Brand</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Pay Type</TableHead>
                  <TableHead>Base/Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.length === 0 ? (
                  <TableEmpty colSpan={7} message="No employees yet." />
                ) : (
                  employees.map(emp => {
                    const primaryName = emp.primaryBrandId ? (brandMap[emp.primaryBrandId]?.name || emp.primaryBrandId) : '—'
                    const baseRate = emp.payType === 'monthly'
                      ? `${emp.baseSalaryMonthly || 0} ${emp.currency}`
                      : emp.payType === 'hourly'
                      ? `${emp.hourlyRate || 0}/hr`
                      : `${emp.perTaskRate || 0}/task`
                    return (
                      <TableRow key={emp.id} clickable onClick={() => openEmployeeDetails(emp)}>
                        <TableCell className="font-medium">{emp.fullName}</TableCell>
                        <TableCell className="text-xs">{primaryName}</TableCell>
                        <TableCell>{emp.roleTitle || '—'}</TableCell>
                        <TableCell className="text-xs">{PAY_LABELS[emp.payType]}</TableCell>
                        <TableCell className="text-xs">{baseRate}</TableCell>
                        <TableCell>
                          {emp.isActive !== false ? (
                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs">Active</span>
                          ) : (
                            <span className="px-2 py-1 bg-zinc-100 text-zinc-600 rounded-full text-xs">Inactive</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleEditEmployee(emp)
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation()
                                setDeleteTarget(emp)
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
        </>
      )}

      {/* ============== ATTENDANCE TAB ============== */}
      {tab === 'attendance' && (
        <Card title="Time & Attendance">
          <div className="grid md:grid-cols-3 gap-3 mb-4">
            <div>
              <Label>Employee</Label>
              <Select
                value={selectedEmployeeId}
                onChange={e => {
                  setSelectedEmployeeId(e.target.value)
                  if (e.target.value) loadAttendance(e.target.value)
                }}
              >
                <option value="">— Select —</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Month</Label>
              <Input
                type="month"
                value={attMonth}
                onChange={e => setAttMonth(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button variant="subtle" onClick={() => selectedEmployeeId && loadAttendance(selectedEmployeeId)}>
                Refresh
              </Button>
            </div>
          </div>

          {selectedEmployeeId && attMonth && (
            <>
              <div className="mb-4 p-3 rounded border border-zinc-200 bg-zinc-50 text-sm">
                Totals — Present: {attendanceTotals.present} | Leave: {attendanceTotals.leave} | Hours: {attendanceTotals.hours.toFixed(2)}
              </div>
              <div className="overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>In</TableHead>
                      <TableHead>Out</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Leave</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const [y, m] = attMonth.split('-').map(Number)
                      const days = daysInMonth(y, m)
                      const rows = []
                      for (let d = 1; d <= days; d++) {
                        const dateStr = `${attMonth}-${String(d).padStart(2, '0')}`
                        const existing = filteredAttendance.find(a => {
                          const dt = toDate(a.date)
                          return dt?.toISOString().slice(0, 10) === dateStr
                        })
                        rows.push(
                          <TableRow key={dateStr}>
                            <TableCell className="text-sm">{dateStr}</TableCell>
                            <TableCell className="text-sm">{existing?.status || 'absent'}</TableCell>
                            <TableCell>
                              <Input
                                type="time"
                                className="w-24"
                                defaultValue={existing?.timeIn || ''}
                                onBlur={e => {
                                  if (e.target.value !== (existing?.timeIn || '')) {
                                    handleSaveAttendance(dateStr, { ...existing, timeIn: e.target.value })
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="time"
                                className="w-24"
                                defaultValue={existing?.timeOut || ''}
                                onBlur={e => {
                                  if (e.target.value !== (existing?.timeOut || '')) {
                                    handleSaveAttendance(dateStr, { ...existing, timeOut: e.target.value })
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell className="text-sm">{existing?.hoursWorked?.toFixed(2) || '—'}</TableCell>
                            <TableCell>
                              <Select
                                className="w-24"
                                value={existing?.leaveType || ''}
                                onChange={e => handleSaveAttendance(dateStr, { ...existing, leaveType: e.target.value })}
                              >
                                <option value="">—</option>
                                <option value="sick">Sick</option>
                                <option value="casual">Casual</option>
                                <option value="annual">Annual</option>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSaveAttendance(dateStr, { leaveType: 'sick' })}
                              >
                                Mark Leave
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      }
                      return rows
                    })()}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </Card>
      )}

      {/* ============== WORK LOG TAB ============== */}
      {tab === 'work' && (
        <>
          <Card
            title="Work Log"
            actions={<Button onClick={handleSaveWork}>Save Work</Button>}
          >
            <div className="grid md:grid-cols-4 gap-3 mb-4">
              <div>
                <Label>Employee</Label>
                <Select
                  value={selectedEmployeeId}
                  onChange={e => {
                    setSelectedEmployeeId(e.target.value)
                    if (e.target.value) loadWorkLogs(e.target.value)
                  }}
                >
                  <option value="">— Select —</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.fullName}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Month</Label>
                <Input
                  type="month"
                  value={workMonth}
                  onChange={e => setWorkMonth(e.target.value)}
                />
              </div>
              <div>
                <Label>Brand Filter</Label>
                <Select value={workBrandFilter} onChange={e => setWorkBrandFilter(e.target.value)}>
                  <option value="">— All —</option>
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="subtle" onClick={() => selectedEmployeeId && loadWorkLogs(selectedEmployeeId)}>
                  Refresh
                </Button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={workForm.date}
                  onChange={e => setWorkForm({ ...workForm, date: e.target.value })}
                />
              </div>
              <div>
                <Label>Brand</Label>
                <Select
                  value={workForm.brandId}
                  onChange={e => setWorkForm({ ...workForm, brandId: e.target.value })}
                >
                  <option value="">— Select —</option>
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Hours</Label>
                <NumberInput
                  value={workForm.hours}
                  onChange={e => setWorkForm({ ...workForm, hours: e.target.value })}
                />
              </div>
              <div className="md:col-span-3">
                <Label>Description / Task</Label>
                <TextArea
                  rows={2}
                  value={workForm.description}
                  onChange={e => setWorkForm({ ...workForm, description: e.target.value })}
                />
              </div>
              <div>
                <Label>Quantity</Label>
                <NumberInput
                  value={workForm.quantity}
                  onChange={e => setWorkForm({ ...workForm, quantity: e.target.value })}
                />
              </div>
              <div>
                <Label>Unit</Label>
                <Input
                  value={workForm.unit}
                  onChange={e => setWorkForm({ ...workForm, unit: e.target.value })}
                  placeholder="bottles, boxes, pcs"
                />
              </div>
              <div>
                <Label>Batch / Ref</Label>
                <Input
                  value={workForm.batchCode}
                  onChange={e => setWorkForm({ ...workForm, batchCode: e.target.value })}
                />
              </div>
            </div>
          </Card>

          <Card title="Work Entries">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWorkLogs.length === 0 ? (
                  <TableEmpty colSpan={6} message="No work logs." />
                ) : (
                  filteredWorkLogs.map(w => (
                    <TableRow key={w.id}>
                      <TableCell>{formatDateDisplay(w.date)}</TableCell>
                      <TableCell>{brandMap[w.brandId || '']?.name || '—'}</TableCell>
                      <TableCell>{w.description || '—'}</TableCell>
                      <TableCell>{w.hours || '—'}</TableCell>
                      <TableCell>{w.quantity || '—'}</TableCell>
                      <TableCell>{w.unit || '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {/* ============== SALARY TAB ============== */}
      {tab === 'salary' && (
        <>
          <Card
            title="Salary & Payroll"
            actions={
              <div className="flex gap-2">
                <Button onClick={() => handleSaveSalary(false)}>Generate Salary Sheet</Button>
                <Button variant="subtle" onClick={() => handleSaveSalary(true)}>Generate & Lock</Button>
              </div>
            }
          >
            <div className="grid md:grid-cols-3 gap-3 mb-4">
              <div>
                <Label>Employee</Label>
                <Select
                  value={selectedEmployeeId}
                  onChange={e => {
                    const id = e.target.value
                    setSelectedEmployeeId(id)
                    const emp = employees.find(x => x.id === id)
                    setSalaryForm(f => ({ ...f, currency: emp?.currency || 'PKR' }))
                    if (id) {
                      Promise.all([loadSalaries(id), loadLoans(id), loadAttendance(id), loadWorkLogs(id)])
                    }
                  }}
                >
                  <option value="">— Select —</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.fullName}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Month</Label>
                <Input
                  type="month"
                  value={salaryForm.month}
                  onChange={e => {
                    setSalaryForm({ ...salaryForm, month: e.target.value })
                    setAttMonth(e.target.value)
                    setWorkMonth(e.target.value)
                  }}
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Input
                  value={salaryForm.currency}
                  onChange={e => setSalaryForm({ ...salaryForm, currency: e.target.value })}
                />
              </div>
              <div>
                <Label>Other Deductions</Label>
                <NumberInput
                  value={salaryForm.deductions}
                  onChange={e => setSalaryForm({ ...salaryForm, deductions: e.target.value })}
                />
              </div>
              <div>
                <Label>Loan Deduction</Label>
                <NumberInput
                  value={salaryForm.loanDeduction}
                  onChange={e => setSalaryForm({ ...salaryForm, loanDeduction: e.target.value })}
                />
              </div>
              <div>
                <Label>Notes</Label>
                <TextArea
                  rows={2}
                  value={salaryForm.notes}
                  onChange={e => setSalaryForm({ ...salaryForm, notes: e.target.value })}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded border border-zinc-200">
                Attendance — Present: {attendanceTotals.present}, Leave: {attendanceTotals.leave}, Hours: {attendanceTotals.hours.toFixed(2)}
              </div>
              <div className="p-3 rounded border border-zinc-200">
                Work — Total Tasks: {workTotals.tasks}
              </div>
              <div className="p-3 rounded border border-zinc-200">
                Base Salary: <strong>{salaryPreview.gross.toFixed(2)}</strong>
              </div>
              <div className="p-3 rounded border border-zinc-200">
                Net Payable: <strong>{salaryPreview.net.toFixed(2)}</strong>
              </div>
              <div className="p-3 rounded border border-zinc-200">
                Outstanding Loan: <strong>{loanBalance.toFixed(2)}</strong>
              </div>
            </div>

            {/* Loan Form */}
            <div className="mt-4 p-4 border border-zinc-200 rounded-lg bg-zinc-50">
              <h4 className="font-medium mb-3">Add Loan / Repayment</h4>
              <div className="grid md:grid-cols-4 gap-3">
                <NumberInput
                  placeholder="Amount"
                  value={loanForm.amount}
                  onChange={e => setLoanForm({ ...loanForm, amount: e.target.value })}
                />
                <Select
                  value={loanForm.direction}
                  onChange={e => setLoanForm({ ...loanForm, direction: e.target.value as 'borrow' | 'repay' })}
                >
                  <option value="borrow">Loan / Advance</option>
                  <option value="repay">Repay</option>
                </Select>
                <Input
                  type="date"
                  value={loanForm.date}
                  onChange={e => setLoanForm({ ...loanForm, date: e.target.value })}
                />
                <Input
                  placeholder="Description"
                  value={loanForm.note}
                  onChange={e => setLoanForm({ ...loanForm, note: e.target.value })}
                />
              </div>
              <div className="mt-3">
                <Button onClick={handleSaveLoan}>Save Loan/Repay</Button>
              </div>
            </div>
          </Card>

          <Card title="Salary Sheets">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>Loan Ded.</TableHead>
                  <TableHead>Net Payable</TableHead>
                  <TableHead>Locked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salaries.length === 0 ? (
                  <TableEmpty colSpan={6} message="No salary records." />
                ) : (
                  salaries.map(s => (
                    <TableRow key={s.id}>
                      <TableCell>{`${s.year}-${String(s.month).padStart(2, '0')}`}</TableCell>
                      <TableCell>{employees.find(e => e.id === s.employeeId)?.fullName || s.employeeId}</TableCell>
                      <TableCell>{s.baseSalary}</TableCell>
                      <TableCell>{s.totalLoanDeduction}</TableCell>
                      <TableCell>{s.netPayable}</TableCell>
                      <TableCell>{s.locked ? 'Yes' : 'No'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteEmployee}
        title="Delete Employee?"
        description={`Are you sure you want to delete "${deleteTarget?.fullName}"?`}
        confirmLabel="Delete"
        variant="danger"
      />

      {/* Loan Expense Dialog */}
      {loanDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-auto bg-black/50 px-2 py-2 sm:items-center sm:px-4 sm:py-6">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Record Loan Expense</h3>
              <Button variant="ghost" onClick={() => setLoanDialog(d => ({ ...d, isOpen: false }))}>
                Close
              </Button>
            </div>
            <div className="space-y-3 text-sm">
              <div><span className="font-medium">Employee:</span> {loanDialog.employee?.fullName}</div>
              <div>
                <Label>Amount</Label>
                <NumberInput
                  value={loanDialog.amount}
                  onChange={e => setLoanDialog(d => ({ ...d, amount: e.target.value }))}
                />
              </div>
              <div>
                <Label>Note</Label>
                <TextArea
                  rows={2}
                  value={loanDialog.note}
                  onChange={e => setLoanDialog(d => ({ ...d, note: e.target.value }))}
                />
              </div>
              <div>
                <Label>Expense Book</Label>
                <Select
                  value={loanDialog.bookId}
                  onChange={e => setLoanDialog(d => ({ ...d, bookId: e.target.value }))}
                >
                  <option value="">Select expense book</option>
                  {expenseBooks.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Given from</Label>
                <Input
                  value={loanDialog.givenFrom}
                  onChange={e => setLoanDialog(d => ({ ...d, givenFrom: e.target.value }))}
                  placeholder="Cash box / Bank / Safe"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setLoanDialog(d => ({ ...d, isOpen: false }))}>
                Cancel
              </Button>
              <Button onClick={handleConfirmLoanExpense}>Save Loan & Expense</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
