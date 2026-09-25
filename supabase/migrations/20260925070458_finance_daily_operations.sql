begin;

-- These records are tenant-local. Browser roles have no table access; the
-- authenticated Finance Edge boundary checks current company and permissions.
create table public."FIN_SupplierPurchaseOrders" (
  "FINPO_ID" uuid primary key default gen_random_uuid(),
  "FINPO_LegalEntityID" uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  "FINPO_SupplierOrgID" uuid not null references public."Org_Master"("Org_id"),
  "FINPO_JobID" uuid references public."Job_Header"("Job_ID"),
  "FINPO_Number" varchar(100) not null,
  "FINPO_CurrencyCode" varchar(3) not null check ("FINPO_CurrencyCode" ~ '^[A-Z]{3}$'),
  "FINPO_NetAmount" numeric(18,4) not null check ("FINPO_NetAmount">0),
  "FINPO_Description" text not null check (length(btrim("FINPO_Description"))>0),
  "FINPO_StatusCode" varchar(24) not null default 'draft' check ("FINPO_StatusCode" in ('draft','approved','cancelled')),
  "FINPO_SourceEvidenceJSON" jsonb not null default '{}'::jsonb check (jsonb_typeof("FINPO_SourceEvidenceJSON")='object'),
  "FINPO_CreatedAt" timestamptz not null default now(),
  "FINPO_CreatedBy" uuid not null references public."cmp_Users"("User_ID"),
  "FINPO_ReviewedAt" timestamptz,
  "FINPO_ReviewedBy" uuid references public."cmp_Users"("User_ID"),
  "FINPO_ReviewReason" text,
  constraint "UX_FIN_SupplierPurchaseOrders_number" unique ("FINPO_LegalEntityID","FINPO_Number")
);
create index "IX_FIN_SupplierPurchaseOrders_supplier" on public."FIN_SupplierPurchaseOrders"("FINPO_LegalEntityID","FINPO_SupplierOrgID","FINPO_StatusCode");

create table public."FIN_SupplierInvoiceMatches" (
  "FINPOMatch_ID" uuid primary key default gen_random_uuid(),
  "FINPOMatch_PurchaseOrderID" uuid not null references public."FIN_SupplierPurchaseOrders"("FINPO_ID"),
  "FINPOMatch_DocumentID" uuid not null unique references public."FIN_Documents"("FINDoc_ID"),
  "FINPOMatch_NetAmount" numeric(18,4) not null check ("FINPOMatch_NetAmount">0),
  "FINPOMatch_EvidenceJSON" jsonb not null check (jsonb_typeof("FINPOMatch_EvidenceJSON")='object'),
  "FINPOMatch_ReviewerNote" text not null check (length(btrim("FINPOMatch_ReviewerNote"))>0),
  "FINPOMatch_ApprovedAt" timestamptz not null default now(),
  "FINPOMatch_ApprovedBy" uuid not null references public."cmp_Users"("User_ID")
);
create index "IX_FIN_SupplierInvoiceMatches_po" on public."FIN_SupplierInvoiceMatches"("FINPOMatch_PurchaseOrderID");

create table public."FIN_CollectionActions" (
  "FINCollect_ID" uuid primary key default gen_random_uuid(),
  "FINCollect_LegalEntityID" uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  "FINCollect_CustomerOrgID" uuid not null references public."Org_Master"("Org_id"),
  "FINCollect_DocumentID" uuid references public."FIN_Documents"("FINDoc_ID"),
  "FINCollect_ActionCode" varchar(24) not null check ("FINCollect_ActionCode" in ('call_note','promise_to_pay','query','hold','resolved')),
  "FINCollect_Note" text not null check (length(btrim("FINCollect_Note"))>0),
  "FINCollect_FollowUpDate" date,
  "FINCollect_EvidenceJSON" jsonb not null default '{}'::jsonb check (jsonb_typeof("FINCollect_EvidenceJSON")='object'),
  "FINCollect_CreatedAt" timestamptz not null default now(),
  "FINCollect_CreatedBy" uuid not null references public."cmp_Users"("User_ID")
);
create index "IX_FIN_CollectionActions_customer" on public."FIN_CollectionActions"("FINCollect_LegalEntityID","FINCollect_CustomerOrgID","FINCollect_CreatedAt" desc);

-- The canonical schema already has payment-run headers and items. Extend them
-- for scoped preparation and review instead of creating a parallel run model.
alter table public."FIN_PaymentRuns"
  add column if not exists "FINPayRun_LegalEntityID" uuid references public."cmp_LegalEntities"("LegalEntity_ID"),
  add column if not exists "FINPayRun_Reason" text,
  add column if not exists "FINPayRun_ReviewedAt" timestamptz,
  add column if not exists "FINPayRun_ReviewedBy" uuid references public."cmp_Users"("User_ID");
create index if not exists "IX_FIN_PaymentRuns_entity" on public."FIN_PaymentRuns"("FINPayRun_LegalEntityID","FINPayRun_CreatedAt" desc);
create unique index if not exists "UX_FIN_PaymentRunItems_document" on public."FIN_PaymentRunItems"("FINPayRunItem_RunID","FINPayRunItem_DocumentID");
create index if not exists "IX_FIN_PaymentRunItems_cash" on public."FIN_PaymentRunItems"("FINPayRunItem_CashID");

alter table public."FIN_SupplierPurchaseOrders" enable row level security;
alter table public."FIN_SupplierInvoiceMatches" enable row level security;
alter table public."FIN_CollectionActions" enable row level security;
alter table public."FIN_PaymentRuns" enable row level security;
alter table public."FIN_PaymentRunItems" enable row level security;
revoke all on public."FIN_SupplierPurchaseOrders", public."FIN_SupplierInvoiceMatches", public."FIN_CollectionActions", public."FIN_PaymentRuns", public."FIN_PaymentRunItems" from public, anon, authenticated;
grant select,insert,update on public."FIN_SupplierPurchaseOrders", public."FIN_PaymentRuns" to service_role;
grant select,insert on public."FIN_SupplierInvoiceMatches", public."FIN_CollectionActions", public."FIN_PaymentRunItems" to service_role;

-- Immutable collection/match records and durable status history also feed the
-- existing event-driven Finance watch through the FIN_Documents source record.
create function public._multideck_finance_daily_audit() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_entity uuid; v_actor uuid; v_record uuid;
begin
  if tg_table_name='FIN_SupplierPurchaseOrders' then
    v_entity:=new."FINPO_LegalEntityID"; v_actor:=coalesce(new."FINPO_ReviewedBy",new."FINPO_CreatedBy"); v_record:=new."FINPO_ID";
  elsif tg_table_name='FIN_SupplierInvoiceMatches' then
    select "FINPO_LegalEntityID" into v_entity from public."FIN_SupplierPurchaseOrders" where "FINPO_ID"=new."FINPOMatch_PurchaseOrderID";
    v_actor:=new."FINPOMatch_ApprovedBy"; v_record:=new."FINPOMatch_ID";
  elsif tg_table_name='FIN_CollectionActions' then
    v_entity:=new."FINCollect_LegalEntityID"; v_actor:=new."FINCollect_CreatedBy"; v_record:=new."FINCollect_ID";
  else
    v_entity:=new."FINPayRun_LegalEntityID"; v_actor:=coalesce(new."FINPayRun_ReviewedBy",new."FINPayRun_CreatedBy"); v_record:=new."FINPayRun_ID";
  end if;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
  values('finance_lifecycle',v_actor,v_entity,'multideck-app','finance','public',tg_table_name,'daily_operation',v_record,lower(tg_op),'Finance daily operation reviewed',jsonb_build_object('row',to_jsonb(new),'previous',case when tg_op='UPDATE' then to_jsonb(old) else null end));
  return new;
end; $$;
revoke all on function public._multideck_finance_daily_audit() from public,anon,authenticated;
create trigger "TR_FIN_SupplierPurchaseOrders_audit" after insert or update on public."FIN_SupplierPurchaseOrders" for each row execute function public._multideck_finance_daily_audit();
create trigger "TR_FIN_SupplierInvoiceMatches_audit" after insert on public."FIN_SupplierInvoiceMatches" for each row execute function public._multideck_finance_daily_audit();
create trigger "TR_FIN_CollectionActions_audit" after insert on public."FIN_CollectionActions" for each row execute function public._multideck_finance_daily_audit();
create trigger "TR_FIN_PaymentRuns_audit" after insert or update on public."FIN_PaymentRuns" for each row execute function public._multideck_finance_daily_audit();

create function public._multideck_finance_validate_supplier_match() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_po public."FIN_SupplierPurchaseOrders"%rowtype; v_doc public."FIN_Documents"%rowtype; v_used numeric;
begin
  select * into v_po from public."FIN_SupplierPurchaseOrders" where "FINPO_ID"=new."FINPOMatch_PurchaseOrderID" for update;
  select * into v_doc from public."FIN_Documents" where "FINDoc_ID"=new."FINPOMatch_DocumentID" for update;
  if not found or v_po."FINPO_ID" is null or v_po."FINPO_StatusCode"<>'approved' or v_doc."FINDoc_TypeCode"<>'pl_invoice'
    or v_doc."FINDoc_StatusCode" not in ('draft','awaiting_approval')
    or v_doc."FINDoc_LegalEntityID" is distinct from v_po."FINPO_LegalEntityID"
    or v_doc."FINDoc_PartyOrgID" is distinct from v_po."FINPO_SupplierOrgID"
    or v_doc."FINDoc_CurrencyCodeSnapshot"<>v_po."FINPO_CurrencyCode"
    or (v_po."FINPO_JobID" is not null and v_doc."FINDoc_SourceJobID" is not null and v_po."FINPO_JobID"<>v_doc."FINDoc_SourceJobID")
    or abs(new."FINPOMatch_NetAmount"-v_doc."FINDoc_NetAmount")>0.01 then
    raise exception 'Supplier invoice and PO no longer agree. Reload the evidence before approving.' using errcode='22023';
  end if;
  select coalesce(sum("FINPOMatch_NetAmount"),0) into v_used from public."FIN_SupplierInvoiceMatches" where "FINPOMatch_PurchaseOrderID"=v_po."FINPO_ID";
  if v_used+new."FINPOMatch_NetAmount">v_po."FINPO_NetAmount"+0.01 then
    raise exception 'Matched invoices exceed the approved PO net amount.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_validate_supplier_match() from public,anon,authenticated;
create trigger "TR_FIN_SupplierInvoiceMatches_validate" before insert on public."FIN_SupplierInvoiceMatches" for each row execute function public._multideck_finance_validate_supplier_match();

create function public.multideck_finance_prepare_payment_run(
  p_company_id uuid, p_user_id uuid, p_bank_id uuid, p_document_ids jsonb,
  p_payment_date date, p_exchange_rate numeric, p_reason text
) returns uuid language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_bank public."FIN_BankAccounts"%rowtype; v_document public."FIN_Documents"%rowtype;
  v_run uuid; v_ids uuid[]:='{}'; v_id_text text; v_group record; v_cash jsonb;
  v_total numeric:=0; v_local_total numeric:=0; v_count integer:=0;
begin
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then
    raise exception 'The finance operator is outside this workspace.' using errcode='42501';
  end if;
  if jsonb_typeof(p_document_ids) is distinct from 'array' or jsonb_array_length(p_document_ids) not between 1 and 100 then
    raise exception 'Choose between one and 100 supplier invoices.' using errcode='22023';
  end if;
  if p_payment_date is null or p_exchange_rate is null or p_exchange_rate<=0 or p_exchange_rate::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Enter a valid payment date and reviewed exchange rate.' using errcode='22023';
  end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'Explain why this payment run is being prepared.' using errcode='22023'; end if;
  select bank.* into v_bank from public."FIN_BankAccounts" bank
  join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=bank."FINBank_LegalEntityID"
  where bank."FINBank_ID"=p_bank_id and bank."FINBank_IsActive" and bank."FINBank_AllowPayments" and entity."Company_ID"=p_company_id;
  if not found then raise exception 'Choose an active payment bank in this workspace.' using errcode='42501'; end if;
  for v_id_text in select value from jsonb_array_elements_text(p_document_ids) loop
    if v_id_text::uuid=any(v_ids) then raise exception 'Each supplier invoice can appear only once.' using errcode='22023'; end if;
    select document.* into v_document from public."FIN_Documents" document
    where document."FINDoc_ID"=v_id_text::uuid for update;
    if not found or v_document."FINDoc_LegalEntityID" is distinct from v_bank."FINBank_LegalEntityID"
      or v_document."FINDoc_TypeCode"<>'pl_invoice'
      or v_document."FINDoc_StatusCode" not in ('approved','submitted')
      or v_document."FINDoc_PartyOrgID" is null
      or v_document."FINDoc_CurrencyCodeSnapshot"<>v_bank."FINBank_CurrencyCode"
      or v_document."FINDoc_OutstandingAmount"<=0 then
      raise exception 'A selected supplier invoice is no longer payable from this bank.' using errcode='22023';
    end if;
    v_ids:=array_append(v_ids,v_document."FINDoc_ID");
    v_total:=v_total+v_document."FINDoc_OutstandingAmount";
    v_local_total:=v_local_total+round(v_document."FINDoc_OutstandingAmount"*p_exchange_rate,4);
    v_count:=v_count+1;
  end loop;
  insert into public."FIN_PaymentRuns"("FINPayRun_Number","FINPayRun_StatusCode","FINPayRun_BankAccountID","FINPayRun_PaymentDate","FINPayRun_CurrencyCodeSnapshot","FINPayRun_TotalAmount","FINPayRun_LocalTotalAmount","FINPayRun_CreatedBy","FINPayRun_LegalEntityID","FINPayRun_Reason")
  values('PAY-'||to_char(now(),'YYYYMMDDHH24MISS')||'-'||left(gen_random_uuid()::text,8),'awaiting_approval',p_bank_id,p_payment_date,v_bank."FINBank_CurrencyCode",v_total,v_local_total,p_user_id,v_bank."FINBank_LegalEntityID",left(btrim(p_reason),500))
  returning "FINPayRun_ID" into v_run;
  for v_group in
    select d."FINDoc_PartyOrgID" party_id,
      sum(d."FINDoc_OutstandingAmount") amount,
      jsonb_agg(jsonb_build_object('documentId',d."FINDoc_ID",'amount',d."FINDoc_OutstandingAmount") order by d."FINDoc_DueDate",d."FINDoc_ID") allocations
    from public."FIN_Documents" d where d."FINDoc_ID"=any(v_ids)
    group by d."FINDoc_PartyOrgID" order by d."FINDoc_PartyOrgID"
  loop
    v_cash:=public.multideck_finance_create_cash_draft(p_company_id,p_user_id,jsonb_build_object(
      'type','supplier_payment','legalEntityId',v_bank."FINBank_LegalEntityID",'partyOrgId',v_group.party_id,
      'bankAccountId',p_bank_id,'transactionDate',p_payment_date,'currencyCode',v_bank."FINBank_CurrencyCode",
      'exchangeRate',p_exchange_rate,'amount',v_group.amount,'allocations',v_group.allocations,
      'reference',(select "FINPayRun_Number" from public."FIN_PaymentRuns" where "FINPayRun_ID"=v_run)
    ));
    perform public.multideck_finance_transition_cash(p_company_id,p_user_id,(v_cash->>'FINCash_ID')::uuid,'request_review',left(btrim(p_reason),500));
    insert into public."FIN_PaymentRunItems"("FINPayRunItem_RunID","FINPayRunItem_DocumentID","FINPayRunItem_SupplierOrgID","FINPayRunItem_StatusCode","FINPayRunItem_Amount","FINPayRunItem_LocalAmount","FINPayRunItem_CashID")
    select v_run,d."FINDoc_ID",d."FINDoc_PartyOrgID",'awaiting_approval',d."FINDoc_OutstandingAmount",round(d."FINDoc_OutstandingAmount"*p_exchange_rate,4),(v_cash->>'FINCash_ID')::uuid
    from public."FIN_Documents" d where d."FINDoc_ID"=any(v_ids) and d."FINDoc_PartyOrgID"=v_group.party_id;
  end loop;
  return v_run;
exception when invalid_text_representation then
  raise exception 'Choose valid supplier invoice IDs.' using errcode='22023';
end; $$;
revoke all on function public.multideck_finance_prepare_payment_run(uuid,uuid,uuid,jsonb,date,numeric,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_prepare_payment_run(uuid,uuid,uuid,jsonb,date,numeric,text) to service_role;

create function public.multideck_finance_review_payment_run(
  p_company_id uuid,p_user_id uuid,p_run_id uuid,p_decision text,p_reason text
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_run public."FIN_PaymentRuns"%rowtype; v_cash_id uuid;
begin
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then
    raise exception 'The finance reviewer is outside this workspace.' using errcode='42501';
  end if;
  select run.* into v_run from public."FIN_PaymentRuns" run
  join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=run."FINPayRun_LegalEntityID"
  where run."FINPayRun_ID"=p_run_id and entity."Company_ID"=p_company_id for update of run;
  if not found then raise exception 'Payment run not found in this workspace.' using errcode='P0002'; end if;
  if v_run."FINPayRun_StatusCode"<>'awaiting_approval' or p_decision not in ('approved','rejected') then
    raise exception 'This payment run is not awaiting a valid review decision.' using errcode='22023';
  end if;
  if v_run."FINPayRun_CreatedBy"=p_user_id then raise exception 'A second finance reviewer must approve or reject this run.' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'Record the review reason.' using errcode='22023'; end if;
  for v_cash_id in select distinct "FINPayRunItem_CashID" from public."FIN_PaymentRunItems" where "FINPayRunItem_RunID"=p_run_id order by 1 loop
    perform public.multideck_finance_transition_cash(p_company_id,p_user_id,v_cash_id,case when p_decision='approved' then 'approve' else 'reject' end,left(btrim(p_reason),500));
  end loop;
  update public."FIN_PaymentRuns" set "FINPayRun_StatusCode"=p_decision,"FINPayRun_ApprovedAt"=case when p_decision='approved' then now() else null end,
    "FINPayRun_ApprovedBy"=case when p_decision='approved' then p_user_id else null end,"FINPayRun_ReviewedAt"=now(),"FINPayRun_ReviewedBy"=p_user_id
  where "FINPayRun_ID"=p_run_id;
  update public."FIN_PaymentRunItems" set "FINPayRunItem_StatusCode"=p_decision where "FINPayRunItem_RunID"=p_run_id;
  return jsonb_build_object('runId',p_run_id,'status',p_decision);
end; $$;
revoke all on function public.multideck_finance_review_payment_run(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_review_payment_run(uuid,uuid,uuid,text,text) to service_role;

create function public.multideck_dexter_domain_finance_operations(p_company_id uuid,p_search text default null,p_take integer default 10)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with evidence as (
    select po."FINPO_CreatedAt" observed_at,
      jsonb_build_object('recordId',po."FINPO_ID",'kind','supplier_purchase_order','number',po."FINPO_Number",'status',po."FINPO_StatusCode",'supplier',supplier."Org_Name",'currency',po."FINPO_CurrencyCode",'netAmount',po."FINPO_NetAmount",'jobId',po."FINPO_JobID",'source',jsonb_build_object('table','FIN_SupplierPurchaseOrders','id',po."FINPO_ID",'observedAt',po."FINPO_CreatedAt")) value
    from public."FIN_SupplierPurchaseOrders" po join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=po."FINPO_LegalEntityID" left join public."Org_Master" supplier on supplier."Org_id"=po."FINPO_SupplierOrgID"
    where entity."Company_ID"=p_company_id and (nullif(btrim(p_search),'') is null or concat_ws(' ',po."FINPO_Number",supplier."Org_Name") ilike '%'||btrim(p_search)||'%')
    union all
    select run."FINPayRun_CreatedAt",
      jsonb_build_object('recordId',run."FINPayRun_ID",'kind','payment_run','number',run."FINPayRun_Number",'status',run."FINPayRun_StatusCode",'currency',run."FINPayRun_CurrencyCodeSnapshot",'amount',run."FINPayRun_TotalAmount",'paymentDate',run."FINPayRun_PaymentDate",'source',jsonb_build_object('table','FIN_PaymentRuns','id',run."FINPayRun_ID",'observedAt',run."FINPayRun_CreatedAt"))
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
revoke all on function public.multideck_dexter_domain_finance_operations(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_finance_operations(uuid,text,integer) to service_role;

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_SortOrder","AIDexterDomain_IsActive","AIDexterDomain_UpdatedAt","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON","AIDexterDomain_ScopeStrategy")
values('finance_operations','Finance operations','Tenant-safe supplier POs, payment runs and recorded collection actions with source IDs. Daily ageing and job profitability are calculated in the Finance workspace.','multideck_dexter_domain_finance_operations',27,true,now(),'["Finance.Receivables.View","Finance.Payables.View"]'::jsonb,'["financial","customer","supplier"]'::jsonb,'company')
on conflict ("AIDexterDomain_Code") do update set "AIDexterDomain_Description"=excluded."AIDexterDomain_Description","AIDexterDomain_QueryFunction"=excluded."AIDexterDomain_QueryFunction","AIDexterDomain_IsActive"=true,"AIDexterDomain_UpdatedAt"=now();

insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_IsActive","AIDexterWatchCapability_SortOrder","AIDexterWatchCapability_RequiredPermissionsJSON","AIDexterWatchCapability_ScopeStrategy")
values('finance_operations','Finance operations','Event-driven supplier PO, payment-run and collection-action changes.','["kind","status","number","supplierId","customerId","amount","followUpDate"]'::jsonb,true,46,'["Finance.Receivables.View","Finance.Payables.View"]'::jsonb,'company')
on conflict ("AIDexterWatchCapability_Code") do update set "AIDexterWatchCapability_Description"=excluded."AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON"=excluded."AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_IsActive"=true,"AIDexterWatchCapability_UpdatedAt"=now();

create function public._multideck_finance_daily_watch() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_entity uuid; v_company uuid; v_record uuid; v_old jsonb:='{}'::jsonb; v_new jsonb;
begin
  if tg_table_name='FIN_SupplierPurchaseOrders' then
    v_entity:=new."FINPO_LegalEntityID"; v_record:=new."FINPO_ID";
    v_new:=jsonb_build_object('kind','supplier_purchase_order','status',new."FINPO_StatusCode",'number',new."FINPO_Number",'supplierId',new."FINPO_SupplierOrgID",'amount',new."FINPO_NetAmount");
    if tg_op='UPDATE' then v_old:=jsonb_build_object('kind','supplier_purchase_order','status',old."FINPO_StatusCode",'number',old."FINPO_Number",'supplierId',old."FINPO_SupplierOrgID",'amount',old."FINPO_NetAmount"); end if;
  elsif tg_table_name='FIN_PaymentRuns' then
    v_entity:=new."FINPayRun_LegalEntityID"; v_record:=new."FINPayRun_ID";
    v_new:=jsonb_build_object('kind','payment_run','status',new."FINPayRun_StatusCode",'number',new."FINPayRun_Number",'amount',new."FINPayRun_TotalAmount");
    if tg_op='UPDATE' then v_old:=jsonb_build_object('kind','payment_run','status',old."FINPayRun_StatusCode",'number',old."FINPayRun_Number",'amount',old."FINPayRun_TotalAmount"); end if;
  else
    v_entity:=new."FINCollect_LegalEntityID"; v_record:=new."FINCollect_ID";
    v_new:=jsonb_build_object('kind','collection_action','status',new."FINCollect_ActionCode",'customerId',new."FINCollect_CustomerOrgID",'followUpDate',new."FINCollect_FollowUpDate");
  end if;
  select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=v_entity;
  if v_old is distinct from v_new and v_company is not null and exists(select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=v_company and watch."AIDexterWatch_CapabilityCode"='finance_operations' and watch."AIDexterWatch_StatusCode"='active' and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=v_record)) then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON") values(v_company,'finance_operations',tg_table_name,v_record,v_old,v_new);
  end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_daily_watch() from public,anon,authenticated;
create trigger "TR_FIN_SupplierPurchaseOrders_watch" after insert or update on public."FIN_SupplierPurchaseOrders" for each row execute function public._multideck_finance_daily_watch();
create trigger "TR_FIN_PaymentRuns_watch" after insert or update on public."FIN_PaymentRuns" for each row execute function public._multideck_finance_daily_watch();
create trigger "TR_FIN_CollectionActions_watch" after insert on public."FIN_CollectionActions" for each row execute function public._multideck_finance_daily_watch();

commit;
