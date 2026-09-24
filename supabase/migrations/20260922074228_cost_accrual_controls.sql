begin;

-- All mutations are server-authorised. Browser roles cannot edit evidence or
-- manufacture approval identities, and approval never implies activation.
create table public."FIN_CostPolicies" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  revision integer not null check(revision>0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  under_percent numeric(7,4) not null check(under_percent between 0 and 100),
  under_cap numeric(18,4) not null check(under_cap>=0),
  over_percent numeric(7,4) not null check(over_percent between 0 and 100),
  over_cap numeric(18,4) not null check(over_cap>=0),
  auto_finalise boolean not null default false,
  recognition_rule text not null check(length(trim(recognition_rule)) between 10 and 2000),
  created_by uuid not null references public."cmp_Users"("User_ID"),
  created_at timestamptz not null default now(),
  approved_by uuid references public."cmp_Users"("User_ID"),
  approved_at timestamptz,
  approval_reason text,
  unique(legal_entity_id,revision),
  check ((approved_by is null and approved_at is null) or (approved_by is not null and approved_at is not null and approved_by<>created_by))
);
create table public."FIN_CostEvidence" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  charge_id uuid not null references public."Job_Costing_Lines"("JobCostingLine_ID"),
  source_revision text not null,
  service_completed_on date not null,
  invoice_received_on date,
  final_document_id uuid references public."FIN_Documents"("FINDoc_ID"),
  is_final boolean not null default false,
  disputed boolean not null default false,
  reason text not null check(length(trim(reason)) between 5 and 2000),
  recorded_by uuid not null references public."cmp_Users"("User_ID"),
  recorded_at timestamptz not null default now(),
  check(not is_final or (final_document_id is not null and invoice_received_on is not null)),
  check(invoice_received_on is null or invoice_received_on>=service_completed_on)
);
create index on public."FIN_CostEvidence"(legal_entity_id,charge_id,recorded_at desc,id);
create table public."FIN_CostControlAudit" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  actor_id uuid not null references public."cmp_Users"("User_ID"),
  action text not null,
  record_id uuid not null,
  snapshot jsonb not null,
  occurred_at timestamptz not null default now()
);
create index on public."FIN_CostControlAudit"(legal_entity_id,occurred_at desc);
alter table public."FIN_CostPolicies" enable row level security;
alter table public."FIN_CostEvidence" enable row level security;
alter table public."FIN_CostControlAudit" enable row level security;
revoke all on public."FIN_CostPolicies",public."FIN_CostEvidence",public."FIN_CostControlAudit" from public,anon,authenticated;
grant select,insert,update on public."FIN_CostPolicies" to service_role;
grant select,insert on public."FIN_CostEvidence",public."FIN_CostControlAudit" to service_role;

insert into public."sys_WorkflowRecordTypes"("WorkflowRecordType_Code","WorkflowRecordType_Name","WorkflowRecordType_SourceTable","WorkflowRecordType_Description")
values ('cost_control','Charge cost control','FIN_CostControlAudit','Policy approval and charge evidence with immutable snapshots')
on conflict("WorkflowRecordType_Code") do nothing;

-- Source identity deliberately excludes accrual relief: an invoice release is
-- not new supplier evidence. Every estimate, supplier, link or invoice change
-- invalidates prior final confirmation, including same-total replacements.
create function public._multideck_cost_source(p_entity uuid,p_charge uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  select jsonb_build_object('charge',to_jsonb(l),'job',jsonb_build_object('id',j."Job_ID",'status',j."Job_Status",'deleted',j."Job_IsDeleted"),
    'documents',coalesce((select jsonb_agg(jsonb_build_object('link',to_jsonb(k),'document',to_jsonb(d)) order by k."FINDocLineJob_ID")
      from public."FIN_DocumentLineJobLinks" k join public."FIN_Documents" d on d."FINDoc_ID"=k."FINDocLineJob_DocumentID"
      where k."FINDocLineJob_JobCostingLineID"=p_charge and k."FINDocLineJob_JobID"=j."Job_ID"),'[]'::jsonb)) into result
  from public."Job_Costing_Lines" l join public."Job_Header" j on j."Job_ID"=l."Job_ID" and j."Job_LegalEntityID"=p_entity
  join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
  join public."cmp_LegalEntities" e on e."LegalEntity_ID"=p_entity and e."Company_ID"=o."Company_ID"
  where l."JobCostingLine_ID"=p_charge;
  if result is null then raise exception 'Charge is not accessible in this legal entity.' using errcode='42501'; end if;
  return result;
end; $$;
revoke all on function public._multideck_cost_source(uuid,uuid) from public,anon,authenticated;
grant execute on function public._multideck_cost_source(uuid,uuid) to service_role;

create function public.multideck_finance_cost_controls(p_actor uuid,p_entity uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare policy public."FIN_CostPolicies"; evidence public."FIN_CostEvidence"; source jsonb; result jsonb; audit_id uuid;
  v_currency text; charge uuid; source_version text; value text; amount numeric; received date; completed date;
begin
  perform public._multideck_journal_access(p_actor,p_entity,case when p_action in ('read','charge','history') then 'Finance.Management.View'
    when p_action='approve_policy' then 'Finance.Management.Approve' else 'Finance.Management.Prepare' end);
  if p_action not in ('read','charge','history','save_policy','approve_policy','record_evidence') then raise exception 'Unknown cost control action.' using errcode='22023'; end if;
  select "LegalEntity_BaseCurrencyCodeSnapshot" into v_currency from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
  if p_action='read' then
    return jsonb_build_object('policies',coalesce((select jsonb_agg(to_jsonb(p) order by revision desc) from
      (select * from public."FIN_CostPolicies" where legal_entity_id=p_entity order by revision desc limit 20) p),'[]'::jsonb),
      'postingEnabled',coalesce((select enabled from public."FIN_CostAutomation" where legal_entity_id=p_entity),false),'currency',v_currency,
      'canPost',public._multideck_dexter_has_permission(p_actor,'Finance.Management.Post'),
      'cases',coalesce((select jsonb_agg(to_jsonb(f) order by evaluated_at desc) from (select id,charge_id,evidence_id,status,reason,journal_id,evaluated_at,snapshot->>'estimate' estimate,snapshot->>'actual' actual,snapshot->>'residual' residual from public."FIN_CostFinalisations" where legal_entity_id=p_entity order by evaluated_at desc limit 50) f),'[]'::jsonb),
      'canPrepare',public._multideck_dexter_has_permission(p_actor,'Finance.Management.Prepare'),
      'canApprove',public._multideck_dexter_has_permission(p_actor,'Finance.Management.Approve'),
      'actorId',p_actor);
  elsif p_action='save_policy' then
    -- Entity lock serialises revision allocation, even before the first policy.
    perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for update;
    if v_currency is null or v_currency!~'^[A-Z]{3}$' then raise exception 'Configure the entity base currency.' using errcode='22023'; end if;
    foreach value in array array['underPercent','underCap','overPercent','overCap'] loop
      if coalesce(p_input->>value,'') !~ '^\d{1,12}(\.\d{1,4})?$' then raise exception 'Use non-negative decimal limits with up to four places.' using errcode='22023'; end if;
      amount:=(p_input->>value)::numeric;
      if value in ('underPercent','overPercent') and amount>100 then raise exception 'Percentage limits cannot exceed 100.' using errcode='22023'; end if;
    end loop;
    if coalesce(length(trim(p_input->>'recognitionRule')),0) not between 10 and 2000 then raise exception 'Describe the completed-service evidence required for accrual recognition.' using errcode='22023'; end if;
    insert into public."FIN_CostPolicies"(legal_entity_id,revision,currency,under_percent,under_cap,over_percent,over_cap,auto_finalise,recognition_rule,created_by)
      select p_entity,coalesce(max(revision),0)+1,v_currency,(p_input->>'underPercent')::numeric,(p_input->>'underCap')::numeric,
        (p_input->>'overPercent')::numeric,(p_input->>'overCap')::numeric,coalesce((p_input->>'autoFinalise')::boolean,false),trim(p_input->>'recognitionRule'),p_actor
      from public."FIN_CostPolicies" where legal_entity_id=p_entity returning * into policy;
    result:=to_jsonb(policy);
  elsif p_action='approve_policy' then
    perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for update;
    select * into policy from public."FIN_CostPolicies" where id=(p_input->>'id')::uuid and legal_entity_id=p_entity for update;
    if not found then raise exception 'Policy not found.' using errcode='P0002'; end if;
    if policy.created_by=p_actor then raise exception 'Another authorised colleague must approve this policy.' using errcode='42501'; end if;
    if policy.currency is distinct from v_currency or exists(select 1 from public."FIN_CostPolicies" where legal_entity_id=p_entity and revision>policy.revision) then raise exception 'This policy is superseded. Review the latest revision.' using errcode='22023'; end if;
    if policy.approved_by is not null then return to_jsonb(policy); end if;
    if coalesce(length(trim(p_input->>'reason')),0) not between 5 and 2000 then raise exception 'Record the policy approval reason.' using errcode='22023'; end if;
    update public."FIN_CostPolicies" set approved_by=p_actor,approved_at=now(),approval_reason=trim(p_input->>'reason') where id=policy.id returning * into policy;
    result:=to_jsonb(policy);
  else
    charge:=(p_input->>'chargeId')::uuid;
    source:=public._multideck_cost_source(p_entity,charge); source_version:=md5(source::text);
    if p_action='charge' then
      select * into evidence from public."FIN_CostEvidence" where charge_id=charge and legal_entity_id=p_entity order by recorded_at desc,id desc limit 1;
      return jsonb_build_object('revision',source_version,'evidence',case when evidence.id is null then null else to_jsonb(evidence) end,
        'evidenceCurrent',evidence.source_revision=source_version,
        'finalisation',(select jsonb_build_object('status',f.status,'reason',f.reason,'journalId',f.journal_id,'mirrorStatus',j.mirror_status,'mirrorError',j.mirror_error) from public."FIN_CostFinalisations" f left join public."FIN_Journals" j on j.id=f.journal_id where f.charge_id=charge and f.legal_entity_id=p_entity order by f.evaluated_at desc limit 1),
        'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d->'document'->>'FINDoc_ID','number',d->'document'->>'FINDoc_Number'))
          from jsonb_array_elements(source->'documents') d where d->'document'->>'FINDoc_TypeCode'='pl_invoice'
            and d->'document'->>'FINDoc_NativePostingStatusCode'='posted' and d->'document'->>'FINDoc_LegalEntityID'=p_entity::text
            and d->'document'->>'FINDoc_PartyOrgID'=source->'charge'->>'JobCostingLine_SupplierID'),'[]'::jsonb),
        'history',coalesce((select jsonb_agg(to_jsonb(x) order by recorded_at desc) from
          (select * from public."FIN_CostEvidence" where charge_id=charge and legal_entity_id=p_entity order by recorded_at desc,id desc limit 20) x),'[]'::jsonb));
    elsif p_action='history' then
      -- Real evidence only, same entity/supplier/charge code, excluding this
      -- charge. Censor all still-open observations at the server's current date.
      return coalesce((select jsonb_agg(jsonb_build_object('days',case when x.is_final then x.invoice_received_on-x.service_completed_on else current_date-x.service_completed_on end,'invoiced',x.is_final))
        from (select distinct on(e.charge_id) e.* from public."FIN_CostEvidence" e
          join public."Job_Costing_Lines" l on l."JobCostingLine_ID"=e.charge_id
          where e.legal_entity_id=p_entity and e.charge_id<>charge
            and l."JobCostingLine_SupplierID"::text=source->'charge'->>'JobCostingLine_SupplierID'
            and l."JobCostingLine_ChargeCodeID"::text=source->'charge'->>'JobCostingLine_ChargeCodeID'
          order by e.charge_id,e.recorded_at desc,e.id desc) x
        where not x.disputed and x.source_revision=md5(public._multideck_cost_source(p_entity,x.charge_id)::text)),'[]'::jsonb);
    end if;
    if p_input->>'revision' is distinct from source_version then raise exception 'Charge evidence changed. Refresh and review before confirming.' using errcode='40001'; end if;
    completed:=(p_input->>'serviceCompletedOn')::date; received:=nullif(p_input->>'invoiceReceivedOn','')::date;
    if completed is null or completed>current_date or received>current_date or received<completed then raise exception 'Use actual service and invoice receipt dates, not future dates.' using errcode='22023'; end if;
    if coalesce(length(trim(p_input->>'reason')),0) not between 5 and 2000 then raise exception 'Describe the source evidence for this confirmation.' using errcode='22023'; end if;
    if coalesce((p_input->>'isFinal')::boolean,false) then
      if received is null or not exists(select 1 from jsonb_array_elements(source->'documents') d
        where d->'document'->>'FINDoc_ID'=p_input->>'finalDocumentId' and d->'document'->>'FINDoc_TypeCode'='pl_invoice'
          and d->'document'->>'FINDoc_NativePostingStatusCode'='posted' and d->'document'->>'FINDoc_LegalEntityID'=p_entity::text
          and d->'document'->>'FINDoc_PartyOrgID'=source->'charge'->>'JobCostingLine_SupplierID') then
        raise exception 'Choose an exactly matched posted supplier invoice and its received date.' using errcode='22023'; end if;
    end if;
    insert into public."FIN_CostEvidence"(legal_entity_id,charge_id,source_revision,service_completed_on,invoice_received_on,final_document_id,is_final,disputed,reason,recorded_by)
      values(p_entity,charge,source_version,completed,received,case when coalesce((p_input->>'isFinal')::boolean,false) then (p_input->>'finalDocumentId')::uuid else null end,
        coalesce((p_input->>'isFinal')::boolean,false),coalesce((p_input->>'disputed')::boolean,false),trim(p_input->>'reason'),p_actor) returning * into evidence;
    result:=to_jsonb(evidence);
  end if;
  insert into public."FIN_CostControlAudit"(legal_entity_id,actor_id,action,record_id,snapshot)
    values(p_entity,p_actor,p_action,(result->>'id')::uuid,result) returning id into audit_id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_CostControlAudit','cost_control',audit_id,p_action,'Cost accrual control · '||p_action,true,1,result);
  return result;
end; $$;
revoke all on function public.multideck_finance_cost_controls(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_cost_controls(uuid,uuid,text,jsonb) to service_role;
commit;
