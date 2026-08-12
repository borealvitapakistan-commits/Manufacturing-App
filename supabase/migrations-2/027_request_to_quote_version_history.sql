-- Request to Quote version history: instead of editing a document in
-- place, every save of an existing RTQ now inserts a brand-new row that
-- shares the same rtq_number but gets the next version number. The list
-- view shows one entry per rtq_number (its latest version); expanding it
-- shows every version ever saved. This mirrors the append-only pattern
-- already used by inventory_movements elsewhere in this schema - nothing
-- is ever overwritten, only appended.
--
-- Only Request to Quote gets this treatment (not Purchase Orders).

alter table public.request_to_quote_documents
    add column if not exists version integer not null default 1;

-- rtq_number was previously unique on its own (one row per document).
-- Multiple rows now intentionally share the same rtq_number (one per
-- version), so uniqueness moves to the (rtq_number, version) pair.
alter table public.request_to_quote_documents
    drop constraint if exists request_to_quote_documents_rtq_number_key;

create unique index if not exists request_to_quote_documents_number_version_unique
    on public.request_to_quote_documents (rtq_number, version);

create index if not exists request_to_quote_documents_rtq_number_idx
    on public.request_to_quote_documents (rtq_number);
