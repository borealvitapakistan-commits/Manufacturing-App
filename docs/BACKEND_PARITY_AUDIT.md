# Django Backend Parity Audit

The old Next.js application remains the behavior reference. Django does not use
the ORM; all persistence goes through the existing Supabase schema and RPCs.

## Entity coverage

| Supabase entity | Django owner | Important relationships and behavior |
|---|---|---|
| `brands` | `BrandService` | Required name/prefix, active state, logo/address identity, delete protection |
| `raw_materials` | `RawMaterialService` | Stock aliases, nonnegative stock, search, low stock, set/adjust stock, code lookup |
| `products` | `ProductService` | Canonical RM links, label-claim parsing, NPN, formula lookup, delete protection |
| `vendors` | `VendorService` | Soft delete, numeric PO prefix, categories, contact fields |
| `batches` | `BatchService` | Brand/product snapshots, code generation, unit totals, inventory RPC reservation |
| `mixing_reports` | `MixingService` | Stage guard, scale formula validation, inventory RPC, update/restore |
| `njp_reports` | `NJPService` | Mixing prerequisite, yield, C-to-F, load averages, FG capsule transition |
| `assembly_reports` | `AssemblyService` | Mixing/NJP prerequisites, aliases, final quantities, FG bottle transition |
| `employees` | `EmployeeService` | Brand references, pay type/rates, active state |
| `time_entries` | `TimeEntryService` | Employee/date upsert, status and worked-hours derivation |
| `work_entries` | `WorkEntryService` | Employee/brand links and work quantities |
| `salary_sheets` | `SalarySheetService` | Server-calculated payroll, period uniqueness, locks, loan deduction |
| `employee_loans` | `EmployeeLoanService` | Employee/salary links and loan-with-expense RPC |
| `expense_books` | `ExpenseBookService` | Opening balance, closing modes, pending carry, transfer and reopen |
| `expenses` | `ExpenseService` | Open-book enforcement, debit/credit ledger and validation |
| `label_inventory` | `LabelService` | Brand/product links, ordered inventory, aggregate availability |
| `finished_goods` | `FinishedGoodsService` | Batch/brand/product links and powder/capsule/bottle transitions |
| `finished_goods_history` | `FinishedGoodsHistoryService` | Manual and automatic change history |
| `purchase_orders` | `PurchaseOrderService` | Vendor/item links, totals, receipt posting and inventory updates |
| `company_settings` | `CompanySettingsService` | Single buyer/ship-to identity used by formal POs |
| `po_documents` | `PODocumentService` | Vendor/brand header and generated PO number |
| `po_document_items` | `PODocumentItemService` | Parent document lines and calculated total price |

## Server-owned formulas

- Label claims accept mg, g, mcg, µg and ug.
- Batch RM requirement: `total units * mg per unit / 1,000,000`.
- Mixing: `new mix = total formula - existing mixed powder`; each formula row
  is scaled by `new mix / total formula`.
- NJP yield: `(filled - rejected) / filled * 100`.
- NJP Fahrenheit: `C * 9 / 5 + 32`.
- NJP load average is recalculated from W1-W5.
- Payroll is calculated from monthly, hourly or per-task employee rules.
- Expense balance is `opening + credits - debits`; close/carry rules match the
  legacy expense book.
- PO total is `quantity * unit price`.
- Batch pricing includes RM, capsule, bottle, lid, label, labour, cost per
  bottle and optional CAD conversion.

## Runtime verification

- All 16 migration files match the old project byte-for-byte.
- All 22 tables are readable from the configured Supabase project.
- Live relationship audit found zero orphaned references.
- The frontend uses Django only; no Supabase browser client remains.
- Development startup is available through `start-dev.ps1`.
