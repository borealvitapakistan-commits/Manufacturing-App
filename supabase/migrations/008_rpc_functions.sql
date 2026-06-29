-- ============================================================================
-- 008_rpc_functions.sql
-- Transactional RPC functions used by the app.
-- ============================================================================

DROP FUNCTION IF EXISTS create_mixing_report_with_deduction(uuid, uuid, uuid, jsonb, jsonb, text[], text);
DROP FUNCTION IF EXISTS create_mixing_report_with_deduction(uuid, uuid, uuid, jsonb, jsonb, text[], text, text, text, text, bigint, text, numeric, numeric, numeric, numeric);

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
BEGIN
  IF NOT EXISTS (SELECT 1 FROM batches WHERE id = p_batch_id) THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  IF EXISTS (SELECT 1 FROM batches WHERE id = p_batch_id AND has_mixing = true) THEN
    RAISE EXCEPTION 'Mixing report already exists for this batch';
  END IF;

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
      RAISE EXCEPTION 'Insufficient stock for %', v_rm_name;
    END IF;

    UPDATE raw_materials
    SET qty_kg = v_new_qty
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
      RAISE EXCEPTION 'Insufficient stock for %', v_rm_name;
    END IF;

    UPDATE raw_materials
    SET qty_kg = v_new_qty
    WHERE id = v_rm_id;
  END LOOP;

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
    inventory_deducted = true
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
  v_item jsonb;
  v_rm_id uuid;
  v_used_qty numeric;
  v_restore_map jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_report FROM mixing_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mixing report not found';
  END IF;

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

    UPDATE raw_materials
    SET qty_kg = ROUND(qty_kg + v_used_qty, 4)
    WHERE id = v_rm_id;

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

    UPDATE raw_materials
    SET qty_kg = ROUND(qty_kg + v_used_qty, 4)
    WHERE id = v_rm_id;

    v_restore_map := jsonb_set(
      v_restore_map,
      ARRAY[v_rm_id::text],
      to_jsonb(COALESCE((v_restore_map->>v_rm_id::text)::numeric, 0) + v_used_qty)
    );
  END LOOP;

  UPDATE batches
  SET
    has_mixing = false,
    status = 'mixingPending',
    inventory_deducted = false
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
BEGIN
  SELECT COUNT(*) INTO v_mixing_count FROM mixing_reports WHERE batch_id = p_batch_id;
  SELECT COUNT(*) INTO v_njp_count FROM njp_reports WHERE batch_id = p_batch_id;
  SELECT COUNT(*) INTO v_assembly_count FROM assembly_reports WHERE batch_id = p_batch_id;

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
    SET qty_kg = ROUND(qty_kg + v_used_qty, 4)
    WHERE id = v_rm_id;
  END LOOP;

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

CREATE OR REPLACE FUNCTION save_loan_with_expense(
  p_employee_id uuid,
  p_amount numeric,
  p_note text,
  p_book_id uuid,
  p_given_from text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_name text;
  v_now bigint;
BEGIN
  SELECT full_name INTO v_employee_name FROM employees WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM expense_books WHERE id = p_book_id) THEN
    RAISE EXCEPTION 'Expense book not found';
  END IF;

  v_now := (EXTRACT(EPOCH FROM now()) * 1000)::bigint;

  INSERT INTO employee_loans (employee_id, amount, date, description)
  VALUES (
    p_employee_id,
    p_amount,
    v_now,
    COALESCE(NULLIF(p_note, ''), 'Loan given to ' || v_employee_name)
  );

  INSERT INTO expenses (book_id, date, description, given_from, given_to, amount, direction, type, tags)
  VALUES (
    p_book_id,
    v_now,
    'Loan taken by ' || v_employee_name,
    p_given_from,
    v_employee_name,
    p_amount,
    'debit',
    'Other',
    ARRAY[v_employee_name, 'loan']
  );
END;
$$;

REVOKE ALL ON FUNCTION create_mixing_report_with_deduction(uuid, uuid, uuid, jsonb, jsonb, text[], text, text, text, text, bigint, text, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION delete_mixing_report_with_restore(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION delete_batch_cascade(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION save_loan_with_expense(uuid, numeric, text, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION create_mixing_report_with_deduction(uuid, uuid, uuid, jsonb, jsonb, text[], text, text, text, text, bigint, text, numeric, numeric, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_mixing_report_with_restore(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_batch_cascade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_loan_with_expense(uuid, numeric, text, uuid, text) TO authenticated, service_role;
