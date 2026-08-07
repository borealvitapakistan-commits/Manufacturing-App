-- Finished Goods > Bottles was showing "-" for Capsules/Units per Bottle,
-- Total Units Used, Available Units Qty, and Filled Bottle Weight because
-- v_finished_goods never selected those columns from `assemblies`, even
-- though 014_assembly_code_batch_units_weight.sql already added
-- capsules_per_bottle, capsules_received_qty, remaining_capsules_qty,
-- total_bottles_made, filled_bottle_weight, and weight_unit to that table.
--
-- CREATE OR REPLACE VIEW requires existing output columns to keep their
-- name/order/type, so the new columns are appended at the end.

create or replace view public.v_finished_goods as
select
    abl.id,
    abl.assembly_id,
    abl.brand_id,
    b.name as brand_name,
    abl.batch_code,
    a.assembly_code,
    e.encapsulation_code,
    e.encapsulation_code as njp_code,
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
    a.updated_at,
    a.capsules_per_bottle,
    a.capsules_received_qty,
    a.remaining_capsules_qty,
    a.total_bottles_made,
    a.filled_bottle_weight,
    a.weight_unit
from public.assembly_brand_lots abl
join public.assemblies a on a.id = abl.assembly_id
join public.brands b on b.id = abl.brand_id
join public.encapsulations e on e.id = a.encapsulation_id
join public.mixings m on m.id = e.mixing_id
join public.products p on p.id = m.product_id
left join public.inventory_locations l on l.id = a.location_id
group by
    abl.id,
    a.id,
    b.id,
    e.id,
    m.id,
    p.id,
    l.id;

grant select on public.v_finished_goods to anon, authenticated;
grant all privileges on public.v_finished_goods to service_role;
