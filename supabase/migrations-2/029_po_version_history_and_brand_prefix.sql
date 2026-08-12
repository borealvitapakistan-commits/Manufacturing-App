-- Purchase Orders get the same two things Request to Quote already has:
--
-- 1. Version history: every save of an existing PO appends a new row
--    sharing the same po_number instead of editing in place. The list
--    view shows one entry per po_number (its latest version), expandable
--    to see every version ever saved. Mirrors 027_request_to_quote_
--    version_history.sql exactly, applied to po_documents instead.
--
-- 2. Brand-prefixed numbering: po_number now follows the same
--    "{BRAND_PREFIX}-PO-{seq}" pattern RTQ numbers already use
--    ("{BRAND_PREFIX}-RTQ-{seq}"), reusing the same brands.rtq_prefix
--    column (it's a property of the brand, not of the document type).
--    So approving RTQ "PAR-RTQ-001" and creating a PO for the same brand
--    naturally produces "PAR-PO-001" - same prefix and scheme, just PO
--    instead of RTQ. Brand becomes required on Purchase Orders as a
--    result, same as it already is for Request to Quote.

alter table public.po_documents
    add column if not exists version integer not null default 1;

alter table public.po_documents drop constraint if exists po_documents_po_number_key;
create unique index if not exists po_documents_number_version_unique
    on public.po_documents (po_number, version);
create index if not exists po_documents_po_number_idx on public.po_documents (po_number);

create or replace function public.assign_po_number()
returns trigger
language plpgsql
as $$
declare
    v_prefix text;
    v_next integer;
begin
    if new.po_number is not null and btrim(new.po_number) <> '' then
        return new;
    end if;

    if new.brand_id is null then
        raise exception 'Select a brand before saving a Purchase Order - its PO number depends on the brand.';
    end if;

    -- Serialize concurrent numbering for this brand, mirroring
    -- assign_rtq_number()'s advisory-lock pattern.
    perform pg_advisory_xact_lock(hashtextextended('po_number:' || new.brand_id::text, 0));

    select rtq_prefix into v_prefix from public.brands where id = new.brand_id;
    if v_prefix is null or btrim(v_prefix) = '' then
        update public.brands
        set rtq_prefix = public.compute_brand_rtq_prefix(name)
        where id = new.brand_id
        returning rtq_prefix into v_prefix;
    end if;

    select coalesce(
        max(nullif(substring(po_number from '-PO-([0-9]+)$'), '')::integer),
        0
    ) + 1
    into v_next
    from public.po_documents
    where po_number ~ ('^' || v_prefix || '-PO-[0-9]+$');

    new.po_number := v_prefix || '-PO-' || lpad(v_next::text, 3, '0');
    return new;
end;
$$;
