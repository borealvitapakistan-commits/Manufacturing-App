create table public.inventory_lots (
    id uuid primary key default gen_random_uuid(),
    inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
    lot_code text not null,
    location_id uuid references public.inventory_locations(id) on delete set null,
    received_date date,
    manufacture_date date,
    expiry_date date,
    source_document_type text,
    source_document_id uuid,
    status text not null default 'available',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint inventory_lots_status_allowed check (
        status in ('available', 'held', 'consumed', 'expired', 'quarantined', 'deleted')
    ),
    constraint inventory_lots_lot_code_not_blank check (btrim(lot_code) <> '')
);

create unique index inventory_lots_item_lot_unique
on public.inventory_lots (inventory_item_id, lot_code);

create index inventory_lots_item_status_idx
on public.inventory_lots (inventory_item_id, status);

create trigger inventory_lots_set_updated_at
before update on public.inventory_lots
for each row execute function public.set_updated_at();

create table public.inventory_balances (
    id uuid primary key default gen_random_uuid(),
    inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
    inventory_lot_id uuid references public.inventory_lots(id) on delete restrict,
    location_id uuid references public.inventory_locations(id) on delete set null,
    quantity numeric(18, 6) not null default 0,
    updated_at timestamptz not null default now(),
    constraint inventory_balances_quantity_non_negative check (quantity >= 0)
);

create unique index inventory_balances_scope_unique
on public.inventory_balances (inventory_item_id, inventory_lot_id, location_id)
nulls not distinct;

create index inventory_balances_item_idx on public.inventory_balances (inventory_item_id);

create table public.inventory_movements (
    id uuid primary key default gen_random_uuid(),
    inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
    inventory_lot_id uuid references public.inventory_lots(id) on delete restrict,
    location_id uuid references public.inventory_locations(id) on delete set null,
    movement_type text not null,
    quantity_delta numeric(18, 6) not null,
    quantity_before numeric(18, 6) not null,
    quantity_after numeric(18, 6) not null,
    related_entity_type text,
    related_entity_id uuid,
    reason text,
    metadata jsonb not null default '{}'::jsonb,
    idempotency_key text,
    created_at timestamptz not null default now(),
    constraint inventory_movements_type_allowed check (
        movement_type in (
            'receive',
            'consume',
            'produce',
            'adjust',
            'transfer_in',
            'transfer_out',
            'delete_reversal'
        )
    ),
    constraint inventory_movements_after_non_negative check (quantity_after >= 0)
);

create unique index inventory_movements_idempotency_unique_not_null
on public.inventory_movements (idempotency_key)
where idempotency_key is not null and btrim(idempotency_key) <> '';

create index inventory_movements_item_created_idx
on public.inventory_movements (inventory_item_id, created_at desc);

create index inventory_movements_related_idx
on public.inventory_movements (related_entity_type, related_entity_id);

create or replace function public.apply_inventory_movement(
    p_inventory_item_id uuid,
    p_inventory_lot_id uuid,
    p_location_id uuid,
    p_quantity_delta numeric,
    p_movement_type text,
    p_related_entity_type text default null,
    p_related_entity_id uuid default null,
    p_reason text default null,
    p_metadata jsonb default '{}'::jsonb,
    p_idempotency_key text default null
)
returns public.inventory_movements
language plpgsql
as $$
declare
    v_before numeric(18, 6);
    v_after numeric(18, 6);
    v_existing public.inventory_movements;
    v_movement public.inventory_movements;
begin
    if p_idempotency_key is not null and btrim(p_idempotency_key) <> '' then
        select *
        into v_existing
        from public.inventory_movements
        where idempotency_key = p_idempotency_key;

        if found then
            return v_existing;
        end if;
    end if;

    select quantity
    into v_before
    from public.inventory_balances
    where inventory_item_id = p_inventory_item_id
      and inventory_lot_id is not distinct from p_inventory_lot_id
      and location_id is not distinct from p_location_id
    for update;

    if not found then
        v_before := 0;
    end if;

    v_after := v_before + p_quantity_delta;

    if v_after < 0 then
        raise exception 'Inventory is not enough. Available %, requested change %.',
            v_before, p_quantity_delta
            using errcode = '23514';
    end if;

    insert into public.inventory_balances (
        inventory_item_id,
        inventory_lot_id,
        location_id,
        quantity,
        updated_at
    )
    values (
        p_inventory_item_id,
        p_inventory_lot_id,
        p_location_id,
        v_after,
        now()
    )
    on conflict (inventory_item_id, inventory_lot_id, location_id)
    do update set
        quantity = excluded.quantity,
        updated_at = now();

    insert into public.inventory_movements (
        inventory_item_id,
        inventory_lot_id,
        location_id,
        movement_type,
        quantity_delta,
        quantity_before,
        quantity_after,
        related_entity_type,
        related_entity_id,
        reason,
        metadata,
        idempotency_key
    )
    values (
        p_inventory_item_id,
        p_inventory_lot_id,
        p_location_id,
        p_movement_type,
        p_quantity_delta,
        v_before,
        v_after,
        p_related_entity_type,
        p_related_entity_id,
        p_reason,
        coalesce(p_metadata, '{}'::jsonb),
        p_idempotency_key
    )
    returning * into v_movement;

    return v_movement;
end;
$$;
