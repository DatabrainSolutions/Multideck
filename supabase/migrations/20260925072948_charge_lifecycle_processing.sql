begin;

alter table public."FIN_ChargeLifecycleQueue"
  add column amount_local numeric(18,4),
  add column next_action text;

-- A bounded read is only a hint to the worker. The executor reloads every
-- source after taking the queue row lock; source triggers will reschedule a
-- newer revision if a transaction commits after this decision.
create function public.multideck_charge_lifecycle_work_queue()
returns jsonb language sql security invoker set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.last_queued_at,candidate.charge_id),'[]'::jsonb)
  from (select q.legal_entity_id,q.charge_id,q.source_revision,q.last_queued_at
    from public."FIN_ChargeLifecycleQueue" q
    where q.status='pending' and q.next_attempt_at<=now()
    order by q.last_queued_at,q.charge_id limit 10) candidate
$$;
revoke all on function public.multideck_charge_lifecycle_work_queue() from public,anon,authenticated;
grant execute on function public.multideck_charge_lifecycle_work_queue() to service_role;

create function public.multideck_charge_lifecycle_record_failure(
  p_entity uuid,p_charge uuid,p_revision bigint,p_reason text
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare q public."FIN_ChargeLifecycleQueue";
begin
  select * into q from public."FIN_ChargeLifecycleQueue"
    where legal_entity_id=p_entity and charge_id=p_charge for update;
  if not found then raise exception 'Charge event was not found.' using errcode='P0002'; end if;
  if q.source_revision<>p_revision then return jsonb_build_object('status','newer_event'); end if;
  update public."FIN_ChargeLifecycleQueue" set
    attempts=attempts+1,attempted_revision=p_revision,attempted_at=now(),
    next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(q.attempts,7))::integer)),
    status=case when q.attempts>=4 then 'review' else 'pending' end,
    reason=case when q.attempts>=4 then 'Lifecycle processing failed repeatedly' else 'Lifecycle processing will retry' end,
    next_action=case when q.attempts>=4 then 'Investigate the worker failure and replay this charge event' else 'Automatic retry' end
  where legal_entity_id=p_entity and charge_id=p_charge returning * into q;
  return jsonb_build_object('status',q.status,'attempts',q.attempts,'nextAttemptAt',q.next_attempt_at);
end; $$;
revoke all on function public.multideck_charge_lifecycle_record_failure(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.multideck_charge_lifecycle_record_failure(uuid,uuid,bigint,text) to service_role;

create function public.multideck_charge_lifecycle_process(p_entity uuid,p_charge uuid,p_revision bigint)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare q public."FIN_ChargeLifecycleQueue"; c record; s public."FIN_CostAutomation";
  e public."FIN_CostEvidence"; f public."FIN_CostFinalisations";
  v_pending integer; v_credit integer; v_wrong_supplier integer; v_actual numeric;
  v_accrual numeric; v_wip numeric; v_last_closed date; v_reason text; v_action text;
  v_amount numeric; v_status text;
begin
  select * into q from public."FIN_ChargeLifecycleQueue"
    where legal_entity_id=p_entity and charge_id=p_charge for update;
  if not found then raise exception 'Charge event was not found.' using errcode='P0002'; end if;
  if q.source_revision<>p_revision then return jsonb_build_object('status','newer_event'); end if;
  select l."JobCostingLine_CostAmountLocal" cost_estimate,l."JobCostingLine_RevenueAmountLocal" revenue_estimate,
    l."JobCostingLine_SupplierID" supplier_id,j."Job_Status" job_status,j."Job_IsDeleted" job_deleted
    into c from public."Job_Costing_Lines" l join public."Job_Header" j on j."Job_ID"=l."Job_ID"
    where l."JobCostingLine_ID"=p_charge and j."Job_LegalEntityID"=p_entity;
  if not found then raise exception 'Charge is outside its legal entity.' using errcode='42501'; end if;
  select * into s from public."FIN_CostAutomation" where legal_entity_id=p_entity;
  select * into e from public."FIN_CostEvidence" where legal_entity_id=p_entity and charge_id=p_charge
    order by recorded_at desc,id desc limit 1;
  if e.id is not null then select * into f from public."FIN_CostFinalisations" where evidence_id=e.id; end if;
  select count(*) filter(where d."FINDoc_NativePostingStatusCode" not in ('posted','reversed')),
    count(*) filter(where d."FINDoc_TypeCode" in ('credit_note','debit_note') or d."FINDoc_NativePostingStatusCode"='reversed'),
    count(*) filter(where d."FINDoc_PartyOrgID" is distinct from c.supplier_id and d."FINDoc_TypeCode" in ('pl_invoice','debit_note')),
    coalesce(sum(case when d."FINDoc_TypeCode"='pl_invoice' then k."FINDocLineJob_LocalNetAmount"
      when d."FINDoc_TypeCode"='debit_note' then -abs(k."FINDocLineJob_LocalNetAmount") else 0 end)
      filter(where d."FINDoc_NativePostingStatusCode"='posted'),0)
    into v_pending,v_credit,v_wrong_supplier,v_actual
  from public."FIN_DocumentLineJobLinks" k join public."FIN_Documents" d on d."FINDoc_ID"=k."FINDocLineJob_DocumentID"
    where k."FINDocLineJob_JobCostingLineID"=p_charge and d."FINDoc_LegalEntityID"=p_entity;
  select coalesce(sum(a."FINAccrual_AccruedAmount"-a."FINAccrual_RelievedAmount"),0)
    into v_accrual from public."FIN_Accruals" a join public."FIN_Periods" p on p."FINPeriod_ID"=a."FINAccrual_PeriodID"
    where a."FINAccrual_JobCostingLineID"=p_charge and p."FINPeriod_LegalEntityID"=p_entity;
  select coalesce(sum(w."FINWIP_WIPAmount"-w."FINWIP_RelievedAmount"),0)
    into v_wip from public."FIN_WIPItems" w join public."FIN_Periods" p on p."FINPeriod_ID"=w."FINWIP_PeriodID"
    where w."FINWIP_JobCostingLineID"=p_charge and p."FINPeriod_LegalEntityID"=p_entity;
  select max("FINPeriod_EndDate") into v_last_closed from public."FIN_Periods"
    where "FINPeriod_LegalEntityID"=p_entity and "FINPeriod_StatusCode" in ('locked','archived');
  v_amount:=greatest(abs(v_accrual),abs(v_wip),abs(coalesce(c.cost_estimate,0)-v_actual));
  if v_credit>0 and (v_accrual<>0 or v_wip<>0 or f.status in ('posted','settled')) then
    v_reason:='Credit, debit note or reversal requires exact original-posting review';
    v_action:='Review linked source and approve a dated correction in an open period';
  elsif v_wrong_supplier>0 then
    v_reason:='Linked supplier differs from the charge supplier';
    v_action:='Correct or review the supplier and charge match';
  elsif v_pending>0 and (v_accrual<>0 or v_wip<>0) then
    v_reason:='Linked document awaits native posting';
    v_action:='Post or resolve the linked document';
  elsif c.job_deleted or c.job_status in ('cancelled','provisional','draft') then
    if v_accrual<>0 or v_wip<>0 then
      v_reason:='Ineligible job retains an accrual or WIP balance';
      v_action:='Review the job and approve a dated reversal';
    end if;
  elsif v_last_closed is not null and q.event_types && array['estimate','invoice_link','invoice_posting','credit_or_reversal']
    and (v_accrual<>0 or v_wip<>0 or f.status in ('posted','settled')) then
    v_reason:='Source changed after an accounting period was locked';
    v_action:='Review the original period and post a dated correction in an open period';
  elsif s.enabled and e.id is not null and e.is_final and (f.id is null or f.status='review') then
    v_reason:=coalesce(nullif(f.reason,''),'Final-invoice confirmation awaits evaluation');
    v_action:='Resolve finalisation evidence or approve its exact current exception';
  elsif s.enabled and e.id is not null and not e.is_final and v_accrual=0 and coalesce(c.cost_estimate,0)>v_actual then
    v_reason:='Completed service has an unrecognised cost estimate';
    v_action:='Review and post initial accrual under the approved period workflow';
  end if;
  v_status:=case when v_reason is null then 'settled' else 'review' end;
  update public."FIN_ChargeLifecycleQueue" set status=v_status,reason=v_reason,next_action=v_action,
    amount_local=case when v_reason is null then null else v_amount end,
    attempted_revision=p_revision,attempted_at=now(),attempts=attempts+1,event_types='{}'
    where legal_entity_id=p_entity and charge_id=p_charge;
  return jsonb_build_object('status',v_status,'reason',v_reason,'amountLocal',v_amount::text);
end; $$;
revoke all on function public.multideck_charge_lifecycle_process(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.multideck_charge_lifecycle_process(uuid,uuid,bigint) to service_role;

create or replace function public.multideck_finance_charge_lifecycle_queue(p_actor uuid,p_entity uuid,p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View');
  if p_limit is null or p_limit not between 1 and 200 then raise exception 'Invalid queue page size.' using errcode='22023'; end if;
  return jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(q) order by q.last_queued_at,q.charge_id) from
    (select legal_entity_id,charge_id,source_revision,event_types,first_queued_at,last_queued_at,status,
      attempted_revision,attempted_at,attempts,next_attempt_at,assigned_user_id,reason,amount_local,next_action
      from public."FIN_ChargeLifecycleQueue" where legal_entity_id=p_entity order by last_queued_at,charge_id limit p_limit) q),'[]'::jsonb));
end; $$;

commit;
