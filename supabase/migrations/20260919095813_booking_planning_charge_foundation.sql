begin;
set local lock_timeout = '5s';

-- Foundation only: no browser, Edge or Dexter access is granted in this step.
-- Do not release until editor, lifecycle handling and party/currency lookup
-- validation are connected. This is NOT a financial costing table.
create table booking_api.planning_charge_sets (
  job_id uuid primary key references public."Job_Header"("Job_ID"),
  revision bigint not null default 0 check (revision >= 0),
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  rows jsonb not null default '[]' check (jsonb_typeof(rows) = 'array'),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null
);
create table booking_api.planning_charge_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public."Job_Header"("Job_ID"),
  revision bigint not null,
  actor_user_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  before_state jsonb not null,
  after_state jsonb not null,
  unique (job_id, revision)
);
alter table booking_api.planning_charge_sets enable row level security;
alter table booking_api.planning_charge_history enable row level security;
revoke all on booking_api.planning_charge_sets, booking_api.planning_charge_history from public, anon, authenticated, service_role;
create trigger planning_charge_history_immutable before update or delete on booking_api.planning_charge_history
for each row execute function booking_api.protect_provisional_history();

-- Private entry point reserved for a future authenticated Edge adapter.
-- Caller identity must eventually come from a verified token, never request JSON.
create function booking_api.save_planning_charge_foundation(
  caller_auth_user_id uuid, requested_job_id uuid, expected_revision bigint,
  requested_base_currency text, requested_rows jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  job public."Job_Header"%rowtype;
  previous booking_api.planning_charge_sets%rowtype;
  saved booking_api.planning_charge_sets%rowtype;
  actor uuid; company uuid; charge jsonb; field text; value numeric;
begin
  if not coalesce(booking_api.has_permission(caller_auth_user_id, 'Bookings.Write'), false) then
    raise exception 'Booking changes are not authorised.' using errcode='42501';
  end if;
  select j.* into job from public."Job_Header" j
  join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
  join public."cmp_Users" u on u."Company_ID"=o."Company_ID"
    and u."Auth_User_ID"=caller_auth_user_id and u."User_AccessStatus"='active'
  where j."Job_ID"=requested_job_id and not j."Job_IsDeleted" for update of j;
  if not found then raise exception 'That booking is outside this workspace.' using errcode='42501'; end if;
  if coalesce(lower(job."Job_Status"),'') not in ('draft','provisional') or job."Job_ProvisionalCancelled" then
    raise exception 'Planning charges can only be edited on a Provisional booking.' using errcode='22023';
  end if;
  select "User_ID", "Company_ID" into strict actor, company from public."cmp_Users"
  where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
  select * into previous from booking_api.planning_charge_sets where job_id=requested_job_id;
  if expected_revision is null or expected_revision <> coalesce(previous.revision, 0) then
    raise exception 'Planning charges changed. Reload before continuing.' using errcode='40001';
  end if;
  if requested_base_currency is null or requested_base_currency !~ '^[A-Z]{3}$'
    or jsonb_typeof(requested_rows) is distinct from 'array' then
    raise exception 'Choose a base currency and charge rows.' using errcode='22023';
  end if;
  if jsonb_array_length(requested_rows)>200 or octet_length(requested_rows::text)>262144 then
    raise exception 'Too many planning charges.' using errcode='22023';
  end if;
  for charge in select * from jsonb_array_elements(requested_rows) loop
    if jsonb_typeof(charge) <> 'object' then raise exception 'Invalid charge row.' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(charge) k where k not in
      ('id','code','description','cost','sell','costCurrency','sellCurrency','costRoe','sellRoe','quantity','calculationBasis')) then
      raise exception 'Unsupported charge field.' using errcode='22023';
    end if;
    if coalesce(charge->>'id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or jsonb_typeof(charge->'description') is distinct from 'string'
      or length(btrim(charge->>'description')) not between 1 and 240
      or coalesce(charge->>'costCurrency','') !~ '^[A-Z]{3}$'
      or coalesce(charge->>'sellCurrency','') !~ '^[A-Z]{3}$' then
      raise exception 'Each charge needs an identifier, description and currencies.' using errcode='22023';
    end if;
    foreach field in array array['cost','sell','costRoe','sellRoe','quantity'] loop
      if jsonb_typeof(charge->field) is distinct from 'number' then
        raise exception 'Charge amounts, rates and quantity must be numbers.' using errcode='22023';
      end if;
      value := (charge->>field)::numeric;
      if value < 0 or value > 1000000000000 or (field in ('costRoe','sellRoe') and value=0) then
        raise exception 'Charge amounts, rates or quantity are outside the allowed range.' using errcode='22023';
      end if;
    end loop;
    if charge ? 'code' and (jsonb_typeof(charge->'code') <> 'string' or length(charge->>'code')>80) then
      raise exception 'Invalid charge code.' using errcode='22023';
    end if;
    if charge ? 'calculationBasis' and (jsonb_typeof(charge->'calculationBasis') not in ('string','null') or length(charge->>'calculationBasis')>80) then
      raise exception 'Invalid calculation basis.' using errcode='22023';
    end if;
  end loop;
  if (select count(distinct (r->>'id')::uuid) from jsonb_array_elements(requested_rows) r) <> jsonb_array_length(requested_rows) then
    raise exception 'Charge identifiers must be unique.' using errcode='22023';
  end if;
  if previous.job_id is not null and previous.rows=requested_rows and previous.base_currency=requested_base_currency then
    return to_jsonb(previous);
  end if;
  insert into booking_api.planning_charge_sets(job_id, revision, base_currency, rows, updated_by)
  values(requested_job_id, coalesce(previous.revision,0)+1, requested_base_currency, requested_rows, actor)
  on conflict(job_id) do update set revision=excluded.revision, base_currency=excluded.base_currency,
    rows=excluded.rows, updated_by=excluded.updated_by, updated_at=clock_timestamp()
  returning * into saved;
  insert into booking_api.planning_charge_history(job_id, revision, actor_user_id, before_state, after_state)
  values(requested_job_id,saved.revision,actor,coalesce(to_jsonb(previous),'{}'::jsonb),to_jsonb(saved));
  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
  values(company,requested_job_id,'planning_charges_saved','Provisional planning charges saved',
    jsonb_build_object('revision',saved.revision,'chargeCount',jsonb_array_length(requested_rows)),actor);
  return to_jsonb(saved);
end $$;
revoke all on function booking_api.save_planning_charge_foundation(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated,service_role;

-- Fail closed during staged implementation, including generic Dexter status writes.
-- Later lifecycle integration must replace this hold atomically before activation.
create function booking_api.guard_unreleased_planning_charges() returns trigger
language plpgsql security definer set search_path='' as $$begin
  if (new."Job_Status" is distinct from old."Job_Status" or new."Job_IsDeleted" is distinct from old."Job_IsDeleted")
    and exists(select 1 from booking_api.planning_charge_sets where job_id=old."Job_ID" and jsonb_array_length(rows)>0) then
    raise exception 'Manual planning charge lifecycle handling is not enabled yet.' using errcode='22023';
  end if;
  return new;
end $$;
create trigger planning_charge_lifecycle_hold before update of "Job_Status","Job_IsDeleted" on public."Job_Header"
for each row execute function booking_api.guard_unreleased_planning_charges();
revoke all on function booking_api.guard_unreleased_planning_charges() from public,anon,authenticated,service_role;
commit;
