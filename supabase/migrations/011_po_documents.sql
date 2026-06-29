-- ============================================================================
-- 011_po_documents.sql
-- Brand color, company settings, PO document header + line items.
-- ============================================================================

-- Add color column to brands (default green matching existing UI)
ALTER TABLE brands ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#16a34a';

-- Single-row company settings (the "Ship To" / buyer identity printed on every PO)
CREATE TABLE IF NOT EXISTS company_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name  text NOT NULL DEFAULT '',
  address_line1 text NOT NULL DEFAULT '',
  address_line2 text,
  city          text,
  province      text,
  country       text,
  phone         text,
  logo_url      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- PO Document header — one document = one formal purchase order with N line items
CREATE TABLE IF NOT EXISTS po_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number        text NOT NULL,
  vendor_id        uuid REFERENCES vendors(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  vendor_name      text NOT NULL DEFAULT '',
  vendor_address   text,
  ship_to_name     text NOT NULL DEFAULT '',
  ship_to_address  text,
  ship_to_phone    text,
  brand_id         uuid REFERENCES brands(id) ON UPDATE CASCADE ON DELETE SET NULL,
  po_date          date NOT NULL DEFAULT CURRENT_DATE,
  terms_conditions text,
  status           text NOT NULL DEFAULT 'draft',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_documents_po_number_not_blank CHECK (length(btrim(po_number)) > 0),
  CONSTRAINT po_documents_status_valid CHECK (status IN ('draft', 'sent', 'received', 'canceled'))
);

-- PO Document line items
CREATE TABLE IF NOT EXISTS po_document_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_document_id  uuid NOT NULL REFERENCES po_documents(id) ON UPDATE CASCADE ON DELETE CASCADE,
  sr              integer NOT NULL,
  order_type      text NOT NULL DEFAULT 'raw_material',
  item_id         uuid,
  item_name       text NOT NULL DEFAULT '',
  quantity        numeric(14,4) NOT NULL DEFAULT 0,
  unit_price      numeric(14,4),
  total_price     numeric(14,4),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_document_items_order_type_valid
    CHECK (order_type IN ('raw_material', 'label', 'product', 'bottles_lids', 'custom')),
  CONSTRAINT po_document_items_quantity_nonnegative CHECK (quantity >= 0),
  CONSTRAINT po_document_items_unit_price_nonnegative CHECK (unit_price IS NULL OR unit_price >= 0),
  CONSTRAINT po_document_items_total_price_nonnegative CHECK (total_price IS NULL OR total_price >= 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS po_documents_vendor_id_idx ON po_documents(vendor_id);
CREATE INDEX IF NOT EXISTS po_documents_brand_id_idx  ON po_documents(brand_id);
CREATE INDEX IF NOT EXISTS po_documents_status_idx    ON po_documents(status);
CREATE INDEX IF NOT EXISTS po_document_items_doc_idx  ON po_document_items(po_document_id);

-- RLS: same pattern as other tables — anon role full access
ALTER TABLE company_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_document_items  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_settings'  AND policyname = 'anon_all') THEN
    CREATE POLICY anon_all ON company_settings  FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'po_documents'       AND policyname = 'anon_all') THEN
    CREATE POLICY anon_all ON po_documents       FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'po_document_items'  AND policyname = 'anon_all') THEN
    CREATE POLICY anon_all ON po_document_items  FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- Grant access to anon
GRANT ALL ON company_settings  TO anon;
GRANT ALL ON po_documents       TO anon;
GRANT ALL ON po_document_items  TO anon;
