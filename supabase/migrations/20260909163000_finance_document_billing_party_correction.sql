-- Correct a posted document's billing party without mutating ledger history.
-- The source is settled by a linked reversal and a replacement is posted to
-- the new party. Documents with cash allocations require a separate transfer.
create or replace function public.multideck_finance_correct_document_billing_party(
  p_company_id uuid,
  p_user_id uuid,
  p_document_id uuid,
  p_new_party_org_id uuid,
  p_reason text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source public."FIN_Documents";
  v_reversal_type text;
  v_reversal_id uuid := gen_random_uuid();
  v_replacement_id uuid := gen_random_uuid();
  v_reversal_number text;
  v_replacement_number text;
  v_source_was_mirrored boolean;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Record why the billing party is changing.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public."cmp_Users"
    where "User_ID" = p_user_id and "Company_ID" = p_company_id
      and coalesce("User_AccessStatus", 'active') = 'active'
  ) then raise exception 'The finance operator is outside this workspace.' using errcode = '42501'; end if;

  select document.* into v_source
  from public."FIN_Documents" document
  join public."cmp_LegalEntities" entity on entity."LegalEntity_ID" = document."FINDoc_LegalEntityID"
  where document."FINDoc_ID" = p_document_id and entity."Company_ID" = p_company_id
  for update of document;
  if not found then raise exception 'Finance document not found in this workspace.' using errcode = 'P0002'; end if;
  if v_source."FINDoc_NativePostingStatusCode" <> 'posted' then
    raise exception 'Only a document posted to the Multideck ledger can use billing-party correction.' using errcode = '22023';
  end if;
  if v_source."FINDoc_PartyOrgID" = p_new_party_org_id then
    raise exception 'Choose a different billing party.' using errcode = '22023';
  end if;
  if not exists (select 1 from public."Org_Master" where "Org_id" = p_new_party_org_id) then
    raise exception 'Choose a valid customer or supplier.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public."FIN_CashAllocations"
    where "FINCashAlloc_DocumentID" = p_document_id
      and "FINCashAlloc_AllocationStatusCode" in ('pending', 'allocated')
      and abs("FINCashAlloc_AllocatedAmount") > 0
  ) or abs(v_source."FINDoc_OutstandingAmount" - v_source."FINDoc_GrossAmount") > 0.0001 then
    raise exception 'This document has cash allocated. Reverse or transfer the receipt or payment before changing its billing party.' using errcode = '22023';
  end if;

  v_reversal_type := case v_source."FINDoc_TypeCode"
    when 'sl_invoice' then 'credit_note' when 'credit_note' then 'sl_invoice'
    when 'pl_invoice' then 'debit_note' when 'debit_note' then 'pl_invoice' end;
  v_reversal_number := public._multideck_finance_next_number(v_source."FINDoc_LegalEntityID", v_reversal_type);
  v_replacement_number := public._multideck_finance_next_number(v_source."FINDoc_LegalEntityID", v_source."FINDoc_TypeCode");

  insert into public."FIN_Documents"(
    "FINDoc_ID","FINDoc_TypeCode","FINDoc_StatusCode","FINDoc_Number","FINDoc_LegalEntityID","FINDoc_PartyOrgID","FINDoc_PartyRole",
    "FINDoc_DocumentDate","FINDoc_AccountingDate","FINDoc_DueDate","FINDoc_PeriodID","FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate",
    "FINDoc_SourceJobID","FINDoc_SourceTable","FINDoc_SourceID","FINDoc_SourceKindCode","FINDoc_IdempotencyKey","FINDoc_MetadataJSON","FINDoc_CreatedBy","FINDoc_UpdatedBy"
  ) values
  (v_reversal_id,v_reversal_type,'draft',v_reversal_number,v_source."FINDoc_LegalEntityID",v_source."FINDoc_PartyOrgID",v_source."FINDoc_PartyRole",
   current_date,current_date,current_date,null,v_source."FINDoc_CurrencyCodeSnapshot",v_source."FINDoc_ExchangeRate",
   v_source."FINDoc_SourceJobID",'FIN_Documents',p_document_id,'manual',gen_random_uuid(),jsonb_build_object('billingPartyCorrection',true,'correctionRole','reversal','sourceDocumentId',p_document_id,'reason',left(btrim(p_reason),500)),p_user_id,p_user_id),
  (v_replacement_id,v_source."FINDoc_TypeCode",'draft',v_replacement_number,v_source."FINDoc_LegalEntityID",p_new_party_org_id,v_source."FINDoc_PartyRole",
   v_source."FINDoc_DocumentDate",current_date,v_source."FINDoc_DueDate",null,v_source."FINDoc_CurrencyCodeSnapshot",v_source."FINDoc_ExchangeRate",
   v_source."FINDoc_SourceJobID",'FIN_Documents',p_document_id,'manual',gen_random_uuid(),jsonb_build_object('billingPartyCorrection',true,'correctionRole','replacement','sourceDocumentId',p_document_id,'reason',left(btrim(p_reason),500)),p_user_id,p_user_id);

  insert into public."FIN_DocumentLines"(
    "FINDocLine_DocumentID","FINDocLine_LineNo","FINDocLine_LineTypeCode","FINDocLine_ChargeID","FINDocLine_ChargeCodeSnapshot","FINDocLine_Description","FINDocLine_Quantity","FINDocLine_UnitAmount",
    "FINDocLine_NetAmount","FINDocLine_TaxCodeID","FINDocLine_TaxCodeSnapshot","FINDocLine_TaxRatePercent","FINDocLine_TaxAmount","FINDocLine_GrossAmount","FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount","FINDocLine_LocalGrossAmount","FINDocLine_NominalAccountID","FINDocLine_Dimension1ID","FINDocLine_Dimension2ID"
  )
  select target.document_id,line."FINDocLine_LineNo",line."FINDocLine_LineTypeCode",line."FINDocLine_ChargeID",line."FINDocLine_ChargeCodeSnapshot",line."FINDocLine_Description",line."FINDocLine_Quantity",line."FINDocLine_UnitAmount",
    line."FINDocLine_NetAmount" * target.multiplier,line."FINDocLine_TaxCodeID",line."FINDocLine_TaxCodeSnapshot",line."FINDocLine_TaxRatePercent",line."FINDocLine_TaxAmount" * target.multiplier,line."FINDocLine_GrossAmount" * target.multiplier,
    line."FINDocLine_LocalNetAmount" * target.multiplier,line."FINDocLine_LocalTaxAmount" * target.multiplier,line."FINDocLine_LocalGrossAmount" * target.multiplier,line."FINDocLine_NominalAccountID",line."FINDocLine_Dimension1ID",line."FINDocLine_Dimension2ID"
  from public."FIN_DocumentLines" line
  cross join (values (v_reversal_id,-1::numeric),(v_replacement_id,1::numeric)) target(document_id,multiplier)
  where line."FINDocLine_DocumentID" = p_document_id;

  insert into public."FIN_DocumentLineJobLinks"(
    "FINDocLineJob_DocumentID","FINDocLineJob_DocumentLineID","FINDocLineJob_JobID","FINDocLineJob_ChargeInID","FINDocLineJob_ChargeOutID","FINDocLineJob_LinkTypeCode","FINDocLineJob_NetAmount","FINDocLineJob_LocalNetAmount","FINDocLineJob_PercentOfLine","FINDocLineJob_JobCostingLineID"
  )
  select new_line."FINDocLine_DocumentID",new_line."FINDocLine_ID",link."FINDocLineJob_JobID",link."FINDocLineJob_ChargeInID",link."FINDocLineJob_ChargeOutID",link."FINDocLineJob_LinkTypeCode",
    link."FINDocLineJob_NetAmount" * target.multiplier,link."FINDocLineJob_LocalNetAmount" * target.multiplier,link."FINDocLineJob_PercentOfLine",link."FINDocLineJob_JobCostingLineID"
  from public."FIN_DocumentLineJobLinks" link
  join public."FIN_DocumentLines" source_line on source_line."FINDocLine_ID"=link."FINDocLineJob_DocumentLineID"
  cross join (values (v_reversal_id,-1::numeric),(v_replacement_id,1::numeric)) target(document_id,multiplier)
  join public."FIN_DocumentLines" new_line on new_line."FINDocLine_DocumentID"=target.document_id and new_line."FINDocLine_LineNo"=source_line."FINDocLine_LineNo"
  where link."FINDocLineJob_DocumentID"=p_document_id;

  update public."FIN_Documents" document set
    "FINDoc_NetAmount"=totals.net,"FINDoc_TaxAmount"=totals.tax,"FINDoc_GrossAmount"=totals.gross,
    "FINDoc_LocalNetAmount"=totals.local_net,"FINDoc_LocalTaxAmount"=totals.local_tax,"FINDoc_LocalGrossAmount"=totals.local_gross,
    "FINDoc_OutstandingAmount"=totals.gross,"FINDoc_LocalOutstandingAmount"=totals.local_gross
  from (select "FINDocLine_DocumentID" id,sum("FINDocLine_NetAmount") net,sum("FINDocLine_TaxAmount") tax,sum("FINDocLine_GrossAmount") gross,sum("FINDocLine_LocalNetAmount") local_net,sum("FINDocLine_LocalTaxAmount") local_tax,sum("FINDocLine_LocalGrossAmount") local_gross from public."FIN_DocumentLines" where "FINDocLine_DocumentID" in (v_reversal_id,v_replacement_id) group by "FINDocLine_DocumentID") totals
  where document."FINDoc_ID"=totals.id;

  perform public.multideck_finance_transition_document(p_company_id,p_user_id,v_reversal_id,'request_review','Billing-party correction reversal');
  perform public.multideck_finance_transition_document(p_company_id,p_user_id,v_reversal_id,'approve','Billing-party correction reversal');
  perform public.multideck_finance_transition_document(p_company_id,p_user_id,v_replacement_id,'request_review','Billing-party correction replacement');
  perform public.multideck_finance_transition_document(p_company_id,p_user_id,v_replacement_id,'approve','Billing-party correction replacement');

  update public."FIN_Documents" set "FINDoc_OutstandingAmount"=0,"FINDoc_LocalOutstandingAmount"=0,"FINDoc_UpdatedAt"=now(),"FINDoc_UpdatedBy"=p_user_id where "FINDoc_ID" in (p_document_id,v_reversal_id);
  select exists(select 1 from public."ACCI_ExternalRefs" where "ACCIER_LocalTable"='FIN_Documents' and "ACCIER_LocalID"=p_document_id and "ACCIER_SyncStatusCode"='synced') into v_source_was_mirrored;
  if not v_source_was_mirrored then
    update public."FIN_IntegrationQueue" set "FINIntQ_StatusCode"='cancelled',"FINIntQ_LastError"='Internal correction: the source document was never mirrored.' where "FINIntQ_LocalTable"='FIN_Documents' and "FINIntQ_LocalID" in (p_document_id,v_reversal_id) and "FINIntQ_StatusCode" in ('queued','processing','blocked','failed');
    update public."FIN_Documents" set "FINDoc_ExportStatusCode"='not_required' where "FINDoc_ID"=v_reversal_id;
  end if;

  insert into public."FIN_DocumentStatusHistory"("FINDocStatus_DocumentID","FINDocStatus_FromStatusCode","FINDocStatus_ToStatusCode","FINDocStatus_ChangedBy","FINDocStatus_Reason","FINDocStatus_MetadataJSON")
  values(p_document_id,v_source."FINDoc_StatusCode",v_source."FINDoc_StatusCode",p_user_id,left(btrim(p_reason),500),jsonb_build_object('action','billing_party_corrected','fromPartyOrgId',v_source."FINDoc_PartyOrgID",'toPartyOrgId',p_new_party_org_id,'reversalDocumentId',v_reversal_id,'replacementDocumentId',v_replacement_id));
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_user_id,v_source."FINDoc_LegalEntityID",'multideck-app','finance','public','FIN_Documents',v_source."FINDoc_TypeCode",p_document_id,'correct_billing_party','Billing party corrected by reversal and replacement',left(btrim(p_reason),500),true,1,jsonb_build_object('fromPartyOrgId',v_source."FINDoc_PartyOrgID",'toPartyOrgId',p_new_party_org_id,'reversalDocumentId',v_reversal_id,'replacementDocumentId',v_replacement_id));

  return jsonb_build_object('sourceDocumentId',p_document_id,'reversalDocumentId',v_reversal_id,'replacementDocumentId',v_replacement_id,'replacementNumber',v_replacement_number);
end;
$$;

revoke all on function public.multideck_finance_correct_document_billing_party(uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.multideck_finance_correct_document_billing_party(uuid,uuid,uuid,uuid,text) to service_role;

comment on function public.multideck_finance_correct_document_billing_party(uuid,uuid,uuid,uuid,text) is
'Posts a linked reversal and replacement when a posted finance document billing party is corrected. Existing document watch triggers emit deterministic change events; Dexter may inspect the resulting documents and history, but this privileged correction remains manual-only.';
