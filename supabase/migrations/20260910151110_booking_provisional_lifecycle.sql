begin;
set local lock_timeout='5s';

-- Keep canonical identifiers and status codes used by existing integrations.
-- Source: Lee Wright, 10 September 2026, Slack p1789044065119459.
create function booking_api.lifecycle_label(status text) returns text
language sql immutable set search_path='' as $$
 select case lower(btrim(status))
 when 'draft' then 'Provisional' when 'provisional' then 'Provisional'
 when 'complete' then 'Complete' when 'completed' then 'Complete' when 'closed' then 'Complete'
 when 'open' then 'In progress' when 'booked' then 'In progress' when 'in_transit' then 'In progress'
 when 'arrived' then 'In progress' when 'delivered' then 'In progress' when 'ready_for_invoice' then 'In progress'
 when 'in_progress' then 'In progress' else status end;
$$;
revoke all on function booking_api.lifecycle_label(text) from public,anon,authenticated;
grant execute on function booking_api.lifecycle_label(text) to service_role;

insert into public."sys_JobStatuses"("JS_Code","JS_Name","JS_Description","JS_IsFinal","JS_SortOrder","JS_IsActive")
values ('draft','Provisional','Saved planning booking, excluded from job financial reporting.',false,5,true),
 ('open','In progress','Operational booking in progress.',false,10,true),
 ('complete','Complete','Operator has confirmed the booking is complete.',true,70,true)
on conflict("JS_Code") do update set "JS_Name"=excluded."JS_Name","JS_Description"=excluded."JS_Description","JS_IsActive"=true;

-- All mutation paths, including Dexter, use the same transition validation.
-- Validate transitions, not ordinary edits to historical incomplete jobs.
create function booking_api.guard_lifecycle_transition() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous text; target text;
begin
 if new."Job_Status" is not distinct from old."Job_Status" then return new;end if;
 previous:=booking_api.lifecycle_label(old."Job_Status");target:=booking_api.lifecycle_label(new."Job_Status");
 if previous in ('cancelled','archived') and target in ('Provisional','In progress','Complete') then
  raise exception 'Cancelled or archived bookings cannot be reopened through the status selector.' using errcode='22023';end if;
 if previous='Provisional' and target='Complete' then
  raise exception 'Move the booking to In progress before marking it Complete.' using errcode='22023';end if;
 if target='In progress' and previous is distinct from target then
  if new."Job_Customer" is null then raise exception 'Choose a customer in Details before moving to In progress.' using errcode='22023';end if;
  if nullif(btrim(new."Job_TransportModeSummary"),'') is null then raise exception 'Choose a transport mode in Details before moving to In progress.' using errcode='22023';end if;
  if nullif(btrim(coalesce(new."Job_OriginUNLocode",new."Job_OriginNameSnapshot")),'') is null or
     nullif(btrim(coalesce(new."Job_DestinationUNLocode",new."Job_DestinationNameSnapshot")),'') is null then
   raise exception 'Add the origin and destination in Details before moving to In progress.' using errcode='22023';end if;
 end if;
 if target='Provisional' and previous is distinct from target then
  if previous='Complete' then raise exception 'Reopen the booking as In progress before changing its planning status.' using errcode='22023';end if;
  if exists(select 1 from public."FIN_Documents" d where d."FINDoc_PostingStatusCode"='posted' and
      (d."FINDoc_SourceJobID"=new."Job_ID" or exists(select 1 from public."FIN_DocumentLineJobLinks" l where l."FINDocLineJob_DocumentID"=d."FINDoc_ID" and l."FINDocLineJob_JobID"=new."Job_ID")))
    or exists(select 1 from public."FIN_WIPItems" w where w."FINWIP_JobID"=new."Job_ID")
    or exists(select 1 from public."FIN_Accruals" a where a."FINAccrual_JobID"=new."Job_ID") then
   raise exception 'This booking has finance activity. Financial records require an In progress or Complete booking.' using errcode='22023';end if;
 end if;
 if target='Complete' and previous is distinct from target then new."Job_ClosedDate":=coalesce(new."Job_ClosedDate",current_date);
 elsif previous='Complete' and target='In progress' then new."Job_ClosedDate":=null;end if;
 return new;
end $$;
create trigger booking_lifecycle_guard before update of "Job_Status" on public."Job_Header"
for each row execute function booking_api.guard_lifecycle_transition();
revoke all on function booking_api.guard_lifecycle_transition() from public,anon,authenticated,service_role;

create function booking_api.audit_lifecycle_transition() returns trigger
language plpgsql security definer set search_path='' as $$
declare company uuid;
begin
 if new."Job_Status" is not distinct from old."Job_Status" then return new;end if;
 select "Company_ID" into company from public."cmp_Offices" where "Office_ID"=coalesce(new."Job_OrgOfficeID",new."Job_OfficeID");
 insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
 values(company,new."Job_ID",'lifecycle_changed',booking_api.lifecycle_label(old."Job_Status")||' → '||booking_api.lifecycle_label(new."Job_Status"),
 jsonb_build_object('fromStatus',old."Job_Status",'toStatus',new."Job_Status",'fromLifecycle',booking_api.lifecycle_label(old."Job_Status"),'toLifecycle',booking_api.lifecycle_label(new."Job_Status")),new."Job_UpdatedBy");
 return new;
end $$;
create trigger booking_lifecycle_audit after update of "Job_Status" on public."Job_Header"
for each row execute function booking_api.audit_lifecycle_transition();
revoke all on function booking_api.audit_lifecycle_transition() from public,anon,authenticated,service_role;

-- A versioned capability prevents a new client enabling writes against an
-- older tenant backend before its reviewed migration has been applied.
alter function booking_api.workspace_with_document_groups(uuid,text) rename to workspace_before_lifecycle_20260910;
create function booking_api.workspace_with_document_groups(caller_auth_user_id uuid,requested_reference text)
returns jsonb language sql security definer set search_path='' as $$
 select booking_api.workspace_before_lifecycle_20260910(caller_auth_user_id,requested_reference) || '{"lifecycleSupported":false}'::jsonb;
$$;
revoke all on function booking_api.workspace_with_document_groups(uuid,text) from public,anon,authenticated;
grant execute on function booking_api.workspace_with_document_groups(uuid,text) to service_role;

-- Reject stale browser saves before any of the existing aggregate stages run.
alter function public.booking_workflow_save(uuid,uuid,jsonb) rename to booking_workflow_save_before_lifecycle_20260910;
create function public.booking_workflow_save(caller_auth_user_id uuid,requested_job_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved_timestamp timestamptz;
begin
 if not booking_api.has_permission(caller_auth_user_id,'Bookings.Write') then raise exception 'Booking changes are not authorised.' using errcode='42501';end if;
 select j."Job_UpdatedAt" into saved_timestamp from public."Job_Header" j
 join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
 join public."cmp_Users" u on u."Company_ID"=o."Company_ID" and u."Auth_User_ID"=caller_auth_user_id and u."User_AccessStatus"='active'
 where j."Job_ID"=requested_job_id and not j."Job_IsDeleted" for update of j;
 if not found then raise exception 'That booking is outside this workspace.' using errcode='42501';end if;
 if payload ? 'expectedUpdatedAt' and ((payload->>'expectedUpdatedAt')::timestamptz is distinct from saved_timestamp) then
  raise exception 'Booking changed. Reload before saving.' using errcode='40001';end if;
 return public.booking_workflow_save_before_lifecycle_20260910(caller_auth_user_id,requested_job_id,payload);
end $$;
revoke all on function public.booking_workflow_save(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.booking_workflow_save(uuid,uuid,jsonb) to service_role;

-- Preserve the current view columns and security-invoker setting; append the
-- canonical status as evidence without replacing carrier tracking health.
do $$declare definition text;begin
 definition:=pg_get_viewdef('public."App_Live_Bookings"'::regclass,true);
 definition:=regexp_replace(definition,';\s*$','');
 execute 'create or replace view public."App_Live_Bookings" with (security_invoker=true) as select prior.*, j."Job_Status"::text as "Lifecycle_Status" from ('||definition||') prior join public."Job_Header" j on j."Job_ID"=prior."Job_ID"';
end $$;

-- The register lists explicit columns; carry lifecycle through server paging,
-- search and sorting as well as through individual record reads.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.multideck_booking_register_page(text,text,text,text,text,text,jsonb,text,text,integer,integer)'::regprocedure);
 if position('booking."Job_ID",' in definition)=0 then raise exception 'Booking register projection changed; review lifecycle migration.';end if;
 definition:=replace(definition,'booking."Job_ID",','booking."Job_ID", booking."Lifecycle_Status",');
 definition:=replace(definition,'booking."Custom_Fields"::text','booking."Custom_Fields"::text, case when booking."Lifecycle_Status" in (''draft'',''provisional'') then ''Provisional'' when booking."Lifecycle_Status" in (''complete'',''completed'') then ''Complete'' when booking."Lifecycle_Status" in (''cancelled'',''archived'') then booking."Lifecycle_Status" else ''In progress'' end');
 definition:=replace(definition,'''status'', ''booking''','''status'', ''trackingStatus'', ''booking''');
 definition:=replace(definition,'when ''status'' then lower(concat_ws('' '', "Status", exception_summary))','when ''trackingStatus'' then lower("Status") when ''status'' then lower(case when "Lifecycle_Status" in (''draft'',''provisional'') then ''Provisional'' when "Lifecycle_Status" in (''complete'',''completed'',''closed'') then ''Complete'' when "Lifecycle_Status" in (''open'',''booked'',''in_transit'',''arrived'',''delivered'',''ready_for_invoice'',''in_progress'') then ''In progress'' else "Lifecycle_Status" end)');
 execute definition;
end $$;

-- Job-level summaries exclude provisional records; posted ledger/document
-- reporting is preserved; the next migration prevents provisional finance capture.
do $$declare item record; definition text;begin
 for item in select * from (values ('FIN_JobFinanceSummary','Job_ID'),('FIN_JobChargeFinanceSummary','FINChargeState_JobID')) as v(view_name,job_column) loop
  definition:=regexp_replace(pg_get_viewdef(format('public.%I',item.view_name)::regclass,true),';\s*$','');
  execute format('create or replace view public.%I with (security_invoker=true) as select prior.* from (%s) prior join public."Job_Header" j on j."Job_ID"=prior.%I where lower(j."Job_Status") not in (''draft'',''provisional'')',item.view_name,definition,item.job_column);
 end loop;
end $$;

-- Existing booking reads expose jobStatus and existing deterministic watches
-- observe Job_Status changes. Keep the legacy codes explicit for chat rules.
update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description"="AIDexterDomain_Description"||' Booking lifecycle: draft means Provisional; open/booked/in_transit/arrived/delivered/ready_for_invoice mean In progress; complete/completed mean Complete. Cancelled and archived remain distinct. Provisional jobs are excluded from job financial summaries. Financial records require progression to In progress.' where "AIDexterDomain_Code" in ('bookings','booking_summary');
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Description"="AIDexterWatchCapability_Description"||' Lifecycle watches use status codes: draft (Provisional), open (In progress), complete (Complete). Carrier tracking remains separate.' where "AIDexterWatchCapability_Code"='bookings';
commit;
