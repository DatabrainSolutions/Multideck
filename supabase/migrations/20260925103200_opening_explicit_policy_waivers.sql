begin;

-- An entity policy may remove the second-person requirement for an explicit
-- operator action. It never stages, approves or posts an opening unattended.
create function public._multideck_finance_opening_policy_waiver(
  p_actor uuid,p_entity uuid,p_workflow text,p_record uuid,p_amount numeric,p_context jsonb
) returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_company uuid; v_decision jsonb;
begin
  if p_workflow not in ('opening_balance','opening_fx') then
    raise exception 'Unsupported opening approval workflow.' using errcode='22023'; end if;
  select "Company_ID" into v_company from public."cmp_LegalEntities"
    where "LegalEntity_ID"=p_entity and "LegalEntity_IsActive" for share;
  if v_company is null then raise exception 'Opening legal entity is unavailable.' using errcode='42501'; end if;
  v_decision:=public.multideck_finance_approval_decision(
    v_company,p_entity,p_workflow,p_amount,p_context);
  if coalesce((v_decision->>'canAuto')::boolean,false) then
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
      "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title",
      "AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
      values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
        case p_workflow when 'opening_balance' then 'FIN_OpeningBalancePackages' else 'FIN_OpeningFXSettlements' end,
        case p_workflow when 'opening_balance' then 'opening_balances' else 'opening_fx' end,
        p_record,'same_operator_policy_waiver','Opening second-person review waived by entity policy',true,1,
        jsonb_build_object('policy',v_decision,'exposureBaseAmount',p_amount,'context',p_context));
    return true;
  end if;
  return false;
end; $$;
revoke all on function public._multideck_finance_opening_policy_waiver(uuid,uuid,text,uuid,numeric,jsonb)
  from public,anon,authenticated;

-- The GL-only and full-source actions retain their exact validation and
-- immutable staged -> approved -> posted transitions. Both actions stay explicit.
do $$
declare definition text; anchor text; replacement text;
begin
  definition:=pg_get_functiondef('public._multideck_finance_opening_balances_gl_only(uuid,uuid,text,jsonb)'::regprocedure);
  anchor:='if p_actor=package.staged_by then raise exception ''A second finance operator must approve and post opening balances.'' using errcode=''42501''; end if;';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Review GL-only opening approval guard before policy migration.'; end if;
  replacement:='if p_actor=package.staged_by and not public._multideck_finance_opening_policy_waiver('
    ||'p_actor,p_entity,''opening_balance'',package.id,package.debit_total,'
    ||'jsonb_build_object(''hardException'',false,''advisoryException'',false,''variancePercent'',0)) '
    ||'then raise exception ''A second finance operator must approve and post opening balances.'' '
    ||'using errcode=''42501''; end if;';
  execute replace(definition,anchor,replacement);

  definition:=pg_get_functiondef('public._multideck_finance_full_opening_action(uuid,uuid,text,jsonb)'::regprocedure);
  anchor:='if p_actor=package.staged_by then
    raise exception ''A second finance operator must approve and post opening balances.'' using errcode=''42501''; end if;';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Review full-source opening approval guard before policy migration.'; end if;
  replacement:='if p_actor=package.staged_by and not public._multideck_finance_opening_policy_waiver('
    ||'p_actor,p_entity,''opening_balance'',package.id,package.debit_total,'
    ||'jsonb_build_object(''hardException'',false,''advisoryException'',true,''variancePercent'',0)) '
    ||'then raise exception ''A second finance operator must approve and post opening balances.'' '
    ||'using errcode=''42501''; end if;';
  execute replace(definition,anchor,replacement);

  definition:=pg_get_functiondef('public.multideck_finance_opening_fx_settlement(uuid,uuid,text,jsonb)'::regprocedure);
  anchor:='if s.proposed_by=p_actor then raise exception ''A second finance operator must post the settlement.'' using errcode=''42501''; end if;';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Review opening FX approval guard before policy migration.'; end if;
  definition:=replace(definition,anchor,'-- Same-operator policy is checked after source and period revalidation.');
  anchor:='v_cash_local:=s.cash_local; v_doc_local:=s.document_local; v_gain:=s.gain_loss_amount;';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Review opening FX posting boundary before policy migration.'; end if;
  replacement:='if s.proposed_by=p_actor and not public._multideck_finance_opening_policy_waiver('
    ||'p_actor,p_entity,''opening_fx'',s.id,greatest(s.cash_local,s.document_local),'
    ||'jsonb_build_object(''hardException'',v_cash_period."FINPeriod_StatusCode"<>''open'','
    ||'''advisoryException'',s.gain_loss_amount<>0 or s.cash_control_nominal_id<>s.source_control_nominal_id,'
    ||'''variancePercent'',round(abs(s.gain_loss_amount)/s.document_local*100,4))) '
    ||'then raise exception ''A second finance operator must post the settlement.'' using errcode=''42501''; end if;
    '||anchor;
  execute replace(definition,anchor,replacement);
end; $$;

commit;
