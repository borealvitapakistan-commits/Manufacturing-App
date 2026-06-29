-- ============================================================================
-- 006_indexes_and_triggers.sql
-- Performance indexes, uniqueness, and updated_at triggers.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_brands_name ON brands (name);
CREATE INDEX IF NOT EXISTS idx_brands_active_name ON brands (is_active, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_brands_code_prefix_ci ON brands (lower(code_prefix));

CREATE INDEX IF NOT EXISTS idx_raw_materials_name ON raw_materials (name);
CREATE INDEX IF NOT EXISTS idx_raw_materials_qty ON raw_materials (qty_kg);
CREATE INDEX IF NOT EXISTS idx_raw_materials_category ON raw_materials (category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raw_materials_location ON raw_materials (location) WHERE location IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raw_materials_low_stock ON raw_materials (qty_kg) WHERE qty_kg <= 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_materials_code_ci ON raw_materials (lower(code));

CREATE INDEX IF NOT EXISTS idx_products_name ON products (name);
CREATE INDEX IF NOT EXISTS idx_products_rm_gin ON products USING GIN (rm);
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_name_ci ON products (lower(name));

CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors (name);
CREATE INDEX IF NOT EXISTS idx_vendors_active_not_deleted ON vendors (is_active, deleted) WHERE deleted = false;
CREATE INDEX IF NOT EXISTS idx_vendors_categories_gin ON vendors USING GIN (categories);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_short_code_ci ON vendors (lower(short_code)) WHERE short_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_vendor_code_ci ON vendors (lower(vendor_code)) WHERE vendor_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_batches_brand ON batches (brand_id);
CREATE INDEX IF NOT EXISTS idx_batches_product ON batches (product_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches (status);
CREATE INDEX IF NOT EXISTS idx_batches_created_desc ON batches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_brand_status_created ON batches (brand_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_batches_batch_code_ci ON batches (lower(batch_code));

CREATE UNIQUE INDEX IF NOT EXISTS uq_mixing_reports_batch_id ON mixing_reports (batch_id);
CREATE INDEX IF NOT EXISTS idx_mixing_reports_brand ON mixing_reports (brand_id);
CREATE INDEX IF NOT EXISTS idx_mixing_reports_product ON mixing_reports (product_id);
CREATE INDEX IF NOT EXISTS idx_mixing_reports_created_desc ON mixing_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mixing_reports_mixing_date_desc ON mixing_reports (mixing_date DESC);
CREATE INDEX IF NOT EXISTS idx_mixing_reports_rm_usage_gin ON mixing_reports USING GIN (rm_usage);
CREATE INDEX IF NOT EXISTS idx_mixing_reports_non_med_usage_gin ON mixing_reports USING GIN (non_med_usage);

CREATE UNIQUE INDEX IF NOT EXISTS uq_njp_reports_batch_id ON njp_reports (batch_id);
CREATE INDEX IF NOT EXISTS idx_njp_reports_brand ON njp_reports (brand_id);
CREATE INDEX IF NOT EXISTS idx_njp_reports_product ON njp_reports (product_id);
CREATE INDEX IF NOT EXISTS idx_njp_reports_created_desc ON njp_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_njp_reports_production_date_desc ON njp_reports (production_date DESC);
CREATE INDEX IF NOT EXISTS idx_njp_reports_capsule_data_gin ON njp_reports USING GIN (capsule_data);
CREATE INDEX IF NOT EXISTS idx_njp_reports_load_checks_gin ON njp_reports USING GIN (load_checks);

CREATE UNIQUE INDEX IF NOT EXISTS uq_assembly_reports_batch_id ON assembly_reports (batch_id);
CREATE INDEX IF NOT EXISTS idx_assembly_reports_brand ON assembly_reports (brand_id);
CREATE INDEX IF NOT EXISTS idx_assembly_reports_product ON assembly_reports (product_id);
CREATE INDEX IF NOT EXISTS idx_assembly_reports_created_desc ON assembly_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assembly_reports_production_date_desc ON assembly_reports (production_date DESC);
CREATE INDEX IF NOT EXISTS idx_assembly_reports_final_quantities_gin ON assembly_reports USING GIN (final_quantities);

CREATE INDEX IF NOT EXISTS idx_employees_name ON employees (full_name);
CREATE INDEX IF NOT EXISTS idx_employees_active_name ON employees (is_active, full_name);
CREATE INDEX IF NOT EXISTS idx_employees_primary_brand ON employees (primary_brand_id) WHERE primary_brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_brand_ids_gin ON employees USING GIN (brand_ids);
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_email_ci ON employees (lower(email)) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON time_entries (employee_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date_desc ON time_entries (date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_employee_date_desc ON time_entries (employee_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON time_entries (status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_entries_employee_date ON time_entries (employee_id, date) WHERE date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_entries_employee ON work_entries (employee_id);
CREATE INDEX IF NOT EXISTS idx_work_entries_brand ON work_entries (brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_entries_date_desc ON work_entries (date DESC);
CREATE INDEX IF NOT EXISTS idx_work_entries_employee_date ON work_entries (employee_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_work_entries_batch_code ON work_entries (batch_code) WHERE batch_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_salary_sheets_employee ON salary_sheets (employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_sheets_period ON salary_sheets (year DESC, month DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_salary_sheets_employee_period ON salary_sheets (employee_id, year, month);

CREATE INDEX IF NOT EXISTS idx_employee_loans_employee ON employee_loans (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_loans_date_desc ON employee_loans (date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_loans_employee_date ON employee_loans (employee_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_loans_salary_sheet ON employee_loans (salary_sheet_id);

CREATE INDEX IF NOT EXISTS idx_expense_books_status_active ON expense_books (status, is_active);
CREATE INDEX IF NOT EXISTS idx_expense_books_created_desc ON expense_books (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_books_pending_carry ON expense_books (has_pending_carry, pending_carry_amount);
CREATE INDEX IF NOT EXISTS idx_expense_books_tags_gin ON expense_books USING GIN (tags);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_books_name_ci ON expense_books (lower(name));

CREATE INDEX IF NOT EXISTS idx_expenses_book ON expenses (book_id);
CREATE INDEX IF NOT EXISTS idx_expenses_book_date_desc ON expenses (book_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_direction_type ON expenses (direction, type);
CREATE INDEX IF NOT EXISTS idx_expenses_tags_gin ON expenses USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_label_inventory_brand_product ON label_inventory (brand_id, product_id);
CREATE INDEX IF NOT EXISTS idx_label_inventory_brand_product_active ON label_inventory (brand_id, product_id, is_active);
CREATE INDEX IF NOT EXISTS idx_label_inventory_product ON label_inventory (product_id);
CREATE INDEX IF NOT EXISTS idx_label_inventory_active ON label_inventory (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_label_inventory_low_stock
  ON label_inventory (brand_id, product_id, quantity, reorder_level)
  WHERE is_active = true AND quantity <= reorder_level;
CREATE UNIQUE INDEX IF NOT EXISTS uq_label_inventory_brand_product_label_ci
  ON label_inventory (brand_id, product_id, lower(label_name));

CREATE UNIQUE INDEX IF NOT EXISTS uq_finished_goods_batch_id
  ON finished_goods (batch_id)
  WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finished_goods_category ON finished_goods (category);
CREATE INDEX IF NOT EXISTS idx_finished_goods_brand ON finished_goods (brand_id);
CREATE INDEX IF NOT EXISTS idx_finished_goods_product ON finished_goods (product_id);
CREATE INDEX IF NOT EXISTS idx_finished_goods_category_created ON finished_goods (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finished_goods_brand_category ON finished_goods (brand_id, category);

CREATE INDEX IF NOT EXISTS idx_finished_goods_history_fg_id ON finished_goods_history (finished_good_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finished_goods_history_source ON finished_goods_history (change_source);
CREATE INDEX IF NOT EXISTS idx_finished_goods_history_changes_gin ON finished_goods_history USING GIN (changes);

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_po_number_ci ON purchase_orders (lower(po_number));
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_type ON purchase_orders (order_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_raw_material
  ON purchase_orders (raw_material_id, created_at DESC)
  WHERE raw_material_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_label
  ON purchase_orders (label_inventory_id, created_at DESC)
  WHERE label_inventory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_product
  ON purchase_orders (product_id, created_at DESC)
  WHERE product_id IS NOT NULL;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  table_name text;
  trigger_name text;
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
    'purchase_orders'
  ]
  LOOP
    trigger_name := 'trg_' || table_name || '_updated_at';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = trigger_name
        AND tgrelid = format('public.%I', table_name)::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
        trigger_name,
        table_name
      );
    END IF;
  END LOOP;
END $$;
