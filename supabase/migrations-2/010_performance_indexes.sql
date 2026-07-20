-- Performance indexes for the Django + React manufacturing portal.
--
-- Run after 009_assembly_labels.sql.
--
-- These indexes are based on the current frontend/API access patterns:
-- - list screens load recent rows with updated_at/created_at ordering
-- - dropdowns filter by brand, product, category, packaging type, and active state
-- - finished goods and manufacturing reports read SQL views backed by the tables below
-- - report exports filter by production/session dates
-- - search boxes commonly search product/material names and manufacturing codes
--
-- All indexes are idempotent so this file can be rerun safely.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Commercial/catalog screens: Brands and Products
-- ---------------------------------------------------------------------------

create index if not exists brands_active_name_idx
on public.brands (is_active, lower(name));

create index if not exists brands_created_desc_idx
on public.brands (created_at desc);

create index if not exists brands_name_trgm_idx
on public.brands using gin (name gin_trgm_ops);

create index if not exists products_active_name_idx
on public.products (is_active, lower(product_name));

create index if not exists products_type_active_name_idx
on public.products (product_type, is_active, lower(product_name));

create index if not exists products_created_desc_idx
on public.products (created_at desc);

create index if not exists products_updated_desc_idx
on public.products (updated_at desc);

create index if not exists products_name_trgm_idx
on public.products using gin (product_name gin_trgm_ops);

create index if not exists products_code_trgm_idx
on public.products using gin (product_code gin_trgm_ops)
where product_code is not null and btrim(product_code) <> '';

create index if not exists products_npn_trgm_idx
on public.products using gin (npn gin_trgm_ops)
where npn is not null and btrim(npn) <> '';

-- Product formulas are repeatedly loaded by product and raw material.
create index if not exists pfi_product_active_sort_idx
on public.product_formula_items (product_id, is_active, sort_order);

create index if not exists pfi_rm_product_idx
on public.product_formula_items (raw_material_id, product_id);

-- ---------------------------------------------------------------------------
-- Inventory screens: Raw Materials, Categories, Labels, Bottles/Lids
-- ---------------------------------------------------------------------------

create index if not exists rm_categories_active_name_idx
on public.raw_material_categories (is_active, lower(name));

create index if not exists rm_categories_nmi_active_idx
on public.raw_material_categories (is_nmi_category, is_active, lower(name));

create index if not exists inv_items_kind_active_name_idx
on public.inventory_items (item_kind, is_active, lower(item_name));

create index if not exists inv_items_kind_created_idx
on public.inventory_items (item_kind, created_at desc);

create index if not exists inv_items_kind_updated_idx
on public.inventory_items (item_kind, updated_at desc);

create index if not exists inv_items_kind_code_desc_idx
on public.inventory_items (item_kind, item_code desc)
where item_code is not null and btrim(item_code) <> '';

create index if not exists inv_items_name_trgm_idx
on public.inventory_items using gin (item_name gin_trgm_ops);

create index if not exists inv_items_code_trgm_idx
on public.inventory_items using gin (item_code gin_trgm_ops)
where item_code is not null and btrim(item_code) <> '';

create index if not exists raw_materials_category_item_idx
on public.raw_materials (category_id, inventory_item_id);

create index if not exists raw_materials_price_idx
on public.raw_materials (price_per_kg_usd);

create index if not exists label_specs_product_brand_idx
on public.label_specs (product_id, brand_id);

create index if not exists label_specs_type_dosage_idx
on public.label_specs (label_type, dosage_count);

create index if not exists label_specs_created_idx
on public.label_specs (created_at desc);

create index if not exists packaging_items_type_size_item_idx
on public.packaging_items (packaging_type, bottle_size, inventory_item_id);

create index if not exists packaging_items_created_idx
on public.packaging_items (created_at desc);

create index if not exists inventory_locations_active_name_idx
on public.inventory_locations (is_active, lower(location_name));

-- Inventory lots/balances are used in every "available quantity" display.
create index if not exists inv_lots_source_idx
on public.inventory_lots (source_document_type, source_document_id);

create index if not exists inv_lots_status_created_idx
on public.inventory_lots (status, created_at desc);

create index if not exists inv_lots_location_status_idx
on public.inventory_lots (location_id, status);

create index if not exists inv_lots_code_trgm_idx
on public.inventory_lots using gin (lot_code gin_trgm_ops);

create index if not exists inv_balances_lot_idx
on public.inventory_balances (inventory_lot_id);

create index if not exists inv_balances_location_item_idx
on public.inventory_balances (location_id, inventory_item_id);

create index if not exists inv_balances_positive_item_idx
on public.inventory_balances (inventory_item_id, inventory_lot_id)
where quantity > 0;

create index if not exists inv_movements_related_created_idx
on public.inventory_movements (related_entity_type, related_entity_id, created_at desc);

create index if not exists inv_movements_lot_created_idx
on public.inventory_movements (inventory_lot_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Manufacturing screens and reports: Mixing / Powder
-- ---------------------------------------------------------------------------

create index if not exists mixings_created_desc_idx
on public.mixings (created_at desc);

create index if not exists mixings_updated_desc_idx
on public.mixings (updated_at desc);

create index if not exists mixings_product_created_idx
on public.mixings (product_id, created_at desc);

create index if not exists mixings_status_created_idx
on public.mixings (status, created_at desc);

create index if not exists mixings_location_created_idx
on public.mixings (location_id, created_at desc)
where location_id is not null;

create index if not exists mixings_output_lot_idx
on public.mixings (output_inventory_lot_id)
where output_inventory_lot_id is not null;

create index if not exists mixings_existing_powder_lot_idx
on public.mixings (existing_mixed_powder_lot_id)
where existing_mixed_powder_lot_id is not null;

create index if not exists mixings_code_trgm_idx
on public.mixings using gin (mixing_code gin_trgm_ops)
where mixing_code is not null and btrim(mixing_code) <> '';

create index if not exists mixings_location_text_trgm_idx
on public.mixings using gin (location_text gin_trgm_ops)
where location_text is not null and btrim(location_text) <> '';

create index if not exists mixing_brands_brand_mixing_idx
on public.mixing_brands (brand_id, mixing_id);

create index if not exists mixing_ingredients_rm_mixing_idx
on public.mixing_ingredients (raw_material_id, mixing_id)
where raw_material_id is not null;

create index if not exists mixing_sessions_date_mixing_idx
on public.mixing_sessions (session_date, mixing_id);

-- ---------------------------------------------------------------------------
-- Manufacturing screens and reports: NJP / Capsules
-- ---------------------------------------------------------------------------

create index if not exists njp_runs_created_desc_idx
on public.njp_runs (created_at desc);

create index if not exists njp_runs_updated_desc_idx
on public.njp_runs (updated_at desc);

create index if not exists njp_runs_mixing_created_idx
on public.njp_runs (mixing_id, created_at desc);

create index if not exists njp_runs_status_created_idx
on public.njp_runs (status, created_at desc);

create index if not exists njp_runs_location_created_idx
on public.njp_runs (location_id, created_at desc)
where location_id is not null;

create index if not exists njp_runs_input_lot_idx
on public.njp_runs (input_mixed_powder_lot_id)
where input_mixed_powder_lot_id is not null;

create index if not exists njp_runs_output_lot_idx
on public.njp_runs (output_capsule_lot_id)
where output_capsule_lot_id is not null;

create index if not exists njp_runs_code_trgm_idx
on public.njp_runs using gin (njp_code gin_trgm_ops)
where njp_code is not null and btrim(njp_code) <> '';

create index if not exists njp_runs_bucket_trgm_idx
on public.njp_runs using gin (bucket gin_trgm_ops)
where bucket is not null and btrim(bucket) <> '';

create index if not exists njp_runs_location_text_trgm_idx
on public.njp_runs using gin (location_text gin_trgm_ops)
where location_text is not null and btrim(location_text) <> '';

create index if not exists njp_load_checks_time_idx
on public.njp_load_checks (check_time desc);

create index if not exists njp_sessions_date_njp_idx
on public.njp_sessions (session_date, njp_id);

-- ---------------------------------------------------------------------------
-- Manufacturing screens and reports: Assembly / Bottles / Finished Goods
-- ---------------------------------------------------------------------------

create index if not exists assemblies_created_desc_idx
on public.assemblies (created_at desc);

create index if not exists assemblies_updated_desc_idx
on public.assemblies (updated_at desc);

create index if not exists assemblies_njp_created_idx
on public.assemblies (njp_id, created_at desc);

create index if not exists assemblies_status_created_idx
on public.assemblies (status, created_at desc);

create index if not exists assemblies_production_date_idx
on public.assemblies (production_date desc, created_at desc);

create index if not exists assemblies_expiry_date_idx
on public.assemblies (expiry_date);

create index if not exists assemblies_location_created_idx
on public.assemblies (location_id, created_at desc)
where location_id is not null;

create index if not exists assemblies_bottle_type_size_idx
on public.assemblies (bottle_type, bottle_size, created_at desc);

create index if not exists assemblies_input_lot_idx
on public.assemblies (input_capsule_lot_id)
where input_capsule_lot_id is not null;

create index if not exists assemblies_packaging_lot_idx
on public.assemblies (packaging_lot_id)
where packaging_lot_id is not null;

create index if not exists assemblies_label_lot_idx
on public.assemblies (label_lot_id)
where label_lot_id is not null;

create index if not exists assemblies_label_idx
on public.assemblies (label_id)
where label_id is not null;

create index if not exists assemblies_code_trgm_idx
on public.assemblies using gin (assembly_code gin_trgm_ops)
where assembly_code is not null and btrim(assembly_code) <> '';

create index if not exists assemblies_box_trgm_idx
on public.assemblies using gin (box_number gin_trgm_ops)
where box_number is not null and btrim(box_number) <> '';

create index if not exists assemblies_location_text_trgm_idx
on public.assemblies using gin (location_text gin_trgm_ops)
where location_text is not null and btrim(location_text) <> '';

create index if not exists assembly_brands_brand_assembly_idx
on public.assembly_brands (brand_id, assembly_id);

create index if not exists assembly_brand_lots_assembly_brand_idx
on public.assembly_brand_lots (assembly_id, brand_id);

create index if not exists assembly_brand_lots_brand_created_idx
on public.assembly_brand_lots (brand_id, created_at desc);

create index if not exists assembly_brand_lots_finished_lot_idx
on public.assembly_brand_lots (finished_good_lot_id)
where finished_good_lot_id is not null;

create index if not exists assembly_brand_lots_batch_trgm_idx
on public.assembly_brand_lots using gin (batch_code gin_trgm_ops);

create index if not exists assembly_sessions_date_assembly_idx
on public.assembly_sessions (session_date, assembly_id);

-- ---------------------------------------------------------------------------
-- Refresh planner statistics after index creation.
-- ---------------------------------------------------------------------------

analyze public.brands;
analyze public.products;
analyze public.raw_material_categories;
analyze public.inventory_items;
analyze public.raw_materials;
analyze public.label_specs;
analyze public.packaging_items;
analyze public.inventory_locations;
analyze public.inventory_lots;
analyze public.inventory_balances;
analyze public.inventory_movements;
analyze public.product_formula_items;
analyze public.mixings;
analyze public.mixing_brands;
analyze public.mixing_ingredients;
analyze public.mixing_sessions;
analyze public.njp_runs;
analyze public.njp_load_checks;
analyze public.njp_sessions;
analyze public.assemblies;
analyze public.assembly_brands;
analyze public.assembly_brand_lots;
analyze public.assembly_sessions;
