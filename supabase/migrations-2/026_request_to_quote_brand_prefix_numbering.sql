-- Request to Quote numbering changes from a flat global sequence (RTQ-0001)
-- to a per-brand-prefixed sequence: "{BRAND_PREFIX}-RTQ-{seq}", where
-- BRAND_PREFIX is 3 letters derived from the brand's name and seq is a
-- counter scoped to that prefix (BOR-RTQ-001, PAR-RTQ-001, BOR-RTQ-002, ...).
--
-- BRAND_PREFIX rule: normally the first 3 letters of the brand name
-- (e.g. "Boreal Vita" -> BOR, "Paragon Health Foods" -> PAR). If that
-- 3-letter combination is already used by another brand, skip the 3rd
-- letter and use the 4th instead (e.g. "Paris Natural Health Food" would
-- also start "PAR" - collides with Paragon - so it becomes PAI: letters
-- 1, 2, 4). If that still collides, the same skip-and-advance rule keeps
-- trying letter 5, 6, ... until a free 3-letter prefix is found - this
-- extends the two-collision example the rule was specified with to any
-- number of colliding brand names.
--
-- Existing Request to Quote rows (created under the old flat-sequence
-- format) are left untouched, matching how 022_assembly_bare_batch_code.sql
-- handled Assembly's own code-format change: only *new* rows use the new
-- format going forward.

-- ---------------------------------------------------------------------------
-- 1. brands.rtq_prefix - a stable, unique 3-letter code per brand
-- ---------------------------------------------------------------------------

alter table public.brands
    add column if not exists rtq_prefix text;

create unique index if not exists brands_rtq_prefix_unique on public.brands (rtq_prefix);

create or replace function public.compute_brand_rtq_prefix(p_name text)
returns text
language plpgsql
as $$
declare
    v_letters text;
    v_len integer;
    v_k integer;
    v_candidate text;
begin
    v_letters := upper(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z]', '', 'g'));
    v_len := length(v_letters);

    if v_len < 2 then
        return rpad(coalesce(v_letters, ''), 3, 'X');
    end if;

    v_k := 3;
    loop
        if v_k > v_len then
            -- Ran out of letters to try; extremely unlikely for a real
            -- brand name, but keep this deterministic rather than looping
            -- forever.
            return substring(v_letters from 1 for 2) || '1';
        end if;

        v_candidate := substring(v_letters from 1 for 1)
            || substring(v_letters from 2 for 1)
            || substring(v_letters from v_k for 1);

        exit when not exists (
            select 1 from public.brands where rtq_prefix = v_candidate
        );
        v_k := v_k + 1;
    end loop;

    return v_candidate;
end;
$$;

create or replace function public.assign_brand_rtq_prefix()
returns trigger
language plpgsql
as $$
begin
    if new.rtq_prefix is null or btrim(new.rtq_prefix) = '' then
        new.rtq_prefix := public.compute_brand_rtq_prefix(new.name);
    end if;
    return new;
end;
$$;

drop trigger if exists brands_assign_rtq_prefix on public.brands;
create trigger brands_assign_rtq_prefix
before insert on public.brands
for each row execute function public.assign_brand_rtq_prefix();

-- Backfill existing brands, oldest first, so the collision rule plays out
-- in creation order (matches the worked examples: Paragon Health Foods was
-- created before Paris Natural Health Food, so Paragon claims PAR and
-- Paris falls back to PAI).
do $$
declare
    v_brand record;
begin
    for v_brand in
        select id, name from public.brands
        where rtq_prefix is null
        order by created_at asc, id asc
    loop
        update public.brands
        set rtq_prefix = public.compute_brand_rtq_prefix(v_brand.name)
        where id = v_brand.id;
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. request_to_quote_documents.rtq_number - per-brand-prefix sequence
-- ---------------------------------------------------------------------------

create or replace function public.assign_rtq_number()
returns trigger
language plpgsql
as $$
declare
    v_prefix text;
    v_next integer;
begin
    if new.rtq_number is not null and btrim(new.rtq_number) <> '' then
        return new;
    end if;

    if new.brand_id is null then
        raise exception 'Select a brand before saving a Request to Quote - its RTQ number depends on the brand.';
    end if;

    -- Serialize concurrent numbering for this brand, mirroring
    -- next_brand_batch_code()'s advisory-lock pattern for Assembly.
    perform pg_advisory_xact_lock(hashtextextended('rtq_number:' || new.brand_id::text, 0));

    select rtq_prefix into v_prefix from public.brands where id = new.brand_id;
    if v_prefix is null or btrim(v_prefix) = '' then
        update public.brands
        set rtq_prefix = public.compute_brand_rtq_prefix(name)
        where id = new.brand_id
        returning rtq_prefix into v_prefix;
    end if;

    select coalesce(
        max(nullif(substring(rtq_number from '-RTQ-([0-9]+)$'), '')::integer),
        0
    ) + 1
    into v_next
    from public.request_to_quote_documents
    where rtq_number ~ ('^' || v_prefix || '-RTQ-[0-9]+$');

    new.rtq_number := v_prefix || '-RTQ-' || lpad(v_next::text, 3, '0');
    return new;
end;
$$;
