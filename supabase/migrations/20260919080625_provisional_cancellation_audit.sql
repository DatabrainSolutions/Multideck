-- Unapplied local feature, sequenced after the 15 September freight-domain fix.
-- Preserve that function body and add only the discarded-charge safeguard.
begin;
set local lock_timeout = '5s';

-- Private state is not a browser/Dexter write surface. Original Quote evidence
-- is never rewritten; charge decisions govern only future Booking transfer.
create table booking_api.provisional_cancellations (
 job_id uuid primary key references public."Job_Header"("Job_ID") on delete restrict,
 decision text check (decision in ('keep','discard')),
 planning_charges jsonb not null default '[]' check (jsonb_typeof(planning_charges)='array'),
 review_required boolean not null default false,
 transition_tx bigint,
 transition_status text
);
alter table booking_api.provisional_cancellations enable row level security;
revoke all on booking_api.provisional_cancellations from public,anon,authenticated,service_role;

create table booking_api.provisional_cancellation_history (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public."Job_Header"("Job_ID") on delete restrict,
 actor_user_id uuid not null,
 occurred_at timestamptz not null default clock_timestamp(),
 action text not null check (action in ('cancel','reopen')),
 reason text not null check (length(btrim(reason))>0),
 decision text check (decision in ('keep','discard')),
 snapshot jsonb not null
);
alter table booking_api.provisional_cancellation_history enable row level security;
revoke all on booking_api.provisional_cancellation_history from public,anon,authenticated,service_role;
create index on booking_api.provisional_cancellation_history(job_id,occurred_at);
create function booking_api.protect_provisional_history() returns trigger
language plpgsql set search_path='' as $$begin
 raise exception 'Provisional cancellation history is append-only.' using errcode='22023';
end $$;
create trigger provisional_history_immutable before update or delete on booking_api.provisional_cancellation_history
for each row execute function booking_api.protect_provisional_history();
revoke all on function booking_api.protect_provisional_history() from public,anon,authenticated,service_role;
alter table public."Job_Header" add column "Job_ProvisionalCancelled" boolean not null default false;

create function booking_api.guard_cancelled_provisional() returns trigger
language plpgsql security definer set search_path='' as $$
declare allowed boolean;
begin
 if tg_op='DELETE' then
  if exists(select 1 from booking_api.provisional_cancellations where job_id=old."Job_ID") then
   raise exception 'Retain this Booking and reference for audit.' using errcode='22023';
  end if;
  return old;
 end if;
 select exists(select 1 from booking_api.provisional_cancellations
  where job_id=old."Job_ID" and transition_tx=txid_current() and transition_status=new."Job_Status") into allowed;
 if not allowed and (old."Job_ProvisionalCancelled" or
   new."Job_ProvisionalCancelled" is distinct from old."Job_ProvisionalCancelled" or
   (lower(old."Job_Status") in ('draft','provisional') and lower(new."Job_Status")='cancelled')) then
  raise exception 'Use the reviewed Provisional cancellation or reopening action.' using errcode='22023';
 end if;
 if exists(select 1 from booking_api.provisional_cancellations where job_id=old."Job_ID") and
  (new."Job_IsDeleted" or new."Job_Number" is distinct from old."Job_Number"
   or to_jsonb(new)->'Job_BookingReference' is distinct from to_jsonb(old)->'Job_BookingReference') then
  raise exception 'Retain this Booking and reference for audit.' using errcode='22023';
 end if;
 return new;
end $$;
create trigger provisional_cancellation_guard before update or delete on public."Job_Header"
for each row execute function booking_api.guard_cancelled_provisional();

-- Normal Booking detail writes must not alter a retained cancelled record.
-- Limit attachment to the operator-owned detail tables, not Customs/tracking.
create function booking_api.guard_cancelled_provisional_detail() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous_job uuid;next_job uuid;job_id uuid;cancelled boolean;parent_row record;
 parent_ids uuid[];job_ids uuid[];
begin
 if tg_op<>'INSERT' then previous_job:=nullif(to_jsonb(old)->>tg_argv[0],'')::uuid;end if;
 if tg_op<>'DELETE' then next_job:=nullif(to_jsonb(new)->>tg_argv[0],'')::uuid;end if;
 job_ids:=array[previous_job,next_job];
 -- Indirect cargo/route detail: resolve and lock both old and new parents so
 -- moving a child cannot evade the lock on its original cancelled Booking.
 if tg_nargs=5 then
  parent_ids:=job_ids;job_ids:='{}'::uuid[];
  for parent_row in execute format('select %I as job_id from %I.%I where %I=any($1) order by %I for share',
   tg_argv[4],tg_argv[1],tg_argv[2],tg_argv[3],tg_argv[3]) using parent_ids loop
   job_ids:=array_append(job_ids,parent_row.job_id);
  end loop;
 end if;
 for job_id in select distinct id from unnest(job_ids) id where id is not null order by id loop
  select "Job_ProvisionalCancelled" into cancelled from public."Job_Header" where "Job_ID"=job_id for update;
  if cancelled then raise exception 'Reopen the cancelled Booking before editing its details.' using errcode='22023';end if;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
do $$declare item record;begin
 for item in select n.nspname,c.relname,a.attname from pg_catalog.pg_constraint fk
 join pg_catalog.pg_class c on c.oid=fk.conrelid
 join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum=fk.conkey[1]
 where fk.contype='f' and fk.confrelid='public."Job_Header"'::regclass and cardinality(fk.conkey)=1
 and ((n.nspname='public' and c.relname in ('Job_Cargo','Job_Containers','Job_Routing','Job_Parties','Job_References','Job_Locations','Job_Documents'))
  or (n.nspname='booking_api' and c.relname='cargo_equipment_allocations')) loop
  execute format('create trigger provisional_cancelled_details before insert or update or delete on %I.%I for each row execute function booking_api.guard_cancelled_provisional_detail(%L)',item.nspname,item.relname,item.attname);
 end loop;
 for item in
  select child_ns.nspname,child.relname,child_key.attname,parent_ns.nspname as parent_schema,
   parent.relname as parent_table,parent_key.attname as parent_key,job_key.attname as job_key
  from pg_catalog.pg_constraint fk
  join pg_catalog.pg_class child on child.oid=fk.conrelid
  join pg_catalog.pg_namespace child_ns on child_ns.oid=child.relnamespace
  join pg_catalog.pg_attribute child_key on child_key.attrelid=child.oid and child_key.attnum=fk.conkey[1]
  join pg_catalog.pg_class parent on parent.oid=fk.confrelid
  join pg_catalog.pg_namespace parent_ns on parent_ns.oid=parent.relnamespace
  join pg_catalog.pg_attribute parent_key on parent_key.attrelid=parent.oid and parent_key.attnum=fk.confkey[1]
  join pg_catalog.pg_constraint job_fk on job_fk.conrelid=parent.oid and job_fk.contype='f'
   and job_fk.confrelid='public."Job_Header"'::regclass and cardinality(job_fk.conkey)=1
  join pg_catalog.pg_attribute job_key on job_key.attrelid=parent.oid and job_key.attnum=job_fk.conkey[1]
  where fk.contype='f' and cardinality(fk.conkey)=1 and parent_ns.nspname='public'
   and parent.relname in ('Job_Cargo','Job_Containers','Job_Routing')
   and ((child_ns.nspname='public' and child.relname in ('Job_CargoDimensions','Job_CargoDangerousGoods',
    'Job_ContainerSeals','Job_RouteCargo','Job_RouteContainers','Job_RouteMilestones','Job_RouteParties'))
    or (child_ns.nspname='booking_api' and child.relname='cargo_security_evidence')) loop
  execute format('create trigger %I before insert or update or delete on %I.%I for each row execute function booking_api.guard_cancelled_provisional_detail(%L,%L,%L,%L,%L)',
   'provisional_cancelled_'||item.attname,item.nspname,item.relname,item.attname,
   item.parent_schema,item.parent_table,item.parent_key,item.job_key);
 end loop;
end $$;
revoke all on function booking_api.guard_cancelled_provisional_detail() from public,anon,authenticated,service_role;

-- Narrow, fail-closed amendment; retain all existing progression validation.
do $$declare definition text;anchor text:='if previous in (''cancelled'',''archived'') and target in (''Provisional'',''In progress'',''Complete'') then';begin
 definition:=pg_get_functiondef('booking_api.guard_lifecycle_transition()'::regprocedure);
 if position(anchor in definition)=0 then raise exception 'Lifecycle guard changed; review cancellation migration.';end if;
 execute replace(definition,anchor,'if previous in (''cancelled'',''archived'') and target in (''Provisional'',''In progress'',''Complete'') and not (previous=''cancelled'' and target=''Provisional'' and exists(select 1 from booking_api.provisional_cancellations where job_id=new."Job_ID" and transition_tx=txid_current() and transition_status=''draft'')) then');
 definition:=pg_get_functiondef('booking_api.require_financial_booking(uuid)'::regprocedure);
 anchor:='if lower(status) in (''draft'',''provisional'') then';
 if position(anchor in definition)=0 then raise exception 'Finance guard changed; review cancellation migration.';end if;
 execute replace(definition,anchor,'if lower(status) in (''draft'',''provisional'') or exists(select 1 from public."Job_Header" where "Job_ID"=job_id and "Job_ProvisionalCancelled") then');
 definition:=pg_get_functiondef('booking_api.release_provisional_quote_charges()'::regprocedure);
 anchor:='payload:=coalesce(new."Job_SourceSnapshotJSON"#>''{acceptedSnapshot,quote}'',''{}''::jsonb);';
 if position(anchor in definition)=0 then raise exception 'Quote charge transfer changed; review cancellation migration.';end if;
 execute replace(definition,anchor,'if exists(select 1 from booking_api.provisional_cancellations pc where pc.job_id=new."Job_ID" and pc.decision=''discard'') then return new;end if; '||anchor);
end $$;

do $$declare item record;definition text;begin
 for item in select * from (values ('FIN_JobFinanceSummary','Job_ID'),('FIN_JobChargeFinanceSummary','FINChargeState_JobID')) as v(view_name,job_column) loop
  definition:=regexp_replace(pg_get_viewdef(format('public.%I',item.view_name)::regclass,true),';\s*$','');
  execute format('create or replace view public.%I with (security_invoker=true) as select prior.* from (%s) prior join public."Job_Header" j on j."Job_ID"=prior.%I where not j."Job_ProvisionalCancelled"',item.view_name,definition,item.job_column);
 end loop;
end $$;

-- Service-role only, following the existing verified-actor RPC boundary.
-- Edge must derive caller_auth_user_id from a verified token, never request JSON.
create function public.booking_provisional_action(caller_auth_user_id uuid,requested_job_id uuid,
 requested_action text,requested_reason text,expected_updated_at timestamptz,charge_decision text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public."Job_Header"%rowtype;actor uuid;company uuid;item record;has_record boolean;
 saved booking_api.provisional_cancellations%rowtype;charges jsonb;decision text;target text;history_id uuid;
begin
 if not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false) then
  raise exception 'Booking changes are not authorised.' using errcode='42501';end if;
 select j.* into job from public."Job_Header" j
 join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
 join public."cmp_Users" u on u."Company_ID"=o."Company_ID" and u."Auth_User_ID"=caller_auth_user_id and u."User_AccessStatus"='active'
 where j."Job_ID"=requested_job_id and not j."Job_IsDeleted" for update of j;
 if not found then raise exception 'That booking is outside this workspace.' using errcode='42501';end if;
 select "User_ID","Company_ID" into actor,company from public."cmp_Users" where "Auth_User_ID"=caller_auth_user_id;
 if expected_updated_at is null or expected_updated_at is distinct from job."Job_UpdatedAt" then
  raise exception 'Booking changed. Reload before continuing.' using errcode='40001';end if;
 if nullif(btrim(requested_reason),'') is null then raise exception 'Record a reason.' using errcode='22023';end if;
 if requested_action is null or requested_action not in ('cancel','reopen') then raise exception 'Unsupported provisional action.' using errcode='22023';end if;
 -- Any actual financial/costing record is not a planning charge, even if unposted.
 for item in select * from booking_api.finance_job_columns() loop
  execute format('select exists(select 1 from public.%I where %I=$1)',item.table_name,item.column_name) into has_record using requested_job_id;
  if has_record then raise exception 'Financial records require Finance review.' using errcode='22023';end if;
 end loop;
 if exists(select 1 from public."FIN_Documents" where "FINDoc_SourceTable"='Job_Header' and "FINDoc_SourceID"=requested_job_id) then
  raise exception 'Financial records require Finance review.' using errcode='22023';end if;
 select * into saved from booking_api.provisional_cancellations where job_id=requested_job_id;
 if requested_action='cancel' then
  if lower(job."Job_Status") not in ('draft','provisional') then raise exception 'Only Provisional bookings can use this cancellation action.' using errcode='22023';end if;
  charges:=case when saved.decision='discard' then '[]'::jsonb else coalesce(job."Job_SourceSnapshotJSON"#>'{acceptedSnapshot,quote,charges}','[]'::jsonb) end;
  if jsonb_typeof(charges)<>'array' then raise exception 'Planning charges need review.' using errcode='22023';end if;
  if (charge_decision is not null and charge_decision not in ('keep','discard')) or (jsonb_array_length(charges)>0 and charge_decision is null) then
   raise exception 'Choose Keep or Discard for planning charges.' using errcode='22023';end if;
  decision:=case when saved.decision='discard' then 'discard' when jsonb_array_length(charges)>0 then charge_decision else null end;
  target:='cancelled';
 else
  if job."Job_Status"<>'cancelled' or not job."Job_ProvisionalCancelled" or saved.job_id is null then
   raise exception 'Only a recorded provisional cancellation can reopen.' using errcode='22023';end if;
  if charge_decision is not null then raise exception 'Reopening cannot change the charge decision.' using errcode='22023';end if;
  charges:=saved.planning_charges;decision:=saved.decision;target:='draft';
 end if;
 insert into booking_api.provisional_cancellation_history(job_id,actor_user_id,action,reason,decision,snapshot)
 values(requested_job_id,actor,requested_action,btrim(requested_reason),decision,
  jsonb_build_object('booking',to_jsonb(job),'planningCharges',charges,'previousCancellation',to_jsonb(saved))) returning id into history_id;
 insert into booking_api.provisional_cancellations(job_id,decision,planning_charges,review_required,transition_tx,transition_status)
 values(requested_job_id,decision,charges,requested_action='reopen',txid_current(),target)
 on conflict(job_id) do update set decision=excluded.decision,planning_charges=excluded.planning_charges,
 review_required=excluded.review_required,transition_tx=excluded.transition_tx,transition_status=excluded.transition_status;
 update public."Job_Header" set "Job_Status"=target,"Job_ProvisionalCancelled"=(target='cancelled'),
  "Job_UpdatedBy"=actor,"Job_UpdatedAt"=clock_timestamp() where "Job_ID"=requested_job_id;
 update booking_api.provisional_cancellations set transition_tx=null,transition_status=null where job_id=requested_job_id;
 insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
 values(company,requested_job_id,'provisional_'||case when requested_action='cancel' then 'cancelled' else 'reopened' end,
  case when requested_action='cancel' then 'Provisional booking cancelled' else 'Booking reopened as Provisional; review prices and dates' end,
  jsonb_build_object('historyId',history_id,'reason',btrim(requested_reason),'chargeDecision',decision,'reviewPricesAndDates',requested_action='reopen'),actor);
 return jsonb_build_object('jobId',requested_job_id,'status',target,'historyId',history_id,
  'reviewPricesAndDates',requested_action='reopen','chargeDecision',decision);
end $$;
revoke all on function booking_api.guard_cancelled_provisional() from public,anon,authenticated,service_role;
revoke all on function public.booking_provisional_action(uuid,uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.booking_provisional_action(uuid,uuid,text,text,timestamptz,text) to service_role;

create function public.booking_provisional_state(caller_auth_user_id uuid,requested_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public."Job_Header"%rowtype;saved booking_api.provisional_cancellations%rowtype;
 charges jsonb;item record;has_record boolean;finance_review boolean:=false;
begin
 if not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Read'),false) then
  raise exception 'Booking access is not authorised.' using errcode='42501';end if;
 select j.* into job from public."Job_Header" j
 join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
 join public."cmp_Users" u on u."Company_ID"=o."Company_ID" and u."Auth_User_ID"=caller_auth_user_id and u."User_AccessStatus"='active'
 where j."Job_ID"=requested_job_id and not j."Job_IsDeleted";
 if not found then raise exception 'That booking is outside this workspace.' using errcode='42501';end if;
 select * into saved from booking_api.provisional_cancellations where job_id=requested_job_id;
 charges:=case when saved.decision='discard' then '[]'::jsonb else coalesce(job."Job_SourceSnapshotJSON"#>'{acceptedSnapshot,quote,charges}','[]'::jsonb) end;
 for item in select * from booking_api.finance_job_columns() loop
  execute format('select exists(select 1 from public.%I where %I=$1)',item.table_name,item.column_name) into has_record using requested_job_id;
  finance_review:=finance_review or has_record;
 end loop;
 finance_review:=finance_review or exists(select 1 from public."FIN_Documents" where "FINDoc_SourceTable"='Job_Header' and "FINDoc_SourceID"=requested_job_id);
 return jsonb_build_object('supported',true,'cancelled',job."Job_ProvisionalCancelled",
  'canReopen',job."Job_ProvisionalCancelled" and saved.job_id is not null,'chargeDecision',saved.decision,
  'planningChargeCount',case when jsonb_typeof(charges)='array' then jsonb_array_length(charges) else 0 end,
  'reviewPricesAndDates',coalesce(saved.review_required,false),'requiresFinanceReview',finance_review);
end $$;
revoke all on function public.booking_provisional_state(uuid,uuid) from public,anon,authenticated;
grant execute on function public.booking_provisional_state(uuid,uuid) to service_role;
-- Explicit unsupported exception until Dexter has an approved charge-decision
-- action. Generic update_booking is blocked by the same lifecycle guard.
update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description"="AIDexterDomain_Description"||' Provisional cancellation and reopening require the reviewed Booking screen action; Dexter cannot perform these through update_booking. Use the Booking screen to choose Keep or Discard and enter a reason. Cancelled provisional references and audit history remain retained.' where "AIDexterDomain_Code" in ('bookings','booking_summary');
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Description"="AIDexterWatchCapability_Description"||' Provisional cancellation changes status to cancelled; reopening changes it to draft. Existing deterministic status watches observe these transitions. Detailed charge-decision and price-review watches are not supported.' where "AIDexterWatchCapability_Code"='bookings';
commit;
