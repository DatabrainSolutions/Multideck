begin;

create or replace function booking_api.country_code_from_location(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when regexp_replace(upper(coalesce(value, '')), '[^A-Z0-9]', '', 'g') ~ '^[A-Z]{2}[A-Z0-9]{3}$'
      then left(regexp_replace(upper(value), '[^A-Z0-9]', '', 'g'), 2)
    when upper(btrim(coalesce(value, ''))) ~ '^[A-Z]{2}$'
      then upper(btrim(value))
    else null
  end;
$$;

comment on function booking_api.country_code_from_location(text) is
  'Returns an ISO alpha-2 country code from a country code or UN/LOCODE, accepting mixed-case integration input.';

commit;
