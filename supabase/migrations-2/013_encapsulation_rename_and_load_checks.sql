-- Rename NJP to Encapsulation and give load checks first-class fields.
--
-- This migration keeps compatibility aliases/views where useful, but the real
-- manufacturing object is now Encapsulation.

drop view if exists public.v_manufacturing_traceability cascade;
drop view if exists public.v_finished_goods cascade;
drop view if exists public.v_assembly_reports cascade;
drop view if exists public.v_njp_reports cascade;
drop view if exists public.v_encapsulation_reports cascade;

do $$
begin
    if to_regclass('public.encapsulations') is null
       and to_regclass('public.njp_runs') is not null then
        alter table public.njp_runs rename to encapsulations;
    end if;

    if to_regclass('public.encapsulation_load_checks') is null
       and to_regclass('public.njp_load_checks') is not null then
        alter table public.njp_load_checks rename to encapsulation_load_checks;
    end if;

    if to_regclass('public.encapsulation_sessions') is null
       and to_regclass('public.njp_sessions') is not null then
        alter table public.njp_sessions rename to encapsulation_sessions;
    end if;
end;
$$;

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'encapsulations'
          and column_name = 'njp_number'
    ) and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'encapsulations'
          and column_name = 'encapsulation_number'
    ) then
        alter table public.encapsulations rename column njp_number to encapsulation_number;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'encapsulations'
          and column_name = 'njp_code'
    ) and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'encapsulations'
          and column_name = 'encapsulation_code'
    ) then
        alter table public.encapsulations rename column njp_code to encapsulation_code;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'encapsulation_load_checks'
          and column_name = 'njp_id'
    ) and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'encapsulation_load_checks'
          and column_name = 'encapsulation_id'
    ) then
        alter table public.encapsulation_load_checks rename column njp_id to encapsulation_id;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'encapsulation_sessions'
          and column_name = 'njp_id'
    ) and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'encapsulation_sessions'
          and column_name = 'encapsulation_id'
    ) then
        alter table public.encapsulation_sessions rename column njp_id to encapsulation_id;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'assemblies'
          and column_name = 'njp_id'
    ) and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'assemblies'
          and column_name = 'encapsulation_id'
    ) then
        alter table public.assemblies rename column njp_id to encapsulation_id;
    end if;
end;
$$;

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'encapsulation_load_checks'
          and column_name = 'check_time'
          and data_type = 'timestamp with time zone'
    ) and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'encapsulation_load_checks'
          and column_name = 'checked_at'
    ) then
        alter table public.encapsulation_load_checks rename column check_time to checked_at;
    end if;
end;
$$;

alter table if exists public.encapsulation_load_checks
    add column if not exists check_date date,
    add column if not exists check_time text,
    add column if not exists load_label text,
    add column if not exists w1_mg numeric(18, 6),
    add column if not exists w2_mg numeric(18, 6),
    add column if not exists w3_mg numeric(18, 6),
    add column if not exists w4_mg numeric(18, 6),
    add column if not exists w5_mg numeric(18, 6),
    add column if not exists avg_mg numeric(18, 6);

update public.encapsulation_load_checks
set
    check_date = coalesce(
        check_date,
        nullif(metadata->>'date', '')::date,
        nullif(metadata->>'checkDate', '')::date,
        checked_at::date
    ),
    check_time = coalesce(
        check_time,
        nullif(metadata->>'time', ''),
        nullif(metadata->>'checkTime', ''),
        to_char(checked_at, 'HH24:MI')
    ),
    load_label = coalesce(
        load_label,
        nullif(metadata->>'load', ''),
        nullif(metadata->>'loadLabel', '')
    ),
    w1_mg = coalesce(w1_mg, nullif(metadata->>'w1Mg', '')::numeric),
    w2_mg = coalesce(w2_mg, nullif(metadata->>'w2Mg', '')::numeric),
    w3_mg = coalesce(w3_mg, nullif(metadata->>'w3Mg', '')::numeric),
    w4_mg = coalesce(w4_mg, nullif(metadata->>'w4Mg', '')::numeric),
    w5_mg = coalesce(w5_mg, nullif(metadata->>'w5Mg', '')::numeric),
    avg_mg = coalesce(
        avg_mg,
        nullif(metadata->>'avgMg', '')::numeric,
        nullif(metadata->>'avgWeightMg', '')::numeric,
        average_weight_mg
    )
where metadata is not null;

drop trigger if exists njp_runs_assign_code on public.encapsulations;
drop trigger if exists encapsulations_assign_code on public.encapsulations;
drop trigger if exists njp_runs_set_updated_at on public.encapsulations;
drop trigger if exists encapsulations_set_updated_at on public.encapsulations;
drop function if exists public.assign_njp_code() cascade;

create or replace function public.product_process_code_prefix(p_product_id uuid)
returns text
language plpgsql
stable
as $$
declare
    product_name text;
    product_words text[];
    first_word text;
    second_word text;
    base_prefix text;
    has_collision boolean;
begin
    select p.product_name
    into product_name
    from public.products p
    where p.id = p_product_id;

    product_name := coalesce(nullif(btrim(product_name), ''), 'PRO');
    product_words := regexp_split_to_array(product_name, '\s+');
    first_word := upper(regexp_replace(coalesce(product_words[1], 'PRO'), '[^A-Za-z0-9]', '', 'g'));
    second_word := upper(regexp_replace(coalesce(product_words[2], ''), '[^A-Za-z0-9]', '', 'g'));

    if first_word = '' then
        first_word := 'PRO';
    end if;

    base_prefix := rpad(left(first_word, 3), 3, 'X');

    select exists (
        select 1
        from public.products other_product
        where other_product.id <> p_product_id
          and rpad(
                left(
                    upper(
                        regexp_replace(
                            coalesce((regexp_split_to_array(other_product.product_name, '\s+'))[1], ''),
                            '[^A-Za-z0-9]',
                            '',
                            'g'
                        )
                    ),
                    3
                ),
                3,
                'X'
              ) = base_prefix
    )
    into has_collision;

    if has_collision then
        return rpad(
            left(first_word, 2)
            || coalesce(nullif(left(second_word, 1), ''), nullif(substr(first_word, 3, 1), ''), 'X'),
            3,
            'X'
        );
    end if;

    return base_prefix;
end;
$$;

create or replace function public.assign_encapsulation_code()
returns trigger
language plpgsql
as $$
declare
    v_product_id uuid;
begin
    select m.product_id
    into v_product_id
    from public.mixings m
    where m.id = new.mixing_id;

    if new.encapsulation_code is null
       or btrim(new.encapsulation_code) = ''
       or new.encapsulation_code like 'NJP-%' then
        new.encapsulation_code :=
            'E-'
            || public.product_process_code_prefix(v_product_id)
            || '-'
            || lpad(new.encapsulation_number::text, 3, '0');
    end if;

    return new;
end;
$$;

create trigger encapsulations_assign_code
before insert on public.encapsulations
for each row execute function public.assign_encapsulation_code();

create trigger encapsulations_set_updated_at
before update on public.encapsulations
for each row execute function public.set_updated_at();

update public.encapsulations e
set encapsulation_code =
    'E-'
    || public.product_process_code_prefix(m.product_id)
    || '-'
    || lpad(e.encapsulation_number::text, 3, '0')
from public.mixings m
where m.id = e.mixing_id
  and (
      e.encapsulation_code is null
      or btrim(e.encapsulation_code) = ''
      or e.encapsulation_code like 'NJP-%'
  );

create index if not exists encapsulations_created_desc_idx
on public.encapsulations (created_at desc);

create index if not exists encapsulations_updated_desc_idx
on public.encapsulations (updated_at desc);

create index if not exists encapsulations_mixing_created_idx
on public.encapsulations (mixing_id, created_at desc);

create index if not exists encapsulations_status_created_idx
on public.encapsulations (status, created_at desc);

create index if not exists encapsulations_code_trgm_idx
on public.encapsulations using gin (encapsulation_code gin_trgm_ops)
where encapsulation_code is not null and btrim(encapsulation_code) <> '';

create index if not exists encapsulation_load_checks_encapsulation_date_idx
on public.encapsulation_load_checks (encapsulation_id, check_date, created_at);

create index if not exists encapsulation_sessions_encapsulation_date_idx
on public.encapsulation_sessions (encapsulation_id, session_date, sort_order);

create index if not exists assemblies_encapsulation_created_idx
on public.assemblies (encapsulation_id, created_at desc);

create or replace view public.v_encapsulation_reports as
select
    e.id,
    e.encapsulation_code,
    e.encapsulation_code as njp_code,
    m.mixing_code,
    p.id as product_id,
    p.product_name,
    coalesce(p.product_code, p.npn) as product_code,
    array_remove(array_agg(distinct b.id::text), null) as brand_ids,
    string_agg(distinct b.name, ', ' order by b.name) as brand_names,
    coalesce(l.location_name, e.location_text) as location,
    e.bucket,
    e.capsule_size,
    e.available_mixing_used_kg,
    e.target_fill_weight_mg,
    e.total_capsules_filled_qty,
    e.rejected_capsules_qty,
    e.net_capsules_qty,
    e.total_capsules_produced_kg,
    (
        select coalesce(sum(balance.quantity), 0)
        from public.inventory_balances balance
        where balance.inventory_lot_id = e.output_capsule_lot_id
    ) as available_capsules_qty,
    e.status,
    e.remarks,
    min(es.session_date) as start_date,
    max(es.session_date) as end_date,
    e.created_at,
    e.updated_at
from public.encapsulations e
join public.mixings m on m.id = e.mixing_id
join public.products p on p.id = m.product_id
left join public.mixing_brands mb on mb.mixing_id = m.id
left join public.brands b on b.id = mb.brand_id
left join public.inventory_locations l on l.id = e.location_id
left join public.encapsulation_sessions es on es.encapsulation_id = e.id
group by
    e.id,
    m.id,
    p.id,
    l.id;

create or replace view public.v_njp_reports as
select *
from public.v_encapsulation_reports;

create or replace view public.v_assembly_reports as
select
    a.id,
    a.assembly_code,
    e.encapsulation_code,
    e.encapsulation_code as njp_code,
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
join public.encapsulations e on e.id = a.encapsulation_id
join public.mixings m on m.id = e.mixing_id
join public.products p on p.id = m.product_id
left join public.inventory_locations l on l.id = a.location_id
left join public.assembly_brand_lots abl on abl.assembly_id = a.id
left join public.brands b on b.id = abl.brand_id
left join public.assembly_sessions s on s.assembly_id = a.id
group by
    a.id,
    e.id,
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
    a.updated_at
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

create or replace view public.v_manufacturing_traceability as
select
    a.id as assembly_id,
    a.assembly_code,
    e.id as encapsulation_id,
    e.encapsulation_code,
    e.id as njp_id,
    e.encapsulation_code as njp_code,
    m.id as mixing_id,
    m.mixing_code,
    p.id as product_id,
    p.product_name,
    jsonb_object_agg(b.name, abl.batch_code order by b.name)
        filter (where b.id is not null) as brand_batch_codes,
    a.created_at as completed_at
from public.assemblies a
join public.encapsulations e on e.id = a.encapsulation_id
join public.mixings m on m.id = e.mixing_id
join public.products p on p.id = m.product_id
left join public.assembly_brand_lots abl on abl.assembly_id = a.id
left join public.brands b on b.id = abl.brand_id
group by
    a.id,
    e.id,
    m.id,
    p.id;

grant select, insert, update, delete on public.encapsulations to anon, authenticated;
grant select, insert, update, delete on public.encapsulation_load_checks to anon, authenticated;
grant select, insert, update, delete on public.encapsulation_sessions to anon, authenticated;
grant select on public.v_encapsulation_reports to anon, authenticated;
grant select on public.v_njp_reports to anon, authenticated;
grant all privileges on public.encapsulations to service_role;
grant all privileges on public.encapsulation_load_checks to service_role;
grant all privileges on public.encapsulation_sessions to service_role;
grant all privileges on public.v_encapsulation_reports to service_role;
grant all privileges on public.v_njp_reports to service_role;

analyze public.encapsulations;
analyze public.encapsulation_load_checks;
analyze public.encapsulation_sessions;
analyze public.assemblies;
