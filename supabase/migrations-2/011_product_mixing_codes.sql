-- Product-based mixing codes.
--
-- Auto-generated mixing codes now use the selected product name plus the
-- non-reused mixings.mixing_number identity value:
--   Berberine -> M-BER-001
--   Magnesium Citrate -> M-MAC-002 when another Magnesium product exists
--   Magnesium Glycinate -> M-MAG-003 when another Magnesium product exists

create or replace function public.product_mixing_code_prefix(p_product_id uuid)
returns text
language plpgsql
stable
as $$
declare
    product_name text;
    product_words text[];
    first_word text;
    second_word text;
    base_prefix text;
    collision_root text;
    has_collision boolean;
begin
    select p.product_name
    into product_name
    from public.products p
    where p.id = p_product_id;

    product_name := coalesce(nullif(btrim(product_name), ''), 'PRO');
    product_words := regexp_split_to_array(product_name, '\s+');
    first_word := upper(regexp_replace(coalesce(product_words[1], 'PRO'), '[^A-Za-z0-9]', '', 'g'));
    second_word := upper(regexp_replace(coalesce(product_words[2], ''), '[^A-Za-z0-9]', '', 'g'));

    if first_word = '' then
        first_word := 'PRO';
    end if;

    base_prefix := rpad(left(first_word, 3), 3, 'X');

    select exists (
        select 1
        from public.products other_product
        where other_product.id <> p_product_id
          and rpad(
                left(
                    upper(
                        regexp_replace(
                            coalesce((regexp_split_to_array(other_product.product_name, '\s+'))[1], ''),
                            '[^A-Za-z0-9]',
                            '',
                            'g'
                        )
                    ),
                    3
                ),
                3,
                'X'
              ) = base_prefix
    )
    into has_collision;

    if has_collision and second_word <> '' then
        collision_root := left(first_word, 2);
        return rpad(collision_root || left(second_word, 1), 3, 'X');
    end if;

    return base_prefix;
end;
$$;

create or replace function public.assign_mixing_code()
returns trigger
language plpgsql
as $$
begin
    if new.mixing_code is null or btrim(new.mixing_code) = '' then
        new.mixing_code :=
            'M-'
            || public.product_mixing_code_prefix(new.product_id)
            || '-'
            || lpad(new.mixing_number::text, 3, '0');
    end if;

    return new;
end;
$$;
