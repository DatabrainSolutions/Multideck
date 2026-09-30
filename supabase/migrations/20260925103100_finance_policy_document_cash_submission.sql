begin;

-- Submit through the existing lifecycle functions, in one transaction. Those
-- functions own tax, allocation, period, queue and posting validations.
create function public.multideck_finance_submit_document(
  p_company_id uuid,p_user_id uuid,p_document_id uuid,p_reason text default null
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_document public."FIN_Documents"%rowtype; v_decision jsonb; v_result jsonb;
  v_period_open boolean; v_mirror record;
begin
  select document.* into v_document from public."FIN_Documents" document
  join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=document."FINDoc_LegalEntityID"
  where document."FINDoc_ID"=p_document_id and entity."Company_ID"=p_company_id and entity."LegalEntity_IsActive"
  for update of document;
  if not found then raise exception 'Finance document not found in this workspace.' using errcode='P0002'; end if;
  perform public._multideck_journal_access(p_user_id,v_document."FINDoc_LegalEntityID",
    case when v_document."FINDoc_TypeCode" in ('sl_invoice','credit_note') then 'Finance.Receivables.Draft' else 'Finance.Payables.Draft' end);
  v_result:=public.multideck_finance_transition_document(p_company_id,p_user_id,p_document_id,'request_review',p_reason);
  -- Re-read the validated amount after request_review has recalculated lines.
  select * into v_document from public."FIN_Documents" where "FINDoc_ID"=p_document_id;
  select exists(select 1 from public."FIN_Periods" where "FINPeriod_LegalEntityID"=v_document."FINDoc_LegalEntityID"
    and v_document."FINDoc_AccountingDate" between "FINPeriod_StartDate" and "FINPeriod_EndDate"
    and "FINPeriod_StatusCode"='open') into v_period_open;
  select * into v_mirror from public._multideck_finance_mirror_state(v_document."FINDoc_LegalEntityID");
  v_decision:=public.multideck_finance_approval_decision(p_company_id,v_document."FINDoc_LegalEntityID",'document',
    abs(v_document."FINDoc_LocalGrossAmount"),jsonb_build_object(
      'hardException',not v_period_open or not coalesce(v_mirror.native_ledger_enabled,false)
        or (v_mirror.mirror_mode='required' and not coalesce(v_mirror.active_connection,false))
        or v_document."FINDoc_TypeCode" not in ('sl_invoice','pl_invoice')
        or v_document."FINDoc_CurrencyCodeSnapshot"<>(select "LegalEntity_BaseCurrencyCodeSnapshot" from public."cmp_LegalEntities" where "LegalEntity_ID"=v_document."FINDoc_LegalEntityID"),
      'advisoryException',v_document."FINDoc_SourceKindCode" is null));
  if v_decision->>'canAuto'='true' then
    v_result:=public.multideck_finance_transition_document(p_company_id,p_user_id,p_document_id,'approve',
      'Completed by the legal entity approval policy');
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
      "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_user_id,v_document."FINDoc_LegalEntityID",'multideck-app','finance','public','FIN_Documents',
      v_document."FINDoc_TypeCode",p_document_id,'automatic_approval','Finance document completed by approval policy',
      jsonb_build_object('policy',v_decision,'submittedBy',p_user_id));
  end if;
  return v_result || jsonb_build_object('approvalPolicyDecision',v_decision);
end; $$;
revoke all on function public.multideck_finance_submit_document(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_submit_document(uuid,uuid,uuid,text) to service_role;

create function public.multideck_finance_submit_cash(
  p_company_id uuid,p_user_id uuid,p_cash_id uuid,p_reason text default null
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_cash public."FIN_CashTransactions"%rowtype; v_decision jsonb; v_result jsonb;
  v_period_open boolean; v_mirror record;
begin
  select cash.* into v_cash from public."FIN_CashTransactions" cash
  join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=cash."FINCash_LegalEntityID"
  where cash."FINCash_ID"=p_cash_id and entity."Company_ID"=p_company_id and entity."LegalEntity_IsActive"
  for update of cash;
  if not found then raise exception 'Cash transaction not found in this workspace.' using errcode='P0002'; end if;
  perform public._multideck_journal_access(p_user_id,v_cash."FINCash_LegalEntityID",
    case when v_cash."FINCash_TypeCode"='customer_receipt' then 'Finance.Receivables.Cash' else 'Finance.Payables.Cash' end);
  v_result:=public.multideck_finance_transition_cash(p_company_id,p_user_id,p_cash_id,'request_review',p_reason);
  select * into v_cash from public."FIN_CashTransactions" where "FINCash_ID"=p_cash_id;
  select exists(select 1 from public."FIN_Periods" where "FINPeriod_LegalEntityID"=v_cash."FINCash_LegalEntityID"
    and v_cash."FINCash_AccountingDate" between "FINPeriod_StartDate" and "FINPeriod_EndDate"
    and "FINPeriod_StatusCode"='open') into v_period_open;
  select * into v_mirror from public._multideck_finance_mirror_state(v_cash."FINCash_LegalEntityID");
  v_decision:=public.multideck_finance_approval_decision(p_company_id,v_cash."FINCash_LegalEntityID",'cash',
    v_cash."FINCash_LocalAmount",jsonb_build_object(
      'hardException',not v_period_open or not coalesce(v_mirror.native_ledger_enabled,false)
        or (v_mirror.mirror_mode='required' and not coalesce(v_mirror.active_connection,false))
        or v_cash."FINCash_CurrencyCodeSnapshot"<>(select "LegalEntity_BaseCurrencyCodeSnapshot" from public."cmp_LegalEntities" where "LegalEntity_ID"=v_cash."FINCash_LegalEntityID"),
      'advisoryException',v_cash."FINCash_UnallocatedAmount">0));
  if v_decision->>'canAuto'='true' then
    v_result:=public.multideck_finance_transition_cash(p_company_id,p_user_id,p_cash_id,'approve',
      'Completed by the legal entity approval policy');
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
      "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_user_id,v_cash."FINCash_LegalEntityID",'multideck-app','finance','public','FIN_CashTransactions',
      v_cash."FINCash_TypeCode",p_cash_id,'automatic_approval','Cash transaction completed by approval policy',
      jsonb_build_object('policy',v_decision,'submittedBy',p_user_id));
  end if;
  return v_result || jsonb_build_object('approvalPolicyDecision',v_decision);
end; $$;
revoke all on function public.multideck_finance_submit_cash(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_submit_cash(uuid,uuid,uuid,text) to service_role;

commit;
