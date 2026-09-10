begin;
set local lock_timeout='5s';
-- Lee Wright, Slack p1789051942107479: provisional intent must have no
-- financial records. Historical records are retained; this guards new writes.
create function booking_api.finance_job_columns()
returns table(table_name text,column_name text) language sql stable security definer set search_path='' as $$
 select distinct c.relname::text,a.attname::text from pg_catalog.pg_constraint fk
 join pg_catalog.pg_class c on c.oid=fk.conrelid
 join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum=fk.conkey[1]
 where fk.contype='f' and fk.confrelid='public."Job_Header"'::regclass and cardinality(fk.conkey)=1
 and n.nspname='public' and (c.relname like 'FIN\_%' escape '\' or c.relname like 'Job\_Costing%' escape '\' or c.relname like 'Acc\_%' escape '\');
$$;
create function booking_api.require_financial_booking(job_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare status text;
begin
 if job_id is null then return;end if;
 -- Serialises finance capture with a concurrent return to Provisional.
 select "Job_Status" into status from public."Job_Header" where "Job_ID"=job_id for update;
 if not found then raise exception 'Choose an existing booking.' using errcode='22023';end if;
 if lower(status) in ('draft','provisional') then
  raise exception 'Provisional bookings cannot have financial records. Move the booking to In progress first.' using errcode='22023';end if;
end $$;
create function booking_api.guard_financial_booking() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=to_jsonb(new);costing_id uuid;costing_job uuid;
begin
 perform booking_api.require_financial_booking(nullif(row_data->>tg_argv[0],'')::uuid);
 costing_id:=nullif(coalesce(row_data->>'FINDocLineJob_JobCostingLineID',row_data->>'FINAccrual_JobCostingLineID',row_data->>'FINWIP_JobCostingLineID'),'')::uuid;
 if costing_id is not null then
  select "Job_ID" into costing_job from public."Job_Costing_Lines" where "JobCostingLine_ID"=costing_id;
  perform booking_api.require_financial_booking(costing_job);
 end if;
 -- Finance's polymorphic source cannot be used to bypass its typed job link.
 if tg_table_name='FIN_Documents' and row_data->>'FINDoc_SourceTable'='Job_Header' then
  perform booking_api.require_financial_booking(nullif(row_data->>'FINDoc_SourceID','')::uuid);
 end if;
 return new;
end $$;
do $$declare item record;begin
 for item in select * from booking_api.finance_job_columns() loop
  execute format('create trigger %I before insert or update on public.%I for each row execute function booking_api.guard_financial_booking(%L)',
   'provisional_guard_'||item.column_name,item.table_name,item.column_name);
 end loop;
end $$;

create function booking_api.guard_provisional_finance_history() returns trigger
language plpgsql security definer set search_path='' as $$
declare item record; found_record boolean;
begin
 if new."Job_Status" is not distinct from old."Job_Status" or lower(new."Job_Status") not in ('draft','provisional') then return new;end if;
 for item in select * from booking_api.finance_job_columns() loop
  execute format('select exists(select 1 from public.%I where %I=$1)',item.table_name,item.column_name) into found_record using new."Job_ID";
  if found_record then raise exception 'This booking has financial records and cannot become Provisional.' using errcode='22023';end if;
 end loop;
 if exists(select 1 from public."FIN_Documents" where "FINDoc_SourceTable"='Job_Header' and "FINDoc_SourceID"=new."Job_ID") then
  raise exception 'This booking has financial records and cannot become Provisional.' using errcode='22023';end if;
 return new;
end $$;
create trigger provisional_finance_history before update of "Job_Status" on public."Job_Header"
for each row execute function booking_api.guard_provisional_finance_history();

-- Defer accepted-quote cost lines, retaining their exact accepted snapshot.
-- Patch the canonical implementation beneath its existing enrichment wrappers.
do $$declare definition text; anchor text:='for charge in select value from jsonb_array_elements(coalesce(payload->''charges'', ''[]''::jsonb)) loop';begin
 definition:=pg_get_functiondef('booking_api.convert_accepted_quote_before_sync_review_20260904(uuid,uuid,uuid)'::regprocedure);
 if position(anchor in definition)=0 then raise exception 'Accepted quote charge transfer changed; review the provisional migration.';end if;
 definition:=replace(definition,anchor,'for charge in select value from jsonb_array_elements(case when job_status=''draft'' then ''[]''::jsonb else coalesce(payload->''charges'',''[]''::jsonb) end) loop');
 execute definition;
end $$;

create function booking_api.release_provisional_quote_charges() returns trigger
language plpgsql security definer set search_path='' as $$
declare charge jsonb; charge_number integer:=0;job_id uuid:=new."Job_ID";actor_user_id uuid:=new."Job_UpdatedBy";payload jsonb;
begin
 if lower(old."Job_Status") not in ('draft','provisional') or booking_api.lifecycle_label(new."Job_Status") <> 'In progress'
   or new."Job_SourceQuoteID" is null or coalesce((new."Job_SourceSnapshotJSON"->>'provisionalChargesReleased')::boolean,false) then return new;end if;
 -- Existing historical charges are preserved, never copied a second time.
 if exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job_id) then return new;end if;
 payload:=coalesce(new."Job_SourceSnapshotJSON"#>'{acceptedSnapshot,quote}','{}'::jsonb);
 for charge in select value from jsonb_array_elements(coalesce(payload->'charges','[]'::jsonb)) loop
  charge_number:=charge_number+1;
    insert into public."Job_Costing_Lines" (
      "Job_ID", "JobCostingLine_Number", "JobCostingLine_SupplierID", "JobCostingLine_Description", "JobCostingLine_InternalNotes",
      "JobCostingLine_CustomerNotes", "JobCostingLine_CostROE", "JobCostingLine_CostAmountCurrency", "JobCostingLine_CostAmountLocal",
      "JobCostingLine_RevenueROE", "JobCostingLine_RevenueAmountCurrency", "JobCostingLine_RevenueAmountLocal",
      "JobCostingLine_ShowToCustomer", "JobCostingLine_CreatedBy", "JobCostingLine_UpdatedBy"
    ) values (
      job_id, charge_number, nullif(charge->>'supplierId', '')::uuid, left(coalesce(nullif(btrim(charge->>'description'), ''), 'Charge'), 240),
      nullif(charge->>'internalNotes', ''), nullif(charge->>'customerNotes', ''), greatest(coalesce(nullif(charge->>'costRoe', '')::numeric, 1), 0.00001),
      coalesce(nullif(charge->>'costAmount', '')::numeric, 0), coalesce(nullif(charge->>'costLocal', '')::numeric, 0),
      greatest(coalesce(nullif(charge->>'sellRoe', '')::numeric, 1), 0.00001), coalesce(nullif(charge->>'sellAmount', '')::numeric, 0),
      coalesce(nullif(charge->>'sellLocal', '')::numeric, 0), coalesce((charge->>'showToCustomer')::boolean, true), actor_user_id, actor_user_id
    );
 end loop;
 update public."Job_Header" set "Job_SourceSnapshotJSON"=coalesce("Job_SourceSnapshotJSON",'{}'::jsonb)||'{"provisionalChargesReleased":true}'::jsonb where "Job_ID"=job_id;
 return new;
end $$;
create trigger provisional_quote_charges after update of "Job_Status" on public."Job_Header"
for each row execute function booking_api.release_provisional_quote_charges();
revoke all on function booking_api.finance_job_columns(),booking_api.require_financial_booking(uuid),booking_api.guard_financial_booking(),booking_api.guard_provisional_finance_history(),booking_api.release_provisional_quote_charges() from public,anon,authenticated,service_role;

update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description"="AIDexterDomain_Description"||' Provisional bookings must have no financial records: invoices, charge lines, job allocations, accruals and WIP require progression first. Accepted-quote charges stay in the source quote until progression. Existing historical finance evidence is retained.' where "AIDexterDomain_Code" in ('bookings','finance');
-- Enable the complete lifecycle only once finance prevention is installed.
create or replace function booking_api.workspace_with_document_groups(caller_auth_user_id uuid,requested_reference text)
returns jsonb language sql security definer set search_path='' as $$
 select booking_api.workspace_before_lifecycle_20260910(caller_auth_user_id,requested_reference) || '{"lifecycleSupported":true}'::jsonb;
$$;
commit;
