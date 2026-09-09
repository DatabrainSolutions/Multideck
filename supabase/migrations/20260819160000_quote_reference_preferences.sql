-- Quote references are allocated when a new quote is opened.
-- Booking prefix is stored now so the later quote-to-booking flow uses the same setting.

create table if not exists quote_api.reference_settings (
  company_id uuid primary key,
  quote_prefix varchar(12) not null default 'Q',
  booking_prefix varchar(12) not null default 'B',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

revoke all on table quote_api.reference_settings from public, anon, authenticated;

create or replace function quote_api.clean_reference_prefix(value text, fallback text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text := upper(regexp_replace(coalesce(value, ''), '[^A-Z0-9]', '', 'g'));
begin
  if cleaned = '' then return fallback; end if;
  if length(cleaned) > 12 then raise exception 'Reference prefix must be 12 characters or fewer.' using errcode = '22023'; end if;
  return cleaned;
end;
$$;

create or replace function quote_api.ensure_quote_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_company_id uuid := new."Org_ID";
  prefix text;
begin
  if workspace_company_id is null and new."CusQuoteHeader_OrgOfficeID" is not null then
    select "Company_ID" into workspace_company_id from public."cmp_Offices" where "Office_ID" = new."CusQuoteHeader_OrgOfficeID";
  end if;
  select quote_api.clean_reference_prefix(settings.quote_prefix, 'Q') into prefix
  from quote_api.reference_settings settings where settings.company_id = workspace_company_id;
  prefix := coalesce(prefix, 'Q');
  if tg_op = 'INSERT' and nullif(btrim(new."CusQuoteHeader_CustomerReference"), '') is null then
    if new."CusQuoteHeader_Number" is null then new."CusQuoteHeader_Number" := nextval('quote_api.quote_number_seq'); end if;
    new."CusQuoteHeader_CustomerReference" := prefix || '-' || new."CusQuoteHeader_Number";
  elsif tg_op = 'UPDATE' and old."CusQuoteHeader_CustomerReference" is null
    and nullif(btrim(new."CusQuoteHeader_CustomerReference"), '') is null then
    new."CusQuoteHeader_CustomerReference" := prefix || '-' || new."CusQuoteHeader_Number";
  elsif tg_op = 'UPDATE' and old."CusQuoteHeader_CustomerReference" is not null
    and new."CusQuoteHeader_CustomerReference" is distinct from old."CusQuoteHeader_CustomerReference" then
    new."CusQuoteHeader_CustomerReference" := old."CusQuoteHeader_CustomerReference";
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_Header_reference_guard" on public."CusQuote_Header";
create trigger "TR_CusQuote_Header_reference_guard"
before insert or update of "CusQuoteHeader_CustomerReference"
on public."CusQuote_Header"
for each row execute function quote_api.ensure_quote_reference();

create or replace function public.quote_workflow_open_quote(caller_auth_user_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select quote_api.save_quote(
    caller_auth_user_id,
    null,
    jsonb_build_object(
      'sourceType', 'account',
      'shipmentFacts', jsonb_build_object('createdOnOpen', true)
    )
  );
$$;

create or replace function public.quote_workflow_get_reference_settings(caller_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_company_id uuid;
  result record;
begin
  select "Company_ID" into workspace_company_id from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';
  if workspace_company_id is null then raise exception 'User identity is incomplete.' using errcode = '42501'; end if;
  select quote_api.clean_reference_prefix(coalesce(settings.quote_prefix, 'Q'), 'Q') as quote_prefix,
    quote_api.clean_reference_prefix(coalesce(settings.booking_prefix, 'B'), 'B') as booking_prefix
  into result from quote_api.reference_settings settings where settings.company_id = workspace_company_id;
  return jsonb_build_object('quotePrefix', coalesce(result.quote_prefix, 'Q'), 'bookingPrefix', coalesce(result.booking_prefix, 'B'));
end;
$$;

create or replace function public.quote_workflow_save_reference_settings(caller_auth_user_id uuid, quote_prefix text, booking_prefix text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_id uuid;
  user_id uuid;
  normalized_quote_prefix text := quote_api.clean_reference_prefix(quote_prefix, 'Q');
  normalized_booking_prefix text := quote_api.clean_reference_prefix(booking_prefix, 'B');
begin
  select "User_ID", "Company_ID" into user_id, company_id from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';
  if company_id is null then raise exception 'User identity is incomplete.' using errcode = '42501'; end if;
  if not exists (
    select 1 from public."cmp_Users_Roles" link
    join public."sys_UserRoles" role on role."sys_UserRole_ID" = link."sys_UserRole_ID"
    where link."User_ID" = user_id and lower(role."sys_UserRole_Name") in ('administrator', 'company admin')
  ) then raise exception 'Only tenant administrators can change system preferences.' using errcode = '42501'; end if;
  insert into quote_api.reference_settings(company_id, quote_prefix, booking_prefix, updated_at, updated_by)
  values (company_id, normalized_quote_prefix, normalized_booking_prefix, now(), user_id)
  on conflict (company_id) do update set quote_prefix = excluded.quote_prefix, booking_prefix = excluded.booking_prefix, updated_at = now(), updated_by = excluded.updated_by;
  return jsonb_build_object('quotePrefix', normalized_quote_prefix, 'bookingPrefix', normalized_booking_prefix);
end;
$$;

revoke all on function public.quote_workflow_open_quote(uuid) from public, anon, authenticated;
revoke all on function public.quote_workflow_get_reference_settings(uuid) from public, anon, authenticated;
revoke all on function public.quote_workflow_save_reference_settings(uuid, text, text) from public, anon, authenticated;
grant execute on function public.quote_workflow_open_quote(uuid) to service_role;
grant execute on function public.quote_workflow_get_reference_settings(uuid) to service_role;
grant execute on function public.quote_workflow_save_reference_settings(uuid, text, text) to service_role;
