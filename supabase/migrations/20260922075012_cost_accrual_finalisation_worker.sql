begin;
-- This worker finalises the remaining balance of existing charge accruals.
-- Initial/service accrual recognition stays in the approved period workflow.
create table public."FIN_CostAutomation" (
  legal_entity_id uuid primary key references public."cmp_LegalEntities"("LegalEntity_ID"),
  policy_id uuid not null references public."FIN_CostPolicies"(id),
  enabled boolean not null default false,
  authorised_by uuid not null references public."cmp_Users"("User_ID"),
  authorised_at timestamptz not null default now(),
  reason text not null check(length(trim(reason)) between 5 and 2000)
);
create table public."FIN_CostFinalisations" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  charge_id uuid not null references public."Job_Costing_Lines"("JobCostingLine_ID"),
  evidence_id uuid not null unique references public."FIN_CostEvidence"(id),
  policy_id uuid not null references public."FIN_CostPolicies"(id),
  status text not null check(status in ('review','posted','settled')),
  reason text not null,
  journal_id uuid references public."FIN_Journals"(id),
  snapshot jsonb not null,
  evaluated_at timestamptz not null default now()
);
create index on public."FIN_CostFinalisations"(legal_entity_id,status,evaluated_at);
create table public."FIN_CostExceptionApprovals" (
  id uuid primary key default gen_random_uuid(),
  finalisation_id uuid not null references public."FIN_CostFinalisations"(id),
  snapshot_hash text not null,
  approved_by uuid not null references public."cmp_Users"("User_ID"),
  approved_at timestamptz not null default now(),
  reason text not null check(length(trim(reason)) between 5 and 2000)
);
create index on public."FIN_CostExceptionApprovals"(finalisation_id,approved_at desc);
alter table public."FIN_CostExceptionApprovals" enable row level security;
revoke all on public."FIN_CostExceptionApprovals" from public,anon,authenticated;
grant select,insert on public."FIN_CostExceptionApprovals" to service_role;
alter table public."FIN_CostAutomation" enable row level security;
alter table public."FIN_CostFinalisations" enable row level security;
revoke all on public."FIN_CostAutomation",public."FIN_CostFinalisations" from public,anon,authenticated;
grant select,insert,update on public."FIN_CostAutomation",public."FIN_CostFinalisations" to service_role;

create function public.multideck_cost_automation(p_actor uuid,p_entity uuid,p_enabled boolean,p_policy uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_policy public."FIN_CostPolicies"; result jsonb; audit_id uuid;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Post');
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Approve');
  perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for update;
  select * into v_policy from public."FIN_CostPolicies" where id=p_policy and legal_entity_id=p_entity;
  if not found or (p_enabled and (v_policy.approved_by is null or not v_policy.auto_finalise or exists(select 1 from public."FIN_CostPolicies" where legal_entity_id=p_entity and revision>v_policy.revision))) then
    raise exception 'Approve the latest automatic-finalisation policy first.' using errcode='22023'; end if;
  if p_enabled is null or coalesce(length(trim(p_reason)),0) not between 5 and 2000 then raise exception 'Record an activation or pause reason.' using errcode='22023'; end if;
  insert into public."FIN_CostAutomation"(legal_entity_id,policy_id,enabled,authorised_by,reason)
    values(p_entity,p_policy,p_enabled,p_actor,trim(p_reason)) on conflict(legal_entity_id) do update
    set policy_id=excluded.policy_id,enabled=excluded.enabled,authorised_by=excluded.authorised_by,authorised_at=now(),reason=excluded.reason returning to_jsonb("FIN_CostAutomation".*) into result;
  insert into public."FIN_CostControlAudit"(legal_entity_id,actor_id,action,record_id,snapshot) values(p_entity,p_actor,'automation',p_policy,result) returning id into audit_id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_CostControlAudit','cost_control',audit_id,'automation','Cost finalisation automation changed',result);
  return result;
end; $$;
revoke all on function public.multideck_cost_automation(uuid,uuid,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_cost_automation(uuid,uuid,boolean,uuid,text) to service_role;

create function public.multideck_cost_finalise(p_entity uuid,p_evidence uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare settings public."FIN_CostAutomation"; policy public."FIN_CostPolicies"; evidence public."FIN_CostEvidence";
  source jsonb; actual numeric; estimate numeric; variance numeric; cap numeric; pct numeric; remaining numeric:=0;
  reasons text[]:='{}'; v_period uuid; v_currency text; v_mode text; v_connected boolean; v_native boolean;
  a record; line record; original uuid; expense uuid; control uuid; journal uuid; batch uuid; number bigint;
  lines jsonb:='[]'; idx integer:=0; final_id uuid; existing public."FIN_CostFinalisations";
  v_snapshot jsonb; approval public."FIN_CostExceptionApprovals";
begin
  -- Short, bounded native transaction. Source-table locks prevent invoice/link
  -- phantoms between confirmation validation and posting. Provider IO is outside.
  perform set_config('lock_timeout','2s',true);
  perform set_config('statement_timeout','15s',true);
  lock table public."FIN_Documents",public."FIN_DocumentLineJobLinks",public."Job_Costing_Lines",public."Job_Header",public."FIN_Accruals" in share row exclusive mode;
  select * into settings from public."FIN_CostAutomation" where legal_entity_id=p_entity for share;
  if not found or not settings.enabled then return jsonb_build_object('status','disabled'); end if;
  perform public._multideck_journal_access(settings.authorised_by,p_entity,'Finance.Management.Post');
  perform public._multideck_journal_access(settings.authorised_by,p_entity,'Finance.Management.Approve');
  select * into policy from public."FIN_CostPolicies" where id=settings.policy_id and legal_entity_id=p_entity for share;
  if policy.approved_by is null or not policy.auto_finalise or exists(select 1 from public."FIN_CostPolicies" where legal_entity_id=p_entity and revision>policy.revision) then
    return jsonb_build_object('status','review','reason','Latest policy approval required'); end if;
  perform public._multideck_journal_access(policy.approved_by,p_entity,'Finance.Management.Approve');
  select * into evidence from public."FIN_CostEvidence" where id=p_evidence and legal_entity_id=p_entity;
  if not found then raise exception 'Evidence not found.' using errcode='P0002'; end if;
  select * into existing from public."FIN_CostFinalisations" where evidence_id=p_evidence for update;
  if existing.status in ('posted','settled') then return to_jsonb(existing); end if;
  source:=public._multideck_cost_source(p_entity,evidence.charge_id);
  if not evidence.is_final or evidence.disputed or evidence.source_revision<>md5(source::text) or exists(select 1 from public."FIN_CostEvidence" e where e.charge_id=evidence.charge_id and (e.recorded_at,e.id)>(evidence.recorded_at,evidence.id)) then reasons:=array_append(reasons,'Current undisputed final-invoice confirmation required'); end if;
  if source->'job'->>'status' in ('draft','provisional','cancelled') or (source->'job'->>'deleted')::boolean then reasons:=array_append(reasons,'Job eligibility requires review'); end if;
  select "LegalEntity_BaseCurrencyCodeSnapshot" into v_currency from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
  if policy.currency is distinct from v_currency then reasons:=array_append(reasons,'Policy currency changed'); end if;
  if exists(select 1 from jsonb_array_elements(source->'documents') d where d->'document'->>'FINDoc_LegalEntityID' is distinct from p_entity::text
    or d->'document'->>'FINDoc_PartyOrgID' is distinct from source->'charge'->>'JobCostingLine_SupplierID'
    or d->'document'->>'FINDoc_TypeCode'<>'pl_invoice' or d->'document'->>'FINDoc_NativePostingStatusCode'<>'posted'
    or (d->'link'->>'FINDocLineJob_LocalNetAmount')::numeric<=0) then reasons:=array_append(reasons,'Invoice, credit, reversal or supplier match requires review'); end if;
  select coalesce(sum((d->'link'->>'FINDocLineJob_LocalNetAmount')::numeric),0) into actual from jsonb_array_elements(source->'documents') d;
  estimate:=(source->'charge'->>'JobCostingLine_CostAmountLocal')::numeric;
  if actual<=0 or estimate is null or estimate<0 then reasons:=array_append(reasons,'Positive actual and valid estimate required'); end if;
  variance:=abs(actual-estimate); cap:=case when actual>estimate then policy.over_cap else policy.under_cap end;
  pct:=case when actual>estimate then policy.over_percent else policy.under_percent end;
  if variance>cap or variance*100>estimate*pct then reasons:=array_append(reasons,'Outside approved tolerance; human review required'); end if;
  select mirror_mode,active_connection,native_ledger_enabled into v_mode,v_connected,v_native from public._multideck_finance_mirror_state(p_entity);
  if not v_native or (v_mode='required' and not v_connected) then reasons:=array_append(reasons,'Native ledger or required mirror is not ready'); end if;
  select "FINPeriod_ID" into v_period from public."FIN_Periods" where "FINPeriod_LegalEntityID"=p_entity and "FINPeriod_Code"=to_char(current_date,'YYYYMM') and "FINPeriod_StatusCode"='open' for update;
  if v_period is null then reasons:=array_append(reasons,'Current accounting period must exist and be open'); end if;
  -- One original debit/credit pair per source accrual; never infer the expense
  -- from a changed charge-code mapping. Unsupported historical shapes stop.
  for a in select ac.*,p."FINPeriod_LegalEntityID" entity from public."FIN_Accruals" ac join public."FIN_Periods" p on p."FINPeriod_ID"=ac."FINAccrual_PeriodID"
    where ac."FINAccrual_JobCostingLineID"=evidence.charge_id and ac."FINAccrual_AccruedAmount">ac."FINAccrual_RelievedAmount" order by ac."FINAccrual_ID" loop
    if a.entity<>p_entity or a."FINAccrual_CurrencyCodeSnapshot" is distinct from v_currency or a."FINAccrual_StatusCode" not in ('posted','partially_reversed') or a."FINAccrual_RelievedAmount"<0 then reasons:=array_append(reasons,'Accrual balance or currency requires review'); continue; end if;
    select r."FINCloseRun_PostingBatchID" into original from public."FIN_PeriodCloseRunItems" i join public."FIN_PeriodCloseRuns" r on r."FINCloseRun_ID"=i."FINCloseItem_CloseRunID" where i."FINCloseItem_ID"=a."FINAccrual_CloseRunItemID" and r."FINCloseRun_LegalEntityID"=p_entity;
    expense:=null; control:=null;
    if (select count(*) from public."FIN_PostingLines" where "FINPostLine_BatchID"=original and "FINPostLine_AccrualID"=a."FINAccrual_ID")=2 then
      select "FINPostLine_NominalAccountID" into expense from public."FIN_PostingLines" where "FINPostLine_BatchID"=original and "FINPostLine_AccrualID"=a."FINAccrual_ID" and "FINPostLine_DebitAmount"=a."FINAccrual_AccruedAmount" and "FINPostLine_CreditAmount"=0;
      select "FINPostLine_NominalAccountID" into control from public."FIN_PostingLines" where "FINPostLine_BatchID"=original and "FINPostLine_AccrualID"=a."FINAccrual_ID" and "FINPostLine_CreditAmount"=a."FINAccrual_AccruedAmount" and "FINPostLine_DebitAmount"=0;
    end if;
    if expense is null or control is null or expense=control or (select count(*) from public."FIN_NominalAccounts" where "FINNom_ID" in (expense,control) and "FINNom_LegalEntityID"=p_entity and "FINNom_IsActive")<>2 then reasons:=array_append(reasons,'Original balanced nominal mapping requires review'); continue; end if;
    lines:=lines||jsonb_build_array(jsonb_build_object('accountId',control,'debit',(a."FINAccrual_AccruedAmount"-a."FINAccrual_RelievedAmount")::text,'credit','0.0000','accrualId',a."FINAccrual_ID"),
      jsonb_build_object('accountId',expense,'debit','0.0000','credit',(a."FINAccrual_AccruedAmount"-a."FINAccrual_RelievedAmount")::text,'accrualId',a."FINAccrual_ID"));
    remaining:=remaining+a."FINAccrual_AccruedAmount"-a."FINAccrual_RelievedAmount";
  end loop;
  -- A residual larger than estimate minus actual signals unreconciled invoice
  -- relief. Never call that a tolerance write-back.
  if remaining>greatest(estimate-actual,0) then reasons:=array_append(reasons,'Reconcile invoice relief before finalising the residual'); end if;
  if jsonb_array_length(lines)>200 then reasons:=array_append(reasons,'Large accrual history requires a reviewed adjustment'); end if;
  v_snapshot:=jsonb_build_object('sourceRevision',md5(source::text),'estimate',estimate::text,'actual',actual::text,'residual',remaining::text,'policy',to_jsonb(policy),'evidence',to_jsonb(evidence),'lines',lines);
  select * into approval from public."FIN_CostExceptionApprovals" where finalisation_id=existing.id and snapshot_hash=md5(v_snapshot::text) order by approved_at desc limit 1;
  if approval.id is not null then
    perform public._multideck_journal_access(approval.approved_by,p_entity,'Finance.Management.Approve');
    reasons:=array_remove(reasons,'Outside approved tolerance; human review required');
  end if;
  insert into public."FIN_CostFinalisations"(legal_entity_id,charge_id,evidence_id,policy_id,status,reason,snapshot)
    values(p_entity,evidence.charge_id,p_evidence,policy.id,'review',coalesce(array_to_string(reasons,'; '),''),v_snapshot)
    on conflict(evidence_id) do update set policy_id=excluded.policy_id,reason=excluded.reason,snapshot=excluded.snapshot,evaluated_at=now() returning id into final_id;
  if cardinality(reasons)>0 then
    insert into public."FIN_CostControlAudit"(legal_entity_id,actor_id,action,record_id,snapshot) select p_entity,settings.authorised_by,'review_required',final_id,to_jsonb(f) from public."FIN_CostFinalisations" f where id=final_id;
    return (select to_jsonb(f) from public."FIN_CostFinalisations" f where id=final_id);
  end if;
  if remaining>0 then
    insert into public."FIN_Journals"(legal_entity_id,accounting_date,reference,description,currency,lines,created_by,status,posted_by,posted_at,mirror_status)
      values(p_entity,current_date,'COST-FINAL','Final supplier cost variance',v_currency,lines,settings.authorised_by,'posted',settings.authorised_by,now(),case when v_mode<>'disabled' and v_connected then 'queued' else 'not_required' end) returning id,"FIN_Journals".number into journal,number;
    insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy")
      values('JN-'||number,'posted','FIN_Journals',journal,v_period,p_entity,remaining,remaining,v_currency,now(),settings.authorised_by,settings.authorised_by) returning "FINPostBatch_ID" into batch;
    for line in select value v from jsonb_array_elements(lines) loop
      idx:=idx+1;
      insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_JobID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot")
        values(batch,idx,(line.v->>'accountId')::uuid,(line.v->>'accrualId')::uuid,(source->'job'->>'id')::uuid,'Final supplier cost variance',(line.v->>'debit')::numeric,(line.v->>'credit')::numeric,v_currency);
      update public."FIN_Accruals" set "FINAccrual_RelievedAmount"="FINAccrual_AccruedAmount","FINAccrual_StatusCode"='reversed',"FINAccrual_ReversalPeriodID"=v_period,"FINAccrual_ReversedAt"=now(),"FINAccrual_ReversedBy"=settings.authorised_by where "FINAccrual_ID"=(line.v->>'accrualId')::uuid;
    end loop;
    update public."FIN_Journals" set batch_id=batch where id=journal;
  end if;
  update public."FIN_CostFinalisations" set status=case when remaining>0 then 'posted' else 'settled' end,reason=case when approval.id is null then 'Confirmed final invoice within both approved limits' else 'Confirmed final invoice with independent exception approval' end,journal_id=journal,
    snapshot=snapshot||jsonb_build_object('exceptionApprovalId',approval.id) where id=final_id;
  insert into public."FIN_CostControlAudit"(legal_entity_id,actor_id,action,record_id,snapshot) select p_entity,settings.authorised_by,'finalise',final_id,to_jsonb(f) from public."FIN_CostFinalisations" f where id=final_id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    select 'finance_lifecycle',settings.authorised_by,p_entity,'multideck-app','finance','public','FIN_CostFinalisations','cost_control',final_id,'finalise','Final supplier cost variance',to_jsonb(f) from public."FIN_CostFinalisations" f where id=final_id;
  return (select to_jsonb(f) from public."FIN_CostFinalisations" f where id=final_id);
end; $$;
revoke all on function public.multideck_cost_finalise(uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_cost_finalise(uuid,uuid) to service_role;

create function public.multideck_cost_approve_exception(p_actor uuid,p_entity uuid,p_case uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare f public."FIN_CostFinalisations"; e public."FIN_CostEvidence"; a public."FIN_CostExceptionApprovals"; audit_id uuid;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Approve');
  select * into f from public."FIN_CostFinalisations" where id=p_case and legal_entity_id=p_entity for update;
  if not found or f.status<>'review' or f.reason<>'Outside approved tolerance; human review required' then raise exception 'Resolve blocking evidence before approving a tolerance exception.' using errcode='22023'; end if;
  select * into e from public."FIN_CostEvidence" where id=f.evidence_id;
  if e.recorded_by=p_actor then raise exception 'Another authorised colleague must approve the exception.' using errcode='42501'; end if;
  if e.source_revision<>md5(public._multideck_cost_source(p_entity,f.charge_id)::text) then raise exception 'Evidence changed. Refresh the case.' using errcode='40001'; end if;
  if coalesce(length(trim(p_reason)),0) not between 5 and 2000 then raise exception 'Record an exception approval reason.' using errcode='22023'; end if;
  insert into public."FIN_CostExceptionApprovals"(finalisation_id,snapshot_hash,approved_by,reason) values(f.id,md5(f.snapshot::text),p_actor,trim(p_reason)) returning * into a;
  insert into public."FIN_CostControlAudit"(legal_entity_id,actor_id,action,record_id,snapshot) values(p_entity,p_actor,'approve_exception',a.id,to_jsonb(a)||jsonb_build_object('reviewedSnapshot',f.snapshot)) returning id into audit_id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_CostControlAudit','cost_control',audit_id,'approve_exception','Cost tolerance exception approved',to_jsonb(a)||jsonb_build_object('reviewedSnapshot',f.snapshot));
  return to_jsonb(a);
end; $$;
revoke all on function public.multideck_cost_approve_exception(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_cost_approve_exception(uuid,uuid,uuid,text) to service_role;

create function public.multideck_cost_work_queue()
returns jsonb language sql security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object(
  'pending',coalesce((select jsonb_agg(to_jsonb(q)) from (
    select e.id,e.legal_entity_id from public."FIN_CostEvidence" e
      join public."FIN_CostAutomation" a on a.legal_entity_id=e.legal_entity_id and a.enabled
      join public."FIN_CostPolicies" p on p.id=a.policy_id and p.approved_by is not null and p.auto_finalise
    where e.is_final and (not exists(select 1 from public."FIN_CostFinalisations" f where f.evidence_id=e.id)
      or exists(select 1 from public."FIN_CostFinalisations" f join public."FIN_CostExceptionApprovals" x on x.finalisation_id=f.id and x.snapshot_hash=md5(f.snapshot::text) where f.evidence_id=e.id and f.status='review' and x.approved_at>f.evaluated_at))
      and not exists(select 1 from public."FIN_CostEvidence" n where n.charge_id=e.charge_id and (n.recorded_at,n.id)>(e.recorded_at,e.id))
    order by e.recorded_at,e.id limit 5) q),'[]'::jsonb),
  'delivery',coalesce((select jsonb_agg(to_jsonb(q)) from (
    select j.id,j.legal_entity_id,a.authorised_by from public."FIN_CostFinalisations" f
      join public."FIN_Journals" j on j.id=f.journal_id
      join public."FIN_CostAutomation" a on a.legal_entity_id=j.legal_entity_id and a.enabled
    -- Explicit failures need correction and the existing Journals retry action.
    -- Only uncertain, expired deliveries retry automatically with pinned identity.
    where j.mirror_status in ('queued','sending') and j.mirror_attempts<5 and (j.mirror_lease_until is null or j.mirror_lease_until<now())
    order by j.created_at,j.id limit 5) q),'[]'::jsonb))
$$;
revoke all on function public.multideck_cost_work_queue() from public,anon,authenticated;
grant execute on function public.multideck_cost_work_queue() to service_role;

-- A subsequent period review must not recreate a liability already finalised.
-- Reopening requires a reviewed correction, not an unnoticed second accrual.
create function public._multideck_cost_finalised_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public."FIN_CostFinalisations" where charge_id=new."FINAccrual_JobCostingLineID" and status in ('posted','settled')) then
    raise exception 'This charge has been finalised. Review a late-invoice correction before creating another accrual.' using errcode='22023'; end if;
  return new;
end; $$;
revoke all on function public._multideck_cost_finalised_guard() from public,anon,authenticated;
create trigger "TR_FIN_Accruals_finalised_guard" before insert on public."FIN_Accruals" for each row execute function public._multideck_cost_finalised_guard();
commit;
