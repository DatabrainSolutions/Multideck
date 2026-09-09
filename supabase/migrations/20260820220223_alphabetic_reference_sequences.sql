-- Allow each reference rule to choose one continuous counter: numeric or alphabetic.
-- Alphabetic counters use the same atomic bigint allocator as numeric counters;
-- 1 renders as AAAA/AAAAA, 2 as AAAB/AAAAB, and the sequence grows past its
-- minimum width instead of wrapping or reusing a previous reference.

begin;

create or replace function quote_api.clean_reference_pattern(value text, fallback text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  cleaned text := upper(btrim(coalesce(value, '')));
  literal_text text;
  counter_tokens integer;
  invalid_width text;
begin
  if cleaned = '' then cleaned := upper(btrim(fallback)); end if;
  if length(cleaned) > 64 then
    raise exception 'Reference rules must be 64 characters or fewer.' using errcode = '22023';
  end if;

  select count(*) into counter_tokens
  from regexp_matches(cleaned, '\{(?:NUMBER|LETTERS)(?::[0-9]{1,2})?\}', 'g');
  if counter_tokens <> 1 then
    raise exception 'Every reference rule needs one continuous number or letter sequence.' using errcode = '22023';
  end if;

  select width_match[1] into invalid_width
  from regexp_matches(cleaned, '\{(?:NUMBER|LETTERS|COMPANY|MULTIDECK):([0-9]{1,2})\}', 'g') width_match
  where width_match[1]::integer not between 1 and 18
  limit 1;
  if invalid_width is not null then
    raise exception 'Reference rule lengths must be between 1 and 18 characters.' using errcode = '22023';
  end if;

  literal_text := regexp_replace(
    cleaned,
    '\{(?:NUMBER|LETTERS|COMPANY|MULTIDECK)(?::[0-9]{1,2})?\}',
    '',
    'g'
  );
  if literal_text ~ '[^A-Z0-9 _./-]' or literal_text ~ '[{}]' then
    raise exception 'Use letters, numbers, spaces, hyphens, underscores, slashes, full stops and the supported rule parts.' using errcode = '22023';
  end if;
  return cleaned;
end;
$$;

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
  counter_kind text;
  replacement text;
  alphabetic_value bigint;
begin
  if reference_number is null or reference_number < 1 then
    raise exception 'The next reference value must be 1 or higher.' using errcode = '22023';
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

  select regexp_match(rendered, '\{(NUMBER|LETTERS)(?::([0-9]{1,2}))?\}') into token_match;
  counter_kind := token_match[1];
  token_width := nullif(token_match[2], '')::integer;

  if counter_kind = 'NUMBER' then
    replacement := case
      when token_width is null then reference_number::text
      else lpad(reference_number::text, greatest(token_width, length(reference_number::text)), '0')
    end;
  else
    alphabetic_value := reference_number - 1;
    replacement := '';
    loop
      replacement := chr(65 + (alphabetic_value % 26)::integer) || replacement;
      alphabetic_value := alphabetic_value / 26;
      exit when alphabetic_value = 0;
    end loop;
    if token_width is not null then
      replacement := lpad(replacement, greatest(token_width, length(replacement)), 'A');
    end if;
  end if;

  return regexp_replace(rendered, '\{(?:NUMBER|LETTERS)(?::[0-9]{1,2})?\}', replacement);
end;
$$;

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" = 'Administrator-controlled quote, booking and customer reference formats. Every rule must contain one unbounded continuous numeric or alphabetic sequence, and existing references remain reserved.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'reference_settings';

update public."sys_AIDexterActions"
set "AIDexterAction_Description" = 'Update the complete administrator-reviewed quote, booking and customer reference rules. Every rule must keep one continuous numeric or alphabetic sequence; changing the next value requires explicit review.',
    "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'update_reference_settings';

revoke all on function quote_api.clean_reference_pattern(text, text) from public, anon, authenticated;
revoke all on function quote_api.render_reference_pattern(text, bigint, uuid) from public, anon, authenticated;

commit;
