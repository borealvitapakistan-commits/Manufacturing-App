-- Fix product-based mixing code collision prefixes.
--
-- Collision rule:
--   1. Use first three characters of the product's first word by default.
--      Berberine -> BER
--   2. If another product has the same first-three-character prefix, use
--      first two characters of the first word + first character of second word.
--      Magnesium Citrate -> MAC
--      Magnesium Glycinate -> MAG

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

    if has_collision then
        return rpad(
            left(first_word, 2)
            || coalesce(nullif(left(second_word, 1), ''), nullif(substr(first_word, 3, 1), ''), 'X'),
            3,
            'X'
        );
    end if;

    return base_prefix;
end;
$$;
