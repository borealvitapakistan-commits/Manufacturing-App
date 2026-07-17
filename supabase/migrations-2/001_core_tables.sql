create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table public.brands (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    code_prefix text not null,
    contact_name text,
    contact_email text,
    contact_phone text,
    address text,
    is_active boolean not null default true,
    notes text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint brands_code_prefix_not_blank check (btrim(code_prefix) <> '')
);

create unique index brands_name_unique_ci on public.brands (lower(name));
create unique index brands_code_prefix_unique on public.brands (code_prefix);
create trigger brands_set_updated_at
before update on public.brands
for each row execute function public.set_updated_at();

create table public.products (
    id uuid primary key default gen_random_uuid(),
    product_name text not null,
    product_code text,
    npn text,
    product_type text not null default 'capsule',
    dosage_form text,
    unit_of_measure text not null default 'mg',
    is_active boolean not null default true,
    notes text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint products_type_allowed check (
        product_type in (
            'capsule',
            'tablet',
            'tablets',
            'softgel',
            'liquid',
            'lozenge',
            'lozengers',
            'powder'
        )
    )
);

create unique index products_product_code_unique_not_null
on public.products (product_code)
where product_code is not null and btrim(product_code) <> '';

create unique index products_npn_unique_not_null
on public.products (npn)
where npn is not null and btrim(npn) <> '';

create index products_name_idx on public.products (lower(product_name));
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create table public.raw_material_categories (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    code text not null,
    description text,
    is_nmi_category boolean not null default false,
    is_active boolean not null default true,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint raw_material_categories_name_not_blank check (btrim(name) <> ''),
    constraint raw_material_categories_code_not_blank check (btrim(code) <> '')
);

create unique index raw_material_categories_name_unique_ci
on public.raw_material_categories (lower(name));

create unique index raw_material_categories_code_unique_ci
on public.raw_material_categories (lower(code));

create trigger raw_material_categories_set_updated_at
before update on public.raw_material_categories
for each row execute function public.set_updated_at();

create table public.inventory_items (
    id uuid primary key default gen_random_uuid(),
    item_kind text not null,
    item_code text,
    item_name text not null,
    unit_of_measure text not null,
    reorder_level numeric(18, 6) not null default 0,
    is_active boolean not null default true,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint inventory_items_kind_allowed check (
        item_kind in (
            'raw_material',
            'label',
            'packaging',
            'mixed_powder',
            'capsule_bulk',
            'finished_good'
        )
    ),
    constraint inventory_items_uom_not_blank check (btrim(unit_of_measure) <> '')
);

create unique index inventory_items_item_code_unique_not_null
on public.inventory_items (item_code)
where item_code is not null and btrim(item_code) <> '';

create index inventory_items_kind_name_idx
on public.inventory_items (item_kind, lower(item_name));

create trigger inventory_items_set_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

create table public.raw_materials (
    inventory_item_id uuid primary key references public.inventory_items(id) on delete cascade,
    category_id uuid references public.raw_material_categories(id) on delete set null,
    vendor_name text,
    coa_reference text,
    price_per_kg_usd numeric(18, 6) not null default 0,
    potency text,
    comments text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index raw_materials_category_idx on public.raw_materials (category_id);
create trigger raw_materials_set_updated_at
before update on public.raw_materials
for each row execute function public.set_updated_at();

create table public.label_specs (
    inventory_item_id uuid primary key references public.inventory_items(id) on delete cascade,
    brand_id uuid references public.brands(id) on delete set null,
    product_id uuid references public.products(id) on delete set null,
    label_name text not null,
    label_type text not null default 'capsule',
    dosage_count integer,
    notes text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint label_specs_type_allowed check (
        label_type in (
            'capsule',
            'tablet',
            'tablets',
            'softgel',
            'liquid',
            'lozenge',
            'lozengers',
            'powder'
        )
    ),
    constraint label_specs_dosage_allowed check (
        dosage_count is null or dosage_count in (60, 90, 120, 180, 240)
    )
);

create index label_specs_brand_product_idx
on public.label_specs (brand_id, product_id);

create trigger label_specs_set_updated_at
before update on public.label_specs
for each row execute function public.set_updated_at();

create table public.packaging_items (
    inventory_item_id uuid primary key references public.inventory_items(id) on delete cascade,
    packaging_type text not null,
    bottle_size integer,
    lid_type text,
    description text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint packaging_type_allowed check (packaging_type in ('capsule', 'jar', 'lid')),
    constraint packaging_size_rule check (
        (packaging_type = 'capsule' and bottle_size in (200, 250, 300))
        or (packaging_type in ('jar', 'lid') and bottle_size is null)
    )
);

create index packaging_items_type_size_idx
on public.packaging_items (packaging_type, bottle_size);

create trigger packaging_items_set_updated_at
before update on public.packaging_items
for each row execute function public.set_updated_at();

create table public.inventory_locations (
    id uuid primary key default gen_random_uuid(),
    location_code text,
    location_name text not null,
    description text,
    is_active boolean not null default true,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index inventory_locations_code_unique_not_null
on public.inventory_locations (location_code)
where location_code is not null and btrim(location_code) <> '';

create unique index inventory_locations_name_unique_ci
on public.inventory_locations (lower(location_name));

create trigger inventory_locations_set_updated_at
before update on public.inventory_locations
for each row execute function public.set_updated_at();
