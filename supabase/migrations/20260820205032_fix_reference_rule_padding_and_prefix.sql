-- Keep padded numbers unbounded and repair the legacy literal-prefix column.
-- PostgreSQL lpad truncates when the source is wider than the requested width,
-- so the requested padding must never be shorter than the continuous number.

begin;

create or replace function quote_api.render_reference_pattern(
  pattern text,
  reference_number bigint,
  workspace_company_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  rendered text := quote_api.clean_reference_pattern(pattern, 'Q-{NUMBER:4}');
  company_seed text;
  token_match text[];
  token_width integer;
  replacement text;
begin
  if reference_number is null or reference_number < 1 then
    raise exception 'The next reference number must be 1 or higher.' using errcode = '22023';
  end if;
  select regexp_replace(upper(coalesce(company."Company_Name", 'COMPANY')), '[^A-Z0-9]', '', 'g')
    into company_seed
  from public."cmp_Company" company
  where company."Company_ID" = workspace_company_id;
  company_seed := coalesce(nullif(company_seed, ''), 'COMPANY');

  loop
    select regexp_match(rendered, '\{COMPANY(?::([0-9]{1,2}))?\}') into token_match;
    exit when token_match is null;
    token_width := nullif(token_match[1], '')::integer;
    replacement := case when token_width is null then company_seed else left(company_seed, token_width) end;
    rendered := regexp_replace(rendered, '\{COMPANY(?::[0-9]{1,2})?\}', replacement);
  end loop;

  loop
    select regexp_match(rendered, '\{MULTIDECK(?::([0-9]{1,2}))?\}') into token_match;
    exit when token_match is null;
    token_width := nullif(token_match[1], '')::integer;
    replacement := case when token_width is null then 'MULTIDECK' else left('MULTIDECK', token_width) end;
    rendered := regexp_replace(rendered, '\{MULTIDECK(?::[0-9]{1,2})?\}', replacement);
  end loop;

  select regexp_match(rendered, '\{NUMBER(?::([0-9]{1,2}))?\}') into token_match;
  token_width := nullif(token_match[1], '')::integer;
  replacement := case
    when token_width is null then reference_number::text
    else lpad(
      reference_number::text,
      greatest(token_width, length(reference_number::text)),
      '0'
    )
  end;
  return regexp_replace(rendered, '\{NUMBER(?::[0-9]{1,2})?\}', replacement);
end;
$$;

update quote_api.reference_settings
set quote_prefix = left(split_part(quote_pattern, '{', 1), 12),
    updated_at = now()
where nullif(left(split_part(quote_pattern, '{', 1), 12), '') is not null
  and quote_prefix is distinct from left(split_part(quote_pattern, '{', 1), 12);

revoke all on function quote_api.render_reference_pattern(text, bigint, uuid) from public, anon, authenticated;

commit;
