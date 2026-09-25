begin;

-- Charge nonrecoverable purchase tax to the same cost/asset nominal as its source line.
-- Existing posted journals are immutable; their VAT source check must flag old input-VAT postings for correction.
create or replace function public._multideck_finance_post_document_native(p_document_id uuid,p_user_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_document public."FIN_Documents"%rowtype; v_line record; v_batch uuid; v_period uuid; v_currency text;
  v_control uuid; v_nominal uuid; v_tax_nominal uuid; v_tax_preferred uuid; v_line_no integer:=0;
  v_debits numeric:=0; v_credits numeric:=0; v_amount numeric; v_mode text; v_connection boolean; v_native boolean;
  v_sales boolean; v_credit boolean;
begin
  select * into v_document from public."FIN_Documents" where "FINDoc_ID"=p_document_id for update;
  if not found then raise exception 'Finance document not found.' using errcode='P0002'; end if;
  if v_document."FINDoc_NativePostingStatusCode"='posted' and v_document."FINDoc_NativePostingBatchID" is not null then
    return jsonb_build_object('documentId',p_document_id,'status','posted','postingBatchId',v_document."FINDoc_NativePostingBatchID",'idempotent',true);
  end if;
  if v_document."FINDoc_StatusCode" not in ('approved','submitted') then
    raise exception 'Only an approved finance document can be posted to the native ledger.' using errcode='22023';
  end if;
  select mirror_mode,active_connection,native_ledger_enabled into v_mode,v_connection,v_native
  from public._multideck_finance_mirror_state(v_document."FINDoc_LegalEntityID");
  if not v_native then raise exception 'Enable the Multideck native ledger before approval.' using errcode='22023'; end if;
  if v_mode='required' and not v_connection then raise exception 'This legal entity requires an active external accounting mirror before approval.' using errcode='22023'; end if;

  v_sales:=v_document."FINDoc_TypeCode" in ('sl_invoice','credit_note');
  v_credit:=v_document."FINDoc_TypeCode" in ('credit_note','debit_note');
  v_currency:=upper((select "LegalEntity_BaseCurrencyCodeSnapshot" from public."cmp_LegalEntities" where "LegalEntity_ID"=v_document."FINDoc_LegalEntityID"));
  if v_currency is null or v_currency!~'^[A-Z]{3}$' then raise exception 'Configure a valid legal-entity base currency before native posting.' using errcode='22023'; end if;
  v_period:=public._multideck_finance_ensure_period(v_document."FINDoc_LegalEntityID",to_char(v_document."FINDoc_AccountingDate",'YYYYMM'),p_user_id);
  v_control:=public._multideck_finance_resolve_nominal(v_document."FINDoc_LegalEntityID",null,case when v_sales then '1100' else '2000' end);
  if v_control is null then raise exception 'Configure the % control nominal before native posting.',case when v_sales then 'trade receivables' else 'trade payables' end using errcode='22023'; end if;

  insert into public."FIN_PostingBatches"(
    "FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID",
    "FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_CreatedBy"
  ) values (
    'NATIVE-'||left(coalesce(v_document."FINDoc_Number",p_document_id::text),60),'draft','FIN_Documents',p_document_id,v_period,v_document."FINDoc_LegalEntityID",0,0,v_currency,p_user_id
  ) returning "FINPostBatch_ID" into v_batch;

  for v_line in
    select line.*,tax."FINTax_OutputNominalID",tax."FINTax_InputNominalID",tax."FINTax_IsRecoverable"
    from public."FIN_DocumentLines" line
    left join public."FIN_TaxCodes" tax on tax."FINTax_ID"=line."FINDocLine_TaxCodeID" and tax."FINTax_LegalEntityID"=v_document."FINDoc_LegalEntityID"
    where line."FINDocLine_DocumentID"=p_document_id order by line."FINDocLine_LineNo" for update of line
  loop
    v_nominal:=public._multideck_finance_resolve_nominal(v_document."FINDoc_LegalEntityID",v_line."FINDocLine_NominalAccountID",case when v_sales then '4000' else '5000' end);
    if v_nominal is null then raise exception 'Finance line % has no active native nominal account.',v_line."FINDocLine_LineNo" using errcode='22023'; end if;
    v_amount:=round(abs(v_line."FINDocLine_LocalNetAmount"),4);
    if v_amount>0 then
      v_line_no:=v_line_no+1;
      insert into public."FIN_PostingLines"(
        "FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DocumentID","FINPostLine_DocumentLineID","FINPostLine_Description",
        "FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID","FINPostLine_Dimension2ID","FINPostLine_JobID"
      ) values (
        v_batch,v_line_no,v_nominal,p_document_id,v_line."FINDocLine_ID",v_line."FINDocLine_Description",
        case when (v_sales and v_credit) or (not v_sales and not v_credit) then v_amount else 0 end,
        case when (v_sales and not v_credit) or (not v_sales and v_credit) then v_amount else 0 end,
        v_currency,v_line."FINDocLine_Dimension1ID",v_line."FINDocLine_Dimension2ID",v_document."FINDoc_SourceJobID"
      );
    end if;
    v_amount:=round(abs(v_line."FINDocLine_LocalTaxAmount"),4);
    if v_amount>0 then
      if not v_sales and v_line."FINTax_IsRecoverable" is false then
        -- Blocked input tax is part of the purchase cost, not an input VAT asset.
        v_tax_nominal:=v_nominal;
      else
        v_tax_preferred:=case when v_sales then v_line."FINTax_OutputNominalID" else v_line."FINTax_InputNominalID" end;
        v_tax_nominal:=public._multideck_finance_resolve_nominal(v_document."FINDoc_LegalEntityID",v_tax_preferred,case when v_sales then '2100' else '1200' end);
      end if;
      if v_tax_nominal is null then raise exception 'Finance line % has no active native tax nominal account.',v_line."FINDocLine_LineNo" using errcode='22023'; end if;
      v_line_no:=v_line_no+1;
      insert into public."FIN_PostingLines"(
        "FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DocumentID","FINPostLine_DocumentLineID","FINPostLine_Description",
        "FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID","FINPostLine_Dimension2ID","FINPostLine_JobID"
      ) values (
        v_batch,v_line_no,v_tax_nominal,p_document_id,v_line."FINDocLine_ID",case when not v_sales and v_line."FINTax_IsRecoverable" is false then 'Nonrecoverable tax: ' else 'Tax: ' end||v_line."FINDocLine_Description",
        case when (v_sales and v_credit) or (not v_sales and not v_credit) then v_amount else 0 end,
        case when (v_sales and not v_credit) or (not v_sales and v_credit) then v_amount else 0 end,
        v_currency,v_line."FINDocLine_Dimension1ID",v_line."FINDocLine_Dimension2ID",v_document."FINDoc_SourceJobID"
      );
    end if;
  end loop;

  v_amount:=round(abs(v_document."FINDoc_LocalGrossAmount"),4);
  if v_amount<=0 then raise exception 'The approved document has no native gross value.' using errcode='22023'; end if;
  v_line_no:=v_line_no+1;
  insert into public."FIN_PostingLines"(
    "FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DocumentID","FINPostLine_Description",
    "FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID"
  ) values (
    v_batch,v_line_no,v_control,p_document_id,case when v_sales then 'Trade receivable control' else 'Trade payable control' end,
    case when (v_sales and not v_credit) or (not v_sales and v_credit) then v_amount else 0 end,
    case when (v_sales and v_credit) or (not v_sales and not v_credit) then v_amount else 0 end,
    v_currency,v_document."FINDoc_SourceJobID"
  );

  select round(coalesce(sum("FINPostLine_DebitAmount"),0),4),round(coalesce(sum("FINPostLine_CreditAmount"),0),4)
  into v_debits,v_credits from public."FIN_PostingLines" where "FINPostLine_BatchID"=v_batch;
  if v_debits<=0 or v_debits is distinct from v_credits then
    raise exception 'Native document journal is not balanced (% debit, % credit).',v_debits,v_credits using errcode='22023';
  end if;
  update public."FIN_PostingBatches" set
    "FINPostBatch_StatusCode"='posted',"FINPostBatch_DebitTotal"=v_debits,"FINPostBatch_CreditTotal"=v_credits,
    "FINPostBatch_PostedAt"=now(),"FINPostBatch_PostedBy"=p_user_id
  where "FINPostBatch_ID"=v_batch;
  update public."FIN_Documents" set
    "FINDoc_PeriodID"=v_period,"FINDoc_NativePostingStatusCode"='posted',"FINDoc_NativePostingBatchID"=v_batch,
    "FINDoc_NativePostedAt"=now(),"FINDoc_NativePostedBy"=p_user_id,"FINDoc_PostingStatusCode"='posted',
    "FINDoc_PostedAt"=coalesce("FINDoc_PostedAt",now()),"FINDoc_PostedBy"=coalesce("FINDoc_PostedBy",p_user_id),"FINDoc_IsLocked"=true,
    "FINDoc_ExportStatusCode"=case when v_mode='disabled' or (v_mode='optional' and not v_connection) then 'not_required' else 'queued' end,
    "FINDoc_UpdatedAt"=now(),"FINDoc_UpdatedBy"=p_user_id
  where "FINDoc_ID"=p_document_id;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON"
  ) values (
    'finance_lifecycle',p_user_id,v_document."FINDoc_LegalEntityID",'multideck-app','finance','public','FIN_Documents',v_document."FINDoc_TypeCode",p_document_id,
    'post_native_ledger','Finance document posted to Multideck ledger',true,1,jsonb_build_object('postingBatchId',v_batch,'debitTotal',v_debits,'creditTotal',v_credits,'currency',v_currency,'externalMirrorMode',v_mode,'externalMirrorQueued',v_connection and v_mode<>'disabled')
  );
  return jsonb_build_object('documentId',p_document_id,'status','posted','postingBatchId',v_batch,'debitTotal',v_debits,'creditTotal',v_credits,'currency',v_currency);
end; $$;
revoke all on function public._multideck_finance_post_document_native(uuid,uuid) from public,anon,authenticated;
grant execute on function public._multideck_finance_post_document_native(uuid,uuid) to service_role;

commit;
