begin;

-- These service-only entry points evaluate the latest legal-entity policy in
-- the same transaction as the daily Accounts decision. The entity lock
-- serialises that evaluation with a policy revision.
create function public.multideck_finance_create_supplier_po(
  p_company_id uuid, p_user_id uuid, p_input jsonb
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_entity public."cmp_LegalEntities"%rowtype;
  v_po public."FIN_SupplierPurchaseOrders"%rowtype;
  v_job public."Job_Header"%rowtype;
  v_amount numeric; v_reference text; v_decision jsonb; v_auto boolean;
begin
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then
    raise exception 'The finance operator is outside this workspace.' using errcode='42501';
  end if;
  select * into v_entity from public."cmp_LegalEntities"
  where "LegalEntity_ID"=(p_input->>'legalEntityId')::uuid and "Company_ID"=p_company_id and "LegalEntity_IsActive" for share;
  if not found then raise exception 'Choose an active legal entity in this workspace.' using errcode='42501'; end if;
  v_amount:=(p_input->>'netAmount')::numeric;
  v_reference:=nullif(btrim(coalesce(p_input->>'sourceReference','')),'');
  if v_amount<=0 or v_amount::text in ('NaN','Infinity','-Infinity')
    or upper(coalesce(p_input->>'currencyCode',''))!~'^[A-Z]{3}$'
    or nullif(btrim(coalesce(p_input->>'number','')),'') is null
    or nullif(btrim(coalesce(p_input->>'description','')),'') is null then
    raise exception 'Complete the PO number, currency, description and positive net amount.' using errcode='22023';
  end if;
  if not exists(select 1 from public."Org_Master" where "Org_id"=(p_input->>'supplierOrgId')::uuid) then
    raise exception 'Supplier not found.' using errcode='P0002';
  end if;
  if (select count(*) from public."CRM_AccountProfiles"
      where "CRMAccount_OrgID"=(p_input->>'supplierOrgId')::uuid and "CRMAccount_CompanyID"=p_company_id
        and "CRMAccount_IsDeleted"=false
        and ("CRMAccount_LegalEntityID" is null or "CRMAccount_LegalEntityID"=v_entity."LegalEntity_ID"))<>1 then
    raise exception 'Choose one active supplier account for this legal entity.' using errcode='22023';
  end if;
  if nullif(p_input->>'jobId','') is not null then
    select * into v_job from public."Job_Header" where "Job_ID"=(p_input->>'jobId')::uuid;
    if not found or v_job."Job_IsDeleted" or v_job."Job_LegalEntityID" is distinct from v_entity."LegalEntity_ID"
      or (v_job."Job_Supplier" is not null and v_job."Job_Supplier"<>(p_input->>'supplierOrgId')::uuid)
      or not exists(select 1 from public."cmp_Offices"
        where "Office_ID"=coalesce(v_job."Job_OrgOfficeID",v_job."Job_OfficeID") and "Company_ID"=p_company_id) then
      raise exception 'The job must belong to this entity and supplier.' using errcode='22023';
    end if;
  end if;
  v_decision:=public.multideck_finance_approval_decision(p_company_id,v_entity."LegalEntity_ID",'purchase_order',v_amount,
    jsonb_build_object('hardException',upper(p_input->>'currencyCode') is distinct from upper(v_entity."LegalEntity_BaseCurrencyCodeSnapshot")
      or v_reference is null,'advisoryException',false));
  v_auto:=coalesce((v_decision->>'canAuto')::boolean,false);
  insert into public."FIN_SupplierPurchaseOrders"(
    "FINPO_LegalEntityID","FINPO_SupplierOrgID","FINPO_JobID","FINPO_Number","FINPO_CurrencyCode",
    "FINPO_NetAmount","FINPO_Description","FINPO_StatusCode","FINPO_SourceEvidenceJSON",
    "FINPO_CreatedBy","FINPO_ReviewedAt","FINPO_ReviewedBy","FINPO_ReviewReason")
  values(v_entity."LegalEntity_ID",(p_input->>'supplierOrgId')::uuid,nullif(p_input->>'jobId','')::uuid,
    left(btrim(p_input->>'number'),100),upper(p_input->>'currencyCode'),v_amount,
    left(btrim(p_input->>'description'),1000),case when v_auto then 'approved' else 'draft' end,
    jsonb_build_object('source','operator','reference',left(v_reference,200),'approvalPolicy',v_decision,
      'policyAmountBase',case when upper(p_input->>'currencyCode')=upper(v_entity."LegalEntity_BaseCurrencyCodeSnapshot") then v_amount else null end),
    p_user_id,case when v_auto then now() else null end,case when v_auto then p_user_id else null end,
    case when v_auto then 'Automatic under legal-entity approval policy' else null end)
  returning * into v_po;
  return to_jsonb(v_po);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Choose valid supplier, entity, job and amount values.' using errcode='22023';
end; $$;
revoke all on function public.multideck_finance_create_supplier_po(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_create_supplier_po(uuid,uuid,jsonb) to service_role;

create function public.multideck_finance_auto_match_supplier_invoice(
  p_company_id uuid, p_user_id uuid, p_proposal_id uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_proposal public."FIN_SupplierMatchProposals"%rowtype;
  v_doc public."FIN_Documents"%rowtype;
  v_po public."FIN_SupplierPurchaseOrders"%rowtype;
  v_base text; v_available numeric; v_variance numeric; v_eligible integer;
  v_cites_invoice boolean; v_cites_po boolean; v_decision jsonb; v_hard boolean;
begin
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then
    raise exception 'The finance operator is outside this workspace.' using errcode='42501';
  end if;
  select * into v_proposal from public."FIN_SupplierMatchProposals"
  where "FINMatchProposal_ID"=p_proposal_id for update;
  if not found then raise exception 'AI proposal not found.' using errcode='P0002'; end if;
  select upper("LegalEntity_BaseCurrencyCodeSnapshot") into v_base from public."cmp_LegalEntities"
  where "LegalEntity_ID"=v_proposal."FINMatchProposal_LegalEntityID" and "Company_ID"=p_company_id
    and "LegalEntity_IsActive" for share;
  if not found then raise exception 'AI proposal is outside this workspace.' using errcode='42501'; end if;
  if v_proposal."FINMatchProposal_CreatedBy"<>p_user_id then
    raise exception 'Only the proposal creator can request its policy decision.' using errcode='42501';
  end if;
  if v_proposal."FINMatchProposal_StatusCode"<>'pending' or v_proposal."FINMatchProposal_PurchaseOrderID" is null then
    return jsonb_build_object('status',v_proposal."FINMatchProposal_StatusCode",'reason','not_auto_candidate');
  end if;
  select * into v_doc from public."FIN_Documents" where "FINDoc_ID"=v_proposal."FINMatchProposal_DocumentID" for update;
  select * into v_po from public."FIN_SupplierPurchaseOrders" where "FINPO_ID"=v_proposal."FINMatchProposal_PurchaseOrderID" for update;
  select coalesce(sum("FINPOMatch_NetAmount"),0) into v_available
    from public."FIN_SupplierInvoiceMatches" where "FINPOMatch_PurchaseOrderID"=v_po."FINPO_ID";
  v_available:=v_po."FINPO_NetAmount"-v_available;
  select count(*) into v_eligible from public."FIN_SupplierPurchaseOrders" candidate
  where candidate."FINPO_LegalEntityID"=v_doc."FINDoc_LegalEntityID"
    and candidate."FINPO_SupplierOrgID"=v_doc."FINDoc_PartyOrgID"
    and candidate."FINPO_CurrencyCode"=v_doc."FINDoc_CurrencyCodeSnapshot"
    and candidate."FINPO_StatusCode"='approved'
    and (candidate."FINPO_JobID" is null or candidate."FINPO_JobID" is not distinct from v_doc."FINDoc_SourceJobID")
    and candidate."FINPO_NetAmount"-(select coalesce(sum("FINPOMatch_NetAmount"),0)
      from public."FIN_SupplierInvoiceMatches" where "FINPOMatch_PurchaseOrderID"=candidate."FINPO_ID")
      >=v_doc."FINDoc_NetAmount"-0.01;
  select exists(select 1 from jsonb_array_elements(v_proposal."FINMatchProposal_ResultJSON"->'citations') c
      where c->>'recordId'=v_doc."FINDoc_ID"::text and c->>'table'='FIN_Documents'),
    exists(select 1 from jsonb_array_elements(v_proposal."FINMatchProposal_ResultJSON"->'citations') c
      where c->>'recordId'=v_po."FINPO_ID"::text and c->>'table'='FIN_SupplierPurchaseOrders')
    into v_cites_invoice,v_cites_po;
  v_hard:=v_doc."FINDoc_TypeCode"<>'pl_invoice' or v_doc."FINDoc_StatusCode" not in ('draft','awaiting_approval')
    or v_po."FINPO_StatusCode"<>'approved'
    or v_doc."FINDoc_LegalEntityID" is distinct from v_po."FINPO_LegalEntityID"
    or v_doc."FINDoc_PartyOrgID" is distinct from v_po."FINPO_SupplierOrgID"
    or v_doc."FINDoc_CurrencyCodeSnapshot" is distinct from v_po."FINPO_CurrencyCode"
    or v_doc."FINDoc_CurrencyCodeSnapshot" is distinct from v_base
    or v_po."FINPO_JobID" is distinct from v_doc."FINDoc_SourceJobID"
    or v_doc."FINDoc_NetAmount"<=0 or v_available<=0
    or v_available+0.01<v_doc."FINDoc_NetAmount"
    or v_eligible<>1 or not v_cites_invoice or not v_cites_po
    or (v_proposal."FINMatchProposal_SourceJSON"#>>'{document,updatedAt}')::timestamptz is distinct from v_doc."FINDoc_UpdatedAt"
    or (v_proposal."FINMatchProposal_SourceJSON"#>>'{purchaseOrder,updatedAt}')::timestamptz is distinct from v_po."FINPO_ReviewedAt";
  if v_available>0 then v_variance:=round(abs(v_available-v_doc."FINDoc_NetAmount")/v_available*100,4); end if;
  v_decision:=public.multideck_finance_approval_decision(p_company_id,v_doc."FINDoc_LegalEntityID",'supplier_match',
    v_doc."FINDoc_NetAmount",jsonb_build_object('hardException',coalesce(v_hard,true),
      'advisoryException',coalesce(v_variance>0,false),'variancePercent',v_variance));
  if not coalesce((v_decision->>'canAuto')::boolean,false) then
    return jsonb_build_object('status','pending','reason',v_decision->>'reason','policy',v_decision);
  end if;
  insert into public."FIN_SupplierInvoiceMatches"(
    "FINPOMatch_PurchaseOrderID","FINPOMatch_DocumentID","FINPOMatch_NetAmount",
    "FINPOMatch_EvidenceJSON","FINPOMatch_ReviewerNote","FINPOMatch_ApprovedBy")
  values(v_po."FINPO_ID",v_doc."FINDoc_ID",v_doc."FINDoc_NetAmount",
    jsonb_build_object('proposalId',p_proposal_id,'ruleVersion','po-match-v1','document',
      jsonb_build_object('table','FIN_Documents','id',v_doc."FINDoc_ID",'updatedAt',v_doc."FINDoc_UpdatedAt"),
      'purchaseOrder',jsonb_build_object('table','FIN_SupplierPurchaseOrders','id',v_po."FINPO_ID",
        'reviewedAt',v_po."FINPO_ReviewedAt"),'approvalPolicy',v_decision,'variancePercent',v_variance),
    'Automatic source-cited match under legal-entity approval policy',p_user_id);
  return jsonb_build_object('status','approved','reason','within_policy','policy',v_decision);
end; $$;
revoke all on function public.multideck_finance_auto_match_supplier_invoice(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_auto_match_supplier_invoice(uuid,uuid,uuid) to service_role;

alter table public."FIN_PaymentRuns"
  add column "FINPayRun_ApprovalPolicyJSON" jsonb check ("FINPayRun_ApprovalPolicyJSON" is null or jsonb_typeof("FINPayRun_ApprovalPolicyJSON")='object');

create function public.multideck_finance_auto_finalise_payment_run(
  p_company_id uuid, p_user_id uuid, p_run_id uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_run public."FIN_PaymentRuns"%rowtype; v_bank public."FIN_BankAccounts"%rowtype;
  v_base text; v_count integer; v_total numeric; v_cash_id uuid;
  v_hard boolean; v_decision jsonb;
begin
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then
    raise exception 'The finance operator is outside this workspace.' using errcode='42501';
  end if;
  select run.* into v_run from public."FIN_PaymentRuns" run
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=run."FINPayRun_LegalEntityID"
  where run."FINPayRun_ID"=p_run_id and entity."Company_ID"=p_company_id and entity."LegalEntity_IsActive"
  for update of run;
  if not found then raise exception 'Payment run not found in this workspace.' using errcode='P0002'; end if;
  select upper("LegalEntity_BaseCurrencyCodeSnapshot") into v_base from public."cmp_LegalEntities"
  where "LegalEntity_ID"=v_run."FINPayRun_LegalEntityID" for share;
  if v_run."FINPayRun_CreatedBy"<>p_user_id then
    raise exception 'Only the payment-run preparer can request its policy decision.' using errcode='42501';
  end if;
  if v_run."FINPayRun_StatusCode"<>'awaiting_approval' then
    return jsonb_build_object('runId',p_run_id,'status',v_run."FINPayRun_StatusCode",'reason','not_auto_candidate');
  end if;
  select * into v_bank from public."FIN_BankAccounts" where "FINBank_ID"=v_run."FINPayRun_BankAccountID" for share;
  select count(*),coalesce(sum("FINPayRunItem_Amount"),0) into v_count,v_total
  from public."FIN_PaymentRunItems" where "FINPayRunItem_RunID"=p_run_id;
  v_hard:=v_bank."FINBank_ID" is null or not v_bank."FINBank_IsActive" or not v_bank."FINBank_AllowPayments"
    or v_bank."FINBank_LegalEntityID" is distinct from v_run."FINPayRun_LegalEntityID"
    or v_run."FINPayRun_CurrencyCodeSnapshot" is distinct from v_base
    or v_bank."FINBank_CurrencyCode" is distinct from v_run."FINPayRun_CurrencyCodeSnapshot"
    or v_run."FINPayRun_TotalAmount"<=0 or v_run."FINPayRun_LocalTotalAmount" is distinct from v_run."FINPayRun_TotalAmount"
    or v_total is distinct from v_run."FINPayRun_TotalAmount" or v_count not between 1 and 100
    or exists(select 1 from public."FIN_PaymentRunItems" item left join public."FIN_CashTransactions" cash
      on cash."FINCash_ID"=item."FINPayRunItem_CashID"
      where item."FINPayRunItem_RunID"=p_run_id and (cash."FINCash_ID" is null or cash."FINCash_StatusCode"<>'awaiting_approval'
        or cash."FINCash_LegalEntityID" is distinct from v_run."FINPayRun_LegalEntityID"
        or cash."FINCash_TypeCode"<>'supplier_payment'))
    or exists(select 1 from public."FIN_PaymentRunItems" item
      join public."FIN_CashTransactions" cash on cash."FINCash_ID"=item."FINPayRunItem_CashID"
      where item."FINPayRunItem_RunID"=p_run_id
      group by cash."FINCash_ID",cash."FINCash_Amount",cash."FINCash_LocalAmount"
      having cash."FINCash_Amount" is distinct from sum(item."FINPayRunItem_Amount")
        or cash."FINCash_LocalAmount" is distinct from sum(item."FINPayRunItem_LocalAmount"));
  v_decision:=public.multideck_finance_approval_decision(p_company_id,v_run."FINPayRun_LegalEntityID",'payment_run',
    v_run."FINPayRun_LocalTotalAmount",jsonb_build_object('hardException',coalesce(v_hard,true),'advisoryException',false));
  if not coalesce((v_decision->>'canAuto')::boolean,false) then
    return jsonb_build_object('runId',p_run_id,'status','awaiting_approval','reason',v_decision->>'reason','policy',v_decision);
  end if;
  for v_cash_id in select distinct "FINPayRunItem_CashID" from public."FIN_PaymentRunItems"
    where "FINPayRunItem_RunID"=p_run_id order by 1 loop
    perform public.multideck_finance_transition_cash(p_company_id,p_user_id,v_cash_id,'approve',
      'Automatic payment run under legal-entity approval policy');
  end loop;
  update public."FIN_PaymentRuns" set "FINPayRun_StatusCode"='approved',
    "FINPayRun_ApprovedAt"=now(),"FINPayRun_ApprovedBy"=p_user_id,
    "FINPayRun_ReviewedAt"=now(),"FINPayRun_ReviewedBy"=p_user_id,
    "FINPayRun_ApprovalPolicyJSON"=v_decision
  where "FINPayRun_ID"=p_run_id;
  update public."FIN_PaymentRunItems" set "FINPayRunItem_StatusCode"='approved'
  where "FINPayRunItem_RunID"=p_run_id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_user_id,v_run."FINPayRun_LegalEntityID",'multideck-app','finance','public',
    'FIN_PaymentRuns','finance_daily_operation',p_run_id,'auto_approve',
    'Payment run approved by legal-entity policy',
    jsonb_build_object('policy',v_decision,'bankAccountId',v_run."FINPayRun_BankAccountID",
      'paymentDate',v_run."FINPayRun_PaymentDate",'currency',v_run."FINPayRun_CurrencyCodeSnapshot",
      'amount',v_run."FINPayRun_TotalAmount",'localAmount',v_run."FINPayRun_LocalTotalAmount",
      'cashIds',(select jsonb_agg(distinct "FINPayRunItem_CashID") from public."FIN_PaymentRunItems"
        where "FINPayRunItem_RunID"=p_run_id)));
  return jsonb_build_object('runId',p_run_id,'status','approved','reason','within_policy','policy',v_decision);
end; $$;
revoke all on function public.multideck_finance_auto_finalise_payment_run(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_auto_finalise_payment_run(uuid,uuid,uuid) to service_role;

-- Chat reads policy evidence from the same operational records watched by
-- deterministic Finance signals. Dexter still has no daily-operation write action.
create or replace function public.multideck_dexter_domain_finance_operations(p_company_id uuid,p_search text default null,p_take integer default 10)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with evidence as (
    select proposal."FINMatchProposal_CreatedAt" observed_at,
      jsonb_build_object('recordId',proposal."FINMatchProposal_ID",'kind','supplier_match_proposal','status',proposal."FINMatchProposal_StatusCode",'documentId',proposal."FINMatchProposal_DocumentID",'purchaseOrderId',proposal."FINMatchProposal_PurchaseOrderID",'model',proposal."FINMatchProposal_Model",'promptVersion',proposal."FINMatchProposal_PromptVersion",'citations',proposal."FINMatchProposal_ResultJSON"->'citations','matchId',match."FINPOMatch_ID",'approvalPolicy',match."FINPOMatch_EvidenceJSON"->'approvalPolicy','source',jsonb_build_object('table','FIN_SupplierMatchProposals','id',proposal."FINMatchProposal_ID",'observedAt',proposal."FINMatchProposal_CreatedAt")) value
    from public."FIN_SupplierMatchProposals" proposal join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=proposal."FINMatchProposal_LegalEntityID" left join public."FIN_SupplierInvoiceMatches" match on match."FINPOMatch_DocumentID"=proposal."FINMatchProposal_DocumentID" and match."FINPOMatch_EvidenceJSON"->>'proposalId'=proposal."FINMatchProposal_ID"::text
    where entity."Company_ID"=p_company_id and (nullif(btrim(p_search),'') is null or proposal."FINMatchProposal_DocumentID"::text ilike '%'||btrim(p_search)||'%')
    union all
    select po."FINPO_CreatedAt" observed_at,
      jsonb_build_object('recordId',po."FINPO_ID",'kind','supplier_purchase_order','number',po."FINPO_Number",'status',po."FINPO_StatusCode",'supplier',supplier."Org_Name",'currency',po."FINPO_CurrencyCode",'netAmount',po."FINPO_NetAmount",'jobId',po."FINPO_JobID",'approvalPolicy',po."FINPO_SourceEvidenceJSON"->'approvalPolicy','source',jsonb_build_object('table','FIN_SupplierPurchaseOrders','id',po."FINPO_ID",'observedAt',po."FINPO_CreatedAt")) value
    from public."FIN_SupplierPurchaseOrders" po join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=po."FINPO_LegalEntityID" left join public."Org_Master" supplier on supplier."Org_id"=po."FINPO_SupplierOrgID"
    where entity."Company_ID"=p_company_id and (nullif(btrim(p_search),'') is null or concat_ws(' ',po."FINPO_Number",supplier."Org_Name") ilike '%'||btrim(p_search)||'%')
    union all
    select run."FINPayRun_CreatedAt",
      jsonb_build_object('recordId',run."FINPayRun_ID",'kind','payment_run','number',run."FINPayRun_Number",'status',run."FINPayRun_StatusCode",'currency',run."FINPayRun_CurrencyCodeSnapshot",'amount',run."FINPayRun_TotalAmount",'paymentDate',run."FINPayRun_PaymentDate",'approvalPolicy',run."FINPayRun_ApprovalPolicyJSON",'source',jsonb_build_object('table','FIN_PaymentRuns','id',run."FINPayRun_ID",'observedAt',run."FINPayRun_CreatedAt"))
    from public."FIN_PaymentRuns" run join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=run."FINPayRun_LegalEntityID"
    where entity."Company_ID"=p_company_id and (nullif(btrim(p_search),'') is null or run."FINPayRun_Number" ilike '%'||btrim(p_search)||'%')
    union all
    select action."FINCollect_CreatedAt",
      jsonb_build_object('recordId',action."FINCollect_ID",'kind','collection_action','action',action."FINCollect_ActionCode",'customer',customer."Org_Name",'documentId',action."FINCollect_DocumentID",'followUpDate',action."FINCollect_FollowUpDate",'source',jsonb_build_object('table','FIN_CollectionActions','id',action."FINCollect_ID",'observedAt',action."FINCollect_CreatedAt"))
    from public."FIN_CollectionActions" action join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=action."FINCollect_LegalEntityID" left join public."Org_Master" customer on customer."Org_id"=action."FINCollect_CustomerOrgID"
    where entity."Company_ID"=p_company_id and (nullif(btrim(p_search),'') is null or customer."Org_Name" ilike '%'||btrim(p_search)||'%')
  )
  select coalesce(jsonb_agg(value order by observed_at desc),'[]'::jsonb) from (select * from evidence order by observed_at desc limit greatest(1,least(coalesce(p_take,10),25))) limited;
$$;
update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description"='Tenant-safe supplier POs, source-cited AI match proposals, payment runs and collection actions with exact policy decision evidence where automation was used.',
    "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='finance_operations';
update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description"='Event-driven supplier PO, AI proposal, payment-run and collection-action changes, including policy-approved status changes.',
    "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='finance_operations';

commit;
