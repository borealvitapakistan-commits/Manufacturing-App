create table public.product_formula_items (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete cascade,
    raw_material_id uuid not null references public.raw_materials(inventory_item_id) on delete restrict,
    label_claim_mg numeric(18, 6) not null,
    sort_order integer not null default 1,
    is_active boolean not null default true,
    remarks text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint product_formula_items_claim_positive check (label_claim_mg > 0),
    constraint product_formula_items_sort_positive check (sort_order > 0)
);

create unique index product_formula_items_product_rm_unique
on public.product_formula_items (product_id, raw_material_id);

create unique index product_formula_items_product_sort_unique
on public.product_formula_items (product_id, sort_order);

create index product_formula_items_rm_idx
on public.product_formula_items (raw_material_id);

create trigger product_formula_items_set_updated_at
before update on public.product_formula_items
for each row execute function public.set_updated_at();
