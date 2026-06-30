-- ============================================================================
-- 018_product_label_types_and_raw_material_categories.sql
-- Product/label type fields and structured raw material categories.
-- ============================================================================

CREATE TABLE IF NOT EXISTS raw_material_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raw_material_categories_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT raw_material_categories_description_not_blank
    CHECK (description IS NULL OR length(btrim(description)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_material_categories_name_ci
  ON raw_material_categories (lower(name));

INSERT INTO raw_material_categories (name, description, is_active)
SELECT 'Other', 'Default category for existing and uncategorized raw materials.', true
WHERE NOT EXISTS (
  SELECT 1 FROM raw_material_categories WHERE lower(name) = 'other'
);

UPDATE raw_material_categories
SET
  description = COALESCE(description, 'Default category for existing and uncategorized raw materials.'),
  is_active = true,
  updated_at = now()
WHERE lower(name) = 'other';

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'capsule';

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_type_allowed,
  ADD CONSTRAINT products_type_allowed
    CHECK (type IN ('capsule', 'tablets', 'softgel', 'liquid', 'lozengers', 'powder'));

ALTER TABLE raw_materials
  ADD COLUMN IF NOT EXISTS category_id uuid;

ALTER TABLE raw_materials
  DROP CONSTRAINT IF EXISTS raw_materials_category_id_fkey,
  ADD CONSTRAINT raw_materials_category_id_fkey
    FOREIGN KEY (category_id)
    REFERENCES raw_material_categories(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;

UPDATE raw_materials
SET category_id = (
  SELECT id
  FROM raw_material_categories
  WHERE lower(name) = 'other'
  LIMIT 1
)
WHERE category_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_raw_materials_category_id
  ON raw_materials (category_id);

CREATE INDEX IF NOT EXISTS idx_raw_material_categories_active
  ON raw_material_categories (is_active)
  WHERE is_active = true;

ALTER TABLE label_inventory
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'capsule',
  ADD COLUMN IF NOT EXISTS dosage_type text NOT NULL DEFAULT '60';

ALTER TABLE label_inventory
  DROP CONSTRAINT IF EXISTS label_inventory_type_allowed,
  DROP CONSTRAINT IF EXISTS label_inventory_dosage_type_allowed,
  ADD CONSTRAINT label_inventory_type_allowed
    CHECK (type IN ('capsule', 'tablets', 'softgel', 'liquid', 'lozengers', 'powder')),
  ADD CONSTRAINT label_inventory_dosage_type_allowed
    CHECK (dosage_type IN ('60', '90', '120', '180', '240'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'set_updated_at'
      AND pg_function_is_visible(oid)
  ) THEN
    DROP TRIGGER IF EXISTS trg_raw_material_categories_updated_at ON raw_material_categories;
    CREATE TRIGGER trg_raw_material_categories_updated_at
      BEFORE UPDATE ON raw_material_categories
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

ALTER TABLE raw_material_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_material_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_select ON raw_material_categories;
DROP POLICY IF EXISTS authenticated_insert ON raw_material_categories;
DROP POLICY IF EXISTS authenticated_update ON raw_material_categories;
DROP POLICY IF EXISTS authenticated_delete ON raw_material_categories;
DROP POLICY IF EXISTS anon_select ON raw_material_categories;
DROP POLICY IF EXISTS anon_insert ON raw_material_categories;
DROP POLICY IF EXISTS anon_update ON raw_material_categories;
DROP POLICY IF EXISTS anon_delete ON raw_material_categories;

CREATE POLICY authenticated_select
  ON raw_material_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_insert
  ON raw_material_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY authenticated_update
  ON raw_material_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_delete
  ON raw_material_categories FOR DELETE TO authenticated USING (true);

CREATE POLICY anon_select
  ON raw_material_categories FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert
  ON raw_material_categories FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update
  ON raw_material_categories FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_delete
  ON raw_material_categories FOR DELETE TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON raw_material_categories TO anon, authenticated;
GRANT ALL ON raw_material_categories TO service_role;
