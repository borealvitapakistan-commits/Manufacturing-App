-- ============================================================================
-- 016_report_workflow_fields.sql
-- Adds workflow fields needed by the full batch report pages.
-- ============================================================================

-- Receiving report metadata for raw material rows.
ALTER TABLE raw_materials
  ADD COLUMN IF NOT EXISTS coa_link text,
  ADD COLUMN IF NOT EXISTS comments text;

UPDATE raw_materials
SET
  coa_link = NULLIF(btrim(coa_link), ''),
  comments = NULLIF(btrim(comments), '')
WHERE coa_link IS NOT NULL
   OR comments IS NOT NULL;

ALTER TABLE raw_materials
  DROP CONSTRAINT IF EXISTS raw_materials_coa_link_not_blank,
  DROP CONSTRAINT IF EXISTS raw_materials_comments_not_blank;

ALTER TABLE raw_materials
  ADD CONSTRAINT raw_materials_coa_link_not_blank
  CHECK (coa_link IS NULL OR length(btrim(coa_link)) > 0),
  ADD CONSTRAINT raw_materials_comments_not_blank
  CHECK (comments IS NULL OR length(btrim(comments)) > 0);

-- Blending report stage times. Existing mixing report rows remain unchanged.
ALTER TABLE mixing_reports
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_time text;

UPDATE mixing_reports
SET
  start_time = NULLIF(btrim(start_time), ''),
  end_time = NULLIF(btrim(end_time), '')
WHERE start_time IS NOT NULL
   OR end_time IS NOT NULL;

ALTER TABLE mixing_reports
  DROP CONSTRAINT IF EXISTS mixing_reports_start_time_not_blank,
  DROP CONSTRAINT IF EXISTS mixing_reports_end_time_not_blank;

ALTER TABLE mixing_reports
  ADD CONSTRAINT mixing_reports_start_time_not_blank
  CHECK (start_time IS NULL OR length(btrim(start_time)) > 0),
  ADD CONSTRAINT mixing_reports_end_time_not_blank
  CHECK (end_time IS NULL OR length(btrim(end_time)) > 0);

-- Quality Control and Packaging report stage dates/times.
ALTER TABLE assembly_reports
  ADD COLUMN IF NOT EXISTS quality_control_date bigint,
  ADD COLUMN IF NOT EXISTS quality_control_start_time text,
  ADD COLUMN IF NOT EXISTS quality_control_end_time text,
  ADD COLUMN IF NOT EXISTS packaging_date bigint,
  ADD COLUMN IF NOT EXISTS packaging_start_time text,
  ADD COLUMN IF NOT EXISTS packaging_end_time text;

UPDATE assembly_reports
SET
  quality_control_start_time = NULLIF(btrim(quality_control_start_time), ''),
  quality_control_end_time = NULLIF(btrim(quality_control_end_time), ''),
  packaging_start_time = NULLIF(btrim(packaging_start_time), ''),
  packaging_end_time = NULLIF(btrim(packaging_end_time), '')
WHERE quality_control_start_time IS NOT NULL
   OR quality_control_end_time IS NOT NULL
   OR packaging_start_time IS NOT NULL
   OR packaging_end_time IS NOT NULL;

ALTER TABLE assembly_reports
  DROP CONSTRAINT IF EXISTS assembly_reports_qc_start_time_not_blank,
  DROP CONSTRAINT IF EXISTS assembly_reports_qc_end_time_not_blank,
  DROP CONSTRAINT IF EXISTS assembly_reports_packaging_start_time_not_blank,
  DROP CONSTRAINT IF EXISTS assembly_reports_packaging_end_time_not_blank;

ALTER TABLE assembly_reports
  ADD CONSTRAINT assembly_reports_qc_start_time_not_blank
  CHECK (quality_control_start_time IS NULL OR length(btrim(quality_control_start_time)) > 0),
  ADD CONSTRAINT assembly_reports_qc_end_time_not_blank
  CHECK (quality_control_end_time IS NULL OR length(btrim(quality_control_end_time)) > 0),
  ADD CONSTRAINT assembly_reports_packaging_start_time_not_blank
  CHECK (packaging_start_time IS NULL OR length(btrim(packaging_start_time)) > 0),
  ADD CONSTRAINT assembly_reports_packaging_end_time_not_blank
  CHECK (packaging_end_time IS NULL OR length(btrim(packaging_end_time)) > 0);

CREATE INDEX IF NOT EXISTS idx_assembly_reports_qc_date_desc
  ON assembly_reports (quality_control_date DESC)
  WHERE quality_control_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assembly_reports_packaging_date_desc
  ON assembly_reports (packaging_date DESC)
  WHERE packaging_date IS NOT NULL;
