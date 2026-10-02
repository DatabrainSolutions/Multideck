begin;
set local lock_timeout='5s';

-- Retain the exact planning snapshot and its operational line links. This table
-- is private audit evidence, not another financial ledger or charge source.
create table booking_api.planning_charge_releases (
 job_id uuid primary key references public."Job_Header"("Job_ID"),
 revision bigint not null,
 snapshot jsonb not null,
 costing_line_ids uuid[] not null,
 actor_user_id uuid not null,
 released_at timestamptz not null default clock_timestamp()
);
alter table booking_api.planning_charge_releases enable row level security;
revoke all on booking_api.planning_charge_releases from public,anon,authenticated,service_role;
create trigger planning_release_immutable before update or delete on booking_api.planning_charge_releases
for each row execute function booking_api.protect_provisional_history();

create function booking_api.release_manual_planning_charges() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 plan booking_api.planning_charge_sets%rowtype; charge jsonb;
 company uuid; base_currency text; line_id uuid; line_ids uuid[]:='{}';
begin
 if lower(old."Job_Status") not in ('draft','provisional')
   or booking_api.lifecycle_label(new."Job_Status")<>'In progress' then return new;end if;
 select * into plan from booking_api.planning_charge_sets where job_id=new."Job_ID";
 if not found or jsonb_array_length(plan.rows)=0 then return new;end if;
 if exists(select 1 from booking_api.planning_charge_releases where job_id=new."Job_ID") then return new;end if;
 select o."Company_ID",upper(e."LegalEntity_BaseCurrencyCodeSnapshot") into company,base_currency
 from public."cmp_Offices" o join public."cmp_LegalEntities" e on e."Company_ID"=o."Company_ID"
   and e."LegalEntity_ID"=new."Job_LegalEntityID" and e."LegalEntity_IsActive"
 where o."Office_ID"=coalesce(new."Job_OrgOfficeID",new."Job_OfficeID");
 if company is null or base_currency is null or plan.base_currency<>base_currency then
   raise exception 'Review the Booking legal entity and planning base currency before confirming.' using errcode='22023';
 end if;
 if new."Job_UpdatedBy" is null then raise exception 'A recorded operator is required to confirm planning charges.' using errcode='22023';end if;
 for charge in select * from jsonb_array_elements(plan.rows) loop
   if not exists(select 1 from public."sys_Currency" where "Currency_Code"=charge->>'costCurrency')
     or not exists(select 1 from public."sys_Currency" where "Currency_Code"=charge->>'sellCurrency')
     or ((charge->>'costCurrency')=base_currency and (charge->>'costRoe')::numeric<>1)
     or ((charge->>'sellCurrency')=base_currency and (charge->>'sellRoe')::numeric<>1) then
     raise exception 'Review planning charge currencies and exchange rates before confirming.' using errcode='22023';
   end if;
   -- Never use upsert to rewrite an existing posted or invoice-linked charge.
   if exists(select 1 from public."Job_Costing_Lines" where "JobCostingLine_DomainCode"='freight'
     and "JobCostingLine_SourceTable"='booking_api.planning_charge_sets'
     and "JobCostingLine_SourceID"=new."Job_ID" and "JobCostingLine_SourceLineID"=(charge->>'id')::uuid) then
     raise exception 'A planning charge was already transferred. Finance review is required.' using errcode='22023';
   end if;
   -- Match the shared Quote editor: currency amount divided by ROE gives base
   -- amount. Cost/sell already represent line totals: do not multiply quantity again.
   -- Legacy integer currency IDs cannot hold sys_Currency UUIDs; preserve codes in
   -- source metadata without changing existing Finance schema or guessing IDs.
   line_id:=public._multideck_finance_upsert_job_charge(
     new."Job_ID",'freight','booking_api.planning_charge_sets',new."Job_ID",(charge->>'id')::uuid,
     charge->>'description',null,null,
     round((charge->>'cost')::numeric/(charge->>'costRoe')::numeric,4),
     round((charge->>'sell')::numeric/(charge->>'sellRoe')::numeric,4),
     (charge->>'cost')::numeric,(charge->>'sell')::numeric,null,null,
     (charge->>'costRoe')::numeric,(charge->>'sellRoe')::numeric,new."Job_UpdatedBy",
     jsonb_build_object('planningRevision',plan.revision,'baseCurrency',plan.base_currency,'planningCharge',charge)
   );
   line_ids:=array_append(line_ids,line_id);
 end loop;
 insert into booking_api.planning_charge_releases(job_id,revision,snapshot,costing_line_ids,actor_user_id)
 values(new."Job_ID",plan.revision,to_jsonb(plan),line_ids,new."Job_UpdatedBy");
 insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
 values(company,new."Job_ID",'planning_charges_released','Planning charges confirmed as operational charges',
   jsonb_build_object('revision',plan.revision,'chargeCount',cardinality(line_ids),'costingLineIds',to_jsonb(line_ids)),new."Job_UpdatedBy");
 return new;
end $$;
revoke all on function booking_api.release_manual_planning_charges() from public,anon,authenticated,service_role;

-- PostgreSQL runs same-kind triggers alphabetically: Quote release must run first
-- so its historical no-existing-cost-lines check does not skip a mixed source job.
create trigger zz_manual_planning_charge_release after update of "Job_Status" on public."Job_Header"
for each row execute function booking_api.release_manual_planning_charges();

-- Replace the staging hold: only reviewed cancel/reopen or normal validated
-- progression may change status while manual planning charges exist.
create or replace function booking_api.guard_unreleased_planning_charges() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from booking_api.planning_charge_sets where job_id=old."Job_ID" and jsonb_array_length(rows)>0)
   and not exists(select 1 from booking_api.planning_charge_releases where job_id=old."Job_ID") then
   if new."Job_IsDeleted" is distinct from old."Job_IsDeleted" then
     raise exception 'Planning charges must be handled before removing this Booking.' using errcode='22023';end if;
   if new."Job_Status" is distinct from old."Job_Status"
     and not (lower(old."Job_Status") in ('draft','provisional') and booking_api.lifecycle_label(new."Job_Status")='In progress')
     and not exists(select 1 from booking_api.provisional_cancellations where job_id=old."Job_ID"
       and transition_tx=txid_current() and transition_status=new."Job_Status"
       and ((lower(old."Job_Status") in ('draft','provisional') and new."Job_Status"='cancelled')
         or (old."Job_ProvisionalCancelled" and new."Job_Status"='draft'))) then
     raise exception 'Use the reviewed Booking status action for planning charges.' using errcode='22023';end if;
 end if;
 return new;
end $$;
revoke all on function booking_api.guard_unreleased_planning_charges() from public,anon,authenticated,service_role;
-- No editor or planning save grants are enabled in this migration.
commit;
