-- Destructive reset for the old Manufacturing-App schema.
-- Run this only when you are ready to remove the previous Supabase tables,
-- relationships, views, and helper functions before applying migrations-2.

drop view if exists public.v_low_stock cascade;
drop view if exists public.v_inventory_summary cascade;
drop view if exists public.v_finished_goods cascade;
drop view if exists public.v_assembly_reports cascade;
drop view if exists public.v_njp_reports cascade;
drop view if exists public.v_mixing_reports cascade;
drop view if exists public.v_manufacturing_traceability cascade;

drop view if exists public.complete_batch_report cascade;
drop view if exists public.stage_wise_reports cascade;

drop table if exists public.assembly_sessions cascade;
drop table if exists public.assembly_brand_lots cascade;
drop table if exists public.assembly_brands cascade;
drop table if exists public.assemblies cascade;
drop table if exists public.njp_sessions cascade;
drop table if exists public.njp_load_checks cascade;
drop table if exists public.njp_runs cascade;
drop table if exists public.mixing_sessions cascade;
drop table if exists public.mixing_ingredients cascade;
drop table if exists public.mixing_brands cascade;
drop table if exists public.mixings cascade;
drop table if exists public.product_formula_items cascade;
drop table if exists public.inventory_movements cascade;
drop table if exists public.inventory_balances cascade;
drop table if exists public.inventory_lots cascade;
drop table if exists public.inventory_locations cascade;
drop table if exists public.packaging_items cascade;
drop table if exists public.label_specs cascade;
drop table if exists public.raw_materials cascade;
drop table if exists public.inventory_items cascade;
drop table if exists public.raw_material_categories cascade;
drop table if exists public.products cascade;
drop table if exists public.brands cascade;

drop table if exists public.batches cascade;
drop table if exists public.batch_reports cascade;
drop table if exists public.batch_stage_events cascade;
drop table if exists public.batch_status_history cascade;
drop table if exists public.mixing_reports cascade;
drop table if exists public.njp_reports cascade;
drop table if exists public.assembly_reports cascade;
drop table if exists public.finished_goods cascade;
drop table if exists public.finished_goods_history cascade;
drop table if exists public.label_inventory cascade;
drop table if exists public.bottles_lids cascade;
drop table if exists public.company_settings cascade;
drop table if exists public.vendors cascade;
drop table if exists public.purchase_orders cascade;
drop table if exists public.po_documents cascade;
drop table if exists public.po_document_items cascade;
drop table if exists public.employees cascade;
drop table if exists public.employee_loans cascade;
drop table if exists public.expense_books cascade;
drop table if exists public.expenses cascade;
drop table if exists public.salary_sheets cascade;
drop table if exists public.time_entries cascade;
drop table if exists public.work_entries cascade;

drop function if exists public.set_updated_at() cascade;
drop function if exists public.assign_mixing_code() cascade;
drop function if exists public.assign_njp_code() cascade;
drop function if exists public.apply_inventory_movement(
    uuid,
    uuid,
    uuid,
    numeric,
    text,
    text,
    uuid,
    text,
    jsonb,
    text
) cascade;
drop function if exists public.next_brand_batch_code(uuid) cascade;
