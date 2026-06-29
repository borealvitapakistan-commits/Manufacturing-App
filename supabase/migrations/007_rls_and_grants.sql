-- ============================================================================
-- 007_rls_and_grants.sql
-- Secure-by-default row-level security and role grants.
-- ============================================================================

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'brands',
    'raw_materials',
    'products',
    'vendors',
    'batches',
    'mixing_reports',
    'njp_reports',
    'assembly_reports',
    'employees',
    'time_entries',
    'work_entries',
    'salary_sheets',
    'employee_loans',
    'expense_books',
    'expenses',
    'label_inventory',
    'finished_goods',
    'finished_goods_history',
    'purchase_orders'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);

    EXECUTE format('DROP POLICY IF EXISTS authenticated_select ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_insert ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_update ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_delete ON public.%I', table_name);

    EXECUTE format(
      'CREATE POLICY authenticated_select ON public.%I FOR SELECT TO authenticated USING (true)',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY authenticated_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY authenticated_update ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY authenticated_delete ON public.%I FOR DELETE TO authenticated USING (true)',
      table_name
    );
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
