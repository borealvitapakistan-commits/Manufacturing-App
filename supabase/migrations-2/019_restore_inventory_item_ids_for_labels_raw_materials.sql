-- Restore the shared inventory key names for Raw Materials and Labels.
--
-- Migration 018 temporarily renamed these extension-table keys to `id`.
-- The intended inventory model uses `inventory_items.id` as the master item id
-- and keeps extension tables linked through `inventory_item_id`.

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'raw_materials'
          and column_name = 'id'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'raw_materials'
          and column_name = 'inventory_item_id'
    ) then
        alter table public.raw_materials
            rename column id to inventory_item_id;
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'label_specs'
          and column_name = 'id'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'label_specs'
          and column_name = 'inventory_item_id'
    ) then
        alter table public.label_specs
            rename column id to inventory_item_id;
    end if;
end $$;

comment on column public.raw_materials.inventory_item_id is
    'Shared inventory item id. This is also the raw material primary key and links to inventory_items(id).';

comment on column public.label_specs.inventory_item_id is
    'Shared inventory item id. This is also the label primary key and links to inventory_items(id).';

drop index if exists public.raw_materials_category_id_idx;

create index if not exists raw_materials_category_item_idx
    on public.raw_materials (category_id, inventory_item_id);
