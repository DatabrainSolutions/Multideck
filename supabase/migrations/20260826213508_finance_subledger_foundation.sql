-- Tenant-local finance foundation for provider-neutral AR/AP workflows.
-- Finance configuration is prepared and approved in Multideck, while submitted
-- accounting vouchers remain ERPNext documents. Browser clients never receive
-- provider credentials and have no direct write access to these tables.

begin;

create table if not exists public."FIN_ChartTemplates" (
  "FINChartTemplate_ID" uuid primary key default gen_random_uuid(),
  "FINChartTemplate_Code" varchar(80) not null unique,
  "FINChartTemplate_Name" varchar(180) not null,
  "FINChartTemplate_IndustryCode" varchar(60) not null,
  "FINChartTemplate_Version" integer not null default 1,
  "FINChartTemplate_Description" text,
  "FINChartTemplate_IsActive" boolean not null default true,
  "FINChartTemplate_CreatedAt" timestamptz not null default now(),
  constraint "CK_FIN_ChartTemplates_industry" check ("FINChartTemplate_IndustryCode" in ('generic','freight_forwarding')),
  constraint "CK_FIN_ChartTemplates_version" check ("FINChartTemplate_Version" > 0)
);

create table if not exists public."FIN_ChartTemplateAccounts" (
  "FINChartTemplateAccount_ID" uuid primary key default gen_random_uuid(),
  "FINChartTemplateAccount_TemplateID" uuid not null references public."FIN_ChartTemplates"("FINChartTemplate_ID") on delete cascade,
  "FINChartTemplateAccount_Code" varchar(80) not null,
  "FINChartTemplateAccount_Name" varchar(180) not null,
  "FINChartTemplateAccount_TypeCode" varchar(60) not null,
  "FINChartTemplateAccount_CategoryCode" varchar(40) not null,
  "FINChartTemplateAccount_IsControlAccount" boolean not null default false,
  "FINChartTemplateAccount_Required" boolean not null default true,
  "FINChartTemplateAccount_SortOrder" integer not null default 100,
  constraint "UX_FIN_ChartTemplateAccounts_code" unique ("FINChartTemplateAccount_TemplateID", "FINChartTemplateAccount_Code"),
  constraint "CK_FIN_ChartTemplateAccounts_category" check ("FINChartTemplateAccount_CategoryCode" in ('asset','liability','equity','income','direct_cost','expense','finance')),
  constraint "CK_FIN_ChartTemplateAccounts_range" check ("FINChartTemplateAccount_Code" ~ '^[1-7][0-9]{3}$')
);

create table if not exists public."FIN_LocalisationTaxTreatments" (
  "FINLocTaxTreatment_ID" uuid primary key default gen_random_uuid(),
  "FINLocTaxTreatment_PackID" uuid references public."FIN_LocalisationPacks"("FINLocPack_ID") on delete cascade,
  "FINLocTaxTreatment_Code" varchar(80) not null,
  "FINLocTaxTreatment_Name" varchar(160) not null,
  "FINLocTaxTreatment_TransactionType" varchar(20) not null,
  "FINLocTaxTreatment_CategoryCode" varchar(80) not null,
  "FINLocTaxTreatment_RatePercent" numeric(9,6) not null default 0,
  "FINLocTaxTreatment_IsRecoverable" boolean not null default true,
  "FINLocTaxTreatment_EffectiveFrom" date not null default current_date,
  "FINLocTaxTreatment_EffectiveTo" date,
  "FINLocTaxTreatment_IsActive" boolean not null default true,
  constraint "CK_FIN_LocTaxTreatments_transaction" check ("FINLocTaxTreatment_TransactionType" in ('sales','purchase','both')),
  constraint "CK_FIN_LocTaxTreatments_rate" check ("FINLocTaxTreatment_RatePercent" >= 0 and "FINLocTaxTreatment_RatePercent" <= 100),
  constraint "CK_FIN_LocTaxTreatments_dates" check ("FINLocTaxTreatment_EffectiveTo" is null or "FINLocTaxTreatment_EffectiveTo" >= "FINLocTaxTreatment_EffectiveFrom"),
  constraint "UX_FIN_LocTaxTreatments_code" unique ("FINLocTaxTreatment_PackID", "FINLocTaxTreatment_Code", "FINLocTaxTreatment_TransactionType", "FINLocTaxTreatment_EffectiveFrom")
);

create table if not exists public."FIN_ConfigurationRuns" (
  "FINConfigRun_ID" uuid primary key default gen_random_uuid(),
  "FINConfigRun_LegalEntityID" uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete cascade,
  "FINConfigRun_ChartTemplateID" uuid not null references public."FIN_ChartTemplates"("FINChartTemplate_ID"),
  "FINConfigRun_LocalisationPackID" uuid references public."FIN_LocalisationPacks"("FINLocPack_ID"),
  "FINConfigRun_ProviderCode" varchar(40) not null default 'erpnext',
  "FINConfigRun_ExternalCompany" varchar(180) not null,
  "FINConfigRun_StatusCode" varchar(40) not null default 'draft',
  "FINConfigRun_CountryCode" varchar(2) not null,
  "FINConfigRun_TaxRegistrationNo" varchar(120),
  "FINConfigRun_ReportingBasisCode" varchar(80),
  "FINConfigRun_EffectiveFrom" date not null default current_date,
  "FINConfigRun_PreviewJSON" jsonb not null default '{}'::jsonb,
  "FINConfigRun_ProvisioningJSON" jsonb not null default '{}'::jsonb,
  "FINConfigRun_IdempotencyKey" uuid not null default gen_random_uuid(),
  "FINConfigRun_RequestedAt" timestamptz not null default now(),
  "FINConfigRun_RequestedBy" uuid references public."cmp_Users"("User_ID"),
  "FINConfigRun_ApprovedAt" timestamptz,
  "FINConfigRun_ApprovedBy" uuid references public."cmp_Users"("User_ID"),
  "FINConfigRun_CompletedAt" timestamptz,
  "FINConfigRun_ErrorMessage" text,
  constraint "CK_FIN_ConfigurationRuns_status" check ("FINConfigRun_StatusCode" in ('draft','awaiting_approval','approved','provisioning','completed','failed','rejected')),
  constraint "CK_FIN_ConfigurationRuns_provider" check ("FINConfigRun_ProviderCode" in ('erpnext','xero','quickbooks_online','sage_accounting','sage_intacct','sage_50','sage_200','business_central','netsuite','zoho_books')),
  constraint "CK_FIN_ConfigurationRuns_country" check ("FINConfigRun_CountryCode" ~ '^[A-Z]{2}$'),
  constraint "CK_FIN_ConfigurationRuns_preview" check (jsonb_typeof("FINConfigRun_PreviewJSON") = 'object'),
  constraint "CK_FIN_ConfigurationRuns_provisioning" check (jsonb_typeof("FINConfigRun_ProvisioningJSON") = 'object')
);
create unique index if not exists "UX_FIN_ConfigurationRuns_idempotency" on public."FIN_ConfigurationRuns"("FINConfigRun_IdempotencyKey");
create index if not exists "IX_FIN_ConfigurationRuns_legal_entity_status" on public."FIN_ConfigurationRuns"("FINConfigRun_LegalEntityID", "FINConfigRun_StatusCode", "FINConfigRun_RequestedAt" desc);

create table if not exists public."FIN_ConfigurationRunEvents" (
  "FINConfigRunEvent_ID" uuid primary key default gen_random_uuid(),
  "FINConfigRunEvent_RunID" uuid not null references public."FIN_ConfigurationRuns"("FINConfigRun_ID") on delete cascade,
  "FINConfigRunEvent_TypeCode" varchar(60) not null,
  "FINConfigRunEvent_At" timestamptz not null default now(),
  "FINConfigRunEvent_By" uuid references public."cmp_Users"("User_ID"),
  "FINConfigRunEvent_DetailJSON" jsonb not null default '{}'::jsonb,
  constraint "CK_FIN_ConfigurationRunEvents_detail" check (jsonb_typeof("FINConfigRunEvent_DetailJSON") = 'object')
);

alter table public."FIN_ChartTemplates" enable row level security;
alter table public."FIN_ChartTemplateAccounts" enable row level security;
alter table public."FIN_LocalisationTaxTreatments" enable row level security;
alter table public."FIN_ConfigurationRuns" enable row level security;
alter table public."FIN_ConfigurationRunEvents" enable row level security;
revoke all on public."FIN_ChartTemplates", public."FIN_ChartTemplateAccounts", public."FIN_LocalisationTaxTreatments", public."FIN_ConfigurationRuns", public."FIN_ConfigurationRunEvents" from public, anon, authenticated;
grant select, insert, update, delete on public."FIN_ChartTemplates", public."FIN_ChartTemplateAccounts", public."FIN_LocalisationTaxTreatments", public."FIN_ConfigurationRuns", public."FIN_ConfigurationRunEvents" to service_role;

insert into public."FIN_ChartTemplates" ("FINChartTemplate_Code", "FINChartTemplate_Name", "FINChartTemplate_IndustryCode", "FINChartTemplate_Version", "FINChartTemplate_Description") values
  ('generic-v1', 'Generic business chart of accounts', 'generic', 1, 'A compact double-entry starter chart with AR/AP, tax, bank, foreign exchange and retained earnings controls.'),
  ('freight-forwarder-v1', 'Freight forwarder chart of accounts', 'freight_forwarding', 1, 'Generic chart plus transport-mode income and direct-cost accounts for freight forwarding.')
on conflict ("FINChartTemplate_Code") do update set
  "FINChartTemplate_Name" = excluded."FINChartTemplate_Name",
  "FINChartTemplate_Description" = excluded."FINChartTemplate_Description",
  "FINChartTemplate_IsActive" = true;

with template_accounts(template_code, code, name, account_type, category, is_control, required, sort_order) as (
  values
    ('generic-v1','1000','Bank and cash','Bank','asset',true,true,10),
    ('generic-v1','1100','Trade receivables','Receivable','asset',true,true,20),
    ('generic-v1','1200','Recoverable input tax','Tax','asset',true,true,30),
    ('generic-v1','1300','Prepayments and deposits','Current Asset','asset',false,false,40),
    ('generic-v1','1500','Fixed assets','Fixed Asset','asset',false,false,50),
    ('generic-v1','2000','Trade payables','Payable','liability',true,true,60),
    ('generic-v1','2100','Output tax payable','Tax','liability',true,true,70),
    ('generic-v1','2200','Non-recoverable tax payable','Tax','liability',true,false,80),
    ('generic-v1','2300','Accruals and deferred income','Current Liability','liability',false,false,90),
    ('generic-v1','3000','Share capital','Equity','equity',false,false,100),
    ('generic-v1','3100','Retained earnings','Equity','equity',true,true,110),
    ('generic-v1','4000','Sales income','Income Account','income',false,true,120),
    ('generic-v1','4100','Service and handling income','Income Account','income',false,false,130),
    ('generic-v1','5000','Direct cost of sales','Cost of Goods Sold','direct_cost',false,true,140),
    ('generic-v1','6000','People and operating expenses','Expense Account','expense',false,true,150),
    ('generic-v1','6100','Occupancy and technology expenses','Expense Account','expense',false,false,160),
    ('generic-v1','7000','Foreign exchange gain or loss','Income Account','finance',true,true,170),
    ('generic-v1','7100','Finance and exceptional items','Expense Account','finance',false,false,180),
    ('freight-forwarder-v1','1000','Bank and cash','Bank','asset',true,true,10),
    ('freight-forwarder-v1','1100','Trade receivables','Receivable','asset',true,true,20),
    ('freight-forwarder-v1','1200','Recoverable input tax','Tax','asset',true,true,30),
    ('freight-forwarder-v1','1300','Prepayments and carrier deposits','Current Asset','asset',false,false,40),
    ('freight-forwarder-v1','1500','Fixed assets','Fixed Asset','asset',false,false,50),
    ('freight-forwarder-v1','2000','Trade payables','Payable','liability',true,true,60),
    ('freight-forwarder-v1','2100','Output tax payable','Tax','liability',true,true,70),
    ('freight-forwarder-v1','2200','Non-recoverable tax payable','Tax','liability',true,false,80),
    ('freight-forwarder-v1','2300','Accruals and deferred income','Current Liability','liability',false,false,90),
    ('freight-forwarder-v1','3000','Share capital','Equity','equity',false,false,100),
    ('freight-forwarder-v1','3100','Retained earnings','Equity','equity',true,true,110),
    ('freight-forwarder-v1','4000','Air freight income','Income Account','income',false,true,120),
    ('freight-forwarder-v1','4010','Sea freight income','Income Account','income',false,true,121),
    ('freight-forwarder-v1','4020','Road freight income','Income Account','income',false,true,122),
    ('freight-forwarder-v1','4030','Rail freight income','Income Account','income',false,false,123),
    ('freight-forwarder-v1','4040','Customs brokerage income','Income Account','income',false,false,124),
    ('freight-forwarder-v1','4050','Warehousing and handling income','Income Account','income',false,false,125),
    ('freight-forwarder-v1','4060','Documentation, insurance and other income','Income Account','income',false,false,126),
    ('freight-forwarder-v1','5000','Air freight direct costs','Cost of Goods Sold','direct_cost',false,true,140),
    ('freight-forwarder-v1','5010','Sea freight direct costs','Cost of Goods Sold','direct_cost',false,true,141),
    ('freight-forwarder-v1','5020','Road freight direct costs','Cost of Goods Sold','direct_cost',false,true,142),
    ('freight-forwarder-v1','5030','Rail freight direct costs','Cost of Goods Sold','direct_cost',false,false,143),
    ('freight-forwarder-v1','5040','Customs duties and brokerage costs','Cost of Goods Sold','direct_cost',false,false,144),
    ('freight-forwarder-v1','5050','Warehousing and handling costs','Cost of Goods Sold','direct_cost',false,false,145),
    ('freight-forwarder-v1','5060','Agency commissions, detention and claims','Cost of Goods Sold','direct_cost',false,false,146),
    ('freight-forwarder-v1','6000','People and operating expenses','Expense Account','expense',false,true,150),
    ('freight-forwarder-v1','6100','Occupancy and technology expenses','Expense Account','expense',false,false,160),
    ('freight-forwarder-v1','7000','Foreign exchange gain or loss','Income Account','finance',true,true,170),
    ('freight-forwarder-v1','7100','Finance and exceptional items','Expense Account','finance',false,false,180)
)
insert into public."FIN_ChartTemplateAccounts" (
  "FINChartTemplateAccount_TemplateID", "FINChartTemplateAccount_Code", "FINChartTemplateAccount_Name", "FINChartTemplateAccount_TypeCode", "FINChartTemplateAccount_CategoryCode", "FINChartTemplateAccount_IsControlAccount", "FINChartTemplateAccount_Required", "FINChartTemplateAccount_SortOrder"
)
select template."FINChartTemplate_ID", item.code, item.name, item.account_type, item.category, item.is_control, item.required, item.sort_order
from template_accounts item
join public."FIN_ChartTemplates" template on template."FINChartTemplate_Code" = item.template_code
on conflict ("FINChartTemplateAccount_TemplateID", "FINChartTemplateAccount_Code") do update set
  "FINChartTemplateAccount_Name" = excluded."FINChartTemplateAccount_Name",
  "FINChartTemplateAccount_TypeCode" = excluded."FINChartTemplateAccount_TypeCode",
  "FINChartTemplateAccount_CategoryCode" = excluded."FINChartTemplateAccount_CategoryCode",
  "FINChartTemplateAccount_IsControlAccount" = excluded."FINChartTemplateAccount_IsControlAccount",
  "FINChartTemplateAccount_Required" = excluded."FINChartTemplateAccount_Required",
  "FINChartTemplateAccount_SortOrder" = excluded."FINChartTemplateAccount_SortOrder";

insert into public."FIN_LocalisationPacks" ("FINLocPack_Code", "FINLocPack_Name", "FINLocPack_CountryCode", "FINLocPack_AccountingStandardCode", "FINLocPack_IsActive") values
  ('global-v1', 'Global tax treatment framework', null, 'IFRS-ready', true)
on conflict ("FINLocPack_Code") do update set
  "FINLocPack_Name" = excluded."FINLocPack_Name", "FINLocPack_IsActive" = true;

with treatments(code, name, transaction_type, category, rate, recoverable) as (
  values
    ('domestic-standard','Domestic standard','both','domestic_standard',0::numeric,true),
    ('reduced-rate','Reduced rate','both','reduced_rate',0::numeric,true),
    ('zero-rated','Zero rated','both','zero_rated',0::numeric,true),
    ('exempt','Exempt','both','exempt',0::numeric,false),
    ('export','Export','sales','export',0::numeric,true),
    ('reverse-charge','Reverse charge','both','reverse_charge',0::numeric,true),
    ('out-of-scope','Out of scope','both','out_of_scope',0::numeric,false)
)
insert into public."FIN_LocalisationTaxTreatments" (
  "FINLocTaxTreatment_PackID", "FINLocTaxTreatment_Code", "FINLocTaxTreatment_Name", "FINLocTaxTreatment_TransactionType", "FINLocTaxTreatment_CategoryCode", "FINLocTaxTreatment_RatePercent", "FINLocTaxTreatment_IsRecoverable", "FINLocTaxTreatment_EffectiveFrom"
)
select pack."FINLocPack_ID", item.code, item.name, item.transaction_type, item.category, item.rate, item.recoverable, date '2000-01-01'
from treatments item
join public."FIN_LocalisationPacks" pack on pack."FINLocPack_Code" = 'global-v1'
on conflict ("FINLocTaxTreatment_PackID", "FINLocTaxTreatment_Code", "FINLocTaxTreatment_TransactionType", "FINLocTaxTreatment_EffectiveFrom") do update set
  "FINLocTaxTreatment_Name" = excluded."FINLocTaxTreatment_Name",
  "FINLocTaxTreatment_CategoryCode" = excluded."FINLocTaxTreatment_CategoryCode",
  "FINLocTaxTreatment_IsRecoverable" = excluded."FINLocTaxTreatment_IsRecoverable",
  "FINLocTaxTreatment_IsActive" = true;

-- These rows are product lookup configuration, not tenant financial data. They
-- make the new workflow self-contained when it is installed on a freshly
-- provisioned tenant as well as on an established project.
insert into public."sys_AccountingProviders" ("ACCP_Code", "ACCP_Name", "ACCP_Description", "ACCP_IsCloud", "ACCP_RequiresLocalAgent", "ACCP_DefaultAuthType", "ACCP_SortOrder", "ACCP_IsActive") values
  ('erpnext', 'ERPNext', 'ERPNext REST API integration. The default enabled Multideck accounting connector.', true, false, 'api_token', 10, true),
  ('xero', 'Xero', 'Xero Accounting API connector.', true, false, 'oauth2', 20, true),
  ('quickbooks_online', 'QuickBooks Online', 'QuickBooks Online accounting API connector.', true, false, 'oauth2', 30, true),
  ('sage_accounting', 'Sage Accounting', 'Sage cloud accounting API connector.', true, false, 'oauth2', 40, true),
  ('sage_intacct', 'Sage Intacct', 'Sage Intacct REST and webhook connector.', true, false, 'oauth2', 50, true),
  ('sage_50', 'Sage 50 Desktop', 'Sage 50 connector via an installed, tenant-local Windows agent.', false, true, 'local_agent', 60, true),
  ('sage_200', 'Sage 200', 'Sage 200 connector via an installed, tenant-local Windows agent.', false, true, 'local_agent', 70, true),
  ('business_central', 'Dynamics 365 Business Central', 'Microsoft Dynamics 365 Business Central OData connector.', true, false, 'oauth2', 80, true),
  ('netsuite', 'Oracle NetSuite', 'Oracle NetSuite SuiteTalk REST connector.', true, false, 'oauth2', 90, true),
  ('zoho_books', 'Zoho Books', 'Zoho Books accounting connector.', true, false, 'oauth2', 100, true)
on conflict ("ACCP_Code") do update set
  "ACCP_Name" = excluded."ACCP_Name", "ACCP_Description" = excluded."ACCP_Description", "ACCP_IsCloud" = excluded."ACCP_IsCloud", "ACCP_RequiresLocalAgent" = excluded."ACCP_RequiresLocalAgent", "ACCP_DefaultAuthType" = excluded."ACCP_DefaultAuthType", "ACCP_SortOrder" = excluded."ACCP_SortOrder", "ACCP_IsActive" = true;

insert into public."sys_FinanceDocumentTypes" ("FINDT_Code", "FINDT_Name", "FINDT_Description", "FINDT_LedgerTypeCode", "FINDT_IsCredit", "FINDT_SortOrder", "FINDT_IsActive") values
  ('sl_invoice', 'Sales invoice', 'Customer receivable invoice.', 'receivables', false, 10, true),
  ('credit_note', 'Customer credit note', 'Customer receivable credit note.', 'receivables', true, 20, true),
  ('pl_invoice', 'Purchase invoice', 'Supplier payable invoice.', 'payables', false, 30, true),
  ('debit_note', 'Supplier credit note', 'Supplier payable credit note.', 'payables', true, 40, true)
on conflict ("FINDT_Code") do update set
  "FINDT_Name" = excluded."FINDT_Name", "FINDT_Description" = excluded."FINDT_Description", "FINDT_LedgerTypeCode" = excluded."FINDT_LedgerTypeCode", "FINDT_IsCredit" = excluded."FINDT_IsCredit", "FINDT_SortOrder" = excluded."FINDT_SortOrder", "FINDT_IsActive" = true;

insert into public."sys_FinanceDocumentStatuses" ("FINDST_Code", "FINDST_Name", "FINDST_Description", "FINDST_IsFinal", "FINDST_SortOrder", "FINDST_IsActive") values
  ('draft', 'Draft', 'Prepared in Multideck and not yet sent for finance review.', false, 10, true),
  ('awaiting_approval', 'Awaiting approval', 'Waiting for an authorised finance reviewer.', false, 20, true),
  ('approved', 'Approved', 'Approved for controlled provider submission.', false, 30, true),
  ('submitted', 'Submitted', 'Submitted to the accounting provider.', true, 40, true),
  ('rejected', 'Rejected', 'Rejected by the finance review workflow.', true, 50, true),
  ('failed', 'Submission failed', 'Provider submission failed and requires finance attention.', false, 60, true)
on conflict ("FINDST_Code") do update set
  "FINDST_Name" = excluded."FINDST_Name", "FINDST_Description" = excluded."FINDST_Description", "FINDST_IsFinal" = excluded."FINDST_IsFinal", "FINDST_SortOrder" = excluded."FINDST_SortOrder", "FINDST_IsActive" = true;

insert into public."sys_FinanceAuthorityActionTypes" ("FINAUTHA_Code", "FINAUTHA_Name", "FINAUTHA_Description", "FINAUTHA_SortOrder", "FINAUTHA_IsActive") values
  ('finance_post', 'Finance posting', 'Approve a reviewed finance document for controlled accounting-provider submission.', 30, true)
on conflict ("FINAUTHA_Code") do update set
  "FINAUTHA_Name" = excluded."FINAUTHA_Name", "FINAUTHA_Description" = excluded."FINAUTHA_Description", "FINAUTHA_SortOrder" = excluded."FINAUTHA_SortOrder", "FINAUTHA_IsActive" = true;

insert into public."sys_Permissions" ("sys_Permission_Value", "sys_Permission_Group", "sys_Permission_Name", "sys_Permission_Description", "sys_Permission_IsDangerous") values
  ('Finance.Receivables.View','Finance','View receivables','View customer invoices, credits, balances and receipts.',false),
  ('Finance.Receivables.Draft','Finance','Prepare receivables','Prepare customer invoice and credit-note drafts for finance review.',false),
  ('Finance.Payables.View','Finance','View payables','View supplier invoices, credit notes, balances and payments.',false),
  ('Finance.Payables.Draft','Finance','Prepare payables','Prepare supplier invoice and credit-note drafts for finance review.',false),
  ('Finance.ReviewAndPost','Finance','Review and post finance','Approve and submit reviewed accounting documents to the configured provider.',true),
  ('Finance.Banks.Manage','Finance','Manage bank accounts','Prepare and approve company bank-account setup.',true),
  ('Finance.Configuration.Manage','Finance','Manage finance configuration','Prepare and approve chart, localisation and tax configuration.',true)
on conflict ("sys_Permission_Value") do update set
  "sys_Permission_Group" = excluded."sys_Permission_Group",
  "sys_Permission_Name" = excluded."sys_Permission_Name",
  "sys_Permission_Description" = excluded."sys_Permission_Description",
  "sys_Permission_IsDangerous" = excluded."sys_Permission_IsDangerous";

with role_permissions(role_name, permission_value) as (
  values
    ('Administrator','Finance.Receivables.View'), ('Administrator','Finance.Receivables.Draft'), ('Administrator','Finance.Payables.View'), ('Administrator','Finance.Payables.Draft'), ('Administrator','Finance.ReviewAndPost'), ('Administrator','Finance.Banks.Manage'), ('Administrator','Finance.Configuration.Manage'),
    ('Finance manager','Finance.Receivables.View'), ('Finance manager','Finance.Receivables.Draft'), ('Finance manager','Finance.Payables.View'), ('Finance manager','Finance.Payables.Draft'), ('Finance manager','Finance.ReviewAndPost'), ('Finance manager','Finance.Banks.Manage'), ('Finance manager','Finance.Configuration.Manage'),
    ('Operations manager','Finance.Receivables.View'), ('Operations manager','Finance.Receivables.Draft'), ('Operations manager','Finance.Payables.View'), ('Operations manager','Finance.Payables.Draft'),
    ('Operator','Finance.Receivables.View'), ('Operator','Finance.Receivables.Draft'), ('Operator','Finance.Payables.View'), ('Operator','Finance.Payables.Draft')
)
insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from role_permissions mapping
join public."sys_UserRoles" role on lower(role."sys_UserRole_Name") = lower(mapping.role_name)
join public."sys_Permissions" permission on permission."sys_Permission_Value" = mapping.permission_value
on conflict do nothing;

create or replace function public.multideck_dexter_domain_finance(p_company_id uuid, p_search text, p_take integer)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(result.value order by result.updated_at desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'recordId', document."FINDoc_ID", 'number', document."FINDoc_Number", 'type', document."FINDoc_TypeCode", 'status', document."FINDoc_StatusCode",
      'party', organisation."Org_Name", 'currency', document."FINDoc_CurrencyCodeSnapshot", 'grossAmount', document."FINDoc_GrossAmount", 'outstandingAmount', document."FINDoc_OutstandingAmount", 'dueDate', document."FINDoc_DueDate",
      'evidence', jsonb_build_object('sourceTable','FIN_Documents','sourceId',document."FINDoc_ID")
    ) as value, document."FINDoc_UpdatedAt" as updated_at
    from public."FIN_Documents" document
    left join public."Org_Master" organisation on organisation."Org_id" = document."FINDoc_PartyOrgID"
    left join public."cmp_LegalEntities" entity on entity."LegalEntity_ID" = document."FINDoc_LegalEntityID"
    where entity."Company_ID" = p_company_id
      and (nullif(btrim(p_search),'') is null or concat_ws(' ', document."FINDoc_Number", document."FINDoc_TypeCode", document."FINDoc_StatusCode", organisation."Org_Name") ilike '%' || btrim(p_search) || '%')
    order by document."FINDoc_UpdatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) result;
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid, text, integer) from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" ("AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description", "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive", "AIDexterDomain_UpdatedAt") values
  ('finance','Finance','Tenant-safe AR/AP documents, outstanding balances, due dates and accounting evidence.','multideck_dexter_domain_finance',26,true,now())
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name", "AIDexterDomain_Description" = excluded."AIDexterDomain_Description", "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction", "AIDexterDomain_IsActive" = true, "AIDexterDomain_UpdatedAt" = now();

insert into public."sys_AIDexterWatchCapabilities" ("AIDexterWatchCapability_Code", "AIDexterWatchCapability_Name", "AIDexterWatchCapability_Description", "AIDexterWatchCapability_FieldsJSON", "AIDexterWatchCapability_SortOrder") values
  ('finance','Finance','Finance document status, due date, outstanding balance and provider-sync changes.','["status","dueDate","outstandingAmount","postingStatus","exportStatus"]'::jsonb,26)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name", "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description", "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON", "AIDexterWatchCapability_IsActive" = true, "AIDexterWatchCapability_UpdatedAt" = now();

commit;
