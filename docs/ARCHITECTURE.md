# Django migration architecture

## Backend rule

There are no Django model classes and no Django database migrations. Django is
the validation, business-service, and REST boundary. Supabase PostgreSQL remains
the canonical database.

## Frontend rule

`frontend/` is a React 19 + TypeScript + Vite application. The original native
screens and reusable components were retained, while Next.js routing was
replaced with React Router. Expenses, pricing, and reports are native React
screens rather than legacy iframes.

All frontend data operations go through `frontend/src/lib/api/client.ts` to the
Django API. `frontend/src/lib/supabase/data.ts` is only a compatibility adapter
for the copied screens; it contains no Supabase client and performs no direct
database access.

## Business modules

| Django app | Supabase tables / responsibility |
|---|---|
| `common` | Health, response/error conventions |
| `dashboard` | Operational counts, low stock, pending work |
| `brands` | `brands` |
| `raw_materials` | `raw_materials`, stock adjustments |
| `products` | `products`, JSONB formulas |
| `labels` | `label_inventory` |
| `batches` | `batches`, mixing, NJP, assembly, inventory RPCs |
| `inventory` | `finished_goods`, `finished_goods_history` |
| `procurement` | `vendors`, `purchase_orders` |
| `hr` | employees, attendance, work, salary, loans |
| `finance` | expense books and expenses |
| `reports` | pricing, traceability, inventory/payroll/expense summaries |

Mixing, NJP, and assembly remain inside the `batches` app because they are
stages of one production aggregate.

## API conventions

- Requests and responses use the existing React camelCase contract.
- Services translate top-level keys to Supabase snake_case columns.
- Successful resources are returned as `{ "data": ... }`.
- Errors are returned as `{ "error": "...", "details": ... }`.
- PostgreSQL RPC functions handle atomic inventory reservation/restoration.

## Database deployment

Apply `supabase/migrations/001...016` in order. During migration testing, leave
the old anonymous policies in place only if the old Next.js app still needs
them. Then apply `017_backend_workflow_functions.sql`. After final client
cutover, apply `018_django_api_cutover.sql` to remove direct `anon` and
`authenticated` access to application tables and RPC functions.

## Backend API groups

- `/api/brands`
- `/api/raw-materials`
- `/api/products`
- `/api/labels`
- `/api/batches`
- `/api/finished-goods`
- `/api/vendors`
- `/api/purchase-orders`
- `/api/po-documents`
- `/api/employees`, `/api/time-entries`, `/api/work-entries`
- `/api/salary-sheets`, `/api/employee-loans`
- `/api/expense-books`, `/api/expenses`
- `/api/reports/*`

Both the original slashless paths and Django-style trailing-slash paths are
accepted.

## Authentication

For local development, `SUPABASE_REQUIRE_AUTH=false` is supported. In
production set `DJANGO_DEBUG=false` and `SUPABASE_REQUIRE_AUTH=true`; clients
must then send `Authorization: Bearer <supabase-access-token>`. Django validates
the user token but performs all database work with the server-only service-role
key.
