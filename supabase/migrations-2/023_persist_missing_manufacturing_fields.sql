-- A handful of fields on the Mixing, Encapsulation, and Assembly create/edit
-- forms were captured, sent to the backend, and only ever written into a
-- record_snapshot JSONB blob - never a real column. That means they were
-- never queryable, reportable, or safe from being lost if record_snapshot
-- were ever rebuilt from column data. This migration adds the missing
-- columns; the corresponding Python/RPC changes that actually populate them
-- ship alongside this file.
--
-- Confirmed via a full field-by-field audit of all three create pages
-- against their tables. Deliberately excludes fields that are redundant
-- with an existing column or fully derivable via an existing FK join
-- (e.g. a duplicate "reason" key that repeats changeReason, raw material
-- CODE per ingredient which is derivable via the existing raw_material_id
-- link) - those are fine left in record_snapshot only.

-- ---------------------------------------------------------------------------
-- Mixing: which prior mixing was reused, and each ingredient's RM category.
-- ---------------------------------------------------------------------------

alter table public.mixings
    add column if not exists existing_mixed_powder_id uuid references public.mixings(id) on delete set null;

alter table public.mixing_ingredients
    add column if not exists raw_material_category_id uuid references public.raw_material_categories(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Encapsulation: Duster Check / Vacuum Check (the two fields specifically
-- reported missing), plus temperature, humidity, operator name, and reason.
-- ---------------------------------------------------------------------------

alter table public.encapsulations
    add column if not exists duster_check boolean not null default false,
    add column if not exists vacuum_check boolean not null default false,
    add column if not exists temperature_c numeric(6, 2),
    add column if not exists humidity_percent numeric(6, 2),
    add column if not exists operator_name text,
    add column if not exists reason text;

-- ---------------------------------------------------------------------------
-- Assembly: Product link, Bottle/Lid inventory selection, and the
-- Quality Control / Packaging date+time fields.
-- ---------------------------------------------------------------------------

alter table public.assemblies
    add column if not exists product_id uuid references public.products(id) on delete set null,
    add column if not exists bottle_lid_id uuid references public.inventory_items(id) on delete set null,
    add column if not exists quality_control_date date,
    add column if not exists quality_control_start_time time,
    add column if not exists quality_control_end_time time,
    add column if not exists packaging_date date,
    add column if not exists packaging_start_time time,
    add column if not exists packaging_end_time time;

-- ---------------------------------------------------------------------------
-- save_assembly: write the four new Assembly-level fields (product_id,
-- bottle_lid_id, and the six QC/Packaging fields) on both insert and
-- update. next_brand_batch_code() and everything else in this function is
-- unchanged from 022_assembly_bare_batch_code.sql - only the columns below
-- and the bottle-lid reversal read are different.
-- ---------------------------------------------------------------------------

create or replace function public.save_assembly(p_assembly_id uuid, p_payload jsonb)
returns uuid
language plpgsql
as $$
declare
    v_existing public.assemblies;
    v_previous_codes jsonb := '{}'::jsonb;
    v_brand_ref jsonb;
    v_brand_id uuid;
    v_batch_code text;
    v_assembly_code text;
    v_brand_lots jsonb := '[]'::jsonb;
    v_primary_code text;
    v_assembly_id uuid;
    v_encapsulation_id uuid := (p_payload->>'encapsulationId')::uuid;
    v_capsule_item_id uuid;
    v_capsule_lot_id uuid;
    v_bottle_lid_id uuid := nullif(p_payload->>'bottleLidId', '')::uuid;
    v_label_id uuid := nullif(p_payload->>'labelId', '')::uuid;
    v_bottle_quantity integer := coalesce((p_payload->>'bottleQuantity')::integer, 0);
    v_total_units_used numeric := coalesce((p_payload->>'totalUnitsUsed')::numeric, 0);
    v_total_labels_used integer := coalesce((p_payload->>'totalLabelsUsed')::integer, 0);
    v_bottle_type text := coalesce(p_payload->>'bottleType', 'capsule');
    v_bottle_size integer := nullif(p_payload->>'bottleSize', '')::integer;
    v_location_id uuid;
    v_location text := p_payload->>'location';
    v_remaining numeric;
    v_row record;
    v_lot jsonb;
    v_item_id uuid;
    v_lot_id uuid;
    v_used numeric;
    v_prev_bottle_lid_id uuid;
    v_prev_label_id uuid;
    v_prev_capsule_item_id uuid;
    v_prev_capsule_lot_id uuid;
    v_sort_order integer;
begin
    if v_encapsulation_id is null then
        raise exception 'Select the Encapsulation capsule record that will be used for Assembly.';
    end if;

    select output_capsule_inventory_item_id, output_capsule_lot_id
    into v_capsule_item_id, v_capsule_lot_id
    from public.encapsulations
    where id = v_encapsulation_id;

    if v_capsule_item_id is null then
        raise exception 'Selected Encapsulation has no available capsule inventory.';
    end if;

    -- ------------------------------------------------------------------
    -- Update path: lock the existing row, capture what needs restoring,
    -- reverse previous finished-goods output and inventory consumption.
    -- ------------------------------------------------------------------
    if p_assembly_id is not null then
        select * into v_existing from public.assemblies where id = p_assembly_id for update;
        if not found then
            raise exception 'Assembly record not found';
        end if;

        v_prev_bottle_lid_id := v_existing.bottle_lid_id;
        v_prev_label_id := v_existing.label_id;

        -- Restore capsule inventory against the PREVIOUS Encapsulation link,
        -- not the newly-requested one - they can differ if the user changed
        -- which Encapsulation record this Assembly points to.
        select output_capsule_inventory_item_id, output_capsule_lot_id
        into v_prev_capsule_item_id, v_prev_capsule_lot_id
        from public.encapsulations
        where id = v_existing.encapsulation_id;

        -- Reverse finished goods already produced for this assembly.
        for v_row in
            select * from public.assembly_brand_lots where assembly_id = p_assembly_id
        loop
            if v_row.finished_good_inventory_item_id is not null then
                select coalesce(sum(quantity), 0)
                into v_remaining
                from public.inventory_balances
                where inventory_item_id = v_row.finished_good_inventory_item_id
                  and inventory_lot_id is not distinct from v_row.finished_good_lot_id;

                if v_row.bottles_qty > v_remaining then
                    raise exception 'Cannot edit or delete this Assembly because finished goods have already been consumed from it.';
                end if;

                perform public.apply_inventory_movement(
                    v_row.finished_good_inventory_item_id,
                    v_row.finished_good_lot_id,
                    null,
                    -v_row.bottles_qty,
                    'adjust',
                    'assembly',
                    p_assembly_id,
                    'Assembly edit/delete reversed finished goods output',
                    jsonb_build_object('batchCode', v_row.batch_code),
                    gen_random_uuid()::text
                );
            end if;

            -- Capture BOTH codes as previously assigned, so editing this
            -- assembly reuses exactly what each brand already had, in
            -- whichever format it was originally stored in. Codes are
            -- never rewritten on edit.
            v_previous_codes := v_previous_codes || jsonb_build_object(
                v_row.brand_id::text,
                jsonb_build_object(
                    'batchCode', v_row.batch_code,
                    'assemblyCode', coalesce(v_row.assembly_code, v_row.batch_code)
                )
            );
        end loop;

        -- Restore Encapsulation capsule inventory previously consumed.
        if v_existing.capsules_received_qty > 0 and v_prev_capsule_item_id is not null then
            perform public.apply_inventory_movement(
                v_prev_capsule_item_id, v_prev_capsule_lot_id, null,
                v_existing.capsules_received_qty, 'adjust',
                'assembly', p_assembly_id,
                'Assembly edit/delete restored Encapsulation capsules',
                jsonb_build_object('encapsulationId', v_existing.encapsulation_id), gen_random_uuid()::text
            );
        end if;

        -- Restore bottle-lid inventory previously consumed.
        if v_prev_bottle_lid_id is not null and v_existing.total_bottles_made > 0 then
            perform public.apply_inventory_movement(
                v_prev_bottle_lid_id, null, null,
                v_existing.total_bottles_made, 'adjust',
                'assembly', p_assembly_id,
                'Assembly edit/delete restored bottle inventory', '{}'::jsonb, gen_random_uuid()::text
            );
        end if;

        -- Restore label inventory previously consumed.
        if v_prev_label_id is not null and v_existing.total_labels_used > 0 then
            perform public.apply_inventory_movement(
                v_prev_label_id, null, null,
                v_existing.total_labels_used, 'adjust',
                'assembly', p_assembly_id,
                'Assembly edit/delete restored label inventory', '{}'::jsonb, gen_random_uuid()::text
            );
        end if;

        delete from public.assembly_sessions where assembly_id = p_assembly_id;
        delete from public.assembly_brands where assembly_id = p_assembly_id;
        delete from public.assembly_brand_lots where assembly_id = p_assembly_id;
    end if;

    -- ------------------------------------------------------------------
    -- Assign per-brand codes - reuse the existing codes for brands already
    -- on this assembly (so "Assembly code must be read-only after
    -- creation" holds), generate fresh ones otherwise. Assembly Code keeps
    -- today's A-{PREFIX}-{SEQ} format from next_brand_batch_code()
    -- (unmodified); Batch Code is the same sequence number, bare.
    -- ------------------------------------------------------------------
    if jsonb_array_length(coalesce(p_payload->'brands', '[]'::jsonb)) = 0 then
        raise exception 'At least one brand is required to create Assembly batch code.';
    end if;

    for v_brand_ref in select * from jsonb_array_elements(p_payload->'brands')
    loop
        v_brand_id := nullif(v_brand_ref->>'id', '')::uuid;
        if v_brand_id is null then
            continue;
        end if;

        if v_previous_codes ? v_brand_id::text then
            v_batch_code := v_previous_codes->v_brand_id::text->>'batchCode';
            v_assembly_code := v_previous_codes->v_brand_id::text->>'assemblyCode';
        else
            v_assembly_code := public.next_brand_batch_code(v_brand_id);
            v_batch_code := regexp_replace(v_assembly_code, '^A-|-', '', 'g');
        end if;

        v_brand_lots := v_brand_lots || jsonb_build_object(
            'brandId', v_brand_id,
            'batchCode', v_batch_code,
            'assemblyCode', v_assembly_code,
            'bottlesQty', v_bottle_quantity
        );
    end loop;

    if jsonb_array_length(v_brand_lots) = 0 then
        raise exception 'At least one brand is required to create Assembly batch code.';
    end if;

    v_primary_code := v_brand_lots->0->>'assemblyCode';
    v_location_id := public.ensure_location_id(v_location);

    -- ------------------------------------------------------------------
    -- Insert or update the assemblies row. assembly_code is set only on
    -- creation and never touched on update.
    -- ------------------------------------------------------------------
    if p_assembly_id is null then
        insert into public.assemblies (
            assembly_code, batch_code, encapsulation_id,
            product_id, bottle_lid_id,
            location_id, location_text, box_number,
            bottle_type, bottle_size, capsule_weight_mg,
            capsules_received_qty, capsules_received_kg,
            capsules_per_bottle, total_bottles_made, total_labels_used,
            remaining_capsules_qty, bottle_cc, filled_bottle_weight, weight_unit,
            production_date, expiry_date, status, operator_name, comments,
            quality_control_date, quality_control_start_time, quality_control_end_time,
            packaging_date, packaging_start_time, packaging_end_time,
            label_id, record_snapshot
        ) values (
            v_primary_code, p_payload->>'batchCode', v_encapsulation_id,
            nullif(p_payload->>'productId', '')::uuid, v_bottle_lid_id,
            v_location_id, v_location, p_payload->>'boxNo',
            v_bottle_type, v_bottle_size, (p_payload->>'capsuleWeightMg')::numeric,
            v_total_units_used, (p_payload->>'capsulesReceivedKg')::numeric,
            (p_payload->>'capsulesPerBottle')::integer, v_bottle_quantity, v_total_labels_used,
            0, nullif(p_payload->>'bottleCC', ''), (p_payload->>'filledBottleWeight')::numeric,
            coalesce(p_payload->>'weightUnit', 'g'),
            nullif(p_payload->>'productionDate', '')::date, nullif(p_payload->>'expiryDate', '')::date,
            coalesce(p_payload->>'status', 'underprocess'), p_payload->>'operatorName', p_payload->>'comments',
            nullif(p_payload->>'qualityControlDate', '')::date,
            nullif(p_payload->>'qualityControlStartTime', '')::time,
            nullif(p_payload->>'qualityControlEndTime', '')::time,
            nullif(p_payload->>'packagingDate', '')::date,
            nullif(p_payload->>'packagingStartTime', '')::time,
            nullif(p_payload->>'packagingEndTime', '')::time,
            v_label_id, coalesce(p_payload->'recordSnapshot', '{}'::jsonb)
        )
        returning id into v_assembly_id;
    else
        v_assembly_id := p_assembly_id;
        update public.assemblies set
            batch_code = coalesce(p_payload->>'batchCode', batch_code),
            encapsulation_id = v_encapsulation_id,
            product_id = nullif(p_payload->>'productId', '')::uuid,
            bottle_lid_id = v_bottle_lid_id,
            location_id = v_location_id,
            location_text = v_location,
            box_number = p_payload->>'boxNo',
            bottle_type = v_bottle_type,
            bottle_size = v_bottle_size,
            capsule_weight_mg = (p_payload->>'capsuleWeightMg')::numeric,
            capsules_received_qty = v_total_units_used,
            capsules_received_kg = (p_payload->>'capsulesReceivedKg')::numeric,
            capsules_per_bottle = (p_payload->>'capsulesPerBottle')::integer,
            total_bottles_made = v_bottle_quantity,
            total_labels_used = v_total_labels_used,
            remaining_capsules_qty = 0,
            bottle_cc = nullif(p_payload->>'bottleCC', ''),
            filled_bottle_weight = (p_payload->>'filledBottleWeight')::numeric,
            weight_unit = coalesce(p_payload->>'weightUnit', 'g'),
            production_date = nullif(p_payload->>'productionDate', '')::date,
            expiry_date = nullif(p_payload->>'expiryDate', '')::date,
            status = coalesce(p_payload->>'status', 'underprocess'),
            operator_name = p_payload->>'operatorName',
            comments = p_payload->>'comments',
            quality_control_date = nullif(p_payload->>'qualityControlDate', '')::date,
            quality_control_start_time = nullif(p_payload->>'qualityControlStartTime', '')::time,
            quality_control_end_time = nullif(p_payload->>'qualityControlEndTime', '')::time,
            packaging_date = nullif(p_payload->>'packagingDate', '')::date,
            packaging_start_time = nullif(p_payload->>'packagingStartTime', '')::time,
            packaging_end_time = nullif(p_payload->>'packagingEndTime', '')::time,
            label_id = v_label_id,
            version = version + 1,
            record_snapshot = coalesce(p_payload->'recordSnapshot', '{}'::jsonb)
        where id = p_assembly_id;
    end if;

    -- ------------------------------------------------------------------
    -- Consume Encapsulation capsule inventory (FIFO across lots, mirrors
    -- services/db.py:consume_inventory_quantity).
    -- ------------------------------------------------------------------
    if v_total_units_used > 0 then
        select coalesce(sum(quantity), 0) into v_remaining
        from public.inventory_balances where inventory_item_id = v_capsule_item_id;

        if v_total_units_used > v_remaining then
            raise exception 'Encapsulation capsules are not enough. Available: %, required: %.', v_remaining, v_total_units_used;
        end if;

        v_used := v_total_units_used;
        for v_row in
            select * from public.inventory_balances
            where inventory_item_id = v_capsule_item_id and quantity > 0
            order by inventory_lot_id nulls last
        loop
            exit when v_used <= 0;
            perform public.apply_inventory_movement(
                v_capsule_item_id, v_row.inventory_lot_id, v_row.location_id,
                -least(v_row.quantity, v_used), 'consume',
                'assembly', v_assembly_id,
                'Capsules used in ' || coalesce(v_primary_code, 'Assembly'),
                jsonb_build_object('encapsulationId', v_encapsulation_id), gen_random_uuid()::text
            );
            v_used := v_used - least(v_row.quantity, v_used);
        end loop;
    end if;

    -- Consume bottle-lid inventory (FIFO across each balance row's own lot/location).
    if v_bottle_lid_id is not null and v_bottle_quantity > 0 then
        select coalesce(sum(quantity), 0) into v_remaining
        from public.inventory_balances where inventory_item_id = v_bottle_lid_id;
        if v_bottle_quantity > v_remaining then
            raise exception 'Bottles are not enough. Available: %, required: %.', v_remaining, v_bottle_quantity;
        end if;

        v_used := v_bottle_quantity;
        for v_row in
            select * from public.inventory_balances
            where inventory_item_id = v_bottle_lid_id and quantity > 0
            order by inventory_lot_id nulls last
        loop
            exit when v_used <= 0;
            perform public.apply_inventory_movement(
                v_bottle_lid_id, v_row.inventory_lot_id, v_row.location_id,
                -least(v_row.quantity, v_used), 'consume',
                'assembly', v_assembly_id, 'Bottles used in ' || coalesce(v_primary_code, 'Assembly'),
                '{}'::jsonb, gen_random_uuid()::text
            );
            v_used := v_used - least(v_row.quantity, v_used);
        end loop;
    end if;

    -- Consume label inventory (FIFO across each balance row's own lot/location).
    if v_label_id is not null and v_total_labels_used > 0 then
        select coalesce(sum(quantity), 0) into v_remaining
        from public.inventory_balances where inventory_item_id = v_label_id;
        if v_total_labels_used > v_remaining then
            raise exception 'Labels are not enough. Available: %, required: %.', v_remaining, v_total_labels_used;
        end if;

        v_used := v_total_labels_used;
        for v_row in
            select * from public.inventory_balances
            where inventory_item_id = v_label_id and quantity > 0
            order by inventory_lot_id nulls last
        loop
            exit when v_used <= 0;
            perform public.apply_inventory_movement(
                v_label_id, v_row.inventory_lot_id, v_row.location_id,
                -least(v_row.quantity, v_used), 'consume',
                'assembly', v_assembly_id, 'Labels used in ' || coalesce(v_primary_code, 'Assembly'),
                '{}'::jsonb, gen_random_uuid()::text
            );
            v_used := v_used - least(v_row.quantity, v_used);
        end loop;
    end if;

    -- ------------------------------------------------------------------
    -- Produce finished goods per brand and (re)insert child rows.
    -- ------------------------------------------------------------------
    for v_lot in select * from jsonb_array_elements(v_brand_lots)
    loop
        v_brand_id := (v_lot->>'brandId')::uuid;
        v_batch_code := v_lot->>'batchCode';
        v_assembly_code := v_lot->>'assemblyCode';

        select id into v_item_id from public.inventory_items where item_code = v_batch_code;
        if v_item_id is null then
            insert into public.inventory_items (item_kind, item_code, item_name, unit_of_measure, metadata)
            values ('finished_good', v_batch_code, coalesce(p_payload->>'productName', 'Finished goods') || ' bottles', 'each',
                    jsonb_build_object('assemblyId', v_assembly_id, 'batchCode', v_batch_code, 'brandId', v_brand_id))
            returning id into v_item_id;
        end if;

        select id into v_lot_id from public.inventory_lots
        where inventory_item_id = v_item_id and lot_code = v_batch_code;
        if v_lot_id is null then
            insert into public.inventory_lots (
                inventory_item_id, lot_code, location_id, manufacture_date, expiry_date,
                source_document_type, source_document_id, metadata
            ) values (
                v_item_id, v_batch_code, v_location_id,
                nullif(p_payload->>'productionDate', '')::date, nullif(p_payload->>'expiryDate', '')::date,
                'assembly', v_assembly_id,
                jsonb_build_object('assemblyId', v_assembly_id, 'batchCode', v_batch_code, 'brandId', v_brand_id)
            )
            returning id into v_lot_id;
        end if;

        if v_bottle_quantity > 0 then
            perform public.apply_inventory_movement(
                v_item_id, v_lot_id, v_location_id, v_bottle_quantity, 'produce',
                'assembly', v_assembly_id, 'Assembly produced finished goods',
                jsonb_build_object('batchCode', v_batch_code), gen_random_uuid()::text
            );
        end if;

        insert into public.assembly_brands (assembly_id, brand_id, is_primary)
        values (v_assembly_id, v_brand_id, v_brand_id = (v_brand_lots->0->>'brandId')::uuid)
        on conflict (assembly_id, brand_id) do nothing;

        insert into public.assembly_brand_lots (
            assembly_id, brand_id, finished_good_inventory_item_id, finished_good_lot_id,
            batch_code, assembly_code, bottles_qty, comments
        ) values (
            v_assembly_id, v_brand_id, v_item_id, v_lot_id, v_batch_code, v_assembly_code, v_bottle_quantity, p_payload->>'comments'
        );
    end loop;

    v_sort_order := 0;
    for v_row in
        select * from jsonb_to_recordset(coalesce(p_payload->'assemblySessions', '[]'::jsonb))
            as x(date date, "startTime" text, "endTime" text, remarks text)
    loop
        v_sort_order := v_sort_order + 1;
        if v_row.date is null then
            continue;
        end if;
        insert into public.assembly_sessions (assembly_id, session_date, start_time, end_time, remarks, sort_order)
        values (v_assembly_id, v_row.date, nullif(v_row."startTime", '')::time, nullif(v_row."endTime", '')::time, v_row.remarks, v_sort_order);
    end loop;

    return v_assembly_id;
end;
$$;
