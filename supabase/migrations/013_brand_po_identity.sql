-- ============================================================================
-- 013_brand_po_identity.sql
-- Brand-specific buyer identity printed on purchase-order documents.
-- ============================================================================

ALTER TABLE brands ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS phone text;
