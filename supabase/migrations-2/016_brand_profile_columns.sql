alter table public.brands
    add column if not exists short_name text,
    add column if not exists contact_name text,
    add column if not exists contact_email text,
    add column if not exists contact_phone text,
    add column if not exists address_line_1 text,
    add column if not exists address_line_2 text,
    add column if not exists city text,
    add column if not exists province text,
    add column if not exists country text,
    add column if not exists logo_url text,
    add column if not exists brand_color text;

update public.brands
set
    short_name = coalesce(nullif(short_name, ''), nullif(metadata ->> 'shortName', '')),
    contact_name = coalesce(nullif(contact_name, ''), nullif(metadata ->> 'contactName', '')),
    contact_email = coalesce(nullif(contact_email, ''), nullif(metadata ->> 'contactEmail', '')),
    address_line_1 = coalesce(
        nullif(address_line_1, ''),
        nullif(metadata ->> 'addressLine1', ''),
        nullif(address, '')
    ),
    address_line_2 = coalesce(nullif(address_line_2, ''), nullif(metadata ->> 'addressLine2', '')),
    city = coalesce(nullif(city, ''), nullif(metadata ->> 'city', '')),
    province = coalesce(nullif(province, ''), nullif(metadata ->> 'province', '')),
    country = coalesce(nullif(country, ''), nullif(metadata ->> 'country', '')),
    logo_url = coalesce(nullif(logo_url, ''), nullif(metadata ->> 'logoUrl', '')),
    brand_color = coalesce(nullif(brand_color, ''), nullif(metadata ->> 'color', ''), '#16a34a'),
    contact_phone = coalesce(nullif(contact_phone, ''), nullif(metadata ->> 'phone', ''))
where
    short_name is null
    or address_line_1 is null
    or contact_name is null
    or contact_email is null
    or address_line_2 is null
    or city is null
    or province is null
    or country is null
    or logo_url is null
    or brand_color is null
    or contact_phone is null;

alter table public.brands
    alter column brand_color set default '#16a34a';

update public.brands
set brand_color = '#16a34a'
where brand_color is null or btrim(brand_color) = '';

alter table public.brands
    alter column brand_color set not null;

create index if not exists brands_short_name_idx
on public.brands (lower(short_name))
where short_name is not null and btrim(short_name) <> '';

create index if not exists brands_contact_email_idx
on public.brands (lower(contact_email))
where contact_email is not null and btrim(contact_email) <> '';

create index if not exists brands_city_idx
on public.brands (lower(city))
where city is not null and btrim(city) <> '';

comment on column public.brands.short_name is 'Short brand name shown on internal lists and documents.';
comment on column public.brands.contact_name is 'Primary brand contact person for purchasing and documents.';
comment on column public.brands.contact_email is 'Primary brand contact email for purchasing and documents.';
comment on column public.brands.contact_phone is 'Primary brand contact phone number for purchasing and documents.';
comment on column public.brands.address_line_1 is 'Primary PO/document address line.';
comment on column public.brands.address_line_2 is 'Secondary PO/document address line.';
comment on column public.brands.city is 'Brand city for PO/document address.';
comment on column public.brands.province is 'Brand province or state for PO/document address.';
comment on column public.brands.country is 'Brand country for PO/document address.';
comment on column public.brands.logo_url is 'Logo image URL or uploaded data URL used on documents.';
comment on column public.brands.brand_color is 'Hex color used for brand-specific document styling.';
