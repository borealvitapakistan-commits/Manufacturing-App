-- Ensure Raw Materials and Labels expose the shared inventory item id column.
--
-- Final intended structure:
--   raw_materials.inventory_item_id -> inventory_items.id
--   label_specs.inventory_item_id   -> inventory_items.id
--
-- This migration is intentionally idempotent. It is safe to run after 019.
-- It also asks PostgREST/Supabase to reload schema metadata so the Table Editor
-- and API schema see the restored columns.

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

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'raw_materials'
          and column_name = 'inventory_item_id'
    ) then
        raise exception 'Missing public.raw_materials.inventory_item_id. Run the core inventory migrations before this file.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'label_specs'
          and column_name = 'inventory_item_id'
    ) then
        raise exception 'Missing public.label_specs.inventory_item_id. Run the core inventory migrations before this file.';
    end if;
end $$;

comment on column public.raw_materials.inventory_item_id is
    'Shared inventory item id. Primary key for raw_materials and foreign key to inventory_items(id).';

comment on column public.label_specs.inventory_item_id is
    'Shared inventory item id. Primary key for label_specs and foreign key to inventory_items(id).';

drop index if exists public.raw_materials_category_id_idx;

create index if not exists raw_materials_category_item_idx
    on public.raw_materials (category_id, inventory_item_id);

create index if not exists label_specs_inventory_item_idx
    on public.label_specs (inventory_item_id);

notify pgrst, 'reload schema';
