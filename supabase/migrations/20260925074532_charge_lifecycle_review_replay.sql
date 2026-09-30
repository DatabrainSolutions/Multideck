begin;

create function public.multideck_finance_charge_lifecycle_requeue(
  p_actor uuid,p_entity uuid,p_charge uuid,p_reason text
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare q public."FIN_ChargeLifecycleQueue"; v_reason text;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Prepare');
  v_reason:=trim(coalesce(p_reason,''));
  if length(v_reason) not between 10 and 1000 then
    raise exception 'Record a review reason of 10 to 1000 characters.' using errcode='22023'; end if;
  select * into q from public."FIN_ChargeLifecycleQueue" where legal_entity_id=p_entity and charge_id=p_charge for update;
  if not found then raise exception 'Charge review case not found in this legal entity.' using errcode='P0002'; end if;
  if q.status<>'review' then raise exception 'Only a review case can be rechecked.' using errcode='22023'; end if;
  update public."FIN_ChargeLifecycleQueue" set status='pending',next_attempt_at=now(),
    reason=null,next_action=null,attempts=0,amount_local=null
    where legal_entity_id=p_entity and charge_id=p_charge returning * into q;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp",
    "AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode",
    "AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_ChargeLifecycleQueue','cost_control',p_charge,
      'recheck_charge','Charge lifecycle case returned to evaluation',v_reason,
      jsonb_build_object('sourceRevision',q.source_revision,'events',q.event_types));
  return jsonb_build_object('status','pending','chargeId',p_charge,'sourceRevision',q.source_revision);
end; $$;
revoke all on function public.multideck_finance_charge_lifecycle_requeue(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_charge_lifecycle_requeue(uuid,uuid,uuid,text) to service_role;

commit;
