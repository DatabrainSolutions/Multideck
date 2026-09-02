-- Complete the tenant-local sales ledger, purchase ledger, cash allocation and
-- provider-neutral export lifecycle. All mutating functions are service-role
-- only; the authenticated Edge Function remains the permission boundary.

begin;

alter table public."FIN_Documents"
  add column if not exists "FINDoc_SourceKindCode" varchar(20) not null default 'manual',
  add column if not exists "FINDoc_IdempotencyKey" uuid not null default gen_random_uuid();

alter table public."FIN_CashTransactions"
  add column if not exists "FINCash_LegalEntityID" uuid references public."cmp_LegalEntities"("LegalEntity_ID") on delete set null,
  add column if not exists "FINCash_IdempotencyKey" uuid not null default gen_random_uuid(),
  add column if not exists "FINCash_MetadataJSON" jsonb not null default '{}'::jsonb,
  add column if not exists "FINCash_UpdatedAt" timestamptz not null default now(),
  add column if not exists "FINCash_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

update public."FIN_Documents"
set "FINDoc_SourceKindCode"='job'
where "FINDoc_SourceJobID" is not null and "FINDoc_SourceKindCode"='manual';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'CK_FIN_Documents_source_kind') then
    alter table public."FIN_Documents" add constraint "CK_FIN_Documents_source_kind"
      check ("FINDoc_SourceKindCode" in ('manual','job'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'CK_FIN_CashTransactions_metadata') then
    alter table public."FIN_CashTransactions" add constraint "CK_FIN_CashTransactions_metadata"
      check (jsonb_typeof("FINCash_MetadataJSON") = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'CK_FIN_CashTransactions_amount') then
    alter table public."FIN_CashTransactions" add constraint "CK_FIN_CashTransactions_amount"
      check ("FINCash_Amount" > 0 and "FINCash_UnallocatedAmount" >= 0 and "FINCash_UnallocatedAmount" <= "FINCash_Amount") not valid;
  end if;
end $$;

create unique index if not exists "UX_FIN_Documents_idempotency"
  on public."FIN_Documents"("FINDoc_IdempotencyKey");
create unique index if not exists "UX_FIN_CashTransactions_idempotency"
  on public."FIN_CashTransactions"("FINCash_IdempotencyKey");
create index if not exists "IX_FIN_Documents_ledger_register"
  on public."FIN_Documents"("FINDoc_LegalEntityID", "FINDoc_TypeCode", "FINDoc_StatusCode", "FINDoc_UpdatedAt" desc);
create index if not exists "IX_FIN_CashTransactions_register"
  on public."FIN_CashTransactions"("FINCash_LegalEntityID", "FINCash_TypeCode", "FINCash_StatusCode", "FINCash_UpdatedAt" desc);
create index if not exists "IX_FIN_CashAllocations_document"
  on public."FIN_CashAllocations"("FINCashAlloc_DocumentID", "FINCashAlloc_AllocationStatusCode");
create unique index if not exists "UX_FIN_IntegrationQueue_active_local_record"
  on public."FIN_IntegrationQueue"("FINIntQ_LocalTable", "FINIntQ_LocalID")
  where "FINIntQ_StatusCode" in ('queued','processing','blocked');

insert into public."sys_AccountingConnectionStatuses" ("ACCCS_Code","ACCCS_Name","ACCCS_IsFinal","ACCCS_SortOrder","ACCCS_IsActive") values
  ('draft','Draft',false,10,true),('active','Active',false,20,true),('error','Needs attention',false,30,true),('disabled','Disabled',true,40,true)
on conflict ("ACCCS_Code") do update set "ACCCS_Name"=excluded."ACCCS_Name","ACCCS_IsFinal"=excluded."ACCCS_IsFinal","ACCCS_IsActive"=true;

insert into public."sys_AccountingDirections" ("ACCDIR_Code","ACCDIR_Name","ACCDIR_SortOrder","ACCDIR_IsActive") values
  ('sales','Sales',10,true),('purchase','Purchase',20,true)
on conflict ("ACCDIR_Code") do update set "ACCDIR_Name"=excluded."ACCDIR_Name","ACCDIR_IsActive"=true;

insert into public."sys_AccountingDocumentTypes" ("ACCDT_Code","ACCDT_Name","ACCDT_DirectionCode","ACCDT_Description","ACCDT_SortOrder","ACCDT_IsActive") values
  ('sl_invoice','Sales invoice','sales','Customer invoice export.',10,true),
  ('credit_note','Customer credit note','sales','Customer credit export.',20,true),
  ('customer_receipt','Customer receipt','sales','Customer receipt and allocation export.',30,true),
  ('pl_invoice','Purchase invoice','purchase','Supplier invoice export.',40,true),
  ('debit_note','Supplier credit note','purchase','Supplier credit export.',50,true),
  ('supplier_payment','Supplier payment','purchase','Supplier payment and allocation export.',60,true)
on conflict ("ACCDT_Code") do update set "ACCDT_Name"=excluded."ACCDT_Name","ACCDT_DirectionCode"=excluded."ACCDT_DirectionCode","ACCDT_Description"=excluded."ACCDT_Description","ACCDT_IsActive"=true;

insert into public."sys_AccountingSyncStatuses" ("ACCSS_Code","ACCSS_Name","ACCSS_IsFinal","ACCSS_SortOrder","ACCSS_IsActive") values
  ('draft','Draft',false,10,true),('queued','Queued',false,20,true),('processing','Processing',false,30,true),('blocked','Blocked',false,40,true),('failed','Failed',false,50,true),('synced','Synced',true,60,true)
on conflict ("ACCSS_Code") do update set "ACCSS_Name"=excluded."ACCSS_Name","ACCSS_IsFinal"=excluded."ACCSS_IsFinal","ACCSS_IsActive"=true;

insert into public."sys_FinanceLineTypes" ("FINLINE_Code","FINLINE_Name","FINLINE_Description","FINLINE_SortOrder","FINLINE_IsActive") values
  ('freight','Freight','Job-related freight and forwarding service.',10,true),
  ('service','Service','Manually entered professional or operational service.',20,true),
  ('ancillary','Ancillary','Ad hoc handling, documentation and ancillary service.',30,true)
on conflict ("FINLINE_Code") do update set
  "FINLINE_Name"=excluded."FINLINE_Name", "FINLINE_Description"=excluded."FINLINE_Description", "FINLINE_IsActive"=true;

insert into public."sys_FinancePostingStatuses" ("FINPOSTST_Code","FINPOSTST_Name","FINPOSTST_Description","FINPOSTST_IsFinal","FINPOSTST_SortOrder","FINPOSTST_IsActive") values
  ('draft','Draft','Not yet approved for provider export.',false,10,true),
  ('queued','Queued','Approved and queued for the configured accounting provider.',false,20,true),
  ('processing','Processing','Currently being sent to the accounting provider.',false,30,true),
  ('posted','Posted','Accepted and submitted by the accounting provider.',true,40,true),
  ('blocked','Blocked','Missing a reviewed provider mapping or connection.',false,50,true),
  ('failed','Failed','Provider export failed and needs attention.',false,60,true)
on conflict ("FINPOSTST_Code") do update set
  "FINPOSTST_Name"=excluded."FINPOSTST_Name", "FINPOSTST_Description"=excluded."FINPOSTST_Description", "FINPOSTST_IsFinal"=excluded."FINPOSTST_IsFinal", "FINPOSTST_IsActive"=true;

insert into public."sys_FinanceCashTypes" ("FINCASHT_Code","FINCASHT_Name","FINCASHT_Description","FINCASHT_SortOrder","FINCASHT_IsActive") values
  ('customer_receipt','Customer receipt','Money received from a customer, with controlled receivable allocations.',10,true),
  ('supplier_payment','Supplier payment','Money paid to a supplier, with controlled payable allocations.',20,true)
on conflict ("FINCASHT_Code") do update set
  "FINCASHT_Name"=excluded."FINCASHT_Name", "FINCASHT_Description"=excluded."FINCASHT_Description", "FINCASHT_IsActive"=true;

insert into public."sys_FinanceCashStatuses" ("FINCASHST_Code","FINCASHST_Name","FINCASHST_Description","FINCASHST_IsFinal","FINCASHST_SortOrder","FINCASHST_IsActive") values
  ('draft','Draft','Prepared but not yet sent for finance review.',false,10,true),
  ('awaiting_approval','Awaiting approval','Waiting for an authorised finance reviewer.',false,20,true),
  ('approved','Approved','Approved, allocated and queued for provider export.',false,30,true),
  ('submitted','Submitted','Submitted to the configured accounting provider.',true,40,true),
  ('rejected','Rejected','Rejected by finance review.',true,50,true),
  ('failed','Submission failed','Provider submission failed and requires attention.',false,60,true)
on conflict ("FINCASHST_Code") do update set
  "FINCASHST_Name"=excluded."FINCASHST_Name", "FINCASHST_Description"=excluded."FINCASHST_Description", "FINCASHST_IsFinal"=excluded."FINCASHST_IsFinal", "FINCASHST_IsActive"=true;

insert into public."sys_FinanceAllocationStatuses" ("FINALLOCST_Code","FINALLOCST_Name","FINALLOCST_Description","FINALLOCST_IsFinal","FINALLOCST_SortOrder","FINALLOCST_IsActive") values
  ('pending','Pending','Proposed allocation awaiting finance approval.',false,10,true),
  ('allocated','Allocated','Approved allocation applied to the finance document.',true,20,true),
  ('reversed','Reversed','Allocation reversed through a controlled correction.',true,30,true)
on conflict ("FINALLOCST_Code") do update set
  "FINALLOCST_Name"=excluded."FINALLOCST_Name", "FINALLOCST_Description"=excluded."FINALLOCST_Description", "FINALLOCST_IsFinal"=excluded."FINALLOCST_IsFinal", "FINALLOCST_IsActive"=true;

insert into public."sys_FinanceAuthorityActionTypes" ("FINAUTHA_Code","FINAUTHA_Name","FINAUTHA_Description","FINAUTHA_SortOrder","FINAUTHA_IsActive") values
  ('finance_cash_post','Finance cash posting','Approve a reviewed receipt or payment, apply its allocations and queue provider submission.',40,true)
on conflict ("FINAUTHA_Code") do update set
  "FINAUTHA_Name"=excluded."FINAUTHA_Name", "FINAUTHA_Description"=excluded."FINAUTHA_Description", "FINAUTHA_IsActive"=true;

insert into public."sys_AuditEventTypes" ("AuditEventType_Code","AuditEventType_Name","AuditEventType_Description","AuditEventType_IsActive","AuditEventType_SortOrder") values
  ('finance_lifecycle','Finance lifecycle','Audited sales-ledger, purchase-ledger, cash-allocation and provider-export changes.',true,260)
on conflict ("AuditEventType_Code") do update set
  "AuditEventType_Name"=excluded."AuditEventType_Name", "AuditEventType_Description"=excluded."AuditEventType_Description", "AuditEventType_IsActive"=true;

insert into public."sys_Permissions" ("sys_Permission_Value","sys_Permission_Group","sys_Permission_Name","sys_Permission_Description","sys_Permission_IsDangerous") values
  ('Finance.Receivables.Cash','Finance','Prepare customer receipts','Prepare customer receipt and receivable allocation drafts.',false),
  ('Finance.Payables.Cash','Finance','Prepare supplier payments','Prepare supplier payment and payable allocation drafts.',false),
  ('Finance.Integration.Manage','Finance','Manage accounting integration','Test connections, review mappings and retry controlled provider exports.',true)
on conflict ("sys_Permission_Value") do update set
  "sys_Permission_Group"=excluded."sys_Permission_Group", "sys_Permission_Name"=excluded."sys_Permission_Name", "sys_Permission_Description"=excluded."sys_Permission_Description", "sys_Permission_IsDangerous"=excluded."sys_Permission_IsDangerous";

with role_permissions(role_name, permission_value) as (values
  ('Administrator','Finance.Receivables.Cash'),('Administrator','Finance.Payables.Cash'),('Administrator','Finance.Integration.Manage'),
  ('Finance manager','Finance.Receivables.Cash'),('Finance manager','Finance.Payables.Cash'),('Finance manager','Finance.Integration.Manage'),
  ('Operations manager','Finance.Receivables.Cash'),('Operations manager','Finance.Payables.Cash'),
  ('Operator','Finance.Receivables.Cash'),('Operator','Finance.Payables.Cash')
)
insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID","sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from role_permissions mapping
join public."sys_UserRoles" role on lower(role."sys_UserRole_Name")=lower(mapping.role_name)
join public."sys_Permissions" permission on permission."sys_Permission_Value"=mapping.permission_value
on conflict do nothing;

create or replace function public._multideck_finance_next_number(
  p_legal_entity_id uuid, p_record_type text
) returns text
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_sequence bigint; v_prefix text; v_code text;
begin
  if p_record_type not in ('sl_invoice','credit_note','pl_invoice','debit_note','customer_receipt','supplier_payment') then
    raise exception 'Unknown finance record type.' using errcode='22023';
  end if;
  v_prefix := case p_record_type
    when 'sl_invoice' then 'SI-' when 'credit_note' then 'CN-'
    when 'pl_invoice' then 'PI-' when 'debit_note' then 'DN-'
    when 'customer_receipt' then 'RCPT-' when 'supplier_payment' then 'PAY-'
  end;
  v_code := 'finance:' || p_legal_entity_id::text || ':' || p_record_type;
  insert into public."FIN_NumberSequences"(
    "FINSeq_Code","FINSeq_Name","FINSeq_LegalEntityID","FINSeq_DocumentTypeCode","FINSeq_Prefix","FINSeq_NextNumber","FINSeq_PaddingLength"
  ) values (
    v_code, v_prefix || 'sequence', p_legal_entity_id,
    case when p_record_type in ('sl_invoice','credit_note','pl_invoice','debit_note') then p_record_type else null end,
    v_prefix, 2, 6
  ) on conflict ("FINSeq_Code") do update set
    "FINSeq_NextNumber"=public."FIN_NumberSequences"."FINSeq_NextNumber"+1,
    "FINSeq_IsActive"=true
  returning "FINSeq_NextNumber"-1 into v_sequence;
  return v_prefix || lpad(v_sequence::text,6,'0');
end;
$$;

create or replace function public.multideck_finance_create_document_draft(
  p_company_id uuid, p_user_id uuid, p_input jsonb
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_type text:=p_input->>'type'; v_entity uuid; v_entity_currency text; v_party uuid; v_job uuid; v_job_company uuid; v_job_entity uuid; v_job_party uuid;
  v_date date; v_due date; v_currency text; v_exchange numeric; v_source_kind text; v_sign numeric; v_number text; v_document uuid;
  v_line jsonb; v_index integer:=0; v_quantity numeric; v_unit numeric; v_rate numeric; v_net numeric; v_tax numeric; v_gross numeric;
  v_total_net numeric:=0; v_total_tax numeric:=0; v_total_gross numeric:=0; v_line_id uuid; v_idempotency uuid; v_idempotent_company uuid;
begin
  if jsonb_typeof(p_input)<>'object' then raise exception 'Finance input must be an object.' using errcode='22023'; end if;
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then
    raise exception 'The finance operator is outside this workspace.' using errcode='42501';
  end if;
  if v_type not in ('sl_invoice','credit_note','pl_invoice','debit_note') then raise exception 'Choose a supported finance document type.' using errcode='22023'; end if;
  begin v_entity:=(p_input->>'legalEntityId')::uuid; v_party:=(p_input->>'partyOrgId')::uuid; exception when invalid_text_representation then raise exception 'Choose a valid legal entity and party.' using errcode='22023'; end;
  select upper("LegalEntity_BaseCurrencyCodeSnapshot") into v_entity_currency from public."cmp_LegalEntities" where "LegalEntity_ID"=v_entity and "Company_ID"=p_company_id and "LegalEntity_IsActive";
  if not found then
    raise exception 'That legal entity is not active in this workspace.' using errcode='42501';
  end if;
  if v_entity_currency is null or v_entity_currency!~'^[A-Z]{3}$' then raise exception 'Configure a valid base currency for this legal entity.' using errcode='22023'; end if;
  if not exists(select 1 from public."Org_Master" where "Org_id"=v_party) then raise exception 'Choose a valid customer or supplier.' using errcode='22023'; end if;
  begin v_date:=coalesce(nullif(p_input->>'documentDate','')::date,current_date); v_due:=nullif(p_input->>'dueDate','')::date; exception when invalid_datetime_format then raise exception 'Check the document and due dates.' using errcode='22023'; end;
  if v_due is not null and v_due<v_date then raise exception 'The due date cannot be before the document date.' using errcode='22023'; end if;
  v_currency:=upper(coalesce(nullif(btrim(p_input->>'currencyCode'),''),v_entity_currency));
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Enter a three-letter currency code.' using errcode='22023'; end if;
  begin v_exchange:=coalesce(nullif(p_input->>'exchangeRate','')::numeric,1); exception when invalid_text_representation then raise exception 'Enter a valid exchange rate.' using errcode='22023'; end;
  if v_exchange::text in ('NaN','Infinity','-Infinity') or v_exchange<=0 or (v_currency<>v_entity_currency and nullif(p_input->>'exchangeRate','') is null) then raise exception 'Enter the reviewed exchange rate from document currency to base currency.' using errcode='22023'; end if;
  if v_currency=v_entity_currency then v_exchange:=1; end if;
  if nullif(p_input->>'sourceJobId','') is not null then
    begin v_job:=(p_input->>'sourceJobId')::uuid; exception when invalid_text_representation then raise exception 'Choose a valid job.' using errcode='22023'; end;
    select office."Company_ID", job."Job_LegalEntityID", case when v_type in ('sl_invoice','credit_note') then job."Job_Customer" else job."Job_Supplier" end into v_job_company,v_job_entity,v_job_party
    from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_ID"=v_job and not job."Job_IsDeleted";
    if v_job_company is distinct from p_company_id or (v_job_entity is not null and v_job_entity is distinct from v_entity) then
      raise exception 'That job is outside the selected company or legal entity.' using errcode='42501';
    end if;
    if v_job_party is null or v_job_party is distinct from v_party then raise exception 'The selected party must match the customer or supplier on the job.' using errcode='22023'; end if;
  end if;
  if jsonb_typeof(p_input->'lines')<>'array' or jsonb_array_length(p_input->'lines') not between 1 and 100 then
    raise exception 'Add between one and 100 document lines.' using errcode='22023';
  end if;
  begin v_idempotency:=coalesce(nullif(p_input->>'idempotencyKey','')::uuid,gen_random_uuid()); exception when invalid_text_representation then raise exception 'The finance request key is invalid.' using errcode='22023'; end;
  select document."FINDoc_ID",entity."Company_ID" into v_document,v_idempotent_company from public."FIN_Documents" document join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=document."FINDoc_LegalEntityID" where document."FINDoc_IdempotencyKey"=v_idempotency;
  if v_document is not null and v_idempotent_company is distinct from p_company_id then raise exception 'The finance request key belongs to another workspace.' using errcode='42501'; end if;
  if v_document is not null then return (select to_jsonb(d) from public."FIN_Documents" d where d."FINDoc_ID"=v_document); end if;
  v_source_kind:=case when v_job is null then 'manual' else 'job' end; v_sign:=case when v_type in ('credit_note','debit_note') then -1 else 1 end;
  v_number:=public._multideck_finance_next_number(v_entity,v_type);
  insert into public."FIN_Documents"(
    "FINDoc_TypeCode","FINDoc_StatusCode","FINDoc_Number","FINDoc_LegalEntityID","FINDoc_PartyOrgID","FINDoc_PartyRole",
    "FINDoc_DocumentDate","FINDoc_AccountingDate","FINDoc_DueDate","FINDoc_CurrencyCodeSnapshot","FINDoc_SourceJobID","FINDoc_SourceTable","FINDoc_SourceID",
    "FINDoc_SourceKindCode","FINDoc_IdempotencyKey","FINDoc_ExchangeRate","FINDoc_MetadataJSON","FINDoc_CreatedBy","FINDoc_UpdatedBy"
  ) values (
    v_type,'draft',v_number,v_entity,v_party,case when v_type in ('sl_invoice','credit_note') then 'customer' else 'supplier' end,
    v_date,v_date,v_due,v_currency,v_job,case when v_job is null then null else 'Job_Header' end,v_job,
    v_source_kind,v_idempotency,v_exchange,jsonb_build_object('source','multideck_finance','sourceKind',v_source_kind,'baseCurrency',v_entity_currency),p_user_id,p_user_id
  ) returning "FINDoc_ID" into v_document;
  for v_line in select value from jsonb_array_elements(p_input->'lines') loop
    v_index:=v_index+1; v_quantity:=coalesce(nullif(v_line->>'quantity','')::numeric,1); v_unit:=coalesce(nullif(v_line->>'unitAmount','')::numeric,0); v_rate:=coalesce(nullif(v_line->>'taxRatePercent','')::numeric,0);
    if v_quantity::text in ('NaN','Infinity','-Infinity') or v_unit::text in ('NaN','Infinity','-Infinity') or v_rate::text in ('NaN','Infinity','-Infinity') or nullif(btrim(v_line->>'description'),'') is null or length(v_line->>'description')>1000 or nullif(btrim(v_line->>'chargeCode'),'') is null or length(v_line->>'chargeCode')>80 or v_quantity<=0 or v_unit<0 or v_rate<0 or v_rate>100 then
      raise exception 'Check finance line %.',v_index using errcode='22023';
    end if;
    if v_rate>0 and nullif(btrim(v_line->>'taxCode'),'') is null then raise exception 'Choose a tax treatment for finance line %.',v_index using errcode='22023'; end if;
    v_net:=round(v_quantity*v_unit,4)*v_sign; v_tax:=round(abs(v_net)*v_rate/100,4)*v_sign; v_gross:=v_net+v_tax;
    insert into public."FIN_DocumentLines"(
      "FINDocLine_DocumentID","FINDocLine_LineNo","FINDocLine_LineTypeCode","FINDocLine_ChargeCodeSnapshot","FINDocLine_Description","FINDocLine_Quantity","FINDocLine_UnitAmount",
      "FINDocLine_NetAmount","FINDocLine_TaxCodeSnapshot","FINDocLine_TaxRatePercent","FINDocLine_TaxAmount","FINDocLine_GrossAmount",
      "FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount","FINDocLine_LocalGrossAmount"
    ) values (
      v_document,v_index,case when v_job is not null then 'freight' when coalesce(v_line->>'lineType','')='ancillary' then 'ancillary' else 'service' end,
      nullif(left(btrim(v_line->>'chargeCode'),80),''),btrim(v_line->>'description'),v_quantity,v_unit,v_net,nullif(left(btrim(v_line->>'taxCode'),80),''),v_rate,v_tax,v_gross,round(v_net*v_exchange,4),round(v_tax*v_exchange,4),round(v_gross*v_exchange,4)
    ) returning "FINDocLine_ID" into v_line_id;
    if v_job is not null then
      insert into public."FIN_DocumentLineJobLinks"("FINDocLineJob_DocumentID","FINDocLineJob_DocumentLineID","FINDocLineJob_JobID","FINDocLineJob_LinkTypeCode","FINDocLineJob_NetAmount","FINDocLineJob_LocalNetAmount","FINDocLineJob_PercentOfLine")
      values(v_document,v_line_id,v_job,'source_job',v_net,round(v_net*v_exchange,4),100);
    end if;
    v_total_net:=v_total_net+v_net; v_total_tax:=v_total_tax+v_tax; v_total_gross:=v_total_gross+v_gross;
  end loop;
  if abs(v_total_gross)<=0 then raise exception 'The finance document gross amount must be greater than zero.' using errcode='22023'; end if;
  update public."FIN_Documents" set
    "FINDoc_NetAmount"=v_total_net,"FINDoc_TaxAmount"=v_total_tax,"FINDoc_GrossAmount"=v_total_gross,
    "FINDoc_LocalNetAmount"=round(v_total_net*v_exchange,4),"FINDoc_LocalTaxAmount"=round(v_total_tax*v_exchange,4),"FINDoc_LocalGrossAmount"=round(v_total_gross*v_exchange,4),
    "FINDoc_OutstandingAmount"=v_total_gross,"FINDoc_LocalOutstandingAmount"=round(v_total_gross*v_exchange,4),"FINDoc_UpdatedAt"=now()
  where "FINDoc_ID"=v_document;
  insert into public."FIN_DocumentStatusHistory"("FINDocStatus_DocumentID","FINDocStatus_ToStatusCode","FINDocStatus_ChangedBy","FINDocStatus_Reason","FINDocStatus_MetadataJSON")
  values(v_document,'draft',p_user_id,'Created in Multideck finance',jsonb_build_object('sourceKind',v_source_kind,'jobId',v_job));
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_user_id,v_entity,'multideck-app','finance','public','FIN_Documents',v_type,v_document,'create_draft','Finance document draft created',jsonb_build_object('number',v_number,'sourceKind',v_source_kind,'grossAmount',v_total_gross,'currency',v_currency,'exchangeRate',v_exchange));
  return (select to_jsonb(d) from public."FIN_Documents" d where d."FINDoc_ID"=v_document);
end;
$$;

create or replace function public.multideck_finance_transition_document(
  p_company_id uuid, p_user_id uuid, p_document_id uuid, p_transition text, p_reason text default null
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_document public."FIN_Documents"; v_entity_currency text; v_next text; v_queue uuid; v_line_count integer; v_line_net numeric; v_line_tax numeric; v_line_gross numeric;
begin
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then raise exception 'The finance operator is outside this workspace.' using errcode='42501'; end if;
  select document.* into v_document from public."FIN_Documents" document join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=document."FINDoc_LegalEntityID" where document."FINDoc_ID"=p_document_id and entity."Company_ID"=p_company_id for update of document;
  if not found then raise exception 'Finance document not found in this workspace.' using errcode='P0002'; end if;
  if p_transition='request_review' and v_document."FINDoc_StatusCode"='draft' then v_next:='awaiting_approval';
  elsif p_transition='approve' and v_document."FINDoc_StatusCode"='awaiting_approval' then v_next:='approved';
  elsif p_transition='reject' and v_document."FINDoc_StatusCode"='awaiting_approval' then v_next:='rejected';
  else raise exception 'That finance document transition is not available from its current status.' using errcode='22023'; end if;
  if v_next in ('awaiting_approval','approved') then
    select upper("LegalEntity_BaseCurrencyCodeSnapshot") into v_entity_currency from public."cmp_LegalEntities" where "LegalEntity_ID"=v_document."FINDoc_LegalEntityID" and "Company_ID"=p_company_id and "LegalEntity_IsActive";
    if not found or v_entity_currency is null or v_entity_currency!~'^[A-Z]{3}$' then raise exception 'Configure a valid base currency for this legal entity.' using errcode='22023'; end if;
    if upper(coalesce(v_document."FINDoc_CurrencyCodeSnapshot",''))!~'^[A-Z]{3}$' then raise exception 'The finance document has no valid transaction currency.' using errcode='22023'; end if;
    if v_document."FINDoc_ExchangeRate"::text in ('NaN','Infinity','-Infinity') or v_document."FINDoc_ExchangeRate"<=0 or (upper(v_document."FINDoc_CurrencyCodeSnapshot")=v_entity_currency and v_document."FINDoc_ExchangeRate"<>1) then raise exception 'The finance document has no valid reviewed exchange rate.' using errcode='22023'; end if;
    if v_document."FINDoc_DueDate" is not null and v_document."FINDoc_DueDate"<v_document."FINDoc_DocumentDate" then raise exception 'The due date cannot be before the document date.' using errcode='22023'; end if;
    if v_document."FINDoc_GrossAmount"=0 or (v_document."FINDoc_TypeCode" in ('credit_note','debit_note') and v_document."FINDoc_GrossAmount">=0) or (v_document."FINDoc_TypeCode" in ('sl_invoice','pl_invoice') and v_document."FINDoc_GrossAmount"<=0) then raise exception 'The finance document amount has the wrong invoice or credit polarity.' using errcode='22023'; end if;
    if not exists(select 1 from public."Org_Master" where "Org_id"=v_document."FINDoc_PartyOrgID") then raise exception 'The finance document customer or supplier is no longer available.' using errcode='22023'; end if;
    if v_document."FINDoc_SourceKindCode"='job' and not exists(
      select 1 from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
      where job."Job_ID"=v_document."FINDoc_SourceJobID" and not job."Job_IsDeleted" and office."Company_ID"=p_company_id
        and (job."Job_LegalEntityID" is null or job."Job_LegalEntityID"=v_document."FINDoc_LegalEntityID")
        and case when v_document."FINDoc_TypeCode" in ('sl_invoice','credit_note') then job."Job_Customer" else job."Job_Supplier" end=v_document."FINDoc_PartyOrgID"
    ) then raise exception 'The job, legal entity and customer or supplier no longer match.' using errcode='22023'; end if;
    select count(*),coalesce(sum("FINDocLine_NetAmount"),0),coalesce(sum("FINDocLine_TaxAmount"),0),coalesce(sum("FINDocLine_GrossAmount"),0) into v_line_count,v_line_net,v_line_tax,v_line_gross from public."FIN_DocumentLines" where "FINDocLine_DocumentID"=p_document_id;
    if v_line_count not between 1 and 100 or v_line_net is distinct from v_document."FINDoc_NetAmount" or v_line_tax is distinct from v_document."FINDoc_TaxAmount" or v_line_gross is distinct from v_document."FINDoc_GrossAmount" then raise exception 'The finance document header no longer agrees with its lines.' using errcode='22023'; end if;
    if exists(select 1 from public."FIN_DocumentLines" where "FINDocLine_DocumentID"=p_document_id and (nullif(btrim("FINDocLine_Description"),'') is null or nullif(btrim("FINDocLine_ChargeCodeSnapshot"),'') is null or "FINDocLine_Quantity"<=0 or "FINDocLine_UnitAmount"<0 or "FINDocLine_TaxRatePercent" not between 0 and 100 or ("FINDocLine_TaxRatePercent">0 and nullif(btrim("FINDocLine_TaxCodeSnapshot"),'') is null))) then raise exception 'One or more finance document lines are incomplete.' using errcode='22023'; end if;
  end if;
  update public."FIN_Documents" set "FINDoc_StatusCode"=v_next,
    "FINDoc_PostingStatusCode"=case when v_next='approved' then 'queued' else "FINDoc_PostingStatusCode" end,
    "FINDoc_ExportStatusCode"=case when v_next='approved' then 'queued' else "FINDoc_ExportStatusCode" end,
    "FINDoc_UpdatedAt"=now(),"FINDoc_UpdatedBy"=p_user_id where "FINDoc_ID"=p_document_id;
  if v_next='awaiting_approval' then
    insert into public."FIN_AuthorisationRequests"("FINAUTHREQ_ActionTypeCode","FINAUTHREQ_SourceTable","FINAUTHREQ_SourceID","FINAUTHREQ_DocumentID","FINAUTHREQ_RequestedBy","FINAUTHREQ_Amount","FINAUTHREQ_CurrencyCodeSnapshot","FINAUTHREQ_Reason")
    values('finance_post','FIN_Documents',p_document_id,p_document_id,p_user_id,v_document."FINDoc_GrossAmount",v_document."FINDoc_CurrencyCodeSnapshot",coalesce(nullif(btrim(p_reason),''),'Finance review requested'));
  elsif v_next='approved' then
    insert into public."FIN_IntegrationQueue"("FINIntQ_LocalTable","FINIntQ_LocalID","FINIntQ_DocumentID","FINIntQ_StatusCode","FINIntQ_CreatedBy")
    values('FIN_Documents',p_document_id,p_document_id,'queued',p_user_id)
    on conflict ("FINIntQ_LocalTable","FINIntQ_LocalID") where "FINIntQ_StatusCode" in ('queued','processing','blocked') do update set "FINIntQ_StatusCode"='queued',"FINIntQ_LastError"=null
    returning "FINIntQ_ID" into v_queue;
  end if;
  if v_next in ('approved','rejected') then
    with resolved as (
      update public."FIN_AuthorisationRequests" set "FINAUTHREQ_StatusCode"=v_next where "FINAUTHREQ_SourceTable"='FIN_Documents' and "FINAUTHREQ_SourceID"=p_document_id and "FINAUTHREQ_StatusCode"='awaiting_approval' returning "FINAUTHREQ_ID"
    ) insert into public."FIN_AuthorisationDecisions"("FINAUTHDEC_RequestID","FINAUTHDEC_DecisionCode","FINAUTHDEC_DecidedBy","FINAUTHDEC_Comments","FINAUTHDEC_MetadataJSON")
      select "FINAUTHREQ_ID",v_next,p_user_id,nullif(btrim(p_reason),''),jsonb_build_object('transition',p_transition) from resolved;
  end if;
  insert into public."FIN_DocumentStatusHistory"("FINDocStatus_DocumentID","FINDocStatus_FromStatusCode","FINDocStatus_ToStatusCode","FINDocStatus_ChangedBy","FINDocStatus_Reason","FINDocStatus_MetadataJSON")
  values(p_document_id,v_document."FINDoc_StatusCode",v_next,p_user_id,nullif(btrim(p_reason),''),jsonb_build_object('integrationQueueId',v_queue));
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_user_id,v_document."FINDoc_LegalEntityID",'multideck-app','finance','public','FIN_Documents',v_document."FINDoc_TypeCode",p_document_id,p_transition,'Finance document status changed',jsonb_build_object('from',v_document."FINDoc_StatusCode",'to',v_next,'integrationQueueId',v_queue));
  return (select to_jsonb(d) from public."FIN_Documents" d where d."FINDoc_ID"=p_document_id);
end;
$$;

create or replace function public.multideck_finance_create_cash_draft(
  p_company_id uuid, p_user_id uuid, p_input jsonb
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_type text:=p_input->>'type'; v_entity uuid; v_entity_currency text; v_party uuid; v_bank uuid; v_date date; v_currency text; v_exchange numeric; v_amount numeric; v_number text; v_cash uuid; v_idempotency uuid;
  v_allocation jsonb; v_document public."FIN_Documents"; v_allocated numeric; v_total_allocated numeric:=0; v_idempotent_company uuid;
begin
  if jsonb_typeof(p_input)<>'object' then raise exception 'Finance input must be an object.' using errcode='22023'; end if;
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then raise exception 'The finance operator is outside this workspace.' using errcode='42501'; end if;
  if v_type not in ('customer_receipt','supplier_payment') then raise exception 'Choose a customer receipt or supplier payment.' using errcode='22023'; end if;
  begin v_entity:=(p_input->>'legalEntityId')::uuid; v_party:=(p_input->>'partyOrgId')::uuid; v_bank:=nullif(p_input->>'bankAccountId','')::uuid; exception when invalid_text_representation then raise exception 'Choose a valid legal entity, party and bank account.' using errcode='22023'; end;
  if v_bank is null then raise exception 'Choose an active bank account before recording a receipt or payment.' using errcode='22023'; end if;
  select upper("LegalEntity_BaseCurrencyCodeSnapshot") into v_entity_currency from public."cmp_LegalEntities" where "LegalEntity_ID"=v_entity and "Company_ID"=p_company_id and "LegalEntity_IsActive";
  if not found then raise exception 'That legal entity is not active in this workspace.' using errcode='42501'; end if;
  if v_entity_currency is null or v_entity_currency!~'^[A-Z]{3}$' then raise exception 'Configure a valid base currency for this legal entity.' using errcode='22023'; end if;
  if not exists(select 1 from public."Org_Master" where "Org_id"=v_party) then raise exception 'Choose a valid customer or supplier.' using errcode='22023'; end if;
  if not exists(select 1 from public."FIN_BankAccounts" where "FINBank_ID"=v_bank and "FINBank_LegalEntityID"=v_entity and "FINBank_IsActive") then raise exception 'Choose an active bank account for this legal entity.' using errcode='22023'; end if;
  begin v_date:=coalesce(nullif(p_input->>'transactionDate','')::date,current_date); v_amount:=(p_input->>'amount')::numeric; exception when invalid_datetime_format or invalid_text_representation then raise exception 'Check the cash date and amount.' using errcode='22023'; end;
  if v_amount::text in ('NaN','Infinity','-Infinity') or v_amount<=0 then raise exception 'The receipt or payment amount must be greater than zero.' using errcode='22023'; end if;
  v_currency:=upper(coalesce(nullif(btrim(p_input->>'currencyCode'),''),v_entity_currency)); if v_currency!~'^[A-Z]{3}$' then raise exception 'Enter a three-letter currency code.' using errcode='22023'; end if;
  begin v_exchange:=coalesce(nullif(p_input->>'exchangeRate','')::numeric,1); exception when invalid_text_representation then raise exception 'Enter a valid exchange rate.' using errcode='22023'; end;
  if v_exchange::text in ('NaN','Infinity','-Infinity') or v_exchange<=0 or (v_currency<>v_entity_currency and nullif(p_input->>'exchangeRate','') is null) then raise exception 'Enter the reviewed exchange rate from transaction currency to base currency.' using errcode='22023'; end if;
  if v_currency=v_entity_currency then v_exchange:=1; end if;
  if not exists(select 1 from public."FIN_BankAccounts" where "FINBank_ID"=v_bank and "FINBank_LegalEntityID"=v_entity and upper("FINBank_CurrencyCode")=v_currency and "FINBank_IsActive") then raise exception 'The bank account currency must match the receipt or payment currency.' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_input->'allocations','[]'::jsonb)) is distinct from 'array' then raise exception 'Cash allocations must be an array.' using errcode='22023'; end if;
  if coalesce(jsonb_array_length(coalesce(p_input->'allocations','[]'::jsonb)),0)>100 then raise exception 'Add no more than 100 allocations.' using errcode='22023'; end if;
  begin v_idempotency:=coalesce(nullif(p_input->>'idempotencyKey','')::uuid,gen_random_uuid()); exception when invalid_text_representation then raise exception 'The finance request key is invalid.' using errcode='22023'; end;
  select cash."FINCash_ID",entity."Company_ID" into v_cash,v_idempotent_company from public."FIN_CashTransactions" cash join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=cash."FINCash_LegalEntityID" where cash."FINCash_IdempotencyKey"=v_idempotency;
  if v_cash is not null and v_idempotent_company is distinct from p_company_id then raise exception 'The finance request key belongs to another workspace.' using errcode='42501'; end if;
  if v_cash is not null then return (select to_jsonb(c) from public."FIN_CashTransactions" c where c."FINCash_ID"=v_cash); end if;
  v_number:=public._multideck_finance_next_number(v_entity,v_type);
  insert into public."FIN_CashTransactions"("FINCash_TypeCode","FINCash_StatusCode","FINCash_Number","FINCash_LegalEntityID","FINCash_BankAccountID","FINCash_PartyOrgID","FINCash_TransactionDate","FINCash_AccountingDate","FINCash_CurrencyCodeSnapshot","FINCash_ExchangeRate","FINCash_Amount","FINCash_LocalAmount","FINCash_UnallocatedAmount","FINCash_LocalUnallocatedAmount","FINCash_Reference","FINCash_IdempotencyKey","FINCash_MetadataJSON","FINCash_CreatedBy","FINCash_UpdatedBy")
  values(v_type,'draft',v_number,v_entity,v_bank,v_party,v_date,v_date,v_currency,v_exchange,v_amount,round(v_amount*v_exchange,4),v_amount,round(v_amount*v_exchange,4),nullif(left(btrim(p_input->>'reference'),180),''),v_idempotency,jsonb_build_object('source','multideck_finance','baseCurrency',v_entity_currency),p_user_id,p_user_id)
  returning "FINCash_ID" into v_cash;
  for v_allocation in select value from jsonb_array_elements(coalesce(p_input->'allocations','[]'::jsonb)) loop
    begin v_allocated:=(v_allocation->>'amount')::numeric; select document.* into v_document from public."FIN_Documents" document join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=document."FINDoc_LegalEntityID" where document."FINDoc_ID"=(v_allocation->>'documentId')::uuid and entity."Company_ID"=p_company_id;
    exception when invalid_text_representation then raise exception 'Choose a valid document for every allocation.' using errcode='22023'; end;
    if not found or v_allocated::text in ('NaN','Infinity','-Infinity') or v_document."FINDoc_LegalEntityID" is distinct from v_entity or v_document."FINDoc_PartyOrgID" is distinct from v_party or v_document."FINDoc_CurrencyCodeSnapshot"<>v_currency or v_document."FINDoc_StatusCode" not in ('approved','submitted') or v_document."FINDoc_TypeCode"<>(case when v_type='customer_receipt' then 'sl_invoice' else 'pl_invoice' end) or v_allocated<=0 or v_allocated>v_document."FINDoc_OutstandingAmount" then
      raise exception 'An allocation does not match this party, currency, ledger or open balance.' using errcode='22023';
    end if;
    if exists(select 1 from public."FIN_CashAllocations" where "FINCashAlloc_CashID"=v_cash and "FINCashAlloc_DocumentID"=v_document."FINDoc_ID") then raise exception 'Allocate to each document once.' using errcode='22023'; end if;
    insert into public."FIN_CashAllocations"("FINCashAlloc_CashID","FINCashAlloc_DocumentID","FINCashAlloc_AllocationStatusCode","FINCashAlloc_AllocatedAmount","FINCashAlloc_LocalAllocatedAmount","FINCashAlloc_AllocatedBy") values(v_cash,v_document."FINDoc_ID",'pending',v_allocated,round(v_allocated*v_document."FINDoc_ExchangeRate",4),p_user_id);
    v_total_allocated:=v_total_allocated+v_allocated;
  end loop;
  if v_total_allocated>v_amount then raise exception 'Allocations cannot exceed the receipt or payment amount.' using errcode='22023'; end if;
  update public."FIN_CashTransactions" set "FINCash_UnallocatedAmount"=v_amount-v_total_allocated,"FINCash_LocalUnallocatedAmount"=round((v_amount-v_total_allocated)*v_exchange,4),"FINCash_UpdatedAt"=now() where "FINCash_ID"=v_cash;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_user_id,v_entity,'multideck-app','finance','public','FIN_CashTransactions',v_type,v_cash,'create_draft','Finance cash draft created',jsonb_build_object('number',v_number,'amount',v_amount,'allocatedAmount',v_total_allocated,'currency',v_currency,'exchangeRate',v_exchange));
  return (select to_jsonb(c) from public."FIN_CashTransactions" c where c."FINCash_ID"=v_cash);
end;
$$;

create or replace function public.multideck_finance_transition_cash(
  p_company_id uuid, p_user_id uuid, p_cash_id uuid, p_transition text, p_reason text default null
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_cash public."FIN_CashTransactions"; v_entity_currency text; v_bank_currency text; v_next text; v_allocation public."FIN_CashAllocations"; v_document public."FIN_Documents"; v_queue uuid; v_allocation_count integer; v_total_allocated numeric;
begin
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then raise exception 'The finance operator is outside this workspace.' using errcode='42501'; end if;
  select cash.* into v_cash from public."FIN_CashTransactions" cash join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=cash."FINCash_LegalEntityID" where cash."FINCash_ID"=p_cash_id and entity."Company_ID"=p_company_id for update of cash;
  if not found then raise exception 'Cash transaction not found in this workspace.' using errcode='P0002'; end if;
  if p_transition='request_review' and v_cash."FINCash_StatusCode"='draft' then v_next:='awaiting_approval';
  elsif p_transition='approve' and v_cash."FINCash_StatusCode"='awaiting_approval' then v_next:='approved';
  elsif p_transition='reject' and v_cash."FINCash_StatusCode"='awaiting_approval' then v_next:='rejected';
  else raise exception 'That cash transition is not available from its current status.' using errcode='22023'; end if;
  if v_next in ('awaiting_approval','approved') then
    select upper("LegalEntity_BaseCurrencyCodeSnapshot") into v_entity_currency from public."cmp_LegalEntities" where "LegalEntity_ID"=v_cash."FINCash_LegalEntityID" and "Company_ID"=p_company_id and "LegalEntity_IsActive";
    if not found or v_entity_currency is null or v_entity_currency!~'^[A-Z]{3}$' then raise exception 'Configure a valid base currency for this legal entity.' using errcode='22023'; end if;
    if upper(coalesce(v_cash."FINCash_CurrencyCodeSnapshot",''))!~'^[A-Z]{3}$' then raise exception 'The receipt or payment has no valid transaction currency.' using errcode='22023'; end if;
    if v_cash."FINCash_ExchangeRate"::text in ('NaN','Infinity','-Infinity') or v_cash."FINCash_ExchangeRate"<=0 or (upper(v_cash."FINCash_CurrencyCodeSnapshot")=v_entity_currency and v_cash."FINCash_ExchangeRate"<>1) then raise exception 'The receipt or payment has no valid reviewed exchange rate.' using errcode='22023'; end if;
    if v_cash."FINCash_Amount"::text in ('NaN','Infinity','-Infinity') or v_cash."FINCash_Amount"<=0 or v_cash."FINCash_LocalAmount" is distinct from round(v_cash."FINCash_Amount"*v_cash."FINCash_ExchangeRate",4) then raise exception 'The receipt or payment amount no longer agrees with its exchange rate.' using errcode='22023'; end if;
    if v_cash."FINCash_BankAccountID" is null then raise exception 'Choose an active bank account before approving this receipt or payment.' using errcode='22023'; end if;
    select upper("FINBank_CurrencyCode") into v_bank_currency from public."FIN_BankAccounts" where "FINBank_ID"=v_cash."FINCash_BankAccountID" and "FINBank_LegalEntityID"=v_cash."FINCash_LegalEntityID" and "FINBank_IsActive";
    if not found then raise exception 'The selected bank account is no longer active for this legal entity.' using errcode='22023'; end if;
    if v_bank_currency is null or v_bank_currency!~'^[A-Z]{3}$' then raise exception 'Configure a valid currency for the selected bank account.' using errcode='22023'; end if;
    if v_bank_currency<>upper(v_cash."FINCash_CurrencyCodeSnapshot") then raise exception 'The bank account currency must match the receipt or payment currency.' using errcode='22023'; end if;
    if not exists(select 1 from public."Org_Master" where "Org_id"=v_cash."FINCash_PartyOrgID") then raise exception 'The receipt or payment customer or supplier is no longer available.' using errcode='22023'; end if;
    select count(*),coalesce(sum("FINCashAlloc_AllocatedAmount"),0) into v_allocation_count,v_total_allocated from public."FIN_CashAllocations" where "FINCashAlloc_CashID"=p_cash_id and "FINCashAlloc_AllocationStatusCode"='pending';
    if v_allocation_count>100 or v_total_allocated>v_cash."FINCash_Amount" or v_cash."FINCash_UnallocatedAmount" is distinct from v_cash."FINCash_Amount"-v_total_allocated then raise exception 'The receipt or payment allocations no longer agree with its amount.' using errcode='22023'; end if;
  end if;
  if v_next='approved' then
    for v_allocation in select * from public."FIN_CashAllocations" where "FINCashAlloc_CashID"=p_cash_id and "FINCashAlloc_AllocationStatusCode"='pending' order by "FINCashAlloc_DocumentID" for update loop
      select * into v_document from public."FIN_Documents" where "FINDoc_ID"=v_allocation."FINCashAlloc_DocumentID" for update;
      if not found or v_document."FINDoc_LegalEntityID" is distinct from v_cash."FINCash_LegalEntityID" or v_document."FINDoc_PartyOrgID" is distinct from v_cash."FINCash_PartyOrgID" or v_document."FINDoc_CurrencyCodeSnapshot"<>v_cash."FINCash_CurrencyCodeSnapshot" or v_document."FINDoc_StatusCode" not in ('approved','submitted') or v_document."FINDoc_TypeCode"<>(case when v_cash."FINCash_TypeCode"='customer_receipt' then 'sl_invoice' else 'pl_invoice' end) or v_document."FINDoc_OutstandingAmount"<v_allocation."FINCashAlloc_AllocatedAmount" then raise exception 'An allocation is no longer valid against the open balance.' using errcode='22023'; end if;
      update public."FIN_Documents" set "FINDoc_OutstandingAmount"="FINDoc_OutstandingAmount"-v_allocation."FINCashAlloc_AllocatedAmount","FINDoc_LocalOutstandingAmount"="FINDoc_LocalOutstandingAmount"-v_allocation."FINCashAlloc_LocalAllocatedAmount","FINDoc_UpdatedAt"=now(),"FINDoc_UpdatedBy"=p_user_id where "FINDoc_ID"=v_document."FINDoc_ID";
      update public."FIN_CashAllocations" set "FINCashAlloc_AllocationStatusCode"='allocated',"FINCashAlloc_AllocatedAt"=now(),"FINCashAlloc_AllocatedBy"=p_user_id where "FINCashAlloc_ID"=v_allocation."FINCashAlloc_ID";
    end loop;
    insert into public."FIN_IntegrationQueue"("FINIntQ_LocalTable","FINIntQ_LocalID","FINIntQ_StatusCode","FINIntQ_CreatedBy") values('FIN_CashTransactions',p_cash_id,'queued',p_user_id)
    on conflict ("FINIntQ_LocalTable","FINIntQ_LocalID") where "FINIntQ_StatusCode" in ('queued','processing','blocked') do update set "FINIntQ_StatusCode"='queued',"FINIntQ_LastError"=null returning "FINIntQ_ID" into v_queue;
  elsif v_next='awaiting_approval' then
    insert into public."FIN_AuthorisationRequests"("FINAUTHREQ_ActionTypeCode","FINAUTHREQ_SourceTable","FINAUTHREQ_SourceID","FINAUTHREQ_RequestedBy","FINAUTHREQ_Amount","FINAUTHREQ_CurrencyCodeSnapshot","FINAUTHREQ_Reason")
    values('finance_cash_post','FIN_CashTransactions',p_cash_id,p_user_id,v_cash."FINCash_Amount",v_cash."FINCash_CurrencyCodeSnapshot",coalesce(nullif(btrim(p_reason),''),'Finance cash review requested'));
  end if;
  if v_next in ('approved','rejected') then
    with resolved as (
      update public."FIN_AuthorisationRequests" set "FINAUTHREQ_StatusCode"=v_next where "FINAUTHREQ_SourceTable"='FIN_CashTransactions' and "FINAUTHREQ_SourceID"=p_cash_id and "FINAUTHREQ_StatusCode"='awaiting_approval' returning "FINAUTHREQ_ID"
    ) insert into public."FIN_AuthorisationDecisions"("FINAUTHDEC_RequestID","FINAUTHDEC_DecisionCode","FINAUTHDEC_DecidedBy","FINAUTHDEC_Comments","FINAUTHDEC_MetadataJSON")
      select "FINAUTHREQ_ID",v_next,p_user_id,nullif(btrim(p_reason),''),jsonb_build_object('transition',p_transition) from resolved;
  end if;
  update public."FIN_CashTransactions" set "FINCash_StatusCode"=v_next,"FINCash_PostingStatusCode"=case when v_next='approved' then 'queued' else "FINCash_PostingStatusCode" end,"FINCash_UpdatedAt"=now(),"FINCash_UpdatedBy"=p_user_id where "FINCash_ID"=p_cash_id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_user_id,v_cash."FINCash_LegalEntityID",'multideck-app','finance','public','FIN_CashTransactions',v_cash."FINCash_TypeCode",p_cash_id,p_transition,'Finance cash status changed',jsonb_build_object('from',v_cash."FINCash_StatusCode",'to',v_next,'integrationQueueId',v_queue));
  return (select to_jsonb(c) from public."FIN_CashTransactions" c where c."FINCash_ID"=p_cash_id);
end;
$$;

create or replace function public.multideck_finance_approve_configuration(
  p_company_id uuid, p_user_id uuid, p_run_id uuid
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_run public."FIN_ConfigurationRuns"; v_entity public."cmp_LegalEntities"; v_connection uuid; v_provider_currency text; v_currency_initialised boolean:=false;
begin
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then raise exception 'The finance operator is outside this workspace.' using errcode='42501'; end if;
  select * into v_run from public."FIN_ConfigurationRuns" where "FINConfigRun_ID"=p_run_id for update; if not found or v_run."FINConfigRun_StatusCode"<>'awaiting_approval' then raise exception 'That finance configuration is not awaiting approval.' using errcode='22023'; end if;
  select * into v_entity from public."cmp_LegalEntities" where "LegalEntity_ID"=v_run."FINConfigRun_LegalEntityID" and "Company_ID"=p_company_id and "LegalEntity_IsActive" for update; if not found then raise exception 'Finance configuration is outside this workspace.' using errcode='42501'; end if;
  if v_run."FINConfigRun_ProviderCode"<>'erpnext' then raise exception 'This provider adapter is recognised but not enabled yet.' using errcode='22023'; end if;
  if nullif(btrim(v_run."FINConfigRun_ExternalCompany"),'') is null then raise exception 'Choose the accounting Company.' using errcode='22023'; end if;
  if not exists(select 1 from public."RefCountry" where upper("RN_Code")=upper(v_run."FINConfigRun_CountryCode") and coalesce("RN_IsActive",true)) then raise exception 'Enter a valid two-letter ISO country code.' using errcode='22023'; end if;
  v_provider_currency:=upper(coalesce(v_run."FINConfigRun_PreviewJSON"#>>'{providerPreflight,baseCurrencyCode}',''));
  if v_provider_currency!~'^[A-Z]{3}$' then raise exception 'Repeat the accounting Company currency preflight before approval.' using errcode='22023'; end if;
  if upper(coalesce(v_entity."LegalEntity_BaseCurrencyCodeSnapshot",''))!~'^[A-Z]{3}$' then
    update public."cmp_LegalEntities" set "LegalEntity_BaseCurrencyCodeSnapshot"=v_provider_currency,"LegalEntity_UpdatedAt"=now(),"LegalEntity_UpdatedBy"=p_user_id where "LegalEntity_ID"=v_entity."LegalEntity_ID";
    v_entity."LegalEntity_BaseCurrencyCodeSnapshot":=v_provider_currency; v_currency_initialised:=true;
  elsif upper(v_entity."LegalEntity_BaseCurrencyCodeSnapshot")<>v_provider_currency then raise exception 'The provider and legal-entity base currencies no longer match.' using errcode='22023'; end if;
  select "ACCIC_ID" into v_connection from public."ACCI_Connections" where "ACCIC_LegalEntityID"=v_entity."LegalEntity_ID" and "ACCIC_ProviderCode"=v_run."FINConfigRun_ProviderCode" and "ACCIC_StatusCode"<>'disabled' order by "ACCIC_UpdatedAt" desc limit 1 for update;
  if v_connection is null then
    insert into public."ACCI_Connections"("ACCIC_ProviderCode","ACCIC_Name","ACCIC_StatusCode","ACCIC_LegalEntityID","ACCIC_Environment","ACCIC_AuthType","ACCIC_SecretRef","ACCIC_ExternalTenantName","ACCIC_ExternalBaseCurrencyCode","ACCIC_ExternalCountryCode","ACCIC_SettingsJSON","ACCIC_CreatedBy","ACCIC_UpdatedBy")
    values(v_run."FINConfigRun_ProviderCode",v_entity."LegalEntity_Name"||' · '||v_run."FINConfigRun_ExternalCompany",'active',v_entity."LegalEntity_ID",'production','api_token','tenant-edge-secret:erpnext',v_run."FINConfigRun_ExternalCompany",upper(v_entity."LegalEntity_BaseCurrencyCodeSnapshot"),v_run."FINConfigRun_CountryCode",jsonb_build_object('configurationRunId',p_run_id,'externalCompany',v_run."FINConfigRun_ExternalCompany"),p_user_id,p_user_id)
    returning "ACCIC_ID" into v_connection;
  else
    update public."ACCI_Connections" set "ACCIC_Name"=v_entity."LegalEntity_Name"||' · '||v_run."FINConfigRun_ExternalCompany","ACCIC_StatusCode"='active',"ACCIC_ExternalTenantName"=v_run."FINConfigRun_ExternalCompany","ACCIC_ExternalBaseCurrencyCode"=upper(v_entity."LegalEntity_BaseCurrencyCodeSnapshot"),"ACCIC_ExternalCountryCode"=v_run."FINConfigRun_CountryCode","ACCIC_SettingsJSON"="ACCIC_SettingsJSON"||jsonb_build_object('configurationRunId',p_run_id,'externalCompany',v_run."FINConfigRun_ExternalCompany"),"ACCIC_UpdatedAt"=now(),"ACCIC_UpdatedBy"=p_user_id where "ACCIC_ID"=v_connection;
  end if;
  update public."ACCI_Connections" set "ACCIC_StatusCode"='disabled',"ACCIC_UpdatedAt"=now(),"ACCIC_UpdatedBy"=p_user_id where "ACCIC_LegalEntityID"=v_entity."LegalEntity_ID" and "ACCIC_ID"<>v_connection and "ACCIC_StatusCode"='active';
  update public."cmp_LegalEntities" set "LegalEntity_SettingsJSON"="LegalEntity_SettingsJSON"||jsonb_build_object('financeProvider',jsonb_build_object('providerCode',v_run."FINConfigRun_ProviderCode",'externalCompany',v_run."FINConfigRun_ExternalCompany",'connectionId',v_connection)),"LegalEntity_UpdatedAt"=now(),"LegalEntity_UpdatedBy"=p_user_id where "LegalEntity_ID"=v_entity."LegalEntity_ID";
  update public."FIN_ConfigurationRuns" set "FINConfigRun_StatusCode"='completed',"FINConfigRun_ApprovedAt"=now(),"FINConfigRun_ApprovedBy"=p_user_id,"FINConfigRun_CompletedAt"=now(),"FINConfigRun_ProvisioningJSON"=jsonb_build_object('connectionId',v_connection,'providerRecordsChanged',false,'mappingReviewRequired',true,'baseCurrencyCode',v_provider_currency,'baseCurrencyInitialised',v_currency_initialised) where "FINConfigRun_ID"=p_run_id;
  insert into public."FIN_ConfigurationRunEvents"("FINConfigRunEvent_RunID","FINConfigRunEvent_TypeCode","FINConfigRunEvent_By","FINConfigRunEvent_DetailJSON") values(p_run_id,'approved',p_user_id,jsonb_build_object('connectionId',v_connection,'providerRecordsChanged',false,'baseCurrencyCode',v_provider_currency,'baseCurrencyInitialised',v_currency_initialised));
  if v_currency_initialised then
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_user_id,v_entity."LegalEntity_ID",'multideck-app','finance','public','cmp_LegalEntities','finance_configuration',v_entity."LegalEntity_ID",'initialise_base_currency','Legal entity base currency initialised from reviewed provider setup',jsonb_build_object('configurationRunId',p_run_id,'providerCode',v_run."FINConfigRun_ProviderCode",'externalCompany',v_run."FINConfigRun_ExternalCompany",'baseCurrencyCode',v_provider_currency));
  end if;
  return jsonb_build_object('runId',p_run_id,'status','completed','connectionId',v_connection);
end;
$$;

revoke all on function public._multideck_finance_next_number(uuid,text) from public,anon,authenticated;
revoke all on function public.multideck_finance_create_document_draft(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.multideck_finance_transition_document(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.multideck_finance_create_cash_draft(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.multideck_finance_transition_cash(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.multideck_finance_approve_configuration(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_create_document_draft(uuid,uuid,jsonb), public.multideck_finance_transition_document(uuid,uuid,uuid,text,text), public.multideck_finance_create_cash_draft(uuid,uuid,jsonb), public.multideck_finance_transition_cash(uuid,uuid,uuid,text,text), public.multideck_finance_approve_configuration(uuid,uuid,uuid) to service_role;

-- Credits belong to the same party balance as their invoice ledger. Drafts and
-- rejected records must never appear in statutory ageing totals.
create or replace view public."FIN_ARAgeingSummary" with (security_invoker=true) as
select d."FINDoc_PartyOrgID" "FINAge_CustomerOrgID",org."Org_Name" "FINAge_CustomerName",d."FINDoc_LegalEntityID",d."FINDoc_OrgOfficeID",d."FINDoc_CurrencyCodeSnapshot",
  count(*)::integer "FINAge_DocumentCount",sum(d."FINDoc_OutstandingAmount") "FINAge_TotalOutstanding",
  sum(case when d."FINDoc_DueDate" is null or d."FINDoc_DueDate">=current_date then d."FINDoc_OutstandingAmount" else 0 end) "FINAge_Current",
  sum(case when current_date-d."FINDoc_DueDate" between 1 and 30 then d."FINDoc_OutstandingAmount" else 0 end) "FINAge_1To30",
  sum(case when current_date-d."FINDoc_DueDate" between 31 and 60 then d."FINDoc_OutstandingAmount" else 0 end) "FINAge_31To60",
  sum(case when current_date-d."FINDoc_DueDate" between 61 and 90 then d."FINDoc_OutstandingAmount" else 0 end) "FINAge_61To90",
  sum(case when current_date-d."FINDoc_DueDate">90 then d."FINDoc_OutstandingAmount" else 0 end) "FINAge_Over90"
from public."FIN_Documents" d left join public."Org_Master" org on org."Org_id"=d."FINDoc_PartyOrgID"
where d."FINDoc_TypeCode" in ('sl_invoice','credit_note') and d."FINDoc_StatusCode" in ('approved','submitted') and d."FINDoc_OutstandingAmount"<>0
group by d."FINDoc_PartyOrgID",org."Org_Name",d."FINDoc_LegalEntityID",d."FINDoc_OrgOfficeID",d."FINDoc_CurrencyCodeSnapshot";

create or replace view public."FIN_APAgeingSummary" with (security_invoker=true) as
select d."FINDoc_PartyOrgID" "FINAge_SupplierOrgID",org."Org_Name" "FINAge_SupplierName",d."FINDoc_LegalEntityID",d."FINDoc_OrgOfficeID",d."FINDoc_CurrencyCodeSnapshot",
  count(*)::integer "FINAge_DocumentCount",sum(d."FINDoc_OutstandingAmount") "FINAge_TotalOutstanding",
  sum(case when d."FINDoc_DueDate" is null or d."FINDoc_DueDate">=current_date then d."FINDoc_OutstandingAmount" else 0 end) "FINAge_Current",
  sum(case when current_date-d."FINDoc_DueDate" between 1 and 30 then d."FINDoc_OutstandingAmount" else 0 end) "FINAge_1To30",
  sum(case when current_date-d."FINDoc_DueDate" between 31 and 60 then d."FINDoc_OutstandingAmount" else 0 end) "FINAge_31To60",
  sum(case when current_date-d."FINDoc_DueDate" between 61 and 90 then d."FINDoc_OutstandingAmount" else 0 end) "FINAge_61To90",
  sum(case when current_date-d."FINDoc_DueDate">90 then d."FINDoc_OutstandingAmount" else 0 end) "FINAge_Over90"
from public."FIN_Documents" d left join public."Org_Master" org on org."Org_id"=d."FINDoc_PartyOrgID"
where d."FINDoc_TypeCode" in ('pl_invoice','debit_note') and d."FINDoc_StatusCode" in ('approved','submitted') and d."FINDoc_OutstandingAmount"<>0
group by d."FINDoc_PartyOrgID",org."Org_Name",d."FINDoc_LegalEntityID",d."FINDoc_OrgOfficeID",d."FINDoc_CurrencyCodeSnapshot";

revoke all on public."FIN_ARAgeingSummary",public."FIN_APAgeingSummary" from public,anon,authenticated;
grant select on public."FIN_ARAgeingSummary",public."FIN_APAgeingSummary" to service_role;

-- Dexter read parity includes both document and cash evidence, while retaining
-- exact company scoping through the selected legal entity.
create or replace function public.multideck_dexter_domain_finance(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with records as (
    select d."FINDoc_ID" record_id,d."FINDoc_UpdatedAt" updated_at,concat_ws(' ',d."FINDoc_Number",d."FINDoc_TypeCode",d."FINDoc_StatusCode",o."Org_Name",j."Job_Number") search_text,
      jsonb_strip_nulls(jsonb_build_object('recordId',d."FINDoc_ID",'recordKind','document','number',d."FINDoc_Number",'type',d."FINDoc_TypeCode",'ledger',case when d."FINDoc_TypeCode" in ('sl_invoice','credit_note') then 'receivables' else 'payables' end,'status',d."FINDoc_StatusCode",'party',o."Org_Name",'currency',d."FINDoc_CurrencyCodeSnapshot",'netAmount',d."FINDoc_NetAmount",'taxAmount',d."FINDoc_TaxAmount",'grossAmount',d."FINDoc_GrossAmount",'outstandingAmount',d."FINDoc_OutstandingAmount",'documentDate',d."FINDoc_DocumentDate",'dueDate',d."FINDoc_DueDate",'sourceKind',d."FINDoc_SourceKindCode",'jobReference',case when j."Job_ID" is null then null else j."Job_Period"||'-'||j."Job_Number" end,'postingStatus',d."FINDoc_PostingStatusCode",'exportStatus',d."FINDoc_ExportStatusCode",'evidence',jsonb_build_object('sourceTable','FIN_Documents','sourceId',d."FINDoc_ID",'legalEntityId',d."FINDoc_LegalEntityID"))) value
    from public."FIN_Documents" d join public."cmp_LegalEntities" e on e."LegalEntity_ID"=d."FINDoc_LegalEntityID" left join public."Org_Master" o on o."Org_id"=d."FINDoc_PartyOrgID" left join public."Job_Header" j on j."Job_ID"=d."FINDoc_SourceJobID" where e."Company_ID"=p_company_id
    union all
    select c."FINCash_ID",c."FINCash_UpdatedAt",concat_ws(' ',c."FINCash_Number",c."FINCash_TypeCode",c."FINCash_StatusCode",o."Org_Name",c."FINCash_Reference"),
      jsonb_strip_nulls(jsonb_build_object('recordId',c."FINCash_ID",'recordKind','cash','number',c."FINCash_Number",'type',c."FINCash_TypeCode",'ledger',case when c."FINCash_TypeCode"='customer_receipt' then 'receivables' else 'payables' end,'status',c."FINCash_StatusCode",'party',o."Org_Name",'currency',c."FINCash_CurrencyCodeSnapshot",'amount',c."FINCash_Amount",'unallocatedAmount',c."FINCash_UnallocatedAmount",'transactionDate',c."FINCash_TransactionDate",'reference',c."FINCash_Reference",'postingStatus',c."FINCash_PostingStatusCode",'evidence',jsonb_build_object('sourceTable','FIN_CashTransactions','sourceId',c."FINCash_ID",'legalEntityId',c."FINCash_LegalEntityID")))
    from public."FIN_CashTransactions" c join public."cmp_LegalEntities" e on e."LegalEntity_ID"=c."FINCash_LegalEntityID" left join public."Org_Master" o on o."Org_id"=c."FINCash_PartyOrgID" where e."Company_ID"=p_company_id
  ) select coalesce(jsonb_agg(value order by updated_at desc),'[]'::jsonb) from (select value,updated_at from records where nullif(btrim(p_search),'') is null or search_text ilike '%'||btrim(p_search)||'%' order by updated_at desc limit greatest(1,least(coalesce(p_take,10),25))) bounded;
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid,text,integer) from public,anon,authenticated;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Tenant-safe sales-ledger, purchase-ledger, receipt, payment, allocation, job-link and provider-status evidence.',
  "AIDexterDomain_RequiredPermissionsJSON"='["Finance.Receivables.View","Finance.Payables.View"]'::jsonb,
  "AIDexterDomain_DataCategoriesJSON"='["financial","customer","supplier"]'::jsonb,
  "AIDexterDomain_ScopeStrategy"='company',"AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='finance';

create or replace function public.multideck_dexter_action_create_finance_document_draft(uuid,uuid,jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$ begin raise exception 'This action must be completed through the Finance Edge Function.' using errcode='42501'; end; $$;
create or replace function public.multideck_dexter_action_create_finance_cash_draft(uuid,uuid,jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$ begin raise exception 'This action must be completed through the Finance Edge Function.' using errcode='42501'; end; $$;
revoke all on function public.multideck_dexter_action_create_finance_document_draft(uuid,uuid,jsonb), public.multideck_dexter_action_create_finance_cash_draft(uuid,uuid,jsonb) from public,anon,authenticated;

insert into public."sys_AIDexterActions"(
  "AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_SortOrder","AIDexterAction_IsActive","AIDexterAction_UpdatedAt","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_ScopeStrategy","AIDexterAction_HasExternalEffect"
) values
('create_finance_document_draft','finance','Create finance document draft','Create one reviewed sales invoice, customer credit, purchase invoice or supplier credit draft through the Finance validation boundary.','multideck_dexter_action_create_finance_document_draft',
 '{"type":"object","properties":{"type":{"type":"string","enum":["sl_invoice","credit_note","pl_invoice","debit_note"]},"legalEntityId":{"type":"string"},"partyOrgId":{"type":"string"},"documentDate":{"type":"string"},"dueDate":{"type":["string","null"]},"currencyCode":{"type":"string"},"exchangeRate":{"type":"number","exclusiveMinimum":0},"sourceJobId":{"type":["string","null"]},"lines":{"type":"array","minItems":1,"maxItems":100,"items":{"type":"object","properties":{"description":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"unitAmount":{"type":"number","minimum":0},"taxRatePercent":{"type":"number","minimum":0,"maximum":100},"taxCode":{"type":["string","null"]},"chargeCode":{"type":["string","null"]},"lineType":{"type":"string","enum":["service","ancillary"]}},"required":["description","quantity","unitAmount","taxRatePercent","taxCode","chargeCode","lineType"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["type","legalEntityId","partyOrgId","documentDate","dueDate","currencyCode","exchangeRate","sourceJobId","lines","reason"],"additionalProperties":false}'::jsonb,260,true,now(),'[]'::jsonb,'finance_document_draft','canonical',true),
('create_finance_cash_draft','finance','Create finance cash draft','Create one reviewed customer receipt or supplier payment draft, including exact open-document allocations, through the Finance validation boundary.','multideck_dexter_action_create_finance_cash_draft',
 '{"type":"object","properties":{"type":{"type":"string","enum":["customer_receipt","supplier_payment"]},"legalEntityId":{"type":"string"},"partyOrgId":{"type":"string"},"bankAccountId":{"type":"string"},"transactionDate":{"type":"string"},"currencyCode":{"type":"string"},"exchangeRate":{"type":"number","exclusiveMinimum":0},"amount":{"type":"number","exclusiveMinimum":0},"reference":{"type":["string","null"]},"allocations":{"type":"array","maxItems":100,"items":{"type":"object","properties":{"documentId":{"type":"string"},"amount":{"type":"number","exclusiveMinimum":0}},"required":["documentId","amount"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["type","legalEntityId","partyOrgId","bankAccountId","transactionDate","currencyCode","exchangeRate","amount","reference","allocations","reason"],"additionalProperties":false}'::jsonb,261,true,now(),'[]'::jsonb,'finance_cash_draft','canonical',true)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode"=excluded."AIDexterAction_DomainCode","AIDexterAction_Name"=excluded."AIDexterAction_Name","AIDexterAction_Description"=excluded."AIDexterAction_Description","AIDexterAction_Function"=excluded."AIDexterAction_Function","AIDexterAction_ParametersJSON"=excluded."AIDexterAction_ParametersJSON","AIDexterAction_SortOrder"=excluded."AIDexterAction_SortOrder","AIDexterAction_IsActive"=true,"AIDexterAction_UpdatedAt"=now(),"AIDexterAction_RequiredPermissionsJSON"=excluded."AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily"=excluded."AIDexterAction_IntentFamily","AIDexterAction_ScopeStrategy"=excluded."AIDexterAction_ScopeStrategy","AIDexterAction_HasExternalEffect"=excluded."AIDexterAction_HasExternalEffect";

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Event-driven finance document, receipt, payment, allocation and provider-sync changes.',
  "AIDexterWatchCapability_FieldsJSON"='["status","dueDate","outstandingAmount","postingStatus","exportStatus","cashStatus","unallocatedAmount"]'::jsonb,
  "AIDexterWatchCapability_RequiredPermissionsJSON"='["Finance.Receivables.View","Finance.Payables.View"]'::jsonb,
  "AIDexterWatchCapability_ScopeStrategy"='company',"AIDexterWatchCapability_IsActive"=true,"AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='finance';

create or replace function public._multideck_dexter_finance_watch_change()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_company uuid; v_source uuid; v_old jsonb:='{}'::jsonb; v_new jsonb;
begin
  if tg_table_name='FIN_Documents' then
    v_source:=new."FINDoc_ID"; select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=new."FINDoc_LegalEntityID";
    if tg_op<>'INSERT' then v_old:=jsonb_build_object('status',old."FINDoc_StatusCode",'dueDate',old."FINDoc_DueDate",'outstandingAmount',old."FINDoc_OutstandingAmount",'postingStatus',old."FINDoc_PostingStatusCode",'exportStatus',old."FINDoc_ExportStatusCode"); end if;
    v_new:=jsonb_build_object('number',new."FINDoc_Number",'status',new."FINDoc_StatusCode",'dueDate',new."FINDoc_DueDate",'outstandingAmount',new."FINDoc_OutstandingAmount",'postingStatus',new."FINDoc_PostingStatusCode",'exportStatus',new."FINDoc_ExportStatusCode");
  else
    v_source:=new."FINCash_ID"; select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=new."FINCash_LegalEntityID";
    if tg_op<>'INSERT' then v_old:=jsonb_build_object('cashStatus',old."FINCash_StatusCode",'unallocatedAmount',old."FINCash_UnallocatedAmount",'postingStatus',old."FINCash_PostingStatusCode"); end if;
    v_new:=jsonb_build_object('number',new."FINCash_Number",'cashStatus',new."FINCash_StatusCode",'unallocatedAmount',new."FINCash_UnallocatedAmount",'postingStatus',new."FINCash_PostingStatusCode");
  end if;
  if v_old is distinct from v_new and v_company is not null and exists(select 1 from public."AI_DexterWatches" w where w."AIDexterWatch_CompanyID"=v_company and w."AIDexterWatch_CapabilityCode"='finance' and w."AIDexterWatch_StatusCode"='active' and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=v_source)) then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON") values(v_company,'finance',tg_table_name,v_source,v_old,v_new);
  end if;
  return new;
end;
$$;
revoke all on function public._multideck_dexter_finance_watch_change() from public,anon,authenticated;
drop trigger if exists "TR_FIN_Documents_dexter_watch" on public."FIN_Documents";
create trigger "TR_FIN_Documents_dexter_watch" after insert or update of "FINDoc_StatusCode","FINDoc_DueDate","FINDoc_OutstandingAmount","FINDoc_PostingStatusCode","FINDoc_ExportStatusCode" on public."FIN_Documents" for each row execute function public._multideck_dexter_finance_watch_change();
drop trigger if exists "TR_FIN_CashTransactions_dexter_watch" on public."FIN_CashTransactions";
create trigger "TR_FIN_CashTransactions_dexter_watch" after insert or update of "FINCash_StatusCode","FINCash_UnallocatedAmount","FINCash_PostingStatusCode" on public."FIN_CashTransactions" for each row execute function public._multideck_dexter_finance_watch_change();

commit;
