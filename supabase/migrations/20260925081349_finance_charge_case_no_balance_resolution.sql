begin;

create table public."FIN_ChargeCaseResolutions" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  charge_id uuid not null references public."Job_Costing_Lines"("JobCostingLine_ID"),
  queue_revision bigint not null,
  snapshot jsonb not null,
  status text not null default 'prepared' check(status in ('prepared','approved')),
  prepared_by uuid not null references public."cmp_Users"("User_ID"),
  prepared_at timestamptz not null default now(),
  prepared_reason text not null check(length(btrim(prepared_reason)) between 10 and 2000),
  approved_by uuid references public."cmp_Users"("User_ID"),
  approved_at timestamptz,
  approval_reason text,
  check ((status='prepared' and approved_by is null) or
    (status='approved' and approved_by is not null and approved_by<>prepared_by))
);
create index on public."FIN_ChargeCaseResolutions"(legal_entity_id,charge_id,prepared_at desc);
alter table public."FIN_ChargeCaseResolutions" enable row level security;
revoke all on public."FIN_ChargeCaseResolutions" from public,anon,authenticated;
grant select,insert,update on public."FIN_ChargeCaseResolutions" to service_role;

create function public._multideck_charge_case_no_balance_snapshot(p_entity uuid,p_charge uuid)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare q public."FIN_ChargeLifecycleQueue"; v_cost jsonb; v_revenue jsonb; v_blockers text[]:='{}';
  v_kind text; v_snapshot jsonb; v_blocker text;
begin
  select * into q from public."FIN_ChargeLifecycleQueue" where legal_entity_id=p_entity and charge_id=p_charge;
  if not found then raise exception 'Charge lifecycle case not found.' using errcode='P0002'; end if;
  if q.status<>'review' then v_blockers:=array_append(v_blockers,'Case must require review'); end if;
  for v_kind in select kind from (values ('cost'),('revenue')) kinds(kind) where
    (kind='cost' and (exists(select 1 from public."FIN_Accruals" where "FINAccrual_JobCostingLineID"=p_charge)
      or exists(select 1 from public."FIN_CostFinalisations" where charge_id=p_charge and status in ('posted','settled'))))
    or (kind='revenue' and exists(select 1 from public."FIN_WIPItems" where "FINWIP_JobCostingLineID"=p_charge))
  loop
    v_snapshot:=public._multideck_charge_correction_snapshot(p_entity,p_charge,v_kind);
    if v_kind='cost' then v_cost:=v_snapshot; else v_revenue:=v_snapshot; end if;
    if (v_snapshot->>'delta')::numeric<>0 then
      v_blockers:=array_append(v_blockers,v_kind||' balance requires a dated correction'); end if;
    for v_blocker in select value from jsonb_array_elements_text(v_snapshot->'blockers') value loop
      if v_blocker not in ('No balance correction is required','Use controlled final-invoice residual finalisation') then
        v_blockers:=array_append(v_blockers,v_kind||': '||v_blocker); end if;
    end loop;
  end loop;
  if v_cost is null and v_revenue is null then
    v_blockers:=array_append(v_blockers,'No posted charge adjustment or finalisation requires case resolution'); end if;
  return jsonb_build_object('queueRevision',q.source_revision,'queueStatus',q.status,
    'queueReason',q.reason,'cost',v_cost,'revenue',v_revenue,'blockers',to_jsonb(v_blockers));
end; $$;
revoke all on function public._multideck_charge_case_no_balance_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function public._multideck_charge_case_no_balance_snapshot(uuid,uuid) to service_role;

create function public.multideck_finance_charge_case_resolution(
  p_actor uuid,p_entity uuid,p_charge uuid,p_action text,p_input jsonb default '{}'
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public."FIN_ChargeCaseResolutions"; s jsonb; v_reason text;
begin
  if p_action not in ('read','prepare','approve') then raise exception 'Unknown case resolution action.' using errcode='22023'; end if;
  perform public._multideck_journal_access(p_actor,p_entity,case when p_action='read' then 'Finance.Management.View'
    when p_action='prepare' then 'Finance.Management.Prepare' else 'Finance.Management.Approve' end);
  if p_action='read' then
    return jsonb_build_object('snapshot',public._multideck_charge_case_no_balance_snapshot(p_entity,p_charge),
      'actorId',p_actor,
      'reviews',coalesce((select jsonb_agg(to_jsonb(x) order by prepared_at desc) from
        (select * from public."FIN_ChargeCaseResolutions" where legal_entity_id=p_entity and charge_id=p_charge
          order by prepared_at desc limit 20) x),'[]'::jsonb));
  end if;
  v_reason:=btrim(coalesce(p_input->>'reason',''));
  if length(v_reason) not between 10 and 2000 then raise exception 'Record a reason of 10 to 2000 characters.' using errcode='22023'; end if;
  perform set_config('lock_timeout','2s',true);
  perform set_config('statement_timeout','15s',true);
  lock table public."FIN_Documents",public."FIN_DocumentLineJobLinks",public."Job_Costing_Lines",
    public."Job_Header",public."FIN_Accruals",public."FIN_WIPItems" in share row exclusive mode;
  perform 1 from public."FIN_ChargeLifecycleQueue" where legal_entity_id=p_entity and charge_id=p_charge for update;
  s:=public._multideck_charge_case_no_balance_snapshot(p_entity,p_charge);
  if jsonb_array_length(s->'blockers')>0 then raise exception 'Resolve case blockers: %',s->'blockers' using errcode='22023'; end if;
  if p_action='prepare' then
    insert into public."FIN_ChargeCaseResolutions"(legal_entity_id,charge_id,queue_revision,snapshot,prepared_by,prepared_reason)
      values(p_entity,p_charge,(s->>'queueRevision')::bigint,s,p_actor,v_reason) returning * into r;
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
      "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
      values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_ChargeCaseResolutions',
        'charge_case_resolution',r.id,'prepare_no_balance_resolution','No-balance charge case resolution prepared',v_reason,s);
    return to_jsonb(r);
  end if;
  select * into r from public."FIN_ChargeCaseResolutions" where id=(p_input->>'reviewId')::uuid
    and legal_entity_id=p_entity and charge_id=p_charge for update;
  if not found then raise exception 'Case resolution review not found.' using errcode='P0002'; end if;
  if r.status<>'prepared' or r.prepared_by=p_actor then
    raise exception 'An independent finance operator must approve a prepared case resolution.' using errcode='42501'; end if;
  if r.snapshot is distinct from s then raise exception 'Charge case evidence changed; prepare a new review.' using errcode='40001'; end if;
  update public."FIN_ChargeCaseResolutions" set status='approved',approved_by=p_actor,approved_at=now(),approval_reason=v_reason
    where id=r.id;
  update public."FIN_ChargeLifecycleQueue" set status='settled',reason=null,next_action=null,amount_local=null,
    attempted_revision=source_revision,attempted_at=now() where legal_entity_id=p_entity and charge_id=p_charge;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_ChargeCaseResolutions',
      'charge_case_resolution',r.id,'approve_no_balance_resolution','No-balance charge case resolution approved',v_reason,s);
  return jsonb_build_object('status','approved','reviewId',r.id,'chargeId',p_charge,'queueRevision',r.queue_revision);
end; $$;
revoke all on function public.multideck_finance_charge_case_resolution(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_charge_case_resolution(uuid,uuid,uuid,text,jsonb) to service_role;

commit;
