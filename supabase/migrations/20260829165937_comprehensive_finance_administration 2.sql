-- Comprehensive, legal-entity-scoped finance administration.
--
-- Multideck is authoritative for approved operational finance settings. The
-- accounting provider remains the ledger of record for submitted vouchers.
-- This migration deliberately stores only masked bank identifiers and keeps
-- all configuration writes behind the protected finance Edge Function.

begin;

alter table public."FIN_CurrencySettings"
  add column if not exists "FINCurSet_LegalEntityID" uuid references public."cmp_LegalEntities"("LegalEntity_ID") on delete cascade,
  add column if not exists "FINCurSet_IsBaseCurrency" boolean not null default false,
  add column if not exists "FINCurSet_CreatedAt" timestamptz not null default now(),
  add column if not exists "FINCurSet_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINCurSet_UpdatedAt" timestamptz not null default now(),
  add column if not exists "FINCurSet_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

alter table public."FIN_BankAccounts"
  add column if not exists "FINBank_InstitutionName" varchar(180),
  add column if not exists "FINBank_AccountHolderName" varchar(180),
  add column if not exists "FINBank_BICMasked" varchar(40),
  add column if not exists "FINBank_CountryCode" varchar(2),
  add column if not exists "FINBank_IsDefault" boolean not null default false,
  add column if not exists "FINBank_AllowReceipts" boolean not null default true,
  add column if not exists "FINBank_AllowPayments" boolean not null default true,
  add column if not exists "FINBank_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINBank_UpdatedAt" timestamptz not null default now(),
  add column if not exists "FINBank_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

alter table public."FIN_NominalAccounts"
  add column if not exists "FINNom_ControlTypeCode" varchar(60),
  add column if not exists "FINNom_AllowManualPosting" boolean not null default true,
  add column if not exists "FINNom_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINNom_UpdatedAt" timestamptz not null default now(),
  add column if not exists "FINNom_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

alter table public."FIN_TaxJurisdictions"
  add column if not exists "FINTaxJur_LegalEntityID" uuid references public."cmp_LegalEntities"("LegalEntity_ID") on delete cascade,
  add column if not exists "FINTaxJur_RegistrationNo" varchar(120),
  add column if not exists "FINTaxJur_EffectiveFrom" date not null default current_date,
  add column if not exists "FINTaxJur_EffectiveTo" date,
  add column if not exists "FINTaxJur_SettingsJSON" jsonb not null default '{}'::jsonb,
  add column if not exists "FINTaxJur_CreatedAt" timestamptz not null default now(),
  add column if not exists "FINTaxJur_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINTaxJur_UpdatedAt" timestamptz not null default now(),
  add column if not exists "FINTaxJur_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

alter table public."FIN_TaxCodes"
  add column if not exists "FINTax_LegalEntityID" uuid references public."cmp_LegalEntities"("LegalEntity_ID") on delete cascade,
  add column if not exists "FINTax_JurisdictionID" uuid references public."FIN_TaxJurisdictions"("FINTaxJur_ID") on delete set null,
  add column if not exists "FINTax_TreatmentCategoryCode" varchar(80) not null default 'out_of_scope',
  add column if not exists "FINTax_TransactionTypeCode" varchar(20) not null default 'both',
  add column if not exists "FINTax_OutputNominalID" uuid references public."FIN_NominalAccounts"("FINNom_ID") on delete set null,
  add column if not exists "FINTax_InputNominalID" uuid references public."FIN_NominalAccounts"("FINNom_ID") on delete set null,
  add column if not exists "FINTax_SettingsJSON" jsonb not null default '{}'::jsonb,
  add column if not exists "FINTax_ApprovedAt" timestamptz,
  add column if not exists "FINTax_ApprovedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINTax_CreatedAt" timestamptz not null default now(),
  add column if not exists "FINTax_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINTax_UpdatedAt" timestamptz not null default now(),
  add column if not exists "FINTax_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

alter table public."FIN_NumberSequences"
  add column if not exists "FINSeq_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINSeq_UpdatedAt" timestamptz not null default now(),
  add column if not exists "FINSeq_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

alter table public."FIN_PaymentTerms"
  add column if not exists "FINTerm_LegalEntityID" uuid references public."cmp_LegalEntities"("LegalEntity_ID") on delete cascade,
  add column if not exists "FINTerm_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINTerm_UpdatedAt" timestamptz not null default now(),
  add column if not exists "FINTerm_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

alter table public."FIN_LocalisationSettings"
  add column if not exists "FINLocSet_EffectiveFrom" date not null default current_date,
  add column if not exists "FINLocSet_UpdatedAt" timestamptz not null default now(),
  add column if not exists "FINLocSet_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

alter table public."FIN_BankAccounts" drop constraint if exists "FIN_BankAccounts_unique_code";
alter table public."FIN_CurrencySettings" drop constraint if exists "FIN_CurrencySettings_unique_currency";
alter table public."FIN_NumberSequences" drop constraint if exists "FIN_NumberSequences_unique_code";
alter table public."FIN_PaymentTerms" drop constraint if exists "FIN_PaymentTerms_unique_code";
alter table public."FIN_TaxCodes" drop constraint if exists "FIN_TaxCodes_unique_code";
alter table public."FIN_TaxJurisdictions" drop constraint if exists "FIN_TaxJurisdictions_unique_code";

create unique index if not exists "UX_FIN_BankAccounts_entity_code" on public."FIN_BankAccounts"("FINBank_LegalEntityID", "FINBank_Code") where "FINBank_LegalEntityID" is not null;
create unique index if not exists "UX_FIN_BankAccounts_entity_default_currency" on public."FIN_BankAccounts"("FINBank_LegalEntityID", "FINBank_CurrencyCode") where "FINBank_LegalEntityID" is not null and "FINBank_IsDefault" and "FINBank_IsActive";
create unique index if not exists "UX_FIN_CurrencySettings_entity_currency" on public."FIN_CurrencySettings"("FINCurSet_LegalEntityID", "FINCurSet_CurrencyCode") where "FINCurSet_LegalEntityID" is not null;
create unique index if not exists "UX_FIN_CurrencySettings_global_currency" on public."FIN_CurrencySettings"("FINCurSet_CurrencyCode") where "FINCurSet_LegalEntityID" is null;
create unique index if not exists "UX_FIN_CurrencySettings_entity_base" on public."FIN_CurrencySettings"("FINCurSet_LegalEntityID") where "FINCurSet_LegalEntityID" is not null and "FINCurSet_IsBaseCurrency" and "FINCurSet_IsActive";
create unique index if not exists "UX_FIN_NumberSequences_entity_code" on public."FIN_NumberSequences"("FINSeq_LegalEntityID", "FINSeq_Code") where "FINSeq_LegalEntityID" is not null;
create unique index if not exists "UX_FIN_PaymentTerms_entity_code" on public."FIN_PaymentTerms"("FINTerm_LegalEntityID", "FINTerm_Code") where "FINTerm_LegalEntityID" is not null;
create unique index if not exists "UX_FIN_PaymentTerms_global_code" on public."FIN_PaymentTerms"("FINTerm_Code") where "FINTerm_LegalEntityID" is null;
create unique index if not exists "UX_FIN_TaxCodes_entity_code_date" on public."FIN_TaxCodes"("FINTax_LegalEntityID", "FINTax_Code", "FINTax_EffectiveFrom") where "FINTax_LegalEntityID" is not null;
create unique index if not exists "UX_FIN_TaxCodes_global_code_date" on public."FIN_TaxCodes"("FINTax_Code", "FINTax_EffectiveFrom") where "FINTax_LegalEntityID" is null;
create unique index if not exists "UX_FIN_TaxJurisdictions_entity_code" on public."FIN_TaxJurisdictions"("FINTaxJur_LegalEntityID", "FINTaxJur_Code") where "FINTaxJur_LegalEntityID" is not null;
create unique index if not exists "UX_FIN_TaxJurisdictions_global_code" on public."FIN_TaxJurisdictions"("FINTaxJur_Code") where "FINTaxJur_LegalEntityID" is null;
create unique index if not exists "UX_FIN_Settings_entity_default" on public."FIN_Settings"("FINSET_LegalEntityID") where "FINSET_LegalEntityID" is not null and "FINSET_OrgOfficeID" is null and "FINSET_BrandID" is null;
create unique index if not exists "UX_FIN_LocalisationSettings_entity_active" on public."FIN_LocalisationSettings"("FINLocSet_LegalEntityID") where "FINLocSet_LegalEntityID" is not null and "FINLocSet_IsActive";

alter table public."FIN_BankAccounts" drop constraint if exists "CK_FIN_BankAccounts_country";
alter table public."FIN_BankAccounts" add constraint "CK_FIN_BankAccounts_country" check ("FINBank_CountryCode" is null or "FINBank_CountryCode" ~ '^[A-Z]{2}$') not valid;
alter table public."FIN_TaxJurisdictions" drop constraint if exists "CK_FIN_TaxJurisdictions_dates";
alter table public."FIN_TaxJurisdictions" add constraint "CK_FIN_TaxJurisdictions_dates" check ("FINTaxJur_EffectiveTo" is null or "FINTaxJur_EffectiveTo" >= "FINTaxJur_EffectiveFrom") not valid;
alter table public."FIN_TaxCodes" drop constraint if exists "CK_FIN_TaxCodes_transaction_type";
alter table public."FIN_TaxCodes" add constraint "CK_FIN_TaxCodes_transaction_type" check ("FINTax_TransactionTypeCode" in ('sales','purchase','both')) not valid;
alter table public."FIN_TaxCodes" drop constraint if exists "CK_FIN_TaxCodes_rate";
alter table public."FIN_TaxCodes" add constraint "CK_FIN_TaxCodes_rate" check ("FINTax_RatePercent" >= 0 and "FINTax_RatePercent" <= 100) not valid;

create table if not exists public."FIN_AdministrationRevisions" (
  "FINAdminRevision_ID" uuid primary key default gen_random_uuid(),
  "FINAdminRevision_LegalEntityID" uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete cascade,
  "FINAdminRevision_Number" integer not null,
  "FINAdminRevision_StatusCode" varchar(40) not null default 'approved',
  "FINAdminRevision_ConfigJSON" jsonb not null default '{}'::jsonb,
  "FINAdminRevision_ReadinessJSON" jsonb not null default '{}'::jsonb,
  "FINAdminRevision_Reason" text,
  "FINAdminRevision_ApprovedAt" timestamptz not null default now(),
  "FINAdminRevision_ApprovedBy" uuid not null references public."cmp_Users"("User_ID"),
  constraint "UX_FIN_AdministrationRevisions_number" unique ("FINAdminRevision_LegalEntityID", "FINAdminRevision_Number"),
  constraint "CK_FIN_AdministrationRevisions_status" check ("FINAdminRevision_StatusCode" in ('approved','superseded')),
  constraint "CK_FIN_AdministrationRevisions_config" check (jsonb_typeof("FINAdminRevision_ConfigJSON") = 'object'),
  constraint "CK_FIN_AdministrationRevisions_readiness" check (jsonb_typeof("FINAdminRevision_ReadinessJSON") = 'object')
);
create index if not exists "IX_FIN_AdministrationRevisions_entity_approved" on public."FIN_AdministrationRevisions"("FINAdminRevision_LegalEntityID", "FINAdminRevision_ApprovedAt" desc);

alter table public."FIN_AdministrationRevisions" enable row level security;
revoke all on public."FIN_AdministrationRevisions" from public, anon, authenticated;
grant select, insert, update on public."FIN_AdministrationRevisions" to service_role;

-- Existing finance configuration tables were part of the original broad
-- baseline grants. Configuration is now exposed only by a permission-checked
-- Edge Function using the tenant-local service role.
revoke all on public."FIN_Settings", public."FIN_LocalisationSettings", public."FIN_CurrencySettings", public."FIN_BankAccounts", public."FIN_NominalAccounts", public."FIN_TaxCodes", public."FIN_TaxJurisdictions", public."FIN_NumberSequences", public."FIN_PaymentTerms", public."ACCI_AccountMappings", public."ACCI_ChargeCodeMappings", public."ACCI_TaxCodeMappings" from public, anon, authenticated;
grant select, insert, update, delete on public."FIN_Settings", public."FIN_LocalisationSettings", public."FIN_CurrencySettings", public."FIN_BankAccounts", public."FIN_NominalAccounts", public."FIN_TaxCodes", public."FIN_TaxJurisdictions", public."FIN_NumberSequences", public."FIN_PaymentTerms", public."ACCI_AccountMappings", public."ACCI_ChargeCodeMappings", public."ACCI_TaxCodeMappings" to service_role;

create or replace function public.multideck_finance_save_administration(
  p_company_id uuid,
  p_user_id uuid,
  p_legal_entity_id uuid,
  p_settings jsonb,
  p_reason text default null
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_entity public."cmp_LegalEntities";
  v_item jsonb;
  v_id uuid;
  v_pack_id uuid;
  v_settings_id uuid;
  v_localisation_id uuid;
  v_connection_id uuid;
  v_base_currency text;
  v_country text;
  v_code text;
  v_revision integer;
  v_missing text[] := array[]::text[];
  v_row_count integer;
  v_control_count integer;
  v_active_banks integer;
  v_active_currencies integer;
  v_active_taxes integer;
  v_active_sequences integer;
begin
  if jsonb_typeof(coalesce(p_settings,'{}'::jsonb)) <> 'object' then
    raise exception 'Finance settings must be an object.' using errcode='22023';
  end if;
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then
    raise exception 'The finance operator is outside this workspace.' using errcode='42501';
  end if;
  select * into v_entity from public."cmp_LegalEntities" where "LegalEntity_ID"=p_legal_entity_id and "Company_ID"=p_company_id and "LegalEntity_IsActive" for update;
  if not found then raise exception 'That legal entity is outside this workspace.' using errcode='42501'; end if;

  v_base_currency := upper(nullif(btrim(p_settings#>>'{organisation,baseCurrencyCode}'),''));
  v_country := upper(nullif(btrim(p_settings#>>'{organisation,countryCode}'),''));
  if v_base_currency is null or v_base_currency !~ '^[A-Z]{3}$' then raise exception 'Enter a valid three-letter base currency.' using errcode='22023'; end if;
  if v_country is null or v_country !~ '^[A-Z]{2}$' or not exists(select 1 from public."RefCountry" where upper("RN_Code")=v_country and coalesce("RN_IsActive",true)) then raise exception 'Choose a valid legal-entity country.' using errcode='22023'; end if;

  foreach v_code in array array['currencies','banks','nominalAccounts','taxJurisdictions','taxCodes','numberSequences','paymentTerms','accountMappings','chargeMappings','taxMappings'] loop
    if p_settings ? v_code and jsonb_typeof(p_settings->v_code) <> 'array' then raise exception 'Finance setting % must be a list.',v_code using errcode='22023'; end if;
    if jsonb_array_length(coalesce(p_settings->v_code,'[]'::jsonb)) > 500 then raise exception 'Finance setting % has too many rows.',v_code using errcode='22023'; end if;
  end loop;

  update public."cmp_LegalEntities" set
    "LegalEntity_CountryCode"=v_country,
    "LegalEntity_BaseCurrencyCodeSnapshot"=v_base_currency,
    "LegalEntity_VATNumber"=nullif(btrim(p_settings#>>'{organisation,taxRegistrationNo}'),''),
    "LegalEntity_SettingsJSON"="LegalEntity_SettingsJSON" || jsonb_build_object('financeAdministration',jsonb_build_object(
      'accountingStandardCode',coalesce(nullif(btrim(p_settings#>>'{organisation,accountingStandardCode}'),''),'IFRS'),
      'fiscalYearStartMonth',greatest(1,least(12,coalesce((p_settings#>>'{organisation,fiscalYearStartMonth}')::integer,1))),
      'timeZone',coalesce(nullif(btrim(p_settings#>>'{organisation,timeZone}'),''),'Europe/London'),
      'updatedAt',now()
    )),
    "LegalEntity_UpdatedAt"=now(),"LegalEntity_UpdatedBy"=p_user_id
  where "LegalEntity_ID"=p_legal_entity_id;

  select "FINSET_ID" into v_settings_id from public."FIN_Settings" where "FINSET_LegalEntityID"=p_legal_entity_id and "FINSET_OrgOfficeID" is null and "FINSET_BrandID" is null for update;
  if v_settings_id is null then
    insert into public."FIN_Settings"(
      "FINSET_LegalEntityID","FINSET_BaseCurrencyCode","FINSET_DefaultOperatingModelCode","FINSET_AutoCreateSalesInvoices","FINSET_AutoCreatePurchaseAccruals","FINSET_AutoPostLowRiskItems","FINSET_UseAccountingDateRules","FINSET_BlockLockedPeriodDirectPosting","FINSET_DefaultROEProviderCode","FINSET_IncludeFXInOperationalProfit","FINSET_SettingsJSON","FINSET_CreatedBy","FINSET_UpdatedBy"
    ) values (
      p_legal_entity_id,v_base_currency,coalesce(nullif(p_settings#>>'{controls,defaultOperatingModelCode}',''),'hybrid'),
      coalesce((p_settings#>>'{controls,autoCreateSalesInvoices}')::boolean,false),coalesce((p_settings#>>'{controls,autoCreatePurchaseAccruals}')::boolean,true),coalesce((p_settings#>>'{controls,autoPostLowRiskItems}')::boolean,false),coalesce((p_settings#>>'{controls,useAccountingDateRules}')::boolean,true),coalesce((p_settings#>>'{controls,blockLockedPeriodDirectPosting}')::boolean,true),nullif(btrim(p_settings#>>'{controls,defaultRoeProviderCode}'),''),coalesce((p_settings#>>'{controls,includeFxInOperationalProfit}')::boolean,false),
      jsonb_build_object('administration',coalesce(p_settings->'controls','{}'::jsonb),'defaults',coalesce(p_settings->'defaults','{}'::jsonb),'updatedAt',now()),p_user_id,p_user_id
    ) returning "FINSET_ID" into v_settings_id;
  else
    update public."FIN_Settings" set
      "FINSET_BaseCurrencyCode"=v_base_currency,
      "FINSET_DefaultOperatingModelCode"=coalesce(nullif(p_settings#>>'{controls,defaultOperatingModelCode}',''),'hybrid'),
      "FINSET_AutoCreateSalesInvoices"=coalesce((p_settings#>>'{controls,autoCreateSalesInvoices}')::boolean,false),
      "FINSET_AutoCreatePurchaseAccruals"=coalesce((p_settings#>>'{controls,autoCreatePurchaseAccruals}')::boolean,true),
      "FINSET_AutoPostLowRiskItems"=coalesce((p_settings#>>'{controls,autoPostLowRiskItems}')::boolean,false),
      "FINSET_UseAccountingDateRules"=coalesce((p_settings#>>'{controls,useAccountingDateRules}')::boolean,true),
      "FINSET_BlockLockedPeriodDirectPosting"=coalesce((p_settings#>>'{controls,blockLockedPeriodDirectPosting}')::boolean,true),
      "FINSET_DefaultROEProviderCode"=nullif(btrim(p_settings#>>'{controls,defaultRoeProviderCode}'),''),
      "FINSET_IncludeFXInOperationalProfit"=coalesce((p_settings#>>'{controls,includeFxInOperationalProfit}')::boolean,false),
      "FINSET_SettingsJSON"="FINSET_SettingsJSON" || jsonb_build_object('administration',coalesce(p_settings->'controls','{}'::jsonb),'defaults',coalesce(p_settings->'defaults','{}'::jsonb),'updatedAt',now()),
      "FINSET_UpdatedAt"=now(),"FINSET_UpdatedBy"=p_user_id
    where "FINSET_ID"=v_settings_id;
  end if;

  select "FINLocPack_ID" into v_pack_id from public."FIN_LocalisationPacks" where "FINLocPack_Code"=coalesce(nullif(p_settings#>>'{organisation,localisationPackCode}',''),'global-v1') and "FINLocPack_IsActive" limit 1;
  if v_pack_id is null then raise exception 'Choose an active finance localisation pack.' using errcode='22023'; end if;
  select "FINLocSet_ID" into v_localisation_id from public."FIN_LocalisationSettings" where "FINLocSet_LegalEntityID"=p_legal_entity_id and "FINLocSet_IsActive" for update;
  if v_localisation_id is null then
    insert into public."FIN_LocalisationSettings"("FINLocSet_LegalEntityID","FINLocSet_PackID","FINLocSet_TaxRegistrationNo","FINLocSet_ReportingBasisCode","FINLocSet_SettingsJSON","FINLocSet_EffectiveFrom","FINLocSet_UpdatedBy")
    values(p_legal_entity_id,v_pack_id,nullif(btrim(p_settings#>>'{organisation,taxRegistrationNo}'),''),coalesce(nullif(btrim(p_settings#>>'{organisation,reportingBasisCode}'),''),'accrual'),coalesce(p_settings->'taxSettings','{}'::jsonb),coalesce((p_settings#>>'{organisation,effectiveFrom}')::date,current_date),p_user_id)
    returning "FINLocSet_ID" into v_localisation_id;
  else
    update public."FIN_LocalisationSettings" set "FINLocSet_PackID"=v_pack_id,"FINLocSet_TaxRegistrationNo"=nullif(btrim(p_settings#>>'{organisation,taxRegistrationNo}'),''),"FINLocSet_ReportingBasisCode"=coalesce(nullif(btrim(p_settings#>>'{organisation,reportingBasisCode}'),''),'accrual'),"FINLocSet_SettingsJSON"=coalesce(p_settings->'taxSettings','{}'::jsonb),"FINLocSet_EffectiveFrom"=coalesce((p_settings#>>'{organisation,effectiveFrom}')::date,current_date),"FINLocSet_UpdatedAt"=now(),"FINLocSet_UpdatedBy"=p_user_id where "FINLocSet_ID"=v_localisation_id;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_settings->'currencies','[]'::jsonb)) loop
    v_code:=upper(nullif(btrim(v_item->>'code'),''));
    if v_code is null or v_code !~ '^[A-Z]{3}$' then raise exception 'Every operating currency needs a valid ISO code.' using errcode='22023'; end if;
    v_id:=nullif(v_item->>'id','')::uuid;
    if v_id is null then
      insert into public."FIN_CurrencySettings"("FINCurSet_LegalEntityID","FINCurSet_CurrencyCode","FINCurSet_Name","FINCurSet_DecimalPlaces","FINCurSet_RoundingMethodCode","FINCurSet_ToleranceAmount","FINCurSet_IsPermittedForQuote","FINCurSet_IsPermittedForInvoice","FINCurSet_IsBaseCurrency","FINCurSet_IsActive","FINCurSet_CreatedBy","FINCurSet_UpdatedBy")
      values(p_legal_entity_id,v_code,coalesce(nullif(btrim(v_item->>'name'),''),v_code),greatest(0,least(6,coalesce((v_item->>'decimalPlaces')::integer,2))),coalesce(nullif(v_item->>'roundingMethodCode',''),'round_half_up'),greatest(0,coalesce((v_item->>'toleranceAmount')::numeric,0)),coalesce((v_item->>'permittedForQuote')::boolean,true),coalesce((v_item->>'permittedForInvoice')::boolean,true),v_code=v_base_currency,coalesce((v_item->>'isActive')::boolean,true),p_user_id,p_user_id)
      on conflict ("FINCurSet_LegalEntityID","FINCurSet_CurrencyCode") where "FINCurSet_LegalEntityID" is not null do update set "FINCurSet_Name"=excluded."FINCurSet_Name","FINCurSet_DecimalPlaces"=excluded."FINCurSet_DecimalPlaces","FINCurSet_RoundingMethodCode"=excluded."FINCurSet_RoundingMethodCode","FINCurSet_ToleranceAmount"=excluded."FINCurSet_ToleranceAmount","FINCurSet_IsPermittedForQuote"=excluded."FINCurSet_IsPermittedForQuote","FINCurSet_IsPermittedForInvoice"=excluded."FINCurSet_IsPermittedForInvoice","FINCurSet_IsBaseCurrency"=excluded."FINCurSet_IsBaseCurrency","FINCurSet_IsActive"=excluded."FINCurSet_IsActive","FINCurSet_UpdatedAt"=now(),"FINCurSet_UpdatedBy"=p_user_id;
    else
      update public."FIN_CurrencySettings" set "FINCurSet_CurrencyCode"=v_code,"FINCurSet_Name"=coalesce(nullif(btrim(v_item->>'name'),''),v_code),"FINCurSet_DecimalPlaces"=greatest(0,least(6,coalesce((v_item->>'decimalPlaces')::integer,2))),"FINCurSet_RoundingMethodCode"=coalesce(nullif(v_item->>'roundingMethodCode',''),'round_half_up'),"FINCurSet_ToleranceAmount"=greatest(0,coalesce((v_item->>'toleranceAmount')::numeric,0)),"FINCurSet_IsPermittedForQuote"=coalesce((v_item->>'permittedForQuote')::boolean,true),"FINCurSet_IsPermittedForInvoice"=coalesce((v_item->>'permittedForInvoice')::boolean,true),"FINCurSet_IsBaseCurrency"=v_code=v_base_currency,"FINCurSet_IsActive"=coalesce((v_item->>'isActive')::boolean,true),"FINCurSet_UpdatedAt"=now(),"FINCurSet_UpdatedBy"=p_user_id where "FINCurSet_ID"=v_id and "FINCurSet_LegalEntityID"=p_legal_entity_id;
      get diagnostics v_row_count=row_count; if v_row_count=0 then raise exception 'An operating currency is outside this legal entity.' using errcode='42501'; end if;
    end if;
  end loop;
  if not exists(select 1 from public."FIN_CurrencySettings" where "FINCurSet_LegalEntityID"=p_legal_entity_id and "FINCurSet_CurrencyCode"=v_base_currency and "FINCurSet_IsActive") then
    insert into public."FIN_CurrencySettings"("FINCurSet_LegalEntityID","FINCurSet_CurrencyCode","FINCurSet_Name","FINCurSet_IsBaseCurrency","FINCurSet_IsActive","FINCurSet_CreatedBy","FINCurSet_UpdatedBy") values(p_legal_entity_id,v_base_currency,v_base_currency,true,true,p_user_id,p_user_id)
    on conflict ("FINCurSet_LegalEntityID","FINCurSet_CurrencyCode") where "FINCurSet_LegalEntityID" is not null do update set "FINCurSet_IsBaseCurrency"=true,"FINCurSet_IsActive"=true,"FINCurSet_UpdatedAt"=now(),"FINCurSet_UpdatedBy"=p_user_id;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_settings->'nominalAccounts','[]'::jsonb)) loop
    v_code:=nullif(btrim(v_item->>'code'),'');
    if v_code is null then raise exception 'Every nominal account needs a code.' using errcode='22023'; end if;
    v_id:=nullif(v_item->>'id','')::uuid;
    if v_id is null then
      insert into public."FIN_NominalAccounts"("FINNom_Code","FINNom_Name","FINNom_AccountTypeCode","FINNom_LegalEntityID","FINNom_ExternalMappingHint","FINNom_IsControlAccount","FINNom_ControlTypeCode","FINNom_AllowManualPosting","FINNom_IsActive","FINNom_CreatedBy","FINNom_UpdatedBy")
      values(v_code,coalesce(nullif(btrim(v_item->>'name'),''),v_code),coalesce(nullif(btrim(v_item->>'accountTypeCode'),''),'Expense Account'),p_legal_entity_id,nullif(btrim(v_item->>'externalMappingHint'),''),coalesce((v_item->>'isControlAccount')::boolean,false),nullif(btrim(v_item->>'controlTypeCode'),''),coalesce((v_item->>'allowManualPosting')::boolean,true),coalesce((v_item->>'isActive')::boolean,true),p_user_id,p_user_id)
      on conflict ("FINNom_LegalEntityID","FINNom_Code") do update set "FINNom_Name"=excluded."FINNom_Name","FINNom_AccountTypeCode"=excluded."FINNom_AccountTypeCode","FINNom_ExternalMappingHint"=excluded."FINNom_ExternalMappingHint","FINNom_IsControlAccount"=excluded."FINNom_IsControlAccount","FINNom_ControlTypeCode"=excluded."FINNom_ControlTypeCode","FINNom_AllowManualPosting"=excluded."FINNom_AllowManualPosting","FINNom_IsActive"=excluded."FINNom_IsActive","FINNom_UpdatedAt"=now(),"FINNom_UpdatedBy"=p_user_id;
    else
      update public."FIN_NominalAccounts" set "FINNom_Code"=v_code,"FINNom_Name"=coalesce(nullif(btrim(v_item->>'name'),''),v_code),"FINNom_AccountTypeCode"=coalesce(nullif(btrim(v_item->>'accountTypeCode'),''),'Expense Account'),"FINNom_ExternalMappingHint"=nullif(btrim(v_item->>'externalMappingHint'),''),"FINNom_IsControlAccount"=coalesce((v_item->>'isControlAccount')::boolean,false),"FINNom_ControlTypeCode"=nullif(btrim(v_item->>'controlTypeCode'),''),"FINNom_AllowManualPosting"=coalesce((v_item->>'allowManualPosting')::boolean,true),"FINNom_IsActive"=coalesce((v_item->>'isActive')::boolean,true),"FINNom_UpdatedAt"=now(),"FINNom_UpdatedBy"=p_user_id where "FINNom_ID"=v_id and "FINNom_LegalEntityID"=p_legal_entity_id;
      get diagnostics v_row_count=row_count; if v_row_count=0 then raise exception 'A nominal account is outside this legal entity.' using errcode='42501'; end if;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_settings->'banks','[]'::jsonb)) loop
    v_code:=nullif(btrim(v_item->>'code'),'');
    if v_code is null then raise exception 'Every bank account needs a code.' using errcode='22023'; end if;
    if upper(coalesce(v_item->>'currencyCode','')) !~ '^[A-Z]{3}$' then raise exception 'Every bank account needs a valid currency.' using errcode='22023'; end if;
    v_id:=nullif(v_item->>'id','')::uuid;
    if v_id is null then
      insert into public."FIN_BankAccounts"("FINBank_Code","FINBank_Name","FINBank_LegalEntityID","FINBank_CurrencyCode","FINBank_InstitutionName","FINBank_AccountHolderName","FINBank_AccountNumberMasked","FINBank_IBANMasked","FINBank_SortCodeMasked","FINBank_BICMasked","FINBank_CountryCode","FINBank_NominalAccountID","FINBank_IsDefault","FINBank_AllowReceipts","FINBank_AllowPayments","FINBank_IsActive","FINBank_CreatedBy","FINBank_UpdatedBy")
      values(v_code,coalesce(nullif(btrim(v_item->>'name'),''),v_code),p_legal_entity_id,upper(v_item->>'currencyCode'),nullif(btrim(v_item->>'institutionName'),''),nullif(btrim(v_item->>'accountHolderName'),''),case when nullif(regexp_replace(coalesce(v_item->>'accountNumberLast4',''),'[^A-Za-z0-9]','','g'),'') is null then null else '•••• '||right(regexp_replace(v_item->>'accountNumberLast4','[^A-Za-z0-9]','','g'),4) end,case when nullif(regexp_replace(coalesce(v_item->>'ibanLast4',''),'[^A-Za-z0-9]','','g'),'') is null then null else '•••• '||upper(right(regexp_replace(v_item->>'ibanLast4','[^A-Za-z0-9]','','g'),4)) end,case when nullif(regexp_replace(coalesce(v_item->>'sortCodeLast4',''),'[^0-9]','','g'),'') is null then null else '•••• '||right(regexp_replace(v_item->>'sortCodeLast4','[^0-9]','','g'),4) end,case when nullif(regexp_replace(coalesce(v_item->>'bicLast4',''),'[^A-Za-z0-9]','','g'),'') is null then null else '•••• '||upper(right(regexp_replace(v_item->>'bicLast4','[^A-Za-z0-9]','','g'),4)) end,upper(nullif(btrim(v_item->>'countryCode'),'')),nullif(v_item->>'nominalAccountId','')::uuid,coalesce((v_item->>'isDefault')::boolean,false),coalesce((v_item->>'allowReceipts')::boolean,true),coalesce((v_item->>'allowPayments')::boolean,true),coalesce((v_item->>'isActive')::boolean,true),p_user_id,p_user_id)
      on conflict ("FINBank_LegalEntityID","FINBank_Code") where "FINBank_LegalEntityID" is not null do update set "FINBank_Name"=excluded."FINBank_Name","FINBank_CurrencyCode"=excluded."FINBank_CurrencyCode","FINBank_InstitutionName"=excluded."FINBank_InstitutionName","FINBank_AccountHolderName"=excluded."FINBank_AccountHolderName","FINBank_AccountNumberMasked"=coalesce(excluded."FINBank_AccountNumberMasked",public."FIN_BankAccounts"."FINBank_AccountNumberMasked"),"FINBank_IBANMasked"=coalesce(excluded."FINBank_IBANMasked",public."FIN_BankAccounts"."FINBank_IBANMasked"),"FINBank_SortCodeMasked"=coalesce(excluded."FINBank_SortCodeMasked",public."FIN_BankAccounts"."FINBank_SortCodeMasked"),"FINBank_BICMasked"=coalesce(excluded."FINBank_BICMasked",public."FIN_BankAccounts"."FINBank_BICMasked"),"FINBank_CountryCode"=excluded."FINBank_CountryCode","FINBank_NominalAccountID"=excluded."FINBank_NominalAccountID","FINBank_IsDefault"=excluded."FINBank_IsDefault","FINBank_AllowReceipts"=excluded."FINBank_AllowReceipts","FINBank_AllowPayments"=excluded."FINBank_AllowPayments","FINBank_IsActive"=excluded."FINBank_IsActive","FINBank_UpdatedAt"=now(),"FINBank_UpdatedBy"=p_user_id;
    else
      update public."FIN_BankAccounts" set "FINBank_Code"=v_code,"FINBank_Name"=coalesce(nullif(btrim(v_item->>'name'),''),v_code),"FINBank_CurrencyCode"=upper(v_item->>'currencyCode'),"FINBank_InstitutionName"=nullif(btrim(v_item->>'institutionName'),''),"FINBank_AccountHolderName"=nullif(btrim(v_item->>'accountHolderName'),''),"FINBank_AccountNumberMasked"=coalesce(case when nullif(regexp_replace(coalesce(v_item->>'accountNumberLast4',''),'[^A-Za-z0-9]','','g'),'') is null then null else '•••• '||right(regexp_replace(v_item->>'accountNumberLast4','[^A-Za-z0-9]','','g'),4) end,"FINBank_AccountNumberMasked"),"FINBank_IBANMasked"=coalesce(case when nullif(regexp_replace(coalesce(v_item->>'ibanLast4',''),'[^A-Za-z0-9]','','g'),'') is null then null else '•••• '||upper(right(regexp_replace(v_item->>'ibanLast4','[^A-Za-z0-9]','','g'),4)) end,"FINBank_IBANMasked"),"FINBank_SortCodeMasked"=coalesce(case when nullif(regexp_replace(coalesce(v_item->>'sortCodeLast4',''),'[^0-9]','','g'),'') is null then null else '•••• '||right(regexp_replace(v_item->>'sortCodeLast4','[^0-9]','','g'),4) end,"FINBank_SortCodeMasked"),"FINBank_BICMasked"=coalesce(case when nullif(regexp_replace(coalesce(v_item->>'bicLast4',''),'[^A-Za-z0-9]','','g'),'') is null then null else '•••• '||upper(right(regexp_replace(v_item->>'bicLast4','[^A-Za-z0-9]','','g'),4)) end,"FINBank_BICMasked"),"FINBank_CountryCode"=upper(nullif(btrim(v_item->>'countryCode'),'')),"FINBank_NominalAccountID"=nullif(v_item->>'nominalAccountId','')::uuid,"FINBank_IsDefault"=coalesce((v_item->>'isDefault')::boolean,false),"FINBank_AllowReceipts"=coalesce((v_item->>'allowReceipts')::boolean,true),"FINBank_AllowPayments"=coalesce((v_item->>'allowPayments')::boolean,true),"FINBank_IsActive"=coalesce((v_item->>'isActive')::boolean,true),"FINBank_UpdatedAt"=now(),"FINBank_UpdatedBy"=p_user_id where "FINBank_ID"=v_id and "FINBank_LegalEntityID"=p_legal_entity_id;
      get diagnostics v_row_count=row_count; if v_row_count=0 then raise exception 'A bank account is outside this legal entity.' using errcode='42501'; end if;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_settings->'taxJurisdictions','[]'::jsonb)) loop
    v_code:=nullif(btrim(v_item->>'code'),''); if v_code is null then raise exception 'Every tax jurisdiction needs a code.' using errcode='22023'; end if;
    v_id:=nullif(v_item->>'id','')::uuid;
    if v_id is null then
      insert into public."FIN_TaxJurisdictions"("FINTaxJur_Code","FINTaxJur_Name","FINTaxJur_CountryCode","FINTaxJur_AuthorityName","FINTaxJur_LegalEntityID","FINTaxJur_RegistrationNo","FINTaxJur_EffectiveFrom","FINTaxJur_EffectiveTo","FINTaxJur_SettingsJSON","FINTaxJur_IsActive","FINTaxJur_CreatedBy","FINTaxJur_UpdatedBy")
      values(v_code,coalesce(nullif(btrim(v_item->>'name'),''),v_code),upper(coalesce(nullif(btrim(v_item->>'countryCode'),''),v_country)),nullif(btrim(v_item->>'authorityName'),''),p_legal_entity_id,nullif(btrim(v_item->>'registrationNo'),''),coalesce((v_item->>'effectiveFrom')::date,current_date),nullif(v_item->>'effectiveTo','')::date,coalesce(v_item->'settings','{}'::jsonb),coalesce((v_item->>'isActive')::boolean,true),p_user_id,p_user_id)
      on conflict ("FINTaxJur_LegalEntityID","FINTaxJur_Code") where "FINTaxJur_LegalEntityID" is not null do update set "FINTaxJur_Name"=excluded."FINTaxJur_Name","FINTaxJur_CountryCode"=excluded."FINTaxJur_CountryCode","FINTaxJur_AuthorityName"=excluded."FINTaxJur_AuthorityName","FINTaxJur_RegistrationNo"=excluded."FINTaxJur_RegistrationNo","FINTaxJur_EffectiveFrom"=excluded."FINTaxJur_EffectiveFrom","FINTaxJur_EffectiveTo"=excluded."FINTaxJur_EffectiveTo","FINTaxJur_SettingsJSON"=excluded."FINTaxJur_SettingsJSON","FINTaxJur_IsActive"=excluded."FINTaxJur_IsActive","FINTaxJur_UpdatedAt"=now(),"FINTaxJur_UpdatedBy"=p_user_id;
    else
      update public."FIN_TaxJurisdictions" set "FINTaxJur_Code"=v_code,"FINTaxJur_Name"=coalesce(nullif(btrim(v_item->>'name'),''),v_code),"FINTaxJur_CountryCode"=upper(coalesce(nullif(btrim(v_item->>'countryCode'),''),v_country)),"FINTaxJur_AuthorityName"=nullif(btrim(v_item->>'authorityName'),''),"FINTaxJur_RegistrationNo"=nullif(btrim(v_item->>'registrationNo'),''),"FINTaxJur_EffectiveFrom"=coalesce((v_item->>'effectiveFrom')::date,current_date),"FINTaxJur_EffectiveTo"=nullif(v_item->>'effectiveTo','')::date,"FINTaxJur_SettingsJSON"=coalesce(v_item->'settings','{}'::jsonb),"FINTaxJur_IsActive"=coalesce((v_item->>'isActive')::boolean,true),"FINTaxJur_UpdatedAt"=now(),"FINTaxJur_UpdatedBy"=p_user_id where "FINTaxJur_ID"=v_id and "FINTaxJur_LegalEntityID"=p_legal_entity_id;
      get diagnostics v_row_count=row_count; if v_row_count=0 then raise exception 'A tax jurisdiction is outside this legal entity.' using errcode='42501'; end if;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_settings->'taxCodes','[]'::jsonb)) loop
    v_code:=nullif(btrim(v_item->>'code'),''); if v_code is null then raise exception 'Every tax treatment needs a code.' using errcode='22023'; end if;
    if coalesce((v_item->>'ratePercent')::numeric,0) < 0 or coalesce((v_item->>'ratePercent')::numeric,0) > 100 then raise exception 'Tax rates must be between 0 and 100.' using errcode='22023'; end if;
    v_id:=nullif(v_item->>'id','')::uuid;
    if v_id is null then
      insert into public."FIN_TaxCodes"("FINTax_Code","FINTax_Name","FINTax_CountryCode","FINTax_RatePercent","FINTax_TaxTypeCode","FINTax_ProviderMappingHint","FINTax_IsRecoverable","FINTax_IsActive","FINTax_EffectiveFrom","FINTax_EffectiveTo","FINTax_LegalEntityID","FINTax_JurisdictionID","FINTax_TreatmentCategoryCode","FINTax_TransactionTypeCode","FINTax_OutputNominalID","FINTax_InputNominalID","FINTax_SettingsJSON","FINTax_ApprovedAt","FINTax_ApprovedBy","FINTax_CreatedBy","FINTax_UpdatedBy")
      values(v_code,coalesce(nullif(btrim(v_item->>'name'),''),v_code),upper(coalesce(nullif(btrim(v_item->>'countryCode'),''),v_country)),coalesce((v_item->>'ratePercent')::numeric,0),coalesce(nullif(btrim(v_item->>'taxTypeCode'),''),'vat'),nullif(btrim(v_item->>'providerMappingHint'),''),coalesce((v_item->>'isRecoverable')::boolean,true),coalesce((v_item->>'isActive')::boolean,true),coalesce((v_item->>'effectiveFrom')::date,current_date),nullif(v_item->>'effectiveTo','')::date,p_legal_entity_id,nullif(v_item->>'jurisdictionId','')::uuid,coalesce(nullif(btrim(v_item->>'treatmentCategoryCode'),''),'out_of_scope'),coalesce(nullif(btrim(v_item->>'transactionTypeCode'),''),'both'),nullif(v_item->>'outputNominalId','')::uuid,nullif(v_item->>'inputNominalId','')::uuid,coalesce(v_item->'settings','{}'::jsonb),now(),p_user_id,p_user_id,p_user_id)
      on conflict ("FINTax_LegalEntityID","FINTax_Code","FINTax_EffectiveFrom") where "FINTax_LegalEntityID" is not null do update set "FINTax_Name"=excluded."FINTax_Name","FINTax_CountryCode"=excluded."FINTax_CountryCode","FINTax_RatePercent"=excluded."FINTax_RatePercent","FINTax_TaxTypeCode"=excluded."FINTax_TaxTypeCode","FINTax_ProviderMappingHint"=excluded."FINTax_ProviderMappingHint","FINTax_IsRecoverable"=excluded."FINTax_IsRecoverable","FINTax_IsActive"=excluded."FINTax_IsActive","FINTax_EffectiveTo"=excluded."FINTax_EffectiveTo","FINTax_JurisdictionID"=excluded."FINTax_JurisdictionID","FINTax_TreatmentCategoryCode"=excluded."FINTax_TreatmentCategoryCode","FINTax_TransactionTypeCode"=excluded."FINTax_TransactionTypeCode","FINTax_OutputNominalID"=excluded."FINTax_OutputNominalID","FINTax_InputNominalID"=excluded."FINTax_InputNominalID","FINTax_SettingsJSON"=excluded."FINTax_SettingsJSON","FINTax_ApprovedAt"=now(),"FINTax_ApprovedBy"=p_user_id,"FINTax_UpdatedAt"=now(),"FINTax_UpdatedBy"=p_user_id;
    else
      update public."FIN_TaxCodes" set "FINTax_Code"=v_code,"FINTax_Name"=coalesce(nullif(btrim(v_item->>'name'),''),v_code),"FINTax_CountryCode"=upper(coalesce(nullif(btrim(v_item->>'countryCode'),''),v_country)),"FINTax_RatePercent"=coalesce((v_item->>'ratePercent')::numeric,0),"FINTax_TaxTypeCode"=coalesce(nullif(btrim(v_item->>'taxTypeCode'),''),'vat'),"FINTax_ProviderMappingHint"=nullif(btrim(v_item->>'providerMappingHint'),''),"FINTax_IsRecoverable"=coalesce((v_item->>'isRecoverable')::boolean,true),"FINTax_IsActive"=coalesce((v_item->>'isActive')::boolean,true),"FINTax_EffectiveFrom"=coalesce((v_item->>'effectiveFrom')::date,current_date),"FINTax_EffectiveTo"=nullif(v_item->>'effectiveTo','')::date,"FINTax_JurisdictionID"=nullif(v_item->>'jurisdictionId','')::uuid,"FINTax_TreatmentCategoryCode"=coalesce(nullif(btrim(v_item->>'treatmentCategoryCode'),''),'out_of_scope'),"FINTax_TransactionTypeCode"=coalesce(nullif(btrim(v_item->>'transactionTypeCode'),''),'both'),"FINTax_OutputNominalID"=nullif(v_item->>'outputNominalId','')::uuid,"FINTax_InputNominalID"=nullif(v_item->>'inputNominalId','')::uuid,"FINTax_SettingsJSON"=coalesce(v_item->'settings','{}'::jsonb),"FINTax_ApprovedAt"=now(),"FINTax_ApprovedBy"=p_user_id,"FINTax_UpdatedAt"=now(),"FINTax_UpdatedBy"=p_user_id where "FINTax_ID"=v_id and "FINTax_LegalEntityID"=p_legal_entity_id;
      get diagnostics v_row_count=row_count; if v_row_count=0 then raise exception 'A tax treatment is outside this legal entity.' using errcode='42501'; end if;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_settings->'numberSequences','[]'::jsonb)) loop
    v_code:=nullif(btrim(v_item->>'code'),''); if v_code is null then raise exception 'Every document sequence needs a code.' using errcode='22023'; end if;
    v_id:=nullif(v_item->>'id','')::uuid;
    if v_id is null then
      insert into public."FIN_NumberSequences"("FINSeq_Code","FINSeq_Name","FINSeq_LegalEntityID","FINSeq_DocumentTypeCode","FINSeq_Prefix","FINSeq_Suffix","FINSeq_NextNumber","FINSeq_PaddingLength","FINSeq_ResetPeriodCode","FINSeq_IsActive","FINSeq_CreatedBy","FINSeq_UpdatedBy")
      values(v_code,coalesce(nullif(btrim(v_item->>'name'),''),v_code),p_legal_entity_id,nullif(btrim(v_item->>'documentTypeCode'),''),coalesce(v_item->>'prefix',''),coalesce(v_item->>'suffix',''),greatest(1,coalesce((v_item->>'nextNumber')::bigint,1)),greatest(1,least(12,coalesce((v_item->>'paddingLength')::integer,6))),coalesce(nullif(v_item->>'resetPeriodCode',''),'never'),coalesce((v_item->>'isActive')::boolean,true),p_user_id,p_user_id)
      on conflict ("FINSeq_LegalEntityID","FINSeq_Code") where "FINSeq_LegalEntityID" is not null do update set "FINSeq_Name"=excluded."FINSeq_Name","FINSeq_DocumentTypeCode"=excluded."FINSeq_DocumentTypeCode","FINSeq_Prefix"=excluded."FINSeq_Prefix","FINSeq_Suffix"=excluded."FINSeq_Suffix","FINSeq_NextNumber"=greatest(public."FIN_NumberSequences"."FINSeq_NextNumber",excluded."FINSeq_NextNumber"),"FINSeq_PaddingLength"=excluded."FINSeq_PaddingLength","FINSeq_ResetPeriodCode"=excluded."FINSeq_ResetPeriodCode","FINSeq_IsActive"=excluded."FINSeq_IsActive","FINSeq_UpdatedAt"=now(),"FINSeq_UpdatedBy"=p_user_id;
    else
      update public."FIN_NumberSequences" set "FINSeq_Code"=v_code,"FINSeq_Name"=coalesce(nullif(btrim(v_item->>'name'),''),v_code),"FINSeq_DocumentTypeCode"=nullif(btrim(v_item->>'documentTypeCode'),''),"FINSeq_Prefix"=coalesce(v_item->>'prefix',''),"FINSeq_Suffix"=coalesce(v_item->>'suffix',''),"FINSeq_NextNumber"=greatest("FINSeq_NextNumber",greatest(1,coalesce((v_item->>'nextNumber')::bigint,1))),"FINSeq_PaddingLength"=greatest(1,least(12,coalesce((v_item->>'paddingLength')::integer,6))),"FINSeq_ResetPeriodCode"=coalesce(nullif(v_item->>'resetPeriodCode',''),'never'),"FINSeq_IsActive"=coalesce((v_item->>'isActive')::boolean,true),"FINSeq_UpdatedAt"=now(),"FINSeq_UpdatedBy"=p_user_id where "FINSeq_ID"=v_id and "FINSeq_LegalEntityID"=p_legal_entity_id;
      get diagnostics v_row_count=row_count; if v_row_count=0 then raise exception 'A document sequence is outside this legal entity.' using errcode='42501'; end if;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_settings->'paymentTerms','[]'::jsonb)) loop
    v_code:=nullif(btrim(v_item->>'code'),''); if v_code is null then raise exception 'Every payment term needs a code.' using errcode='22023'; end if;
    v_id:=nullif(v_item->>'id','')::uuid;
    if v_id is null then
      insert into public."FIN_PaymentTerms"("FINTerm_Code","FINTerm_Name","FINTerm_Days","FINTerm_DueDayOfMonth","FINTerm_EndOfMonth","FINTerm_IsCashAccount","FINTerm_IsActive","FINTerm_LegalEntityID","FINTerm_CreatedBy","FINTerm_UpdatedBy")
      values(v_code,coalesce(nullif(btrim(v_item->>'name'),''),v_code),greatest(0,coalesce((v_item->>'days')::integer,30)),nullif(v_item->>'dueDayOfMonth','')::integer,coalesce((v_item->>'endOfMonth')::boolean,false),coalesce((v_item->>'isCashAccount')::boolean,false),coalesce((v_item->>'isActive')::boolean,true),p_legal_entity_id,p_user_id,p_user_id)
      on conflict ("FINTerm_LegalEntityID","FINTerm_Code") where "FINTerm_LegalEntityID" is not null do update set "FINTerm_Name"=excluded."FINTerm_Name","FINTerm_Days"=excluded."FINTerm_Days","FINTerm_DueDayOfMonth"=excluded."FINTerm_DueDayOfMonth","FINTerm_EndOfMonth"=excluded."FINTerm_EndOfMonth","FINTerm_IsCashAccount"=excluded."FINTerm_IsCashAccount","FINTerm_IsActive"=excluded."FINTerm_IsActive","FINTerm_UpdatedAt"=now(),"FINTerm_UpdatedBy"=p_user_id;
    else
      update public."FIN_PaymentTerms" set "FINTerm_Code"=v_code,"FINTerm_Name"=coalesce(nullif(btrim(v_item->>'name'),''),v_code),"FINTerm_Days"=greatest(0,coalesce((v_item->>'days')::integer,30)),"FINTerm_DueDayOfMonth"=nullif(v_item->>'dueDayOfMonth','')::integer,"FINTerm_EndOfMonth"=coalesce((v_item->>'endOfMonth')::boolean,false),"FINTerm_IsCashAccount"=coalesce((v_item->>'isCashAccount')::boolean,false),"FINTerm_IsActive"=coalesce((v_item->>'isActive')::boolean,true),"FINTerm_UpdatedAt"=now(),"FINTerm_UpdatedBy"=p_user_id where "FINTerm_ID"=v_id and "FINTerm_LegalEntityID"=p_legal_entity_id;
      get diagnostics v_row_count=row_count; if v_row_count=0 then raise exception 'A payment term is outside this legal entity.' using errcode='42501'; end if;
    end if;
  end loop;

  -- Provider mappings are connection-scoped. A connection must belong to the
  -- same legal entity before any mapping can be inserted or changed.
  for v_item in select value from jsonb_array_elements(coalesce(p_settings->'accountMappings','[]'::jsonb)) loop
    v_connection_id:=nullif(v_item->>'connectionId','')::uuid;
    if not exists(select 1 from public."ACCI_Connections" where "ACCIC_ID"=v_connection_id and "ACCIC_LegalEntityID"=p_legal_entity_id) then raise exception 'An account mapping connection is outside this legal entity.' using errcode='42501'; end if;
    v_id:=nullif(v_item->>'id','')::uuid;
    if v_id is null then
      insert into public."ACCI_AccountMappings"("ACCIAM_ConnectionID","ACCIAM_DirectionCode","ACCIAM_LocalContextCode","ACCIAM_ProviderAccountID","ACCIAM_ProviderAccountCode","ACCIAM_ProviderAccountName","ACCIAM_IsDefault","ACCIAM_IsActive") values(v_connection_id,coalesce(nullif(v_item->>'directionCode',''),'sales'),nullif(btrim(v_item->>'localContextCode'),''),coalesce(nullif(btrim(v_item->>'providerAccountId'),''),nullif(btrim(v_item->>'providerAccountCode'),'')),nullif(btrim(v_item->>'providerAccountCode'),''),nullif(btrim(v_item->>'providerAccountName'),''),coalesce((v_item->>'isDefault')::boolean,false),coalesce((v_item->>'isActive')::boolean,true));
    else
      update public."ACCI_AccountMappings" set "ACCIAM_DirectionCode"=coalesce(nullif(v_item->>'directionCode',''),'sales'),"ACCIAM_LocalContextCode"=nullif(btrim(v_item->>'localContextCode'),''),"ACCIAM_ProviderAccountID"=coalesce(nullif(btrim(v_item->>'providerAccountId'),''),nullif(btrim(v_item->>'providerAccountCode'),'')),"ACCIAM_ProviderAccountCode"=nullif(btrim(v_item->>'providerAccountCode'),''),"ACCIAM_ProviderAccountName"=nullif(btrim(v_item->>'providerAccountName'),''),"ACCIAM_IsDefault"=coalesce((v_item->>'isDefault')::boolean,false),"ACCIAM_IsActive"=coalesce((v_item->>'isActive')::boolean,true) where "ACCIAM_ID"=v_id and "ACCIAM_ConnectionID"=v_connection_id;
      get diagnostics v_row_count=row_count; if v_row_count=0 then raise exception 'An account mapping is outside this connection.' using errcode='42501'; end if;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_settings->'chargeMappings','[]'::jsonb)) loop
    v_connection_id:=nullif(v_item->>'connectionId','')::uuid;
    if not exists(select 1 from public."ACCI_Connections" where "ACCIC_ID"=v_connection_id and "ACCIC_LegalEntityID"=p_legal_entity_id) then raise exception 'A charge mapping connection is outside this legal entity.' using errcode='42501'; end if;
    v_id:=nullif(v_item->>'id','')::uuid;
    if v_id is null then
      insert into public."ACCI_ChargeCodeMappings"("ACCICM_ConnectionID","ACCICM_LocalChargeCodeSnapshot","ACCICM_DirectionCode","ACCICM_ProviderItemID","ACCICM_ProviderItemCode","ACCICM_ProviderItemName","ACCICM_ProviderAccountID","ACCICM_IsActive") values(v_connection_id,coalesce(nullif(btrim(v_item->>'localChargeCode'),''),'ADHOC'),coalesce(nullif(v_item->>'directionCode',''),'sales'),nullif(btrim(v_item->>'providerItemId'),''),nullif(btrim(v_item->>'providerItemCode'),''),nullif(btrim(v_item->>'providerItemName'),''),nullif(btrim(v_item->>'providerAccountId'),''),coalesce((v_item->>'isActive')::boolean,true));
    else
      update public."ACCI_ChargeCodeMappings" set "ACCICM_LocalChargeCodeSnapshot"=coalesce(nullif(btrim(v_item->>'localChargeCode'),''),'ADHOC'),"ACCICM_DirectionCode"=coalesce(nullif(v_item->>'directionCode',''),'sales'),"ACCICM_ProviderItemID"=nullif(btrim(v_item->>'providerItemId'),''),"ACCICM_ProviderItemCode"=nullif(btrim(v_item->>'providerItemCode'),''),"ACCICM_ProviderItemName"=nullif(btrim(v_item->>'providerItemName'),''),"ACCICM_ProviderAccountID"=nullif(btrim(v_item->>'providerAccountId'),''),"ACCICM_IsActive"=coalesce((v_item->>'isActive')::boolean,true) where "ACCICM_ID"=v_id and "ACCICM_ConnectionID"=v_connection_id;
      get diagnostics v_row_count=row_count; if v_row_count=0 then raise exception 'A charge mapping is outside this connection.' using errcode='42501'; end if;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_settings->'taxMappings','[]'::jsonb)) loop
    v_connection_id:=nullif(v_item->>'connectionId','')::uuid;
    if not exists(select 1 from public."ACCI_Connections" where "ACCIC_ID"=v_connection_id and "ACCIC_LegalEntityID"=p_legal_entity_id) then raise exception 'A tax mapping connection is outside this legal entity.' using errcode='42501'; end if;
    v_id:=nullif(v_item->>'id','')::uuid;
    if v_id is null then
      insert into public."ACCI_TaxCodeMappings"("ACCITM_ConnectionID","ACCITM_LocalTaxCode","ACCITM_LocalTaxDescription","ACCITM_LocalCountryCode","ACCITM_DirectionCode","ACCITM_ProviderTaxID","ACCITM_ProviderTaxCode","ACCITM_ProviderTaxName","ACCITM_TaxRatePercent","ACCITM_IsActive") values(v_connection_id,coalesce(nullif(btrim(v_item->>'localTaxCode'),''),'out-of-scope'),nullif(btrim(v_item->>'localTaxDescription'),''),upper(coalesce(nullif(btrim(v_item->>'countryCode'),''),v_country)),coalesce(nullif(v_item->>'directionCode',''),'sales'),nullif(btrim(v_item->>'providerTaxId'),''),coalesce(nullif(btrim(v_item->>'providerTaxCode'),''),nullif(btrim(v_item->>'localTaxCode'),'')),nullif(btrim(v_item->>'providerTaxName'),''),nullif(v_item->>'taxRatePercent','')::numeric,coalesce((v_item->>'isActive')::boolean,true));
    else
      update public."ACCI_TaxCodeMappings" set "ACCITM_LocalTaxCode"=coalesce(nullif(btrim(v_item->>'localTaxCode'),''),'out-of-scope'),"ACCITM_LocalTaxDescription"=nullif(btrim(v_item->>'localTaxDescription'),''),"ACCITM_LocalCountryCode"=upper(coalesce(nullif(btrim(v_item->>'countryCode'),''),v_country)),"ACCITM_DirectionCode"=coalesce(nullif(v_item->>'directionCode',''),'sales'),"ACCITM_ProviderTaxID"=nullif(btrim(v_item->>'providerTaxId'),''),"ACCITM_ProviderTaxCode"=coalesce(nullif(btrim(v_item->>'providerTaxCode'),''),nullif(btrim(v_item->>'localTaxCode'),'')),"ACCITM_ProviderTaxName"=nullif(btrim(v_item->>'providerTaxName'),''),"ACCITM_TaxRatePercent"=nullif(v_item->>'taxRatePercent','')::numeric,"ACCITM_IsActive"=coalesce((v_item->>'isActive')::boolean,true) where "ACCITM_ID"=v_id and "ACCITM_ConnectionID"=v_connection_id;
      get diagnostics v_row_count=row_count; if v_row_count=0 then raise exception 'A tax mapping is outside this connection.' using errcode='42501'; end if;
    end if;
  end loop;

  select count(*) into v_control_count from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=p_legal_entity_id and "FINNom_IsControlAccount" and "FINNom_IsActive";
  select count(*) into v_active_banks from public."FIN_BankAccounts" where "FINBank_LegalEntityID"=p_legal_entity_id and "FINBank_IsActive";
  select count(*) into v_active_currencies from public."FIN_CurrencySettings" where "FINCurSet_LegalEntityID"=p_legal_entity_id and "FINCurSet_IsActive";
  select count(*) into v_active_taxes from public."FIN_TaxCodes" where "FINTax_LegalEntityID"=p_legal_entity_id and "FINTax_IsActive";
  select count(*) into v_active_sequences from public."FIN_NumberSequences" where "FINSeq_LegalEntityID"=p_legal_entity_id and "FINSeq_IsActive";
  if v_control_count < 6 then v_missing:=array_append(v_missing,'control_accounts'); end if;
  if v_active_banks = 0 then v_missing:=array_append(v_missing,'bank_account'); end if;
  if v_active_currencies = 0 then v_missing:=array_append(v_missing,'operating_currency'); end if;
  if v_active_taxes = 0 then v_missing:=array_append(v_missing,'tax_treatment'); end if;
  if v_active_sequences < 4 then v_missing:=array_append(v_missing,'document_sequences'); end if;
  if not exists(select 1 from public."ACCI_Connections" where "ACCIC_LegalEntityID"=p_legal_entity_id and "ACCIC_StatusCode"='active') then v_missing:=array_append(v_missing,'accounting_connection'); end if;

  update public."FIN_AdministrationRevisions" set "FINAdminRevision_StatusCode"='superseded' where "FINAdminRevision_LegalEntityID"=p_legal_entity_id and "FINAdminRevision_StatusCode"='approved';
  select coalesce(max("FINAdminRevision_Number"),0)+1 into v_revision from public."FIN_AdministrationRevisions" where "FINAdminRevision_LegalEntityID"=p_legal_entity_id;
  insert into public."FIN_AdministrationRevisions"("FINAdminRevision_LegalEntityID","FINAdminRevision_Number","FINAdminRevision_ConfigJSON","FINAdminRevision_ReadinessJSON","FINAdminRevision_Reason","FINAdminRevision_ApprovedBy")
  values(p_legal_entity_id,v_revision,p_settings,jsonb_build_object('ready',coalesce(array_length(v_missing,1),0)=0,'missing',to_jsonb(v_missing),'controlAccounts',v_control_count,'banks',v_active_banks,'currencies',v_active_currencies,'taxCodes',v_active_taxes,'sequences',v_active_sequences),nullif(btrim(p_reason),''),p_user_id);

  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_user_id,p_legal_entity_id,'multideck-app','finance','public','FIN_AdministrationRevisions','finance_configuration',p_legal_entity_id,'approve_finance_administration','Finance administration settings approved',nullif(btrim(p_reason),''),true,1,jsonb_build_object('revision',v_revision,'ready',coalesce(array_length(v_missing,1),0)=0,'missing',to_jsonb(v_missing)));

  return jsonb_build_object('legalEntityId',p_legal_entity_id,'revision',v_revision,'ready',coalesce(array_length(v_missing,1),0)=0,'missing',to_jsonb(v_missing));
exception when unique_violation then
  raise exception 'A finance code or default is duplicated for this legal entity.' using errcode='22023';
end;
$$;

revoke all on function public.multideck_finance_save_administration(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_save_administration(uuid,uuid,uuid,jsonb,text) to service_role;

-- Dexter can inspect the approved configuration and its exact source evidence.
-- Settings changes intentionally remain unsupported in chat because they can
-- change statutory posting behaviour; finance administrators use Admin > Finance.
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
    union all
    select r."FINAdminRevision_ID",r."FINAdminRevision_ApprovedAt",concat_ws(' ','finance settings administration',e."LegalEntity_Name",e."LegalEntity_BaseCurrencyCodeSnapshot",e."LegalEntity_CountryCode",e."LegalEntity_SettingsJSON"#>>'{financeProvider,providerCode}'),
      jsonb_strip_nulls(jsonb_build_object('recordId',r."FINAdminRevision_ID",'recordKind','configuration','legalEntityId',e."LegalEntity_ID",'legalEntity',e."LegalEntity_Name",'baseCurrency',e."LegalEntity_BaseCurrencyCodeSnapshot",'country',e."LegalEntity_CountryCode",'provider',e."LegalEntity_SettingsJSON"#>>'{financeProvider,providerCode}','revision',r."FINAdminRevision_Number",'readiness',r."FINAdminRevision_ReadinessJSON",'approvedAt',r."FINAdminRevision_ApprovedAt",'evidence',jsonb_build_object('sourceTable','FIN_AdministrationRevisions','sourceId',r."FINAdminRevision_ID",'legalEntityId',e."LegalEntity_ID")))
    from public."FIN_AdministrationRevisions" r join public."cmp_LegalEntities" e on e."LegalEntity_ID"=r."FINAdminRevision_LegalEntityID" where e."Company_ID"=p_company_id and r."FINAdminRevision_StatusCode"='approved'
  ) select coalesce(jsonb_agg(value order by updated_at desc),'[]'::jsonb) from (select value,updated_at from records where nullif(btrim(p_search),'') is null or search_text ilike '%'||btrim(p_search)||'%' order by updated_at desc limit greatest(1,least(coalesce(p_take,10),25))) bounded;
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid,text,integer) from public,anon,authenticated;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Tenant-safe AR/AP, cash, allocation, provider-status and approved finance-configuration evidence. Statutory settings remain read-only in Dexter.',
  "AIDexterDomain_RequiredPermissionsJSON"='["Finance.Receivables.View","Finance.Payables.View"]'::jsonb,
  "AIDexterDomain_DataCategoriesJSON"='["financial","customer","supplier","configuration"]'::jsonb,
  "AIDexterDomain_ScopeStrategy"='company',"AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='finance';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Event-driven finance document, receipt, payment, allocation, provider-sync and approved configuration changes.',
  "AIDexterWatchCapability_FieldsJSON"='["status","dueDate","outstandingAmount","postingStatus","exportStatus","cashStatus","unallocatedAmount","configurationRevision","readiness","baseCurrency","provider"]'::jsonb,
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='finance';

create or replace function public._multideck_dexter_finance_administration_watch_change()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_company uuid; v_entity public."cmp_LegalEntities";
begin
  select * into v_entity from public."cmp_LegalEntities" where "LegalEntity_ID"=new."FINAdminRevision_LegalEntityID";
  v_company:=v_entity."Company_ID";
  if v_company is not null and exists(select 1 from public."AI_DexterWatches" w where w."AIDexterWatch_CompanyID"=v_company and w."AIDexterWatch_CapabilityCode"='finance' and w."AIDexterWatch_StatusCode"='active' and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=new."FINAdminRevision_LegalEntityID")) then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(v_company,'finance','FIN_AdministrationRevisions',new."FINAdminRevision_LegalEntityID",'{}'::jsonb,jsonb_build_object('configurationRevision',new."FINAdminRevision_Number",'readiness',new."FINAdminRevision_ReadinessJSON",'baseCurrency',v_entity."LegalEntity_BaseCurrencyCodeSnapshot",'provider',v_entity."LegalEntity_SettingsJSON"#>>'{financeProvider,providerCode}'));
  end if;
  return new;
end;
$$;
revoke all on function public._multideck_dexter_finance_administration_watch_change() from public,anon,authenticated;
drop trigger if exists "TR_FIN_AdministrationRevisions_dexter_watch" on public."FIN_AdministrationRevisions";
create trigger "TR_FIN_AdministrationRevisions_dexter_watch" after insert on public."FIN_AdministrationRevisions" for each row execute function public._multideck_dexter_finance_administration_watch_change();

commit;
