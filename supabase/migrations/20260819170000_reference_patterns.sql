-- Replace fixed prefixes with tenant-configurable reference patterns.
-- The {NUMBER} token is replaced by an atomically allocated sequence number.

alter table quote_api.reference_settings
  add column if not exists quote_pattern varchar(64),
  add column if not exists quote_next_number bigint;

create table if not exists quote_api.booking_reference_sequences (
  company_id uuid not null,
  sequence_key varchar(40) not null,
  label varchar(80) not null,
  pattern varchar(64) not null,
  next_number bigint not null default 1,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (company_id, sequence_key),
  check (next_number > 0)
);

revoke all on table quote_api.booking_reference_sequences from public, anon, authenticated;

create or replace function quote_api.clean_reference_pattern(value text, fallback text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text := upper(regexp_replace(coalesce(value, ''), '\{number\}', '{NUMBER}', 'gi'));
begin
  cleaned := btrim(cleaned);
  if cleaned = '' then cleaned := fallback; end if;
  if length(cleaned) > 64 or cleaned !~ '^[A-Z0-9 _./-]*\{NUMBER\}[A-Z0-9 _./-]*$' then
    raise exception 'Reference pattern must contain {number} and may use letters, numbers, spaces, hyphens, underscores, slashes and full stops.' using errcode = '22023';
  end if;
  return cleaned;
end;
$$;

create or replace function quote_api.render_reference_pattern(pattern text, reference_number bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(pattern, '{NUMBER}', reference_number::text)
$$;

update quote_api.reference_settings
set quote_pattern = quote_api.clean_reference_pattern(
  coalesce(nullif(quote_pattern, ''), nullif(quote_prefix, '') || '-{NUMBER}'),
  'Q-{NUMBER}'
)
where quote_pattern is null or quote_pattern = '';

update quote_api.reference_settings
set quote_next_number = coalesce((select max("CusQuoteHeader_Number") from public."CusQuote_Header"), 0) + 1
where quote_next_number is null;

alter table quote_api.reference_settings
  alter column quote_pattern set default 'Q-{NUMBER}';

insert into quote_api.booking_reference_sequences(company_id, sequence_key, label, pattern)
select settings.company_id, 'default', 'Default booking',
  quote_api.clean_reference_pattern(coalesce(nullif(settings.booking_prefix, ''), 'B') || '-{NUMBER}', 'B-{NUMBER}')
from quote_api.reference_settings settings
where not exists (
  select 1 from quote_api.booking_reference_sequences existing
  where existing.company_id = settings.company_id
);

create or replace function quote_api.ensure_quote_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_company_id uuid := new."Org_ID";
  pattern text;
  reference_number bigint;
begin
  if workspace_company_id is null and new."CusQuoteHeader_OrgOfficeID" is not null then
    select "Company_ID" into workspace_company_id from public."cmp_Offices" where "Office_ID" = new."CusQuoteHeader_OrgOfficeID";
  end if;
  select quote_api.clean_reference_pattern(coalesce(settings.quote_pattern, settings.quote_prefix || '-{NUMBER}'), 'Q-{NUMBER}')
    into pattern
    from quote_api.reference_settings settings
    where settings.company_id = workspace_company_id;
  pattern := coalesce(pattern, 'Q-{NUMBER}');
  if tg_op = 'INSERT' and nullif(btrim(new."CusQuoteHeader_CustomerReference"), '') is null then
    if new."CusQuoteHeader_Number" is null then new."CusQuoteHeader_Number" := nextval('quote_api.quote_number_seq'); end if;
    select quote_next_number into reference_number from quote_api.reference_settings where company_id = workspace_company_id for update;
    if reference_number is null then reference_number := new."CusQuoteHeader_Number"; else update quote_api.reference_settings set quote_next_number = reference_number + 1 where company_id = workspace_company_id; end if;
    new."CusQuoteHeader_CustomerReference" := quote_api.render_reference_pattern(pattern, reference_number);
  elsif tg_op = 'UPDATE' and old."CusQuoteHeader_CustomerReference" is null
    and nullif(btrim(new."CusQuoteHeader_CustomerReference"), '') is null then
    new."CusQuoteHeader_CustomerReference" := quote_api.render_reference_pattern(pattern, new."CusQuoteHeader_Number");
  elsif tg_op = 'UPDATE' and old."CusQuoteHeader_CustomerReference" is not null
    and new."CusQuoteHeader_CustomerReference" is distinct from old."CusQuoteHeader_CustomerReference" then
    new."CusQuoteHeader_CustomerReference" := old."CusQuoteHeader_CustomerReference";
  end if;
  return new;
end;
$$;

create or replace function public.quote_workflow_get_reference_settings(caller_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_company_id uuid;
  quote_pattern_value text;
  quote_next_number_value bigint;
  booking_patterns_value jsonb;
begin
  select "Company_ID" into workspace_company_id from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';
  if workspace_company_id is null then raise exception 'User identity is incomplete.' using errcode = '42501'; end if;
  select quote_api.clean_reference_pattern(coalesce(settings.quote_pattern, settings.quote_prefix || '-{NUMBER}'), 'Q-{NUMBER}'), settings.quote_next_number
    into quote_pattern_value, quote_next_number_value
    from quote_api.reference_settings settings where settings.company_id = workspace_company_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', sequence_key, 'label', label, 'pattern', pattern, 'nextNumber', next_number, 'enabled', enabled
  ) order by label), jsonb_build_array(jsonb_build_object(
    'key', 'default', 'label', 'Default booking', 'pattern', 'B-{NUMBER}', 'nextNumber', 1, 'enabled', true
  )))
    into booking_patterns_value
    from quote_api.booking_reference_sequences where company_id = workspace_company_id and enabled;
  return jsonb_build_object(
    'quotePattern', coalesce(quote_pattern_value, 'Q-{NUMBER}'), 'quoteNextNumber', quote_next_number_value,
    'bookingPatterns', coalesce(booking_patterns_value, '[]'::jsonb)
  );
end;
$$;

drop function if exists public.quote_workflow_save_reference_settings(uuid, text, jsonb);
create or replace function public.quote_workflow_save_reference_settings(caller_auth_user_id uuid, quote_pattern text, quote_next_number bigint, booking_patterns jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_id_value uuid;
  user_id_value uuid;
  normalized_quote_pattern text := quote_api.clean_reference_pattern(quote_pattern, 'Q-{NUMBER}');
  item jsonb;
  normalized_key text;
  normalized_label text;
  normalized_pattern text;
  normalized_next_number bigint;
begin
  select "User_ID", "Company_ID" into user_id_value, company_id_value from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';
  if company_id_value is null then raise exception 'User identity is incomplete.' using errcode = '42501'; end if;
  if not exists (
    select 1 from public."cmp_Users_Roles" link
    join public."sys_UserRoles" role on role."sys_UserRole_ID" = link."sys_UserRole_ID"
    where link."User_ID" = user_id_value and lower(role."sys_UserRole_Name") in ('administrator', 'company admin')
  ) then raise exception 'Only tenant administrators can change system preferences.' using errcode = '42501'; end if;
  if jsonb_typeof(booking_patterns) <> 'array' or jsonb_array_length(booking_patterns) > 20 then
    raise exception 'Booking reference patterns are invalid.' using errcode = '22023';
  end if;
  insert into quote_api.reference_settings(company_id, quote_prefix, booking_prefix, quote_pattern, quote_next_number, updated_at, updated_by)
  values (company_id_value, left(normalized_quote_pattern, 12), 'B', normalized_quote_pattern, greatest(coalesce(quote_next_number, 1), 1), now(), user_id_value)
  on conflict (company_id) do update set quote_pattern = excluded.quote_pattern, quote_prefix = excluded.quote_prefix, quote_next_number = excluded.quote_next_number, updated_at = now(), updated_by = excluded.updated_by;
  delete from quote_api.booking_reference_sequences where company_id = company_id_value;
  for item in select value from jsonb_array_elements(booking_patterns) loop
    normalized_key := lower(regexp_replace(coalesce(item->>'key', ''), '[^a-z0-9_-]', '', 'g'));
    normalized_label := left(nullif(btrim(item->>'label'), ''), 80);
    normalized_pattern := quote_api.clean_reference_pattern(item->>'pattern', 'B-{NUMBER}');
    normalized_next_number := greatest(coalesce((item->>'nextNumber')::bigint, 1), 1);
    if normalized_key = '' or normalized_label is null then raise exception 'Each booking pattern needs a key and label.' using errcode = '22023'; end if;
    insert into quote_api.booking_reference_sequences(company_id, sequence_key, label, pattern, next_number, enabled, updated_at, updated_by)
    values (company_id_value, left(normalized_key, 40), normalized_label, normalized_pattern, normalized_next_number, true, now(), user_id_value);
  end loop;
  return public.quote_workflow_get_reference_settings(caller_auth_user_id);
end;
$$;

revoke all on function public.quote_workflow_get_reference_settings(uuid) from public, anon, authenticated;
revoke all on function public.quote_workflow_save_reference_settings(uuid, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.quote_workflow_get_reference_settings(uuid) to service_role;
grant execute on function public.quote_workflow_save_reference_settings(uuid, text, bigint, jsonb) to service_role;
