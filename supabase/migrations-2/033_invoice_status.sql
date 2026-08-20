-- Adds a status column to invoices so a "Done" action can lock them,
-- mirroring the po_documents "received" lock. Marking an Invoice Done is
-- the trigger that adds its Purchase Order's received quantities into
-- inventory (raw materials, bottles/lids, labels) - once applied it must
-- not be re-appliable (that would double-credit stock), so the invoice
-- becomes read-only immediately after.
alter table public.invoices
    add column if not exists status text not null default 'draft';

alter table public.invoices
    drop constraint if exists invoices_status_check;

alter table public.invoices
    add constraint invoices_status_check check (status in ('draft', 'done'));
