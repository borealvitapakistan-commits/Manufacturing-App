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

## Deploy to Vercel

`vercel.json` (repo root) builds the frontend as a static site and the
Django backend as a single Python serverless function
(`backend/api/index.py`, a WSGI wrapper around `config/wsgi.py`), routed as:

- `/api/*` -> the Django API
- everything else -> the built frontend (`frontend/dist`), with an SPA
  fallback to `index.html` for client-side routes

Since both are served from the same Vercel deployment/domain, the frontend
talks to the API same-origin (`frontend/.env.production` sets
`VITE_API_URL=/api`) - no CORS involved in normal use.

Set these in the Vercel project's Environment Variables (Production, and
Preview if you want preview deployments to work too):

| Variable | Notes |
|---|---|
| `SUPABASE_URL` | same value as local `.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | required in production - the anon-key fallback only applies when `DJANGO_DEBUG=true` |
| `DJANGO_SECRET_KEY` | any long random string; startup fails without it once `DJANGO_DEBUG=false` |
| `DJANGO_DEBUG` | set to `false` |

`DJANGO_ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` don't need to be set
manually - `config/settings.py` automatically trusts Vercel's own
`VERCEL_URL` (injected on every deployment). Only add them if you attach a
custom domain.

Note: this runs Django as a serverless function (cold starts, a
request-timeout ceiling, no persistent connections/websockets). That's a
reasonable fit here since the backend already has no local database
(`DATABASES = {}` - all data access goes through the Supabase REST client
per request), but for continuous production use a normal always-on host
(Render/Railway/Fly.io) is worth considering instead of this route.
