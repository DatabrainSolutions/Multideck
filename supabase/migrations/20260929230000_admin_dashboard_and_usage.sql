-- Admin analytics belong to the isolated App company. Financial dashboard grants
-- are preserved; the label follows its new Finance destination.
begin;
update public."sys_Permissions" set "sys_Permission_Name" = 'View the Finance dashboard'
where "sys_Permission_Value" = 'Finance.Director.Dashboard.View';

create or replace function private.multideck_admin_actor(p_administrator boolean default true)
returns table(user_id uuid, company_id uuid, auth_id uuid)
language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
begin
  return query select u."User_ID", u."Company_ID", u."Auth_User_ID" from public."cmp_Users" u
  where u."Auth_User_ID" = auth.uid() and u."User_AccessStatus" = 'active' and u."Company_ID" is not null
    and (not p_administrator or private.is_tenant_administrator(u."User_ID"));
  if not found then raise exception 'Only active workspace administrators can read these analytics.' using errcode='42501'; end if;
end $$;
revoke all on function private.multideck_admin_actor(boolean) from public, anon, authenticated;

create table public."Admin_AnalyticsConfig" (
  company_id uuid primary key references public."cmp_Company"("Company_ID") on delete cascade,
  tracking_started_at timestamptz not null default now()
);
create table public."Admin_UsageEvents" (
  id uuid primary key,
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  user_id uuid not null references public."cmp_Users"("User_ID"),
  module text not null check(module in ('operations','quotes','crm','finance','warehouse','customs','documents','dexter','admin','other')),
  state text not null check(state in ('active','idle')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  check(ended_at > started_at and ended_at <= started_at + interval '1 minute')
);
create index on public."Admin_UsageEvents"(company_id, recorded_at);
create table public."Admin_UsageDaily" (
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  user_id uuid not null references public."cmp_Users"("User_ID"),
  day date not null,
  module text not null,
  active_ranges tstzmultirange not null default '{}'::tstzmultirange,
  idle_ranges tstzmultirange not null default '{}'::tstzmultirange,
  active_seconds numeric not null default 0,
  idle_seconds numeric not null default 0,
  primary key(company_id,user_id,day,module)
);
create table public."Admin_WorkflowEvents" (
  id uuid primary key,
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  user_id uuid not null references public."cmp_Users"("User_ID"),
  flow_id uuid not null,
  flow text not null check(flow in ('lead_create','lead_convert','quote_create','quote_send','booking_create')),
  state text not null check(state in ('started','step','validation_failed','completed','cancelled')),
  step text not null check(step in ('opened','details','cargo','pricing','review','saved','submitted','converted')),
  record_id uuid,
  occurred_at timestamptz not null default now()
);
create index on public."Admin_WorkflowEvents"(company_id,flow_id,occurred_at);
create table public."Admin_WorkflowDaily" (
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  day date not null,
  flow text not null,
  started integer not null default 0,
  completed integer not null default 0,
  cancelled integer not null default 0,
  unfinished integer not null default 0,
  errors integer not null default 0,
  primary key(company_id,day,flow)
);
create table public."Admin_BookingPlaced" (
  job_id uuid primary key references public."Job_Header"("Job_ID") on delete cascade,
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  placed_at timestamptz not null,
  estimated boolean not null default false
);
create index on public."Admin_BookingPlaced"(company_id,placed_at);

-- Historical creation dates are labelled estimates. New bookings acquire their
-- actual first non-provisional timestamp regardless of which interface saved them.
insert into public."Admin_BookingPlaced"(job_id,company_id,placed_at,estimated)
select j."Job_ID",o."Company_ID",j."Job_CreatedDate" at time zone 'UTC',true
from public."Job_Header" j join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
where not j."Job_IsDeleted" and lower(j."Job_Status") not in ('draft','provisional','cancelled','canceled','voided');
create function private.multideck_admin_booking_placed() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not new."Job_IsDeleted" and lower(new."Job_Status") not in ('draft','provisional','cancelled','canceled','voided') then
    insert into public."Admin_BookingPlaced"(job_id,company_id,placed_at)
    select new."Job_ID",o."Company_ID",now() from public."cmp_Offices" o
    where o."Office_ID"=coalesce(new."Job_OrgOfficeID",new."Job_OfficeID") on conflict(job_id) do nothing;
  end if;
  return new;
end $$;
create trigger admin_booking_placed after insert or update of "Job_Status" on public."Job_Header"
for each row execute function private.multideck_admin_booking_placed();

do $$ declare name text; begin
  foreach name in array array['Admin_AnalyticsConfig','Admin_UsageEvents','Admin_UsageDaily','Admin_WorkflowEvents','Admin_WorkflowDaily','Admin_BookingPlaced'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated',name);
    execute format('grant select,insert,update,delete on public.%I to service_role',name);
  end loop;
end $$;

create function private.multideck_admin_range_seconds(p_ranges tstzmultirange) returns numeric
language sql immutable set search_path=pg_catalog as $$
  select coalesce(sum(extract(epoch from upper(r)-lower(r))),0) from unnest(p_ranges) r
$$;

create function public.multideck_admin_record_usage(p_event jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare actor record; event_id uuid; v_flow_id uuid; record_id uuid; started timestamptz; ended timestamptz;
  d date; piece tstzmultirange; m text; existing_flow text; inserted integer; permitted boolean; flow_started timestamptz;
begin
  select * into actor from private.multideck_admin_actor(false);
  event_id := (p_event->>'id')::uuid;
  if event_id is null then raise exception 'A usage event needs an identifier.' using errcode='22023'; end if;
  insert into public."Admin_AnalyticsConfig"(company_id) values(actor.company_id) on conflict do nothing;
  if p_event->>'kind'='time' then
    started := (p_event->>'from')::timestamptz; ended := (p_event->>'to')::timestamptz;
    if started is null or ended is null or ended<=started or ended-started>interval '1 minute' or started<now()-interval '5 minutes' or ended>now()+interval '5 seconds'
      or coalesce(p_event->>'state','') not in ('active','idle') or coalesce(p_event->>'module','') not in ('operations','quotes','crm','finance','warehouse','customs','documents','dexter','admin','other') then
      raise exception 'Send a recent measured usage interval.' using errcode='22023';
    end if;
    insert into public."Admin_UsageEvents" values(event_id,actor.company_id,actor.user_id,p_event->>'module',p_event->>'state',started,ended,now()) on conflict do nothing;
    get diagnostics inserted=row_count;
    if inserted=0 then return jsonb_build_object('recorded',false);end if;
    for d in select generate_series((started at time zone 'UTC')::date,((ended-interval '1 microsecond') at time zone 'UTC')::date,interval '1 day')::date loop
      piece:=tstzmultirange(tstzrange(greatest(started,d::timestamp at time zone 'UTC'),least(ended,(d+1)::timestamp at time zone 'UTC'),'[)'));
      foreach m in array array[p_event->>'module','_all'] loop
        insert into public."Admin_UsageDaily"(company_id,user_id,day,module,active_ranges,idle_ranges)
        values(actor.company_id,actor.user_id,d,m,case when p_event->>'state'='active' then piece else '{}'::tstzmultirange end,case when p_event->>'state'='idle' then piece else '{}'::tstzmultirange end)
        on conflict(company_id,user_id,day,module) do update set
          active_ranges="Admin_UsageDaily".active_ranges+excluded.active_ranges,
          idle_ranges=("Admin_UsageDaily".idle_ranges+excluded.idle_ranges)-("Admin_UsageDaily".active_ranges+excluded.active_ranges);
        update public."Admin_UsageDaily" set active_seconds=private.multideck_admin_range_seconds(active_ranges),idle_seconds=private.multideck_admin_range_seconds(idle_ranges)
        where company_id=actor.company_id and user_id=actor.user_id and day=d and module=m;
      end loop;
    end loop;
  elsif p_event->>'kind'='flow' then
    v_flow_id:=(p_event->>'flowId')::uuid;record_id:=nullif(p_event->>'recordId','')::uuid;
    if v_flow_id is null or coalesce(p_event->>'flow','') not in ('lead_create','lead_convert','quote_create','quote_send','booking_create')
      or coalesce(p_event->>'state','') not in ('started','step','validation_failed','completed','cancelled')
      or coalesce(p_event->>'step','') not in ('opened','details','cargo','pricing','review','saved','submitted','converted') then
      raise exception 'Send a supported commercial workflow event.' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(actor.company_id::text||actor.user_id::text||v_flow_id::text,0));
    select flow,min(occurred_at) into existing_flow,flow_started from public."Admin_WorkflowEvents"
    where company_id=actor.company_id and user_id=actor.user_id and "Admin_WorkflowEvents".flow_id=v_flow_id group by flow limit 1;
    if flow_started<now()-interval '90 days' then raise exception 'Start a new workflow attempt.' using errcode='22023';end if;
    if existing_flow is not null and existing_flow<>p_event->>'flow' then raise exception 'A workflow cannot change its type.' using errcode='22023';end if;
    if p_event->>'state'<>'started' and existing_flow is null then raise exception 'Start this workflow first.' using errcode='22023';end if;
    permitted:=case when p_event->>'flow' like 'lead_%' then public._multideck_crm_has_permission(actor.user_id,'CRM.Write')
      when p_event->>'flow' like 'quote_%' then public._multideck_crm_has_permission(actor.user_id,'Quotes.Write')
      else public._multideck_crm_has_permission(actor.user_id,'Bookings.Write') end;
    if not permitted then raise exception 'You cannot track an unauthorised workflow.' using errcode='42501';end if;
    if exists(select 1 from public."Admin_WorkflowEvents" e where e.company_id=actor.company_id and e.user_id=actor.user_id and e.flow_id=v_flow_id and e.state in ('completed','cancelled')) then return jsonb_build_object('recorded',false);end if;
    if p_event->>'state'='completed' then
      permitted:=false;
      if p_event->>'flow' in ('lead_create','lead_convert') then
        select exists(select 1 from public."CRM_Leads" l join public."cmp_Offices" o on o."Office_ID"=l."CRMLead_OrgOfficeID"
          where l."CRMLead_ID"=record_id and o."Company_ID"=actor.company_id and not l."CRMLead_IsDeleted"
          and case when p_event->>'flow'='lead_convert' then l."CRMLead_StatusCode"='converted' and l."CRMLead_UpdatedAt">=flow_started
            else l."CRMLead_CreatedAt">=flow_started-interval '5 seconds' end) into permitted;
      elsif p_event->>'flow' in ('quote_create','quote_send') then
        select exists(select 1 from public."CusQuote_Header" q join public."cmp_Offices" o on o."Office_ID"=coalesce(q."CusQuoteHeader_OrgOfficeID",q."OrgOffice_ID")
          where q."CusQuoteHeader_ID"=record_id and o."Company_ID"=actor.company_id and not q."CusQuoteHeader_IsDeleted"
          and case when p_event->>'flow'='quote_create' then q."CusQuoteHeader_CreatedDate" at time zone 'UTC'>=flow_started-interval '5 seconds'
            else exists(select 1 from public."CusQuote_Versions" v where v."CusQuoteHeader_ID"=record_id and v."Company_ID"=actor.company_id and v."CusQuoteVersion_IsSubmitted" and v."CusQuoteVersion_SubmittedAt">=flow_started) end) into permitted;
      else
        select exists(select 1 from public."Job_Header" j join public."Admin_BookingPlaced" b on b.job_id=j."Job_ID"
          where j."Job_ID"=record_id and b.company_id=actor.company_id and not j."Job_IsDeleted" and not b.estimated and b.placed_at>=flow_started
          and lower(j."Job_Status") not in ('draft','provisional','cancelled','canceled','voided')) into permitted;
      end if;
      if not permitted then raise exception 'A completed workflow needs a confirmed workspace record.' using errcode='42501';end if;
      if exists(select 1 from public."Admin_WorkflowEvents" e where e.company_id=actor.company_id and e.user_id=actor.user_id and e.flow_id=v_flow_id and e.state='completed') then return jsonb_build_object('recorded',false);end if;
    end if;
    insert into public."Admin_WorkflowEvents" values(event_id,actor.company_id,actor.user_id,v_flow_id,p_event->>'flow',p_event->>'state',p_event->>'step',record_id,now()) on conflict do nothing;
  else raise exception 'Choose a supported usage event.' using errcode='22023';end if;
  return jsonb_build_object('recorded',true);
end $$;
revoke all on function public.multideck_admin_record_usage(jsonb) from public,anon;
grant execute on function public.multideck_admin_record_usage(jsonb) to authenticated;

-- The same complete ISO country set used by address entry; country names never come from free text.
create function private.multideck_admin_country(p_location text) returns text
language sql immutable set search_path=pg_catalog as $$
  select case when p_location ~ '^[A-Z]{2}[A-Z0-9]{3}$'
    and left(p_location,2)=any(string_to_array('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW',' ')) then left(p_location,2) end;
$$;
revoke all on function private.multideck_admin_country(text) from public,anon,authenticated;

create function public.multideck_admin_dashboard(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare actor record; result jsonb; can_crm boolean; can_customers boolean; can_quotes boolean; can_bookings boolean; can_documents boolean; can_finance boolean;
begin
  select * into actor from private.multideck_admin_actor(true);
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 or p_to>current_date then raise exception 'Choose a valid reporting period.' using errcode='22023';end if;
  can_crm:=public._multideck_crm_has_permission(actor.user_id,'CRM.Read');
  can_customers:=public._multideck_crm_has_permission(actor.user_id,'Customers.Read');
  can_quotes:=public._multideck_crm_has_permission(actor.user_id,'Quotes.Read');
  can_bookings:=public._multideck_crm_has_permission(actor.user_id,'Bookings.Read');
  can_documents:=public._multideck_crm_has_permission(actor.user_id,'Documents.Read');
  can_finance:=public._multideck_crm_has_permission(actor.user_id,'Finance.Reporting.View');
  with jobs as materialized (
    select j.*,b.placed_at,b.estimated,private.multideck_admin_country(j."Job_DestinationUNLocode") country,lower(coalesce(nullif(j."Job_TransportModeSummary",''),'unassigned')) mode
    from public."Job_Header" j join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    join public."Admin_BookingPlaced" b on b.job_id=j."Job_ID" and b.company_id=actor.company_id
    where can_bookings and o."Company_ID"=actor.company_id and not j."Job_IsDeleted" and lower(j."Job_Status") not in ('draft','provisional','cancelled','canceled','voided')
      and not exists(select 1 from public."CRM_AccountProfiles" f where f."CRMAccount_OrgID"=j."Job_Customer" and lower(f."CRMAccount_MetadataJSON"->>'developmentFixture')='true')
  ), accounts as materialized (
    select p."CRMAccount_OrgID" id,p."CRMAccount_CreatedAt" created_at,o."Org_Name" name
    from public."CRM_AccountProfiles" p join public."Org_Master" o on o."Org_id"=p."CRMAccount_OrgID"
    where can_customers and p."CRMAccount_CompanyID"=actor.company_id and not p."CRMAccount_IsDeleted" and coalesce(lower(p."CRMAccount_MetadataJSON"->>'developmentFixture'),'false')<>'true'
      and exists(select 1 from public."Org_Master_Type" l join public."Org_Types" t on t."OrgType_ID"=l."OrgType_ID" where l."Org_ID"=p."CRMAccount_OrgID" and lower(t."OrgType_Name")='customer')
  ), leads as materialized (
    select l.* from public."CRM_Leads" l join public."cmp_Offices" o on o."Office_ID"=l."CRMLead_OrgOfficeID"
    where can_crm and o."Company_ID"=actor.company_id and not l."CRMLead_IsDeleted" and coalesce(lower(l."CRMLead_MetadataJSON"->>'developmentFixture'),'false')<>'true'
  ), quotes as materialized (
    select q.*,v."CusQuoteVersion_SnapshotJSON" snapshot,events.outcome_at,events.sent_at,
      case when q."CusQuoteHeader_LifecycleCode"='accepted' then 'won' when q."CusQuoteHeader_LifecycleCode" in ('declined','ghosted') then 'lost' else 'pending' end outcome,
      case when q."CusQuoteHeader_LifecycleCode"='ghosted' then 'No response from customer'
        when events.reason is not null then 'Customer: ' || case events.reason when 'cost_too_high' then 'Cost too high' when 'estimated_times_too_late' then 'Estimated times too late' when 'found_cheaper_quote' then 'Found a cheaper quote' when 'research_only' then 'Research only' when 'job_no_longer_needed' then 'Job no longer needed' else 'Other or unclassified' end
        when q."CusQuoteHeader_OutcomeNotes" like 'Price too high%' then 'Price too high'
        when q."CusQuoteHeader_OutcomeNotes" like 'Chose a competitor%' then 'Chose a competitor'
        when q."CusQuoteHeader_OutcomeNotes" like 'Timing or project changed%' then 'Timing or project changed'
        when q."CusQuoteHeader_OutcomeNotes" like 'Service or routing did not fit%' then 'Service or routing did not fit'
        when q."CusQuoteHeader_OutcomeNotes" like 'No response from customer%' then 'No response from customer'
        else 'Other or unclassified' end reason
    from public."CusQuote_Header" q join public."cmp_Offices" o on o."Office_ID"=coalesce(q."CusQuoteHeader_OrgOfficeID",q."OrgOffice_ID")
    left join public."CusQuote_Versions" v on v."CusQuoteVersion_ID"=q."CusQuoteHeader_AcceptedVersionID" and v."Company_ID"=actor.company_id and v."CusQuoteHeader_ID"=q."CusQuoteHeader_ID" and v."CusQuoteVersion_IsSubmitted"
    left join lateral (
      select max(e."CusQuoteEvent_OccurredAt") filter(where e."CusQuoteEvent_TypeCode" in ('accepted','declined','ghosted','customer_accepted','customer_declined')) outcome_at,
        min(e."CusQuoteEvent_OccurredAt") filter(where e."CusQuoteEvent_TypeCode" in ('sent','issued','submitted')) sent_at,
        (array_agg(nullif(e."CusQuoteEvent_MetadataJSON"->>'declineReasonCode','') order by e."CusQuoteEvent_OccurredAt" desc) filter(where e."CusQuoteEvent_TypeCode"='customer_declined'))[1] reason
      from public."CusQuote_Events" e where e."CusQuoteHeader_ID"=q."CusQuoteHeader_ID" and e."Company_ID"=actor.company_id
    ) events on true
    where can_quotes and o."Company_ID"=actor.company_id and not q."CusQuoteHeader_IsDeleted"
      and not exists(select 1 from public."CRM_AccountProfiles" f where f."CRMAccount_OrgID"=q."CusQuoteHeader_CustomerID" and lower(f."CRMAccount_MetadataJSON"->>'developmentFixture')='true')
  ), prices as materialized (
    select q."CusQuoteHeader_ID" id,upper(q.snapshot#>>'{quote,currency}') currency,
      sum(case when coalesce(charge->>'sellLocal','') ~ '^[0-9]+(\.[0-9]+)?$' then (charge->>'sellLocal')::numeric end) amount
    from quotes q cross join lateral jsonb_array_elements(case when jsonb_typeof(q.snapshot#>'{quote,charges}')='array' then q.snapshot#>'{quote,charges}' else '[]'::jsonb end) charge
    where q.outcome='won' and (q.outcome_at at time zone 'UTC')::date between p_from and p_to
    group by q."CusQuoteHeader_ID",q.snapshot
    having bool_and(coalesce(charge->>'sellLocal','') ~ '^[0-9]+(\.[0-9]+)?$') and upper(coalesce(q.snapshot#>>'{quote,currency}','')) ~ '^[A-Z]{3}$'
  ), usage as materialized (
    select * from public."Admin_UsageDaily" where company_id=actor.company_id and day between p_from-(p_to-p_from+1) and p_to
  ), ai as materialized (
    select * from public."AI_DexterModelEgressAudit" where "AIDexterEgress_CompanyID"=actor.company_id
      and "AIDexterEgress_CreatedAt">=p_from::timestamp at time zone 'UTC' and "AIDexterEgress_CreatedAt"<(p_to+1)::timestamp at time zone 'UTC'
  ), flow_cohorts as materialized (
    select user_id,flow_id,flow,min(occurred_at) started_at,max(occurred_at) last_at,
      bool_or(state='completed') completed,bool_or(state='cancelled') cancelled,
      count(*) filter(where state='validation_failed') errors,(array_agg(step order by occurred_at desc))[1] last_step
    from public."Admin_WorkflowEvents" where company_id=actor.company_id group by user_id,flow_id,flow
  ), windows as (select 'current' label,p_from from_day,p_to to_day union all select 'previous',p_from-(p_to-p_from+1),p_from-1),
  summaries as (
    select w.label,jsonb_build_object(
      'leads',(select count(*) from leads where ("CRMLead_CreatedAt" at time zone 'UTC')::date between w.from_day and w.to_day),
      'customers',(select count(*) from accounts where (created_at at time zone 'UTC')::date between w.from_day and w.to_day),
      'bookings',(select count(*) from jobs where (placed_at at time zone 'UTC')::date between w.from_day and w.to_day),
      'repeatCustomers',(select count(distinct j."Job_Customer") from jobs j where (j.placed_at at time zone 'UTC')::date between w.from_day and w.to_day and exists(select 1 from jobs previous where previous."Job_Customer"=j."Job_Customer" and previous.placed_at<w.from_day::timestamp at time zone 'UTC')),
      'bookingCustomers',(select count(distinct "Job_Customer") from jobs where (placed_at at time zone 'UTC')::date between w.from_day and w.to_day),
      'wonQuotes',(select count(*) from quotes where outcome='won' and (outcome_at at time zone 'UTC')::date between w.from_day and w.to_day),
      'lostQuotes',(select count(*) from quotes where outcome='lost' and (outcome_at at time zone 'UTC')::date between w.from_day and w.to_day),
      'pendingQuotes',(select count(*) from quotes where outcome='pending' and (sent_at at time zone 'UTC')::date between w.from_day and w.to_day),
      'activeUsers',(select count(distinct user_id) from usage where module='_all' and active_seconds>0 and day between w.from_day and w.to_day),
      'activeSeconds',(select coalesce(sum(active_seconds),0) from usage where module='_all' and day between w.from_day and w.to_day),
      'idleSeconds',(select coalesce(sum(idle_seconds),0) from usage where module='_all' and day between w.from_day and w.to_day)) value from windows w
  )
  select jsonb_build_object(
    'generatedAt',now(),'period',jsonb_build_object('from',p_from,'to',p_to,'timeZone','UTC'),
    'permissions',jsonb_build_object('crm',can_crm,'customers',can_customers,'quotes',can_quotes,'bookings',can_bookings,'documents',can_documents,'finance',can_finance),
    'summary',(select value from summaries where label='current'),'previous',(select value from summaries where label='previous'),
    'coverage',jsonb_build_object('trackingStartedAt',(select tracking_started_at from public."Admin_AnalyticsConfig" where company_id=actor.company_id),
      'estimatedBookingDates',(select count(*) from jobs where estimated and (placed_at at time zone 'UTC')::date between p_from and p_to),
      'undatedQuoteOutcomes',(select count(*) from quotes where outcome<>'pending' and outcome_at is null),
      'usageRetainedFrom',((now() at time zone 'UTC')::date-interval '13 months')::date,
      'previousUsageComplete',coalesce((select tracking_started_at::date<=p_from-(p_to-p_from+1) from public."Admin_AnalyticsConfig" where company_id=actor.company_id),false) and p_from-(p_to-p_from+1)>=((now() at time zone 'UTC')::date-interval '13 months')::date,
      'unpricedWins',(select count(*) from quotes where outcome='won' and (outcome_at at time zone 'UTC')::date between p_from and p_to)-(select count(*) from prices)),
    'customers',coalesce((select jsonb_agg(row order by total desc,name) from (
      select jsonb_build_object('id',j."Job_Customer",'name',o."Org_Name",'bookings',count(*),'route','/crm/accounts/'||j."Job_Customer") row,count(*) total,o."Org_Name" name
      from jobs j join public."Org_Master" o on o."Org_id"=j."Job_Customer"
      where can_customers and (j.placed_at at time zone 'UTC')::date between p_from and p_to group by j."Job_Customer",o."Org_Name" order by count(*) desc,o."Org_Name" limit 8) rows),'[]'::jsonb),
    'modes',coalesce((select jsonb_agg(jsonb_build_object('key',mode,'count',total) order by total desc) from (select mode,count(*) total from jobs where (placed_at at time zone 'UTC')::date between p_from and p_to group by mode) rows),'[]'::jsonb),
    'countries',coalesce((select jsonb_agg(jsonb_build_object('code',code,'count',total) order by total desc) from (select country code,count(*) total from jobs where (placed_at at time zone 'UTC')::date between p_from and p_to group by country) rows),'[]'::jsonb),
    'prices',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'average',round(average,2),'median',round(median::numeric,2),'sample',sample) order by sample desc,currency) from (select currency,avg(amount) average,percentile_cont(0.5) within group(order by amount) median,count(*) sample from prices group by currency) rows),'[]'::jsonb),
    'lossReasons',coalesce((select jsonb_agg(jsonb_build_object('label',reason,'count',total) order by total desc) from (select reason,count(*) total from quotes where outcome='lost' and (outcome_at at time zone 'UTC')::date between p_from and p_to group by reason) rows),'[]'::jsonb),
    'quoteFunnel',jsonb_build_object('sent',(select count(*) from quotes where (sent_at at time zone 'UTC')::date between p_from and p_to),
      'responded',(select count(*) from quotes where (sent_at at time zone 'UTC')::date between p_from and p_to and outcome in ('won','lost') and "CusQuoteHeader_LifecycleCode"<>'ghosted'),
      'accepted',(select count(*) from quotes where (sent_at at time zone 'UTC')::date between p_from and p_to and outcome='won'),
      'booked',(select count(*) from quotes q where (q.sent_at at time zone 'UTC')::date between p_from and p_to and q.outcome='won' and exists(select 1 from jobs j where j."Job_SourceQuoteID"=q."CusQuoteHeader_ID"))),
    'leadFunnel',jsonb_build_object('created',(select count(*) from leads where ("CRMLead_CreatedAt" at time zone 'UTC')::date between p_from and p_to),
      'responded',(select count(*) from leads where ("CRMLead_CreatedAt" at time zone 'UTC')::date between p_from and p_to and "CRMLead_FirstRespondedAt" is not null),
      'converted',(select count(*) from leads where ("CRMLead_CreatedAt" at time zone 'UTC')::date between p_from and p_to and "CRMLead_StatusCode"='converted'),
      'responseHours',(select round(avg(extract(epoch from "CRMLead_FirstRespondedAt"-"CRMLead_CreatedAt")/3600),1) from leads where ("CRMLead_CreatedAt" at time zone 'UTC')::date between p_from and p_to and "CRMLead_FirstRespondedAt">="CRMLead_CreatedAt"),
      'overdueFollowUps',(select count(*) from leads where "CRMLead_NextActionDueAt"<now() and "CRMLead_StatusCode" not in ('converted','disqualified','closed'))),
    'workflows',coalesce((select jsonb_agg(jsonb_build_object('flow',flow,'started',started,'completed',completed,'cancelled',cancelled,'unfinished',unfinished,'pending',pending,'errors',errors)) from (
      select flow,count(*) started,count(*) filter(where completed) completed,count(*) filter(where not completed and cancelled) cancelled,
        count(*) filter(where not completed and not cancelled and last_at<now()-interval '24 hours') unfinished,
        count(*) filter(where not completed and not cancelled and last_at>=now()-interval '24 hours') pending,coalesce(sum(errors),0) errors
      from flow_cohorts where (started_at at time zone 'UTC')::date between p_from and p_to group by flow
      union all select flow,sum(started),sum(completed),sum(cancelled),sum(unfinished),0,sum(errors) from public."Admin_WorkflowDaily" where company_id=actor.company_id and day between p_from and p_to group by flow) rows),'[]'::jsonb),
    'workflowSteps',coalesce((select jsonb_agg(jsonb_build_object('flow',flow,'step',last_step,'count',total) order by total desc) from (select flow,last_step,count(*) total from flow_cohorts where not completed and not cancelled and last_at<now()-interval '24 hours' and (started_at at time zone 'UTC')::date between p_from and p_to group by flow,last_step) rows),'[]'::jsonb),
    'users',coalesce((select jsonb_agg(row order by active desc,name) from (
      select jsonb_build_object('id',u."User_ID",'name',coalesce(nullif(concat_ws(' ',u."User_Firstname",u."User_Lastname"),''),'Workspace user'),
        'activeSeconds',coalesce(t.active,0),'idleSeconds',coalesce(t.idle,0),'days',coalesce(t.days,0),'aiRequests',coalesce(a.requests,0),'aiTokens',coalesce(a.tokens,0),'aiCost',coalesce(a.cost,0),'enabled',u."User_AccessStatus"='active') row,
        coalesce(t.active,0) active,concat_ws(' ',u."User_Firstname",u."User_Lastname") name
      from public."cmp_Users" u left join lateral(select sum(active_seconds) active,sum(idle_seconds) idle,count(*) filter(where active_seconds>0) days from usage where user_id=u."User_ID" and module='_all' and day between p_from and p_to) t on true
      left join lateral(select count(*) requests,sum("AIDexterEgress_InputUnits"+"AIDexterEgress_OutputUnits") filter(where "AIDexterEgress_Provider"='openai') tokens,sum(coalesce("AIDexterEgress_ActualCostGBP","AIDexterEgress_EstimatedCostGBP")) cost from ai where "AIDexterEgress_UserID"=u."User_ID" and "AIDexterEgress_Outcome"='succeeded') a on true
      where u."Company_ID"=actor.company_id and (coalesce(t.active,0)+coalesce(t.idle,0)>0 or coalesce(a.requests,0)>0) order by coalesce(t.active,0) desc limit 100) rows),'[]'::jsonb),
    'modules',coalesce((select jsonb_agg(jsonb_build_object('key',module,'activeSeconds',active,'idleSeconds',idle,'users',users) order by active desc) from (select module,sum(active_seconds) active,sum(idle_seconds) idle,count(distinct user_id) users from usage where module<>'_all' and day between p_from and p_to group by module) rows),'[]'::jsonb),
    'ai',jsonb_build_object('requests',(select count(*) from ai where "AIDexterEgress_Outcome"='succeeded'),'failed',(select count(*) from ai where "AIDexterEgress_Outcome"='failed'),
      'tokens',(select coalesce(sum("AIDexterEgress_InputUnits"+"AIDexterEgress_OutputUnits"),0) from ai where "AIDexterEgress_Provider"='openai' and "AIDexterEgress_Outcome"='succeeded'),
      'cost',(select coalesce(sum(coalesce("AIDexterEgress_ActualCostGBP","AIDexterEgress_EstimatedCostGBP")),0) from ai where "AIDexterEgress_Outcome"='succeeded'),
      'purposes',coalesce((select jsonb_agg(jsonb_build_object('key',"AIDexterEgress_Purpose",'count',total) order by total desc) from (select "AIDexterEgress_Purpose",count(*) total from ai where "AIDexterEgress_Outcome"='succeeded' group by "AIDexterEgress_Purpose") rows),'[]'::jsonb)),
    'system',jsonb_build_object(
      'failedDocuments',(select count(*) from public."DOCB_RenderJobs" r join public."cmp_Users" u on u."User_ID"=r."DOCBRJ_CreatedBy" where can_documents and u."Company_ID"=actor.company_id and r."DOCBRJ_StatusCode"='failed' and (r."DOCBRJ_CreatedAt" at time zone 'UTC')::date between p_from and p_to),
      'blockedAccounting',(select count(*) from public."FIN_IntegrationQueue" q join public."FIN_Documents" d on d."FINDoc_ID"=q."FINIntQ_DocumentID" join public."cmp_LegalEntities" e on e."LegalEntity_ID"=d."FINDoc_LegalEntityID" where can_finance and e."Company_ID"=actor.company_id and q."FINIntQ_StatusCode" in ('failed','blocked','mapping_required')),
      'unmappedDestinations',(select count(*) from jobs where (placed_at at time zone 'UTC')::date between p_from and p_to and country is null)),
    'trend',coalesce((select jsonb_agg(jsonb_build_object('day',day,'leads',(select count(*) from leads where ("CRMLead_CreatedAt" at time zone 'UTC')::date=day),
      'customers',(select count(*) from accounts where (created_at at time zone 'UTC')::date=day),'bookings',(select count(*) from jobs where (placed_at at time zone 'UTC')::date=day),
      'won',(select count(*) from quotes where outcome='won' and (outcome_at at time zone 'UTC')::date=day),'lost',(select count(*) from quotes where outcome='lost' and (outcome_at at time zone 'UTC')::date=day),
      'activeSeconds',(select coalesce(sum(active_seconds),0) from usage where module='_all' and usage.day=days.day),'idleSeconds',(select coalesce(sum(idle_seconds),0) from usage where module='_all' and usage.day=days.day),
      'aiRequests',(select count(*) from ai where "AIDexterEgress_Outcome"='succeeded' and ("AIDexterEgress_CreatedAt" at time zone 'UTC')::date=day),
      'modes',(select coalesce(jsonb_object_agg(mode,total),'{}'::jsonb) from (select mode,count(*) total from jobs where (placed_at at time zone 'UTC')::date=day group by mode) counts)) order by day)
      from (select generate_series(p_from,p_to,interval '1 day')::date as day) days),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.multideck_admin_dashboard(date,date) from public,anon;
grant execute on function public.multideck_admin_dashboard(date,date) to authenticated,service_role;

-- Time estimates and employee workflow trails remain an explicit Admin-only
-- exception to Dexter chat and Watching for you. Commercial source records and
-- their existing deterministic watches stay available through their own domains.
comment on function public.multideck_admin_dashboard(date,date) is 'Admin-only measured analytics. Dexter must not infer employee active/idle time or abandonment; those capabilities are unsupported outside Admin.';

create function public.multideck_admin_usage_maintenance() returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public."Admin_WorkflowDaily"(company_id,day,flow,started,completed,cancelled,unfinished,errors)
  select company_id,(started_at at time zone 'UTC')::date,flow,count(*),count(*) filter(where completed),count(*) filter(where not completed and cancelled),count(*) filter(where not completed and not cancelled),sum(errors)
  from (select company_id,user_id,flow_id,flow,min(occurred_at) started_at,max(occurred_at) last_at,bool_or(state='completed') completed,bool_or(state='cancelled') cancelled,count(*) filter(where state='validation_failed') errors
    from public."Admin_WorkflowEvents" group by company_id,user_id,flow_id,flow) f where started_at<now()-interval '90 days'
  group by company_id,(started_at at time zone 'UTC')::date,flow
  on conflict(company_id,day,flow) do update set started="Admin_WorkflowDaily".started+excluded.started,completed="Admin_WorkflowDaily".completed+excluded.completed,cancelled="Admin_WorkflowDaily".cancelled+excluded.cancelled,unfinished="Admin_WorkflowDaily".unfinished+excluded.unfinished,errors="Admin_WorkflowDaily".errors+excluded.errors;
  delete from public."Admin_WorkflowEvents" e where exists(select 1 from public."Admin_WorkflowEvents" first_event where first_event.company_id=e.company_id and first_event.user_id=e.user_id and first_event.flow_id=e.flow_id and first_event.occurred_at<now()-interval '90 days');
  delete from public."Admin_UsageEvents" where recorded_at<now()-interval '90 days';
  update public."Admin_UsageDaily" set active_ranges='{}',idle_ranges='{}' where day<(now() at time zone 'UTC')::date-90 and (active_ranges<>'{}'::tstzmultirange or idle_ranges<>'{}'::tstzmultirange);
  delete from public."Admin_UsageDaily" where day<(now() at time zone 'UTC')::date-interval '13 months';
  delete from public."Admin_WorkflowDaily" where day<(now() at time zone 'UTC')::date-interval '13 months';
end $$;
revoke all on function public.multideck_admin_usage_maintenance() from public,anon,authenticated;
grant execute on function public.multideck_admin_usage_maintenance() to service_role;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('multideck-admin-usage-retention','15 3 * * *','select public.multideck_admin_usage_maintenance()');
  end if;
end $$;
commit;
