-- ============================================================================
-- 012_brand_logos.sql
-- Optional brand logo used on purchase-order documents.
-- ============================================================================

ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_url text;
