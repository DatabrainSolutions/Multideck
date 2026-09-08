-- Reliable contact-card visit attribution and retry-safe exchanges.
-- No new personal identifiers: session IDs are random, tab-scoped and short-lived.
begin;

alter table public."CRM_ContactCardScans"
  add column "Scan_RequestID" uuid,
  add column "Scan_SessionID" uuid;
create unique index "UX_CRM_ContactCardScans_Request"
  on public."CRM_ContactCardScans" ("ContactCard_ID", "Scan_RequestID")
  where "Scan_RequestID" is not null;
create index "IX_CRM_ContactCardScans_Session"
  on public."CRM_ContactCardScans" ("ContactCard_ID", "Scan_SessionID");

create or replace function public.multideck_contact_card_record_scan_v2(
  p_slug text, p_device text, p_browser text, p_channel text,
  p_request_id uuid, p_session_id uuid
)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_card uuid; v_scan uuid;
begin
  if p_request_id is null or p_session_id is null then
    raise exception 'Reload this contact card before continuing.' using errcode = '22023';
  end if;
  select "ContactCard_ID" into v_card from public."CRM_ContactCards"
  where "ContactCard_Slug" = lower(btrim(p_slug)) and "ContactCard_Status" = 'published' and "ContactCard_DeletedAt" is null;
  if v_card is null then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_card::text || p_request_id::text, 774));
  select "Scan_ID" into v_scan from public."CRM_ContactCardScans"
  where "ContactCard_ID" = v_card and "Scan_RequestID" = p_request_id;
  if v_scan is not null then return v_scan; end if;

  -- Reuse the existing per-card limits and publication check. Never accept
  -- invented client location; approximate geolocation is not collected here.
  v_scan := public.multideck_contact_card_record_scan(p_slug, p_device, p_browser, p_channel, '', '');
  if v_scan is not null then
    update public."CRM_ContactCardScans"
    set "Scan_RequestID" = p_request_id, "Scan_SessionID" = p_session_id
    where "Scan_ID" = v_scan;
  end if;
  return v_scan;
end;
$$;
revoke all on function public.multideck_contact_card_record_scan_v2(text,text,text,text,uuid,uuid) from public;
grant execute on function public.multideck_contact_card_record_scan_v2(text,text,text,text,uuid,uuid) to anon, authenticated;

create or replace function public.multideck_contact_card_submit_exchange(p_slug text, p_scan_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_card record;
  v_scan record;
  v_previous record;
  v_email text;
  v_lead uuid;
  v_exchange uuid;
  v_run uuid;
  v_run_status text;
  v_recent_count integer;
  v_daily_count integer;
begin
  select * into v_card
  from public."CRM_ContactCards"
  where "ContactCard_Slug" = lower(btrim(p_slug))
    and "ContactCard_Status" = 'published'
    and "ContactCard_DeletedAt" is null
  limit 1;
  if not found then raise exception 'This contact card is not active.' using errcode = 'P0002'; end if;
  if p_scan_id is null then raise exception 'Reload this contact card before submitting.' using errcode = '22023'; end if;

  select * into v_scan
  from public."CRM_ContactCardScans"
  where "Scan_ID" = p_scan_id
    and "ContactCard_ID" = v_card."ContactCard_ID"
    and "Scan_At" > now() - interval '24 hours'
  for update;
  if not found then raise exception 'This contact-card submission has expired. Reload the card and try again.' using errcode = '22023'; end if;

  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Check your details and try again.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_input) field where field.key in ('firstName','lastName','email','company','phone') and jsonb_typeof(field.value) <> 'string')
     or (p_input ? 'marketingConsent' and jsonb_typeof(p_input->'marketingConsent') <> 'boolean')
     or length(coalesce(p_input->>'firstName','')) > 120
     or length(coalesce(p_input->>'lastName','')) > 120
     or length(coalesce(p_input->>'email','')) > 254
     or length(coalesce(p_input->>'company','')) > 255
     or length(coalesce(p_input->>'phone','')) > 80 then
    raise exception 'Check your details and try again.' using errcode = '22023';
  end if;
  if v_card."ContactCard_PhoneField" = 'required' and btrim(coalesce(p_input->>'phone','')) = '' then
    raise exception 'Enter your phone number.' using errcode = '22023';
  end if;
  if v_card."ContactCard_PhoneField" = 'hidden' then p_input := p_input || '{"phone":""}'::jsonb; end if;
  if not v_card."ContactCard_ConsentEnabled" then p_input := p_input || '{"marketingConsent":false}'::jsonb; end if;
  -- Only the public form's fields may reach CRM mapping or automation.
  p_input := jsonb_build_object(
    'firstName', btrim(coalesce(p_input->>'firstName','')),
    'lastName', btrim(coalesce(p_input->>'lastName','')),
    'email', lower(btrim(coalesce(p_input->>'email',''))),
    'company', btrim(coalesce(p_input->>'company','')),
    'phone', btrim(coalesce(p_input->>'phone','')),
    'marketingConsent', coalesce((p_input->>'marketingConsent')::boolean,false)
  );

  -- The locked scan is the submission capability. A lost response can be retried
  -- with the same details without creating another lead or replaying automation.
  if v_scan."Scan_ExchangedAt" is not null then
    select * into v_previous from public."CRM_ContactCardExchanges"
    where "Scan_ID" = p_scan_id and "ContactCard_ID" = v_card."ContactCard_ID"
    order by "Exchange_At" limit 1;
    if not found or v_previous."Exchange_FirstName" <> btrim(coalesce(p_input->>'firstName',''))
       or v_previous."Exchange_LastName" <> btrim(coalesce(p_input->>'lastName',''))
       or v_previous."Exchange_Email" <> lower(btrim(coalesce(p_input->>'email','')))
       or v_previous."Exchange_Company" <> btrim(coalesce(p_input->>'company',''))
       or v_previous."Exchange_Phone" <> btrim(coalesce(p_input->>'phone',''))
       or v_previous."Exchange_MarketingConsent" <> coalesce((p_input->>'marketingConsent')::boolean,false) then
      raise exception 'These details have already been sent. Reload the card to send different details.' using errcode = '22023';
    end if;
    return jsonb_build_object('outcome', v_previous."Exchange_Outcome", 'automationOutcome',
      case v_previous."Exchange_AutomationOutcome" when 'ran' then 'succeeded' when 'none' then 'running' else v_previous."Exchange_AutomationOutcome" end);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_card."ContactCard_ID"::text, 773));
  select
    count(*) filter (where "Exchange_At" > now() - interval '10 minutes'),
    count(*) filter (where "Exchange_At" > now() - interval '1 day')
  into v_recent_count, v_daily_count
  from public."CRM_ContactCardExchanges"
  where "ContactCard_ID" = v_card."ContactCard_ID"
    and "Exchange_At" > now() - interval '1 day';
  if v_recent_count >= 20 or v_daily_count >= 500 then
    raise exception 'This contact card is receiving too many submissions. Try again later.' using errcode = 'P0001';
  end if;

  v_email := lower(btrim(p_input ->> 'email'));
  if coalesce(v_email, '') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_input ->> 'firstName', '')) = ''
     or btrim(coalesce(p_input ->> 'lastName', '')) = ''
     or btrim(coalesce(p_input ->> 'company', '')) = '' then
    raise exception 'Enter a first name, last name and company.' using errcode = '22023';
  end if;

  insert into public."CRM_Leads" (
    "CRMLead_SourceCode", "CRMLead_StatusCode", "CRMLead_RatingCode", "CRMLead_OwnerUserID",
    "CRMLead_CompanyName", "CRMLead_PersonName", "CRMLead_Email", "CRMLead_Phone",
    "CRMLead_MetadataJSON", "CRMLead_CreatedBy", "CRMLead_UpdatedBy"
  ) values (
    'website', 'new', 'unrated', v_card."Owner_User_ID",
    left(btrim(p_input ->> 'company'), 255),
    left(btrim(concat_ws(' ', p_input ->> 'firstName', p_input ->> 'lastName')), 255),
    left(v_email, 255), left(coalesce(p_input ->> 'phone', ''), 80),
    jsonb_build_object(
      'contactCardId', v_card."ContactCard_ID",
      'contactCardSlug', v_card."ContactCard_Slug",
      'leadSource', v_card."ContactCard_LeadSource",
      'marketingConsent', coalesce((p_input ->> 'marketingConsent')::boolean, false)
    ),
    v_card."Owner_User_ID", v_card."Owner_User_ID"
  ) returning "CRMLead_ID" into v_lead;

  perform private.apply_contact_card_crm_field_mappings(v_card."ContactCard_ID", v_lead, p_input);
  insert into public."CRM_ContactCardExchanges" (
    "ContactCard_ID", "Scan_ID", "CRMLead_ID", "Exchange_FirstName", "Exchange_LastName",
    "Exchange_Email", "Exchange_Company", "Exchange_Phone", "Exchange_MarketingConsent",
    "Exchange_Outcome", "Exchange_AutomationOutcome", "Exchange_AutomationDetail"
  ) values (
    v_card."ContactCard_ID", p_scan_id, v_lead,
    btrim(p_input ->> 'firstName'), btrim(p_input ->> 'lastName'), v_email,
    btrim(p_input ->> 'company'), btrim(coalesce(p_input ->> 'phone', '')),
    coalesce((p_input ->> 'marketingConsent')::boolean, false),
    'created', 'none', 'CRM mapping pending.'
  ) returning "Exchange_ID" into v_exchange;

  v_run := public._multideck_contact_card_execute_automation(
    v_card."ContactCard_ID", v_exchange, v_lead, p_input, false, false, null, 0
  );
  select "AutomationRun_Status" into v_run_status
  from public."CRM_ContactCardAutomationRuns"
  where "AutomationRun_ID" = v_run;
  v_run_status := coalesce(v_run_status, 'skipped');

  update public."CRM_ContactCardExchanges"
  set
    "Exchange_AutomationOutcome" = case
      when v_run_status = 'succeeded' then 'ran'
      when v_run_status = 'failed' then 'failed'
      when v_run_status = 'skipped' then 'skipped'
      else 'none'
    end,
    "Exchange_AutomationDetail" = case
      when v_run_status = 'succeeded' then 'New CRM lead created.'
      when v_run_status = 'failed' then 'A CRM step failed. The new lead and submitted input were preserved for review.'
      when v_run_status = 'skipped' then 'The new CRM lead was created; optional automation was inactive.'
      else 'New CRM lead created.'
    end
  where "Exchange_ID" = v_exchange;

  update public."CRM_ContactCardScans"
  set "Scan_StartedAt" = coalesce("Scan_StartedAt", now()), "Scan_ExchangedAt" = now()
  where "Scan_ID" = p_scan_id and "ContactCard_ID" = v_card."ContactCard_ID";

  return jsonb_build_object('outcome', 'created', 'automationOutcome', v_run_status);
end;
$$;

create or replace function public._multideck_contact_card_analytics(p_card_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_scans bigint := 0;
  v_unique_scans bigint := 0;
  v_converted_sessions bigint := 0;
  v_started bigint := 0;
  v_exchanges bigint := 0;
  v_leads_created bigint := 0;
  v_leads_matched bigint := 0;
  v_runs_today bigint := 0;
  v_failed_runs bigint := 0;
  v_timeline_hour jsonb := '[]'::jsonb;
  v_timeline_day jsonb := '[]'::jsonb;
  v_devices jsonb := '[]'::jsonb;
  v_browsers jsonb := '[]'::jsonb;
  v_channels jsonb := '[]'::jsonb;
  v_locations jsonb := '[]'::jsonb;
  v_suppressed_regions integer := 0;
  v_suppressed_scans bigint := 0;
  v_automation_outcomes jsonb := '[]'::jsonb;
begin
  select
    count(*),
    count(*) filter (where scan."Scan_StartedAt" is not null)
  into v_scans, v_started
  from public."CRM_ContactCardScans" scan
  where scan."ContactCard_ID" = p_card_id;

  -- Never merge unrelated people merely because they use the same browser.
  -- Historical visits have no session ID and count individually.
  select count(distinct coalesce(scan."Scan_SessionID", scan."Scan_ID")),
    count(distinct coalesce(scan."Scan_SessionID", scan."Scan_ID")) filter (where scan."Scan_ExchangedAt" is not null)
  into v_unique_scans, v_converted_sessions
  from public."CRM_ContactCardScans" scan
  where scan."ContactCard_ID" = p_card_id;

  select
    count(*),
    count(*) filter (where exchange."Exchange_Outcome" = 'created'),
    count(*) filter (where exchange."Exchange_Outcome" = 'matched')
  into v_exchanges, v_leads_created, v_leads_matched
  from public."CRM_ContactCardExchanges" exchange
  where exchange."ContactCard_ID" = p_card_id;

  select
    count(*) filter (
      where not run."AutomationRun_IsTest"
        and run."AutomationRun_StartedAt" >= date_trunc('day', now())
        and run."AutomationRun_StartedAt" < date_trunc('day', now()) + interval '1 day'
    ),
    count(*) filter (where run."AutomationRun_Status" = 'failed')
  into v_runs_today, v_failed_runs
  from public."CRM_ContactCardAutomationRuns" run
  where run."ContactCard_ID" = p_card_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'iso', bucket.bucket,
    'scans', bucket.scans,
    'exchanges', bucket.exchanges
  ) order by bucket.bucket), '[]'::jsonb)
  into v_timeline_hour
  from (
    select
      date_trunc('hour', scan."Scan_At") as bucket,
      count(*) as scans,
      count(*) filter (where scan."Scan_ExchangedAt" is not null) as exchanges
    from public."CRM_ContactCardScans" scan
    where scan."ContactCard_ID" = p_card_id
    group by date_trunc('hour', scan."Scan_At")
    order by bucket desc
    limit 168
  ) bucket;

  select coalesce(jsonb_agg(jsonb_build_object(
    'iso', bucket.bucket,
    'scans', bucket.scans,
    'exchanges', bucket.exchanges
  ) order by bucket.bucket), '[]'::jsonb)
  into v_timeline_day
  from (
    select
      date_trunc('day', scan."Scan_At") as bucket,
      count(*) as scans,
      count(*) filter (where scan."Scan_ExchangedAt" is not null) as exchanges
    from public."CRM_ContactCardScans" scan
    where scan."ContactCard_ID" = p_card_id
    group by date_trunc('day', scan."Scan_At")
    order by bucket desc
    limit 90
  ) bucket;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', breakdown.name,
    'value', breakdown.value,
    'share', case when v_scans = 0 then 0 else breakdown.value::numeric / v_scans end
  ) order by breakdown.value desc, breakdown.name), '[]'::jsonb)
  into v_devices
  from (
    select case scan."Scan_Device"
      when 'mobile' then 'Mobile'
      when 'tablet' then 'Tablet'
      when 'desktop' then 'Desktop'
      else 'Unknown'
    end as name, count(*) as value
    from public."CRM_ContactCardScans" scan
    where scan."ContactCard_ID" = p_card_id
    group by scan."Scan_Device"
  ) breakdown;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', breakdown.name,
    'value', breakdown.value,
    'share', case when v_scans = 0 then 0 else breakdown.value::numeric / v_scans end
  ) order by breakdown.value desc, breakdown.name), '[]'::jsonb)
  into v_browsers
  from (
    select coalesce(nullif(btrim(scan."Scan_Browser"), ''), 'Unknown') as name, count(*) as value
    from public."CRM_ContactCardScans" scan
    where scan."ContactCard_ID" = p_card_id
    group by coalesce(nullif(btrim(scan."Scan_Browser"), ''), 'Unknown')
  ) breakdown;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', breakdown.name,
    'value', breakdown.value,
    'share', case when v_scans = 0 then 0 else breakdown.value::numeric / v_scans end
  ) order by breakdown.value desc, breakdown.name), '[]'::jsonb)
  into v_channels
  from (
    select case scan."Scan_Channel"
      when 'direct-scan' then case when scan."Scan_RequestID" is null then 'Unattributed (legacy)' else 'QR code link' end
      when 'shared-link' then 'Shared link'
      when 'in-app-browser' then 'In-app browser'
      else 'Unknown'
    end as name, count(*) as value
    from public."CRM_ContactCardScans" scan
    where scan."ContactCard_ID" = p_card_id
    group by 1
  ) breakdown;

  with location_counts as (
    select
      coalesce(
        nullif(btrim(concat_ws(', ', nullif(btrim(scan."Scan_Region"), ''), nullif(btrim(scan."Scan_Country"), ''))), ''),
        'Unknown'
      ) as name,
      count(*) as value
    from public."CRM_ContactCardScans" scan
    where scan."ContactCard_ID" = p_card_id
    group by 1
  ), location_rollup as (
    select name, value from location_counts where value >= 5
    union all
    select 'Other regions', sum(value) from location_counts where value < 5
    having count(*) > 0
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'name', location_rollup.name,
      'value', location_rollup.value,
      'share', case when v_scans = 0 then 0 else location_rollup.value::numeric / v_scans end
    ) order by location_rollup.value desc, location_rollup.name), '[]'::jsonb),
    (select count(*)::integer from location_counts where value < 5),
    coalesce((select sum(value) from location_counts where value < 5), 0)
  into v_locations, v_suppressed_regions, v_suppressed_scans
  from location_rollup;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', breakdown.name,
    'value', breakdown.value,
    'share', case when v_exchanges = 0 then 0 else breakdown.value::numeric / v_exchanges end
  ) order by breakdown.value desc, breakdown.name), '[]'::jsonb)
  into v_automation_outcomes
  from (
    select case exchange."Exchange_AutomationOutcome"
      when 'ran' then 'Ran'
      when 'skipped' then 'Skipped by a condition'
      when 'failed' then 'Failed'
      else 'Automation off'
    end as name, count(*) as value
    from public."CRM_ContactCardExchanges" exchange
    where exchange."ContactCard_ID" = p_card_id
    group by exchange."Exchange_AutomationOutcome"
  ) breakdown;

  return jsonb_build_object(
    'totals', jsonb_build_object(
      'scans', v_scans,
      'uniqueScans', v_unique_scans,
      'started', v_started,
      'exchanges', v_exchanges,
      'leadsCreated', v_leads_created,
      'leadsMatched', v_leads_matched,
      'conversion', case when v_unique_scans = 0 then null else v_converted_sessions::numeric / v_unique_scans end
    ),
    'timelineHour', v_timeline_hour,
    'timelineDay', v_timeline_day,
    'devices', v_devices,
    'browsers', v_browsers,
    'channels', v_channels,
    'location', jsonb_build_object(
      'rows', v_locations,
      'suppressedRegions', v_suppressed_regions,
      'suppressedScans', v_suppressed_scans
    ),
    'automationOutcomes', v_automation_outcomes,
    'automationRunsToday', v_runs_today,
    'automationFailures', v_failed_runs
  );
end;
$$;

revoke all on function public._multideck_contact_card_analytics(uuid) from public, anon, authenticated;
revoke all on function public.multideck_contact_card_submit_exchange(text,uuid,jsonb) from public;
grant execute on function public.multideck_contact_card_submit_exchange(text,uuid,jsonb) to anon, authenticated;

commit;
