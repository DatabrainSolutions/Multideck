begin;

-- A source event becomes visible to the worker only with its source transaction.
-- This queue is evidence and scheduling, never independent posting authority.
create table public."FIN_ChargeLifecycleQueue" (
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  charge_id uuid not null references public."Job_Costing_Lines"("JobCostingLine_ID"),
  source_revision bigint not null default 1 check (source_revision > 0),
  event_types text[] not null default '{}',
  first_queued_at timestamptz not null default now(),
  last_queued_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','review','settled')),
  attempted_revision bigint,
  attempted_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  assigned_user_id uuid references public."cmp_Users"("User_ID"),
  reason text,
  primary key (legal_entity_id,charge_id)
);
create index on public."FIN_ChargeLifecycleQueue"(status,next_attempt_at,last_queued_at);
create table public."FIN_ChargeLifecycleEvents" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  charge_id uuid not null references public."Job_Costing_Lines"("JobCostingLine_ID"),
  source_revision bigint not null,
  event_type text not null check (event_type in ('estimate','job_status','invoice_link','invoice_posting','credit_or_reversal','service_evidence','cost_movement','wip_movement')),
  source_table text not null,
  source_id uuid not null,
  recorded_at timestamptz not null default now(),
  unique (legal_entity_id,charge_id,source_revision)
);
create index on public."FIN_ChargeLifecycleEvents"(legal_entity_id,charge_id,recorded_at desc);
alter table public."FIN_ChargeLifecycleQueue" enable row level security;
alter table public."FIN_ChargeLifecycleEvents" enable row level security;
revoke all on public."FIN_ChargeLifecycleQueue",public."FIN_ChargeLifecycleEvents" from public,anon,authenticated;
grant select,insert,update on public."FIN_ChargeLifecycleQueue" to service_role;
grant select,insert on public."FIN_ChargeLifecycleEvents" to service_role;

create function public._multideck_charge_lifecycle_enqueue(
  p_entity uuid,p_charge uuid,p_event text,p_source_table text,p_source_id uuid
) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_revision bigint;
begin
  if p_entity is null or p_charge is null or p_source_id is null then return; end if;
  if p_event not in ('estimate','job_status','invoice_link','invoice_posting','credit_or_reversal','service_evidence','cost_movement','wip_movement') then
    raise exception 'Unsupported charge lifecycle event.' using errcode='22023';
  end if;
  -- The charge must still belong to the tenant entity. A link from another
  -- entity is never permission to enqueue a foreign charge.
  perform 1 from public."Job_Costing_Lines" charge join public."Job_Header" job on job."Job_ID"=charge."Job_ID"
    where charge."JobCostingLine_ID"=p_charge and job."Job_LegalEntityID"=p_entity;
  if not found then return; end if;
  insert into public."FIN_ChargeLifecycleQueue"(legal_entity_id,charge_id,event_types,assigned_user_id)
    values(p_entity,p_charge,array[p_event],(select authorised_by from public."FIN_CostAutomation" where legal_entity_id=p_entity))
    on conflict (legal_entity_id,charge_id) do update set
      source_revision="FIN_ChargeLifecycleQueue".source_revision+1,
      event_types=(select array_agg(distinct event) from unnest("FIN_ChargeLifecycleQueue".event_types||excluded.event_types) event),
      last_queued_at=now(),status='pending',next_attempt_at=now(),reason=null,
      assigned_user_id=coalesce(excluded.assigned_user_id,"FIN_ChargeLifecycleQueue".assigned_user_id)
    returning source_revision into v_revision;
  insert into public."FIN_ChargeLifecycleEvents"(legal_entity_id,charge_id,source_revision,event_type,source_table,source_id)
    values(p_entity,p_charge,v_revision,p_event,p_source_table,p_source_id);
end; $$;
revoke all on function public._multideck_charge_lifecycle_enqueue(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public._multideck_charge_lifecycle_enqueue(uuid,uuid,text,text,uuid) to service_role;

create function public._multideck_charge_lifecycle_source_event() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_row record; v_entity uuid; v_charge uuid; v_kind text;
begin
  if tg_table_name='Job_Costing_Lines' then
    if tg_op='UPDATE' then
      if (new."JobCostingLine_CostAmountLocal",new."JobCostingLine_RevenueAmountLocal",new."JobCostingLine_ChargeCodeID",new."JobCostingLine_SupplierID")
        is not distinct from (old."JobCostingLine_CostAmountLocal",old."JobCostingLine_RevenueAmountLocal",old."JobCostingLine_ChargeCodeID",old."JobCostingLine_SupplierID") then return new; end if;
    end if;
    select "Job_LegalEntityID" into v_entity from public."Job_Header" where "Job_ID"=new."Job_ID";
    perform public._multideck_charge_lifecycle_enqueue(v_entity,new."JobCostingLine_ID",'estimate',tg_table_name,new."JobCostingLine_ID");
  elsif tg_table_name='Job_Header' then
    if (new."Job_Status",new."Job_IsDeleted",new."Job_LegalEntityID")
      is not distinct from (old."Job_Status",old."Job_IsDeleted",old."Job_LegalEntityID") then return new; end if;
    for v_row in select "JobCostingLine_ID" charge_id from public."Job_Costing_Lines" where "Job_ID"=new."Job_ID" loop
      perform public._multideck_charge_lifecycle_enqueue(new."Job_LegalEntityID",v_row.charge_id,'job_status',tg_table_name,new."Job_ID");
    end loop;
  elsif tg_table_name='FIN_DocumentLineJobLinks' then
    if tg_op='UPDATE' then
      if (new."FINDocLineJob_JobCostingLineID",new."FINDocLineJob_LocalNetAmount",new."FINDocLineJob_DocumentID")
        is not distinct from (old."FINDocLineJob_JobCostingLineID",old."FINDocLineJob_LocalNetAmount",old."FINDocLineJob_DocumentID") then return new; end if;
    end if;
    for v_row in select distinct charge_id,document_id from (values
      (case when tg_op<>'INSERT' then old."FINDocLineJob_JobCostingLineID" end,case when tg_op<>'INSERT' then old."FINDocLineJob_DocumentID" end),
      (case when tg_op<>'DELETE' then new."FINDocLineJob_JobCostingLineID" end,case when tg_op<>'DELETE' then new."FINDocLineJob_DocumentID" end)
    ) source(charge_id,document_id) where charge_id is not null loop
      select "FINDoc_LegalEntityID" into v_entity from public."FIN_Documents" where "FINDoc_ID"=v_row.document_id;
      perform public._multideck_charge_lifecycle_enqueue(v_entity,v_row.charge_id,'invoice_link',tg_table_name,v_row.document_id);
    end loop;
  elsif tg_table_name='FIN_Documents' then
    if tg_op='UPDATE' then
      if (new."FINDoc_PostingStatusCode",new."FINDoc_NativePostingStatusCode",new."FINDoc_TypeCode",new."FINDoc_AccountingDate",new."FINDoc_PartyOrgID")
        is not distinct from (old."FINDoc_PostingStatusCode",old."FINDoc_NativePostingStatusCode",old."FINDoc_TypeCode",old."FINDoc_AccountingDate",old."FINDoc_PartyOrgID") then return new; end if;
    end if;
    v_kind:=case when new."FINDoc_TypeCode" in ('credit_note','debit_note') or new."FINDoc_NativePostingStatusCode"='reversed' then 'credit_or_reversal' else 'invoice_posting' end;
    for v_row in select distinct "FINDocLineJob_JobCostingLineID" charge_id from public."FIN_DocumentLineJobLinks"
      where "FINDocLineJob_DocumentID"=new."FINDoc_ID" and "FINDocLineJob_JobCostingLineID" is not null loop
      perform public._multideck_charge_lifecycle_enqueue(new."FINDoc_LegalEntityID",v_row.charge_id,v_kind,tg_table_name,new."FINDoc_ID");
    end loop;
  elsif tg_table_name='FIN_CostEvidence' then
    perform public._multideck_charge_lifecycle_enqueue(new.legal_entity_id,new.charge_id,'service_evidence',tg_table_name,new.id);
  elsif tg_table_name='FIN_Accruals' then
    if tg_op='UPDATE' then
      if (new."FINAccrual_AccruedAmount",new."FINAccrual_RelievedAmount",new."FINAccrual_StatusCode")
        is not distinct from (old."FINAccrual_AccruedAmount",old."FINAccrual_RelievedAmount",old."FINAccrual_StatusCode") then return new; end if;
    end if;
    select "FINPeriod_LegalEntityID" into v_entity from public."FIN_Periods" where "FINPeriod_ID"=new."FINAccrual_PeriodID";
    perform public._multideck_charge_lifecycle_enqueue(v_entity,new."FINAccrual_JobCostingLineID",'cost_movement',tg_table_name,new."FINAccrual_ID");
  elsif tg_table_name='FIN_WIPItems' then
    if tg_op='UPDATE' then
      if (new."FINWIP_WIPAmount",new."FINWIP_RelievedAmount",new."FINWIP_StatusCode")
        is not distinct from (old."FINWIP_WIPAmount",old."FINWIP_RelievedAmount",old."FINWIP_StatusCode") then return new; end if;
    end if;
    select "FINPeriod_LegalEntityID" into v_entity from public."FIN_Periods" where "FINPeriod_ID"=new."FINWIP_PeriodID";
    perform public._multideck_charge_lifecycle_enqueue(v_entity,new."FINWIP_JobCostingLineID",'wip_movement',tg_table_name,new."FINWIP_ID");
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public._multideck_charge_lifecycle_source_event() from public,anon,authenticated;
create trigger charge_lifecycle_estimate after insert or update on public."Job_Costing_Lines"
  for each row execute function public._multideck_charge_lifecycle_source_event();
create trigger charge_lifecycle_job_status after update on public."Job_Header"
  for each row execute function public._multideck_charge_lifecycle_source_event();
create trigger charge_lifecycle_document_link after insert or update or delete on public."FIN_DocumentLineJobLinks"
  for each row execute function public._multideck_charge_lifecycle_source_event();
create trigger charge_lifecycle_document_status after update on public."FIN_Documents"
  for each row execute function public._multideck_charge_lifecycle_source_event();
create trigger charge_lifecycle_service_evidence after insert on public."FIN_CostEvidence"
  for each row execute function public._multideck_charge_lifecycle_source_event();
create trigger charge_lifecycle_cost_movement after insert or update on public."FIN_Accruals"
  for each row execute function public._multideck_charge_lifecycle_source_event();
create trigger charge_lifecycle_wip_movement after insert or update on public."FIN_WIPItems"
  for each row execute function public._multideck_charge_lifecycle_source_event();

create function public.multideck_finance_charge_lifecycle_queue(p_actor uuid,p_entity uuid,p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View');
  if p_limit is null or p_limit not between 1 and 200 then raise exception 'Invalid queue page size.' using errcode='22023'; end if;
  return jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(q) order by q.last_queued_at,q.charge_id) from
    (select legal_entity_id,charge_id,source_revision,event_types,first_queued_at,last_queued_at,status,
      attempted_revision,attempted_at,attempts,next_attempt_at,assigned_user_id,reason
      from public."FIN_ChargeLifecycleQueue" where legal_entity_id=p_entity order by last_queued_at,charge_id limit p_limit) q),'[]'::jsonb));
end; $$;
revoke all on function public.multideck_finance_charge_lifecycle_queue(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.multideck_finance_charge_lifecycle_queue(uuid,uuid,integer) to service_role;

commit;
