# Django Backend Parity Audit

The old Next.js application remains the behavior reference. Django does not use
the ORM; all persistence now goes through the Supabase `migrations-2` schema,
tables, views, and RPCs.

## Entity coverage

| Supabase entity | Django owner | Important relationships and behavior |
|---|---|---|
| `brands` | `BrandService` | Required name/prefix, active state, logo/address identity, delete protection |
| `raw_materials` / `inventory_items` | `RawMaterialService` | Stock aliases, nonnegative stock, search, low stock, set/adjust stock, code lookup |
| `products` | `ProductService` | Canonical RM links, label-claim parsing, NPN, formula lookup, delete protection |
| `product_formula_items` | `ProductService` | Product raw-material formulas and label claims |
| `mixings` | `MixingService` | Brand/product links, mixed powder inventory, fresh-mix scaling, reusable powder lots |
| `njp_runs` | `NJPService` | Mixing prerequisite, available-powder deduction, capsule yield, capsule output lots |
| `assemblies` | `AssemblyService` | Brand/product/NJP filtering, brand-prefix Batch Code generation, bottle totals, finished goods lots |
| `label_specs` | `LabelService` | Brand/product links, ordered inventory, aggregate availability |
| `packaging_items` | `BottleLidService` | Capsule/Jar bottle inventory and per-size validation |
| reporting views | Finished Goods and Reports APIs | Powder, capsule, bottle, and traceability views from manufacturing outputs |

## Server-owned formulas

- Label claims accept mg, g, mcg, µg and ug.
- Product price RM requirement: `total units * mg per unit / 1,000,000`.
- Mixing: `new mix = total formula - existing mixed powder`; each formula row
  is scaled by `new mix / total formula`.
- NJP yield: `(filled - rejected) / filled * 100`.
- NJP Fahrenheit: `C * 9 / 5 + 32`.
- NJP load average is recalculated from W1-W5.
- Payroll is calculated from monthly, hourly or per-task employee rules.
- Expense balance is `opening + credits - debits`; close/carry rules match the
  legacy expense book.
- PO total is `quantity * unit price`.
- Product Price Calculator includes RM, capsule, bottle, lid, label, labour, cost per
  bottle and optional CAD conversion.

## Runtime verification

- `supabase/migrations-2/` is the active database schema source.
- Core Supabase tables and reporting views are readable from the configured project.
- The backend uses Supabase only; the temporary local JSON service layer has been removed.
- The frontend uses Django only; no Supabase browser client remains.
- Development startup is available through `start-dev.ps1`.
