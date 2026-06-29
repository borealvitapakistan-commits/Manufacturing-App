-- ============================================================================
-- 009_anon_app_access.sql
-- Compatibility access for the current no-login app.
--
-- Run this only if the app should work with the publishable key and no
-- Supabase Auth session. This opens app tables/RPCs to the anon role.
-- For a locked-down production app, use Supabase Auth or server-side
-- service-role API routes instead of this migration.
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
    EXECUTE format('DROP POLICY IF EXISTS anon_select ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS anon_insert ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS anon_update ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS anon_delete ON public.%I', table_name);

    EXECUTE format(
      'CREATE POLICY anon_select ON public.%I FOR SELECT TO anon USING (true)',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY anon_insert ON public.%I FOR INSERT TO anon WITH CHECK (true)',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY anon_update ON public.%I FOR UPDATE TO anon USING (true) WITH CHECK (true)',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY anon_delete ON public.%I FOR DELETE TO anon USING (true)',
      table_name
    );
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

GRANT EXECUTE ON FUNCTION create_mixing_report_with_deduction(uuid, uuid, uuid, jsonb, jsonb, text[], text, text, text, text, bigint, text, numeric, numeric, numeric, numeric) TO anon;
GRANT EXECUTE ON FUNCTION delete_mixing_report_with_restore(uuid) TO anon;
GRANT EXECUTE ON FUNCTION delete_batch_cascade(uuid) TO anon;
GRANT EXECUTE ON FUNCTION save_loan_with_expense(uuid, numeric, text, uuid, text) TO anon;
