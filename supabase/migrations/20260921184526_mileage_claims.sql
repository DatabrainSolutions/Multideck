begin;
-- Private employee expenses. CRM colleagues receive a visit projection only.
-- Physical tenant isolation remains unchanged; company_id is an additional boundary.
create schema if not exists mileage;
revoke all on schema mileage from public, anon, authenticated;

create table mileage.route_usage (
  user_id uuid not null references public."cmp_Users"("User_ID"), day date not null,
  attempts integer not null check(attempts between 1 and 100), primary key(user_id,day)
);

create table public.mileage_settings (
  company_id uuid primary key,
  approval_required boolean not null default false,
  approver_ids uuid[] not null default '{}',
  electric_override_pence numeric(6,2) check (electric_override_pence > 0 and electric_override_pence <= 100),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.mileage_opening_balances (
  company_id uuid not null, user_id uuid not null references public."cmp_Users"("User_ID"),
  tax_year integer not null check(tax_year between 2020 and 2100),
  miles numeric(12,2) not null check(miles >= 0 and miles <= 1000000),
  primary key(company_id,user_id,tax_year)
);
create table public.mileage_route_quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, user_id uuid not null references public."cmp_Users"("User_ID"),
  route_input jsonb not null, distance_miles numeric(10,2) not null check(distance_miles > 0),
  route_data jsonb not null, created_at timestamptz not null default now()
);
create table public.mileage_trips (
  id uuid primary key default gen_random_uuid(), company_id uuid not null,
  user_id uuid not null references public."cmp_Users"("User_ID"),
  employee_name text not null, account_id uuid references public."Org_Master"("Org_id"),
  trip_date date not null, purpose text not null check(length(purpose) between 1 and 2000),
  origin text not null check(length(origin) between 1 and 500), destination text not null check(length(destination) between 1 and 500),
  waypoints jsonb not null default '[]' check(jsonb_typeof(waypoints)='array' and jsonb_array_length(waypoints)<=20),
  round_trip boolean not null default false, vehicle_type text not null check(vehicle_type in ('car','motorcycle','bicycle')),
  vehicle_name text not null check(length(vehicle_name) between 1 and 120), company_car boolean not null default false,
  fuel_type text check(fuel_type in ('petrol','diesel','electric')), engine_cc integer check(engine_cc > 0 and engine_cc <= 10000),
  charging text check(charging in ('home','public')),
  distance_miles numeric(10,2) not null check(distance_miles > 0 and distance_miles <= 10000),
  distance_source text not null check(distance_source in ('manual','google')), distance_reason text,
  route_quote_id uuid references public.mileage_route_quotes(id), route_data jsonb,
  status text not null default 'draft' check(status in ('draft','pending','ready','rejected','paid')),
  amount numeric(12,2), rate_snapshot jsonb, approval_required boolean,
  submitted_at timestamptz, decided_at timestamptz, decided_by uuid references public."cmp_Users"("User_ID"), denial_reason text,
  paid_at timestamptz, paid_by uuid references public."cmp_Users"("User_ID"), payment_reference text,
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index mileage_trips_register on public.mileage_trips(company_id,status,trip_date desc,id);
create index mileage_trips_employee on public.mileage_trips(company_id,user_id,trip_date);
create index mileage_trips_visits on public.mileage_trips(account_id,trip_date desc) where status not in ('draft','rejected');
create table public.mileage_events (
  id uuid primary key default gen_random_uuid(), trip_id uuid references public.mileage_trips(id),
  company_id uuid not null, actor_id uuid not null references public."cmp_Users"("User_ID"),
  actor_name text not null, action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);

create index mileage_events_trip on public.mileage_events(trip_id,created_at);

create function mileage.actor() returns public."cmp_Users" language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare u public."cmp_Users";
begin
 if (select count(*) from public."cmp_Users" where "Auth_User_ID"=auth.uid()) <> 1 then raise exception 'A unique workspace identity is required.' using errcode='42501';end if;
 select * into u from public."cmp_Users" where "Auth_User_ID"=auth.uid() and "User_AccessStatus"='active' and "Company_ID" is not null;
 if u."User_ID" is null then raise exception 'An active workspace account is required.' using errcode='42501'; end if;
 return u;
end $$;
create function mileage.is_admin(p_user uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public."cmp_Users_Roles" ur join public."sys_UserRoles" r using("sys_UserRole_ID") where ur."User_ID"=p_user and lower(r."sys_UserRole_Name") in ('administrator','company admin'));
$$;
create function mileage.can_read(p_company uuid,p_owner uuid,p_status text) returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare u public."cmp_Users" := mileage.actor();
begin
 return u."Company_ID"=p_company and (u."User_ID"=p_owner or mileage.is_admin(u."User_ID")
 or (p_status<>'draft' and (public._multideck_crm_has_permission(u."User_ID",'Finance.ReviewAndPost')
 or exists(select 1 from public.mileage_settings s where s.company_id=p_company and u."User_ID"=any(s.approver_ids)))));
end $$;

alter table public.mileage_trips enable row level security;
alter table public.mileage_settings enable row level security;
alter table public.mileage_opening_balances enable row level security;
alter table public.mileage_events enable row level security;
alter table public.mileage_route_quotes enable row level security;
-- All writes go through version-checked transactions; clients cannot forge approval or payment.
revoke all on public.mileage_trips,public.mileage_settings,public.mileage_opening_balances,public.mileage_events,public.mileage_route_quotes from public,anon,authenticated;
grant select,insert on public.mileage_route_quotes to service_role;
-- No direct client grants: the RPCs below apply the same explicit predicates to every read.
create policy mileage_trip_read on public.mileage_trips for select to authenticated using(mileage.can_read(company_id,user_id,status));

-- Date-effective UK rates, reviewed against GOV.UK on 21 September 2026.
-- No silent fallback for dates outside the reviewed advisory-rate range.
create function mileage.calculate(p_trip public.mileage_trips,p_opening numeric default 0) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare used numeric; high_miles numeric:=0; low_miles numeric:=0; rate numeric; high_rate numeric;
 yr integer:=extract(year from p_trip.trip_date); start_date date; settings public.mileage_settings; label text;
begin
 if p_trip.trip_date < make_date(yr,4,6) then yr:=yr-1;end if;
 start_date:=make_date(yr,4,6);
 select * into settings from public.mileage_settings where company_id=p_trip.company_id;
 if p_trip.company_car then
   if p_trip.vehicle_type<>'car' then raise exception 'Company vehicle rates apply to cars only.';end if;
   if p_trip.trip_date<'2025-09-01' or p_trip.trip_date>='2026-12-01' then raise exception 'Company-car rates have not been reviewed for this date. Contact your administrator.';end if;
   if p_trip.fuel_type='electric' then
     if p_trip.charging not in ('home','public') or p_trip.charging is null then raise exception 'Choose the charging location.';end if;
     rate:=coalesce(settings.electric_override_pence,case when p_trip.charging='home' then case when p_trip.trip_date<'2025-12-01' then 8 else 7 end else case when p_trip.trip_date<'2026-03-01' then 14 else 15 end end);
     label:=case when settings.electric_override_pence is not null then 'Workspace electric-car rate (not an HMRC rate)' else 'HMRC advisory electric rate' end;
   elsif p_trip.fuel_type in ('petrol','diesel') and p_trip.engine_cc>0 then
     if p_trip.fuel_type='petrol' then
       rate:=case when p_trip.trip_date<'2026-06-01' then case when p_trip.engine_cc<=1400 then 12 when p_trip.engine_cc<=2000 then 14 else 22 end
          else case when p_trip.engine_cc<=1400 then 14 when p_trip.engine_cc<=2000 then 17 when p_trip.trip_date<'2026-09-01' then 26 else 27 end end;
     else
       rate:=case when p_trip.trip_date<'2026-06-01' then case when p_trip.engine_cc<=1600 then 12 when p_trip.engine_cc<=2000 then 13 else 18 end
          when p_trip.trip_date<'2026-09-01' then case when p_trip.engine_cc<=1600 then 15 when p_trip.engine_cc<=2000 then 17 else 23 end
          else case when p_trip.engine_cc<=1600 then 15 when p_trip.engine_cc<=2000 then 16 else 22 end end;
     end if;
     label:='HMRC advisory fuel rate';
   else raise exception 'Choose the fuel and engine size. For a hybrid, choose its petrol or diesel fuel.';end if;
 elsif p_trip.vehicle_type='car' then
   if yr<2020 then raise exception 'Mileage rates have not been reviewed for this tax year.';end if;
   -- Count allocated high-band miles, not total miles: rejected claims cannot create a second allowance.
   select coalesce(sum((rate_snapshot->>'highMiles')::numeric),0) into used from public.mileage_trips
     where company_id=p_trip.company_id and user_id=p_trip.user_id and id<>p_trip.id
     and status in ('pending','ready','paid') and trip_date>=start_date and trip_date<(start_date+interval '1 year');
   high_miles:=least(p_trip.distance_miles,greatest(0,10000-p_opening-used));
   low_miles:=p_trip.distance_miles-high_miles;high_rate:=case when yr>=2026 then 55 else 45 end;
   return jsonb_build_object('amount',round((high_miles*high_rate+low_miles*25)/100,2),'highMiles',high_miles,'lowMiles',low_miles,'highRatePence',high_rate,'lowRatePence',25,'taxYear',yr,'label','HMRC personal-car mileage allowance','source','https://www.gov.uk/expenses-and-benefits-business-travel-mileage/rules-for-tax');
 else rate:=case when p_trip.vehicle_type='motorcycle' then 24 else 20 end;label:='HMRC mileage allowance';end if;
 return jsonb_build_object('amount',round(p_trip.distance_miles*rate/100,2),'ratePence',rate,'taxYear',yr,'label',label,'source',case when p_trip.company_car then 'https://www.gov.uk/guidance/advisory-fuel-rates' else 'https://www.gov.uk/expenses-and-benefits-business-travel-mileage/rules-for-tax' end);
end $$;

create function mileage.notify(p_trip public.mileage_trips,p_actor uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 insert into public."Comm_Notifications"("CommNotif_UserID","CommNotif_Title","CommNotif_Body","CommNotif_TargetTable","CommNotif_TargetID","CommNotif_MetadataJSON","CommNotif_CreatedBy")
 select u."User_ID",case p_trip.status when 'pending' then 'Mileage claim needs approval' when 'ready' then 'Mileage claim ready for payment' when 'paid' then 'Mileage claim marked as paid' else 'Mileage claim returned' end,
 p_trip.employee_name||' · '||to_char(p_trip.trip_date,'DD Mon YYYY')||' · GBP '||p_trip.amount,
 'mileage_trips',p_trip.id,jsonb_build_object('action_url','/crm/trips/'||p_trip.id,'action_label','View trip','event_type','mileage_'||p_trip.status),p_actor
 from public."cmp_Users" u where u."Company_ID"=p_trip.company_id and u."Auth_User_ID" is not null and u."User_AccessStatus"='active'
 and (u."User_ID"=p_trip.user_id or (p_trip.status='ready' and public._multideck_crm_has_permission(u."User_ID",'Finance.ReviewAndPost'))
 or (p_trip.status='pending' and u."User_ID"<>p_trip.user_id and (mileage.is_admin(u."User_ID") or exists(select 1 from public.mileage_settings s where s.company_id=p_trip.company_id and u."User_ID"=any(s.approver_ids)))));
end $$;

create function public.multideck_mileage(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare u public."cmp_Users":=mileage.actor(); s public.mileage_settings; t public.mileage_trips; q public.mileage_route_quotes;
 v_id uuid; admin boolean:=mileage.is_admin(u."User_ID"); finance boolean; approver boolean; result jsonb; rows_json jsonb; total integer;
 target uuid; yr integer; opening numeric; desired text; actor_name text:=coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),'Workspace member');
begin
 finance:=admin or public._multideck_crm_has_permission(u."User_ID",'Finance.ReviewAndPost');
 select * into s from public.mileage_settings where company_id=u."Company_ID";
 if s.company_id is null then s.company_id:=u."Company_ID";s.approval_required:=false;s.approver_ids:='{}';s.version:=0;end if;
 approver:=admin or u."User_ID"=any(s.approver_ids);
 if p_action='context' then
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
     and (concat_ws(' ',claim.employee_name,claim.purpose,claim.origin,claim.destination) ilike '%'||left(coalesce(p_data->>'search',''),100)||'%')
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
   if t.account_id is not null and (not public._multideck_crm_has_permission(u."User_ID",'CRM.Read') or not public.multideck_crm_company_can_access_account(u."Company_ID",t.account_id)) then raise exception 'Select a company you can access.' using errcode='42501';end if;
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
   if t.distance_source='google' then
     select * into q from public.mileage_route_quotes where id=t.route_quote_id and company_id=u."Company_ID" and user_id=u."User_ID";
     if q.id is null or q.route_input is distinct from jsonb_build_object('origin',t.origin,'destination',t.destination,'waypoints',t.waypoints,'round_trip',t.round_trip,'vehicle_type',t.vehicle_type) then raise exception 'The route changed. Calculate it again before saving.';end if;
     t.distance_miles:=q.distance_miles;t.route_data:=q.route_data;
   elsif t.distance_source='manual' then
     t.route_quote_id:=null;t.distance_miles:=round((p_data->>'distance_miles')::numeric,2);
     if coalesce(length(t.distance_reason),0) not between 1 and 1000 then raise exception 'Explain the manually entered mileage, for example odometer readings.';end if;
   else raise exception 'Calculate the route or choose manual mileage.';end if;
   if t.distance_miles is null or t.distance_miles<=0 or t.distance_miles>10000 or t.distance_miles='NaN'::numeric then raise exception 'Enter mileage greater than zero and no more than 10,000.';end if;
   yr:=extract(year from t.trip_date);if t.trip_date<make_date(yr,4,6) then yr:=yr-1;end if;
   select miles into opening from public.mileage_opening_balances where company_id=t.company_id and user_id=t.user_id and tax_year=yr;
   t.rate_snapshot:=mileage.calculate(t,coalesce(opening,0));t.amount:=(t.rate_snapshot->>'amount')::numeric;
   if p_action='preview' then return jsonb_build_object('amount',t.amount,'rate_snapshot',t.rate_snapshot);end if;
   t.version:=t.version+1;t.updated_at:=now();t.status:='draft';
   insert into public.mileage_trips select t.* on conflict(id) do update set
    account_id=excluded.account_id,trip_date=excluded.trip_date,purpose=excluded.purpose,origin=excluded.origin,destination=excluded.destination,waypoints=excluded.waypoints,round_trip=excluded.round_trip,
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
     'companyName',(select "Org_Name" from public."Org_Master" where "Org_id"=t.account_id));
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
revoke all on all functions in schema mileage from public,anon,authenticated;
revoke all on function public.multideck_mileage(text,jsonb) from public,anon;
grant execute on function public.multideck_mileage(text,jsonb) to authenticated;

-- Dexter reads reuse employee/approver/accounts visibility, never company-wide finance reads.
create function public.multideck_dexter_domain_mileage(p_company_id uuid,p_search text,p_take integer)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare u public."cmp_Users":=mileage.actor(); result jsonb;
begin
 if u."Company_ID" is distinct from p_company_id then raise exception 'Workspace access denied.' using errcode='42501';end if;
 select coalesce(jsonb_agg(evidence),'[]') into result from (
   select jsonb_build_object('recordId',id,'employee',employee_name,'tripDate',trip_date,'purpose',purpose,'miles',distance_miles,
    'amount',amount,'currency','GBP','status',status,'version',version,'updatedAt',updated_at,'sourceTable','mileage_trips',
    'sourceUrl','/crm/trips/'||id,'targetLabel',employee_name||' · '||trip_date,'rateBasis',rate_snapshot->>'label') evidence
   from public.mileage_trips where company_id=p_company_id and mileage.can_read(company_id,user_id,status)
   and (nullif(btrim(p_search),'') is null or id::text=p_search or concat_ws(' ',employee_name,purpose,status) ilike '%'||left(p_search,100)||'%')
   order by trip_date desc,id limit greatest(1,least(coalesce(p_take,10),25))
 ) matching;
 return result;
end $$;
revoke all on function public.multideck_dexter_domain_mileage(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_mileage(uuid,text,integer) to service_role;
insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON","AIDexterDomain_ScopeStrategy")
values('mileage','Trips and mileage','Employee mileage claims visible to the current claimant, assigned approver or Finance operator. GBP claims, date, business purpose, mileage, status and source links. Route calculation, claim writes and mileage watches are unsupported; open Trips & mileage or Finance → Mileage payments.','multideck_dexter_domain_mileage','[]','["employee_expenses"]','actor');

commit;
