-- Two related workflow additions:
--
-- 1. Purchase Order approval: a PO can now be marked 'approved', a terminal
--    status after which it can no longer be edited (enforced in
--    PODocumentService.update, not just the frontend).
--
-- 2. Request to Quote -> Purchase Order handoff: an RTQ's latest version
--    can be "approved", which creates a brand-new Purchase Order from its
--    vendor/brand/ship-to/items and marks the RTQ 'moved_to_po' so it's
--    clear it was already converted.
--
-- Also: Purchase Order's "Others" and "Shipping" fields change from
-- percentages of the subtotal to flat dollar amounts added directly to the
-- subtotal (GST stays a percentage). The columns are renamed to match:
-- others_percent -> others_value, shipping_percent -> shipping_value.
-- Existing rows keep whatever numeric value they already had - only the
-- generated grand_total already stored on old rows reflects the old
-- percentage math; newly saved/edited POs use the new flat-add formula.

alter table public.po_documents rename column others_percent to others_value;
alter table public.po_documents rename column shipping_percent to shipping_value;

alter table public.po_documents drop constraint if exists po_documents_status_valid;
alter table public.po_documents add constraint po_documents_status_valid check (
    status in ('draft', 'sent', 'received', 'canceled', 'approved')
);

alter table public.request_to_quote_documents drop constraint if exists request_to_quote_documents_status_valid;
alter table public.request_to_quote_documents add constraint request_to_quote_documents_status_valid check (
    status in ('draft', 'sent', 'received', 'canceled', 'moved_to_po')
);
