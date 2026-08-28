-- Make the existing directional booking recipe executable end to end.
-- J{DIRECTION:1}{NUMBER:7} keeps one numeric counter while rendering I/E
-- from the accepted quote direction.

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
  from regexp_matches(cleaned, '\{(?:NUMBER|LETTERS|COMPANY|MULTIDECK|DIRECTION):([0-9]{1,2})\}', 'g') width_match
  where width_match[1]::integer not between 1 and 18
  limit 1;
  if invalid_width is not null then
    raise exception 'Reference rule lengths must be between 1 and 18 characters.' using errcode = '22023';
  end if;

  literal_text := regexp_replace(
    cleaned,
    '\{(?:NUMBER|LETTERS|COMPANY|MULTIDECK|DIRECTION)(?::[0-9]{1,2})?\}',
    '',
    'g'
  );
  if literal_text ~ '[^A-Z0-9 _./-]' or literal_text ~ '[{}]' then
    raise exception 'Use letters, numbers, spaces, hyphens, underscores, slashes, full stops and the supported rule parts.' using errcode = '22023';
  end if;
  return cleaned;
end;
$$;

-- Keep an already-created legacy default sequence usable when the new recipe
-- has not yet been saved through System Preferences. Custom patterns remain
-- untouched; this only upgrades the original built-in B- sequence.
update quote_api.booking_reference_sequences
set pattern = 'J{DIRECTION:1}{NUMBER:7}', updated_at = now()
where sequence_key = 'default'
  and pattern in ('B-{NUMBER}', 'B-{NUMBER:4}');

create or replace function quote_api.render_reference_pattern(
  pattern text,
  reference_number bigint,
  workspace_company_id uuid,
  direction_value text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, quote_api
as $$
declare
  rendered text := quote_api.clean_reference_pattern(pattern, 'Q-{NUMBER:4}');
  company_seed text;
  token_match text[];
  token_width integer;
  replacement text;
  alphabetic_value bigint;
  alphabetic_result text;
  normalized_direction text := lower(replace(replace(btrim(coalesce(direction_value, '')), '-', '_'), ' ', '_'));
  direction_code text;
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

  if rendered ~ '\{DIRECTION(?::[0-9]{1,2})?\}' then
    direction_code := case normalized_direction
      when 'import' then 'I'
      when 'export' then 'E'
      when 'domestic' then 'D'
      when 'cross_trade' then 'C'
      else null
    end;
    if direction_code is null then
      raise exception 'A valid direction is required for a directional reference rule.' using errcode = '22023';
    end if;
    loop
      select regexp_match(rendered, '\{DIRECTION(?::([0-9]{1,2}))?\}') into token_match;
      exit when token_match is null;
      token_width := nullif(token_match[1], '')::integer;
      replacement := case when token_width is null then direction_code else left(direction_code, token_width) end;
      rendered := regexp_replace(rendered, '\{DIRECTION(?::[0-9]{1,2})?\}', replacement);
    end loop;
  end if;

  select regexp_match(rendered, '\{(NUMBER|LETTERS)(?::([0-9]{1,2}))?\}') into token_match;
  token_width := nullif(token_match[2], '')::integer;
  if token_match[1] = 'NUMBER' then
    replacement := case
      when token_width is null then reference_number::text
      else lpad(reference_number::text, greatest(token_width, length(reference_number::text)), '0')
    end;
  else
    alphabetic_value := reference_number - 1;
    alphabetic_result := '';
    loop
      alphabetic_result := chr(65 + (alphabetic_value % 26)::integer) || alphabetic_result;
      alphabetic_value := alphabetic_value / 26;
      exit when alphabetic_value = 0;
    end loop;
    replacement := case
      when token_width is null then alphabetic_result
      else lpad(alphabetic_result, greatest(token_width, length(alphabetic_result)), 'A')
    end;
  end if;
  return regexp_replace(rendered, '\{(?:NUMBER|LETTERS)(?::[0-9]{1,2})?\}', replacement);
end;
$$;

create or replace function quote_api.render_reference_pattern(
  pattern text,
  reference_number bigint,
  workspace_company_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, quote_api
as $$
  select quote_api.render_reference_pattern(pattern, reference_number, workspace_company_id, null);
$$;

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
  loop
    select regexp_match(rendered, '\{DIRECTION(?::([0-9]{1,2}))?\}') into token_match;
    exit when token_match is null;
    token_width := nullif(token_match[1], '')::integer;
    replacement := repeat('_', coalesce(token_width, 1));
    rendered := regexp_replace(rendered, '\{DIRECTION(?::[0-9]{1,2})?\}', replacement);
  end loop;
  return rendered;
end;
$$;

create or replace function quote_api.reserve_reference(
  workspace_company_id uuid,
  reference_kind_value text,
  sequence_key_value text,
  pattern_value text,
  starting_number bigint,
  direction_value text
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
    candidate_reference := quote_api.render_reference_pattern(pattern_value, candidate_number, workspace_company_id, direction_value);
    if length(candidate_reference) > 120 then
      raise exception 'The generated reference is too long.' using errcode = '22023';
    end if;
    if reference_kind_value = 'customer' and length(candidate_reference) > 8 then
      raise exception 'Customer references must stay within the eight-character account-code limit.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from public."CusQuote_Header" quote
      left join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
      where coalesce(office."Company_ID", quote."Org_ID") = workspace_company_id
        and upper(btrim(quote."CusQuoteHeader_CustomerReference")) = upper(btrim(candidate_reference))
        and not quote."CusQuoteHeader_IsDeleted"
      union all
      select 1
      from public."Job_Header" job
      join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
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

create or replace function quote_api.reserve_reference(
  workspace_company_id uuid,
  reference_kind_value text,
  sequence_key_value text,
  pattern_value text,
  starting_number bigint
)
returns table(reference_value text, next_number bigint)
language sql
security definer
set search_path = pg_catalog, public, quote_api
as $$
  select * from quote_api.reserve_reference(
    workspace_company_id, reference_kind_value, sequence_key_value, pattern_value, starting_number, null
  );
$$;

create or replace function booking_api.allocate_reference(
  workspace_company_id uuid,
  requested_sequence_key text,
  requested_direction text
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
    workspace_company_id, 'booking', sequence_key_value,
    sequence_row.pattern, sequence_row.next_number, requested_direction
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

create or replace function booking_api.allocate_reference(
  workspace_company_id uuid,
  requested_sequence_key text default 'default'
)
returns text
language sql
security definer
set search_path = pg_catalog, public, quote_api, booking_api
as $$
  select booking_api.allocate_reference(workspace_company_id, requested_sequence_key, null);
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
    quote_api.render_reference_pattern(sequence.pattern, job."Job_BookingReferenceSequenceValue", workspace_company_id, job."Job_Direction")
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
  on conflict (company_id, normalized_alias) do update set canonical_reference = excluded.canonical_reference
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

create or replace function booking_api.convert_accepted_quote(
  requested_quote_id uuid,
  requested_actor_user_id uuid default null,
  requested_response_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote_row record;
  version_row record;
  actor_user_id uuid;
  company_id uuid;
  office_id uuid;
  customer_id uuid;
  job_status text;
  booking_reference text;
  job_id uuid;
  payload jsonb;
  facts jsonb;
  party jsonb;
  charge jsonb;
  charge_number integer := 0;
  mode_code text;
  direction_code text;
  existing_job record;
begin
  select job.* into existing_job
  from public."Job_Header" job
  where job."Job_SourceQuoteID" = requested_quote_id and not job."Job_IsDeleted"
  limit 1;
  if found then
    if requested_response_id is not null and existing_job."Job_SourceQuoteResponseID" is null then
      update public."Job_Header"
      set "Job_SourceQuoteResponseID" = requested_response_id, "Job_UpdatedAt" = now()
      where "Job_ID" = existing_job."Job_ID";
    end if;
    return jsonb_build_object(
      'jobId', existing_job."Job_ID", 'bookingReference', existing_job."Job_BookingReference",
      'status', existing_job."Job_Status", 'requiresCustomerLink', existing_job."Job_Customer" is null, 'reused', true
    );
  end if;

  select quote.* into quote_row
  from public."CusQuote_Header" quote
  where quote."CusQuoteHeader_ID" = requested_quote_id
    and quote."CusQuoteHeader_LifecycleCode" = 'accepted'
    and not quote."CusQuoteHeader_IsDeleted"
  for update;
  if not found then raise exception 'Only an accepted quote can create a booking.' using errcode = '22023'; end if;

  select version.* into version_row
  from public."CusQuote_Versions" version
  where version."CusQuoteVersion_ID" = coalesce(
    quote_row."CusQuoteHeader_AcceptedVersionID",
    (select current_version."CusQuoteVersion_ID" from public."CusQuote_Versions" current_version
     where current_version."CusQuoteHeader_ID" = requested_quote_id and current_version."CusQuoteVersion_IsCurrent" limit 1)
  );
  if not found then raise exception 'The accepted quote version is unavailable.' using errcode = 'P0002'; end if;

  payload := coalesce(version_row."CusQuoteVersion_SnapshotJSON"->'quote', '{}'::jsonb);
  facts := coalesce(payload->'shipmentFacts', '{}'::jsonb);
  office_id := coalesce(nullif(payload->>'officeId', '')::uuid, quote_row."CusQuoteHeader_OrgOfficeID", quote_row."OrgOffice_ID");
  select office."Company_ID" into company_id from public."cmp_Offices" office where office."Office_ID" = office_id;
  if company_id is null then raise exception 'The accepted quote office is unavailable.' using errcode = 'P0002'; end if;

  actor_user_id := coalesce(requested_actor_user_id, quote_row."CusQuoteHeader_SalesOwnerID", quote_row."CusQuoteHeader_LastEditedBy", quote_row."CusQuoteHeader_CreatedBy");
  if not exists (select 1 from public."cmp_Users" app_user where app_user."User_ID" = actor_user_id and app_user."Company_ID" = company_id) then
    select app_user."User_ID" into actor_user_id from public."cmp_Users" app_user
    where app_user."Company_ID" = company_id and app_user."User_AccessStatus" = 'active'
    order by app_user."User_ID" limit 1;
  end if;
  if actor_user_id is null then raise exception 'No active operator can own the accepted booking.' using errcode = 'P0002'; end if;

  direction_code := booking_api.normalise_direction(coalesce(
    nullif(payload->>'direction', ''), nullif(facts->>'direction', ''),
    quote_row."CusQuoteHeader_Direction", nullif(facts->>'quoteType', '')
  ));
  mode_code := booking_api.normalise_mode(coalesce(nullif(payload->>'mode', ''), quote_row."CusQuoteHeader_ModeCode"));
  customer_id := coalesce(nullif(payload->>'customerId', '')::uuid, quote_row."CusQuoteHeader_CustomerID");
  job_status := case when customer_id is null then 'draft' else 'open' end;
  booking_reference := booking_api.allocate_reference(company_id, 'default', direction_code);

  insert into public."Job_Header" (
    "Job_Period", "Job_CreatedBy", "Job_Customer", "Job_Carrier", "Job_Supplier",
    "Job_OfficeID", "Job_OrgOfficeID", "Job_Status", "Job_Direction", "Job_TransportModeSummary",
    "Job_OriginNameSnapshot", "Job_DestinationNameSnapshot", "Job_ReadyDate", "Job_RequiredDeliveryDate",
    "Job_TrackingStatus", "Job_CurrentLocationNameSnapshot", "Job_InternalNotes", "Job_UpdatedBy",
    "Job_BookingReference", "Job_BookingReferenceSequenceKey", "Job_SourceQuoteID", "Job_SourceQuoteVersionID", "Job_SourceQuoteResponseID",
    "Job_IncotermsCode", "Job_IncotermsLocation", "Job_CollectionAddress", "Job_DeliveryAddress",
    "Job_CustomerDeadline", "Job_SourceSnapshotJSON"
  ) values (
    to_char(current_date, 'YYYYMM'), actor_user_id, customer_id,
    coalesce(nullif(payload->>'carrierId', '')::uuid, quote_row."CusQuoteHeader_CarrierID"),
    coalesce(nullif(payload->>'supplierId', '')::uuid, quote_row."CusQuoteHeader_SupplierID"),
    office_id, office_id, job_status, direction_code, mode_code,
    coalesce(nullif(payload->>'loadingPoint', ''), quote_row."CusQuoteHeader_LoadingPoint"),
    coalesce(nullif(payload->>'dischargePoint', ''), quote_row."CusQuoteHeader_DischargePoint"),
    nullif(payload->>'validFrom', '')::date, nullif(payload->>'deadline', '')::date,
    'planning', 'Planning', nullif(payload->>'internalNotes', ''), actor_user_id,
    booking_reference, 'default', requested_quote_id, version_row."CusQuoteVersion_ID", requested_response_id,
    upper(nullif(payload->>'incoterm', '')), nullif(facts->>'namedPlace', ''),
    nullif(payload->>'collectionAddress', ''), nullif(payload->>'deliveryAddress', ''),
    nullif(payload->>'deadline', '')::date,
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'accepted_quote', 'quoteId', requested_quote_id, 'quoteVersionId', version_row."CusQuoteVersion_ID",
      'quoteReference', coalesce(quote_row."CusQuoteHeader_CustomerReference", 'Q-' || quote_row."CusQuoteHeader_Number"),
      'customerName', coalesce(nullif(payload->>'customerName', ''), quote_row."CusQuoteHeader_CustomerNameSnapshot"),
      'contactName', coalesce(nullif(payload->>'contactName', ''), quote_row."CusQuoteHeader_ContactNameSnapshot"),
      'contactEmail', coalesce(nullif(payload->>'contactEmail', ''), quote_row."CusQuoteHeader_ContactEmailSnapshot"),
      'direction', direction_code, 'requiresCustomerLink', customer_id is null,
      'acceptedSnapshot', version_row."CusQuoteVersion_SnapshotJSON"
    ))
  ) returning "Job_ID" into job_id;

  party := payload->'shipper';
  if quote_api.jsonb_has_content(party) then
    insert into public."Job_Parties" (
      "JobParty_JobID", "JobParty_Role", "JobParty_OrgID", "JobParty_Sequence", "JobParty_NameSnapshot",
      "JobParty_AddressSnapshot", "JobParty_ContactNameSnapshot", "JobParty_IsPrimary", "JobParty_RawSnapshot", "JobParty_CreatedBy"
    ) values (job_id, 'shipper', nullif(party->>'orgId', '')::uuid, 1, left(nullif(btrim(party->>'name'), ''), 240),
      nullif(btrim(party->>'address'), ''), left(nullif(btrim(party->>'contact'), ''), 180), true, party, actor_user_id);
  end if;
  party := payload->'consignee';
  if quote_api.jsonb_has_content(party) then
    insert into public."Job_Parties" (
      "JobParty_JobID", "JobParty_Role", "JobParty_OrgID", "JobParty_Sequence", "JobParty_NameSnapshot",
      "JobParty_AddressSnapshot", "JobParty_ContactNameSnapshot", "JobParty_IsPrimary", "JobParty_RawSnapshot", "JobParty_CreatedBy"
    ) values (job_id, 'consignee', nullif(party->>'orgId', '')::uuid, 1, left(nullif(btrim(party->>'name'), ''), 240),
      nullif(btrim(party->>'address'), ''), left(nullif(btrim(party->>'contact'), ''), 180), true, party, actor_user_id);
  end if;

  insert into public."Job_Routing" (
    "Job_ID", "JobRoute_OrderNo", "JobRoute_Status", "JobRoute_ModeCode", "JobRoute_OriginNameSnapshot",
    "JobRoute_OriginAddressSnapshot", "JobRoute_DestinationNameSnapshot", "JobRoute_DestinationAddressSnapshot",
    "JobRoute_Carrier", "JobRoute_ServiceLevel", "JobRoute_IsMainCarriage", "JobRoute_RouteJSON", "JobRoute_UpdatedBy"
  ) values (
    job_id, 1, 'planned', mode_code, coalesce(nullif(payload->>'loadingPoint', ''), quote_row."CusQuoteHeader_LoadingPoint"),
    nullif(payload->>'collectionAddress', ''), coalesce(nullif(payload->>'dischargePoint', ''), quote_row."CusQuoteHeader_DischargePoint"),
    nullif(payload->>'deliveryAddress', ''), coalesce(nullif(payload->>'carrierId', '')::uuid, quote_row."CusQuoteHeader_CarrierID"),
    nullif(payload->>'serviceLevel', ''), true, jsonb_build_object('source', 'accepted_quote', 'shipmentFacts', facts), actor_user_id
  );

  if nullif(btrim(coalesce(facts->>'knownCargo', facts->>'commodity')), '') is not null then
    insert into public."Job_Cargo" (
      "JobCargo_JobID", "JobCargo_LineNo", "JobCargo_Description", "JobCargo_Qty", "JobCargo_PackageTypeCodeSnapshot",
      "JobCargo_PackageQty", "JobCargo_GrossKilos", "JobCargo_NettKilos", "JobCargo_HSCode", "JobCargo_VolumeCBM",
      "JobCargo_DeclaredValueAmount", "JobCargo_DeclaredValueCurrencyCodeSnapshot", "JobCargo_CargoJSON", "JobCargo_UpdatedBy"
    ) values (
      job_id, 1, coalesce(facts->>'knownCargo', facts->>'commodity'), nullif(coalesce(facts->>'pieces', facts->>'packageQuantity'), '')::numeric,
      left(nullif(facts->>'packageType', ''), 40), nullif(coalesce(facts->>'packageQuantity', facts->>'pieces'), '')::numeric,
      nullif(facts->>'grossWeightKg', '')::numeric, nullif(facts->>'netWeightKg', '')::numeric, left(nullif(facts->>'hsCode', ''), 30),
      nullif(facts->>'volumeCbm', '')::numeric, nullif(regexp_replace(coalesce(facts->>'goodsValue', ''), '[^0-9.-]', '', 'g'), '')::numeric,
      coalesce(nullif(upper(facts->>'goodsValueCurrency'), ''), nullif(upper(payload->>'currency'), '')), facts, actor_user_id
    );
  end if;

  if nullif(btrim(facts->>'container'), '') is not null then
    insert into public."Job_Containers" (
      "Job_ID", "JobContainer_TypeCodeSnapshot", "JobContainer_EquipmentKind", "JobContainer_Status", "JobContainer_JSON", "JobContainer_UpdatedBy"
    ) values (
      job_id, left(facts->>'container', 40), case when lower(coalesce(payload->>'mode', '')) in ('air','courier') then 'unit_load_device' else 'container' end,
      'planned', jsonb_build_object('description', facts->>'container', 'source', 'accepted_quote'), actor_user_id
    );
  end if;

  for charge in select value from jsonb_array_elements(coalesce(payload->'charges', '[]'::jsonb)) loop
    charge_number := charge_number + 1;
    insert into public."Job_Costing_Lines" (
      "Job_ID", "JobCostingLine_Number", "JobCostingLine_SupplierID", "JobCostingLine_Description", "JobCostingLine_InternalNotes",
      "JobCostingLine_CustomerNotes", "JobCostingLine_CostROE", "JobCostingLine_CostAmountCurrency", "JobCostingLine_CostAmountLocal",
      "JobCostingLine_RevenueROE", "JobCostingLine_RevenueAmountCurrency", "JobCostingLine_RevenueAmountLocal",
      "JobCostingLine_ShowToCustomer", "JobCostingLine_CreatedBy", "JobCostingLine_UpdatedBy"
    ) values (
      job_id, charge_number, nullif(charge->>'supplierId', '')::uuid, left(coalesce(nullif(btrim(charge->>'description'), ''), 'Charge'), 240),
      nullif(charge->>'internalNotes', ''), nullif(charge->>'customerNotes', ''), greatest(coalesce(nullif(charge->>'costRoe', '')::numeric, 1), 0.00001),
      coalesce(nullif(charge->>'costAmount', '')::numeric, 0), coalesce(nullif(charge->>'costLocal', '')::numeric, 0),
      greatest(coalesce(nullif(charge->>'sellRoe', '')::numeric, 1), 0.00001), coalesce(nullif(charge->>'sellAmount', '')::numeric, 0),
      coalesce(nullif(charge->>'sellLocal', '')::numeric, 0), coalesce((charge->>'showToCustomer')::boolean, true), actor_user_id, actor_user_id
    );
  end loop;

  update public."CusQuote_Header" set "CusQuoteHeader_JobID" = job_id, "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = requested_quote_id;
  insert into booking_api.events (company_id, job_id, event_type, summary, metadata, actor_user_id)
  values (company_id, job_id, 'created_from_quote', case when customer_id is null then 'Draft booking created from accepted one-off quote; link a customer before progressing.' else 'Booking created from accepted quote.' end,
    jsonb_build_object('quoteId', requested_quote_id, 'quoteVersionId', version_row."CusQuoteVersion_ID", 'status', job_status, 'direction', direction_code, 'requiresCustomerLink', customer_id is null), actor_user_id);

  return jsonb_build_object('jobId', job_id, 'bookingReference', booking_reference, 'status', job_status, 'requiresCustomerLink', customer_id is null, 'reused', false);
exception
  when unique_violation then
    select job.* into existing_job from public."Job_Header" job where job."Job_SourceQuoteID" = requested_quote_id and not job."Job_IsDeleted" limit 1;
    if found then
      return jsonb_build_object('jobId', existing_job."Job_ID", 'bookingReference', existing_job."Job_BookingReference", 'status', existing_job."Job_Status", 'requiresCustomerLink', existing_job."Job_Customer" is null, 'reused', true);
    end if;
    raise;
end;
$$;

revoke all on function quote_api.render_reference_pattern(text, bigint, uuid, text) from public, anon, authenticated;
revoke all on function quote_api.reserve_reference(uuid, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function booking_api.allocate_reference(uuid, text, text) from public, anon, authenticated;
grant execute on function booking_api.convert_accepted_quote(uuid, uuid, uuid) to service_role;

commit;
