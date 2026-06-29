-- ============================================================================
-- 015_product_npn.sql
-- Adds NPN tracking to products for preparation reports.
-- ============================================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS npn text;

UPDATE products
SET npn = NULL
WHERE npn IS NOT NULL
  AND length(btrim(npn)) = 0;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_npn_not_blank;

ALTER TABLE products
  ADD CONSTRAINT products_npn_not_blank
  CHECK (npn IS NULL OR length(btrim(npn)) > 0);

CREATE INDEX IF NOT EXISTS idx_products_npn
  ON products (npn)
  WHERE npn IS NOT NULL;
