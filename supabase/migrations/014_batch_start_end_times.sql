-- ============================================================================
-- 014_batch_start_end_times.sql
-- Adds preparation start/end times to batches and updates batch RPCs.
-- ============================================================================

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_time text;

DROP FUNCTION IF EXISTS create_batch_with_inventory_deduction(
  uuid, text, text, text, uuid, text, dosage_form, integer, integer, integer, text, text
);

DROP FUNCTION IF EXISTS update_batch_with_inventory_deduction(
  uuid, uuid, text, text, text, uuid, text, dosage_form, integer, integer, integer, text, text
);

DROP FUNCTION IF EXISTS create_batch_with_inventory_deduction(
  uuid, text, text, text, uuid, text, dosage_form, integer, integer, integer, text, text, text, text
);

DROP FUNCTION IF EXISTS update_batch_with_inventory_deduction(
  uuid, uuid, text, text, text, uuid, text, dosage_form, integer, integer, integer, text, text, text, text
);

CREATE OR REPLACE FUNCTION create_batch_with_inventory_deduction(
  p_brand_id uuid,
  p_brand_name text,
  p_brand_code_prefix text,
  p_batch_code text,
  p_product_id uuid,
  p_product_name text,
  p_dosage_form dosage_form,
  p_units_per_container integer DEFAULT NULL,
  p_container_count integer DEFAULT 0,
  p_total_units integer DEFAULT NULL,
  p_notes text DEFAULT '',
  p_created_by text DEFAULT NULL,
  p_start_time text DEFAULT NULL,
  p_end_time text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
  v_usage jsonb;
  v_deducted boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM brands WHERE id = p_brand_id) THEN
    RAISE EXCEPTION 'Brand not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  v_usage := reserve_batch_inventory(p_product_id, p_total_units);
  v_deducted := jsonb_array_length(COALESCE(v_usage, '[]'::jsonb)) > 0;

  INSERT INTO batches (
    brand_id,
    brand_name,
    brand_code_prefix,
    batch_code,
    product_id,
    product_name,
    dosage_form,
    units_per_container,
    container_count,
    total_units,
    start_time,
    end_time,
    notes,
    status,
    has_mixing,
    has_njp,
    has_assembly,
    inventory_deducted,
    inventory_usage,
    inventory_deduction_source,
    created_by
  )
  VALUES (
    p_brand_id,
    p_brand_name,
    p_brand_code_prefix,
    p_batch_code,
    p_product_id,
    p_product_name,
    p_dosage_form,
    p_units_per_container,
    p_container_count,
    p_total_units,
    NULLIF(btrim(p_start_time), ''),
    NULLIF(btrim(p_end_time), ''),
    COALESCE(p_notes, ''),
    'mixingPending',
    false,
    false,
    false,
    v_deducted,
    COALESCE(v_usage, '[]'::jsonb),
    CASE WHEN v_deducted THEN 'batch' ELSE 'none' END,
    p_created_by
  )
  RETURNING id INTO v_batch_id;

  RETURN v_batch_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_batch_with_inventory_deduction(
  p_batch_id uuid,
  p_brand_id uuid,
  p_brand_name text,
  p_brand_code_prefix text,
  p_batch_code text,
  p_product_id uuid,
  p_product_name text,
  p_dosage_form dosage_form,
  p_units_per_container integer DEFAULT NULL,
  p_container_count integer DEFAULT 0,
  p_total_units integer DEFAULT NULL,
  p_notes text DEFAULT '',
  p_created_by text DEFAULT NULL,
  p_start_time text DEFAULT NULL,
  p_end_time text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing batches%ROWTYPE;
  v_usage jsonb;
  v_source text;
  v_deducted boolean;
  v_inventory_changed boolean;
BEGIN
  SELECT * INTO v_existing
  FROM batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  v_inventory_changed :=
    p_product_id IS DISTINCT FROM v_existing.product_id
    OR p_units_per_container IS DISTINCT FROM v_existing.units_per_container
    OR p_container_count IS DISTINCT FROM v_existing.container_count
    OR p_total_units IS DISTINCT FROM v_existing.total_units;

  IF v_inventory_changed AND (v_existing.has_mixing OR v_existing.has_njp OR v_existing.has_assembly) THEN
    RAISE EXCEPTION 'Cannot change product or quantity after workflow has started';
  END IF;

  v_usage := COALESCE(v_existing.inventory_usage, '[]'::jsonb);
  v_source := COALESCE(v_existing.inventory_deduction_source, 'none');
  v_deducted := COALESCE(v_existing.inventory_deducted, false);

  IF v_inventory_changed THEN
    IF v_source = 'batch' AND v_deducted THEN
      PERFORM restore_batch_inventory_usage(v_usage);
    END IF;

    v_usage := reserve_batch_inventory(p_product_id, p_total_units);
    v_deducted := jsonb_array_length(COALESCE(v_usage, '[]'::jsonb)) > 0;
    v_source := CASE WHEN v_deducted THEN 'batch' ELSE 'none' END;
  END IF;

  UPDATE batches
  SET
    brand_id = p_brand_id,
    brand_name = p_brand_name,
    brand_code_prefix = p_brand_code_prefix,
    batch_code = p_batch_code,
    product_id = p_product_id,
    product_name = p_product_name,
    dosage_form = p_dosage_form,
    units_per_container = p_units_per_container,
    container_count = p_container_count,
    total_units = p_total_units,
    start_time = NULLIF(btrim(p_start_time), ''),
    end_time = NULLIF(btrim(p_end_time), ''),
    notes = COALESCE(p_notes, ''),
    inventory_deducted = v_deducted,
    inventory_usage = COALESCE(v_usage, '[]'::jsonb),
    inventory_deduction_source = v_source,
    created_by = COALESCE(p_created_by, created_by),
    updated_at = now()
  WHERE id = p_batch_id;

  RETURN p_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION create_batch_with_inventory_deduction(
  uuid, text, text, text, uuid, text, dosage_form, integer, integer, integer, text, text, text, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION update_batch_with_inventory_deduction(
  uuid, uuid, text, text, text, uuid, text, dosage_form, integer, integer, integer, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_batch_with_inventory_deduction(
  uuid, text, text, text, uuid, text, dosage_form, integer, integer, integer, text, text, text, text
) TO authenticated, service_role, anon;

GRANT EXECUTE ON FUNCTION update_batch_with_inventory_deduction(
  uuid, uuid, text, text, text, uuid, text, dosage_form, integer, integer, integer, text, text, text, text
) TO authenticated, service_role, anon;
