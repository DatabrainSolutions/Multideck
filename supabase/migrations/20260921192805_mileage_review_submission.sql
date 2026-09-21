begin;
alter table public.mileage_trips drop constraint mileage_trips_distance_source_check;
alter table public.mileage_trips add constraint mileage_trips_distance_source_check check(distance_source in ('manual','google','route'));
alter table public.mileage_trips add column evidence_ids uuid[] not null default '{}', add column submission_key uuid;
create table public.mileage_evidence (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null, company_id uuid not null,
 user_id uuid not null references public."cmp_Users"("User_ID"),
 kind text not null check(kind in ('before','after')), object_path text not null unique,
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 created_at timestamptz not null default now()
);
create index mileage_evidence_owner on public.mileage_evidence(user_id,created_at);
alter table public.mileage_evidence enable row level security;
revoke all on public.mileage_evidence from public,anon,authenticated;
grant all on public.mileage_evidence to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mileage-evidence','mileage-evidence',false,5242880,array['image/jpeg','image/png','image/webp']);
-- Files are served only through the authenticated evidence endpoint, after the claim access check.
create table mileage.provider_usage(provider text primary key, last_request timestamptz not null);
create function public.multideck_mileage_provider_slot(p_provider text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare accepted text;
begin
 insert into mileage.provider_usage values(p_provider,clock_timestamp())
 on conflict(provider) do update set last_request=excluded.last_request
 where mileage.provider_usage.last_request<clock_timestamp()-interval '1.1 seconds'
 returning provider into accepted;
 return accepted is not null;
end $$;
revoke all on function public.multideck_mileage_provider_slot(text) from public,anon,authenticated;
grant execute on function public.multideck_mileage_provider_slot(text) to service_role;

create or replace function public.multideck_mileage(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare u public."cmp_Users":=mileage.actor(); s public.mileage_settings; t public.mileage_trips; q public.mileage_route_quotes;
 v_id uuid; admin boolean:=mileage.is_admin(u."User_ID"); finance boolean; approver boolean; result jsonb; rows_json jsonb; total integer;
 target uuid; yr integer; opening numeric; desired text; actor_name text:=coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),'Workspace member');
begin
 finance:=admin or public._multideck_crm_has_permission(u."User_ID",'Finance.ReviewAndPost');
 select * into s from public.mileage_settings where company_id=u."Company_ID";
 if s.company_id is null then s.company_id:=u."Company_ID";s.approval_required:=false;s.approver_ids:='{}';s.version:=0;end if;
 approver:=admin or u."User_ID"=any(s.approver_ids);
 if p_action='confirm' then
   v_id:=(p_data->>'id')::uuid;
   perform pg_advisory_xact_lock(hashtextextended(u."User_ID"::text,0));
   select * into t from public.mileage_trips where id=v_id for update;
   if t.id is not null and t.company_id=u."Company_ID" and t.user_id=u."User_ID" and t.submission_key=nullif(p_data->>'submission_key','')::uuid and t.status in ('pending','ready','paid') then return to_jsonb(t);end if;
   if nullif(p_data->>'submission_key','') is null then raise exception 'Review the trip before submitting.';end if;
   if coalesce(s.approval_required,false) is distinct from (p_data->>'reviewed_approval')::boolean then raise exception 'Approval settings changed. Review the trip again.';end if;
   result:=public.multideck_mileage('save',p_data);
   result:=public.multideck_mileage('submit',jsonb_build_object('id',v_id,'version',result->'version'));
   if (result->>'amount')::numeric is distinct from (p_data->>'reviewed_amount')::numeric then raise exception 'Your claim amount changed. Review it again before submitting.';end if;
   update public.mileage_trips set submission_key=(p_data->>'submission_key')::uuid where id=v_id returning * into t;
   return to_jsonb(t);
 elsif p_action='evidence' then
   v_id:=(p_data->>'id')::uuid;
   select * into t from public.mileage_trips where id=v_id and company_id=u."Company_ID";
   if t.id is null or not mileage.can_read(t.company_id,t.user_id,t.status) then raise exception 'Trip not found or access denied.' using errcode='42501';end if;
   return (select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'object_path',e.object_path)),'[]') from public.mileage_evidence e where e.id=any(t.evidence_ids) and e.company_id=t.company_id and e.user_id=t.user_id and e.trip_id=t.id);
 elsif p_action='context' then
   return jsonb_build_object('userId',u."User_ID",'admin',admin,'finance',finance,'approver',approver,'settings',to_jsonb(s),
    'users',case when admin then (select coalesce(jsonb_agg(jsonb_build_object('id',"User_ID",'name',concat_ws(' ',"User_Firstname","User_Lastname")) order by "User_Firstname"),'[]') from public."cmp_Users" where "Company_ID"=u."Company_ID" and "User_AccessStatus"='active' and "Auth_User_ID" is not null) else '[]'::jsonb end,
    'openingBalances',case when admin then (select coalesce(jsonb_agg(to_jsonb(b)),'[]') from public.mileage_opening_balances b where b.company_id=u."Company_ID") else '[]'::jsonb end);
 elsif p_action='reserve_route' then
   -- Reserve before provider access, counting failures and concurrent requests too.
   insert into mileage.route_usage(user_id,day,attempts) values(u."User_ID",current_date,1)
   on conflict(user_id,day) do update set attempts=mileage.route_usage.attempts+1 where mileage.route_usage.attempts<100
   returning attempts into total;
   if total is null then raise exception 'You have reached today’s route limit. Enter your actual mileage or try again tomorrow.' using errcode='P0001';end if;
   return jsonb_build_object('reserved',true);
 elsif p_action='settings' then
   if not admin then raise exception 'Only administrators can change mileage settings.' using errcode='42501';end if;
   perform pg_advisory_xact_lock(hashtextextended(u."Company_ID"::text,0));
   select * into s from public.mileage_settings where company_id=u."Company_ID" for update;
   if coalesce(s.version,0) is distinct from (p_data->>'version')::integer then raise exception 'Settings changed. Reload before saving.' using errcode='40001';end if;
   if jsonb_typeof(p_data->'approver_ids') is distinct from 'array' or jsonb_array_length(p_data->'approver_ids')>50 then raise exception 'Choose valid approvers.';end if;
   for target in select value::uuid from jsonb_array_elements_text(p_data->'approver_ids') loop
     if not exists(select 1 from public."cmp_Users" where "User_ID"=target and "Company_ID"=u."Company_ID" and "User_AccessStatus"='active' and "Auth_User_ID" is not null) then raise exception 'Approver must be active in this workspace.';end if;
   end loop;
   if (p_data->>'approval_required')::boolean and jsonb_array_length(p_data->'approver_ids')=0 then raise exception 'Choose at least one approver before enabling approval.';end if;
   insert into public.mileage_settings(company_id,approval_required,approver_ids,electric_override_pence,version)
    values(u."Company_ID",(p_data->>'approval_required')::boolean,array(select value::uuid from jsonb_array_elements_text(p_data->'approver_ids')),nullif(p_data->>'electric_override_pence','')::numeric,1)
    on conflict(company_id) do update set approval_required=excluded.approval_required,approver_ids=excluded.approver_ids,electric_override_pence=excluded.electric_override_pence,version=mileage_settings.version+1,updated_at=now();
   insert into public.mileage_events(company_id,actor_id,actor_name,action,detail) values(u."Company_ID",u."User_ID",actor_name,'settings',p_data);
   return public.multideck_mileage('context');
 elsif p_action='opening_balance' then
   if not admin then raise exception 'Only administrators can set prior mileage.' using errcode='42501';end if;
   target:=(p_data->>'user_id')::uuid;yr:=(p_data->>'tax_year')::integer;
   perform pg_advisory_xact_lock(hashtextextended(target::text,0));
   if not exists(select 1 from public."cmp_Users" where "User_ID"=target and "Company_ID"=u."Company_ID" and "User_AccessStatus"='active') then raise exception 'Choose an active workspace employee.';end if;
   if exists(select 1 from public.mileage_trips where company_id=u."Company_ID" and user_id=target and status in ('pending','ready','paid') and trip_date>=make_date(yr,4,6) and trip_date<make_date(yr+1,4,6)) then raise exception 'Prior mileage must be set before this employee submits claims for the tax year.';end if;
   insert into public.mileage_opening_balances values(u."Company_ID",target,yr,(p_data->>'miles')::numeric)
    on conflict(company_id,user_id,tax_year) do update set miles=excluded.miles;
   insert into public.mileage_events(company_id,actor_id,actor_name,action,detail) values(u."Company_ID",u."User_ID",actor_name,'opening_balance',p_data);
   return public.multideck_mileage('context');
 elsif p_action='companies' then
   if not public._multideck_crm_has_permission(u."User_ID",'CRM.Read') then return '[]';end if;
   return (select coalesce(jsonb_agg(x),'[]') from (select o."Org_id" id,o."Org_Name" name from public."Org_Master" o
     where public.multideck_crm_company_can_access_account(u."Company_ID",o."Org_id") and o."Org_Name" ilike '%'||left(coalesce(p_data->>'search',''),100)||'%'
     order by o."Org_Name",o."Org_id" limit 30) x);
 elsif p_action='visits' then
   target:=(p_data->>'account_id')::uuid;
   if not public._multideck_crm_has_permission(u."User_ID",'CRM.Read') or not public.multideck_crm_company_can_access_account(u."Company_ID",target) then raise exception 'Company access denied.' using errcode='42501';end if;
   return (select coalesce(jsonb_agg(x),'[]') from (select id,trip_date,employee_name,purpose,mileage.can_read(company_id,user_id,status) can_open from public.mileage_trips where company_id=u."Company_ID" and account_id=target and status in ('pending','ready','paid') order by trip_date desc,id limit 10) x);
 elsif p_action='list' then
   if p_data->>'scope'='finance' and not finance then raise exception 'Finance access is required.' using errcode='42501';end if;
   if p_data->>'scope'='approvals' and not approver then raise exception 'Approver access is required.' using errcode='42501';end if;
   with filtered as (
    select claim.* from public.mileage_trips claim where claim.company_id=u."Company_ID" and mileage.can_read(claim.company_id,claim.user_id,claim.status)
     and (case p_data->>'scope' when 'finance' then claim.status in ('ready','paid') when 'approvals' then claim.status='pending' and claim.user_id<>u."User_ID" else claim.user_id=u."User_ID" end)
     and (coalesce(p_data->>'status','')='' or claim.status=p_data->>'status')
     and (nullif(p_data->>'from','') is null or claim.trip_date>=(p_data->>'from')::date)
     and (nullif(p_data->>'to','') is null or claim.trip_date<=(p_data->>'to')::date)
     and (concat_ws(' ',claim.employee_name,claim.company_name,claim.purpose,claim.origin,claim.destination) ilike '%'||left(coalesce(p_data->>'search',''),100)||'%')
   ), page as (select * from filtered order by
     case when p_data->>'sort'='trip_date' and p_data->>'direction'='asc' then trip_date end asc,
     case when p_data->>'sort'='trip_date' and p_data->>'direction'='desc' then trip_date end desc,
     case when p_data->>'sort'='employee_name' and p_data->>'direction'='asc' then employee_name end asc,
     case when p_data->>'sort'='employee_name' and p_data->>'direction'='desc' then employee_name end desc,
     case when p_data->>'sort'='distance_miles' and p_data->>'direction'='asc' then distance_miles end asc,
     case when p_data->>'sort'='distance_miles' and p_data->>'direction'='desc' then distance_miles end desc,
     case when p_data->>'sort'='amount' and p_data->>'direction'='asc' then amount end asc,
     case when p_data->>'sort'='amount' and p_data->>'direction'='desc' then amount end desc,
     trip_date desc,id limit greatest(1,least(100,coalesce((p_data->>'limit')::integer,50))) offset greatest(0,least(100000,coalesce((p_data->>'offset')::integer,0))))
   select jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(page)),'[]') from page),'total',(select count(*) from filtered)) into result;
   return result;
 elsif p_action in ('save','preview') then
   v_id:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
   select * into t from public.mileage_trips where id=v_id and company_id=u."Company_ID" for update;
   if t.id is not null then
     if t.user_id<>u."User_ID" or t.status not in ('draft','rejected') then raise exception 'Only your draft or returned trips can be edited.' using errcode='42501';end if;
     if t.version is distinct from (p_data->>'version')::integer then raise exception 'This trip changed. Reload before editing.' using errcode='40001';end if;
   else t.id:=v_id;t.user_id:=u."User_ID";t.company_id:=u."Company_ID";t.employee_name:=actor_name;t.status:='draft';t.version:=0;t.created_at:=now();end if;
   t.account_id:=nullif(p_data->>'account_id','')::uuid;
   if t.account_id is not null then
     if not public._multideck_crm_has_permission(u."User_ID",'CRM.Read') or not public.multideck_crm_company_can_access_account(u."Company_ID",t.account_id) then raise exception 'Select a company you can access.' using errcode='42501';end if;
     select "Org_Name" into t.company_name from public."Org_Master" where "Org_id"=t.account_id;
   else
     t.company_name:=nullif(btrim(p_data->>'company_name'),'');
     if coalesce(length(t.company_name),0)>200 then raise exception 'Keep the company name to 200 characters or fewer.';end if;
   end if;
   t.trip_date:=(p_data->>'trip_date')::date;
   if t.trip_date is null or t.trip_date>current_date or t.trip_date<'2020-04-06' then raise exception 'Enter a past or current trip date from 6 April 2020.';end if;
   t.purpose:=btrim(p_data->>'purpose');t.origin:=btrim(p_data->>'origin');t.destination:=btrim(p_data->>'destination');
   if coalesce(length(t.purpose),0) not between 1 and 2000 or coalesce(length(t.origin),0) not between 1 and 500 or coalesce(length(t.destination),0) not between 1 and 500 then raise exception 'Enter the start, destination and business purpose.';end if;
   t.waypoints:=coalesce(p_data->'waypoints','[]');
   if jsonb_typeof(t.waypoints)<>'array' or jsonb_array_length(t.waypoints)>20 then raise exception 'Use up to 20 intermediate stops.';end if;
   if exists(select 1 from jsonb_array_elements(t.waypoints) w where jsonb_typeof(w)<>'string' or length(btrim(w#>>'{}')) not between 1 and 500) then raise exception 'Enter a valid address for every stop.';end if;
   t.round_trip:=coalesce((p_data->>'round_trip')::boolean,false);t.vehicle_type:=p_data->>'vehicle_type';t.vehicle_name:=btrim(p_data->>'vehicle_name');t.company_car:=coalesce((p_data->>'company_car')::boolean,false);
   if coalesce(t.vehicle_type,'') not in ('car','motorcycle','bicycle') or coalesce(length(t.vehicle_name),0) not between 1 and 120 then raise exception 'Choose a vehicle type and enter its make/model.';end if;
   t.fuel_type:=nullif(p_data->>'fuel_type','');t.engine_cc:=nullif(p_data->>'engine_cc','')::integer;t.charging:=nullif(p_data->>'charging','');
   t.distance_source:=p_data->>'distance_source';t.distance_reason:=nullif(btrim(p_data->>'distance_reason'),'');t.route_quote_id:=nullif(p_data->>'route_quote_id','')::uuid;t.route_data:=null;
   if t.distance_source in ('google','route') or (t.distance_source='manual' and t.route_quote_id is not null) then
     select * into q from public.mileage_route_quotes where id=t.route_quote_id and company_id=u."Company_ID" and user_id=u."User_ID";
     if q.id is null or q.route_input is distinct from jsonb_build_object('origin',t.origin,'destination',t.destination,'waypoints',t.waypoints,'round_trip',t.round_trip,'vehicle_type',t.vehicle_type) then raise exception 'The route changed. Calculate it again before saving.';end if;
     t.route_data:=q.route_data;
     if t.distance_source='manual' then
       t.distance_miles:=round((p_data->>'distance_miles')::numeric,2);
       if coalesce(length(t.distance_reason),0) not between 1 and 1000 then raise exception 'Explain the mileage override.';end if;
     else t.distance_miles:=q.distance_miles;end if;
   elsif t.distance_source='manual' then
     t.route_quote_id:=null;t.distance_miles:=round((p_data->>'distance_miles')::numeric,2);
     if coalesce(length(t.distance_reason),0) not between 1 and 1000 then raise exception 'Explain the manually entered mileage, for example odometer readings.';end if;
   else raise exception 'Calculate the route or choose manual mileage.';end if;
   if t.distance_miles is null or t.distance_miles<=0 or t.distance_miles>10000 or t.distance_miles='NaN'::numeric then raise exception 'Enter mileage greater than zero and no more than 10,000.';end if;
   if jsonb_typeof(coalesce(p_data->'evidence_ids','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_data->'evidence_ids','[]'::jsonb))>2 then raise exception 'Attach up to two odometer photos.';end if;
   t.evidence_ids:=array(select value::uuid from jsonb_array_elements_text(coalesce(p_data->'evidence_ids','[]'::jsonb)));
   if (select count(*) from public.mileage_evidence e where e.id=any(t.evidence_ids) and e.trip_id=t.id and e.company_id=u."Company_ID" and e.user_id=u."User_ID")<>cardinality(t.evidence_ids) then raise exception 'One of the photos is unavailable. Upload it again.' using errcode='42501';end if;
   if (select count(distinct kind) from public.mileage_evidence e where e.id=any(t.evidence_ids))<>cardinality(t.evidence_ids) then raise exception 'Use one photo before and one after the trip.';end if;
   yr:=extract(year from t.trip_date);if t.trip_date<make_date(yr,4,6) then yr:=yr-1;end if;
   select miles into opening from public.mileage_opening_balances where company_id=t.company_id and user_id=t.user_id and tax_year=yr;
   t.rate_snapshot:=mileage.calculate(t,coalesce(opening,0));t.amount:=(t.rate_snapshot->>'amount')::numeric;
   if p_action='preview' then return jsonb_build_object('amount',t.amount,'rate_snapshot',t.rate_snapshot);end if;
   t.version:=t.version+1;t.updated_at:=now();t.status:='draft';
   insert into public.mileage_trips select t.* on conflict(id) do update set
    evidence_ids=excluded.evidence_ids,account_id=excluded.account_id,company_name=excluded.company_name,trip_date=excluded.trip_date,purpose=excluded.purpose,origin=excluded.origin,destination=excluded.destination,waypoints=excluded.waypoints,round_trip=excluded.round_trip,
    vehicle_type=excluded.vehicle_type,vehicle_name=excluded.vehicle_name,company_car=excluded.company_car,fuel_type=excluded.fuel_type,engine_cc=excluded.engine_cc,charging=excluded.charging,
    distance_miles=excluded.distance_miles,distance_source=excluded.distance_source,distance_reason=excluded.distance_reason,route_quote_id=excluded.route_quote_id,route_data=excluded.route_data,status=excluded.status,
    amount=excluded.amount,rate_snapshot=excluded.rate_snapshot,version=excluded.version,updated_at=excluded.updated_at
    where mileage_trips.company_id=u."Company_ID" and mileage_trips.user_id=u."User_ID" and mileage_trips.status in ('draft','rejected') and mileage_trips.version=t.version-1;
   get diagnostics total=row_count;
   if total<>1 then raise exception 'The trip changed or is unavailable. Reload before saving.' using errcode='40001';end if;
   insert into public.mileage_events(trip_id,company_id,actor_id,actor_name,action,detail) values(t.id,t.company_id,u."User_ID",actor_name,'saved',jsonb_build_object('version',t.version));
   return to_jsonb(t);
 elsif p_action in ('detail','submit','approve','reject','pay') then
   v_id:=(p_data->>'id')::uuid;
   -- Lock per claimant BEFORE the row lock so concurrent submissions cannot share an allowance.
   if p_action='submit' then perform pg_advisory_xact_lock(hashtextextended(u."User_ID"::text,0));end if;
   select * into t from public.mileage_trips where id=v_id and company_id=u."Company_ID" for update;
   if t.id is null or not mileage.can_read(t.company_id,t.user_id,t.status) then raise exception 'Trip not found or access denied.' using errcode='42501';end if;
   if p_action='detail' then
    return jsonb_build_object('trip',to_jsonb(t),'events',(select coalesce(jsonb_agg(e order by e.created_at,e.id),'[]') from public.mileage_events e where e.trip_id=t.id),
     'companyName',t.company_name);
   end if;
   if t.version is distinct from (p_data->>'version')::integer then raise exception 'This trip changed. Reload before continuing.' using errcode='40001';end if;
   if p_action='submit' then
     if t.user_id<>u."User_ID" or t.status<>'draft' then raise exception 'Only your draft trips can be submitted.' using errcode='42501';end if;
     -- Setting changes apply to new submissions only. Submitted decisions are never silently bypassed.
     select * into s from public.mileage_settings where company_id=u."Company_ID" for share;
     t.approval_required:=coalesce(s.approval_required,false);
     if t.approval_required and not exists(select 1 from public."cmp_Users" where "Company_ID"=u."Company_ID" and "User_ID"<>u."User_ID" and "Auth_User_ID" is not null and "User_AccessStatus"='active' and ("User_ID"=any(s.approver_ids) or mileage.is_admin("User_ID"))) then raise exception 'No other active approver is available. Ask an administrator to update mileage settings.';end if;
     yr:=extract(year from t.trip_date);if t.trip_date<make_date(yr,4,6) then yr:=yr-1;end if;
     select miles into opening from public.mileage_opening_balances where company_id=t.company_id and user_id=t.user_id and tax_year=yr;
     t.rate_snapshot:=mileage.calculate(t,coalesce(opening,0));t.amount:=(t.rate_snapshot->>'amount')::numeric;
     t.status:=case when t.approval_required then 'pending' else 'ready' end;t.submitted_at:=now();t.denial_reason:=null;t.decided_at:=null;t.decided_by:=null;
   elsif p_action in ('approve','reject') then
     if not approver or t.user_id=u."User_ID" then raise exception 'An assigned approver must review another employee''s claim.' using errcode='42501';end if;
     if t.status<>'pending' then raise exception 'This claim is no longer awaiting approval.';end if;
     t.status:=case when p_action='approve' then 'ready' else 'rejected' end;t.decided_at:=now();t.decided_by:=u."User_ID";
     t.denial_reason:=case when p_action='reject' then nullif(btrim(p_data->>'reason'),'') else null end;
     if p_action='reject' and coalesce(length(t.denial_reason),0) not between 1 and 2000 then raise exception 'Enter a reason for returning the claim.';end if;
   elsif p_action='pay' then
     if not finance then raise exception 'Finance payment access is required.' using errcode='42501';end if;
     if t.status<>'ready' then raise exception 'Only claims ready for payment can be marked as paid.';end if;
     t.payment_reference:=nullif(btrim(p_data->>'reference'),'');
     if coalesce(length(t.payment_reference),0) not between 1 and 200 then raise exception 'Enter the bank transfer or payment reference.';end if;
     t.status:='paid';t.paid_at:=now();t.paid_by:=u."User_ID";
   end if;
   t.version:=t.version+1;t.updated_at:=now();
   update public.mileage_trips set status=t.status,version=t.version,updated_at=t.updated_at,amount=t.amount,rate_snapshot=t.rate_snapshot,approval_required=t.approval_required,submitted_at=t.submitted_at,decided_at=t.decided_at,decided_by=t.decided_by,denial_reason=t.denial_reason,paid_at=t.paid_at,paid_by=t.paid_by,payment_reference=t.payment_reference where id=t.id;
   insert into public.mileage_events(trip_id,company_id,actor_id,actor_name,action,detail) values(t.id,t.company_id,u."User_ID",actor_name,p_action,jsonb_build_object('status',t.status,'amount',t.amount,'reason',t.denial_reason,'reference',t.payment_reference,'version',t.version));
   perform mileage.notify(t,u."User_ID");
   return to_jsonb(t);
 end if;
 raise exception 'Unsupported mileage action.' using errcode='22023';
end $$;

commit;
