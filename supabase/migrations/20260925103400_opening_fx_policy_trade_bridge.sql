begin;

-- A same-operator opening FX settlement remains reconcilable only when its
-- posting audit contains the exact policy waiver for that settlement.
-- The referenced policy revision is immutable, so later policy changes do not
-- retroactively alter a posted opening position.
create or replace function public._multideck_opening_fx_same_operator_proven(
  p_entity uuid,p_settlement public."FIN_OpeningFXSettlements"
) returns boolean language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
  if p_settlement.posted_by is distinct from p_settlement.proposed_by
    or p_settlement.status is distinct from 'posted' or p_settlement.document_local<=0 then return false; end if;
  return exists(
    select 1 from public."Audit_Events" event
    join public."FIN_ApprovalPolicies" policy
      on policy."FINApprovalPolicy_ID"::text=event."AuditEvent_MetadataJSON"->'policy'->>'policyId'
    where event."AuditEvent_RecordTypeCode"='opening_fx'
      and event."AuditEvent_EventTypeCode"='finance_lifecycle'
      and event."AuditEvent_SourceTableName"='FIN_OpeningFXSettlements'
      and event."AuditEvent_RecordID"=p_settlement.id
      and event."AuditEvent_Action"='same_operator_policy_waiver'
      and event."AuditEvent_LegalEntityID"=p_entity
      and event."AuditEvent_UserID"=p_settlement.posted_by
      and event."AuditEvent_OccurredAt" between p_settlement.proposed_at and p_settlement.posted_at
      and event."AuditEvent_MetadataJSON"->'policy'->>'reason'='within_policy'
      and event."AuditEvent_MetadataJSON"->'policy'->>'canAuto'='true'
      and event."AuditEvent_MetadataJSON"->'policy'->>'mode'=policy."FINApprovalPolicy_ModeCode"
      and event."AuditEvent_MetadataJSON"->'policy'->'revision'=to_jsonb(policy."FINApprovalPolicy_Revision")
      and event."AuditEvent_MetadataJSON"->'exposureBaseAmount'=to_jsonb(greatest(p_settlement.cash_local,p_settlement.document_local))
      and event."AuditEvent_MetadataJSON"->'context'=jsonb_build_object(
        'hardException',false,
        'advisoryException',p_settlement.gain_loss_amount<>0
          or p_settlement.cash_control_nominal_id<>p_settlement.source_control_nominal_id,
        'variancePercent',round(abs(p_settlement.gain_loss_amount)/p_settlement.document_local*100,4))
      and policy."FINApprovalPolicy_LegalEntityID"=p_entity
      and policy."FINApprovalPolicy_WorkflowCode"='opening_fx'
      and policy."FINApprovalPolicy_ModeCode" in ('exception_review','automatic')
      and greatest(p_settlement.cash_local,p_settlement.document_local)<=policy."FINApprovalPolicy_MaxAutoAmount"
      and (policy."FINApprovalPolicy_MaxVariancePercent" is null
        or round(abs(p_settlement.gain_loss_amount)/p_settlement.document_local*100,4)
          <=policy."FINApprovalPolicy_MaxVariancePercent")
      and (policy."FINApprovalPolicy_ModeCode"<>'exception_review'
        or (p_settlement.gain_loss_amount=0
          and p_settlement.cash_control_nominal_id=p_settlement.source_control_nominal_id))
  );
end; $$;
revoke all on function public._multideck_opening_fx_same_operator_proven(uuid,public."FIN_OpeningFXSettlements") from public,anon,authenticated;
grant execute on function public._multideck_opening_fx_same_operator_proven(uuid,public."FIN_OpeningFXSettlements") to service_role;

-- Preserve every existing batch, source, amount, date, and posting-line check.
do $$
declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('public._multideck_opening_fx_settlement_proven(uuid,uuid,uuid)'::regprocedure);
  anchor:='or s.posted_by=s.proposed_by or s.posting_batch_id is null';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Review opening FX trade-control approval guard before policy bridge.';
  end if;
  execute replace(definition,anchor,
    'or (s.posted_by=s.proposed_by and not public._multideck_opening_fx_same_operator_proven(p_entity,s))'
    ||' or s.posting_batch_id is null');
end; $$;

commit;
