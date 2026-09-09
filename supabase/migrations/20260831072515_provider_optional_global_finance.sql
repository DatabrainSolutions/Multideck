begin;

-- Multideck is the accounting source of truth. External accounting packages
-- are optional mirrors and never determine whether the native ledger exists.
alter table public."FIN_Settings"
  add column if not exists "FINSET_NativeLedgerEnabled" boolean not null default true,
  add column if not exists "FINSET_ExternalMirrorModeCode" varchar(20) not null default 'optional';

alter table public."FIN_Settings" drop constraint if exists "CK_FIN_Settings_external_mirror_mode";
alter table public."FIN_Settings" add constraint "CK_FIN_Settings_external_mirror_mode"
  check ("FINSET_ExternalMirrorModeCode" in ('disabled','optional','required'));

alter table public."FIN_Documents"
  add column if not exists "FINDoc_NativePostingStatusCode" varchar(30) not null default 'draft',
  add column if not exists "FINDoc_NativePostingBatchID" uuid references public."FIN_PostingBatches"("FINPostBatch_ID") on delete restrict,
  add column if not exists "FINDoc_NativePostedAt" timestamptz,
  add column if not exists "FINDoc_NativePostedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

alter table public."FIN_CashTransactions"
  add column if not exists "FINCash_NativePostingStatusCode" varchar(30) not null default 'draft',
  add column if not exists "FINCash_NativePostingBatchID" uuid references public."FIN_PostingBatches"("FINPostBatch_ID") on delete restrict,
  add column if not exists "FINCash_NativePostedAt" timestamptz,
  add column if not exists "FINCash_NativePostedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINCash_ExportStatusCode" varchar(60) not null default 'not_queued';

alter table public."FIN_Documents" drop constraint if exists "CK_FIN_Documents_native_posting_status";
alter table public."FIN_Documents" add constraint "CK_FIN_Documents_native_posting_status"
  check ("FINDoc_NativePostingStatusCode" in ('draft','pending_migration','posted','reversed'));
alter table public."FIN_CashTransactions" drop constraint if exists "CK_FIN_CashTransactions_native_posting_status";
alter table public."FIN_CashTransactions" add constraint "CK_FIN_CashTransactions_native_posting_status"
  check ("FINCash_NativePostingStatusCode" in ('draft','pending_migration','posted','reversed'));

create index if not exists "IX_FIN_Documents_native_posting"
  on public."FIN_Documents"("FINDoc_LegalEntityID","FINDoc_NativePostingStatusCode","FINDoc_AccountingDate");
create index if not exists "IX_FIN_CashTransactions_native_posting"
  on public."FIN_CashTransactions"("FINCash_LegalEntityID","FINCash_NativePostingStatusCode","FINCash_AccountingDate");
create index if not exists "IX_FIN_Documents_native_batch"
  on public."FIN_Documents"("FINDoc_NativePostingBatchID") where "FINDoc_NativePostingBatchID" is not null;
create index if not exists "IX_FIN_CashTransactions_native_batch"
  on public."FIN_CashTransactions"("FINCash_NativePostingBatchID") where "FINCash_NativePostingBatchID" is not null;

-- Existing approved records require a controlled migration review. The change
-- deliberately does not invent journals for historical provider-only records.
update public."FIN_Documents"
set "FINDoc_NativePostingStatusCode"='pending_migration'
where "FINDoc_StatusCode" in ('approved','submitted')
  and "FINDoc_NativePostingBatchID" is null
  and "FINDoc_NativePostingStatusCode"='draft';
update public."FIN_CashTransactions"
set "FINCash_NativePostingStatusCode"='pending_migration'
where "FINCash_StatusCode" in ('approved','submitted')
  and "FINCash_NativePostingBatchID" is null
  and "FINCash_NativePostingStatusCode"='draft';

insert into public."sys_FinancePostingStatuses"(
  "FINPOSTST_Code","FINPOSTST_Name","FINPOSTST_Description","FINPOSTST_IsFinal","FINPOSTST_SortOrder","FINPOSTST_IsActive"
) values
  ('draft','Draft','Not yet posted to the Multideck ledger.',false,10,true),
  ('queued','Queued','Approved and waiting for native ledger posting.',false,20,true),
  ('processing','Processing','Native ledger posting is in progress.',false,30,true),
  ('posted','Posted','Balanced and posted to the Multideck ledger.',true,40,true),
  ('blocked','Blocked','Native posting is blocked by incomplete accounting configuration.',false,50,true),
  ('failed','Failed','Native posting failed and needs finance attention.',false,60,true)
on conflict ("FINPOSTST_Code") do update set
  "FINPOSTST_Name"=excluded."FINPOSTST_Name",
  "FINPOSTST_Description"=excluded."FINPOSTST_Description",
  "FINPOSTST_IsFinal"=excluded."FINPOSTST_IsFinal",
  "FINPOSTST_IsActive"=true;

-- The record lifecycle and native posting lifecycle are deliberately separate
-- from external mirror delivery. Keep the shared lookup copy explicit so old
-- provider-owned wording cannot leak back into the operator interface.
update public."sys_FinanceDocumentStatuses" set
  "FINDST_Description"=case "FINDST_Code"
    when 'approved' then 'Approved and posted to the Multideck ledger; external mirror delivery follows only when configured.'
    when 'submitted' then 'Posted to Multideck and delivered to the configured external accounting mirror.'
    when 'failed' then 'An external mirror delivery failed; the Multideck ledger posting remains authoritative.'
    else "FINDST_Description"
  end
where "FINDST_Code" in ('approved','submitted','failed');

update public."sys_FinanceCashStatuses" set
  "FINCASHST_Description"=case "FINCASHST_Code"
    when 'approved' then 'Approved, allocated and posted to the Multideck ledger; external mirror delivery follows only when configured.'
    when 'submitted' then 'Posted to Multideck and delivered to the configured external accounting mirror.'
    when 'failed' then 'An external mirror delivery failed; the Multideck ledger posting remains authoritative.'
    else "FINCASHST_Description"
  end
where "FINCASHST_Code" in ('approved','submitted','failed');

update public."sys_FinanceAuthorityActionTypes" set
  "FINAUTHA_Description"=case "FINAUTHA_Code"
    when 'finance_post' then 'Approve a reviewed finance document for balanced posting to the Multideck ledger and optional external mirroring.'
    when 'finance_cash_post' then 'Approve reviewed cash, apply allocations, post the balanced Multideck journal and optionally mirror it externally.'
    else "FINAUTHA_Description"
  end
where "FINAUTHA_Code" in ('finance_post','finance_cash_post');

-- Country packs describe verified obligations and their implementation gate.
-- A foundation row means requirements are catalogued, not that Multideck is
-- approved to submit to that authority in production.
alter table public."FIN_LocalisationPacks"
  add column if not exists "FINLocPack_Version" integer not null default 1,
  add column if not exists "FINLocPack_AuthorityName" varchar(180),
  add column if not exists "FINLocPack_ReportingCurrencyCode" varchar(3),
  add column if not exists "FINLocPack_ComplianceStatusCode" varchar(30) not null default 'foundation',
  add column if not exists "FINLocPack_SourceURL" text,
  add column if not exists "FINLocPack_ReviewedAt" timestamptz;

alter table public."FIN_LocalisationPacks" drop constraint if exists "CK_FIN_LocalisationPacks_compliance_status";
alter table public."FIN_LocalisationPacks" add constraint "CK_FIN_LocalisationPacks_compliance_status"
  check ("FINLocPack_ComplianceStatusCode" in ('foundation','calculation_ready','sandbox_ready','production_ready'));

create table if not exists public."FIN_ComplianceObligations" (
  "FINCompliance_ID" uuid primary key default gen_random_uuid(),
  "FINCompliance_PackID" uuid not null references public."FIN_LocalisationPacks"("FINLocPack_ID") on delete cascade,
  "FINCompliance_Code" varchar(100) not null,
  "FINCompliance_Name" varchar(220) not null,
  "FINCompliance_ObligationTypeCode" varchar(40) not null,
  "FINCompliance_AuthorityName" varchar(180) not null,
  "FINCompliance_FilingChannelCode" varchar(50) not null,
  "FINCompliance_FrequencyCode" varchar(40) not null,
  "FINCompliance_ReadinessStatusCode" varchar(30) not null default 'foundation',
  "FINCompliance_SourceURL" text not null,
  "FINCompliance_EffectiveFrom" date not null default current_date,
  "FINCompliance_EffectiveTo" date,
  "FINCompliance_RequirementsJSON" jsonb not null default '{}'::jsonb,
  "FINCompliance_IsActive" boolean not null default true,
  "FINCompliance_ReviewedAt" timestamptz,
  "FINCompliance_UpdatedAt" timestamptz not null default now(),
  constraint "UQ_FIN_ComplianceObligations_pack_code" unique ("FINCompliance_PackID","FINCompliance_Code"),
  constraint "CK_FIN_ComplianceObligations_type" check ("FINCompliance_ObligationTypeCode" in ('indirect_tax','corporate_income_tax','statutory_accounts','sales_and_use_tax','financial_reporting')),
  constraint "CK_FIN_ComplianceObligations_status" check ("FINCompliance_ReadinessStatusCode" in ('foundation','calculation_ready','sandbox_ready','production_ready')),
  constraint "CK_FIN_ComplianceObligations_dates" check ("FINCompliance_EffectiveTo" is null or "FINCompliance_EffectiveTo">="FINCompliance_EffectiveFrom"),
  constraint "CK_FIN_ComplianceObligations_requirements" check (jsonb_typeof("FINCompliance_RequirementsJSON")='object')
);

create index if not exists "IX_FIN_ComplianceObligations_pack_active"
  on public."FIN_ComplianceObligations"("FINCompliance_PackID","FINCompliance_IsActive","FINCompliance_ObligationTypeCode");

create table if not exists public."FIN_LegalEntityComplianceRegistrations" (
  "FINComplianceReg_ID" uuid primary key default gen_random_uuid(),
  "FINComplianceReg_LegalEntityID" uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete cascade,
  "FINComplianceReg_ObligationID" uuid not null references public."FIN_ComplianceObligations"("FINCompliance_ID") on delete restrict,
  "FINComplianceReg_StatusCode" varchar(30) not null default 'not_configured',
  "FINComplianceReg_RegistrationReference" varchar(180),
  "FINComplianceReg_FilingMethodCode" varchar(50),
  "FINComplianceReg_EffectiveFrom" date not null default current_date,
  "FINComplianceReg_EffectiveTo" date,
  "FINComplianceReg_SettingsJSON" jsonb not null default '{}'::jsonb,
  "FINComplianceReg_UpdatedAt" timestamptz not null default now(),
  "FINComplianceReg_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "UQ_FIN_LegalEntityCompliance_registration" unique ("FINComplianceReg_LegalEntityID","FINComplianceReg_ObligationID"),
  constraint "CK_FIN_LegalEntityCompliance_status" check ("FINComplianceReg_StatusCode" in ('not_applicable','not_configured','configured','sandbox_verified','production_verified')),
  constraint "CK_FIN_LegalEntityCompliance_dates" check ("FINComplianceReg_EffectiveTo" is null or "FINComplianceReg_EffectiveTo">="FINComplianceReg_EffectiveFrom"),
  constraint "CK_FIN_LegalEntityCompliance_settings" check (jsonb_typeof("FINComplianceReg_SettingsJSON")='object')
);

create index if not exists "IX_FIN_LegalEntityCompliance_entity_status"
  on public."FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_LegalEntityID","FINComplianceReg_StatusCode","FINComplianceReg_UpdatedAt" desc);
create index if not exists "IX_FIN_LegalEntityCompliance_obligation"
  on public."FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_ObligationID");

alter table public."FIN_ComplianceObligations" enable row level security;
alter table public."FIN_LegalEntityComplianceRegistrations" enable row level security;
revoke all on public."FIN_ComplianceObligations",public."FIN_LegalEntityComplianceRegistrations" from public,anon,authenticated;
grant select,insert,update,delete on public."FIN_ComplianceObligations",public."FIN_LegalEntityComplianceRegistrations" to service_role;

insert into public."FIN_LocalisationPacks"(
  "FINLocPack_Code","FINLocPack_Name","FINLocPack_CountryCode","FINLocPack_AccountingStandardCode",
  "FINLocPack_Version","FINLocPack_AuthorityName","FINLocPack_ReportingCurrencyCode","FINLocPack_ComplianceStatusCode","FINLocPack_SourceURL","FINLocPack_ReviewedAt","FINLocPack_IsActive"
) values
  ('gb-v1','United Kingdom accounting and tax foundation','GB','UK_GAAP',1,'HMRC and Companies House','GBP','foundation','https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/2.0',now(),true),
  ('us-v1','United States accounting and tax foundation','US','US_GAAP',1,'Internal Revenue Service and state tax authorities','USD','foundation','https://www.irs.gov/e-file-providers/form-1120-1120-s-1120-f-1120-h-e-file',now(),true),
  ('ca-v1','Canada accounting and tax foundation','CA','ASPE_OR_IFRS',1,'Canada Revenue Agency','CAD','foundation','https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-businesses.html',now(),true),
  ('au-v1','Australia accounting and tax foundation','AU','AUSTRALIAN_ACCOUNTING_STANDARDS',1,'Australian Taxation Office and ASIC','AUD','foundation','https://softwaredevelopers.ato.gov.au/getting_started',now(),true)
on conflict ("FINLocPack_Code") do update set
  "FINLocPack_Name"=excluded."FINLocPack_Name","FINLocPack_CountryCode"=excluded."FINLocPack_CountryCode",
  "FINLocPack_AccountingStandardCode"=excluded."FINLocPack_AccountingStandardCode","FINLocPack_Version"=excluded."FINLocPack_Version",
  "FINLocPack_AuthorityName"=excluded."FINLocPack_AuthorityName","FINLocPack_ReportingCurrencyCode"=excluded."FINLocPack_ReportingCurrencyCode",
  "FINLocPack_ComplianceStatusCode"=excluded."FINLocPack_ComplianceStatusCode","FINLocPack_SourceURL"=excluded."FINLocPack_SourceURL",
  "FINLocPack_ReviewedAt"=excluded."FINLocPack_ReviewedAt","FINLocPack_IsActive"=true;

with obligations(pack_code,code,name,kind,authority,channel,frequency,source_url,requirements) as (values
  ('gb-v1','gb-vat-mtd','VAT Making Tax Digital','indirect_tax','HM Revenue & Customs','direct_api','periodic','https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/2.0',jsonb_build_object('productionGate','HMRC software production approval and fraud prevention headers','payrollExcluded',true)),
  ('gb-v1','gb-corporation-tax','Corporation Tax return and computations','corporate_income_tax','HM Revenue & Customs','approved_software','annual','https://www.gov.uk/company-tax-returns',jsonb_build_object('forms',jsonb_build_array('CT600','iXBRL accounts','iXBRL computations'),'payrollExcluded',true)),
  ('gb-v1','gb-statutory-accounts','Companies House annual accounts','statutory_accounts','Companies House','software_filing','annual','https://www.gov.uk/government/news/changes-to-filing-annual-accounts-at-companies-house',jsonb_build_object('format','iXBRL','productionGate','Companies House software filing and presenter approval','payrollExcluded',true)),
  ('us-v1','us-federal-corporate-income-tax','Federal corporation income tax','corporate_income_tax','Internal Revenue Service','modernized_e_file','annual','https://www.irs.gov/e-file-providers/form-1120-1120-s-1120-f-1120-h-e-file',jsonb_build_object('forms',jsonb_build_array('1120','1120-S'),'productionGate','IRS approved software or authorised e-file provider','payrollExcluded',true)),
  ('us-v1','us-state-sales-use-tax','State and local sales and use tax','sales_and_use_tax','State and local tax authorities','jurisdiction_specific','periodic','https://www.irs.gov/businesses/small-businesses-self-employed/state-government-websites',jsonb_build_object('requiresNexusConfiguration',true,'requiresStateSpecificRatesAndReturns',true,'payrollExcluded',true)),
  ('us-v1','us-financial-reporting','US GAAP financial statements','financial_reporting','Applicable company and regulatory authorities','statement_generation','annual','https://asc.fasb.org/',jsonb_build_object('standard','US GAAP','payrollExcluded',true)),
  ('ca-v1','ca-gst-hst','GST/HST return','indirect_tax','Canada Revenue Agency','netfile_or_file_transfer','periodic','https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/file-gst-hst-return/how-file.html',jsonb_build_object('accessCodeMayBeRequired',true,'payrollExcluded',true)),
  ('ca-v1','ca-t2','T2 Corporation Income Tax Return','corporate_income_tax','Canada Revenue Agency','corporation_internet_filing','annual','https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-businesses/corporation-internet-filing.html',jsonb_build_object('productionGate','CRA-certified software and applicable Web Access Code or EFILE credentials','payrollExcluded',true)),
  ('ca-v1','ca-provincial-sales-tax','Provincial sales taxes','sales_and_use_tax','Applicable provincial tax authority','jurisdiction_specific','periodic','https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/provincial-territorial-taxes.html',jsonb_build_object('requiresProvinceConfiguration',true,'payrollExcluded',true)),
  ('au-v1','au-gst-bas','GST and Business Activity Statement','indirect_tax','Australian Taxation Office','sbr','periodic','https://www.ato.gov.au/online-services/businesses-and-organisations-online-services',jsonb_build_object('productionGate','Registered DSP, EVTE testing, Operational Security Framework and production whitelisting','payrollExcluded',true)),
  ('au-v1','au-company-tax','Company tax return','corporate_income_tax','Australian Taxation Office','sbr','annual','https://www.ato.gov.au/online-services/businesses-and-organisations-online-services',jsonb_build_object('productionGate','SBR-enabled product and ATO production whitelisting','payrollExcluded',true)),
  ('au-v1','au-financial-reporting','Australian financial reporting','financial_reporting','Australian Securities and Investments Commission','software_or_portal','annual','https://asic.gov.au/regulatory-resources/financial-reporting-and-audit/preparers-of-financial-reports/lodging-financial-reports/',jsonb_build_object('standard','Australian Accounting Standards','entitySpecificRequirements',true,'payrollExcluded',true))
)
insert into public."FIN_ComplianceObligations"(
  "FINCompliance_PackID","FINCompliance_Code","FINCompliance_Name","FINCompliance_ObligationTypeCode","FINCompliance_AuthorityName",
  "FINCompliance_FilingChannelCode","FINCompliance_FrequencyCode","FINCompliance_ReadinessStatusCode","FINCompliance_SourceURL","FINCompliance_EffectiveFrom","FINCompliance_RequirementsJSON","FINCompliance_ReviewedAt"
)
select pack."FINLocPack_ID",item.code,item.name,item.kind,item.authority,item.channel,item.frequency,'foundation',item.source_url,date '2026-08-31',item.requirements,now()
from obligations item join public."FIN_LocalisationPacks" pack on pack."FINLocPack_Code"=item.pack_code
on conflict ("FINCompliance_PackID","FINCompliance_Code") do update set
  "FINCompliance_Name"=excluded."FINCompliance_Name","FINCompliance_ObligationTypeCode"=excluded."FINCompliance_ObligationTypeCode",
  "FINCompliance_AuthorityName"=excluded."FINCompliance_AuthorityName","FINCompliance_FilingChannelCode"=excluded."FINCompliance_FilingChannelCode",
  "FINCompliance_FrequencyCode"=excluded."FINCompliance_FrequencyCode","FINCompliance_ReadinessStatusCode"=excluded."FINCompliance_ReadinessStatusCode",
  "FINCompliance_SourceURL"=excluded."FINCompliance_SourceURL","FINCompliance_RequirementsJSON"=excluded."FINCompliance_RequirementsJSON",
  "FINCompliance_ReviewedAt"=excluded."FINCompliance_ReviewedAt","FINCompliance_UpdatedAt"=now(),"FINCompliance_IsActive"=true;

insert into public."sys_Permissions"(
  "sys_Permission_Value","sys_Permission_Group","sys_Permission_Name","sys_Permission_Description","sys_Permission_IsDangerous"
) values
  ('Finance.Reporting.View','Finance','View financial reports','View the native trial balance, profit and loss, balance sheet and source evidence.',false),
  ('Finance.Compliance.View','Finance','View finance compliance','View jurisdiction obligations, readiness gates and legal-entity registrations.',false),
  ('Finance.Compliance.Manage','Finance','Manage finance compliance','Configure and approve legal-entity tax and statutory filing registrations.',true)
on conflict ("sys_Permission_Value") do update set
  "sys_Permission_Group"=excluded."sys_Permission_Group","sys_Permission_Name"=excluded."sys_Permission_Name",
  "sys_Permission_Description"=excluded."sys_Permission_Description","sys_Permission_IsDangerous"=excluded."sys_Permission_IsDangerous";

with role_permissions(role_name,permission_value) as (values
  ('Administrator','Finance.Reporting.View'),('Administrator','Finance.Compliance.View'),('Administrator','Finance.Compliance.Manage'),
  ('Finance manager','Finance.Reporting.View'),('Finance manager','Finance.Compliance.View'),('Finance manager','Finance.Compliance.Manage'),
  ('Operations manager','Finance.Reporting.View'),('Operations manager','Finance.Compliance.View')
)
insert into public."sys_UserRole_Permissions"("sys_UserRole_ID","sys_Permission_ID")
select role."sys_UserRole_ID",permission."sys_Permission_ID"
from role_permissions mapping
join public."sys_UserRoles" role on lower(role."sys_UserRole_Name")=lower(mapping.role_name)
join public."sys_Permissions" permission on permission."sys_Permission_Value"=mapping.permission_value
on conflict do nothing;

commit;

begin;

-- Reporting is installed before the posting triggers below, so expose the
-- small ownership-state helper here and replace it with the same guarded
-- definition in the lifecycle block for migration readability.
create or replace function public._multideck_finance_mirror_state(p_legal_entity_id uuid)
returns table(mirror_mode text,active_connection boolean,native_ledger_enabled boolean)
language sql stable security definer set search_path=pg_catalog,public as $$
  select
    coalesce((select settings."FINSET_ExternalMirrorModeCode" from public."FIN_Settings" settings
      where settings."FINSET_LegalEntityID"=p_legal_entity_id and settings."FINSET_OrgOfficeID" is null and settings."FINSET_BrandID" is null limit 1),'optional'),
    exists(select 1 from public."ACCI_Connections" connection
      where connection."ACCIC_LegalEntityID"=p_legal_entity_id and connection."ACCIC_StatusCode"='active'),
    coalesce((select settings."FINSET_NativeLedgerEnabled" from public."FIN_Settings" settings
      where settings."FINSET_LegalEntityID"=p_legal_entity_id and settings."FINSET_OrgOfficeID" is null and settings."FINSET_BrandID" is null limit 1),true)
$$;
revoke all on function public._multideck_finance_mirror_state(uuid) from public,anon,authenticated;
grant execute on function public._multideck_finance_mirror_state(uuid) to service_role;

alter table public."FIN_NominalAccounts"
  add column if not exists "FINNom_ReportCategoryCode" varchar(30);

update public."FIN_NominalAccounts" set "FINNom_ReportCategoryCode"=case
  when "FINNom_Code" like '7%' then 'finance'
  when lower("FINNom_AccountTypeCode") like '%income%' or lower("FINNom_AccountTypeCode") like '%revenue%' or "FINNom_Code" like '4%' then 'income'
  when lower("FINNom_AccountTypeCode") like '%cost of goods%' or "FINNom_Code" like '5%' then 'direct_cost'
  when lower("FINNom_AccountTypeCode") like '%expense%' or "FINNom_Code" like '6%' then 'expense'
  when lower("FINNom_AccountTypeCode") like '%equity%' or "FINNom_Code" like '3%' then 'equity'
  when lower("FINNom_AccountTypeCode") like '%liability%' or lower("FINNom_AccountTypeCode") like '%payable%' or "FINNom_Code" like '2%' then 'liability'
  else 'asset'
end
where "FINNom_ReportCategoryCode" is null;

alter table public."FIN_NominalAccounts" drop constraint if exists "CK_FIN_NominalAccounts_report_category";
alter table public."FIN_NominalAccounts" add constraint "CK_FIN_NominalAccounts_report_category"
  check ("FINNom_ReportCategoryCode" is null or "FINNom_ReportCategoryCode" in ('asset','liability','equity','income','direct_cost','expense','finance'));

create or replace function public._multideck_finance_derive_report_category()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='INSERT' then
    new."FINNom_ReportCategoryCode":=case
      when new."FINNom_Code" like '7%' then 'finance'
      when lower(new."FINNom_AccountTypeCode") like '%income%' or lower(new."FINNom_AccountTypeCode") like '%revenue%' or new."FINNom_Code" like '4%' then 'income'
      when lower(new."FINNom_AccountTypeCode") like '%cost of goods%' or new."FINNom_Code" like '5%' then 'direct_cost'
      when lower(new."FINNom_AccountTypeCode") like '%expense%' or new."FINNom_Code" like '6%' then 'expense'
      when lower(new."FINNom_AccountTypeCode") like '%equity%' or new."FINNom_Code" like '3%' then 'equity'
      when lower(new."FINNom_AccountTypeCode") like '%liability%' or lower(new."FINNom_AccountTypeCode") like '%payable%' or new."FINNom_Code" like '2%' then 'liability'
      else 'asset'
    end;
  elsif new."FINNom_ReportCategoryCode" is null
    or ((new."FINNom_Code" is distinct from old."FINNom_Code" or new."FINNom_AccountTypeCode" is distinct from old."FINNom_AccountTypeCode")
      and new."FINNom_ReportCategoryCode" is not distinct from old."FINNom_ReportCategoryCode") then
    new."FINNom_ReportCategoryCode":=case
      when new."FINNom_Code" like '7%' then 'finance'
      when lower(new."FINNom_AccountTypeCode") like '%income%' or lower(new."FINNom_AccountTypeCode") like '%revenue%' or new."FINNom_Code" like '4%' then 'income'
      when lower(new."FINNom_AccountTypeCode") like '%cost of goods%' or new."FINNom_Code" like '5%' then 'direct_cost'
      when lower(new."FINNom_AccountTypeCode") like '%expense%' or new."FINNom_Code" like '6%' then 'expense'
      when lower(new."FINNom_AccountTypeCode") like '%equity%' or new."FINNom_Code" like '3%' then 'equity'
      when lower(new."FINNom_AccountTypeCode") like '%liability%' or lower(new."FINNom_AccountTypeCode") like '%payable%' or new."FINNom_Code" like '2%' then 'liability'
      else 'asset'
    end;
  end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_derive_report_category() from public,anon,authenticated;

drop trigger if exists "TR_FIN_NominalAccounts_report_category" on public."FIN_NominalAccounts";
create trigger "TR_FIN_NominalAccounts_report_category"
before insert or update of "FINNom_Code","FINNom_AccountTypeCode","FINNom_ReportCategoryCode" on public."FIN_NominalAccounts"
for each row execute function public._multideck_finance_derive_report_category();

create index if not exists "IX_FIN_NominalAccounts_reporting"
  on public."FIN_NominalAccounts"("FINNom_LegalEntityID","FINNom_ReportCategoryCode","FINNom_Code")
  where "FINNom_IsActive";

create or replace function public.multideck_finance_reporting_snapshot(
  p_company_id uuid,p_user_id uuid,p_legal_entity_id uuid,p_from_date date,p_to_date date
) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  v_from date; v_to date; v_currency text; v_entity_name text; v_native boolean; v_mode text; v_connection boolean;
begin
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then
    raise exception 'The finance operator is outside this workspace.' using errcode='42501';
  end if;
  select "LegalEntity_Name",upper("LegalEntity_BaseCurrencyCodeSnapshot") into v_entity_name,v_currency
  from public."cmp_LegalEntities" where "LegalEntity_ID"=p_legal_entity_id and "Company_ID"=p_company_id and "LegalEntity_IsActive";
  if not found then raise exception 'That legal entity is outside this workspace.' using errcode='42501'; end if;
  if p_from_date is null or p_to_date is null or p_to_date<p_from_date or p_to_date>p_from_date+interval '10 years' then
    raise exception 'Choose a valid reporting range of no more than ten years.' using errcode='22023';
  end if;
  v_from:=date_trunc('month',p_from_date)::date;
  v_to:=(date_trunc('month',p_to_date)+interval '1 month'-interval '1 day')::date;
  select mirror_mode,active_connection,native_ledger_enabled into v_mode,v_connection,v_native from public._multideck_finance_mirror_state(p_legal_entity_id);

  return (
    with posted as (
      select nominal."FINNom_ID" account_id,nominal."FINNom_Code" account_code,nominal."FINNom_Name" account_name,
        nominal."FINNom_AccountTypeCode" account_type,coalesce(nominal."FINNom_ReportCategoryCode",'asset') category,
        period."FINPeriod_StartDate" period_start,period."FINPeriod_EndDate" period_end,
        line."FINPostLine_DebitAmount" debit,line."FINPostLine_CreditAmount" credit
      from public."FIN_PostingLines" line
      join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=line."FINPostLine_BatchID" and batch."FINPostBatch_StatusCode"='posted'
      join public."FIN_Periods" period on period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
      join public."FIN_NominalAccounts" nominal on nominal."FINNom_ID"=line."FINPostLine_NominalAccountID"
      where batch."FINPostBatch_LegalEntityID"=p_legal_entity_id and period."FINPeriod_EndDate"<=v_to
    ), accounts as (
      select nominal."FINNom_ID" account_id,nominal."FINNom_Code" account_code,nominal."FINNom_Name" account_name,
        nominal."FINNom_AccountTypeCode" account_type,coalesce(nominal."FINNom_ReportCategoryCode",'asset') category
      from public."FIN_NominalAccounts" nominal
      where nominal."FINNom_LegalEntityID"=p_legal_entity_id and nominal."FINNom_IsActive"
    ), balances as (
      select account.account_id,account.account_code,account.account_name,account.account_type,account.category,
        round(coalesce(sum(posted.debit-posted.credit) filter(where posted.period_end<v_from),0),4) opening_balance,
        round(coalesce(sum(posted.debit) filter(where posted.period_start<=v_to and posted.period_end>=v_from),0),4) period_debit,
        round(coalesce(sum(posted.credit) filter(where posted.period_start<=v_to and posted.period_end>=v_from),0),4) period_credit,
        round(coalesce(sum(posted.debit-posted.credit),0),4) closing_debit_balance
      from accounts account left join posted on posted.account_id=account.account_id
      group by account.account_id,account.account_code,account.account_name,account.account_type,account.category
    ), pnl as (
      -- A positive amount is profit contribution; costs and expenses therefore
      -- appear negative and cannot be accidentally added to income.
      select *,round(period_credit-period_debit,4) display_amount
      from balances where category in ('income','direct_cost','expense','finance')
    ), statement as (
      select *,round(case when category='asset' then closing_debit_balance else -closing_debit_balance end,4) display_amount
      from balances where category in ('asset','liability','equity')
    ), totals as (
      select
        coalesce((select round(sum(display_amount),4) from pnl),0) pnl_total,
        coalesce((select round(sum(-closing_debit_balance),4) from balances where category in ('income','direct_cost','expense','finance')),0) current_earnings,
        coalesce((select round(sum(display_amount),4) from statement where category='asset'),0) assets,
        coalesce((select round(sum(display_amount),4) from statement where category='liability'),0) liabilities,
        coalesce((select round(sum(display_amount),4) from statement where category='equity'),0) equity
    )
    select jsonb_build_object(
      'legalEntityId',p_legal_entity_id,'legalEntity',v_entity_name,'currency',v_currency,'fromDate',v_from,'toDate',v_to,
      'nativeLedgerEnabled',v_native,'externalMirrorModeCode',v_mode,'externalMirrorConnected',v_connection,
      'trialBalance',coalesce((select jsonb_agg(jsonb_build_object(
        'accountId',account_id,'accountCode',account_code,'accountName',account_name,'accountType',account_type,'category',category,
        'openingBalance',opening_balance,'debit',period_debit,'credit',period_credit,'closingBalance',closing_debit_balance
      ) order by account_code) from balances where opening_balance<>0 or period_debit<>0 or period_credit<>0 or closing_debit_balance<>0),'[]'::jsonb),
      'profitAndLoss',coalesce((select jsonb_agg(jsonb_build_object(
        'accountId',account_id,'accountCode',account_code,'accountName',account_name,'category',category,'amount',display_amount
      ) order by account_code) from pnl where display_amount<>0),'[]'::jsonb),
      'balanceSheet',coalesce((select jsonb_agg(jsonb_build_object(
        'accountId',account_id,'accountCode',account_code,'accountName',account_name,'category',category,'amount',display_amount
      ) order by account_code) from statement where display_amount<>0),'[]'::jsonb),
      'totals',(select jsonb_build_object(
        'profitOrLoss',pnl_total,'assets',assets,'liabilities',liabilities,'equity',equity,
        'currentEarnings',current_earnings,'balanceDifference',round(assets-liabilities-equity-current_earnings,4)
      ) from totals),
      'coverage',jsonb_build_object(
        'pendingDocumentMigrations',(select count(*) from public."FIN_Documents" where "FINDoc_LegalEntityID"=p_legal_entity_id and "FINDoc_NativePostingStatusCode"='pending_migration'),
        'pendingCashMigrations',(select count(*) from public."FIN_CashTransactions" where "FINCash_LegalEntityID"=p_legal_entity_id and "FINCash_NativePostingStatusCode"='pending_migration'),
        'postedBatches',(select count(*) from public."FIN_PostingBatches" where "FINPostBatch_LegalEntityID"=p_legal_entity_id and "FINPostBatch_StatusCode"='posted')
      ),
      'evidence',jsonb_build_object('sourceTable','FIN_PostingLines','legalEntityId',p_legal_entity_id,'generatedAt',now())
    )
  );
end; $$;
revoke all on function public.multideck_finance_reporting_snapshot(uuid,uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.multideck_finance_reporting_snapshot(uuid,uuid,uuid,date,date) to service_role;

-- Preserve every existing finance record in Dexter, then add native reporting
-- and jurisdiction obligation evidence without broad table or SQL access.
alter function public.multideck_dexter_domain_finance(uuid,text,integer)
  rename to _multideck_dexter_domain_finance_before_native_global;
revoke all on function public._multideck_dexter_domain_finance_before_native_global(uuid,text,integer) from public,anon,authenticated;
grant execute on function public._multideck_dexter_domain_finance_before_native_global(uuid,text,integer) to service_role;

create or replace function public.multideck_dexter_domain_finance(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with entity_totals as (
    select entity."LegalEntity_ID" entity_id,entity."LegalEntity_Name" entity_name,entity."LegalEntity_CountryCode" country_code,
      upper(entity."LegalEntity_BaseCurrencyCodeSnapshot") currency,
      coalesce(sum(case when nominal."FINNom_ReportCategoryCode" in ('income','direct_cost','expense','finance')
        then line."FINPostLine_CreditAmount"-line."FINPostLine_DebitAmount" else 0 end),0) profit_loss,
      coalesce(sum(case when nominal."FINNom_ReportCategoryCode"='asset' then line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount" else 0 end),0) assets,
      coalesce(sum(case when nominal."FINNom_ReportCategoryCode"='liability' then line."FINPostLine_CreditAmount"-line."FINPostLine_DebitAmount" else 0 end),0) liabilities,
      coalesce(sum(case when nominal."FINNom_ReportCategoryCode"='equity' then line."FINPostLine_CreditAmount"-line."FINPostLine_DebitAmount" else 0 end),0) equity,
      max(batch."FINPostBatch_PostedAt") updated_at
    from public."cmp_LegalEntities" entity
    left join public."FIN_PostingBatches" batch on batch."FINPostBatch_LegalEntityID"=entity."LegalEntity_ID" and batch."FINPostBatch_StatusCode"='posted'
    left join public."FIN_PostingLines" line on line."FINPostLine_BatchID"=batch."FINPostBatch_ID"
    left join public."FIN_NominalAccounts" nominal on nominal."FINNom_ID"=line."FINPostLine_NominalAccountID"
    where entity."Company_ID"=p_company_id and entity."LegalEntity_IsActive"
    group by entity."LegalEntity_ID",entity."LegalEntity_Name",entity."LegalEntity_CountryCode",entity."LegalEntity_BaseCurrencyCodeSnapshot"
  ), records as (
    select value,coalesce((value->'evidence'->>'updatedAt')::timestamptz,'2000-01-01'::timestamptz) updated_at
    from jsonb_array_elements(public._multideck_dexter_domain_finance_before_native_global(p_company_id,p_search,p_take)) value
    union all
    select jsonb_build_object(
      'recordId',totals.entity_id,'recordKind','native_financial_summary','legalEntityId',totals.entity_id,'legalEntity',totals.entity_name,
      'currency',totals.currency,'profitOrLoss',round(totals.profit_loss,4),'assets',round(totals.assets,4),'liabilities',round(totals.liabilities,4),
      'equity',round(totals.equity,4),'currentEarnings',round(totals.profit_loss,4),'balanceDifference',round(totals.assets-totals.liabilities-totals.equity-totals.profit_loss,4),
      'reportRoute','/finance/reports','evidence',jsonb_build_object('sourceTable','FIN_PostingLines','legalEntityId',totals.entity_id,'updatedAt',coalesce(totals.updated_at,now()))
    ),coalesce(totals.updated_at,'2000-01-01'::timestamptz)
    from entity_totals totals
    where nullif(btrim(p_search),'') is null or concat_ws(' ',totals.entity_name,'profit loss balance sheet trial balance native ledger financial report') ilike '%'||btrim(p_search)||'%'
    union all
    select jsonb_build_object(
      'recordId',obligation."FINCompliance_ID",'recordKind','compliance_obligation','legalEntityId',entity."LegalEntity_ID",'legalEntity',entity."LegalEntity_Name",
      'country',pack."FINLocPack_CountryCode",'code',obligation."FINCompliance_Code",'name',obligation."FINCompliance_Name",'obligationType',obligation."FINCompliance_ObligationTypeCode",
      'authority',obligation."FINCompliance_AuthorityName",'filingChannel',obligation."FINCompliance_FilingChannelCode",'frequency',obligation."FINCompliance_FrequencyCode",
      'readinessStatus',obligation."FINCompliance_ReadinessStatusCode",'sourceUrl',obligation."FINCompliance_SourceURL",'payrollIncluded',false,
      'evidence',jsonb_build_object('sourceTable','FIN_ComplianceObligations','sourceId',obligation."FINCompliance_ID",'legalEntityId',entity."LegalEntity_ID",'updatedAt',obligation."FINCompliance_UpdatedAt")
    ),obligation."FINCompliance_UpdatedAt"
    from public."FIN_ComplianceObligations" obligation
    join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    join public."cmp_LegalEntities" entity on entity."Company_ID"=p_company_id and entity."LegalEntity_CountryCode"=pack."FINLocPack_CountryCode" and entity."LegalEntity_IsActive"
    where obligation."FINCompliance_IsActive" and (
      nullif(btrim(p_search),'') is null or concat_ws(' ',obligation."FINCompliance_Code",obligation."FINCompliance_Name",obligation."FINCompliance_ObligationTypeCode",obligation."FINCompliance_AuthorityName",pack."FINLocPack_CountryCode") ilike '%'||btrim(p_search)||'%'
    )
  )
  select coalesce(jsonb_agg(value order by updated_at desc),'[]'::jsonb)
  from (select * from records order by updated_at desc limit greatest(1,least(coalesce(p_take,10),25))) limited
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_finance(uuid,text,integer) to service_role;

create or replace function public._multideck_dexter_finance_compliance_watch_change()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_company uuid; v_entity uuid:=coalesce(new."FINComplianceReg_LegalEntityID",old."FINComplianceReg_LegalEntityID"); v_row uuid:=coalesce(new."FINComplianceReg_ID",old."FINComplianceReg_ID");
begin
  select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=v_entity;
  if v_company is not null and exists(
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID"=v_company and watch."AIDexterWatch_CapabilityCode"='finance' and watch."AIDexterWatch_StatusCode"='active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=v_entity)
  ) then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON"
    ) values (
      v_company,'finance','FIN_LegalEntityComplianceRegistrations',v_row,
      case when tg_op='INSERT' then '{}'::jsonb else jsonb_build_object('complianceStatus',old."FINComplianceReg_StatusCode",'obligationId',old."FINComplianceReg_ObligationID",'legalEntityId',v_entity) end,
      jsonb_build_object('complianceStatus',new."FINComplianceReg_StatusCode",'obligationId',new."FINComplianceReg_ObligationID",'legalEntityId',v_entity)
    );
  end if;
  return new;
end; $$;
revoke all on function public._multideck_dexter_finance_compliance_watch_change() from public,anon,authenticated;

drop trigger if exists "TR_FIN_LegalEntityCompliance_dexter_watch" on public."FIN_LegalEntityComplianceRegistrations";
create trigger "TR_FIN_LegalEntityCompliance_dexter_watch"
after insert or update of "FINComplianceReg_StatusCode","FINComplianceReg_RegistrationReference","FINComplianceReg_FilingMethodCode","FINComplianceReg_EffectiveFrom","FINComplianceReg_EffectiveTo"
on public."FIN_LegalEntityComplianceRegistrations" for each row execute function public._multideck_dexter_finance_compliance_watch_change();

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Tenant-safe native financial summaries, trial-balance evidence, AR/AP, cash, freight charge profitability, external mirror state and jurisdiction compliance obligations. Payroll is excluded.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='finance';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Event-driven native ledger postings, financial balance movements, external accounting mirror delivery, finance documents, cash, freight charge profitability and compliance-registration changes.',
  "AIDexterWatchCapability_FieldsJSON"=(select coalesce(jsonb_agg(distinct value),'[]'::jsonb) from jsonb_array_elements(coalesce("AIDexterWatchCapability_FieldsJSON",'[]'::jsonb)||'["nativePostingStatus","nativePostingBatchId","externalMirrorStatus","complianceStatus","obligationId","balanceDifference"]'::jsonb)),
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='finance';

commit;

begin;

create or replace function public._multideck_finance_sync_ledger_ownership()
returns trigger
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_mode text;
begin
  new."FINSET_NativeLedgerEnabled":=coalesce(
    case new."FINSET_SettingsJSON"#>>'{administration,nativeLedgerEnabled}'
      when 'true' then true when 'false' then false else null end,
    new."FINSET_NativeLedgerEnabled",true
  );
  v_mode:=coalesce(nullif(new."FINSET_SettingsJSON"#>>'{administration,externalMirrorModeCode}',''),new."FINSET_ExternalMirrorModeCode",'optional');
  if v_mode not in ('disabled','optional','required') then
    raise exception 'Choose disabled, optional or required for the external accounting mirror.' using errcode='22023';
  end if;
  new."FINSET_ExternalMirrorModeCode":=v_mode;
  return new;
end; $$;
revoke all on function public._multideck_finance_sync_ledger_ownership() from public,anon,authenticated;
grant execute on function public._multideck_finance_sync_ledger_ownership() to service_role;

drop trigger if exists "TR_FIN_Settings_sync_ledger_ownership" on public."FIN_Settings";
create trigger "TR_FIN_Settings_sync_ledger_ownership"
before insert or update of "FINSET_SettingsJSON","FINSET_NativeLedgerEnabled","FINSET_ExternalMirrorModeCode"
on public."FIN_Settings" for each row execute function public._multideck_finance_sync_ledger_ownership();

create or replace function public._multideck_finance_normalise_native_readiness()
returns trigger
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_native boolean:=true; v_mode text:='optional'; v_missing text[]:=array[]::text[];
begin
  select settings."FINSET_NativeLedgerEnabled",settings."FINSET_ExternalMirrorModeCode"
  into v_native,v_mode
  from public."FIN_Settings" settings
  where settings."FINSET_LegalEntityID"=new."FINAdminRevision_LegalEntityID"
    and settings."FINSET_OrgOfficeID" is null and settings."FINSET_BrandID" is null
  limit 1;
  v_native:=coalesce(v_native,true); v_mode:=coalesce(v_mode,'optional');
  select coalesce(array_agg(value order by ordinal),array[]::text[]) into v_missing
  from jsonb_array_elements_text(coalesce(new."FINAdminRevision_ReadinessJSON"->'missing','[]'::jsonb)) with ordinality item(value,ordinal)
  where value<>'accounting_connection' or v_mode='required';
  if not v_native and not ('native_ledger'=any(v_missing)) then v_missing:=array_append(v_missing,'native_ledger'); end if;
  new."FINAdminRevision_ReadinessJSON":=coalesce(new."FINAdminRevision_ReadinessJSON",'{}'::jsonb)
    || jsonb_build_object(
      'ready',coalesce(array_length(v_missing,1),0)=0,
      'missing',to_jsonb(v_missing),
      'nativeLedgerEnabled',v_native,
      'externalMirrorModeCode',v_mode,
      'externalMirrorRequired',v_mode='required'
    );
  return new;
end; $$;
revoke all on function public._multideck_finance_normalise_native_readiness() from public,anon,authenticated;
grant execute on function public._multideck_finance_normalise_native_readiness() to service_role;

drop trigger if exists "TR_FIN_AdministrationRevisions_native_readiness" on public."FIN_AdministrationRevisions";
create trigger "TR_FIN_AdministrationRevisions_native_readiness"
before insert on public."FIN_AdministrationRevisions"
for each row execute function public._multideck_finance_normalise_native_readiness();

create or replace function public._multideck_finance_mirror_state(p_legal_entity_id uuid)
returns table(mirror_mode text,active_connection boolean,native_ledger_enabled boolean)
language sql stable security definer set search_path=pg_catalog,public as $$
  select
    coalesce((select settings."FINSET_ExternalMirrorModeCode" from public."FIN_Settings" settings
      where settings."FINSET_LegalEntityID"=p_legal_entity_id and settings."FINSET_OrgOfficeID" is null and settings."FINSET_BrandID" is null limit 1),'optional'),
    exists(select 1 from public."ACCI_Connections" connection
      where connection."ACCIC_LegalEntityID"=p_legal_entity_id and connection."ACCIC_StatusCode"='active'),
    coalesce((select settings."FINSET_NativeLedgerEnabled" from public."FIN_Settings" settings
      where settings."FINSET_LegalEntityID"=p_legal_entity_id and settings."FINSET_OrgOfficeID" is null and settings."FINSET_BrandID" is null limit 1),true)
$$;
revoke all on function public._multideck_finance_mirror_state(uuid) from public,anon,authenticated;
grant execute on function public._multideck_finance_mirror_state(uuid) to service_role;

create or replace function public._multideck_finance_guard_optional_mirror_queue()
returns trigger
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_entity uuid; v_mode text; v_active boolean; v_native boolean;
begin
  if new."FINIntQ_LocalTable"='FIN_Documents' then
    select "FINDoc_LegalEntityID" into v_entity from public."FIN_Documents" where "FINDoc_ID"=new."FINIntQ_LocalID";
  elsif new."FINIntQ_LocalTable"='FIN_CashTransactions' then
    select "FINCash_LegalEntityID" into v_entity from public."FIN_CashTransactions" where "FINCash_ID"=new."FINIntQ_LocalID";
  else
    return new;
  end if;
  if v_entity is null then raise exception 'The finance mirror record has no legal entity.' using errcode='22023'; end if;
  select mirror_mode,active_connection,native_ledger_enabled into v_mode,v_active,v_native
  from public._multideck_finance_mirror_state(v_entity);
  if not v_native then raise exception 'Enable the Multideck native ledger before approving finance transactions.' using errcode='22023'; end if;
  if v_mode='required' and not v_active then
    raise exception 'This legal entity requires an active external accounting mirror before approval.' using errcode='22023';
  end if;
  if v_mode='disabled' or (v_mode='optional' and not v_active) then return null; end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_guard_optional_mirror_queue() from public,anon,authenticated;
grant execute on function public._multideck_finance_guard_optional_mirror_queue() to service_role;

drop trigger if exists "TR_FIN_IntegrationQueue_optional_mirror" on public."FIN_IntegrationQueue";
create trigger "TR_FIN_IntegrationQueue_optional_mirror"
before insert on public."FIN_IntegrationQueue"
for each row execute function public._multideck_finance_guard_optional_mirror_queue();

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
    select line.*,tax."FINTax_OutputNominalID",tax."FINTax_InputNominalID"
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
      v_tax_preferred:=case when v_sales then v_line."FINTax_OutputNominalID" else v_line."FINTax_InputNominalID" end;
      v_tax_nominal:=public._multideck_finance_resolve_nominal(v_document."FINDoc_LegalEntityID",v_tax_preferred,case when v_sales then '2100' else '1200' end);
      if v_tax_nominal is null then raise exception 'Finance line % has no active native tax nominal account.',v_line."FINDocLine_LineNo" using errcode='22023'; end if;
      v_line_no:=v_line_no+1;
      insert into public."FIN_PostingLines"(
        "FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DocumentID","FINPostLine_DocumentLineID","FINPostLine_Description",
        "FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID","FINPostLine_Dimension2ID","FINPostLine_JobID"
      ) values (
        v_batch,v_line_no,v_tax_nominal,p_document_id,v_line."FINDocLine_ID",'Tax: '||v_line."FINDocLine_Description",
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

create or replace function public._multideck_finance_post_cash_native(p_cash_id uuid,p_user_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_cash public."FIN_CashTransactions"%rowtype; v_batch uuid; v_period uuid; v_currency text; v_bank uuid; v_control uuid;
  v_amount numeric; v_mode text; v_connection boolean; v_native boolean;
begin
  select * into v_cash from public."FIN_CashTransactions" where "FINCash_ID"=p_cash_id for update;
  if not found then raise exception 'Finance cash transaction not found.' using errcode='P0002'; end if;
  if v_cash."FINCash_NativePostingStatusCode"='posted' and v_cash."FINCash_NativePostingBatchID" is not null then
    return jsonb_build_object('cashId',p_cash_id,'status','posted','postingBatchId',v_cash."FINCash_NativePostingBatchID",'idempotent',true);
  end if;
  if v_cash."FINCash_StatusCode" not in ('approved','submitted') then raise exception 'Only approved cash can be posted to the native ledger.' using errcode='22023'; end if;
  select mirror_mode,active_connection,native_ledger_enabled into v_mode,v_connection,v_native from public._multideck_finance_mirror_state(v_cash."FINCash_LegalEntityID");
  if not v_native then raise exception 'Enable the Multideck native ledger before approval.' using errcode='22023'; end if;
  if v_mode='required' and not v_connection then raise exception 'This legal entity requires an active external accounting mirror before approval.' using errcode='22023'; end if;
  v_currency:=upper((select "LegalEntity_BaseCurrencyCodeSnapshot" from public."cmp_LegalEntities" where "LegalEntity_ID"=v_cash."FINCash_LegalEntityID"));
  if v_currency is null or v_currency!~'^[A-Z]{3}$' then raise exception 'Configure a valid legal-entity base currency before native posting.' using errcode='22023'; end if;
  select public._multideck_finance_resolve_nominal(v_cash."FINCash_LegalEntityID","FINBank_NominalAccountID",'1000') into v_bank
  from public."FIN_BankAccounts" where "FINBank_ID"=v_cash."FINCash_BankAccountID" and "FINBank_LegalEntityID"=v_cash."FINCash_LegalEntityID" and "FINBank_IsActive";
  if v_bank is null then raise exception 'Configure an active native nominal for the selected bank account.' using errcode='22023'; end if;
  v_control:=public._multideck_finance_resolve_nominal(v_cash."FINCash_LegalEntityID",null,case when v_cash."FINCash_TypeCode"='customer_receipt' then '1100' else '2000' end);
  if v_control is null then raise exception 'Configure the matching receivables or payables control nominal before native cash posting.' using errcode='22023'; end if;
  v_amount:=round(abs(v_cash."FINCash_LocalAmount"),4);
  if v_amount<=0 then raise exception 'The approved cash transaction has no native value.' using errcode='22023'; end if;
  v_period:=public._multideck_finance_ensure_period(v_cash."FINCash_LegalEntityID",to_char(v_cash."FINCash_AccountingDate",'YYYYMM'),p_user_id);
  insert into public."FIN_PostingBatches"(
    "FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID",
    "FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy"
  ) values (
    'NATIVE-'||left(coalesce(v_cash."FINCash_Number",p_cash_id::text),60),'posted','FIN_CashTransactions',p_cash_id,v_period,v_cash."FINCash_LegalEntityID",
    v_amount,v_amount,v_currency,now(),p_user_id,p_user_id
  ) returning "FINPostBatch_ID" into v_batch;
  insert into public."FIN_PostingLines"(
    "FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_CashID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot"
  ) values
    (v_batch,1,v_bank,p_cash_id,case when v_cash."FINCash_TypeCode"='customer_receipt' then 'Customer receipt to bank' else 'Supplier payment from bank' end,case when v_cash."FINCash_TypeCode"='customer_receipt' then v_amount else 0 end,case when v_cash."FINCash_TypeCode"='supplier_payment' then v_amount else 0 end,v_currency),
    (v_batch,2,v_control,p_cash_id,case when v_cash."FINCash_TypeCode"='customer_receipt' then 'Trade receivable settlement' else 'Trade payable settlement' end,case when v_cash."FINCash_TypeCode"='supplier_payment' then v_amount else 0 end,case when v_cash."FINCash_TypeCode"='customer_receipt' then v_amount else 0 end,v_currency);
  update public."FIN_CashTransactions" set
    "FINCash_PeriodID"=v_period,"FINCash_NativePostingStatusCode"='posted',"FINCash_NativePostingBatchID"=v_batch,
    "FINCash_NativePostedAt"=now(),"FINCash_NativePostedBy"=p_user_id,"FINCash_PostingStatusCode"='posted',
    "FINCash_ExportStatusCode"=case when v_mode='disabled' or (v_mode='optional' and not v_connection) then 'not_required' else 'queued' end,
    "FINCash_UpdatedAt"=now(),"FINCash_UpdatedBy"=p_user_id
  where "FINCash_ID"=p_cash_id;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON"
  ) values (
    'finance_lifecycle',p_user_id,v_cash."FINCash_LegalEntityID",'multideck-app','finance','public','FIN_CashTransactions',v_cash."FINCash_TypeCode",p_cash_id,
    'post_native_ledger','Cash transaction posted to Multideck ledger',true,1,jsonb_build_object('postingBatchId',v_batch,'debitTotal',v_amount,'creditTotal',v_amount,'currency',v_currency,'externalMirrorMode',v_mode,'externalMirrorQueued',v_connection and v_mode<>'disabled')
  );
  return jsonb_build_object('cashId',p_cash_id,'status','posted','postingBatchId',v_batch,'debitTotal',v_amount,'creditTotal',v_amount,'currency',v_currency);
end; $$;
revoke all on function public._multideck_finance_post_cash_native(uuid,uuid) from public,anon,authenticated;
grant execute on function public._multideck_finance_post_cash_native(uuid,uuid) to service_role;

create or replace function public._multideck_finance_post_approved_document_native()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if new."FINDoc_StatusCode"='approved' and old."FINDoc_StatusCode" is distinct from new."FINDoc_StatusCode" then
    perform public._multideck_finance_post_document_native(new."FINDoc_ID",coalesce(new."FINDoc_UpdatedBy",new."FINDoc_CreatedBy"));
  end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_post_approved_document_native() from public,anon,authenticated;

drop trigger if exists "TR_FIN_Documents_native_posting" on public."FIN_Documents";
create trigger "TR_FIN_Documents_native_posting"
after update of "FINDoc_StatusCode" on public."FIN_Documents"
for each row execute function public._multideck_finance_post_approved_document_native();

create or replace function public._multideck_finance_post_approved_cash_native()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if new."FINCash_StatusCode"='approved' and old."FINCash_StatusCode" is distinct from new."FINCash_StatusCode" then
    perform public._multideck_finance_post_cash_native(new."FINCash_ID",coalesce(new."FINCash_UpdatedBy",new."FINCash_CreatedBy"));
  end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_post_approved_cash_native() from public,anon,authenticated;

drop trigger if exists "TR_FIN_CashTransactions_native_posting" on public."FIN_CashTransactions";
create trigger "TR_FIN_CashTransactions_native_posting"
after update of "FINCash_StatusCode" on public."FIN_CashTransactions"
for each row execute function public._multideck_finance_post_approved_cash_native();

create or replace function public._multideck_finance_guard_native_document()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' and old."FINDoc_NativePostingStatusCode"='posted' then raise exception 'Posted finance documents cannot be deleted; use a controlled credit or reversal.' using errcode='22023'; end if;
  if tg_op='UPDATE' and old."FINDoc_NativePostingStatusCode"='posted' and (
    new."FINDoc_TypeCode" is distinct from old."FINDoc_TypeCode" or new."FINDoc_LegalEntityID" is distinct from old."FINDoc_LegalEntityID" or
    new."FINDoc_PartyOrgID" is distinct from old."FINDoc_PartyOrgID" or new."FINDoc_AccountingDate" is distinct from old."FINDoc_AccountingDate" or
    new."FINDoc_CurrencyCodeSnapshot" is distinct from old."FINDoc_CurrencyCodeSnapshot" or new."FINDoc_ExchangeRate" is distinct from old."FINDoc_ExchangeRate" or
    new."FINDoc_LocalNetAmount" is distinct from old."FINDoc_LocalNetAmount" or new."FINDoc_LocalTaxAmount" is distinct from old."FINDoc_LocalTaxAmount" or
    new."FINDoc_LocalGrossAmount" is distinct from old."FINDoc_LocalGrossAmount" or new."FINDoc_StatusCode" in ('draft','awaiting_approval','rejected')
  ) then raise exception 'Posted finance documents are immutable; use a controlled credit or reversal.' using errcode='22023'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_guard_native_document() from public,anon,authenticated;

drop trigger if exists "TR_FIN_Documents_native_immutable" on public."FIN_Documents";
create trigger "TR_FIN_Documents_native_immutable" before update or delete on public."FIN_Documents"
for each row execute function public._multideck_finance_guard_native_document();

create or replace function public._multideck_finance_guard_native_document_line()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_document uuid;
begin
  if tg_op='DELETE' then v_document:=old."FINDocLine_DocumentID"; else v_document:=new."FINDocLine_DocumentID"; end if;
  if exists(select 1 from public."FIN_Documents" where "FINDoc_ID"=v_document and "FINDoc_NativePostingStatusCode"='posted') then
    raise exception 'Lines on a posted finance document are immutable; use a controlled credit or reversal.' using errcode='22023';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_guard_native_document_line() from public,anon,authenticated;

drop trigger if exists "TR_FIN_DocumentLines_native_immutable" on public."FIN_DocumentLines";
create trigger "TR_FIN_DocumentLines_native_immutable" before insert or update or delete on public."FIN_DocumentLines"
for each row execute function public._multideck_finance_guard_native_document_line();

create or replace function public._multideck_finance_guard_native_cash()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' and old."FINCash_NativePostingStatusCode"='posted' then raise exception 'Posted cash transactions cannot be deleted; use a controlled reversal.' using errcode='22023'; end if;
  if tg_op='UPDATE' and old."FINCash_NativePostingStatusCode"='posted' and (
    new."FINCash_TypeCode" is distinct from old."FINCash_TypeCode" or new."FINCash_LegalEntityID" is distinct from old."FINCash_LegalEntityID" or
    new."FINCash_BankAccountID" is distinct from old."FINCash_BankAccountID" or new."FINCash_PartyOrgID" is distinct from old."FINCash_PartyOrgID" or
    new."FINCash_AccountingDate" is distinct from old."FINCash_AccountingDate" or new."FINCash_CurrencyCodeSnapshot" is distinct from old."FINCash_CurrencyCodeSnapshot" or
    new."FINCash_ExchangeRate" is distinct from old."FINCash_ExchangeRate" or new."FINCash_LocalAmount" is distinct from old."FINCash_LocalAmount" or
    new."FINCash_StatusCode" in ('draft','awaiting_approval','rejected')
  ) then raise exception 'Posted cash transactions are immutable; use a controlled reversal.' using errcode='22023'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_guard_native_cash() from public,anon,authenticated;

drop trigger if exists "TR_FIN_CashTransactions_native_immutable" on public."FIN_CashTransactions";
create trigger "TR_FIN_CashTransactions_native_immutable" before update or delete on public."FIN_CashTransactions"
for each row execute function public._multideck_finance_guard_native_cash();

commit;
