# Manufacturing app architecture

## Backend rule

There are no Django model classes and no Django database migrations. Django is
the validation, business-service, and REST boundary. Persistence now goes
through Supabase/PostgreSQL only. The temporary local JSON testing layer has
been removed from the backend.

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
| `commercial` | Brands, products, product formulas, product price calculator |
| `inventory` | Raw materials, labels, bottles/lids, finished goods views |
| `manufacturing` | Mixing, NJP/encapsulation, assembly |
| `reports` | Mixing, NJP, assembly, and manufacturing traceability reports |

The old batch workflow app has been removed. Assembly is the point where the
brand-based Batch Code is generated for finished bottle traceability.

## API conventions

- Requests and responses use the existing React camelCase contract.
- Services translate top-level keys to Supabase snake_case columns.
- Successful resources are returned as `{ "data": ... }`.
- Errors are returned as `{ "error": "...", "details": ... }`.
- PostgreSQL RPC functions handle atomic inventory reservation/restoration.

## Database deployment

Apply the new Supabase migration set in `supabase/migrations-2/` in numeric
order. That schema drops the legacy tables first, then creates the core
commercial, inventory, manufacturing, reporting, and grant structures used by
the Django backend.

## Backend API groups

- `/api/brands`
- `/api/raw-materials`
- `/api/products`
- `/api/labels`
- `/api/mixing`
- `/api/njp`
- `/api/assembly`
- `/api/manufacturing`
- `/api/finished-goods`
- `/api/reports/*`

Both the original slashless paths and Django-style trailing-slash paths are
accepted.

## Authentication

For local development, `SUPABASE_REQUIRE_AUTH=false` is supported. In
production set `DJANGO_DEBUG=false` and `SUPABASE_REQUIRE_AUTH=true`; clients
must then send `Authorization: Bearer <supabase-access-token>`. Django validates
the user token but performs all database work with the server-only service-role
key.
