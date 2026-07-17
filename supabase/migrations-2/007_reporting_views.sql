create or replace view public.v_mixing_reports as
select
    m.id,
    m.mixing_code,
    p.id as product_id,
    p.product_name,
    coalesce(p.product_code, p.npn) as product_code,
    array_remove(array_agg(distinct b.id::text), null) as brand_ids,
    string_agg(distinct b.name, ', ' order by b.name) as brand_names,
    coalesce(l.location_name, m.location_text) as location,
    m.total_kg_in_mixing,
    m.existing_mixed_powder_used_kg,
    m.fresh_mixing_required_kg,
    m.total_mixed_qty_kg,
    (
        select coalesce(sum(balance.quantity), 0)
        from public.inventory_balances balance
        where balance.inventory_lot_id = m.output_inventory_lot_id
    ) as available_mixed_powder_kg,
    m.status,
    m.remarks,
    min(ms.session_date) as start_date,
    max(ms.session_date) as end_date,
    m.created_at,
    m.updated_at
from public.mixings m
join public.products p on p.id = m.product_id
left join public.inventory_locations l on l.id = m.location_id
left join public.mixing_brands mb on mb.mixing_id = m.id
left join public.brands b on b.id = mb.brand_id
left join public.mixing_sessions ms on ms.mixing_id = m.id
group by
    m.id,
    p.id,
    l.id;

create or replace view public.v_njp_reports as
select
    n.id,
    n.njp_code,
    m.mixing_code,
    p.id as product_id,
    p.product_name,
    coalesce(p.product_code, p.npn) as product_code,
    array_remove(array_agg(distinct b.id::text), null) as brand_ids,
    string_agg(distinct b.name, ', ' order by b.name) as brand_names,
    coalesce(l.location_name, n.location_text) as location,
    n.bucket,
    n.capsule_size,
    n.available_mixing_used_kg,
    n.target_fill_weight_mg,
    n.total_capsules_filled_qty,
    n.rejected_capsules_qty,
    n.net_capsules_qty,
    n.total_capsules_produced_kg,
    (
        select coalesce(sum(balance.quantity), 0)
        from public.inventory_balances balance
        where balance.inventory_lot_id = n.output_capsule_lot_id
    ) as available_capsules_qty,
    n.status,
    n.remarks,
    min(ns.session_date) as start_date,
    max(ns.session_date) as end_date,
    n.created_at,
    n.updated_at
from public.njp_runs n
join public.mixings m on m.id = n.mixing_id
join public.products p on p.id = m.product_id
left join public.mixing_brands mb on mb.mixing_id = m.id
left join public.brands b on b.id = mb.brand_id
left join public.inventory_locations l on l.id = n.location_id
left join public.njp_sessions ns on ns.njp_id = n.id
group by
    n.id,
    m.id,
    p.id,
    l.id;

create or replace view public.v_assembly_reports as
select
    a.id,
    a.assembly_code,
    n.njp_code,
    m.mixing_code,
    p.id as product_id,
    p.product_name,
    coalesce(p.product_code, p.npn) as product_code,
    coalesce(l.location_name, a.location_text) as location,
    a.box_number,
    a.bottle_type,
    a.bottle_size,
    a.capsules_received_qty,
    a.capsules_per_bottle,
    a.total_bottles_made,
    a.remaining_capsules_qty,
    a.production_date,
    a.expiry_date,
    a.status,
    a.comments,
    jsonb_object_agg(b.name, abl.batch_code order by b.name)
        filter (where b.id is not null) as brand_batch_codes,
    min(s.session_date) as start_date,
    max(s.session_date) as end_date,
    a.created_at,
    a.updated_at
from public.assemblies a
join public.njp_runs n on n.id = a.njp_id
join public.mixings m on m.id = n.mixing_id
join public.products p on p.id = m.product_id
left join public.inventory_locations l on l.id = a.location_id
left join public.assembly_brand_lots abl on abl.assembly_id = a.id
left join public.brands b on b.id = abl.brand_id
left join public.assembly_sessions s on s.assembly_id = a.id
group by
    a.id,
    n.id,
    m.id,
    p.id,
    l.id;

create or replace view public.v_finished_goods as
select
    abl.id,
    abl.assembly_id,
    abl.brand_id,
    b.name as brand_name,
    abl.batch_code,
    a.assembly_code,
    n.njp_code,
    m.mixing_code,
    p.product_name,
    p.id as product_id,
    coalesce(p.product_code, p.npn) as product_code,
    coalesce(l.location_name, a.location_text) as location,
    a.box_number,
    abl.bottles_qty as total_bottles,
    a.production_date,
    a.expiry_date,
    a.status,
    coalesce(abl.comments, a.comments) as comments,
    (
        select coalesce(sum(balance.quantity), 0)
        from public.inventory_balances balance
        where balance.inventory_lot_id = abl.finished_good_lot_id
    ) as available_bottles,
    a.created_at,
    a.updated_at
from public.assembly_brand_lots abl
join public.assemblies a on a.id = abl.assembly_id
join public.brands b on b.id = abl.brand_id
join public.njp_runs n on n.id = a.njp_id
join public.mixings m on m.id = n.mixing_id
join public.products p on p.id = m.product_id
left join public.inventory_locations l on l.id = a.location_id
group by
    abl.id,
    a.id,
    b.id,
    n.id,
    m.id,
    p.id,
    l.id;

create or replace view public.v_inventory_summary as
select
    ii.id as inventory_item_id,
    ii.item_kind,
    ii.item_code,
    ii.item_name,
    ii.unit_of_measure,
    ii.reorder_level,
    coalesce(sum(ib.quantity), 0) as quantity_on_hand,
    ii.is_active,
    ii.created_at,
    ii.updated_at
from public.inventory_items ii
left join public.inventory_balances ib on ib.inventory_item_id = ii.id
group by ii.id;

create or replace view public.v_low_stock as
select *
from public.v_inventory_summary
where is_active = true
  and quantity_on_hand <= reorder_level;

create or replace view public.v_manufacturing_traceability as
select
    a.id as assembly_id,
    a.assembly_code,
    n.id as njp_id,
    n.njp_code,
    m.id as mixing_id,
    m.mixing_code,
    p.id as product_id,
    p.product_name,
    jsonb_object_agg(b.name, abl.batch_code order by b.name)
        filter (where b.id is not null) as brand_batch_codes,
    a.created_at as completed_at
from public.assemblies a
join public.njp_runs n on n.id = a.njp_id
join public.mixings m on m.id = n.mixing_id
join public.products p on p.id = m.product_id
left join public.assembly_brand_lots abl on abl.assembly_id = a.id
left join public.brands b on b.id = abl.brand_id
group by
    a.id,
    n.id,
    m.id,
    p.id;
