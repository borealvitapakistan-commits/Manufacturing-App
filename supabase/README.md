# Supabase database

The numbered SQL files are the database source of truth. Apply them in order
with the Supabase CLI or SQL editor.

Files `001` through `016` are preserved from the original Next.js application.
They define the complete manufacturing, inventory, procurement, HR, finance,
reporting, index, trigger, and transaction-RPC schema.

Django does not run database migrations and does not define model classes.
The Django services use this existing schema as-is; no additional database
migration is required for the backend cutover.
