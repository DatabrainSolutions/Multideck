-- Safe, customisable reference rules for quotes, bookings and customers.
-- Existing references are reserved verbatim. Counters can therefore restart at
-- 0001 without renaming records or allowing a duplicate to be allocated.

begin;

alter table quote_api.reference_settings
  add column if not exists customer_pattern varchar(64) not null default 'CUS{NUMBER:4}',
  add column if not exists customer_next_number bigint not null default 1;

alter table quote_api.reference_settings
  drop constraint if exists "CK_reference_settings_customer_next_number";
alter table quote_api.reference_settings
  add constraint "CK_reference_settings_customer_next_number" check (customer_next_number > 0);

create table if not exists quote_api.reference_reservations (
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  normalized_reference varchar(120) not null,
  reference_value varchar(120) not null,
  reference_kind varchar(40) not null,
  source_id uuid,
  reserved_at timestamptz not null default now(),
  primary key (company_id, normalized_reference),
  constraint "CK_reference_reservations_kind"
    check (reference_kind in ('quote', 'booking', 'customer')),
  constraint "CK_reference_reservations_nonempty"
    check (btrim(reference_value) <> '' and normalized_reference = upper(btrim(reference_value)))
);

revoke all on table quote_api.reference_reservations from public, anon, authenticated;

insert into quote_api.reference_reservations (
  company_id, normalized_reference, reference_value, reference_kind, source_id
)
select distinct on (company_id, upper(btrim(reference_value)))
  company_id, upper(btrim(reference_value)), btrim(reference_value), reference_kind, source_id
from (
  select coalesce(office."Company_ID", quote."Org_ID") company_id,
    quote."CusQuoteHeader_CustomerReference"::text reference_value,
    'quote'::text reference_kind, quote."CusQuoteHeader_ID" source_id
  from public."CusQuote_Header" quote
  left join public."cmp_Offices" office
    on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  where nullif(btrim(quote."CusQuoteHeader_CustomerReference"), '') is not null
    and not quote."CusQuoteHeader_IsDeleted"
  union all
  select office."Company_ID", job."Job_BookingReference", 'booking', job."Job_ID"
  from public."Job_Header" job
  join public."cmp_Offices" office
    on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where nullif(btrim(job."Job_BookingReference"), '') is not null
    and not job."Job_IsDeleted"
  union all
  select profile."CRMAccount_CompanyID", organisation."Org_AccCode", 'customer', organisation."Org_id"
  from public."CRM_AccountProfiles" profile
  join public."Org_Master" organisation on organisation."Org_id" = profile."CRMAccount_OrgID"
  where nullif(btrim(organisation."Org_AccCode"), '') is not null
    and not profile."CRMAccount_IsDeleted"
) existing
where company_id is not null and nullif(btrim(reference_value), '') is not null
order by company_id, upper(btrim(reference_value)), source_id
on conflict (company_id, normalized_reference) do nothing;

create or replace function quote_api.clean_reference_pattern(value text, fallback text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  cleaned text := upper(btrim(coalesce(value, '')));
  literal_text text;
  number_tokens integer;
  invalid_width text;
begin
  if cleaned = '' then cleaned := upper(btrim(fallback)); end if;
  if length(cleaned) > 64 then
    raise exception 'Reference rules must be 64 characters or fewer.' using errcode = '22023';
  end if;

  select count(*) into number_tokens
  from regexp_matches(cleaned, '\{NUMBER(?::[0-9]{1,2})?\}', 'g');
  if number_tokens <> 1 then
    raise exception 'Every reference rule needs one continuous number, such as 1, 2, 3 or 0001, 0002, 0003.' using errcode = '22023';
  end if;

  select width_match[1] into invalid_width
  from regexp_matches(cleaned, '\{(?:NUMBER|COMPANY|MULTIDECK):([0-9]{1,2})\}', 'g') width_match
  where width_match[1]::integer not between 1 and 18
  limit 1;
  if invalid_width is not null then
    raise exception 'Reference rule lengths must be between 1 and 18 characters.' using errcode = '22023';
  end if;

  literal_text := regexp_replace(
    cleaned,
    '\{(?:NUMBER|COMPANY|MULTIDECK)(?::[0-9]{1,2})?\}',
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
    else lpad(reference_number::text, token_width, '0')
  end;
  return regexp_replace(rendered, '\{NUMBER(?::[0-9]{1,2})?\}', replacement);
end;
$$;

create or replace function quote_api.render_reference_pattern(pattern text, reference_number bigint)
returns text
language sql
stable
set search_path = pg_catalog, quote_api
as $$
  select quote_api.render_reference_pattern(pattern, reference_number, null)
$$;

create or replace function quote_api.reserve_reference(
  workspace_company_id uuid,
  reference_kind_value text,
  sequence_key_value text,
  pattern_value text,
  starting_number bigint
)
returns table(reference_value text, next_number bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare
  candidate_number bigint := greatest(coalesce(starting_number, 1), 1);
  candidate_reference text;
  reserved_reference text;
begin
  if workspace_company_id is null then
    raise exception 'The workspace company is required before allocating a reference.' using errcode = '42501';
  end if;
  if reference_kind_value not in ('quote', 'booking', 'customer') then
    raise exception 'That reference type is not supported.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    workspace_company_id::text || ':' || reference_kind_value || ':' || coalesce(sequence_key_value, 'default'), 0
  ));
  loop
    candidate_reference := quote_api.render_reference_pattern(pattern_value, candidate_number, workspace_company_id);
    if length(candidate_reference) > 120 then
      raise exception 'The generated reference is too long.' using errcode = '22023';
    end if;
    if reference_kind_value = 'customer' and length(candidate_reference) > 8 then
      raise exception 'Customer references must stay within the eight-character account-code limit.' using errcode = '22023';
    end if;
    -- Reservations are the fast path. The live checks also cover a reference
    -- entered manually after this migration, before it has been reserved.
    if exists (
      select 1
      from public."CusQuote_Header" quote
      left join public."cmp_Offices" office
        on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
      where coalesce(office."Company_ID", quote."Org_ID") = workspace_company_id
        and upper(btrim(quote."CusQuoteHeader_CustomerReference")) = upper(btrim(candidate_reference))
        and not quote."CusQuoteHeader_IsDeleted"
      union all
      select 1
      from public."Job_Header" job
      join public."cmp_Offices" office
        on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
      where office."Company_ID" = workspace_company_id
        and upper(btrim(job."Job_BookingReference")) = upper(btrim(candidate_reference))
        and not job."Job_IsDeleted"
      union all
      select 1
      from public."CRM_AccountProfiles" profile
      join public."Org_Master" organisation on organisation."Org_id" = profile."CRMAccount_OrgID"
      where profile."CRMAccount_CompanyID" = workspace_company_id
        and upper(btrim(organisation."Org_AccCode")) = upper(btrim(candidate_reference))
        and not profile."CRMAccount_IsDeleted"
    ) then
      candidate_number := candidate_number + 1;
      continue;
    end if;
    insert into quote_api.reference_reservations (
      company_id, normalized_reference, reference_value, reference_kind
    ) values (
      workspace_company_id, upper(btrim(candidate_reference)), candidate_reference, reference_kind_value
    )
    on conflict (company_id, normalized_reference) do nothing
    returning quote_api.reference_reservations.reference_value into reserved_reference;
    if reserved_reference is not null then
      return query select reserved_reference, candidate_number + 1;
      return;
    end if;
    candidate_number := candidate_number + 1;
  end loop;
end;
$$;

update quote_api.reference_settings
set quote_pattern = regexp_replace(
      quote_api.clean_reference_pattern(coalesce(quote_pattern, quote_prefix || '-{NUMBER}'), 'Q-{NUMBER}'),
      '\{NUMBER\}', '{NUMBER:4}', 'g'
    ),
    quote_next_number = 1,
    customer_pattern = quote_api.clean_reference_pattern(coalesce(customer_pattern, 'CUS{NUMBER:4}'), 'CUS{NUMBER:4}'),
    customer_next_number = 1;

update quote_api.booking_reference_sequences
set pattern = regexp_replace(
      quote_api.clean_reference_pattern(pattern, 'B-{NUMBER}'),
      '\{NUMBER\}', '{NUMBER:4}', 'g'
    ),
    next_number = 1,
    updated_at = now();

create or replace function quote_api.ensure_quote_reference()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare
  workspace_company_id uuid := new."Org_ID";
  settings_row quote_api.reference_settings%rowtype;
  allocated record;
begin
  if workspace_company_id is null and coalesce(new."CusQuoteHeader_OrgOfficeID", new."OrgOffice_ID") is not null then
    select "Company_ID" into workspace_company_id
    from public."cmp_Offices"
    where "Office_ID" = coalesce(new."CusQuoteHeader_OrgOfficeID", new."OrgOffice_ID");
  end if;
  if tg_op = 'INSERT' and nullif(btrim(new."CusQuoteHeader_CustomerReference"), '') is null then
    if new."CusQuoteHeader_Number" is null then
      new."CusQuoteHeader_Number" := nextval('quote_api.quote_number_seq');
    end if;
    insert into quote_api.reference_settings(company_id, quote_prefix, booking_prefix, quote_pattern, quote_next_number)
    values (workspace_company_id, 'Q', 'B', 'Q-{NUMBER:4}', 1)
    on conflict (company_id) do nothing;
    select * into settings_row
    from quote_api.reference_settings
    where company_id = workspace_company_id
    for update;
    select * into allocated from quote_api.reserve_reference(
      workspace_company_id, 'quote', 'default', settings_row.quote_pattern, settings_row.quote_next_number
    );
    update quote_api.reference_settings
    set quote_next_number = allocated.next_number, updated_at = now()
    where company_id = workspace_company_id;
    new."CusQuoteHeader_CustomerReference" := allocated.reference_value;
  elsif tg_op = 'UPDATE' and old."CusQuoteHeader_CustomerReference" is null
    and nullif(btrim(new."CusQuoteHeader_CustomerReference"), '') is null then
    insert into quote_api.reference_settings(company_id, quote_prefix, booking_prefix, quote_pattern, quote_next_number)
    values (workspace_company_id, 'Q', 'B', 'Q-{NUMBER:4}', 1)
    on conflict (company_id) do nothing;
    select * into settings_row
    from quote_api.reference_settings
    where company_id = workspace_company_id
    for update;
    select * into allocated from quote_api.reserve_reference(
      workspace_company_id, 'quote', 'default', settings_row.quote_pattern, settings_row.quote_next_number
    );
    update quote_api.reference_settings
    set quote_next_number = allocated.next_number, updated_at = now()
    where company_id = workspace_company_id;
    new."CusQuoteHeader_CustomerReference" := allocated.reference_value;
  elsif tg_op = 'UPDATE' and old."CusQuoteHeader_CustomerReference" is not null
    and new."CusQuoteHeader_CustomerReference" is distinct from old."CusQuoteHeader_CustomerReference" then
    new."CusQuoteHeader_CustomerReference" := old."CusQuoteHeader_CustomerReference";
  end if;
  return new;
end;
$$;

create or replace function booking_api.allocate_reference(
  workspace_company_id uuid,
  requested_sequence_key text default 'default'
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api, booking_api
as $$
declare
  sequence_key_value text := coalesce(nullif(lower(btrim(requested_sequence_key)), ''), 'default');
  sequence_row quote_api.booking_reference_sequences%rowtype;
  allocated record;
begin
  insert into quote_api.booking_reference_sequences (
    company_id, sequence_key, label, pattern, next_number, enabled
  ) values (
    workspace_company_id, sequence_key_value,
    case when sequence_key_value = 'default' then 'Default booking' else initcap(replace(sequence_key_value, '_', ' ')) end,
    'B-{NUMBER:4}', 1, true
  ) on conflict (company_id, sequence_key) do nothing;
  select reference.* into strict sequence_row
  from quote_api.booking_reference_sequences reference
  where reference.company_id = workspace_company_id
    and reference.sequence_key = sequence_key_value
    and reference.enabled
  for update;
  select * into allocated from quote_api.reserve_reference(
    workspace_company_id, 'booking', sequence_key_value, sequence_row.pattern, sequence_row.next_number
  );
  update quote_api.booking_reference_sequences
  set next_number = allocated.next_number, updated_at = now()
  where company_id = workspace_company_id and sequence_key = sequence_key_value;
  return allocated.reference_value;
exception
  when no_data_found then
    raise exception 'Choose an active booking reference sequence.' using errcode = '22023';
end;
$$;

create or replace function quote_api.allocate_customer_reference(workspace_company_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare
  settings_row quote_api.reference_settings%rowtype;
  allocated record;
begin
  insert into quote_api.reference_settings(company_id, quote_prefix, booking_prefix, quote_pattern, quote_next_number, customer_pattern, customer_next_number)
  values (workspace_company_id, 'Q', 'B', 'Q-{NUMBER:4}', 1, 'CUS{NUMBER:4}', 1)
  on conflict (company_id) do nothing;
  select * into settings_row from quote_api.reference_settings
  where company_id = workspace_company_id for update;
  select * into allocated from quote_api.reserve_reference(
    workspace_company_id, 'customer', 'default', settings_row.customer_pattern, settings_row.customer_next_number
  );
  update quote_api.reference_settings
  set customer_next_number = allocated.next_number, updated_at = now()
  where company_id = workspace_company_id;
  return allocated.reference_value;
end;
$$;

do $$
begin
  if to_regprocedure('public._multideck_crm_create_account_pre_reference_rules_20260820(uuid,jsonb)') is null then
    alter function public.multideck_crm_create_account(uuid, jsonb)
      rename to _multideck_crm_create_account_pre_reference_rules_20260820;
  end if;
end;
$$;

create or replace function public.multideck_crm_create_account(p_actor_user_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare
  v_result jsonb;
  v_org uuid;
  v_company uuid;
  v_candidate text;
begin
  v_result := public._multideck_crm_create_account_pre_reference_rules_20260820(p_actor_user_id, p_input);
  v_org := (v_result ->> 'id')::uuid;
  if nullif(btrim(p_input ->> 'accountCode'), '') is not null then
    select "Org_AccCode" into v_candidate from public."Org_Master" where "Org_id" = v_org;
    return v_result || jsonb_build_object('accountCode', v_candidate);
  end if;
  select "Company_ID" into v_company
  from public."cmp_Users"
  where "User_ID" = p_actor_user_id and "User_AccessStatus" = 'active';
  if v_company is null then
    raise exception 'The workspace company could not be resolved.' using errcode = '42501';
  end if;
  v_candidate := quote_api.allocate_customer_reference(v_company);
  update public."Org_Master" set "Org_AccCode" = v_candidate where "Org_id" = v_org;
  return v_result || jsonb_build_object('accountCode', v_candidate);
end;
$$;

create or replace function public.quote_workflow_get_reference_settings(caller_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare
  workspace_company_id uuid;
  settings_row quote_api.reference_settings%rowtype;
  booking_patterns_value jsonb;
  company_name_value text;
begin
  select app_user."Company_ID", company."Company_Name"
    into workspace_company_id, company_name_value
  from public."cmp_Users" app_user
  join public."cmp_Company" company on company."Company_ID" = app_user."Company_ID"
  where app_user."Auth_User_ID" = caller_auth_user_id and app_user."User_AccessStatus" = 'active';
  if workspace_company_id is null then
    raise exception 'User identity is incomplete.' using errcode = '42501';
  end if;
  select * into settings_row from quote_api.reference_settings where company_id = workspace_company_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', sequence_key, 'label', label, 'pattern', pattern,
    'nextNumber', next_number, 'enabled', enabled
  ) order by case when sequence_key = 'default' then 0 else 1 end, label), '[]'::jsonb)
  into booking_patterns_value
  from quote_api.booking_reference_sequences
  where company_id = workspace_company_id and enabled;
  if jsonb_array_length(booking_patterns_value) = 0 then
    booking_patterns_value := jsonb_build_array(jsonb_build_object(
      'key', 'default', 'label', 'Default booking', 'pattern', 'B-{NUMBER:4}', 'nextNumber', 1, 'enabled', true
    ));
  end if;
  return jsonb_build_object(
    'companyName', company_name_value,
    'quotePattern', coalesce(settings_row.quote_pattern, 'Q-{NUMBER:4}'),
    'quoteNextNumber', coalesce(settings_row.quote_next_number, 1),
    'bookingPatterns', booking_patterns_value,
    'customerPattern', coalesce(settings_row.customer_pattern, 'CUS{NUMBER:4}'),
    'customerNextNumber', coalesce(settings_row.customer_next_number, 1)
  );
end;
$$;

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code", "AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description", "AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_IsActive", "AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_UpdatedAt", "AIDexterWatchCapability_RequiredPermissionsJSON"
) values (
  'reference_settings', 'Reference rules',
  'Quote, booking and customer reference formats and their protected next numbers.',
  '["quotePattern","quoteNextNumber","bookingPatterns","customerPattern","customerNextNumber"]'::jsonb,
  true, 95, now(), '["AgentDexter.Manage"]'::jsonb
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_SortOrder" = excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_UpdatedAt" = now(),
  "AIDexterWatchCapability_RequiredPermissionsJSON" = excluded."AIDexterWatchCapability_RequiredPermissionsJSON";

drop function if exists public.quote_workflow_save_reference_settings(uuid, text, bigint, jsonb);

create or replace function public.quote_workflow_save_reference_settings(
  caller_auth_user_id uuid,
  quote_pattern text,
  quote_next_number bigint,
  booking_patterns jsonb,
  customer_pattern text,
  customer_next_number bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare
  company_id_value uuid;
  user_id_value uuid;
  normalized_quote_pattern text := quote_api.clean_reference_pattern(quote_pattern, 'Q-{NUMBER:4}');
  normalized_customer_pattern text := quote_api.clean_reference_pattern(customer_pattern, 'CUS{NUMBER:4}');
  item jsonb;
  normalized_key text;
  normalized_label text;
  normalized_pattern text;
  normalized_next_number bigint;
  before_value jsonb;
  after_value jsonb;
begin
  select "User_ID", "Company_ID" into user_id_value, company_id_value
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';
  if company_id_value is null then
    raise exception 'User identity is incomplete.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public."cmp_Users_Roles" link
    join public."sys_UserRoles" role on role."sys_UserRole_ID" = link."sys_UserRole_ID"
    where link."User_ID" = user_id_value
      and lower(role."sys_UserRole_Name") in ('administrator', 'company admin')
  ) then
    raise exception 'Only tenant administrators can change system preferences.' using errcode = '42501';
  end if;
  if jsonb_typeof(booking_patterns) <> 'array' or jsonb_array_length(booking_patterns) < 1
     or jsonb_array_length(booking_patterns) > 20 then
    raise exception 'Keep between 1 and 20 booking reference rules.' using errcode = '22023';
  end if;
  if length(quote_api.render_reference_pattern(normalized_customer_pattern, greatest(coalesce(customer_next_number, 1), 1), company_id_value)) > 8 then
    raise exception 'Customer references must stay within the eight-character account-code limit.' using errcode = '22023';
  end if;
  before_value := public.quote_workflow_get_reference_settings(caller_auth_user_id);
  insert into quote_api.reference_settings(
    company_id, quote_prefix, booking_prefix, quote_pattern, quote_next_number,
    customer_pattern, customer_next_number, updated_at, updated_by
  ) values (
    company_id_value,
    coalesce(nullif(left(split_part(normalized_quote_pattern, '{', 1), 12), ''), 'Q'),
    'B', normalized_quote_pattern,
    greatest(coalesce(quote_next_number, 1), 1), normalized_customer_pattern,
    greatest(coalesce(customer_next_number, 1), 1), now(), user_id_value
  )
  on conflict (company_id) do update set
    quote_pattern = excluded.quote_pattern,
    quote_next_number = excluded.quote_next_number,
    customer_pattern = excluded.customer_pattern,
    customer_next_number = excluded.customer_next_number,
    updated_at = now(), updated_by = excluded.updated_by;

  delete from quote_api.booking_reference_sequences where company_id = company_id_value;
  for item in select value from jsonb_array_elements(booking_patterns) loop
    normalized_key := lower(regexp_replace(coalesce(item ->> 'key', ''), '[^a-z0-9_-]', '', 'g'));
    normalized_label := left(nullif(btrim(item ->> 'label'), ''), 80);
    normalized_pattern := quote_api.clean_reference_pattern(item ->> 'pattern', 'B-{NUMBER:4}');
    normalized_next_number := greatest(coalesce((item ->> 'nextNumber')::bigint, 1), 1);
    if normalized_key = '' or normalized_label is null then
      raise exception 'Each booking reference rule needs a name.' using errcode = '22023';
    end if;
    insert into quote_api.booking_reference_sequences(
      company_id, sequence_key, label, pattern, next_number, enabled, updated_at, updated_by
    ) values (
      company_id_value, left(normalized_key, 40), normalized_label,
      normalized_pattern, normalized_next_number, true, now(), user_id_value
    );
  end loop;
  after_value := public.quote_workflow_get_reference_settings(caller_auth_user_id);
  if after_value is distinct from before_value then
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (
      company_id_value, 'reference_settings', 'quote_api.reference_settings', company_id_value,
      before_value, after_value
    );
  end if;
  return after_value;
end;
$$;

create or replace function public.multideck_dexter_domain_reference_settings(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, quote_api
as $$
  select jsonb_build_object('data', jsonb_build_array(jsonb_build_object(
    'recordId', settings.company_id,
    'name', 'Workspace reference rules',
    'quotePattern', coalesce(settings.quote_pattern, 'Q-{NUMBER:4}'),
    'quoteNextNumber', coalesce(settings.quote_next_number, 1),
    'bookingPatterns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', sequence.sequence_key, 'label', sequence.label,
        'pattern', sequence.pattern, 'nextNumber', sequence.next_number
      ) order by sequence.label)
      from quote_api.booking_reference_sequences sequence
      where sequence.company_id = settings.company_id and sequence.enabled
    ), '[]'::jsonb),
    'customerPattern', coalesce(settings.customer_pattern, 'CUS{NUMBER:4}'),
    'customerNextNumber', coalesce(settings.customer_next_number, 1),
    'updatedAt', settings.updated_at
  )))
  from quote_api.reference_settings settings
  where settings.company_id = p_company_id
$$;

revoke all on function public.multideck_dexter_domain_reference_settings(uuid, text, integer) from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive", "AIDexterDomain_UpdatedAt"
) values (
  'reference_settings', 'Reference rules',
  'Administrator-controlled quote, booking and customer reference formats. Every rule must contain one unbounded continuous number, and existing references remain reserved.',
  'multideck_dexter_domain_reference_settings', 95, true, now()
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now();

create or replace function public.multideck_dexter_action_update_reference_settings(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare
  actor_auth_id uuid;
begin
  select app_user."Auth_User_ID" into actor_auth_id
  from public."cmp_Users" app_user
  where app_user."User_ID" = p_user_id
    and app_user."Company_ID" = p_company_id
    and app_user."User_AccessStatus" = 'active';
  if actor_auth_id is null or not exists (
    select 1 from public."cmp_Users_Roles" link
    join public."sys_UserRoles" role on role."sys_UserRole_ID" = link."sys_UserRole_ID"
    where link."User_ID" = p_user_id
      and lower(role."sys_UserRole_Name") in ('administrator', 'company admin')
  ) then
    raise exception 'Only tenant administrators can change reference rules.' using errcode = '42501';
  end if;
  return public.quote_workflow_save_reference_settings(
    actor_auth_id,
    p_arguments ->> 'quote_pattern',
    (p_arguments ->> 'quote_next_number')::bigint,
    p_arguments -> 'booking_patterns',
    p_arguments ->> 'customer_pattern',
    (p_arguments ->> 'customer_next_number')::bigint
  );
end;
$$;

revoke all on function public.multideck_dexter_action_update_reference_settings(uuid, uuid, jsonb) from public, anon, authenticated;

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name",
  "AIDexterAction_Description", "AIDexterAction_Function", "AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder", "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON", "AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy", "AIDexterAction_HasExternalEffect"
) values (
  'update_reference_settings', 'reference_settings', 'Update reference rules',
  'Update the complete administrator-reviewed quote, booking and customer reference rules. Every rule must keep one continuous number; changing a next number requires explicit review.',
  'multideck_dexter_action_update_reference_settings',
  '{"type":"object","properties":{"quote_pattern":{"type":"string"},"quote_next_number":{"type":"integer","minimum":1},"booking_patterns":{"type":"array","minItems":1,"maxItems":20,"items":{"type":"object","properties":{"key":{"type":"string"},"label":{"type":"string"},"pattern":{"type":"string"},"nextNumber":{"type":"integer","minimum":1},"enabled":{"type":"boolean"}},"required":["key","label","pattern","nextNumber","enabled"],"additionalProperties":false}},"customer_pattern":{"type":"string"},"customer_next_number":{"type":"integer","minimum":1},"reason":{"type":"string"}},"required":["quote_pattern","quote_next_number","booking_patterns","customer_pattern","customer_next_number","reason"],"additionalProperties":false}'::jsonb,
  195, true, now(), '["AgentDexter.Manage"]'::jsonb, 'reference_settings', 'canonical', false
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = true,
  "AIDexterAction_UpdatedAt" = now(),
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy" = excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect";

revoke all on function quote_api.render_reference_pattern(text, bigint, uuid) from public, anon, authenticated;
revoke all on function quote_api.reserve_reference(uuid, text, text, text, bigint) from public, anon, authenticated;
revoke all on function quote_api.allocate_customer_reference(uuid) from public, anon, authenticated;
revoke all on function public.quote_workflow_get_reference_settings(uuid) from public, anon, authenticated;
revoke all on function public.quote_workflow_save_reference_settings(uuid, text, bigint, jsonb, text, bigint) from public, anon, authenticated;
revoke all on function public.multideck_crm_create_account(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._multideck_crm_create_account_pre_reference_rules_20260820(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.quote_workflow_get_reference_settings(uuid) to service_role;
grant execute on function public.quote_workflow_save_reference_settings(uuid, text, bigint, jsonb, text, bigint) to service_role;
grant execute on function public.multideck_crm_create_account(uuid, jsonb) to service_role;
grant execute on function public.multideck_dexter_domain_reference_settings(uuid, text, integer) to service_role;
grant execute on function public.multideck_dexter_action_update_reference_settings(uuid, uuid, jsonb) to service_role;

commit;
