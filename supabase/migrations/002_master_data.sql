-- ============================================================================
-- 002_master_data.sql
-- Brands, raw materials, products, and vendors.
-- ============================================================================

CREATE TABLE IF NOT EXISTS brands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code_prefix text NOT NULL,
  short_name  text,
  country     text,
  notes       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brands_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT brands_code_prefix_not_blank CHECK (length(btrim(code_prefix)) > 0)
);

CREATE TABLE IF NOT EXISTS raw_materials (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL,
  name         text NOT NULL,
  qty_kg       numeric(12,4) NOT NULL DEFAULT 0,
  category     text,
  location     text,
  price_per_kg numeric(12,4) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raw_materials_code_not_blank CHECK (length(btrim(code)) > 0),
  CONSTRAINT raw_materials_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT raw_materials_qty_nonnegative CHECK (qty_kg >= 0),
  CONSTRAINT raw_materials_price_nonnegative CHECK (price_per_kg >= 0)
);

CREATE TABLE IF NOT EXISTS products (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  rm         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT products_rm_is_array CHECK (jsonb_typeof(rm) = 'array')
);

CREATE TABLE IF NOT EXISTS vendors (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  short_code             text,
  vendor_code            text,
  categories             text[] NOT NULL DEFAULT '{}',
  email                  text,
  phone                  text,
  whatsapp               text,
  whatsapp_same_as_phone boolean NOT NULL DEFAULT true,
  country                text,
  city                   text,
  address                text,
  website                text,
  payment_terms          text,
  notes                  text,
  is_active              boolean NOT NULL DEFAULT true,
  deleted                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendors_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT vendors_vendor_code_not_blank CHECK (vendor_code IS NULL OR length(btrim(vendor_code)) > 0)
);
