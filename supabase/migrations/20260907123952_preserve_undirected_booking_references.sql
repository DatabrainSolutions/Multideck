-- Preserve legacy booking identities when their direction is not yet known.
-- The existing administrator checks, reference aliases, reservations and Dexter
-- reference_settings watch signal remain on the same save path.
begin;

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
    case
      -- Legacy bookings may not have enough shipment details to establish direction.
      -- Keep their existing identity until direction is known; never invent I/E/D/C.
      when sequence.pattern ~ '\{DIRECTION(?::[0-9]{1,2})?\}'
        and lower(replace(replace(btrim(coalesce(job."Job_Direction", '')), '-', '_'), ' ', '_'))
          not in ('import', 'export', 'domestic', 'cross_trade')
        and nullif(btrim(job."Job_BookingReference"), '') is not null
      then job."Job_BookingReference"
      else quote_api.render_reference_pattern(sequence.pattern, job."Job_BookingReferenceSequenceValue", workspace_company_id, job."Job_Direction")
    end
  from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  join quote_api.booking_reference_sequences sequence
    on sequence.company_id = workspace_company_id
   and sequence.sequence_key = job."Job_BookingReferenceSequenceKey" and sequence.enabled
  where office."Company_ID" = workspace_company_id and not job."Job_IsDeleted";

  insert into pg_temp.multideck_reference_sync_plan
  select 'customer', organisation."Org_id", organisation."Org_AccCode",
    case
      -- Imported customer codes do not necessarily belong to a generated sequence.
      when coalesce(profile."CRMAccount_ReferenceSequenceValue", 0) < 1
        and nullif(btrim(organisation."Org_AccCode"), '') is not null
      then organisation."Org_AccCode"
      else quote_api.render_reference_pattern(settings_row.customer_pattern, profile."CRMAccount_ReferenceSequenceValue", workspace_company_id)
    end
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
  where new_reference is distinct from old_reference
    and (length(new_reference) > 120 or (reference_kind = 'booking' and length(new_reference) > 80)
      or (reference_kind = 'customer' and length(new_reference) > 8)) limit 1;
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

commit;
