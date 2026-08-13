-- Payment Proof: an optional file attached directly to a Purchase Order
-- (e.g. a bank transfer receipt), same base64-in-row storage as
-- quotes.file_data / invoices.file_data (031_quote_invoice_base64_attachments.sql)
-- - no Storage bucket required. Its own code is derived from the PO's number
-- at upload time (e.g. BOR-PO-004 -> BOR-PO-PP-004), computed in the backend,
-- not by a trigger.

alter table public.po_documents
    add column if not exists payment_proof_number text,
    add column if not exists payment_proof_file_name text,
    add column if not exists payment_proof_file_data text,
    add column if not exists payment_proof_file_size bigint,
    add column if not exists payment_proof_file_type text;
