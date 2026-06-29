# Manufacturing Portal

This is the Django + React TypeScript migration of the original PHF
Manufacturing Batch Pricing portal. The old project remains in
`Manufacturing Batch Pricing/` as a read-only behavior reference.

## Architecture

```text
React TypeScript (Vite)
          |
          | JSON over /api
          v
Django REST API (no Django ORM/models/migrations)
          |
          | Supabase Python client + PostgreSQL RPC
          v
Supabase PostgreSQL
```

Django is the only application backend. The React frontend does not query
Supabase tables or call database RPC functions directly, and the browser never
receives the Supabase service-role key.

## Supabase migrations

The original migration files `001` through `016` are copied byte-for-byte into
`supabase/migrations/`. No Django migrations or replacement database schema are
used.

## Start the complete application

From the project root:

```powershell
.\start-dev.ps1
```

This starts Django on port `8000`, Vite on port `5173`, and verifies the live
Supabase health check. Use `.\stop-dev.ps1` for processes started by the script.

## Run the backend

```powershell
cd backend
Copy-Item .env.example .env
# Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000 --noreload --nothreading
```

Health check: `GET http://127.0.0.1:8000/api/health/`

For compatibility with the pasted project, development mode can temporarily use
its publishable Supabase key. Production data access requires
`SUPABASE_SERVICE_ROLE_KEY`.

## Run the frontend

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The default API target is
`http://127.0.0.1:8000/api`.

## Verify

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test
.\.venv\Scripts\python.exe -m pip check

cd ..\frontend
npm run type-check
npm run build
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module and endpoint
mapping and [docs/BACKEND_PARITY_AUDIT.md](docs/BACKEND_PARITY_AUDIT.md) for
the entity, relationship and formula audit.
