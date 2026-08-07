-- Rename Raw Material and Label extension primary keys away from
-- inventory_item_id. The UUID value is intentionally preserved: it still
-- matches inventory_items.id for ledger traceability, but the entity tables
-- now expose a normal id column.

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'raw_materials'
          and column_name = 'inventory_item_id'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'raw_materials'
          and column_name = 'id'
    ) then
        alter table public.raw_materials
            rename column inventory_item_id to id;
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'label_specs'
          and column_name = 'inventory_item_id'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'label_specs'
          and column_name = 'id'
    ) then
        alter table public.label_specs
            rename column inventory_item_id to id;
    end if;
end $$;

comment on column public.raw_materials.id is
    'Raw material id. This is the same UUID as inventory_items.id for stock ledger traceability; no separate inventory_id column remains.';

comment on column public.label_specs.id is
    'Label id. This is the same UUID as inventory_items.id for stock ledger traceability; no separate inventory_id column remains.';

drop index if exists public.raw_materials_category_item_idx;

create index if not exists raw_materials_category_id_idx
    on public.raw_materials (category_id, id);
