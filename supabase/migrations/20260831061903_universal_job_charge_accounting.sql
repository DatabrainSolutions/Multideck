begin;

-- Every operational area uses the same job and charge ledger. Domain values
-- describe provenance; they do not create separate warehouse/customs ledgers.
alter table public."Job_Header"
  add column if not exists "Job_DomainCode" varchar(24);

update public."Job_Header" set "Job_DomainCode"='freight'
where "Job_DomainCode" is null;

alter table public."Job_Header"
  alter column "Job_DomainCode" set default 'freight',
  alter column "Job_DomainCode" set not null,
  drop constraint if exists "CK_Job_Header_domain";
alter table public."Job_Header"
  add constraint "CK_Job_Header_domain" check ("Job_DomainCode" in ('freight','warehouse','customs','shared'));

alter table public."Job_Costing_Lines"
  add column if not exists "JobCostingLine_DomainCode" varchar(24),
  add column if not exists "JobCostingLine_SourceTable" varchar(80),
  add column if not exists "JobCostingLine_SourceID" uuid,
  add column if not exists "JobCostingLine_SourceLineID" uuid,
  add column if not exists "JobCostingLine_SourceMetadataJSON" jsonb not null default '{}'::jsonb;

update public."Job_Costing_Lines" line set
  "JobCostingLine_DomainCode"=coalesce(job."Job_DomainCode",'freight')
from public."Job_Header" job
where job."Job_ID"=line."Job_ID" and line."JobCostingLine_DomainCode" is null;

alter table public."Job_Costing_Lines"
  alter column "JobCostingLine_DomainCode" set not null,
  drop constraint if exists "CK_Job_Costing_Lines_domain";
alter table public."Job_Costing_Lines"
  add constraint "CK_Job_Costing_Lines_domain" check ("JobCostingLine_DomainCode" in ('freight','warehouse','customs','shared')),
  add constraint "CK_Job_Costing_Lines_source_pair" check (
    ("JobCostingLine_SourceTable" is null and "JobCostingLine_SourceID" is null) or
    (nullif(btrim("JobCostingLine_SourceTable"),'') is not null and "JobCostingLine_SourceID" is not null)
  ),
  add constraint "CK_Job_Costing_Lines_source_metadata_object" check (jsonb_typeof("JobCostingLine_SourceMetadataJSON")='object');

create unique index if not exists "UX_Job_Costing_Lines_source"
  on public."Job_Costing_Lines"(
    "JobCostingLine_DomainCode","JobCostingLine_SourceTable","JobCostingLine_SourceID",
    coalesce("JobCostingLine_SourceLineID",'00000000-0000-0000-0000-000000000000'::uuid)
  ) where "JobCostingLine_SourceTable" is not null and "JobCostingLine_SourceID" is not null;
create index if not exists "IX_Job_Costing_Lines_domain_job"
  on public."Job_Costing_Lines"("JobCostingLine_DomainCode","Job_ID","JobCostingLine_Number");

create or replace function public._multideck_finance_default_job_charge_domain()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_domain text;
begin
  if new."JobCostingLine_DomainCode" is null then
    select job."Job_DomainCode" into v_domain
    from public."Job_Header" job where job."Job_ID"=new."Job_ID";
    new."JobCostingLine_DomainCode":=coalesce(v_domain,'freight');
  end if;
  new."JobCostingLine_SourceTable":=nullif(btrim(new."JobCostingLine_SourceTable"),'');
  return new;
end; $$;
revoke all on function public._multideck_finance_default_job_charge_domain() from public,anon,authenticated;

drop trigger if exists "TR_FIN_default_job_charge_domain" on public."Job_Costing_Lines";
create trigger "TR_FIN_default_job_charge_domain"
before insert or update of "Job_ID","JobCostingLine_DomainCode","JobCostingLine_SourceTable"
on public."Job_Costing_Lines" for each row
execute function public._multideck_finance_default_job_charge_domain();

-- Internal, idempotent adapter used by every operational domain. Expected
-- values are accepted here; actuals continue to come only from posted finance
-- document lines linked to the exact returned costing line.
create or replace function public._multideck_finance_upsert_job_charge(
  p_job_id uuid,
  p_domain_code text,
  p_source_table text,
  p_source_id uuid,
  p_source_line_id uuid,
  p_description text,
  p_supplier_id uuid,
  p_charge_code_id uuid,
  p_expected_cost_local numeric,
  p_expected_revenue_local numeric,
  p_expected_cost_currency numeric,
  p_expected_revenue_currency numeric,
  p_cost_currency_id integer,
  p_revenue_currency_id integer,
  p_cost_roe numeric,
  p_revenue_roe numeric,
  p_actor_user_id uuid,
  p_source_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_line_id uuid;
  v_line_no integer;
  v_domain text:=lower(nullif(btrim(p_domain_code),''));
  v_source_table text:=nullif(btrim(p_source_table),'');
begin
  if p_job_id is null or not exists(select 1 from public."Job_Header" where "Job_ID"=p_job_id and not "Job_IsDeleted") then
    raise exception 'A valid operational job is required for every revenue or cost charge.' using errcode='22023';
  end if;
  if v_domain not in ('freight','warehouse','customs','shared') then
    raise exception 'Charge domain must be freight, warehouse, customs or shared.' using errcode='22023';
  end if;
  if v_source_table is null or p_source_id is null then
    raise exception 'A source record is required for every domain charge.' using errcode='22023';
  end if;
  if nullif(btrim(p_description),'') is null then
    raise exception 'A charge description is required.' using errcode='22023';
  end if;
  if coalesce(p_expected_cost_local,0)<0 or coalesce(p_expected_revenue_local,0)<0 or
     coalesce(p_expected_cost_currency,0)<0 or coalesce(p_expected_revenue_currency,0)<0 then
    raise exception 'Expected revenue and cost cannot be negative.' using errcode='22023';
  end if;
  if coalesce(p_source_metadata,'{}'::jsonb) is null or jsonb_typeof(coalesce(p_source_metadata,'{}'::jsonb))<>'object' then
    raise exception 'Charge source metadata must be an object.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_domain||':'||v_source_table||':'||p_source_id::text||':'||coalesce(p_source_line_id::text,''),0));
  select line."JobCostingLine_ID" into v_line_id
  from public."Job_Costing_Lines" line
  where line."JobCostingLine_DomainCode"=v_domain
    and line."JobCostingLine_SourceTable"=v_source_table
    and line."JobCostingLine_SourceID"=p_source_id
    and line."JobCostingLine_SourceLineID" is not distinct from p_source_line_id
  for update;

  if v_line_id is null then
    perform pg_advisory_xact_lock(hashtextextended('job-charge-line:'||p_job_id::text,0));
    select coalesce(max(line."JobCostingLine_Number"),0)+1 into v_line_no
    from public."Job_Costing_Lines" line where line."Job_ID"=p_job_id;
    insert into public."Job_Costing_Lines"(
      "Job_ID","JobCostingLine_Number","JobCostingLine_SupplierID","JobCostingLine_ChargeCodeID",
      "JobCostingLine_Description","JobCostingLine_CostCurrencyID","JobCostingLine_CostROE",
      "JobCostingLine_CostAmountCurrency","JobCostingLine_CostAmountLocal","JobCostingLine_RevenueCurrencyID",
      "JobCostingLine_RevenueROE","JobCostingLine_RevenueAmountCurrency","JobCostingLine_RevenueAmountLocal",
      "JobCostingLine_DomainCode","JobCostingLine_SourceTable","JobCostingLine_SourceID",
      "JobCostingLine_SourceLineID","JobCostingLine_SourceMetadataJSON","JobCostingLine_CreatedBy","JobCostingLine_UpdatedBy"
    ) values (
      p_job_id,v_line_no,p_supplier_id,p_charge_code_id,left(btrim(p_description),240),p_cost_currency_id,p_cost_roe,
      p_expected_cost_currency,p_expected_cost_local,p_revenue_currency_id,p_revenue_roe,
      p_expected_revenue_currency,p_expected_revenue_local,v_domain,v_source_table,p_source_id,p_source_line_id,
      coalesce(p_source_metadata,'{}'::jsonb),p_actor_user_id,p_actor_user_id
    ) returning "JobCostingLine_ID" into v_line_id;
  else
    update public."Job_Costing_Lines" set
      "Job_ID"=p_job_id,
      "JobCostingLine_SupplierID"=p_supplier_id,
      "JobCostingLine_ChargeCodeID"=p_charge_code_id,
      "JobCostingLine_Description"=left(btrim(p_description),240),
      "JobCostingLine_CostCurrencyID"=p_cost_currency_id,
      "JobCostingLine_CostROE"=p_cost_roe,
      "JobCostingLine_CostAmountCurrency"=p_expected_cost_currency,
      "JobCostingLine_CostAmountLocal"=p_expected_cost_local,
      "JobCostingLine_RevenueCurrencyID"=p_revenue_currency_id,
      "JobCostingLine_RevenueROE"=p_revenue_roe,
      "JobCostingLine_RevenueAmountCurrency"=p_expected_revenue_currency,
      "JobCostingLine_RevenueAmountLocal"=p_expected_revenue_local,
      "JobCostingLine_SourceMetadataJSON"=coalesce(p_source_metadata,'{}'::jsonb),
      "JobCostingLine_UpdatedAt"=now(),"JobCostingLine_UpdatedBy"=p_actor_user_id
    where "JobCostingLine_ID"=v_line_id;
  end if;
  return v_line_id;
end; $$;
revoke all on function public._multideck_finance_upsert_job_charge(uuid,text,text,uuid,uuid,text,uuid,uuid,numeric,numeric,numeric,numeric,integer,integer,numeric,numeric,uuid,jsonb) from public,anon,authenticated;

create or replace function public.multideck_finance_upsert_job_charge(
  p_company_id uuid,p_user_id uuid,p_job_id uuid,p_domain_code text,p_source_table text,p_source_id uuid,
  p_source_line_id uuid,p_description text,p_supplier_id uuid,p_charge_code_id uuid,
  p_expected_cost_local numeric,p_expected_revenue_local numeric,p_expected_cost_currency numeric,
  p_expected_revenue_currency numeric,p_cost_currency_id integer,p_revenue_currency_id integer,
  p_cost_roe numeric,p_revenue_roe numeric,p_source_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_entity uuid; v_line uuid;
begin
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then
    raise exception 'The operator is outside this workspace.' using errcode='42501';
  end if;
  v_entity:=public._multideck_finance_resolve_job_legal_entity(p_job_id);
  if v_entity is null or not exists(select 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=v_entity and "Company_ID"=p_company_id and "LegalEntity_IsActive") then
    raise exception 'The job is outside this workspace or has no active legal entity.' using errcode='42501';
  end if;
  v_line:=public._multideck_finance_upsert_job_charge(p_job_id,p_domain_code,p_source_table,p_source_id,p_source_line_id,p_description,p_supplier_id,p_charge_code_id,p_expected_cost_local,p_expected_revenue_local,p_expected_cost_currency,p_expected_revenue_currency,p_cost_currency_id,p_revenue_currency_id,p_cost_roe,p_revenue_roe,p_user_id,p_source_metadata);
  return v_line;
end; $$;
revoke all on function public.multideck_finance_upsert_job_charge(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid,numeric,numeric,numeric,numeric,integer,integer,numeric,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_upsert_job_charge(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid,numeric,numeric,numeric,numeric,integer,integer,numeric,numeric,jsonb) to service_role;

-- Older freight/customs paths still writing ChargesIn/ChargesOut are folded
-- into the canonical charge ledger. Their mutable actual fields are ignored.
create or replace function public._multideck_finance_adapt_legacy_job_charge()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_domain text; v_actor uuid;
begin
  select coalesce(job."Job_DomainCode",'freight'),job."Job_CreatedBy" into v_domain,v_actor
  from public."Job_Header" job where job."Job_ID"=new."Job_ID";
  if tg_table_name='Job_Costing_ChargesIn' then
    perform public._multideck_finance_upsert_job_charge(
      new."Job_ID",v_domain,'Job_Costing_ChargesIn',new."JCIn_ID",null,
      coalesce(nullif(btrim(new."JCIn_Description"),''),'Expected supplier cost'),new."JCIn_From",new."JCIn_ChargeCode",
      coalesce(new."JCIn_Expected_NetCost_Local",0),0,new."JCIn_Expected_NetCost_Curr",null,
      new."JCIn_FromCurr",null,new."JCIn_FromROE",null,v_actor,
      jsonb_build_object('sourceKind','legacy_cost','actualsIgnored',true)
    );
  else
    perform public._multideck_finance_upsert_job_charge(
      new."Job_ID",v_domain,'Job_Costing_ChargesOut',new."JCOut_ID",null,
      coalesce(nullif(btrim(new."JCOut_Description"),''),'Expected customer revenue'),null,new."JCOut_ChargeCode",
      0,coalesce(new."JCOut_Expected_NetCost_Local",0),null,new."JCOut_Expected_NetCost_Curr",
      null,new."JCOut_ToCurr",null,new."JCOut_ToROE",v_actor,
      jsonb_build_object('sourceKind','legacy_revenue','actualsIgnored',true,'customerOrgId',new."JCOut_To")
    );
  end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_adapt_legacy_job_charge() from public,anon,authenticated;

drop trigger if exists "TR_FIN_adapt_legacy_charge_in" on public."Job_Costing_ChargesIn";
create trigger "TR_FIN_adapt_legacy_charge_in" after insert or update of
  "Job_ID","JCIn_From","JCIn_ChargeCode","JCIn_Description","JCIn_FromCurr","JCIn_FromROE","JCIn_Expected_NetCost_Curr","JCIn_Expected_NetCost_Local"
on public."Job_Costing_ChargesIn" for each row execute function public._multideck_finance_adapt_legacy_job_charge();
drop trigger if exists "TR_FIN_adapt_legacy_charge_out" on public."Job_Costing_ChargesOut";
create trigger "TR_FIN_adapt_legacy_charge_out" after insert or update of
  "Job_ID","JCOut_To","JCOut_ChargeCode","JCOut_Description","JCOut_ToCurr","JCOut_ToROE","JCOut_Expected_NetCost_Curr","JCOut_Expected_NetCost_Local"
on public."Job_Costing_ChargesOut" for each row execute function public._multideck_finance_adapt_legacy_job_charge();

-- Warehouse orders receive a canonical job before they can generate billing.
create or replace function public._multideck_finance_ensure_warehouse_job()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_office uuid; v_company uuid; v_actor uuid; v_job uuid; v_created timestamptz;
begin
  if new."WMSOrder_JobID" is not null then return new; end if;
  select coalesce(new."WMSOrder_OrgOfficeID",facility."WMSFacility_OrgOfficeID"),office."Company_ID",
    coalesce(new."WMSOrder_CreatedBy",facility."WMSFacility_CreatedBy")
  into v_office,v_company,v_actor
  from public."WMS_Facilities" facility
  left join public."cmp_Offices" office on office."Office_ID"=coalesce(new."WMSOrder_OrgOfficeID",facility."WMSFacility_OrgOfficeID")
  where facility."WMSFacility_ID"=new."WMSOrder_FacilityID";
  if v_actor is null then
    select user_row."User_ID" into v_actor from public."cmp_Users" user_row
    where user_row."Company_ID"=v_company and coalesce(user_row."User_AccessStatus",'active')='active'
    order by user_row."User_ID" limit 1;
  end if;
  if v_office is null or v_actor is null then
    raise exception 'Warehouse billing needs an office and an active internal owner before a job can be created.' using errcode='22023';
  end if;
  v_created:=coalesce(new."WMSOrder_CreatedAt",now());
  insert into public."Job_Header"(
    "Job_Period","Job_CreatedDate","Job_CreatedBy","Job_Customer","Job_OfficeID","Job_OrgOfficeID",
    "Job_Status","Job_TransportModeSummary","Job_BookingReference","Job_CustomerReference",
    "Job_DomainCode","Job_SourceSnapshotJSON","Job_UpdatedAt","Job_UpdatedBy"
  ) values (
    to_char(v_created at time zone 'UTC','YYYYMM'),v_created at time zone 'UTC',v_actor,new."WMSOrder_CustomerOrgID",v_office,v_office,
    case when new."WMSOrder_StatusCode" in ('complete','cancelled') then new."WMSOrder_StatusCode" else 'open' end,
    'warehouse',new."WMSOrder_OrderNumber",new."WMSOrder_CustomerReference",'warehouse',
    jsonb_build_object('sourceDomain','warehouse','sourceTable','WMS_Orders','sourceId',new."WMSOrder_ID",'sourceReference',new."WMSOrder_OrderNumber"),
    v_created,v_actor
  ) returning "Job_ID" into v_job;
  new."WMSOrder_JobID":=v_job;
  new."WMSOrder_OrgOfficeID":=v_office;
  return new;
end; $$;
revoke all on function public._multideck_finance_ensure_warehouse_job() from public,anon,authenticated;

drop trigger if exists "TR_FIN_ensure_warehouse_job" on public."WMS_Orders";
create trigger "TR_FIN_ensure_warehouse_job"
before insert or update of "WMSOrder_JobID" on public."WMS_Orders"
for each row when (new."WMSOrder_JobID" is null)
execute function public._multideck_finance_ensure_warehouse_job();

-- Existing demo orders are linked too, making the rule true for the current
-- workspace as well as for future orders.
update public."WMS_Orders" set "WMSOrder_JobID"=null
where "WMSOrder_JobID" is null and not "WMSOrder_IsDeleted";

-- A warehouse billing event is customer revenue, never stock/goods value.
create or replace function public._multideck_finance_adapt_warehouse_billing_event()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_job uuid; v_actor uuid; v_entity uuid; v_base text; v_currency text; v_roe numeric; v_local numeric;
begin
  v_job:=new."WMSBillEvent_JobID";
  if v_job is null and new."WMSBillEvent_OrderID" is not null then
    select "WMSOrder_JobID" into v_job from public."WMS_Orders" where "WMSOrder_ID"=new."WMSBillEvent_OrderID";
    new."WMSBillEvent_JobID":=v_job;
  end if;
  if v_job is null then raise exception 'A warehouse billing event must be linked to an operational job.' using errcode='22023'; end if;
  select coalesce(new."WMSBillEvent_CreatedBy",job."Job_CreatedBy") into v_actor from public."Job_Header" job where job."Job_ID"=v_job;
  v_entity:=public._multideck_finance_resolve_job_legal_entity(v_job);
  select upper(coalesce("LegalEntity_BaseCurrencyCodeSnapshot",'GBP')) into v_base from public."cmp_LegalEntities" where "LegalEntity_ID"=v_entity;
  v_currency:=upper(coalesce(new."WMSBillEvent_CurrencyCode",v_base));
  if coalesce(new."WMSBillEvent_MetadataJSON"->>'exchangeRate','') ~ '^\d+(\.\d+)?$' then v_roe:=(new."WMSBillEvent_MetadataJSON"->>'exchangeRate')::numeric; end if;
  if coalesce(new."WMSBillEvent_MetadataJSON"->>'localNetAmount','') ~ '^\d+(\.\d+)?$' then
    v_local:=(new."WMSBillEvent_MetadataJSON"->>'localNetAmount')::numeric;
  elsif v_currency=v_base then v_local:=new."WMSBillEvent_NetAmount";
  elsif v_roe is not null and v_roe>0 then v_local:=round(new."WMSBillEvent_NetAmount"*v_roe,4);
  else raise exception 'A foreign-currency warehouse billing event needs exchangeRate or localNetAmount evidence.' using errcode='22023';
  end if;
  perform public._multideck_finance_upsert_job_charge(
    v_job,'warehouse','WMS_BillingEvents',new."WMSBillEvent_ID",null,new."WMSBillEvent_Description",null,null,
    0,case when new."WMSBillEvent_StatusCode"='cancelled' then 0 else v_local end,null,new."WMSBillEvent_NetAmount",
    null,null,null,v_roe,v_actor,
    coalesce(new."WMSBillEvent_MetadataJSON",'{}'::jsonb)||jsonb_build_object('eventType',new."WMSBillEvent_EventTypeCode",'billingBasis',new."WMSBillEvent_BillingBasisCode",'currencyCode',v_currency,'localCurrencyCode',v_base,'orderId',new."WMSBillEvent_OrderID")
  );
  return new;
end; $$;
revoke all on function public._multideck_finance_adapt_warehouse_billing_event() from public,anon,authenticated;

drop trigger if exists "TR_FIN_adapt_warehouse_billing_event" on public."WMS_BillingEvents";
create trigger "TR_FIN_adapt_warehouse_billing_event"
before insert or update of "WMSBillEvent_JobID","WMSBillEvent_OrderID","WMSBillEvent_StatusCode","WMSBillEvent_Description","WMSBillEvent_NetAmount","WMSBillEvent_CurrencyCode","WMSBillEvent_MetadataJSON"
on public."WMS_BillingEvents" for each row execute function public._multideck_finance_adapt_warehouse_billing_event();

-- Charge changes are visible to Dexter and Watching for you through the same
-- deterministic finance signal path as documents and reversals.
create or replace function public._multideck_dexter_job_charge_watch_change()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_company uuid; v_source uuid; v_old jsonb:='{}'::jsonb; v_new jsonb;
begin
  v_source:=new."JobCostingLine_ID";
  select entity."Company_ID" into v_company from public."cmp_LegalEntities" entity
  where entity."LegalEntity_ID"=public._multideck_finance_resolve_job_legal_entity(new."Job_ID");
  if tg_op<>'INSERT' then v_old:=jsonb_build_object(
    'jobChargeLine',old."JobCostingLine_ID",'domain',old."JobCostingLine_DomainCode",
    'expectedRevenue',old."JobCostingLine_RevenueAmountLocal",'expectedCost',old."JobCostingLine_CostAmountLocal",
    'revenueNominalAccountId',old."JobCostingLine_RevenueNominalAccountID",'costNominalAccountId',old."JobCostingLine_CostNominalAccountID"
  ); end if;
  v_new:=jsonb_build_object(
    'jobChargeLine',new."JobCostingLine_ID",'domain',new."JobCostingLine_DomainCode",
    'sourceTable',new."JobCostingLine_SourceTable",'sourceId',new."JobCostingLine_SourceID",
    'expectedRevenue',new."JobCostingLine_RevenueAmountLocal",'expectedCost',new."JobCostingLine_CostAmountLocal",
    'revenueNominalAccountId',new."JobCostingLine_RevenueNominalAccountID",'costNominalAccountId',new."JobCostingLine_CostNominalAccountID"
  );
  if v_old is distinct from v_new and v_company is not null and exists(
    select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=v_company
      and watch."AIDexterWatch_CapabilityCode"='finance' and watch."AIDexterWatch_StatusCode"='active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=v_source)
  ) then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON"
    ) values(v_company,'finance','Job_Costing_Lines',v_source,v_old,v_new);
  end if;
  return new;
end; $$;
revoke all on function public._multideck_dexter_job_charge_watch_change() from public,anon,authenticated;

drop trigger if exists "TR_FIN_job_charge_dexter_watch" on public."Job_Costing_Lines";
create trigger "TR_FIN_job_charge_dexter_watch" after insert or update of
  "JobCostingLine_DomainCode","JobCostingLine_CostAmountLocal","JobCostingLine_RevenueAmountLocal",
  "JobCostingLine_CostNominalAccountID","JobCostingLine_RevenueNominalAccountID"
on public."Job_Costing_Lines" for each row execute function public._multideck_dexter_job_charge_watch_change();

-- Append domain and source evidence without changing any accounting formula.
create or replace view public."FIN_JobChargeProfitability" with (security_invoker=true) as
with actual as (
  select link."FINDocLineJob_JobCostingLineID" line_id,
    coalesce(sum(link."FINDocLineJob_LocalNetAmount") filter(where document."FINDoc_TypeCode" in ('sl_invoice','credit_note')),0) actual_revenue,
    coalesce(sum(link."FINDocLineJob_LocalNetAmount") filter(where document."FINDoc_TypeCode" in ('pl_invoice','debit_note')),0) actual_cost
  from public."FIN_DocumentLineJobLinks" link
  join public."FIN_Documents" document on document."FINDoc_ID"=link."FINDocLineJob_DocumentID" and document."FINDoc_PostingStatusCode"='posted'
  where link."FINDocLineJob_JobCostingLineID" is not null group by link."FINDocLineJob_JobCostingLineID"
), balances as (
  select line."JobCostingLine_ID" line_id,
    coalesce((select sum(wip."FINWIP_LocalWIPAmount"-wip."FINWIP_RelievedAmount") from public."FIN_WIPItems" wip where wip."FINWIP_JobCostingLineID"=line."JobCostingLine_ID" and wip."FINWIP_StatusCode" in ('posted','partially_reversed')),0) open_wip,
    coalesce((select sum(accrual."FINAccrual_LocalAccruedAmount"-accrual."FINAccrual_RelievedAmount") from public."FIN_Accruals" accrual where accrual."FINAccrual_JobCostingLineID"=line."JobCostingLine_ID" and accrual."FINAccrual_StatusCode" in ('posted','partially_reversed')),0) open_accrual
  from public."Job_Costing_Lines" line
)
select line."JobCostingLine_ID" as "FINChargeProfit_JobCostingLineID",line."Job_ID" as "FINChargeProfit_JobID",line."JobCostingLine_Number" as "FINChargeProfit_LineNo",
  charge."RATECharge_Code" as "FINChargeProfit_ChargeCode",line."JobCostingLine_Description" as "FINChargeProfit_Description",
  line."JobCostingLine_CostNominalAccountID" as "FINChargeProfit_CostNominalAccountID",cost_nominal."FINNom_Code" as "FINChargeProfit_CostNominalCode",
  line."JobCostingLine_RevenueNominalAccountID" as "FINChargeProfit_RevenueNominalAccountID",revenue_nominal."FINNom_Code" as "FINChargeProfit_RevenueNominalCode",
  coalesce(line."JobCostingLine_RevenueAmountLocal",0) as "FINChargeProfit_ExpectedRevenue",coalesce(line."JobCostingLine_CostAmountLocal",0) as "FINChargeProfit_ExpectedCost",
  coalesce(actual.actual_revenue,0) as "FINChargeProfit_ActualRevenue",coalesce(actual.actual_cost,0) as "FINChargeProfit_ActualCost",
  coalesce(balances.open_wip,0) as "FINChargeProfit_OpenWIP",coalesce(balances.open_accrual,0) as "FINChargeProfit_OpenAccrual",
  coalesce(actual.actual_revenue,0)+coalesce(balances.open_wip,0) as "FINChargeProfit_RecognisedRevenue",
  coalesce(actual.actual_cost,0)+coalesce(balances.open_accrual,0) as "FINChargeProfit_RecognisedCost",
  coalesce(actual.actual_revenue,0)+coalesce(balances.open_wip,0)-coalesce(actual.actual_cost,0)-coalesce(balances.open_accrual,0) as "FINChargeProfit_GrossProfit",
  coalesce(actual.actual_revenue,0)+coalesce(balances.open_wip,0)-coalesce(line."JobCostingLine_RevenueAmountLocal",0) as "FINChargeProfit_RevenueMovement",
  coalesce(actual.actual_cost,0)+coalesce(balances.open_accrual,0)-coalesce(line."JobCostingLine_CostAmountLocal",0) as "FINChargeProfit_CostMovement",
  line."JobCostingLine_DomainCode" as "FINChargeProfit_DomainCode",line."JobCostingLine_SourceTable" as "FINChargeProfit_SourceTable",
  line."JobCostingLine_SourceID" as "FINChargeProfit_SourceID",line."JobCostingLine_SourceLineID" as "FINChargeProfit_SourceLineID"
from public."Job_Costing_Lines" line
left join public."RATE_ChargeCodes" charge on charge."RATECharge_ID"=line."JobCostingLine_ChargeCodeID"
left join public."FIN_NominalAccounts" cost_nominal on cost_nominal."FINNom_ID"=line."JobCostingLine_CostNominalAccountID"
left join public."FIN_NominalAccounts" revenue_nominal on revenue_nominal."FINNom_ID"=line."JobCostingLine_RevenueNominalAccountID"
left join actual on actual.line_id=line."JobCostingLine_ID" left join balances on balances.line_id=line."JobCostingLine_ID";

revoke all on public."FIN_JobChargeProfitability" from public,anon,authenticated;
grant select on public."FIN_JobChargeProfitability" to service_role;

create or replace function public.multideck_dexter_domain_finance(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with records as (
    select value,coalesce((value->'evidence'->>'updatedAt')::timestamptz,'2000-01-01'::timestamptz) updated_at
    from jsonb_array_elements(public._multideck_dexter_domain_finance_before_charge_profitability(p_company_id,p_search,p_take)) value
    union all
    select jsonb_strip_nulls(jsonb_build_object(
      'recordId',profit."FINChargeProfit_JobCostingLineID",'recordKind','job_charge_profitability','jobId',profit."FINChargeProfit_JobID",
      'jobReference',job."Job_Period"||'-'||job."Job_Number",'jobDomain',profit."FINChargeProfit_DomainCode",
      'lineNo',profit."FINChargeProfit_LineNo",'chargeCode',profit."FINChargeProfit_ChargeCode",'description',profit."FINChargeProfit_Description",
      'chargeSourceTable',profit."FINChargeProfit_SourceTable",'chargeSourceId',profit."FINChargeProfit_SourceID",'chargeSourceLineId',profit."FINChargeProfit_SourceLineID",
      'revenueNominalCode',profit."FINChargeProfit_RevenueNominalCode",'costNominalCode',profit."FINChargeProfit_CostNominalCode",
      'expectedRevenue',profit."FINChargeProfit_ExpectedRevenue",'expectedCost',profit."FINChargeProfit_ExpectedCost",
      'actualRevenue',profit."FINChargeProfit_ActualRevenue",'actualCost',profit."FINChargeProfit_ActualCost",
      'openWIP',profit."FINChargeProfit_OpenWIP",'openAccrual',profit."FINChargeProfit_OpenAccrual",
      'recognisedRevenue',profit."FINChargeProfit_RecognisedRevenue",'recognisedCost',profit."FINChargeProfit_RecognisedCost",
      'grossProfit',profit."FINChargeProfit_GrossProfit",'grossProfitMovement',profit."FINChargeProfit_RevenueMovement"-profit."FINChargeProfit_CostMovement",
      'evidence',jsonb_build_object('sourceTable','FIN_JobChargeProfitability','sourceId',profit."FINChargeProfit_JobCostingLineID",'operationalSourceTable',profit."FINChargeProfit_SourceTable",'operationalSourceId',profit."FINChargeProfit_SourceID",'legalEntityId',entity."LegalEntity_ID",'updatedAt',line."JobCostingLine_UpdatedAt")
    )),line."JobCostingLine_UpdatedAt"::timestamptz
    from public."FIN_JobChargeProfitability" profit
    join public."Job_Costing_Lines" line on line."JobCostingLine_ID"=profit."FINChargeProfit_JobCostingLineID"
    join public."Job_Header" job on job."Job_ID"=profit."FINChargeProfit_JobID"
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=public._multideck_finance_resolve_job_legal_entity(job."Job_ID")
    where entity."Company_ID"=p_company_id and (
      nullif(btrim(p_search),'') is null or concat_ws(' ',job."Job_Period",job."Job_Number",profit."FINChargeProfit_DomainCode",profit."FINChargeProfit_SourceTable",profit."FINChargeProfit_ChargeCode",profit."FINChargeProfit_Description",profit."FINChargeProfit_RevenueNominalCode",profit."FINChargeProfit_CostNominalCode") ilike '%'||btrim(p_search)||'%'
    )
  )
  select coalesce(jsonb_agg(value order by updated_at desc),'[]'::jsonb)
  from (select * from records order by updated_at desc limit greatest(1,least(coalesce(p_take,10),25))) limited;
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_finance(uuid,text,integer) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Tenant-safe finance documents, cash and universal freight, warehouse and customs job charge lines, including source provenance, periods, expected values, WIP, accruals, actuals, nominal codes, gross profit and exact invoice reclassification evidence.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='finance';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Event-driven finance documents and freight, warehouse or customs charge-line changes, WIP/accrual reclassifications, unmatched actual GP movements, provider sync, postings and reversals.',
  "AIDexterWatchCapability_FieldsJSON"=(select coalesce(jsonb_agg(distinct value),'[]'::jsonb) from jsonb_array_elements(coalesce("AIDexterWatchCapability_FieldsJSON",'[]'::jsonb)||'["jobDomain","chargeSourceTable","chargeSourceId"]'::jsonb)),
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='finance';

commit;
