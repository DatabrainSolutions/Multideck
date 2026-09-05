-- Treat the bill-to organisation as a first-class quote and booking party.
-- The payer account supplies the commercial terms shown to the customer; the
-- operational customer remains a separate identity.

begin;

alter table public."CusQuote_Parties"
  drop constraint if exists "CusQuote_Parties_CusQuoteParty_RoleCode_check";
alter table public."CusQuote_Parties"
  add constraint "CusQuote_Parties_CusQuoteParty_RoleCode_check"
  check ("CusQuoteParty_RoleCode" in ('payer', 'shipper', 'consignee'));

alter function quote_api.save_quote(uuid, uuid, jsonb)
  rename to save_quote_before_payer_20260904;

create or replace function quote_api.save_quote(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved jsonb;
  saved_quote_id uuid;
  saved_version_id uuid;
  company_id uuid;
  effective_payer jsonb;
  previous_payer jsonb;
begin
  if requested_quote_id is not null then
    select jsonb_strip_nulls(jsonb_build_object(
      'orgId', party."CusQuoteParty_OrgID",
      'name', party."CusQuoteParty_NameSnapshot",
      'address', party."CusQuoteParty_AddressSnapshot",
      'contact', party."CusQuoteParty_ContactSnapshot",
      'email', quote."CusQuoteHeader_ShipmentFactsJSON"->>'payerEmail',
      'code', quote."CusQuoteHeader_ShipmentFactsJSON"->>'payerCode'
    )) into previous_payer
    from public."CusQuote_Parties" party
    join public."CusQuote_Header" quote
      on quote."CusQuoteHeader_ID" = party."CusQuoteHeader_ID"
    where party."CusQuoteHeader_ID" = requested_quote_id
      and party."CusQuoteParty_RoleCode" = 'payer';
  end if;

  effective_payer := case
    when payload ? 'payer' and jsonb_typeof(payload->'payer') = 'object'
      then payload->'payer'
    when previous_payer is not null then previous_payer
    else jsonb_strip_nulls(jsonb_build_object(
      'orgId', nullif(payload->>'customerId', ''),
      'name', nullif(btrim(payload->>'customerName'), ''),
      'address', nullif(btrim(payload#>>'{shipmentFacts,customerAddress}'), ''),
      'contact', nullif(btrim(payload->>'contactName'), ''),
      'email', nullif(btrim(payload->>'contactEmail'), ''),
      'code', nullif(btrim(payload#>>'{shipmentFacts,clientCode}'), '')
    ))
  end;

  saved := quote_api.save_quote_before_payer_20260904(
    caller_auth_user_id,
    requested_quote_id,
    payload
  );
  saved_quote_id := nullif(saved->>'quoteId', '')::uuid;
  saved_version_id := nullif(saved->>'versionId', '')::uuid;

  select app_user."Company_ID" into strict company_id
  from public."cmp_Users" app_user
  where app_user."Auth_User_ID" = caller_auth_user_id
    and app_user."User_AccessStatus" = 'active';

  delete from public."CusQuote_Parties"
  where "CusQuoteHeader_ID" = saved_quote_id
    and "CusQuoteParty_RoleCode" = 'payer';

  if quote_api.jsonb_has_content(effective_payer) then
    insert into public."CusQuote_Parties" (
      "Company_ID", "CusQuoteHeader_ID", "CusQuoteParty_RoleCode",
      "CusQuoteParty_OrgID", "CusQuoteParty_NameSnapshot",
      "CusQuoteParty_AddressSnapshot", "CusQuoteParty_ContactSnapshot"
    ) values (
      company_id, saved_quote_id, 'payer',
      nullif(effective_payer->>'orgId', '')::uuid,
      left(nullif(btrim(effective_payer->>'name'), ''), 240),
      nullif(btrim(effective_payer->>'address'), ''),
      left(nullif(btrim(effective_payer->>'contact'), ''), 180)
    );
  end if;

  update public."CusQuote_Header"
  set "CusQuoteHeader_ShipmentFactsJSON" = coalesce("CusQuoteHeader_ShipmentFactsJSON", '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'payerCode', nullif(btrim(effective_payer->>'code'), ''),
        'payerEmail', nullif(btrim(effective_payer->>'email'), '')
      ))
  where "CusQuoteHeader_ID" = saved_quote_id;

  if saved_version_id is not null then
    update public."CusQuote_Versions"
    set "CusQuoteVersion_SnapshotJSON" = jsonb_set(
      "CusQuoteVersion_SnapshotJSON",
      '{quote,payer}',
      coalesce(effective_payer, '{}'::jsonb),
      true
    )
    where "CusQuoteVersion_ID" = saved_version_id;
  end if;

  return saved;
end;
$$;

revoke all on function quote_api.save_quote_before_payer_20260904(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function quote_api.save_quote(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function quote_api.save_quote(uuid, uuid, jsonb) to service_role;

alter function booking_api.quote_sync_projection(jsonb)
  rename to quote_sync_projection_before_payer_20260904;

create or replace function booking_api.quote_sync_projection(snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select booking_api.quote_sync_projection_before_payer_20260904(snapshot)
    || jsonb_build_object(
      'payer', case
        when jsonb_typeof(snapshot#>'{quote,payer}') = 'object'
          and snapshot#>'{quote,payer}' <> '{}'::jsonb
          then snapshot#>'{quote,payer}'
        else jsonb_strip_nulls(jsonb_build_object(
          'orgId', nullif(snapshot#>>'{quote,customerId}', ''),
          'name', nullif(btrim(snapshot#>>'{quote,customerName}'), ''),
          'address', nullif(btrim(snapshot#>>'{quote,shipmentFacts,customerAddress}'), ''),
          'contact', nullif(btrim(snapshot#>>'{quote,contactName}'), ''),
          'email', nullif(btrim(snapshot#>>'{quote,contactEmail}'), ''),
          'code', nullif(btrim(snapshot#>>'{quote,shipmentFacts,clientCode}'), '')
        ))
      end
    )
$$;

alter function booking_api.current_quote_sync_projection(uuid)
  rename to current_quote_sync_projection_before_payer_20260904;

create or replace function booking_api.current_quote_sync_projection(requested_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select booking_api.current_quote_sync_projection_before_payer_20260904(requested_job_id)
    || jsonb_build_object(
      'payer', coalesce(
        payer.party,
        booking_api.quote_sync_projection(
          coalesce(job."Job_SourceSnapshotJSON"->'acceptedSnapshot', '{}'::jsonb)
        )->'payer'
      )
    )
  from public."Job_Header" job
  left join lateral (
    select jsonb_strip_nulls(jsonb_build_object(
      'orgId', party."JobParty_OrgID",
      'name', party."JobParty_NameSnapshot",
      'address', party."JobParty_AddressSnapshot",
      'contact', party."JobParty_ContactNameSnapshot",
      'email', party."JobParty_EmailSnapshot",
      'code', party."JobParty_IdentifierValueSnapshot"
    )) as party
    from public."Job_Parties" party
    where party."JobParty_JobID" = job."Job_ID"
      and party."JobParty_Role" = 'payer'
    order by party."JobParty_IsPrimary" desc, party."JobParty_Sequence", party."JobParty_ID"
    limit 1
  ) payer on true
  where job."Job_ID" = requested_job_id
    and not job."Job_IsDeleted"
$$;

alter function booking_api.quote_sync_differences(jsonb, jsonb, jsonb)
  rename to quote_sync_differences_before_payer_20260904;

create or replace function booking_api.quote_sync_differences(
  baseline jsonb,
  booking jsonb,
  proposed jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with comparison as (
    select
      (booking->'payer') is distinct from (baseline->'payer') as booking_changed,
      (booking->'payer') is distinct from (baseline->'payer')
        and (booking->'payer') is distinct from (proposed->'payer') as has_conflict
  )
  select booking_api.quote_sync_differences_before_payer_20260904(baseline, booking, proposed)
    || case when (proposed->'payer') is distinct from (baseline->'payer') then
      jsonb_build_array(jsonb_build_object(
        'key', 'payer',
        'label', 'Bill to / payer',
        'section', 'Parties',
        'previousQuoteValue', baseline->'payer',
        'bookingValue', booking->'payer',
        'newQuoteValue', proposed->'payer',
        'bookingChanged', booking_changed,
        'conflict', has_conflict,
        'requiresConfirmation', has_conflict,
        'warningCode', case when has_conflict then 'booking_changed' else null end,
        'recommendation', case when has_conflict then 'review' else 'apply' end
      ))
    else '[]'::jsonb end
  from comparison
$$;

alter function public.booking_workflow_apply_quote_sync(uuid, uuid, uuid, jsonb)
  rename to booking_workflow_apply_quote_sync_before_payer_20260904;

create or replace function public.booking_workflow_apply_quote_sync(
  caller_auth_user_id uuid,
  requested_job_id uuid,
  requested_review_id uuid,
  requested_fields jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  review_row record;
  payer jsonb;
begin
  if requested_fields ? 'payer' then
    if caller_auth_user_id is null or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Write') then
      raise exception 'Booking changes are not authorised.' using errcode = '42501';
    end if;
    select "User_ID", "Company_ID" into strict app_user
    from public."cmp_Users"
    where "Auth_User_ID" = caller_auth_user_id
      and "User_AccessStatus" = 'active';
    select review.* into strict review_row
    from booking_api.quote_sync_reviews review
    where review.review_id = requested_review_id
      and review.job_id = requested_job_id
      and review.company_id = app_user."Company_ID"
      and review.status_code in ('pending', 'partially_applied')
    for update;
    payer := review_row.proposed_snapshot->'payer';

    delete from public."Job_Parties"
    where "JobParty_JobID" = requested_job_id
      and "JobParty_Role" = 'payer';

    if quote_api.jsonb_has_content(payer) then
      insert into public."Job_Parties" (
        "JobParty_JobID", "JobParty_Role", "JobParty_OrgID", "JobParty_Sequence",
        "JobParty_NameSnapshot", "JobParty_AddressSnapshot", "JobParty_ContactNameSnapshot",
        "JobParty_EmailSnapshot", "JobParty_IdentifierType", "JobParty_IdentifierValueSnapshot",
        "JobParty_IsPrimary", "JobParty_RawSnapshot", "JobParty_CreatedBy"
      ) values (
        requested_job_id, 'payer', nullif(payer->>'orgId', '')::uuid, 1,
        left(nullif(btrim(payer->>'name'), ''), 240), nullif(btrim(payer->>'address'), ''),
        left(nullif(btrim(payer->>'contact'), ''), 180), left(nullif(btrim(payer->>'email'), ''), 254),
        'account_code', left(nullif(btrim(payer->>'code'), ''), 120), true, payer, app_user."User_ID"
      );
    end if;
  end if;

  return public.booking_workflow_apply_quote_sync_before_payer_20260904(
    caller_auth_user_id,
    requested_job_id,
    requested_review_id,
    requested_fields
  );
exception when no_data_found or too_many_rows then
  raise exception 'The quote update review is unavailable in this workspace.' using errcode = 'P0002';
end;
$$;

revoke all on function public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.booking_workflow_apply_quote_sync(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

alter function booking_api.convert_accepted_quote(uuid, uuid, uuid)
  rename to convert_accepted_quote_before_payer_20260904;

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
  result jsonb;
  job_row record;
  quote_row record;
  snapshot jsonb;
  quote jsonb;
  facts jsonb;
  payer jsonb;
  actor_user_id uuid;
begin
  result := booking_api.convert_accepted_quote_before_payer_20260904(
    requested_quote_id,
    requested_actor_user_id,
    requested_response_id
  );

  select job.* into strict job_row
  from public."Job_Header" job
  where job."Job_ID" = (result->>'jobId')::uuid
    and not job."Job_IsDeleted";
  select quote_header.* into strict quote_row
  from public."CusQuote_Header" quote_header
  where quote_header."CusQuoteHeader_ID" = requested_quote_id
    and not quote_header."CusQuoteHeader_IsDeleted";

  if job_row."Job_SourceQuoteVersionID" = quote_row."CusQuoteHeader_AcceptedVersionID"
     and not exists (
       select 1 from public."Job_Parties" party
       where party."JobParty_JobID" = job_row."Job_ID"
         and party."JobParty_Role" = 'payer'
     ) then
    select version."CusQuoteVersion_SnapshotJSON" into strict snapshot
    from public."CusQuote_Versions" version
    where version."CusQuoteVersion_ID" = job_row."Job_SourceQuoteVersionID";
    quote := coalesce(snapshot->'quote', '{}'::jsonb);
    facts := coalesce(quote->'shipmentFacts', '{}'::jsonb);
    payer := case
      when jsonb_typeof(quote->'payer') = 'object' and quote->'payer' <> '{}'::jsonb
        then quote->'payer'
      else jsonb_strip_nulls(jsonb_build_object(
        'orgId', nullif(quote->>'customerId', ''),
        'name', nullif(btrim(quote->>'customerName'), ''),
        'address', nullif(btrim(facts->>'customerAddress'), ''),
        'contact', nullif(btrim(quote->>'contactName'), ''),
        'email', nullif(btrim(quote->>'contactEmail'), ''),
        'code', nullif(btrim(facts->>'clientCode'), '')
      ))
    end;
    actor_user_id := coalesce(requested_actor_user_id, job_row."Job_UpdatedBy", job_row."Job_CreatedBy");

    if quote_api.jsonb_has_content(payer) then
      insert into public."Job_Parties" (
        "JobParty_JobID", "JobParty_Role", "JobParty_OrgID", "JobParty_Sequence",
        "JobParty_NameSnapshot", "JobParty_AddressSnapshot", "JobParty_ContactNameSnapshot",
        "JobParty_EmailSnapshot", "JobParty_IdentifierType", "JobParty_IdentifierValueSnapshot",
        "JobParty_IsPrimary", "JobParty_RawSnapshot", "JobParty_CreatedBy"
      ) values (
        job_row."Job_ID", 'payer', nullif(payer->>'orgId', '')::uuid, 1,
        left(nullif(btrim(payer->>'name'), ''), 240), nullif(btrim(payer->>'address'), ''),
        left(nullif(btrim(payer->>'contact'), ''), 180), left(nullif(btrim(payer->>'email'), ''), 254),
        'account_code', left(nullif(btrim(payer->>'code'), ''), 120), true, payer, actor_user_id
      );
    end if;
  end if;

  return result;
exception when no_data_found or too_many_rows then
  raise exception 'The accepted quote or booking workspace is incomplete.' using errcode = 'P0002';
end;
$$;

revoke all on function booking_api.convert_accepted_quote_before_payer_20260904(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function booking_api.convert_accepted_quote(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function booking_api.convert_accepted_quote(uuid, uuid, uuid) to service_role;

-- Recalculate any active review so a payer change cannot be missed by a review
-- that happened to be open while this migration was deployed.
update booking_api.quote_sync_reviews review
set baseline_snapshot = booking_api.quote_sync_projection(applied_version."CusQuoteVersion_SnapshotJSON"),
    proposed_snapshot = booking_api.quote_sync_projection(proposed_version."CusQuoteVersion_SnapshotJSON"),
    booking_snapshot = booking_api.current_quote_sync_projection(review.job_id),
    differences = booking_api.quote_sync_differences(
      booking_api.quote_sync_projection(applied_version."CusQuoteVersion_SnapshotJSON"),
      booking_api.current_quote_sync_projection(review.job_id),
      booking_api.quote_sync_projection(proposed_version."CusQuoteVersion_SnapshotJSON")
    )
from public."CusQuote_Versions" applied_version,
     public."CusQuote_Versions" proposed_version
where review.status_code in ('pending', 'partially_applied')
  and applied_version."CusQuoteVersion_ID" = review.applied_version_id
  and proposed_version."CusQuoteVersion_ID" = review.proposed_version_id;

alter function public.multideck_dexter_domain_quotes(uuid, text, integer)
  rename to multideck_dexter_domain_quotes_before_payer_20260904;

create or replace function public.multideck_dexter_domain_quotes(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    item.value || jsonb_strip_nulls(jsonb_build_object(
      'payer', case when payer."CusQuoteParty_ID" is null then null else jsonb_strip_nulls(jsonb_build_object(
        'organisationId', payer."CusQuoteParty_OrgID",
        'name', payer."CusQuoteParty_NameSnapshot",
        'address', payer."CusQuoteParty_AddressSnapshot",
        'contact', payer."CusQuoteParty_ContactSnapshot",
        'code', quote."CusQuoteHeader_ShipmentFactsJSON"->>'payerCode',
        'email', quote."CusQuoteHeader_ShipmentFactsJSON"->>'payerEmail'
      )) end
    )) order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(
    public.multideck_dexter_domain_quotes_before_payer_20260904(p_company_id, p_search, p_take)
  ) with ordinality item(value, ordinality)
  left join public."CusQuote_Header" quote
    on quote."CusQuoteHeader_ID" = nullif(item.value->>'recordId', '')::uuid
   and not quote."CusQuoteHeader_IsDeleted"
  left join public."CusQuote_Parties" payer
    on payer."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
   and payer."CusQuoteParty_RoleCode" = 'payer';
$$;

revoke all on function public.multideck_dexter_domain_quotes_before_payer_20260904(uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.multideck_dexter_domain_quotes(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_quotes(uuid, text, integer) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Customer quote versions, response evidence, routing, commercial evidence, copy provenance and the separate bill-to payer whose account terms govern each quote. Payer changes remain approval-only in the Quote and Booking workflows until the planned Dexter proposed-action write stage.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Canonical freight bookings, accepted-quote provenance, applied and proposed quote versions, and operational parties including the separate bill-to payer. Accepted payer changes are applied only after operator review.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'bookings';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Event-driven quote lifecycle, ETD, ETA, validity, payer, customer response, confirmed delivery, recipient, quote-document and linked-booking changes.',
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'quotes';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Freight booking status, route, delivery, ownership, risk, payer and newer accepted quote review availability. Quote-controlled payer changes require operator approval.',
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'bookings';

comment on function public.multideck_dexter_domain_quotes(uuid, text, integer)
is 'Tenant-safe quote reads include payer evidence. Payer writes are deliberately not allowlisted until the Dexter proposed-action approval stage.';

commit;
