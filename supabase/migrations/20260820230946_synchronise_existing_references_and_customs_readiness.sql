-- Keep every visible reference aligned with the administrator's active rule.
-- Previous booking and quote references remain resolvable through scoped aliases.

begin;

alter table public."CusQuote_Header"
  add column if not exists "CusQuoteHeader_ReferenceSequenceValue" bigint;
alter table public."Job_Header"
  add column if not exists "Job_BookingReferenceSequenceKey" varchar(40) not null default 'default',
  add column if not exists "Job_BookingReferenceSequenceValue" bigint;
alter table public."CRM_AccountProfiles"
  add column if not exists "CRMAccount_ReferenceSequenceValue" bigint;

create table if not exists quote_api.reference_aliases (
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  normalized_alias varchar(120) not null,
  alias_value varchar(120) not null,
  reference_kind varchar(40) not null,
  source_id uuid not null,
  canonical_reference varchar(120) not null,
  created_at timestamptz not null default now(),
  primary key (company_id, normalized_alias),
  constraint "CK_reference_aliases_kind" check (reference_kind in ('quote', 'booking', 'customer')),
  constraint "CK_reference_aliases_normalized" check (
    btrim(alias_value) <> '' and normalized_alias = upper(btrim(alias_value))
  )
);
create index if not exists reference_aliases_source_idx
  on quote_api.reference_aliases (company_id, reference_kind, source_id);
revoke all on table quote_api.reference_aliases from public, anon, authenticated;
grant select on table quote_api.reference_aliases to service_role;

create or replace function quote_api.reference_literal(
  fragment text,
  workspace_company_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  rendered text := upper(coalesce(fragment, ''));
  company_seed text;
  token_match text[];
  token_width integer;
  replacement text;
begin
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
  return rendered;
end;
$$;

create or replace function quote_api.extract_reference_sequence(
  pattern text,
  reference_value text,
  workspace_company_id uuid
)
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, quote_api
as $$
declare
  cleaned_pattern text := quote_api.clean_reference_pattern(pattern, 'Q-{NUMBER:4}');
  token text;
  token_position integer;
  counter_kind text;
  prefix_value text;
  suffix_value text;
  normalized_reference text := upper(btrim(coalesce(reference_value, '')));
  counter_value text;
  result_value bigint := 0;
  character_value text;
begin
  token := substring(cleaned_pattern from '\{(?:NUMBER|LETTERS)(?::[0-9]{1,2})?\}');
  token_position := position(token in cleaned_pattern);
  counter_kind := case when token like '{LETTERS%' then 'LETTERS' else 'NUMBER' end;
  prefix_value := quote_api.reference_literal(left(cleaned_pattern, token_position - 1), workspace_company_id);
  suffix_value := quote_api.reference_literal(substr(cleaned_pattern, token_position + length(token)), workspace_company_id);
  if normalized_reference = ''
     or normalized_reference not like prefix_value || '%'
     or (suffix_value <> '' and right(normalized_reference, length(suffix_value)) <> suffix_value)
     or length(normalized_reference) < length(prefix_value) + length(suffix_value) + 1 then
    return null;
  end if;
  counter_value := substr(
    normalized_reference,
    length(prefix_value) + 1,
    length(normalized_reference) - length(prefix_value) - length(suffix_value)
  );
  if counter_kind = 'NUMBER' then
    if counter_value !~ '^[0-9]+$' then return null; end if;
    return counter_value::bigint;
  end if;
  if counter_value !~ '^[A-Z]+$' then return null; end if;
  foreach character_value in array regexp_split_to_array(counter_value, '') loop
    result_value := result_value * 26 + ascii(character_value) - 64;
  end loop;
  -- The renderer treats the left padding A characters as zero-value padding.
  return result_value - ((power(26::numeric, length(counter_value)) - 1) / 25)::bigint + 1;
end;
$$;

create or replace function quote_api.capture_quote_reference_sequence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare
  workspace_company_id uuid := new."Org_ID";
  pattern_value text;
begin
  if workspace_company_id is null then
    select office."Company_ID" into workspace_company_id
    from public."cmp_Offices" office
    where office."Office_ID" = coalesce(new."CusQuoteHeader_OrgOfficeID", new."OrgOffice_ID");
  end if;
  select settings.quote_pattern into pattern_value
  from quote_api.reference_settings settings where settings.company_id = workspace_company_id;
  new."CusQuoteHeader_ReferenceSequenceValue" := coalesce(
    new."CusQuoteHeader_ReferenceSequenceValue",
    quote_api.extract_reference_sequence(coalesce(pattern_value, 'Q-{NUMBER:4}'), new."CusQuoteHeader_CustomerReference", workspace_company_id),
    new."CusQuoteHeader_Number"
  );
  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_Header_capture_reference_sequence" on public."CusQuote_Header";
create trigger "TR_CusQuote_Header_capture_reference_sequence"
before insert or update of "CusQuoteHeader_CustomerReference"
on public."CusQuote_Header" for each row
execute function quote_api.capture_quote_reference_sequence();

create or replace function quote_api.capture_booking_reference_sequence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare
  workspace_company_id uuid;
  sequence_row record;
  extracted_value bigint;
begin
  select office."Company_ID" into workspace_company_id
  from public."cmp_Offices" office
  where office."Office_ID" = coalesce(new."Job_OrgOfficeID", new."Job_OfficeID");
  if new."Job_BookingReferenceSequenceValue" is null then
    for sequence_row in
      select sequence.sequence_key, sequence.pattern
      from quote_api.booking_reference_sequences sequence
      where sequence.company_id = workspace_company_id and sequence.enabled
      order by case when sequence.sequence_key = 'default' then 0 else 1 end, sequence.sequence_key
    loop
      extracted_value := quote_api.extract_reference_sequence(sequence_row.pattern, new."Job_BookingReference", workspace_company_id);
      if extracted_value is not null and extracted_value > 0 then
        new."Job_BookingReferenceSequenceKey" := sequence_row.sequence_key;
        new."Job_BookingReferenceSequenceValue" := extracted_value;
        exit;
      end if;
    end loop;
  end if;
  new."Job_BookingReferenceSequenceKey" := coalesce(nullif(new."Job_BookingReferenceSequenceKey", ''), 'default');
  new."Job_BookingReferenceSequenceValue" := coalesce(new."Job_BookingReferenceSequenceValue", new."Job_Number");
  return new;
end;
$$;

drop trigger if exists "TR_Job_Header_capture_booking_reference_sequence" on public."Job_Header";
create trigger "TR_Job_Header_capture_booking_reference_sequence"
before insert or update of "Job_BookingReference"
on public."Job_Header" for each row
execute function quote_api.capture_booking_reference_sequence();

create or replace function quote_api.capture_customer_reference_sequence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare
  profile_row record;
  pattern_value text;
  sequence_value bigint;
begin
  for profile_row in
    select profile."CRMAccount_ID", profile."CRMAccount_CompanyID"
    from public."CRM_AccountProfiles" profile
    where profile."CRMAccount_OrgID" = new."Org_id" and not profile."CRMAccount_IsDeleted"
  loop
    select settings.customer_pattern into pattern_value
    from quote_api.reference_settings settings where settings.company_id = profile_row."CRMAccount_CompanyID";
    sequence_value := quote_api.extract_reference_sequence(
      coalesce(pattern_value, 'CUS{NUMBER:4}'), new."Org_AccCode", profile_row."CRMAccount_CompanyID"
    );
    if sequence_value is not null and sequence_value > 0 then
      update public."CRM_AccountProfiles"
      set "CRMAccount_ReferenceSequenceValue" = sequence_value,
          "CRMAccount_UpdatedAt" = now()
      where "CRMAccount_ID" = profile_row."CRMAccount_ID";
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists "TR_Org_Master_capture_customer_reference_sequence" on public."Org_Master";
create trigger "TR_Org_Master_capture_customer_reference_sequence"
after insert or update
on public."Org_Master" for each row
execute function quote_api.capture_customer_reference_sequence();

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
    select "Company_ID" into workspace_company_id from public."cmp_Offices"
    where "Office_ID" = coalesce(new."CusQuoteHeader_OrgOfficeID", new."OrgOffice_ID");
  end if;
  if tg_op = 'INSERT' and nullif(btrim(new."CusQuoteHeader_CustomerReference"), '') is null then
    if new."CusQuoteHeader_Number" is null then new."CusQuoteHeader_Number" := nextval('quote_api.quote_number_seq'); end if;
    insert into quote_api.reference_settings(company_id, quote_prefix, booking_prefix, quote_pattern, quote_next_number)
    values (workspace_company_id, 'Q', 'B', 'Q-{NUMBER:4}', 1) on conflict (company_id) do nothing;
    select * into settings_row from quote_api.reference_settings where company_id = workspace_company_id for update;
    select * into allocated from quote_api.reserve_reference(workspace_company_id, 'quote', 'default', settings_row.quote_pattern, settings_row.quote_next_number);
    update quote_api.reference_settings set quote_next_number = allocated.next_number, updated_at = now() where company_id = workspace_company_id;
    new."CusQuoteHeader_CustomerReference" := allocated.reference_value;
    new."CusQuoteHeader_ReferenceSequenceValue" := allocated.next_number - 1;
  elsif tg_op = 'UPDATE' and old."CusQuoteHeader_CustomerReference" is null
    and nullif(btrim(new."CusQuoteHeader_CustomerReference"), '') is null then
    insert into quote_api.reference_settings(company_id, quote_prefix, booking_prefix, quote_pattern, quote_next_number)
    values (workspace_company_id, 'Q', 'B', 'Q-{NUMBER:4}', 1) on conflict (company_id) do nothing;
    select * into settings_row from quote_api.reference_settings where company_id = workspace_company_id for update;
    select * into allocated from quote_api.reserve_reference(workspace_company_id, 'quote', 'default', settings_row.quote_pattern, settings_row.quote_next_number);
    update quote_api.reference_settings set quote_next_number = allocated.next_number, updated_at = now() where company_id = workspace_company_id;
    new."CusQuoteHeader_CustomerReference" := allocated.reference_value;
    new."CusQuoteHeader_ReferenceSequenceValue" := allocated.next_number - 1;
  elsif tg_op = 'UPDATE' and old."CusQuoteHeader_CustomerReference" is not null
    and new."CusQuoteHeader_CustomerReference" is distinct from old."CusQuoteHeader_CustomerReference"
    and coalesce(current_setting('multideck.reference_sync', true), '') <> 'on' then
    new."CusQuoteHeader_CustomerReference" := old."CusQuoteHeader_CustomerReference";
  end if;
  return new;
end;
$$;

create or replace function quote_api.synchronise_company_references(workspace_company_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare
  duplicate_reference text;
  too_long_reference text;
  settings_row quote_api.reference_settings%rowtype;
begin
  if workspace_company_id is null then raise exception 'A workspace company is required.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(workspace_company_id::text || ':reference-sync', 0));
  select * into strict settings_row from quote_api.reference_settings where company_id = workspace_company_id for update;

  update public."Job_Header" job
  set "Job_BookingReferenceSequenceKey" = 'default'
  from public."cmp_Offices" office
  where office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    and office."Company_ID" = workspace_company_id
    and not job."Job_IsDeleted"
    and not exists (
      select 1 from quote_api.booking_reference_sequences sequence
      where sequence.company_id = workspace_company_id
        and sequence.sequence_key = job."Job_BookingReferenceSequenceKey"
        and sequence.enabled
    );

  create temp table if not exists pg_temp.multideck_reference_sync_plan (
    reference_kind text not null,
    source_id uuid not null,
    old_reference text,
    new_reference text not null,
    primary key (reference_kind, source_id)
  ) on commit drop;
  truncate pg_temp.multideck_reference_sync_plan;

  insert into pg_temp.multideck_reference_sync_plan
  select 'quote', quote."CusQuoteHeader_ID", quote."CusQuoteHeader_CustomerReference",
    quote_api.render_reference_pattern(settings_row.quote_pattern, quote."CusQuoteHeader_ReferenceSequenceValue", workspace_company_id)
  from public."CusQuote_Header" quote
  left join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  where coalesce(office."Company_ID", quote."Org_ID") = workspace_company_id and not quote."CusQuoteHeader_IsDeleted";

  insert into pg_temp.multideck_reference_sync_plan
  select 'booking', job."Job_ID", job."Job_BookingReference",
    quote_api.render_reference_pattern(sequence.pattern, job."Job_BookingReferenceSequenceValue", workspace_company_id)
  from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  join quote_api.booking_reference_sequences sequence
    on sequence.company_id = workspace_company_id
   and sequence.sequence_key = job."Job_BookingReferenceSequenceKey" and sequence.enabled
  where office."Company_ID" = workspace_company_id and not job."Job_IsDeleted";

  insert into pg_temp.multideck_reference_sync_plan
  select 'customer', organisation."Org_id", organisation."Org_AccCode",
    quote_api.render_reference_pattern(settings_row.customer_pattern, profile."CRMAccount_ReferenceSequenceValue", workspace_company_id)
  from public."CRM_AccountProfiles" profile
  join public."Org_Master" organisation on organisation."Org_id" = profile."CRMAccount_OrgID"
  where profile."CRMAccount_CompanyID" = workspace_company_id and not profile."CRMAccount_IsDeleted";

  select upper(btrim(new_reference)) into duplicate_reference
  from pg_temp.multideck_reference_sync_plan
  group by upper(btrim(new_reference)) having count(*) > 1 limit 1;
  if duplicate_reference is not null then
    raise exception 'The reference rules would create the duplicate reference %.', duplicate_reference using errcode = '23505';
  end if;
  select new_reference into too_long_reference from pg_temp.multideck_reference_sync_plan
  where length(new_reference) > 120 or (reference_kind = 'booking' and length(new_reference) > 80)
     or (reference_kind = 'customer' and length(new_reference) > 8) limit 1;
  if too_long_reference is not null then
    raise exception 'The generated reference % is too long for that record type.', too_long_reference using errcode = '22023';
  end if;
  select new_plan.new_reference into duplicate_reference
  from pg_temp.multideck_reference_sync_plan old_plan
  join pg_temp.multideck_reference_sync_plan new_plan
    on upper(btrim(old_plan.old_reference)) = upper(btrim(new_plan.new_reference))
   and (old_plan.source_id <> new_plan.source_id or old_plan.reference_kind <> new_plan.reference_kind)
  where nullif(btrim(old_plan.old_reference), '') is not null
    and upper(btrim(old_plan.old_reference)) <> upper(btrim(old_plan.new_reference))
  limit 1;
  if duplicate_reference is not null then
    raise exception 'The reference % must remain available as an old link for another record.', duplicate_reference using errcode = '23505';
  end if;
  select plan.new_reference into duplicate_reference
  from pg_temp.multideck_reference_sync_plan plan
  join quote_api.reference_aliases alias
    on alias.company_id = workspace_company_id and alias.normalized_alias = upper(btrim(plan.new_reference))
   and (alias.source_id <> plan.source_id or alias.reference_kind <> plan.reference_kind)
  limit 1;
  if duplicate_reference is not null then
    raise exception 'The reference % is already kept as an old link for another record.', duplicate_reference using errcode = '23505';
  end if;
  select plan.old_reference into duplicate_reference
  from pg_temp.multideck_reference_sync_plan plan
  join quote_api.reference_aliases alias
    on alias.company_id = workspace_company_id and alias.normalized_alias = upper(btrim(plan.old_reference))
   and (alias.source_id <> plan.source_id or alias.reference_kind <> plan.reference_kind)
  where nullif(btrim(plan.old_reference), '') is not null
    and upper(btrim(plan.old_reference)) <> upper(btrim(plan.new_reference))
  limit 1;
  if duplicate_reference is not null then
    raise exception 'The old reference % already belongs to another saved link.', duplicate_reference using errcode = '23505';
  end if;

  insert into quote_api.reference_aliases (
    company_id, normalized_alias, alias_value, reference_kind, source_id, canonical_reference
  )
  select workspace_company_id, upper(btrim(old_reference)), btrim(old_reference), reference_kind, source_id, new_reference
  from pg_temp.multideck_reference_sync_plan
  where nullif(btrim(old_reference), '') is not null and upper(btrim(old_reference)) <> upper(btrim(new_reference))
  on conflict (company_id, normalized_alias) do update set
    canonical_reference = excluded.canonical_reference
  where quote_api.reference_aliases.reference_kind = excluded.reference_kind
    and quote_api.reference_aliases.source_id = excluded.source_id;

  update quote_api.reference_aliases alias set canonical_reference = plan.new_reference
  from pg_temp.multideck_reference_sync_plan plan
  where alias.company_id = workspace_company_id and alias.reference_kind = plan.reference_kind and alias.source_id = plan.source_id;

  perform set_config('multideck.reference_sync', 'on', true);
  update public."CusQuote_Header" quote
  set "CusQuoteHeader_CustomerReference" = plan.new_reference
  from pg_temp.multideck_reference_sync_plan plan
  where plan.reference_kind = 'quote' and plan.source_id = quote."CusQuoteHeader_ID"
    and quote."CusQuoteHeader_CustomerReference" is distinct from plan.new_reference;
  update public."Job_Header" job
  set "Job_BookingReference" = plan.new_reference, "Job_UpdatedAt" = now()
  from pg_temp.multideck_reference_sync_plan plan
  where plan.reference_kind = 'booking' and plan.source_id = job."Job_ID"
    and job."Job_BookingReference" is distinct from plan.new_reference;
  update public."Org_Master" organisation
  set "Org_AccCode" = plan.new_reference
  from pg_temp.multideck_reference_sync_plan plan
  where plan.reference_kind = 'customer' and plan.source_id = organisation."Org_id"
    and organisation."Org_AccCode" is distinct from plan.new_reference;

  delete from quote_api.reference_reservations where company_id = workspace_company_id;
  insert into quote_api.reference_reservations (company_id, normalized_reference, reference_value, reference_kind, source_id)
  select workspace_company_id, upper(btrim(new_reference)), new_reference, reference_kind, source_id
  from pg_temp.multideck_reference_sync_plan;
  insert into quote_api.reference_reservations (company_id, normalized_reference, reference_value, reference_kind, source_id)
  select alias.company_id, alias.normalized_alias, alias.alias_value, alias.reference_kind, alias.source_id
  from quote_api.reference_aliases alias where alias.company_id = workspace_company_id
  on conflict (company_id, normalized_reference) do nothing;

  update quote_api.reference_settings settings set
    quote_next_number = greatest(settings.quote_next_number, coalesce((select max(quote."CusQuoteHeader_ReferenceSequenceValue") + 1
      from public."CusQuote_Header" quote left join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
      where coalesce(office."Company_ID", quote."Org_ID") = workspace_company_id and not quote."CusQuoteHeader_IsDeleted"), 1)),
    customer_next_number = greatest(settings.customer_next_number, coalesce((select max(profile."CRMAccount_ReferenceSequenceValue") + 1
      from public."CRM_AccountProfiles" profile where profile."CRMAccount_CompanyID" = workspace_company_id and not profile."CRMAccount_IsDeleted"), 1)),
    updated_at = now()
  where settings.company_id = workspace_company_id;
  update quote_api.booking_reference_sequences sequence set
    next_number = greatest(sequence.next_number, coalesce((select max(job."Job_BookingReferenceSequenceValue") + 1
      from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
      where office."Company_ID" = workspace_company_id and not job."Job_IsDeleted"
        and job."Job_BookingReferenceSequenceKey" = sequence.sequence_key), 1)),
    updated_at = now()
  where sequence.company_id = workspace_company_id;
end;
$$;

-- Capture the stable sequence behind every existing record before the first sync.
with scoped_quotes as (
  select quote."CusQuoteHeader_ID", settings.company_id, settings.quote_pattern
  from public."CusQuote_Header" quote
  left join public."cmp_Offices" office
    on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  join quote_api.reference_settings settings
    on settings.company_id = coalesce(office."Company_ID", quote."Org_ID")
)
update public."CusQuote_Header" quote set "CusQuoteHeader_ReferenceSequenceValue" = coalesce(
  quote_api.extract_reference_sequence(scoped.quote_pattern, quote."CusQuoteHeader_CustomerReference", scoped.company_id),
  quote."CusQuoteHeader_Number"
)
from scoped_quotes scoped
where scoped."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
  and quote."CusQuoteHeader_ReferenceSequenceValue" is null;

update public."Job_Header" job set
  "Job_BookingReferenceSequenceKey" = coalesce((
    select sequence.sequence_key from quote_api.booking_reference_sequences sequence
    where sequence.company_id = office."Company_ID" and sequence.enabled
      and quote_api.extract_reference_sequence(sequence.pattern, job."Job_BookingReference", office."Company_ID") is not null
    order by case when sequence.sequence_key = 'default' then 0 else 1 end, sequence.sequence_key limit 1
  ), 'default'),
  "Job_BookingReferenceSequenceValue" = coalesce((
    select quote_api.extract_reference_sequence(sequence.pattern, job."Job_BookingReference", office."Company_ID")
    from quote_api.booking_reference_sequences sequence
    where sequence.company_id = office."Company_ID" and sequence.enabled
      and quote_api.extract_reference_sequence(sequence.pattern, job."Job_BookingReference", office."Company_ID") is not null
    order by case when sequence.sequence_key = 'default' then 0 else 1 end, sequence.sequence_key limit 1
  ), job."Job_Number")
from public."cmp_Offices" office
where office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  and job."Job_BookingReferenceSequenceValue" is null;

with ranked as (
  select profile."CRMAccount_ID",
    row_number() over (partition by profile."CRMAccount_CompanyID" order by profile."CRMAccount_CreatedAt", profile."CRMAccount_ID")::bigint sequence_value
  from public."CRM_AccountProfiles" profile where not profile."CRMAccount_IsDeleted"
)
update public."CRM_AccountProfiles" profile
set "CRMAccount_ReferenceSequenceValue" = ranked.sequence_value
from ranked where ranked."CRMAccount_ID" = profile."CRMAccount_ID"
  and profile."CRMAccount_ReferenceSequenceValue" is null;

do $$
declare company_row record;
begin
  for company_row in select company_id from quote_api.reference_settings loop
    perform quote_api.synchronise_company_references(company_row.company_id);
  end loop;
end;
$$;

do $$
begin
  if to_regprocedure('public._quote_workflow_save_reference_settings_before_sync_20260820(uuid,text,bigint,jsonb,text,bigint)') is null then
    alter function public.quote_workflow_save_reference_settings(uuid, text, bigint, jsonb, text, bigint)
      rename to _quote_workflow_save_reference_settings_before_sync_20260820;
  end if;
end;
$$;

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
  ignored_result jsonb;
begin
  ignored_result := public._quote_workflow_save_reference_settings_before_sync_20260820(
    caller_auth_user_id, quote_pattern, quote_next_number, booking_patterns, customer_pattern, customer_next_number
  );
  select app_user."Company_ID" into strict company_id_value
  from public."cmp_Users" app_user
  where app_user."Auth_User_ID" = caller_auth_user_id and app_user."User_AccessStatus" = 'active';
  perform quote_api.synchronise_company_references(company_id_value);
  return public.quote_workflow_get_reference_settings(caller_auth_user_id);
end;
$$;

create or replace function public.booking_workflow_customs_readiness(caller_auth_user_id uuid, requested_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, booking_api
as $$
declare
  result_value jsonb := booking_api.customs_readiness(caller_auth_user_id, requested_job_id);
  missing_count integer;
  total_checks integer;
  complete_checks integer;
  incoterm_value text;
begin
  select upper(coalesce(job."Job_IncotermsCode", '')) into incoterm_value
  from public."Job_Header" job where job."Job_ID" = requested_job_id;
  missing_count := jsonb_array_length(coalesce(result_value -> 'missing', '[]'::jsonb));
  total_checks := 15
    + case when result_value ->> 'direction' in ('import', 'export') then 1 else 0 end
    + case when incoterm_value in ('FOB', 'FCA', 'EXW') then 2 else 0 end;
  complete_checks := greatest(total_checks - missing_count, 0);
  return result_value || jsonb_build_object(
    'totalChecks', total_checks,
    'completeChecks', complete_checks,
    'percent', case when total_checks = 0 then 0 else round(complete_checks * 100.0 / total_checks)::integer end
  );
end;
$$;

create or replace function public.resolve_workspace_reference_alias(
  caller_auth_user_id uuid,
  requested_reference_kind text,
  requested_alias text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare
  company_id_value uuid;
  alias_row quote_api.reference_aliases%rowtype;
begin
  if requested_reference_kind not in ('quote', 'booking') or nullif(btrim(requested_alias), '') is null then
    raise exception 'Choose a supported reference alias.' using errcode = '22023';
  end if;
  select app_user."Company_ID" into strict company_id_value
  from public."cmp_Users" app_user
  where app_user."Auth_User_ID" = caller_auth_user_id and app_user."User_AccessStatus" = 'active';
  select alias.* into alias_row from quote_api.reference_aliases alias
  where alias.company_id = company_id_value
    and alias.reference_kind = requested_reference_kind
    and alias.normalized_alias = upper(btrim(requested_alias));
  if not found then return null; end if;
  return jsonb_build_object('sourceId', alias_row.source_id, 'canonicalReference', alias_row.canonical_reference);
exception
  when no_data_found or too_many_rows then
    raise exception 'Your workspace identity is incomplete.' using errcode = '42501';
end;
$$;

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" = 'Administrator-controlled quote, booking and customer reference formats. Existing records and their canonical links update immediately; previous references remain available as scoped aliases.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'reference_settings';
update public."sys_AIDexterActions"
set "AIDexterAction_Description" = 'Update the complete administrator-reviewed quote, booking and customer reference rules and synchronise existing records while preserving old links.',
    "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'update_reference_settings';

revoke all on function quote_api.reference_literal(text, uuid) from public, anon, authenticated;
revoke all on function quote_api.extract_reference_sequence(text, text, uuid) from public, anon, authenticated;
revoke all on function quote_api.capture_quote_reference_sequence() from public, anon, authenticated;
revoke all on function quote_api.capture_booking_reference_sequence() from public, anon, authenticated;
revoke all on function quote_api.capture_customer_reference_sequence() from public, anon, authenticated;
revoke all on function quote_api.synchronise_company_references(uuid) from public, anon, authenticated;
revoke all on function public._quote_workflow_save_reference_settings_before_sync_20260820(uuid, text, bigint, jsonb, text, bigint) from public, anon, authenticated;
revoke all on function public.quote_workflow_save_reference_settings(uuid, text, bigint, jsonb, text, bigint) from public, anon, authenticated;
revoke all on function public.booking_workflow_customs_readiness(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resolve_workspace_reference_alias(uuid, text, text) from public, anon, authenticated;
grant execute on function public.quote_workflow_save_reference_settings(uuid, text, bigint, jsonb, text, bigint) to service_role;
grant execute on function public.booking_workflow_customs_readiness(uuid, uuid) to service_role;
grant execute on function public.resolve_workspace_reference_alias(uuid, text, text) to service_role;

commit;
