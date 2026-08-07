begin;

drop index if exists public.raw_material_categories_code_unique_ci;

alter table public.raw_material_categories
    drop constraint if exists raw_material_categories_code_not_blank,
    drop column if exists code,
    add column if not exists is_nmi_category boolean not null default false,
    add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.raw_material_categories.is_nmi_category is
    'Marks a raw material category as non-medicinal ingredients for manufacturing forms.';

comment on column public.raw_material_categories.metadata is
    'Flexible structured category attributes saved as JSONB.';

commit;
