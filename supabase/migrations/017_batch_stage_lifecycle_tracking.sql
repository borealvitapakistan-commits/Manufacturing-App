-- ============================================================================
-- 017_batch_stage_lifecycle_tracking.sql
-- Adds explicit batch/stage lifecycle tracking for in-progress manufacturing.
-- Run this in Supabase before using the new Django lifecycle endpoints.
-- ============================================================================

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS batch_status text NOT NULL DEFAULT 'Batch Created',
  ADD COLUMN IF NOT EXISTS current_stage text NOT NULL DEFAULT 'batch',
  ADD COLUMN IF NOT EXISTS batch_start_date bigint,
  ADD COLUMN IF NOT EXISTS batch_start_time text,
  ADD COLUMN IF NOT EXISTS batch_end_date bigint,
  ADD COLUMN IF NOT EXISTS batch_end_time text,
  ADD COLUMN IF NOT EXISTS batch_remarks text,
  ADD COLUMN IF NOT EXISTS reason text;

UPDATE batches
SET
  batch_status = CASE
    WHEN has_assembly OR status = 'finalized' THEN 'Completed'
    WHEN has_njp OR status = 'assemblyPending' THEN 'NJP Completed'
    WHEN has_mixing OR status = 'ngpPending' THEN 'Mixing Completed'
    ELSE COALESCE(NULLIF(btrim(batch_status), ''), 'Batch Created')
  END,
  current_stage = CASE
    WHEN has_assembly OR status = 'finalized' THEN 'finished_goods'
    WHEN has_njp OR status = 'assemblyPending' THEN 'assembly'
    WHEN has_mixing OR status = 'ngpPending' THEN 'njp'
    ELSE COALESCE(NULLIF(btrim(current_stage), ''), 'batch')
  END,
  batch_start_time = COALESCE(NULLIF(btrim(batch_start_time), ''), NULLIF(btrim(start_time), '')),
  batch_end_time = COALESCE(NULLIF(btrim(batch_end_time), ''), NULLIF(btrim(end_time), '')),
  batch_remarks = NULLIF(btrim(batch_remarks), ''),
  reason = NULLIF(btrim(reason), '')
WHERE true;

ALTER TABLE batches
  DROP CONSTRAINT IF EXISTS batches_batch_status_valid,
  DROP CONSTRAINT IF EXISTS batches_current_stage_valid,
  DROP CONSTRAINT IF EXISTS batches_batch_start_time_not_blank,
  DROP CONSTRAINT IF EXISTS batches_batch_end_time_not_blank,
  DROP CONSTRAINT IF EXISTS batches_batch_remarks_not_blank,
  DROP CONSTRAINT IF EXISTS batches_reason_not_blank;

ALTER TABLE batches
  ADD CONSTRAINT batches_batch_status_valid
    CHECK (batch_status IN (
      'Batch Created',
      'In Mixing',
      'Mixing Completed',
      'In NJP',
      'NJP Completed',
      'In Assembly',
      'Assembly Completed',
      'Completed'
    )),
  ADD CONSTRAINT batches_current_stage_valid
    CHECK (current_stage IN ('batch', 'mixing', 'njp', 'assembly', 'finished_goods')),
  ADD CONSTRAINT batches_batch_start_time_not_blank
    CHECK (batch_start_time IS NULL OR length(btrim(batch_start_time)) > 0),
  ADD CONSTRAINT batches_batch_end_time_not_blank
    CHECK (batch_end_time IS NULL OR length(btrim(batch_end_time)) > 0),
  ADD CONSTRAINT batches_batch_remarks_not_blank
    CHECK (batch_remarks IS NULL OR length(btrim(batch_remarks)) > 0),
  ADD CONSTRAINT batches_reason_not_blank
    CHECK (reason IS NULL OR length(btrim(reason)) > 0);

ALTER TABLE mixing_reports
  ADD COLUMN IF NOT EXISTS start_date bigint,
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_date bigint,
  ADD COLUMN IF NOT EXISTS end_time text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Mixing Completed',
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS reason text;

UPDATE mixing_reports
SET
  start_date = COALESCE(start_date, mixing_date),
  end_date = COALESCE(end_date, mixing_date),
  start_time = NULLIF(btrim(start_time), ''),
  end_time = NULLIF(btrim(end_time), ''),
  status = COALESCE(NULLIF(btrim(status), ''), 'Mixing Completed'),
  remarks = COALESCE(NULLIF(btrim(remarks), ''), NULLIF(btrim(mixing_notes), '')),
  reason = NULLIF(btrim(reason), '')
WHERE true;

ALTER TABLE mixing_reports
  DROP CONSTRAINT IF EXISTS mixing_reports_status_valid,
  DROP CONSTRAINT IF EXISTS mixing_reports_start_time_not_blank,
  DROP CONSTRAINT IF EXISTS mixing_reports_end_time_not_blank,
  DROP CONSTRAINT IF EXISTS mixing_reports_remarks_not_blank,
  DROP CONSTRAINT IF EXISTS mixing_reports_reason_not_blank;

ALTER TABLE mixing_reports
  ADD CONSTRAINT mixing_reports_status_valid
    CHECK (status IN ('In Mixing', 'Mixing Completed')),
  ADD CONSTRAINT mixing_reports_start_time_not_blank
    CHECK (start_time IS NULL OR length(btrim(start_time)) > 0),
  ADD CONSTRAINT mixing_reports_end_time_not_blank
    CHECK (end_time IS NULL OR length(btrim(end_time)) > 0),
  ADD CONSTRAINT mixing_reports_remarks_not_blank
    CHECK (remarks IS NULL OR length(btrim(remarks)) > 0),
  ADD CONSTRAINT mixing_reports_reason_not_blank
    CHECK (reason IS NULL OR length(btrim(reason)) > 0);

ALTER TABLE njp_reports
  ADD COLUMN IF NOT EXISTS end_date bigint,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'NJP Completed',
  ADD COLUMN IF NOT EXISTS reason text;

UPDATE njp_reports
SET
  end_date = COALESCE(end_date, production_date, start_date),
  start_time = NULLIF(btrim(start_time), ''),
  end_time = NULLIF(btrim(end_time), ''),
  status = COALESCE(NULLIF(btrim(status), ''), 'NJP Completed'),
  remarks = NULLIF(btrim(remarks), ''),
  reason = NULLIF(btrim(reason), '')
WHERE true;

ALTER TABLE njp_reports
  DROP CONSTRAINT IF EXISTS njp_reports_status_valid,
  DROP CONSTRAINT IF EXISTS njp_reports_start_time_not_blank,
  DROP CONSTRAINT IF EXISTS njp_reports_end_time_not_blank,
  DROP CONSTRAINT IF EXISTS njp_reports_remarks_not_blank,
  DROP CONSTRAINT IF EXISTS njp_reports_reason_not_blank;

ALTER TABLE njp_reports
  ADD CONSTRAINT njp_reports_status_valid
    CHECK (status IN ('In NJP', 'NJP Completed')),
  ADD CONSTRAINT njp_reports_start_time_not_blank
    CHECK (start_time IS NULL OR length(btrim(start_time)) > 0),
  ADD CONSTRAINT njp_reports_end_time_not_blank
    CHECK (end_time IS NULL OR length(btrim(end_time)) > 0),
  ADD CONSTRAINT njp_reports_remarks_not_blank
    CHECK (remarks IS NULL OR length(btrim(remarks)) > 0),
  ADD CONSTRAINT njp_reports_reason_not_blank
    CHECK (reason IS NULL OR length(btrim(reason)) > 0);

ALTER TABLE assembly_reports
  ADD COLUMN IF NOT EXISTS start_date bigint,
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_date bigint,
  ADD COLUMN IF NOT EXISTS end_time text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Assembly Completed',
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS reason text;

UPDATE assembly_reports
SET
  start_date = COALESCE(start_date, quality_control_date, production_date),
  end_date = COALESCE(end_date, packaging_date, production_date),
  start_time = COALESCE(NULLIF(btrim(start_time), ''), NULLIF(btrim(quality_control_start_time), '')),
  end_time = COALESCE(NULLIF(btrim(end_time), ''), NULLIF(btrim(packaging_end_time), '')),
  status = COALESCE(NULLIF(btrim(status), ''), 'Assembly Completed'),
  remarks = COALESCE(NULLIF(btrim(remarks), ''), NULLIF(btrim(notes), '')),
  reason = NULLIF(btrim(reason), '')
WHERE true;

ALTER TABLE assembly_reports
  DROP CONSTRAINT IF EXISTS assembly_reports_status_valid,
  DROP CONSTRAINT IF EXISTS assembly_reports_start_time_not_blank,
  DROP CONSTRAINT IF EXISTS assembly_reports_end_time_not_blank,
  DROP CONSTRAINT IF EXISTS assembly_reports_remarks_not_blank,
  DROP CONSTRAINT IF EXISTS assembly_reports_reason_not_blank;

ALTER TABLE assembly_reports
  ADD CONSTRAINT assembly_reports_status_valid
    CHECK (status IN ('In Assembly', 'Assembly Completed')),
  ADD CONSTRAINT assembly_reports_start_time_not_blank
    CHECK (start_time IS NULL OR length(btrim(start_time)) > 0),
  ADD CONSTRAINT assembly_reports_end_time_not_blank
    CHECK (end_time IS NULL OR length(btrim(end_time)) > 0),
  ADD CONSTRAINT assembly_reports_remarks_not_blank
    CHECK (remarks IS NULL OR length(btrim(remarks)) > 0),
  ADD CONSTRAINT assembly_reports_reason_not_blank
    CHECK (reason IS NULL OR length(btrim(reason)) > 0);

CREATE INDEX IF NOT EXISTS idx_batches_current_stage
  ON batches (current_stage);

CREATE INDEX IF NOT EXISTS idx_batches_batch_status
  ON batches (batch_status);

CREATE INDEX IF NOT EXISTS idx_mixing_reports_status
  ON mixing_reports (status);

CREATE INDEX IF NOT EXISTS idx_njp_reports_status
  ON njp_reports (status);

CREATE INDEX IF NOT EXISTS idx_assembly_reports_status
  ON assembly_reports (status);

CREATE INDEX IF NOT EXISTS idx_mixing_reports_start_date_desc
  ON mixing_reports (start_date DESC)
  WHERE start_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_njp_reports_start_date_desc
  ON njp_reports (start_date DESC)
  WHERE start_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assembly_reports_start_date_desc
  ON assembly_reports (start_date DESC)
  WHERE start_date IS NOT NULL;

CREATE OR REPLACE FUNCTION create_mixing_report_with_deduction(
  p_batch_id uuid,
  p_brand_id uuid,
  p_product_id uuid,
  p_rm_usage jsonb,
  p_non_med_usage jsonb DEFAULT '[]'::jsonb,
  p_mixing_dates text[] DEFAULT '{}',
  p_mixing_notes text DEFAULT '',
  p_batch_code text DEFAULT NULL,
  p_brand_name text DEFAULT NULL,
  p_product_name text DEFAULT NULL,
  p_mixing_date bigint DEFAULT NULL,
  p_mixed_powder_name text DEFAULT NULL,
  p_mixed_powder_qty_kg numeric DEFAULT NULL,
  p_total_formula_qty_kg numeric DEFAULT NULL,
  p_total_mixed_qty_kg numeric DEFAULT NULL,
  p_existing_mixed_powder_used_kg numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
  v_existing_report_id uuid;
  v_item jsonb;
  v_rm_id uuid;
  v_used_qty numeric;
  v_current_qty numeric;
  v_new_qty numeric;
  v_rm_name text;
  v_batch batches%ROWTYPE;
  v_should_deduct boolean;
BEGIN
  SELECT * INTO v_batch
  FROM batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  IF v_batch.has_mixing = true THEN
    RAISE EXCEPTION 'Mixing report already exists for this batch';
  END IF;

  SELECT id INTO v_existing_report_id
  FROM mixing_reports
  WHERE batch_id = p_batch_id
  FOR UPDATE;

  v_should_deduct := COALESCE(v_batch.inventory_deduction_source, 'none') <> 'batch';

  IF v_should_deduct THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_rm_usage, '[]'::jsonb))
    LOOP
      v_rm_id := NULLIF(v_item->>'rawMaterialId', '')::uuid;
      IF v_rm_id IS NULL THEN CONTINUE; END IF;

      v_used_qty := COALESCE(
        NULLIF(v_item->>'usedQtyKg', '')::numeric,
        NULLIF(v_item->>'requiredQtyKgThisMix', '')::numeric,
        NULLIF(v_item->>'requiredQtyKg', '')::numeric,
        0
      );
      IF v_used_qty <= 0 THEN CONTINUE; END IF;

      SELECT qty_kg, name
      INTO v_current_qty, v_rm_name
      FROM raw_materials
      WHERE id = v_rm_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Raw material % not found', v_rm_id;
      END IF;

      v_new_qty := ROUND(v_current_qty - v_used_qty, 4);
      IF v_new_qty < 0 THEN
        RAISE EXCEPTION 'RM is not enough to make this batch of products: %. Required: % kg, Available: % kg',
          v_rm_name,
          v_used_qty,
          ROUND(v_current_qty, 4);
      END IF;

      UPDATE raw_materials
      SET
        qty_kg = v_new_qty,
        updated_at = now()
      WHERE id = v_rm_id;
    END LOOP;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_non_med_usage, '[]'::jsonb))
    LOOP
      v_rm_id := NULLIF(v_item->>'rawMaterialId', '')::uuid;
      IF v_rm_id IS NULL THEN CONTINUE; END IF;

      v_used_qty := COALESCE(
        NULLIF(v_item->>'usedQtyKg', '')::numeric,
        NULLIF(v_item->>'requiredQtyKgThisMix', '')::numeric,
        NULLIF(v_item->>'requiredQtyKg', '')::numeric,
        0
      );
      IF v_used_qty <= 0 THEN CONTINUE; END IF;

      SELECT qty_kg, name
      INTO v_current_qty, v_rm_name
      FROM raw_materials
      WHERE id = v_rm_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Raw material % not found', v_rm_id;
      END IF;

      v_new_qty := ROUND(v_current_qty - v_used_qty, 4);
      IF v_new_qty < 0 THEN
        RAISE EXCEPTION 'RM is not enough to make this batch of products: %. Required: % kg, Available: % kg',
          v_rm_name,
          v_used_qty,
          ROUND(v_current_qty, 4);
      END IF;

      UPDATE raw_materials
      SET
        qty_kg = v_new_qty,
        updated_at = now()
      WHERE id = v_rm_id;
    END LOOP;
  END IF;

  IF v_existing_report_id IS NULL THEN
    INSERT INTO mixing_reports (
      batch_id,
      brand_id,
      product_id,
      batch_code,
      brand_name,
      product_name,
      mixing_date,
      mixed_powder_name,
      mixed_powder_qty_kg,
      total_formula_qty_kg,
      total_mixed_qty_kg,
      existing_mixed_powder_used_kg,
      rm_usage,
      non_med_usage,
      mixing_dates,
      mixing_notes,
      end_date,
      status,
      remarks
    )
    VALUES (
      p_batch_id,
      p_brand_id,
      p_product_id,
      p_batch_code,
      p_brand_name,
      p_product_name,
      p_mixing_date,
      p_mixed_powder_name,
      p_mixed_powder_qty_kg,
      p_total_formula_qty_kg,
      p_total_mixed_qty_kg,
      p_existing_mixed_powder_used_kg,
      COALESCE(p_rm_usage, '[]'::jsonb),
      COALESCE(p_non_med_usage, '[]'::jsonb),
      COALESCE(p_mixing_dates, '{}'),
      COALESCE(p_mixing_notes, ''),
      p_mixing_date,
      'Mixing Completed',
      NULLIF(btrim(p_mixing_notes), '')
    )
    RETURNING id INTO v_report_id;
  ELSE
    UPDATE mixing_reports
    SET
      brand_id = p_brand_id,
      product_id = p_product_id,
      batch_code = p_batch_code,
      brand_name = p_brand_name,
      product_name = p_product_name,
      mixing_date = p_mixing_date,
      mixed_powder_name = p_mixed_powder_name,
      mixed_powder_qty_kg = p_mixed_powder_qty_kg,
      total_formula_qty_kg = p_total_formula_qty_kg,
      total_mixed_qty_kg = p_total_mixed_qty_kg,
      existing_mixed_powder_used_kg = p_existing_mixed_powder_used_kg,
      rm_usage = COALESCE(p_rm_usage, '[]'::jsonb),
      non_med_usage = COALESCE(p_non_med_usage, '[]'::jsonb),
      mixing_dates = COALESCE(p_mixing_dates, '{}'),
      mixing_notes = COALESCE(p_mixing_notes, ''),
      end_date = COALESCE(end_date, p_mixing_date),
      status = 'Mixing Completed',
      remarks = COALESCE(NULLIF(btrim(remarks), ''), NULLIF(btrim(p_mixing_notes), '')),
      updated_at = now()
    WHERE id = v_existing_report_id
    RETURNING id INTO v_report_id;
  END IF;

  UPDATE batches
  SET
    has_mixing = true,
    status = 'ngpPending',
    batch_status = 'Mixing Completed',
    current_stage = 'njp',
    inventory_deducted = CASE WHEN v_should_deduct THEN true ELSE inventory_deducted END,
    inventory_usage = CASE
      WHEN v_should_deduct THEN COALESCE(p_rm_usage, '[]'::jsonb) || COALESCE(p_non_med_usage, '[]'::jsonb)
      ELSE inventory_usage
    END,
    inventory_deduction_source = CASE WHEN v_should_deduct THEN 'mixing' ELSE inventory_deduction_source END,
    updated_at = now()
  WHERE id = p_batch_id;

  RETURN v_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_mixing_report_with_deduction(
  uuid, uuid, uuid, jsonb, jsonb, text[], text, text, text, text, bigint, text, numeric, numeric, numeric, numeric
) TO authenticated, service_role, anon;
