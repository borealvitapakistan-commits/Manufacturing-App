-- ============================================================================
-- 010_batch_inventory_deduction.sql
-- Reserve raw material stock when a batch is created.
-- ============================================================================

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS inventory_usage jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS inventory_deduction_source text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'batches_inventory_usage_is_array'
  ) THEN
    ALTER TABLE batches
      ADD CONSTRAINT batches_inventory_usage_is_array
      CHECK (jsonb_typeof(inventory_usage) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'batches_inventory_deduction_source_valid'
  ) THEN
    ALTER TABLE batches
      ADD CONSTRAINT batches_inventory_deduction_source_valid
      CHECK (inventory_deduction_source IN ('none', 'batch', 'mixing'));
  END IF;
END $$;

UPDATE batches AS b
SET
  inventory_usage = COALESCE(m.rm_usage, '[]'::jsonb) || COALESCE(m.non_med_usage, '[]'::jsonb),
  inventory_deduction_source = 'mixing'
FROM mixing_reports AS m
WHERE
  m.batch_id = b.id
  AND b.inventory_deducted = true
  AND b.inventory_deduction_source = 'none';

CREATE OR REPLACE FUNCTION parse_label_claim_mg(
  p_label text,
  p_stored_mg numeric DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text := lower(COALESCE(p_label, ''));
  v_match text[];
  v_value numeric;
  v_unit text;
BEGIN
  v_match := regexp_match(v_label, '([0-9]+(\.[0-9]+)?)[[:space:]]*(mg|mcg|ug|g)?');
  IF v_match IS NOT NULL THEN
    v_value := v_match[1]::numeric;
    v_unit := COALESCE(v_match[3], 'mg');

    IF v_unit IN ('mcg', 'ug') THEN
      RETURN v_value / 1000;
    ELSIF v_unit = 'g' THEN
      RETURN v_value * 1000;
    END IF;

    RETURN v_value;
  END IF;

  IF p_stored_mg IS NOT NULL AND p_stored_mg > 0 THEN
    RETURN p_stored_mg;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION restore_batch_inventory_usage(
  p_usage jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_rm_id uuid;
  v_used_qty numeric;
  v_restore_map jsonb := '{}'::jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_usage, '[]'::jsonb))
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

    UPDATE raw_materials
    SET
      qty_kg = ROUND(qty_kg + v_used_qty, 4),
      updated_at = now()
    WHERE id = v_rm_id;

    v_restore_map := jsonb_set(
      v_restore_map,
      ARRAY[v_rm_id::text],
      to_jsonb(COALESCE((v_restore_map->>v_rm_id::text)::numeric, 0) + v_used_qty)
    );
  END LOOP;

  RETURN v_restore_map;
END;
$$;

CREATE OR REPLACE FUNCTION reserve_batch_inventory(
  p_product_id uuid,
  p_total_units integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rm_list jsonb;
  v_item jsonb;
  v_rm record;
  v_rm_id uuid;
  v_stored_mg numeric;
  v_mg_per_unit numeric;
  v_required_qty numeric;
  v_new_qty numeric;
  v_usage jsonb := '[]'::jsonb;
BEGIN
  IF p_total_units IS NULL OR p_total_units <= 0 THEN
    RETURN v_usage;
  END IF;

  SELECT rm INTO v_rm_list
  FROM products
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_rm_list, '[]'::jsonb))
  LOOP
    v_rm_id := NULL;
    IF NULLIF(v_item->>'rawMaterialId', '') IS NOT NULL THEN
      v_rm_id := (v_item->>'rawMaterialId')::uuid;
    END IF;

    v_stored_mg := NULL;
    IF COALESCE(v_item->>'labelClaimMgPerUnit', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN
      v_stored_mg := (v_item->>'labelClaimMgPerUnit')::numeric;
    END IF;

    v_mg_per_unit := parse_label_claim_mg(v_item->>'labelClaim', v_stored_mg);
    IF v_mg_per_unit IS NULL OR v_mg_per_unit <= 0 THEN
      CONTINUE;
    END IF;

    SELECT id, code, name, qty_kg
    INTO v_rm
    FROM raw_materials
    WHERE
      (v_rm_id IS NOT NULL AND id = v_rm_id)
      OR (
        NULLIF(v_item->>'rawMaterialCode', '') IS NOT NULL
        AND lower(code) = lower(v_item->>'rawMaterialCode')
      )
      OR (
        NULLIF(v_item->>'rawMaterial', '') IS NOT NULL
        AND lower(name) = lower(v_item->>'rawMaterial')
      )
    ORDER BY
      CASE WHEN v_rm_id IS NOT NULL AND id = v_rm_id THEN 0 ELSE 1 END,
      name
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RM is not enough to make this batch of products: % is not linked to stock',
        COALESCE(v_item->>'rawMaterialCode', v_item->>'rawMaterial', 'Unknown RM');
    END IF;

    v_required_qty := ROUND((p_total_units::numeric * v_mg_per_unit) / 1000000, 4);
    IF v_required_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_rm.qty_kg < v_required_qty THEN
      RAISE EXCEPTION 'RM is not enough to make this batch of products: %. Required: % kg, Available: % kg',
        v_rm.name,
        v_required_qty,
        ROUND(v_rm.qty_kg, 4);
    END IF;

    v_new_qty := ROUND(v_rm.qty_kg - v_required_qty, 4);

    UPDATE raw_materials
    SET
      qty_kg = v_new_qty,
      updated_at = now()
    WHERE id = v_rm.id;

    v_usage := v_usage || jsonb_build_array(jsonb_build_object(
      'rawMaterialId', v_rm.id,
      'rawMaterialCode', v_rm.code,
      'rawMaterialName', v_rm.name,
      'labelClaimMgPerUnit', v_mg_per_unit,
      'totalUnits', p_total_units,
      'requiredQtyKg', v_required_qty,
      'requiredQtyKgThisMix', v_required_qty,
      'qtyBeforeKg', ROUND(v_rm.qty_kg, 4),
      'qtyAfterKg', v_new_qty,
      'usedQtyKg', v_required_qty
    ));
  END LOOP;

  RETURN v_usage;
END;
$$;

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
  p_created_by text DEFAULT NULL
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
  p_created_by text DEFAULT NULL
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
    mixing_notes
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
    COALESCE(p_mixing_notes, '')
  )
  RETURNING id INTO v_report_id;

  UPDATE batches
  SET
    has_mixing = true,
    status = 'ngpPending',
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

CREATE OR REPLACE FUNCTION delete_mixing_report_with_restore(p_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report record;
  v_restore_map jsonb := '{}'::jsonb;
  v_source text;
  v_inventory_deducted boolean;
  v_restore_from_mixing boolean;
BEGIN
  SELECT * INTO v_report FROM mixing_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mixing report not found';
  END IF;

  SELECT
    COALESCE(inventory_deduction_source, 'none'),
    COALESCE(inventory_deducted, false)
  INTO v_source, v_inventory_deducted
  FROM batches
  WHERE id = v_report.batch_id
  FOR UPDATE;

  v_restore_from_mixing := v_source = 'mixing' OR (v_source = 'none' AND v_inventory_deducted);

  IF v_restore_from_mixing THEN
    v_restore_map := restore_batch_inventory_usage(
      COALESCE(v_report.rm_usage, '[]'::jsonb) || COALESCE(v_report.non_med_usage, '[]'::jsonb)
    );
  END IF;

  UPDATE batches
  SET
    has_mixing = false,
    status = 'mixingPending',
    inventory_deducted = CASE WHEN v_restore_from_mixing THEN false ELSE inventory_deducted END,
    inventory_usage = CASE WHEN v_restore_from_mixing THEN '[]'::jsonb ELSE inventory_usage END,
    inventory_deduction_source = CASE WHEN v_restore_from_mixing THEN 'none' ELSE inventory_deduction_source END,
    updated_at = now()
  WHERE id = v_report.batch_id;

  DELETE FROM mixing_reports WHERE id = p_report_id;

  RETURN jsonb_build_object('restored', v_restore_map);
END;
$$;

CREATE OR REPLACE FUNCTION delete_batch_cascade(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_rm_id uuid;
  v_used_qty numeric;
  v_restore_map jsonb := '{}'::jsonb;
  v_mixing_count integer := 0;
  v_njp_count integer := 0;
  v_assembly_count integer := 0;
  v_report record;
  v_batch batches%ROWTYPE;
BEGIN
  SELECT * INTO v_batch
  FROM batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  SELECT COUNT(*) INTO v_mixing_count FROM mixing_reports WHERE batch_id = p_batch_id;
  SELECT COUNT(*) INTO v_njp_count FROM njp_reports WHERE batch_id = p_batch_id;
  SELECT COUNT(*) INTO v_assembly_count FROM assembly_reports WHERE batch_id = p_batch_id;

  IF COALESCE(v_batch.inventory_deduction_source, 'none') = 'batch' THEN
    v_restore_map := restore_batch_inventory_usage(v_batch.inventory_usage);
  ELSE
    FOR v_report IN SELECT rm_usage, non_med_usage FROM mixing_reports WHERE batch_id = p_batch_id
    LOOP
      FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_report.rm_usage, '[]'::jsonb))
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

        v_restore_map := jsonb_set(
          v_restore_map,
          ARRAY[v_rm_id::text],
          to_jsonb(COALESCE((v_restore_map->>v_rm_id::text)::numeric, 0) + v_used_qty)
        );
      END LOOP;

      FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_report.non_med_usage, '[]'::jsonb))
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

        v_restore_map := jsonb_set(
          v_restore_map,
          ARRAY[v_rm_id::text],
          to_jsonb(COALESCE((v_restore_map->>v_rm_id::text)::numeric, 0) + v_used_qty)
        );
      END LOOP;
    END LOOP;

    FOR v_rm_id IN SELECT (key)::uuid FROM jsonb_each_text(v_restore_map) AS x(key, value)
    LOOP
      v_used_qty := (v_restore_map->>v_rm_id::text)::numeric;
      UPDATE raw_materials
      SET
        qty_kg = ROUND(qty_kg + v_used_qty, 4),
        updated_at = now()
      WHERE id = v_rm_id;
    END LOOP;
  END IF;

  DELETE FROM mixing_reports WHERE batch_id = p_batch_id;
  DELETE FROM njp_reports WHERE batch_id = p_batch_id;
  DELETE FROM assembly_reports WHERE batch_id = p_batch_id;
  DELETE FROM batches WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'restored', v_restore_map,
    'deleted', jsonb_build_object(
      'mixing', v_mixing_count,
      'njp', v_njp_count,
      'assembly', v_assembly_count
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION create_batch_with_inventory_deduction(uuid, text, text, text, uuid, text, dosage_form, integer, integer, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION update_batch_with_inventory_deduction(uuid, uuid, text, text, text, uuid, text, dosage_form, integer, integer, integer, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION create_batch_with_inventory_deduction(uuid, text, text, text, uuid, text, dosage_form, integer, integer, integer, text, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION update_batch_with_inventory_deduction(uuid, uuid, text, text, text, uuid, text, dosage_form, integer, integer, integer, text, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION create_mixing_report_with_deduction(uuid, uuid, uuid, jsonb, jsonb, text[], text, text, text, text, bigint, text, numeric, numeric, numeric, numeric) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION delete_mixing_report_with_restore(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION delete_batch_cascade(uuid) TO authenticated, service_role, anon;
