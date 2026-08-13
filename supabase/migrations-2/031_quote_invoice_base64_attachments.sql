-- Switch Quote/Invoice attachments from Supabase Storage (file_path pointing
-- at a bucket object) to base64-encoded content stored directly in the row,
-- matching the existing brand-logo precedent (brands.logo_url already stores
-- a data URL). Avoids requiring a Storage bucket to be created for this
-- feature - the tradeoff is the row itself carries the file's weight, which
-- the backend accounts for by never selecting this column on list queries,
-- only on single-record reads.
--
-- Written defensively (checks information_schema rather than a plain
-- rename) so it works whether file_path exists, is already renamed, or the
-- column is simply missing for any reason.

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'quotes' and column_name = 'file_path'
    ) then
        alter table public.quotes rename column file_path to file_data;
    elsif not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'quotes' and column_name = 'file_data'
    ) then
        alter table public.quotes add column file_data text;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'invoices' and column_name = 'file_path'
    ) then
        alter table public.invoices rename column file_path to file_data;
    elsif not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'invoices' and column_name = 'file_data'
    ) then
        alter table public.invoices add column file_data text;
    end if;
end;
$$;
