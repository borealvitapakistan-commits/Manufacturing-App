-- Adds Label inventory consumption to Assembly.
--
-- Business rule: Label usage always equals Total Bottles Made (one label per
-- bottle), and is deducted from label inventory the same way bottles are
-- deducted from packaging inventory. Rejected capsules are already handled
-- in NJP (see njp_runs.rejected_capsules_qty) - Assembly just consumes
-- whatever net/available capsule count NJP hands off, unchanged.

alter table public.assemblies
    add column label_id uuid references public.inventory_items(id) on delete set null,
    add column label_lot_id uuid references public.inventory_lots(id) on delete restrict,
    add column total_labels_used integer not null default 0;

alter table public.assemblies
    add constraint assemblies_labels_non_negative check (total_labels_used >= 0);
