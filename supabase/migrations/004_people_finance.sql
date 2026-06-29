-- ============================================================================
-- 004_people_finance.sql
-- HR, payroll, expense books, and expense ledger.
-- ============================================================================

CREATE TABLE IF NOT EXISTS employees (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           text NOT NULL,
  phone               text,
  email               text,
  brand_ids           uuid[] NOT NULL DEFAULT '{}',
  primary_brand_id    uuid REFERENCES brands(id) ON UPDATE CASCADE ON DELETE SET NULL,
  role_title          text,
  is_active           boolean NOT NULL DEFAULT true,
  pay_type            pay_type NOT NULL DEFAULT 'monthly',
  base_salary_monthly numeric(12,2),
  hourly_rate         numeric(10,2),
  per_task_rate       numeric(10,2),
  currency            text NOT NULL DEFAULT 'PKR',
  join_date           bigint,
  end_date            bigint,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employees_full_name_not_blank CHECK (length(btrim(full_name)) > 0),
  CONSTRAINT employees_base_salary_nonnegative CHECK (base_salary_monthly IS NULL OR base_salary_monthly >= 0),
  CONSTRAINT employees_hourly_rate_nonnegative CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
  CONSTRAINT employees_per_task_rate_nonnegative CHECK (per_task_rate IS NULL OR per_task_rate >= 0)
);

CREATE TABLE IF NOT EXISTS time_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES employees(id) ON UPDATE CASCADE ON DELETE CASCADE,
  date         bigint,
  status       text NOT NULL DEFAULT 'absent',
  time_in      text,
  time_out     text,
  hours_worked numeric(8,2),
  leave_type   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_entries_status_valid CHECK (status IN ('present', 'leave', 'absent')),
  CONSTRAINT time_entries_hours_nonnegative CHECK (hours_worked IS NULL OR hours_worked >= 0)
);

CREATE TABLE IF NOT EXISTS work_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON UPDATE CASCADE ON DELETE CASCADE,
  brand_id    uuid REFERENCES brands(id) ON UPDATE CASCADE ON DELETE SET NULL,
  date        bigint,
  description text,
  hours       numeric(8,2),
  quantity    numeric(10,2),
  unit        text,
  batch_code  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_entries_hours_nonnegative CHECK (hours IS NULL OR hours >= 0),
  CONSTRAINT work_entries_quantity_nonnegative CHECK (quantity IS NULL OR quantity >= 0)
);

CREATE TABLE IF NOT EXISTS salary_sheets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id          uuid NOT NULL REFERENCES employees(id) ON UPDATE CASCADE ON DELETE CASCADE,
  year                 integer NOT NULL,
  month                integer NOT NULL,
  total_days_present   numeric(5,1) NOT NULL DEFAULT 0,
  total_days_leave     numeric(5,1) NOT NULL DEFAULT 0,
  total_hours_worked   numeric(8,2) NOT NULL DEFAULT 0,
  total_tasks          numeric(8,2),
  base_salary          numeric(12,2) NOT NULL DEFAULT 0,
  overtime_pay         numeric(12,2),
  bonus                numeric(12,2),
  total_loan_deduction numeric(12,2) NOT NULL DEFAULT 0,
  other_deductions     numeric(12,2) NOT NULL DEFAULT 0,
  net_payable          numeric(12,2) NOT NULL DEFAULT 0,
  currency             text NOT NULL DEFAULT 'PKR',
  notes                text,
  locked               boolean NOT NULL DEFAULT false,
  generated_at         timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salary_sheets_year_valid CHECK (year BETWEEN 2000 AND 2100),
  CONSTRAINT salary_sheets_month_valid CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT salary_sheets_days_present_nonnegative CHECK (total_days_present >= 0),
  CONSTRAINT salary_sheets_days_leave_nonnegative CHECK (total_days_leave >= 0),
  CONSTRAINT salary_sheets_hours_nonnegative CHECK (total_hours_worked >= 0),
  CONSTRAINT salary_sheets_tasks_nonnegative CHECK (total_tasks IS NULL OR total_tasks >= 0),
  CONSTRAINT salary_sheets_base_salary_nonnegative CHECK (base_salary >= 0),
  CONSTRAINT salary_sheets_overtime_nonnegative CHECK (overtime_pay IS NULL OR overtime_pay >= 0),
  CONSTRAINT salary_sheets_bonus_nonnegative CHECK (bonus IS NULL OR bonus >= 0),
  CONSTRAINT salary_sheets_loan_deduction_nonnegative CHECK (total_loan_deduction >= 0),
  CONSTRAINT salary_sheets_other_deductions_nonnegative CHECK (other_deductions >= 0)
);

CREATE TABLE IF NOT EXISTS employee_loans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES employees(id) ON UPDATE CASCADE ON DELETE CASCADE,
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  date            bigint,
  description     text,
  salary_sheet_id uuid REFERENCES salary_sheets(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_books (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  description             text,
  currency                text NOT NULL DEFAULT 'PKR',
  opening_balance_current numeric(14,4) NOT NULL DEFAULT 0,
  opening_adjustments     jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags                    text[] NOT NULL DEFAULT '{}',
  status                  text NOT NULL DEFAULT 'open',
  is_active               boolean NOT NULL DEFAULT true,
  has_pending_carry       boolean NOT NULL DEFAULT false,
  pending_carry_amount    numeric(14,4) NOT NULL DEFAULT 0,
  carried_to_book_id      uuid REFERENCES expense_books(id) ON UPDATE CASCADE ON DELETE SET NULL,
  closed_at               timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_books_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT expense_books_opening_adjustments_is_array CHECK (jsonb_typeof(opening_adjustments) = 'array'),
  CONSTRAINT expense_books_status_valid CHECK (status IN ('open', 'closed'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id     uuid NOT NULL REFERENCES expense_books(id) ON UPDATE CASCADE ON DELETE CASCADE,
  date        bigint,
  description text,
  given_from  text,
  given_to    text,
  amount      numeric(12,2) NOT NULL DEFAULT 0,
  direction   expense_direction NOT NULL DEFAULT 'debit',
  type        text,
  tags        text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_amount_nonnegative CHECK (amount >= 0)
);
