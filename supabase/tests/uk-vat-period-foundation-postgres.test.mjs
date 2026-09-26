import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260924082944_uk_vat_period_foundation.sql", import.meta.url), "utf8")
const controlReviews = readFileSync(new URL("../migrations/20260924113000_uk_vat_control_reviews.sql", import.meta.url), "utf8")
const filingProjections = readFileSync(new URL("../migrations/20260924131934_uk_vat_whole_pound_projection_reviews.sql", import.meta.url), "utf8")
const reviewLocks = readFileSync(new URL("../migrations/20260924133400_uk_vat_period_review_locks.sql", import.meta.url), "utf8")
const filingApprovals = readFileSync(new URL("../migrations/20260924141858_uk_vat_filing_approvals.sql", import.meta.url), "utf8")
const submissionAttempts = readFileSync(new URL("../migrations/20260924142844_uk_vat_submission_attempts.sql", import.meta.url), "utf8")
const submissionOutcomes = readFileSync(new URL("../migrations/20260924150105_uk_vat_submission_outcomes.sql", import.meta.url), "utf8")
const readbackReconciliations = readFileSync(new URL("../migrations/20260924162030_uk_vat_readback_reconciliations.sql", import.meta.url), "utf8")
const filingStatus = readFileSync(new URL("../migrations/20260924162715_uk_vat_filing_status.sql", import.meta.url), "utf8")
const transactionLocks = readFileSync(new URL("../migrations/20260924165621_lock_vat_reconciled_transactions.sql", import.meta.url), "utf8")
const signedDecisionLock = readFileSync(new URL("../migrations/20260924184027_prevent_signed_vat_decision_changes.sql", import.meta.url), "utf8")
const registrationSetup = readFileSync(new URL("../migrations/20260924183815_configure_uk_vat_registration.sql", import.meta.url), "utf8")
const registrationVersioning = readFileSync(new URL("../migrations/20260924185907_version_uk_vat_registrations.sql", import.meta.url), "utf8")
const reversalLinks = readFileSync(new URL("../migrations/20260924172424_link_vat_billing_party_reversals.sql", import.meta.url), "utf8")
const reversalAuditLinks = readFileSync(new URL("../migrations/20260924174445_expose_vat_reversal_audit_links.sql", import.meta.url), "utf8")
const ordinaryCreditLinks = readFileSync(new URL("../migrations/20260924194605_link_vat_credit_corrections.sql", import.meta.url), "utf8")
const clawbackSnapshot = readFileSync(new URL("../migrations/20260924211802_uk_vat_clawback_source_snapshot.sql", import.meta.url), "utf8")
const clawbackAllocationCutoff = readFileSync(new URL("../migrations/20260924212749_uk_vat_clawback_allocation_cutoff.sql", import.meta.url), "utf8")
const inputTaxRepaymentProposals = readFileSync(new URL("../migrations/20260924213642_uk_vat_input_tax_repayment_proposals.sql", import.meta.url), "utf8")
const inputTaxRepaymentReviews = readFileSync(new URL("../migrations/20260925010429_uk_vat_input_tax_repayment_reviews.sql", import.meta.url), "utf8")
const priorPeriodErrorIntake = readFileSync(new URL("../migrations/20260925023814_uk_vat_prior_period_error_intake.sql", import.meta.url), "utf8")
const priorErrorNotifications = readFileSync(new URL("../migrations/20260925041000_uk_vat_prior_error_notification_evidence.sql", import.meta.url), "utf8")
const postedCashSourceLocks = readFileSync(new URL("../migrations/20260925033355_lock_posted_cash_vat_sources.sql", import.meta.url), "utf8")
const cashPaymentDateReviews = readFileSync(new URL("../migrations/20260925033916_uk_vat_cash_payment_date_reviews.sql", import.meta.url), "utf8")
const cashSourceSnapshot = readFileSync(new URL("../migrations/20260925035012_uk_vat_cash_source_snapshot.sql", import.meta.url), "utf8")
const cashEventProjections = readFileSync(new URL("../migrations/20260925041559_uk_vat_cash_event_projections.sql", import.meta.url), "utf8")
const priorErrorFilingGate = readFileSync(new URL("../migrations/20260925043400_guard_unresolved_uk_vat_prior_errors_at_filing.sql", import.meta.url), "utf8")
const priorErrorTimeLimitReviews = readFileSync(new URL("../migrations/20260925045000_uk_vat_prior_error_time_limit_reviews.sql", import.meta.url), "utf8")
const method1PostingPlans = readFileSync(new URL("../migrations/20260925050000_uk_vat_method1_posting_plans.sql", import.meta.url), "utf8")
const method1NativePosting = readFileSync(new URL("../migrations/20260925053000_uk_vat_method1_native_posting.sql", import.meta.url), "utf8")
const cashProjectionIntegrity = readFileSync(new URL("../migrations/20260925060849_uk_vat_cash_projection_integrity.sql", import.meta.url), "utf8")
const inputTaxRepaymentSchedule = readFileSync(new URL("../migrations/20260925061815_uk_vat_input_tax_repayment_schedule.sql", import.meta.url), "utf8")
const inputTaxRepaymentNativePosting = readFileSync(new URL("../migrations/20260925062121_uk_vat_input_tax_repayment_native_posting.sql", import.meta.url), "utf8")
const inputTaxRepaymentCalculation = readFileSync(new URL("../migrations/20260925062806_uk_vat_input_tax_repayment_calculation.sql", import.meta.url), "utf8")
const laterInputTaxRestorationSource = readFileSync(new URL("../migrations/20260925064204_uk_vat_later_input_tax_restoration_source.sql", import.meta.url), "utf8")
const laterInputTaxRestorationReviews = readFileSync(new URL("../migrations/20260925065025_uk_vat_later_input_tax_restoration_reviews.sql", import.meta.url), "utf8")
const laterInputTaxRestorationPosting = readFileSync(new URL("../migrations/20260925065230_uk_vat_later_input_tax_restoration_posting.sql", import.meta.url), "utf8")
const laterInputTaxRestorationCalculation = readFileSync(new URL("../migrations/20260925065559_uk_vat_later_input_tax_restoration_calculation.sql", import.meta.url), "utf8")
const multiPeriodInputTaxRestorationSource = readFileSync(new URL("../migrations/20260925065950_uk_vat_multi_period_input_tax_restoration_source.sql", import.meta.url), "utf8")
const supplierInputTaxHistory = readFileSync(new URL("../migrations/20260925070818_uk_vat_supplier_input_tax_history.sql", import.meta.url), "utf8")
const reconciliationHistory = readFileSync(new URL("../migrations/20260924202817_expose_vat_reconciliation_history.sql", import.meta.url), "utf8")
const latestObligationStatus = readFileSync(new URL("../migrations/20260924182929_prefer_latest_vat_obligation_after_revocation.sql", import.meta.url), "utf8")
const nominalResolution = readFileSync(new URL("../migrations/20260923150858_finance_chart_nominal_resolution.sql", import.meta.url), "utf8")

test("indirect tax period and evidence boundaries hold in PostgreSQL", () => {
  const bin = process.env.PG_TEST_BIN || "/opt/homebrew/opt/postgresql@17/bin"
  const directory = mkdtempSync(join(tmpdir(), "uk-vat-period-"))
  let started = false
  const run = (name, args, input) => {
    const result = spawnSync(join(bin, name), args, { input, encoding: "utf8", timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const sql = (input) => run("psql", ["-X", "-qAt", "-h", directory, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input)
  try {
    run("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "postgres", "--no-locale", "--no-sync", "-E", "UTF8"])
    run("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "log"), "-o", `-k ${directory} -c listen_addresses=''`, "-w", "start"])
    started = true
    sql(`
      create schema extensions;
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"LegalEntity_IsActive" boolean not null,"LegalEntity_CountryCode" text not null,"Company_ID" uuid not null default '00000000-0000-0000-0000-000000000020',"LegalEntity_BaseCurrencyCodeSnapshot" text not null default 'GBP');
      create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid not null default '00000000-0000-0000-0000-000000000020',"User_AccessStatus" text not null default 'active');
      create table "FIN_LocalisationPacks"("FINLocPack_ID" uuid primary key,"FINLocPack_CountryCode" text,"FINLocPack_ReportingCurrencyCode" text,"FINLocPack_Version" integer not null default 1,"FINLocPack_ComplianceStatusCode" text not null default 'foundation',"FINLocPack_Code" text not null default 'gb-v1',"FINLocPack_IsActive" boolean not null default true);
      create table "FIN_ComplianceObligations"("FINCompliance_ID" uuid primary key,"FINCompliance_PackID" uuid not null,"FINCompliance_ObligationTypeCode" text not null,"FINCompliance_Code" text not null,"FINCompliance_IsActive" boolean not null default true);
      create table "FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_ID" uuid primary key default gen_random_uuid(),"FINComplianceReg_LegalEntityID" uuid not null,"FINComplianceReg_ObligationID" uuid not null,"FINComplianceReg_StatusCode" text not null,"FINComplianceReg_RegistrationReference" text,"FINComplianceReg_EffectiveFrom" date not null,"FINComplianceReg_EffectiveTo" date,"FINComplianceReg_SettingsJSON" jsonb not null,"FINComplianceReg_UpdatedAt" timestamptz not null default now(),"FINComplianceReg_FilingMethodCode" text,"FINComplianceReg_UpdatedBy" uuid,constraint "UQ_FIN_LegalEntityCompliance_registration" unique("FINComplianceReg_LegalEntityID","FINComplianceReg_ObligationID"));
      create table "FIN_TaxCodes"("FINTax_ID" uuid primary key,"FINTax_LegalEntityID" uuid not null,"FINTax_CountryCode" text not null,"FINTax_TaxTypeCode" text not null,"FINTax_IsActive" boolean not null,"FINTax_ApprovedAt" timestamptz,"FINTax_Code" text not null,"FINTax_RatePercent" numeric not null,"FINTax_EffectiveFrom" date not null,"FINTax_EffectiveTo" date,"FINTax_TreatmentCategoryCode" text not null,"FINTax_IsRecoverable" boolean not null,"FINTax_OutputNominalID" uuid,"FINTax_InputNominalID" uuid);
      create table "FIN_Periods"("FINPeriod_ID" uuid primary key,"FINPeriod_LegalEntityID" uuid not null,"FINPeriod_StartDate" date not null,"FINPeriod_EndDate" date not null,"FINPeriod_StatusCode" text not null default 'open');
      create table "FIN_NominalAccounts"("FINNom_ID" uuid primary key,"FINNom_LegalEntityID" uuid not null,"FINNom_Code" text,"FINNom_Name" text,"FINNom_ControlTypeCode" text,"FINNom_IsActive" boolean not null default true,"FINNom_IsControlAccount" boolean not null default false,"FINNom_AllowManualPosting" boolean not null default true,"FINNom_CreatedAt" timestamptz not null default now());
      create table "FIN_PostingBatches"("FINPostBatch_ID" uuid primary key default gen_random_uuid(),"FINPostBatch_LegalEntityID" uuid not null,"FINPostBatch_StatusCode" text not null,"FINPostBatch_PeriodID" uuid,"FINPostBatch_Number" text,"FINPostBatch_SourceTable" text,"FINPostBatch_SourceID" uuid,"FINPostBatch_DebitTotal" numeric not null default 0,"FINPostBatch_CreditTotal" numeric not null default 0,"FINPostBatch_CurrencyCodeSnapshot" text not null default 'GBP',"FINPostBatch_PostedAt" timestamptz,"FINPostBatch_PostedBy" uuid,"FINPostBatch_CreatedBy" uuid);
      create table "FIN_PostingLines"("FINPostLine_ID" uuid primary key default gen_random_uuid(),"FINPostLine_BatchID" uuid not null,
        "FINPostLine_LineNo" integer not null,"FINPostLine_NominalAccountID" uuid,"FINPostLine_DocumentID" uuid,
        "FINPostLine_DocumentLineID" uuid,"FINPostLine_Description" text,
        "FINPostLine_DebitAmount" numeric(18,4) not null,"FINPostLine_CreditAmount" numeric(18,4) not null,
        "FINPostLine_CurrencyCodeSnapshot" text not null);
      create table "FIN_Documents"("FINDoc_ID" uuid primary key,"FINDoc_LegalEntityID" uuid not null,"FINDoc_NativePostingStatusCode" text not null,"FINDoc_NativePostingBatchID" uuid,"FINDoc_CurrencyCodeSnapshot" text not null,"FINDoc_ExchangeRate" numeric not null,"FINDoc_DocumentDate" date not null,"FINDoc_NativePostedBy" uuid,"FINDoc_TypeCode" text not null default 'sl_invoice',"FINDoc_Number" text,"FINDoc_StatusCode" text not null default 'approved',"FINDoc_PostingStatusCode" text not null default 'queued',"FINDoc_ExportStatusCode" text not null default 'queued',"FINDoc_OutstandingAmount" numeric not null default 100,"FINDoc_LocalOutstandingAmount" numeric not null default 100,"FINDoc_IsLocked" boolean not null default true,"FINDoc_DueDate" date,"FINDoc_GrossAmount" numeric not null default 100);
      create table "FIN_CashTransactions"("FINCash_ID" uuid primary key,"FINCash_LegalEntityID" uuid not null,"FINCash_TypeCode" text not null,"FINCash_NativePostingStatusCode" text not null,"FINCash_TransactionDate" date not null);
      create table "FIN_CashAllocations"("FINCashAlloc_CashID" uuid not null,"FINCashAlloc_DocumentID" uuid not null,"FINCashAlloc_AllocationStatusCode" text not null,"FINCashAlloc_AllocatedAmount" numeric not null,"FINCashAlloc_AllocatedAt" timestamptz not null default now());
      alter table "FIN_Documents" add column "FINDoc_PartyOrgID" uuid;
      create table "FIN_DocumentLines"("FINDocLine_ID" uuid primary key,"FINDocLine_DocumentID" uuid not null,"FINDocLine_NetAmount" numeric not null,"FINDocLine_TaxAmount" numeric not null,"FINDocLine_LocalNetAmount" numeric not null,"FINDocLine_LocalTaxAmount" numeric not null,"FINDocLine_TaxCodeID" uuid,"FINDocLine_TaxCodeSnapshot" text,"FINDocLine_TaxRatePercent" numeric,"FINDocLine_NominalAccountID" uuid);
      create table "FIN_DocumentLineJobLinks"("FINDocLineJob_ID" uuid primary key default gen_random_uuid(),"FINDocLineJob_DocumentID" uuid not null,"FINDocLineJob_DocumentLineID" uuid not null,"FINDocLineJob_JobID" uuid);
      create table "Audit_Events"("AuditEvent_EventTypeCode" text,"AuditEvent_UserID" uuid,"AuditEvent_LegalEntityID" uuid,"AuditEvent_SourceApp" text,"AuditEvent_SourceModule" text,"AuditEvent_SourceTableSchema" text,"AuditEvent_SourceTableName" text,"AuditEvent_RecordTypeCode" text,"AuditEvent_RecordID" uuid,"AuditEvent_RecordKeyJSON" jsonb,"AuditEvent_Action" text,"AuditEvent_Reason" text,"AuditEvent_Title" text,"AuditEvent_MetadataJSON" jsonb);
      create function public._multideck_dexter_has_permission(p_actor uuid,p_permission text) returns boolean language sql stable as $$
        select (p_actor in ('00000000-0000-0000-0000-000000000003'::uuid,'00000000-0000-0000-0000-000000000017'::uuid)
          and p_permission in ('Finance.Compliance.Manage','Finance.Compliance.View'))
          or (p_actor='00000000-0000-0000-0000-000000000018'::uuid and p_permission='Finance.Compliance.View');
      $$;
    `)
    sql(nominalResolution)
    sql(migration)
    sql(controlReviews)
    sql(filingProjections)
    sql(reviewLocks)
    sql(`create table "FIN_HmrcVatConnections"(id uuid primary key,tenant_project_ref text not null,legal_entity_id uuid not null,registration_id uuid not null,vrn char(9) not null,environment text not null,granted_by_actor_id uuid not null,status text not null,authority_expires_at timestamptz not null,access_expires_at timestamptz not null,refresh_lease_id uuid,authorised_at timestamptz not null default now());
      create table "FIN_HmrcVatObligationVerifications"(id uuid primary key,period_id uuid not null,legal_entity_id uuid not null,tenant_project_ref text not null,registration_id uuid not null,connection_id uuid not null,vrn char(9) not null,environment text not null,period_key text not null,observed_at timestamptz not null);`)
    sql(filingApprovals)
    sql(submissionAttempts)
    sql(submissionOutcomes)
    sql(readbackReconciliations)
    sql(filingStatus)
    sql(latestObligationStatus)
    sql(transactionLocks)
    sql(registrationSetup)
    sql(signedDecisionLock)
    sql(`create function public._multideck_hmrc_vat_require_reauthorisation(p_connection uuid,p_actor uuid,p_reason text)
      returns void language plpgsql as $$ begin
        update "FIN_HmrcVatConnections" set status='reauthorisation_required' where id=p_connection;
      end $$;`)
    sql(registrationVersioning)
    sql(clawbackAllocationCutoff)
    sql(reconciliationHistory)
    sql(priorPeriodErrorIntake)
    sql(priorErrorTimeLimitReviews)
    sql(priorErrorNotifications)
    sql(method1PostingPlans)
    assert.equal(sql(`select count(*) from pg_class where relname in ('FIN_IndirectTaxPeriods','FIN_IndirectTaxEvidence','FIN_IndirectTaxDecisions','FIN_IndirectTaxCalculations','FIN_IndirectTaxCalculationLines','FIN_IndirectTaxReconciliations','FIN_IndirectTaxEvidencePeriods','FIN_IndirectTaxControlReviews','FIN_IndirectTaxFilingProjections','FIN_IndirectTaxPeriodReviewLocks','FIN_IndirectTaxPeriodReviewUnlocks','FIN_IndirectTaxFilingApprovals','FIN_IndirectTaxFilingApprovalRevocations','FIN_HmrcVatSubmissionAttempts','FIN_HmrcVatSubmissionReceipts','FIN_HmrcVatReturnReadbackChecks') and relrowsecurity`), "16")
    assert.equal(sql(`select count(*) from information_schema.role_table_grants where grantee='authenticated' and table_name like 'FIN_IndirectTax%'`), "0")
    assert.equal(sql(`select count(*) from information_schema.role_table_grants
      where grantee='service_role' and table_name like 'FIN_IndirectTax%'
        and privilege_type in ('INSERT','UPDATE','DELETE')`), "0")
    assert.equal(sql(`set role service_role;
      do $permission$ begin
        begin
          insert into public."FIN_IndirectTaxPeriods" default values;
          raise exception 'direct VAT period insert was allowed';
        exception when insufficient_privilege then null; end;
        begin
          insert into public."FIN_IndirectTaxEvidence" default values;
          raise exception 'direct VAT evidence insert was allowed';
        exception when insufficient_privilege then null; end;
        begin
          insert into public."FIN_IndirectTaxDecisions" default values;
          raise exception 'direct VAT decision insert was allowed';
        exception when insufficient_privilege then null; end;
        begin
          insert into public."FIN_IndirectTaxCalculations" default values;
          raise exception 'direct VAT calculation insert was allowed';
        exception when insufficient_privilege then null; end;
        begin
          insert into public."FIN_IndirectTaxCalculationLines" default values;
          raise exception 'direct VAT calculation-line insert was allowed';
        exception when insufficient_privilege then null; end;
        begin
          insert into public."FIN_IndirectTaxReconciliations" default values;
          raise exception 'direct reconciliation insert was allowed';
        exception when insufficient_privilege then null; end;
        begin
          insert into public."FIN_IndirectTaxEvidencePeriods" default values;
          raise exception 'direct period assignment insert was allowed';
        exception when insufficient_privilege then null; end;
        begin
          insert into public."FIN_IndirectTaxControlReviews" default values;
          raise exception 'direct VAT control review insert was allowed';
        exception when insufficient_privilege then null; end;
        begin
          insert into public."FIN_IndirectTaxFilingProjections" default values;
          raise exception 'direct VAT filing projection insert was allowed';
        exception when insufficient_privilege then null; end;
        begin
          insert into public."FIN_IndirectTaxPeriodReviewLocks" default values;
          raise exception 'direct VAT review lock insert was allowed';
        exception when insufficient_privilege then null; end;
        begin
          insert into public."FIN_IndirectTaxPeriodReviewUnlocks" default values;
          raise exception 'direct VAT review unlock insert was allowed';
        exception when insufficient_privilege then null; end;
      end $permission$;
      reset role; select 'denied';`), "denied")
    assert.equal(sql(`select count(*) from information_schema.role_table_grants where grantee='service_role' and table_name in ('FIN_IndirectTaxFilingApprovals','FIN_IndirectTaxFilingApprovalRevocations') and privilege_type='INSERT'`), "0")
    assert.equal(sql(`select count(*) from information_schema.role_table_grants where grantee='service_role' and table_name in ('FIN_HmrcVatSubmissionAttempts','FIN_HmrcVatSubmissionReceipts','FIN_HmrcVatReturnReadbackChecks') and privilege_type in ('INSERT','UPDATE','DELETE')`), "0")
    assert.equal(sql(`select has_function_privilege('authenticated',
      'public.multideck_uk_vat_schedule_registration(uuid,uuid,text,text,date,boolean,text)','EXECUTE')`), "f")
    assert.equal(sql(`
      do $test$
      declare e uuid:='00000000-0000-0000-0000-000000000001'; other uuid:='00000000-0000-0000-0000-000000000002';
        user_id uuid:='00000000-0000-0000-0000-000000000003'; pack uuid:='00000000-0000-0000-0000-000000000004';
        obligation uuid:='00000000-0000-0000-0000-000000000005'; registration uuid:='00000000-0000-0000-0000-000000000006';
        batch uuid:='00000000-0000-0000-0000-000000000007'; doc uuid:='00000000-0000-0000-0000-000000000008'; line uuid:='00000000-0000-0000-0000-000000000009';
        period_id uuid; period_b uuid; event_id uuid; calc_id uuid; decision_id uuid;
        calc_b uuid; decision_b uuid; v_result jsonb; v_next jsonb; v_matched_digest text;
        v_reconciled_at timestamptz; v_control_at timestamptz; v_control_review uuid;
        v_projection_at timestamptz; v_projection_review uuid;
        v_period_lock uuid; v_period_unlock uuid; v_filing_approval uuid; v_filing_revocation uuid;
        v_submission_attempt uuid; v_submission_receipt uuid; v_payload_body text;
        v_lock_fingerprint text; v_hmrc_connection uuid:=gen_random_uuid(); v_hmrc_observation uuid:=gen_random_uuid();
        v_production_connection uuid:=gen_random_uuid(); v_production_observation uuid:=gen_random_uuid();
        v_stale_observation uuid:=gen_random_uuid(); v_new_observation uuid:=gen_random_uuid();
        v_tax_credit numeric; v_calculation_count integer; v_locked_period_id uuid; v_unlinked_line uuid;
        v_setup_entity uuid:='00000000-0000-0000-0000-0000000000a1';
        v_setup_placeholder uuid:='00000000-0000-0000-0000-0000000000a2';
        v_immediate_entity uuid:='00000000-0000-0000-0000-0000000000a3';
        v_non_gbp_entity uuid:='00000000-0000-0000-0000-0000000000a4';
        v_prior_registration uuid; v_new_registration uuid; v_transition_date date;
      begin
        insert into "cmp_LegalEntities" values(e,true,'GB'),(other,true,'US');
        insert into "cmp_Users" values(user_id);
        insert into "cmp_Users" values('00000000-0000-0000-0000-000000000017','00000000-0000-0000-0000-000000000021','active');
        insert into "cmp_Users" values('00000000-0000-0000-0000-000000000018');
        insert into "FIN_LocalisationPacks"("FINLocPack_ID","FINLocPack_CountryCode","FINLocPack_ReportingCurrencyCode") values(pack,'GB','GBP');
        insert into "FIN_ComplianceObligations"("FINCompliance_ID","FINCompliance_PackID","FINCompliance_ObligationTypeCode","FINCompliance_Code") values(obligation,pack,'indirect_tax','gb-vat-mtd');
        insert into "FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_ID","FINComplianceReg_LegalEntityID","FINComplianceReg_ObligationID","FINComplianceReg_StatusCode","FINComplianceReg_RegistrationReference","FINComplianceReg_EffectiveFrom","FINComplianceReg_EffectiveTo","FINComplianceReg_SettingsJSON") values(registration,e,obligation,'configured','123456789','2020-01-01',null,'{"schemeCode":"standard"}');
        insert into "cmp_LegalEntities" values(v_setup_entity,true,'GB');
        insert into "cmp_LegalEntities"("LegalEntity_ID","LegalEntity_IsActive","LegalEntity_CountryCode","LegalEntity_BaseCurrencyCodeSnapshot")
          values(v_non_gbp_entity,true,'GB','USD');
        begin
          perform public.multideck_uk_vat_configure_registration(user_id,v_non_gbp_entity,'987654321','annual','2026-01-01',true);
          raise exception 'non-GBP ledger was configured for UK VAT';
        exception when sqlstate '22023' then null; end;
        if public.multideck_uk_vat_registration('00000000-0000-0000-0000-000000000018',v_setup_entity)->'registration'<>'null'::jsonb then
          raise exception 'same-company viewer did not see an empty UK VAT registration'; end if;
        begin
          perform public.multideck_uk_vat_configure_registration('00000000-0000-0000-0000-000000000018',v_setup_entity,'987654321','annual','2026-01-01',true);
          raise exception 'read-only colleague configured UK VAT';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_configure_registration('00000000-0000-0000-0000-000000000017',v_setup_entity,'987654321','annual','2026-01-01',true);
          raise exception 'foreign company configured UK VAT';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_registration('00000000-0000-0000-0000-000000000017',v_setup_entity);
          raise exception 'foreign company read UK VAT registration';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_configure_registration(user_id,v_setup_entity,'987654321','cash','2026-01-01',true);
          raise exception 'unsupported cash scheme was configured';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_configure_registration(user_id,v_setup_entity,'987654321','annual','2026-01-01',false);
          raise exception 'unconfirmed invoice-basis registration was configured';
        exception when sqlstate '22023' then null; end;
        v_result:=public.multideck_uk_vat_configure_registration(user_id,v_setup_entity,'987654321','annual','2026-01-01',true);
        if v_result#>>'{registration,vrn}'<>'987654321'
          or v_result#>>'{registration,schemeCode}'<>'annual'
          or v_result#>>'{registration,accountingBasis}'<>'invoice'
          or v_result#>>'{registration,status}'<>'configured'
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='configure_uk_vat_registration'
            and "AuditEvent_UserID"=user_id and "AuditEvent_LegalEntityID"=v_setup_entity) then
          raise exception 'UK VAT registration setup was not scoped, dated and audited'; end if;
        if public.multideck_uk_vat_registration('00000000-0000-0000-0000-000000000018',v_setup_entity)#>>'{registration,vrn}'<>'987654321' then
          raise exception 'same-company viewer could not read configured UK VAT registration'; end if;
        if public.multideck_uk_vat_create_draft_period(user_id,v_setup_entity,'2026-01-01','2026-12-31')->>'status'<>'draft' then
          raise exception 'newly configured annual registration could not prepare a VAT period'; end if;
        begin
          perform public.multideck_uk_vat_configure_registration(user_id,v_setup_entity,'111111111','standard','2026-01-01',true);
          raise exception 'configured UK VAT registration was silently overwritten';
        exception when sqlstate '22023' then null; end;
        insert into "cmp_LegalEntities" values(v_setup_placeholder,true,'GB');
        insert into "FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_LegalEntityID","FINComplianceReg_ObligationID","FINComplianceReg_StatusCode","FINComplianceReg_EffectiveFrom","FINComplianceReg_SettingsJSON")
          values(v_setup_placeholder,obligation,'not_configured','2020-01-01','{}');
        v_result:=public.multideck_uk_vat_configure_registration(user_id,v_setup_placeholder,'234567890','standard','2026-04-01',true);
        if v_result#>>'{registration,vrn}'<>'234567890'
          or (select count(*) from "FIN_LegalEntityComplianceRegistrations"
            where "FINComplianceReg_LegalEntityID"=v_setup_placeholder)<>1 then
          raise exception 'unconfigured placeholder did not become one audited registration'; end if;
        v_prior_registration:=(v_result#>>'{registration,registrationId}')::uuid;
        v_transition_date:=(now() at time zone 'Europe/London')::date+11;
        begin
          perform set_config('role','service_role',true);
          v_result:=public.multideck_uk_vat_create_draft_period(user_id,v_setup_placeholder,
            '2026-04-01',v_transition_date-1);
          if v_result->>'periodId' is null then
            raise exception 'service-role VAT period RPC did not write'; end if;
          raise exception 'vat_service_writer_probe_rollback';
        exception when sqlstate 'P0001' then
          if sqlerrm<>'vat_service_writer_probe_rollback' then raise; end if;
        end;
        perform public.multideck_uk_vat_create_draft_period(user_id,v_setup_placeholder,'2026-04-01',v_transition_date-1);
        begin
          perform public.multideck_uk_vat_schedule_registration(user_id,v_setup_placeholder,'345678901','annual',current_date+7,true,
            'Attempted to cross an existing VAT period');
          raise exception 'registration change cut across a prepared VAT period';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_schedule_registration(user_id,v_setup_placeholder,'345678901','annual',v_transition_date,true,
            'Attempted to switch while the old return remains unresolved');
          raise exception 'unsubmitted old VAT period allowed a registration change';
        exception when sqlstate '22023' then
          if sqlerrm not like 'Resolve every prepared VAT period%' then raise; end if;
        end;
        delete from "FIN_IndirectTaxPeriods" where legal_entity_id=v_setup_placeholder;
        begin
          perform public.multideck_uk_vat_schedule_registration('00000000-0000-0000-0000-000000000018',v_setup_placeholder,'345678901','annual',v_transition_date,true,
            'Read-only colleague attempted a VAT scheme change');
          raise exception 'read-only colleague changed VAT registration terms';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_schedule_registration('00000000-0000-0000-0000-000000000017',v_setup_placeholder,'345678901','annual',v_transition_date,true,
            'Foreign company attempted a VAT scheme change');
          raise exception 'foreign company changed VAT registration terms';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_schedule_registration(user_id,v_setup_placeholder,'345678901','annual',v_transition_date,false,
            'No invoice basis confirmation for the new scheme');
          raise exception 'unconfirmed VAT registration change was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_schedule_registration(user_id,v_setup_placeholder,'234567890','standard',v_transition_date,true,
            'Attempted a no-op VAT registration revision');
          raise exception 'unchanged VAT terms created an unnecessary revision';
        exception when sqlstate '22023' then null; end;
        v_result:=public.multideck_uk_vat_schedule_registration(user_id,v_setup_placeholder,'345678901','annual',v_transition_date,true,
          'Annual invoice-basis scheme starts after the prepared period');
        v_new_registration:=(v_result->>'newRegistrationId')::uuid;
        if v_new_registration is null or v_new_registration=v_prior_registration
          or (select "FINComplianceReg_EffectiveTo" from "FIN_LegalEntityComplianceRegistrations"
            where "FINComplianceReg_ID"=v_prior_registration)<>v_transition_date-1
          or (select "FINComplianceReg_StatusCode" from "FIN_LegalEntityComplianceRegistrations"
            where "FINComplianceReg_ID"=v_new_registration)<>'configured'
          or public.multideck_uk_vat_registration(user_id,v_setup_placeholder)#>>'{scheduledRegistration,registrationId}'<>v_new_registration::text
          or public.multideck_uk_vat_registration(user_id,v_setup_placeholder)#>>'{registration,registrationId}'<>v_prior_registration::text
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='schedule_uk_vat_registration'
            and "AuditEvent_RecordID"=v_new_registration and "AuditEvent_UserID"=user_id) then
          raise exception 'prospective VAT registration did not preserve the old row and audit'; end if;
        if (select registration_id from "FIN_IndirectTaxPeriods" where id=(
          public.multideck_uk_vat_create_draft_period(user_id,v_setup_placeholder,v_transition_date,v_transition_date+30)->>'periodId')::uuid
        )<>v_new_registration then
          raise exception 'new VAT period did not use the new registration'; end if;
        begin
          insert into "FIN_LegalEntityComplianceRegistrations"(
            "FINComplianceReg_LegalEntityID","FINComplianceReg_ObligationID","FINComplianceReg_StatusCode",
            "FINComplianceReg_RegistrationReference","FINComplianceReg_EffectiveFrom","FINComplianceReg_EffectiveTo","FINComplianceReg_SettingsJSON")
            values(v_setup_placeholder,obligation,'configured','456789012',v_transition_date+1,v_transition_date+5,'{"schemeCode":"annual"}');
          raise exception 'overlapping registration terms were inserted directly';
        exception when sqlstate '23P01' then null; end;
        insert into "cmp_LegalEntities" values(v_immediate_entity,true,'GB');
        v_result:=public.multideck_uk_vat_configure_registration(user_id,v_immediate_entity,'567890123','standard','2020-01-01',true);
        insert into "FIN_HmrcVatConnections"(id,tenant_project_ref,legal_entity_id,registration_id,vrn,environment,granted_by_actor_id,status,authority_expires_at,access_expires_at)
          values(gen_random_uuid(),'tenant-ref',v_immediate_entity,(v_result#>>'{registration,registrationId}')::uuid,
            '567890123','sandbox',user_id,'connected',now()+interval '1 year',now()+interval '1 hour');
        perform set_config('TimeZone',case
          when (now() at time zone 'Pacific/Kiritimati')::date<>
            (now() at time zone 'Europe/London')::date then 'Pacific/Kiritimati'
          else 'Pacific/Honolulu' end,true);
        if current_date=(now() at time zone 'Europe/London')::date then
          raise exception 'test session did not cross the UK civil-date boundary'; end if;
        perform public.multideck_uk_vat_schedule_registration(user_id,v_immediate_entity,'678901234','standard',
          (now() at time zone 'Europe/London')::date,true,
          'Corrected registration starts today and requires new HMRC consent');
        if public.multideck_uk_vat_registration(user_id,v_immediate_entity)
          #>>'{registration,vrn}'<>'678901234' then
          raise exception 'UK registration read used the caller time zone'; end if;
        perform set_config('TimeZone','UTC',true);
        if not exists(select 1 from "FIN_HmrcVatConnections" connection
          where connection.legal_entity_id=v_immediate_entity and connection.status='reauthorisation_required') then
          raise exception 'immediate registration change did not revoke old authority'; end if;
        update "FIN_HmrcVatConnections" set status='connected'
          where legal_entity_id=v_immediate_entity;
        if public.multideck_hmrc_vat_connection_status(user_id,v_immediate_entity,'tenant-ref')
          #>>'{connections,0,status}'<>'reauthorisation_required' then
          raise exception 'expired registration showed stale HMRC authority as connected'; end if;
        begin
          perform public.multideck_uk_vat_create_draft_period(user_id,v_immediate_entity,'2026-01-01',current_date-1);
          raise exception 'closed registration created a new historical VAT draft';
        exception when sqlstate '22023' then null; end;
        insert into "FIN_Periods"("FINPeriod_ID","FINPeriod_LegalEntityID","FINPeriod_StartDate","FINPeriod_EndDate")
          values('00000000-0000-0000-0000-000000000034',e,'2026-07-01','2026-09-30');
        insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code","FINNom_Name","FINNom_ControlTypeCode") values
          ('00000000-0000-0000-0000-000000000030',e,'4000','Sales',null),
          ('00000000-0000-0000-0000-000000000031',e,'2100','Output VAT','vat'),
          ('00000000-0000-0000-0000-000000000032',e,'5000','Purchases',null),
          ('00000000-0000-0000-0000-000000000033',e,'1200','Input VAT','vat');
        insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_LegalEntityID","FINPostBatch_StatusCode","FINPostBatch_PeriodID")
          values(batch,e,'posted','00000000-0000-0000-0000-000000000034');
        insert into "FIN_Documents" values(doc,e,'posted',batch,'GBP',1,'2026-07-15',user_id);
        insert into "FIN_Documents" values('00000000-0000-0000-0000-000000000012',other,'posted',null,'USD',1,'2026-07-15',null);
        insert into "FIN_DocumentLines" values(line,doc,100,20,100,20);
        insert into "FIN_TaxCodes" values('00000000-0000-0000-0000-000000000013',e,'GB','vat',true,'2026-06-01','UK20',20,'2020-01-01',null,'domestic_standard',true,
          '00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000033');
        update "FIN_DocumentLines" set "FINDocLine_TaxCodeID"='00000000-0000-0000-0000-000000000013',"FINDocLine_TaxCodeSnapshot"='UK20',"FINDocLine_TaxRatePercent"=20 where "FINDocLine_ID"=line;
        insert into "FIN_IndirectTaxPeriods"(legal_entity_id,obligation_id,registration_id,jurisdiction_code,scheme_code,reporting_currency,start_date,end_date,created_by)
          values(e,obligation,registration,'GB','standard','GBP','2026-07-01','2026-09-30',user_id) returning id into period_id;
        if (public.multideck_uk_vat_create_draft_period(user_id,e,'2026-07-01','2026-09-30')->>'periodId')::uuid<>period_id then
          raise exception 'period preparation was not idempotent';
        end if;
        if (public.multideck_uk_vat_list_periods('00000000-0000-0000-0000-000000000018',e)->>'total')::integer<>1 then
          raise exception 'same-company compliance viewer could not list a colleague''s period';
        end if;
        begin
          perform public.multideck_uk_vat_record_prior_period_error(
            '00000000-0000-0000-0000-000000000018',e,period_id,
            '2026-01-01','2026-03-31','2026-07-15','late-invoice-1','input',12500,'undetermined',
            'Prior filed return omitted this input VAT amount');
          raise exception 'read-only colleague recorded a prior-period VAT error';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_record_prior_period_error(
            '00000000-0000-0000-0000-000000000017',e,period_id,
            '2026-01-01','2026-03-31','2026-07-15','late-invoice-1','input',12500,'undetermined',
            'Prior filed return omitted this input VAT amount');
          raise exception 'foreign colleague recorded a prior-period VAT error';
        exception when sqlstate '42501' then null; end;
        v_result:=public.multideck_uk_vat_record_prior_period_error(
          user_id,e,period_id,'2026-01-01','2026-03-31','2026-07-15',
          'late-invoice-1','input',12500,'undetermined',
          'Prior filed return omitted this input VAT amount');
        if v_result->>'status'<>'intake_only' or v_result->>'inserted'<>'true'
          or public.multideck_uk_vat_record_prior_period_error(
            user_id,e,period_id,'2026-01-01','2026-03-31','2026-07-15',
            'late-invoice-1','input',12500,'undetermined',
            'Prior filed return omitted this input VAT amount')->>'inserted'<>'false'
          or public.multideck_uk_vat_prior_period_error_intake(
            '00000000-0000-0000-0000-000000000018',e,period_id)->>'total'<>'1'
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='record_prior_period_vat_error'
            and "AuditEvent_RecordID"=(v_result->>'intakeId')::uuid) then
          raise exception 'prior-period error intake was not dated, readable and audited'; end if;
        begin
          perform public.multideck_uk_vat_review_prior_error_time_limit(
            '00000000-0000-0000-0000-000000000018',e,(v_result->>'intakeId')::uuid,
            'input_overclaimed','VAT-RETURN-2026-03',null,'SOURCE-INVOICE-1',
            'Original filed return and invoice evidence checked');
          raise exception 'read-only colleague reviewed a statutory deadline';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_prior_error_time_limit(
            '00000000-0000-0000-0000-000000000017',e,(v_result->>'intakeId')::uuid,
            'input_overclaimed','VAT-RETURN-2026-03',null,'SOURCE-INVOICE-1',
            'Original filed return and invoice evidence checked');
          raise exception 'foreign colleague reviewed a statutory deadline';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_prior_error_time_limit(
            user_id,e,(v_result->>'intakeId')::uuid,'input_underclaimed',
            'VAT-RETURN-2026-03','2026-05-07','SOURCE-INVOICE-1',
            'Original filed return and invoice evidence checked');
          raise exception 'a category conflicting with the signed intake was reviewed';
        exception when sqlstate '22023' then null; end;
        v_result:=public.multideck_uk_vat_review_prior_error_time_limit(
          user_id,e,(v_result->>'intakeId')::uuid,'input_overclaimed',
          'VAT-RETURN-2026-03',null,'SOURCE-INVOICE-1',
          'Original filed return and invoice evidence checked');
        if v_result->>'status'<>'assessment_only' or v_result->>'deadlineOn'<>'2030-03-31'
          or v_result->>'withinTimeLimit'<>'true' or v_result->>'inserted'<>'true'
          or public.multideck_uk_vat_prior_error_time_limit_history(
            '00000000-0000-0000-0000-000000000018',e,
            (select id from "FIN_IndirectTaxPriorPeriodErrorIntake" where source_reference='late-invoice-1'))
            ->'reviews'->0->>'statutory_deadline_on'<>'2030-03-31'
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='review_prior_period_vat_error_time_limit'
            and "AuditEvent_RecordID"=(v_result->>'reviewId')::uuid) then
          raise exception 'statutory time-limit review was not computed, readable and audited'; end if;
        begin
          perform public.multideck_uk_vat_prior_error_time_limit_history(
            '00000000-0000-0000-0000-000000000017',e,
            (select id from "FIN_IndirectTaxPriorPeriodErrorIntake" where source_reference='late-invoice-1'));
          raise exception 'foreign colleague read a statutory deadline review';
        exception when sqlstate '42501' then null; end;
        begin
          update "FIN_IndirectTaxPriorErrorTimeLimitReviews" set within_time_limit=false
            where id=(v_result->>'reviewId')::uuid;
          raise exception 'immutable time-limit review changed';
        exception when sqlstate '22023' then null; end;
        begin
          v_result:=public.multideck_uk_vat_record_prior_period_error(
            user_id,e,period_id,'2020-01-01','2020-03-31','2026-07-15',
            'old-input-claim','input',-100,'reasonable_care',
            'A previously omitted input tax claim was discovered');
          begin
            perform public.multideck_uk_vat_review_prior_error_time_limit(
              user_id,e,(v_result->>'intakeId')::uuid,'input_underclaimed',
              'VAT-RETURN-2020-03',null,'OLD-INVOICE-1',
              'Original return due date is required for an input claim');
            raise exception 'underclaimed input VAT lacked the original due date';
          exception when sqlstate '22023' then null; end;
          v_result:=public.multideck_uk_vat_review_prior_error_time_limit(
            user_id,e,(v_result->>'intakeId')::uuid,'input_underclaimed',
            'VAT-RETURN-2020-03','2020-05-07','OLD-INVOICE-1',
            'Original filed return and due date evidence checked');
          if v_result->>'deadlineOn'<>'2024-05-07'
            or v_result->>'withinTimeLimit'<>'false' then
            raise exception 'underclaimed input tax used the wrong deadline';
          end if;
          raise exception 'time-limit probe complete' using errcode='ZX001';
        exception when sqlstate 'ZX001' then null; end;
        v_result:=public.multideck_uk_vat_record_prior_period_error(
          user_id,e,period_id,'2026-01-01','2026-03-31','2026-07-15',
          'late-invoice-1','input',12500,'undetermined',
          'Prior filed return omitted this input VAT amount');
        begin
          perform public.multideck_uk_vat_record_prior_period_error(
            user_id,e,period_id,'2026-01-01','2026-03-31','2026-07-15',
            'late-invoice-1','input',12600,'undetermined',
            'Prior filed return omitted this input VAT amount');
          raise exception 'same source recorded a different prior-period VAT amount';
        exception when sqlstate '23505' then null; end;
        begin
          perform public.multideck_uk_vat_record_prior_period_error(
            user_id,e,period_id,'2026-07-01','2026-09-30','2026-07-15',
            'current-invoice','input',20,'undetermined',
            'This source belongs to the current return instead');
          raise exception 'current-period source entered as a prior-period error';
        exception when sqlstate '22023' then null; end;
        begin
          update "FIN_IndirectTaxPriorPeriodErrorIntake" set signed_vat_error_gbp=1
            where id=(v_result->>'intakeId')::uuid;
          raise exception 'immutable prior-period error intake was changed';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_prior_period_error_intake(
            '00000000-0000-0000-0000-000000000017',e,period_id);
          raise exception 'foreign colleague read prior-period VAT errors';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_prior_period_error_preview(
            '00000000-0000-0000-0000-000000000018',e,period_id,false);
          raise exception 'read-only colleague received an unreviewed correction method';
        exception when sqlstate '42501' then null; end;
        v_result:=public.multideck_uk_vat_prior_period_error_preview(user_id,e,period_id,false);
        if v_result->>'method'<>'needs_reviewed_current_box6'
          or v_result->>'netErrorGbp'<>'12500.00'
          or v_result->>'conductReviewRequired'<>'true'
          or v_result->>'immediateNotificationReviewRequired'<>'false'
          or v_result->>'timeLimitReviewRequired'<>'true'
          or v_result->>'status'<>'preview_only_no_return_effect' then
          raise exception 'large prior-period error bypassed Box 6 and conduct review'; end if;
        if public.multideck_uk_vat_prior_error_status(user_id,e,period_id,false)
          ->>'method'<>'needs_reviewed_current_box6' then
          raise exception 'notification-aware preview changed the unnotified threshold'; end if;
        if has_function_privilege('service_role',
          'public.multideck_uk_vat_prior_period_error_preview(uuid,uuid,uuid,boolean)','EXECUTE')
          or not has_function_privilege('service_role',
          'public.multideck_uk_vat_prior_error_status(uuid,uuid,uuid,boolean)','EXECUTE') then
          raise exception 'service role retained the raw threshold preview'; end if;
        if public.multideck_uk_vat_prior_period_error_preview(user_id,e,period_id,true)
          ->>'method'<>'separate_notification' then
          raise exception 'voluntary separate notification was unavailable'; end if;
        begin
          perform public.multideck_uk_vat_record_prior_period_error(user_id,e,period_id,
            '2025-10-01','2025-12-31','2026-07-16','urgent-old-return',
            'output',60000,'undetermined','A large omitted output VAT item needs prompt notification');
          if public.multideck_uk_vat_prior_period_error_preview(user_id,e,period_id,false)
            ->>'immediateNotificationReviewRequired'<>'true' then
            raise exception 'an individual error above GBP 50,000 did not trigger immediate review';
          end if;
          raise exception 'urgent probe complete' using errcode='ZX001';
        exception when sqlstate 'ZX001' then null; end;
        begin
          perform public.multideck_uk_vat_record_external_error_notification(
            '00000000-0000-0000-0000-000000000018',e,period_id,
            array[(select id from "FIN_IndirectTaxPriorPeriodErrorIntake"
              where source_reference='late-invoice-1')],
            '2026-07-16','hmrc_online','HMRC-ERR-001',
            'Online error correction was submitted outside Multideck',true);
          raise exception 'read-only colleague recorded external HMRC notification';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_record_external_error_notification(
            '00000000-0000-0000-0000-000000000017',e,period_id,
            array[(select id from "FIN_IndirectTaxPriorPeriodErrorIntake"
              where source_reference='late-invoice-1')],
            '2026-07-16','hmrc_online','HMRC-ERR-001',
            'Online error correction was submitted outside Multideck',true);
          raise exception 'foreign colleague recorded external HMRC notification';
        exception when sqlstate '42501' then null; end;
        v_result:=public.multideck_uk_vat_record_external_error_notification(
          user_id,e,period_id,
          array[(select id from "FIN_IndirectTaxPriorPeriodErrorIntake"
            where source_reference='late-invoice-1')],
          '2026-07-16','hmrc_online','HMRC-ERR-001',
          'Online error correction was submitted outside Multideck',true);
        if v_result->>'inserted'<>'true' or v_result->>'status'<>'operator_recorded_unverified'
          or public.multideck_uk_vat_record_external_error_notification(
            user_id,e,period_id,
            array[(select id from "FIN_IndirectTaxPriorPeriodErrorIntake"
              where source_reference='late-invoice-1')],
            '2026-07-16','hmrc_online','HMRC-ERR-001',
            'Online error correction was submitted outside Multideck',true)->>'inserted'<>'false'
          or public.multideck_uk_vat_external_error_notifications(
            '00000000-0000-0000-0000-000000000018',e,period_id)
            #>>'{items,0,evidence_reference}'<>'HMRC-ERR-001'
          or public.multideck_uk_vat_external_error_notifications(
            '00000000-0000-0000-0000-000000000018',e,period_id)
            #>>'{notifiedIntakeIds,0}' is distinct from
              (select id::text from "FIN_IndirectTaxPriorPeriodErrorIntake"
                where source_reference='late-invoice-1')
          or public.multideck_uk_vat_prior_error_status(user_id,e,period_id,false)
            ->>'method'<>'external_notification_evidence_recorded'
          or public.multideck_uk_vat_prior_error_status(user_id,e,period_id,false)
            ->>'externallyNotifiedCount'<>'1'
          or not exists(select 1 from "Audit_Events"
            where "AuditEvent_Action"='record_external_prior_period_vat_error_notification'
              and "AuditEvent_RecordID"=(v_result->>'notificationId')::uuid) then
          raise exception 'separate notification evidence was not scoped, idempotent and audited'; end if;
        begin
          perform public.multideck_uk_vat_record_external_error_notification(user_id,e,period_id,
            array[(select id from "FIN_IndirectTaxPriorPeriodErrorIntake"
              where source_reference='late-invoice-1')],
            '2026-07-16','letter','OTHER-TRACKING-002',
            'A second notification must not count the same error twice',true);
          raise exception 'same VAT error was included in a second notification';
        exception when sqlstate '23505' then null; end;
        begin
          perform public.multideck_uk_vat_record_prior_period_error(user_id,e,period_id,
            '2025-10-01','2025-12-31','2026-07-17','later-discovered-error',
            'output',250,'undetermined','A later error was found after the first notification');
          if public.multideck_uk_vat_prior_error_status(user_id,e,period_id,false)
            ->>'method'<>'notification_history_review_required' then
            raise exception 'later discovery was offered as an ordinary current-return adjustment';
          end if;
          v_next:=public.multideck_uk_vat_record_external_error_notification(user_id,e,period_id,
            array[(select id from "FIN_IndirectTaxPriorPeriodErrorIntake"
              where source_reference='later-discovered-error')],
            '2026-07-18','letter','POST-TRACK-002',
            'This later error was notified separately by letter',true);
          if v_next->>'inserted'<>'true'
            or public.multideck_uk_vat_external_error_notifications(user_id,e,period_id)
              ->>'total'<>'2'
            or public.multideck_uk_vat_prior_error_status(user_id,e,period_id,false)
              ->>'method'<>'external_notification_evidence_recorded' then
            raise exception 'later-discovered error could not be recorded separately: %, %, %',
              v_next->>'inserted',
              public.multideck_uk_vat_external_error_notifications(user_id,e,period_id)->>'total',
              public.multideck_uk_vat_prior_error_status(user_id,e,period_id,false)->>'method';
          end if;
          raise exception 'later notification probe complete' using errcode='ZX002';
        exception when sqlstate 'ZX002' then null; end;
        begin
          update "FIN_IndirectTaxPriorErrorNotifications" set channel='letter'
            where id=(v_result->>'notificationId')::uuid;
          raise exception 'immutable notification evidence was changed';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_external_error_notifications(
            '00000000-0000-0000-0000-000000000017',e,period_id);
          raise exception 'foreign colleague read notification evidence';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_prior_error_conduct(
            '00000000-0000-0000-0000-000000000018',e,
            (select id from "FIN_IndirectTaxPriorPeriodErrorIntake" where source_reference='late-invoice-1'),
            'careless','Reviewer checked the original source and conduct');
          raise exception 'read-only colleague reviewed prior-period error conduct';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_prior_error_conduct(
            '00000000-0000-0000-0000-000000000017',e,
            (select id from "FIN_IndirectTaxPriorPeriodErrorIntake" where source_reference='late-invoice-1'),
            'careless','Reviewer checked the original source and conduct');
          raise exception 'foreign colleague reviewed prior-period error conduct';
        exception when sqlstate '42501' then null; end;
        v_result:=public.multideck_uk_vat_review_prior_error_conduct(user_id,e,
          (select id from "FIN_IndirectTaxPriorPeriodErrorIntake" where source_reference='late-invoice-1'),
          'careless','Reviewer checked the original source and conduct');
        if v_result->>'inserted'<>'true' or v_result->>'revision'<>'1'
          or public.multideck_uk_vat_review_prior_error_conduct(user_id,e,
            (select id from "FIN_IndirectTaxPriorPeriodErrorIntake" where source_reference='late-invoice-1'),
            'careless','Reviewer checked the original source and conduct')->>'inserted'<>'false'
          or public.multideck_uk_vat_prior_period_error_intake(user_id,e,period_id)
            #>>'{items,0,effective_conduct}'<>'careless'
          or public.multideck_uk_vat_prior_period_error_preview(user_id,e,period_id,false)
            ->>'conductReviewRequired'<>'false'
          or public.multideck_uk_vat_prior_period_error_preview(user_id,e,period_id,false)
            ->>'carelessDisclosureAdvisory'<>'true'
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='review_prior_period_vat_error_conduct'
            and "AuditEvent_RecordID"=(v_result->>'reviewId')::uuid) then
          raise exception 'conduct review was not recorded, read or audited'; end if;
        begin
          update "FIN_IndirectTaxPriorPeriodErrorConductReviews" set conduct='deliberate'
            where id=(v_result->>'reviewId')::uuid;
          raise exception 'immutable conduct review was changed';
        exception when sqlstate '22023' then null; end;
        v_result:=public.multideck_uk_vat_review_prior_error_conduct(user_id,e,
          (select id from "FIN_IndirectTaxPriorPeriodErrorIntake" where source_reference='late-invoice-1'),
          'deliberate','Further evidence showed deliberate treatment');
        if v_result->>'revision'<>'2'
          or public.multideck_uk_vat_prior_period_error_preview(user_id,e,period_id,false)
            ->>'method'<>'separate_notification' then
          raise exception 'revised deliberate conduct did not force separate notification'; end if;
        perform public.multideck_uk_vat_review_prior_error_conduct(user_id,e,
          (select id from "FIN_IndirectTaxPriorPeriodErrorIntake" where source_reference='late-invoice-1'),
          'careless','Further source review corrected the conduct finding');
        if jsonb_array_length(public.multideck_uk_vat_prior_period_error_intake(user_id,e,period_id)
          #>'{items,0,conduct_review_history}')<>3
          or public.multideck_uk_vat_prior_period_error_intake(user_id,e,period_id)
            #>>'{items,0,conduct_review_history,1,conduct}'<>'deliberate' then
          raise exception 'conduct review history did not preserve earlier revisions'; end if;
        begin
          perform public.multideck_uk_vat_list_periods('00000000-0000-0000-0000-000000000017',e);
          raise exception 'foreign company listed UK VAT periods';
        exception when sqlstate '42501' then null; end;
        begin
          insert into "FIN_IndirectTaxPeriods"(legal_entity_id,obligation_id,registration_id,jurisdiction_code,scheme_code,reporting_currency,start_date,end_date,created_by)
            values(other,obligation,registration,'GB','standard','GBP','2026-07-01','2026-09-30',user_id);
          raise exception 'cross-entity period was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          insert into "FIN_IndirectTaxPeriods"(legal_entity_id,obligation_id,registration_id,jurisdiction_code,scheme_code,reporting_currency,start_date,end_date,created_by)
            values(e,obligation,registration,'GB','standard','GBP','2026-09-01','2026-11-30',user_id);
          raise exception 'overlapping period was accepted';
        exception when sqlstate '23P01' then null; end;
        insert into "FIN_IndirectTaxEvidence"(legal_entity_id,jurisdiction_code,source_kind,source_id,source_posting_batch_id,source_document_id,source_document_line_id,source_version,currency_code,exchange_rate,signed_net_amount,signed_tax_amount,signed_net_reporting,signed_tax_reporting,recorded_by)
          values(e,'GB','posted_document_line',line,batch,doc,line,batch::text,'GBP',1,100,20,100,20,user_id) returning id into event_id;
        begin
          update "FIN_IndirectTaxEvidence" set signed_tax_reporting=0 where id=event_id;
          raise exception 'immutable event changed';
        exception when sqlstate '22023' then null; end;
        begin
          insert into "FIN_IndirectTaxEvidence"(legal_entity_id,jurisdiction_code,source_kind,source_id,source_posting_batch_id,source_document_id,source_document_line_id,source_version,currency_code,exchange_rate,signed_net_amount,signed_tax_amount,signed_net_reporting,signed_tax_reporting,recorded_by)
            values(e,'GB','posted_document_line',gen_random_uuid(),batch,doc,line,batch::text,'GBP',1,100,20,100,20,user_id);
          raise exception 'mismatched source was accepted';
        exception when sqlstate '22023' then null; end;
        insert into "FIN_IndirectTaxCalculations"(period_id,revision,calculation_version,source_digest,registration_snapshot,box_totals,exceptions,control_reconciliation,calculated_by)
          values(period_id,1,'uk-standard-v1',repeat('a',64),'{}','{}','[]','{}',user_id) returning id into calc_id;
        insert into "FIN_IndirectTaxDecisions"(evidence_id,revision,tax_point,scheme_code,treatment_code,reviewed_rule_reference,review_reason,reviewed_by)
          values(event_id,1,'2026-10-01','standard','domestic_sale','rule-1','Reviewed source',user_id) returning id into decision_id;
        begin
          insert into "FIN_IndirectTaxCalculationLines"(calculation_id,period_id,evidence_id,decision_id,box_number,signed_amount)
            values(calc_id,period_id,event_id,decision_id,1,20);
          raise exception 'out-of-period decision entered calculation';
        exception when sqlstate '22023' then null; end;
        insert into "FIN_IndirectTaxDecisions"(evidence_id,revision,tax_point,scheme_code,treatment_code,reviewed_rule_reference,review_reason,reviewed_by)
          values(event_id,2,'2026-07-15','standard','domestic_sale','rule-1','Correct tax point',user_id) returning id into decision_id;
        insert into "FIN_IndirectTaxCalculationLines"(calculation_id,period_id,evidence_id,decision_id,box_number,signed_amount)
          values(calc_id,period_id,event_id,decision_id,1,20);
        begin
          update "FIN_IndirectTaxDecisions" set tax_point='2026-07-16' where id=decision_id;
          raise exception 'reviewed decision changed';
        exception when sqlstate '22023' then null; end;
        if (public.multideck_uk_vat_review_evidence(user_id,event_id,'2026-07-15','Reviewed actual VAT tax point')->>'treatment')<>'domestic_sale' then
          raise exception 'review did not derive domestic sale from approved tax code';
        end if;
        update "FIN_TaxCodes" set "FINTax_TreatmentCategoryCode"='out_of_scope' where "FINTax_ID"='00000000-0000-0000-0000-000000000013';
        begin
          perform public.multideck_uk_vat_review_evidence(user_id,event_id,'2026-07-15','Outside-scope rule not established');
          raise exception 'ambiguous outside-scope treatment was accepted';
        exception when sqlstate '22023' then null; end;
        update "FIN_TaxCodes" set "FINTax_TreatmentCategoryCode"='domestic_standard' where "FINTax_ID"='00000000-0000-0000-0000-000000000013';
        update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=user_id;
        begin
          perform public.multideck_uk_vat_review_evidence(user_id,event_id,'2026-07-15','Attempt after access was revoked');
          raise exception 'revoked reviewer was accepted';
        exception when sqlstate '42501' then null; end;
        update "cmp_Users" set "User_AccessStatus"='active' where "User_ID"=user_id;
        update "FIN_TaxCodes" set "FINTax_EffectiveTo"='2026-07-14'
          where "FINTax_ID"='00000000-0000-0000-0000-000000000013';
        begin
          perform public.multideck_uk_vat_calculate_draft(user_id,period_id);
          raise exception 'changed tax-code effective dates left a reviewed VAT draft current';
        exception when sqlstate '22023' then
          if sqlerrm not like 'VAT source or approved treatment changed%' then raise; end if;
        end;
        update "FIN_TaxCodes" set "FINTax_EffectiveTo"=null
          where "FINTax_ID"='00000000-0000-0000-0000-000000000013';
        insert into "FIN_Documents" values('00000000-0000-0000-0000-000000000010',e,'draft',batch,'GBP',1,'2026-07-16',null,'credit_note');
        insert into "FIN_DocumentLines" values('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000010',-25,-5,-25,-5,'00000000-0000-0000-0000-000000000013','UK20',20);
        update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted',"FINDoc_NativePostedBy"=user_id
          where "FINDoc_ID"='00000000-0000-0000-0000-000000000010';
        if (select count(*) from "FIN_IndirectTaxEvidence" where source_document_id='00000000-0000-0000-0000-000000000010')<>1 then
          raise exception 'posting did not capture exactly one VAT candidate';
        end if;
        if exists(select 1 from "FIN_IndirectTaxDecisions" decision join "FIN_IndirectTaxEvidence" event on event.id=decision.evidence_id
          where event.source_document_id='00000000-0000-0000-0000-000000000010') then
          raise exception 'posting inferred a reviewed tax point or treatment';
        end if;
        begin
          perform public.multideck_uk_vat_calculate_draft(user_id,period_id);
          raise exception 'unreviewed posted credit entered the VAT draft';
        exception when sqlstate '22023' then null; end;
        perform public.multideck_uk_vat_review_evidence(user_id,
          (select id from "FIN_IndirectTaxEvidence" where source_document_id='00000000-0000-0000-0000-000000000010'),
          '2026-07-16','Reviewed credit note tax point');
        v_result:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
        if (v_result#>>'{boxes,1}')::numeric<>15 then
          raise exception 'VAT draft did not net the posted credit';
        end if;
        if (select calculation_version from "FIN_IndirectTaxCalculations"
          where id=(v_result->>'calculationId')::uuid)<>'uk-standard-v5' then
          raise exception 'VAT draft did not identify the rounded-return calculation version'; end if;
        -- Keep the production-like fixture unchanged after probing the exact
        -- one-penny discrepancy caused by rounding box 5 from raw values.
        begin
          insert into "FIN_Documents" values
            ('00000000-0000-0000-0000-000000000060',e,'draft',batch,'GBP',1,'2026-07-18',user_id,'sl_invoice','ROUND-SALE'),
            ('00000000-0000-0000-0000-000000000062',e,'draft',batch,'GBP',1,'2026-07-18',user_id,'pl_invoice','ROUND-PURCHASE');
          insert into "FIN_DocumentLines" values
            ('00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000060',0.0255,0.0051,0.0255,0.0051,
              '00000000-0000-0000-0000-000000000013','UK20',20),
            ('00000000-0000-0000-0000-000000000063','00000000-0000-0000-0000-000000000062',0.0245,0.0049,0.0245,0.0049,
              '00000000-0000-0000-0000-000000000013','UK20',20);
          update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
            where "FINDoc_ID" in ('00000000-0000-0000-0000-000000000060','00000000-0000-0000-0000-000000000062');
          perform public.multideck_uk_vat_review_evidence(user_id,
            (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000061'),
            '2026-07-18','Reviewed fractional VAT sale for return rounding');
          perform public.multideck_uk_vat_review_evidence(user_id,
            (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000063'),
            '2026-07-18','Reviewed fractional VAT purchase for return rounding');
          v_next:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
          if (v_next#>>'{boxes,1}')::numeric<>15.01
            or (v_next#>>'{boxes,3}')::numeric<>15.01
            or (v_next#>>'{boxes,4}')::numeric<>0
            or (v_next#>>'{boxes,5}')::numeric<>15.01 then
            raise exception 'VAT draft calculated box 5 from unrounded source values';
          end if;
          raise exception 'vat_rounding_probe_rollback';
        exception when sqlstate 'P0001' then
          if sqlerrm<>'vat_rounding_probe_rollback' then raise; end if;
        end;
        if v_result#>>'{controlStatus}'<>'unreconciled' then
          raise exception 'a draft bypassed VAT control reconciliation'; end if;
        if (public.multideck_uk_vat_list_periods(user_id,e)#>>'{periods,0,control_status}')<>'unreconciled' then
          raise exception 'period list implied a draft was reconciled';
        end if;
        if (public.multideck_uk_vat_list_periods(user_id,e)#>>'{periods,0,signed_transaction_count}')::integer<>0 then
          raise exception 'period list implied transactions were signed off'; end if;
        if (select count(*) from "FIN_IndirectTaxCalculationLines" where box_number=6 and signed_amount=-25)<>1 then
          raise exception 'credit source did not drill into box six';
        end if;
        insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_LegalEntityID","FINPostBatch_StatusCode","FINPostBatch_PeriodID")
          values('00000000-0000-0000-0000-000000000014',e,'posted','00000000-0000-0000-0000-000000000034');
        insert into "FIN_Documents" values('00000000-0000-0000-0000-000000000015',e,'posted',
          '00000000-0000-0000-0000-000000000014','GBP',1,'2026-07-17',user_id,'pl_invoice','HIST-1');
        insert into "FIN_TaxCodes" values('00000000-0000-0000-0000-000000000036',e,'GB','vat',true,
          '2026-06-01','UK20',20,'2020-01-01',null,'domestic_standard',true,
          '00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000033');
        insert into "FIN_DocumentLines" values('00000000-0000-0000-0000-000000000016',
          '00000000-0000-0000-0000-000000000015',50,10,50,10,
          '00000000-0000-0000-0000-000000000036','UK20',20);
        if (public.multideck_uk_vat_source_coverage(user_id,e)->>'missingCapturedLines')::integer<>1 then
          raise exception 'preflight missed a historical posted line';
        end if;
        begin
          perform public.multideck_uk_vat_source_coverage('00000000-0000-0000-0000-000000000017',e);
          raise exception 'foreign company read UK VAT coverage';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_backfill_posted('00000000-0000-0000-0000-000000000017',e,10,'Foreign company backfill attempt');
          raise exception 'foreign company backfilled UK VAT evidence';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_backfill_posted(user_id,e,10,'short');
          raise exception 'backfill accepted an inadequate reason';
        exception when sqlstate '22023' then null; end;
        if (public.multideck_uk_vat_backfill_posted(user_id,e,10,'Reviewed historical posting batch')->>'inserted')::integer<>1 then
          raise exception 'historical posted line was not captured';
        end if;
        if (public.multideck_uk_vat_backfill_posted(user_id,e,10,'Confirmed idempotent backfill run')->>'inserted')::integer<>0 then
          raise exception 'backfill duplicated existing evidence';
        end if;
        if not exists(select 1 from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000016'
          and capture_kind='historical_backfill' and capture_reason='Reviewed historical posting batch' and recorded_by=user_id) then
          raise exception 'backfill provenance was not preserved';
        end if;
        if (select count(*) from "Audit_Events" where "AuditEvent_Action"='historical_backfill' and "AuditEvent_UserID"=user_id)<>2 then
          raise exception 'backfill was not audited';
        end if;
        if (public.multideck_uk_vat_source_coverage(user_id,e)->>'unreviewedEvents')::integer<>1 then
          raise exception 'backfill inferred a tax decision';
        end if;
        if (public.multideck_uk_vat_review_queue(user_id,e,10)->>'totalUnreviewed')::integer<>1
          or (public.multideck_uk_vat_review_queue(user_id,e,10)#>>'{items,0,document_number}')<>'HIST-1' then
          raise exception 'review queue omitted the historical line';
        end if;
        if (public.multideck_uk_vat_review_queue('00000000-0000-0000-0000-000000000018',e,10)->>'totalUnreviewed')::integer<>1 then
          raise exception 'same-company compliance viewer could not read a colleague''s evidence';
        end if;
        begin
          perform public.multideck_uk_vat_review_evidence('00000000-0000-0000-0000-000000000018',
            (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000016'),
            '2026-07-17','Read-only colleague review attempt');
          raise exception 'read-only colleague reviewed VAT evidence';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_queue('00000000-0000-0000-0000-000000000017',e,10);
          raise exception 'foreign company read UK VAT review queue';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_calculate_draft(user_id,period_id);
          raise exception 'unreviewed historical line entered VAT draft';
        exception when sqlstate '22023' then null; end;
        if (public.multideck_uk_vat_review_evidence(user_id,
          (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000016'),
          '2026-07-17','Reviewed historical supplier VAT tax point')->>'treatment')<>'domestic_purchase' then
          raise exception 'historical supplier VAT review did not derive purchase treatment';
        end if;
        if (public.multideck_uk_vat_review_queue(user_id,e,10)->>'totalUnreviewed')::integer<>0 then
          raise exception 'reviewed event remained in the queue';
        end if;
        if not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='review_vat_evidence'
          and "AuditEvent_UserID"=user_id and "AuditEvent_MetadataJSON"->>'treatment'='domestic_purchase') then
          raise exception 'VAT review was not audited';
        end if;
        update "FIN_Documents" set "FINDoc_DueDate"='2026-03-01',"FINDoc_GrossAmount"=60
          where "FINDoc_ID"='00000000-0000-0000-0000-000000000015';
        perform public.multideck_uk_vat_review_evidence(user_id,
          (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000016'),
          '2026-03-01','Test an aged recoverable supplier VAT invoice');
        if public._multideck_uk_vat_unpaid_input_tax_risks(e,'2026-09-30')<>1 then
          raise exception 'unpaid supplier input VAT clawback was missed'; end if;
        v_result:=public.multideck_uk_vat_clawback_candidates(user_id,e,period_id);
        if (v_result->>'totalCandidates')::integer<>1
          or v_result#>>'{items,0,document_number}'<>'HIST-1'
          or (v_result#>>'{items,0,unpaid_at_period_end}')::numeric<>60
          or v_result#>>'{items,0,first_possible_clawback_date}'<>'2026-09-01' then
          raise exception 'clawback candidates did not identify the unpaid invoice and date'; end if;
        if (public.multideck_uk_vat_clawback_candidates('00000000-0000-0000-0000-000000000018',e,period_id)->>'totalCandidates')::integer<>1 then
          raise exception 'same-company compliance viewer could not read clawback candidates'; end if;
        begin
          perform public.multideck_uk_vat_clawback_candidates('00000000-0000-0000-0000-000000000017',e,period_id);
          raise exception 'foreign company read supplier clawback candidates';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_clawback_candidates(user_id,e,'00000000-0000-0000-0000-000000000099');
          raise exception 'unknown VAT period exposed clawback candidates';
        exception when sqlstate 'P0002' then null; end;
        update "FIN_Documents" set "FINDoc_DueDate"='2026-08-01'
          where "FINDoc_ID"='00000000-0000-0000-0000-000000000015';
        if public._multideck_uk_vat_unpaid_input_tax_risks(e,'2026-09-30')<>0 then
          raise exception 'supplier due date was ignored when checking six months'; end if;
        update "FIN_Documents" set "FINDoc_DueDate"='2026-03-01'
          where "FINDoc_ID"='00000000-0000-0000-0000-000000000015';
        begin
          perform public.multideck_uk_vat_calculate_draft(user_id,period_id);
          raise exception 'unpaid supplier input VAT reached VAT draft';
        exception when sqlstate '22023' then
          if sqlerrm not like '%may require six-month input VAT clawback%' then raise; end if;
        end;
        insert into "FIN_CashTransactions" values('00000000-0000-0000-0000-000000000066',e,
          'supplier_payment','posted','2026-10-01');
        insert into "FIN_CashAllocations" values('00000000-0000-0000-0000-000000000066',
          '00000000-0000-0000-0000-000000000015','allocated',60,'2026-10-01 12:00:00+00');
        if public._multideck_uk_vat_unpaid_input_tax_risks(e,'2026-09-30')<>1 then
          raise exception 'later payment erased a prior-period clawback risk'; end if;
        update "FIN_CashTransactions" set "FINCash_TransactionDate"='2026-09-01'
          where "FINCash_ID"='00000000-0000-0000-0000-000000000066';
        if public._multideck_uk_vat_unpaid_input_tax_risks(e,'2026-09-30')<>1 then
          raise exception 'backdated cash erased a risk before its actual allocation'; end if;
        update "FIN_CashAllocations" set "FINCashAlloc_AllocatedAt"='2026-09-01 12:00:00+00'
          where "FINCashAlloc_CashID"='00000000-0000-0000-0000-000000000066';
        update "FIN_CashAllocations" set "FINCashAlloc_AllocatedAmount"=30
          where "FINCashAlloc_CashID"='00000000-0000-0000-0000-000000000066';
        if public._multideck_uk_vat_unpaid_input_tax_risks(e,'2026-09-30')<>1 then
          raise exception 'partial payment hid unpaid supplier VAT'; end if;
        update "FIN_CashAllocations" set "FINCashAlloc_AllocatedAmount"=60
          where "FINCashAlloc_CashID"='00000000-0000-0000-0000-000000000066';
        if public._multideck_uk_vat_unpaid_input_tax_risks(e,'2026-09-30')<>0 then
          raise exception 'timely payment remained a clawback risk'; end if;
        update "FIN_CashAllocations" set "FINCashAlloc_AllocatedAt"='2026-09-30 23:30:00+00'
          where "FINCashAlloc_CashID"='00000000-0000-0000-0000-000000000066';
        if public._multideck_uk_vat_unpaid_input_tax_risks(e,'2026-09-30')<>1
          or (select paid_by_period_end from public._multideck_uk_vat_unpaid_input_tax_risk_rows(e,'2026-09-30'))<>0 then
          raise exception 'UK midnight allocation boundary erased a prior-period risk'; end if;
        update "FIN_CashAllocations" set "FINCashAlloc_AllocatedAt"='2026-09-30 22:30:00+00'
          where "FINCashAlloc_CashID"='00000000-0000-0000-0000-000000000066';
        if public._multideck_uk_vat_unpaid_input_tax_risks(e,'2026-09-30')<>1
          or (select paid_by_period_end from public._multideck_uk_vat_unpaid_input_tax_risk_rows(e,'2026-09-30'))<>60 then
          raise exception 'UK-local later payment did not retain repayment and restoration evidence'; end if;
        delete from "FIN_CashAllocations" where "FINCashAlloc_CashID"='00000000-0000-0000-0000-000000000066';
        delete from "FIN_CashTransactions" where "FINCash_ID"='00000000-0000-0000-0000-000000000066';
        update "FIN_Documents" set "FINDoc_DueDate"='2026-07-17'
          where "FINDoc_ID"='00000000-0000-0000-0000-000000000015';
        perform public.multideck_uk_vat_review_evidence(user_id,
          (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000016'),
          '2026-07-17','Restore the reviewed supplier VAT tax point');
        insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
          "FINPostLine_DocumentID","FINPostLine_DocumentLineID","FINPostLine_Description",
          "FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot") values
          (batch,1,'00000000-0000-0000-0000-000000000030',doc,line,'Sale',0,100,'GBP'),
          (batch,2,'00000000-0000-0000-0000-000000000031',doc,line,'Tax: sale',0,20,'GBP'),
          (batch,3,'00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010',
            '00000000-0000-0000-0000-000000000011','Credit',25,0,'GBP'),
          (batch,4,'00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000010',
            '00000000-0000-0000-0000-000000000011','Tax: credit',5,0,'GBP'),
          ('00000000-0000-0000-0000-000000000014',1,'00000000-0000-0000-0000-000000000032',
            '00000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000016','Purchase',50,0,'GBP'),
          ('00000000-0000-0000-0000-000000000014',2,'00000000-0000-0000-0000-000000000033',
            '00000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000016','Tax: purchase',10,0,'GBP');
        insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_LegalEntityID","FINPostBatch_StatusCode","FINPostBatch_PeriodID","FINPostBatch_SourceTable")
          values('00000000-0000-0000-0000-000000000035',e,'posted','00000000-0000-0000-0000-000000000034','FIN_Journals');
        insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
          "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot")
          values
            ('00000000-0000-0000-0000-000000000035',1,'00000000-0000-0000-0000-000000000031',
              'Direct adjustment without a tax label',2,0,'GBP'),
            ('00000000-0000-0000-0000-000000000035',2,'00000000-0000-0000-0000-000000000031',
              'Foreign-currency VAT adjustment',0,3,'USD'),
            ('00000000-0000-0000-0000-000000000035',3,'00000000-0000-0000-0000-000000000030',
              'Tax: wrong nominal',0,1,'GBP');
        v_result:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
        if (v_result#>>'{boxes,4}')::numeric<>10
          or (select count(*) from "FIN_IndirectTaxCalculationLines" where box_number=7 and signed_amount=50)<>1 then
          raise exception 'historical purchase did not reach boxes four and seven';
        end if;
        if (select control_reconciliation#>>'{sourceLedger,status}' from "FIN_IndirectTaxCalculations"
          where id=(v_result->>'calculationId')::uuid)<>'matched' then
          raise exception 'native VAT source lines did not reconcile to the ledger'; end if;
        begin
          insert into "FIN_TaxCodes" values
            ('00000000-0000-0000-0000-000000000075',e,'GB','vat',true,'2026-06-01','UK0',0,
              '2020-01-01',null,'zero_rated',true,'00000000-0000-0000-0000-000000000031',
              '00000000-0000-0000-0000-000000000033'),
            ('00000000-0000-0000-0000-000000000076',e,'GB','vat',true,'2026-06-01','EXEMPT',0,
              '2020-01-01',null,'exempt',true,'00000000-0000-0000-0000-000000000031',
              '00000000-0000-0000-0000-000000000033');
          insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_LegalEntityID","FINPostBatch_StatusCode","FINPostBatch_PeriodID")
            values('00000000-0000-0000-0000-000000000070',e,'posted','00000000-0000-0000-0000-000000000034');
          insert into "FIN_Documents" values
            ('00000000-0000-0000-0000-000000000071',e,'draft','00000000-0000-0000-0000-000000000070',
              'GBP',1,'2026-07-18',user_id,'pl_invoice','ZERO-PURCHASE'),
            ('00000000-0000-0000-0000-000000000073',e,'draft','00000000-0000-0000-0000-000000000070',
              'GBP',1,'2026-07-18',user_id,'pl_invoice','EXEMPT-PURCHASE');
          insert into "FIN_DocumentLines" values
            ('00000000-0000-0000-0000-000000000072','00000000-0000-0000-0000-000000000071',
              25.49,0,25.49,0,'00000000-0000-0000-0000-000000000075','UK0',0),
            ('00000000-0000-0000-0000-000000000074','00000000-0000-0000-0000-000000000073',
              30,0,30,0,'00000000-0000-0000-0000-000000000076','EXEMPT',0);
          update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
            where "FINDoc_ID" in ('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000073');
          insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
            "FINPostLine_DocumentID","FINPostLine_DocumentLineID","FINPostLine_Description",
            "FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot") values
            ('00000000-0000-0000-0000-000000000070',1,'00000000-0000-0000-0000-000000000032',
              '00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000072',
              'Zero-rated purchase',25.49,0,'GBP'),
            ('00000000-0000-0000-0000-000000000070',2,'00000000-0000-0000-0000-000000000032',
              '00000000-0000-0000-0000-000000000073','00000000-0000-0000-0000-000000000074',
              'Exempt purchase',30,0,'GBP');
          if public.multideck_uk_vat_review_evidence(user_id,
            (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000072'),
            '2026-07-18','Reviewed domestic zero-rated purchase tax point')->>'treatment'<>'zero_rated_purchase' then
            raise exception 'zero-rated purchase treatment was not reviewed'; end if;
          if public.multideck_uk_vat_review_evidence(user_id,
            (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000074'),
            '2026-07-18','Reviewed domestic exempt purchase tax point')->>'treatment'<>'exempt_purchase' then
            raise exception 'exempt purchase treatment was not reviewed'; end if;
          v_next:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
          if (v_next#>>'{boxes,4}')::numeric<>10 or (v_next#>>'{boxes,7}')::numeric<>105.49
            or v_next#>>'{sourceLedger,status}'<>'matched' then
            raise exception 'zero-tax purchases did not reconcile into box seven without input VAT'; end if;
          if (public.multideck_uk_vat_filing_projection_preview(user_id,e,
            (v_next->>'calculationId')::uuid)#>>'{filedBoxes,7}')::numeric<>105
            or (public.multideck_uk_vat_filing_projection_preview(user_id,e,
              (v_next->>'calculationId')::uuid)#>>'{sourceBoxes,7}')::numeric<>105.49 then
            raise exception 'whole-pound preview lost the pence source or rounded incorrectly'; end if;
          begin
            insert into "FIN_Documents" values
              ('00000000-0000-0000-0000-000000000077',e,'draft','00000000-0000-0000-0000-000000000070',
                'GBP',1,'2026-07-18',user_id,'pl_invoice','INVALID-ZERO-PURCHASE');
            insert into "FIN_DocumentLines" values
              ('00000000-0000-0000-0000-000000000078','00000000-0000-0000-0000-000000000077',
                10,1,10,1,'00000000-0000-0000-0000-000000000075','UK0',0);
            update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
              where "FINDoc_ID"='00000000-0000-0000-0000-000000000077';
            perform public.multideck_uk_vat_review_evidence(user_id,
              (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000078'),
              '2026-07-18','Reject VAT charged on a zero-rated purchase');
            raise exception 'inconsistent zero-rate purchase was accepted';
          exception when sqlstate '22023' then
            if sqlerrm not like 'This UK VAT treatment needs a separate reviewed rule%' then raise; end if;
          end;
          raise exception 'vat_zero_purchase_probe_rollback';
        exception when sqlstate 'P0001' then
          if sqlerrm<>'vat_zero_purchase_probe_rollback' then raise; end if;
        end;
        begin
          insert into "FIN_TaxCodes" values
            ('00000000-0000-0000-0000-000000000079',e,'GB','vat',true,'2026-06-01','OS-SERVICE',0,
              '2020-01-01',null,'outside_uk_service_box6',false,'00000000-0000-0000-0000-000000000031',null);
          insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_LegalEntityID","FINPostBatch_StatusCode","FINPostBatch_PeriodID")
            values('00000000-0000-0000-0000-000000000080',e,'posted','00000000-0000-0000-0000-000000000034');
          insert into "FIN_Documents" values
            ('00000000-0000-0000-0000-000000000081',e,'draft','00000000-0000-0000-0000-000000000080',
              'GBP',1,'2026-07-19',user_id,'sl_invoice','OUTSIDE-UK-SERVICE'),
            ('00000000-0000-0000-0000-000000000083',e,'draft','00000000-0000-0000-0000-000000000080',
              'GBP',1,'2026-07-19',user_id,'credit_note','OUTSIDE-UK-SERVICE-CREDIT');
          insert into "FIN_DocumentLines" values
            ('00000000-0000-0000-0000-000000000082','00000000-0000-0000-0000-000000000081',
              100,0,100,0,'00000000-0000-0000-0000-000000000079','OS-SERVICE',0),
            ('00000000-0000-0000-0000-000000000084','00000000-0000-0000-0000-000000000083',
              -20,0,-20,0,'00000000-0000-0000-0000-000000000079','OS-SERVICE',0);
          update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
            where "FINDoc_ID" in ('00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000083');
          insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
            "FINPostLine_DocumentID","FINPostLine_DocumentLineID","FINPostLine_Description",
            "FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot") values
            ('00000000-0000-0000-0000-000000000080',1,'00000000-0000-0000-0000-000000000030',
              '00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000082',
              'Outside-UK service sale',0,100,'GBP'),
            ('00000000-0000-0000-0000-000000000080',2,'00000000-0000-0000-0000-000000000030',
              '00000000-0000-0000-0000-000000000083','00000000-0000-0000-0000-000000000084',
              'Outside-UK service credit',20,0,'GBP');
          if public.multideck_uk_vat_review_evidence(user_id,
            (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000082'),
            '2026-07-19','Reviewed service place of supply outside the UK')->>'treatment'<>'outside_uk_service_sale' then
            raise exception 'outside-UK service sale was not reviewed'; end if;
          if public.multideck_uk_vat_review_evidence(user_id,
            (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000084'),
            '2026-07-19','Reviewed credit for outside-UK service')->>'treatment'<>'outside_uk_service_sale' then
            raise exception 'outside-UK service credit was not reviewed'; end if;
          v_next:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
          if (v_next#>>'{boxes,6}')::numeric<>(v_result#>>'{boxes,6}')::numeric+80
            or (v_next#>>'{boxes,1}')::numeric<>(v_result#>>'{boxes,1}')::numeric
            or v_next#>>'{sourceLedger,status}'<>'matched'
            or (select count(*) from "FIN_IndirectTaxCalculationLines"
                where calculation_id=(v_next->>'calculationId')::uuid and box_number=6
                  and evidence_id in (select id from "FIN_IndirectTaxEvidence" where source_document_line_id in
                    ('00000000-0000-0000-0000-000000000082','00000000-0000-0000-0000-000000000084')))<>2 then
            raise exception 'outside-UK services failed box-six or source-ledger checks'; end if;
          insert into "FIN_Documents" values
            ('00000000-0000-0000-0000-000000000085',e,'draft','00000000-0000-0000-0000-000000000080',
              'GBP',1,'2026-07-19',user_id,'sl_invoice','INVALID-OUTSIDE-UK-SERVICE');
          insert into "FIN_DocumentLines" values
            ('00000000-0000-0000-0000-000000000086','00000000-0000-0000-0000-000000000085',
              10,2,10,2,'00000000-0000-0000-0000-000000000079','OS-SERVICE',0);
          update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
            where "FINDoc_ID"='00000000-0000-0000-0000-000000000085';
          begin
            perform public.multideck_uk_vat_review_evidence(user_id,
              (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000086'),
              '2026-07-19','Reject UK VAT charged on an outside-UK service');
            raise exception 'outside-UK service with UK VAT was accepted';
          exception when sqlstate '22023' then
            if sqlerrm not like 'This UK VAT treatment needs a separate reviewed rule%' then raise; end if;
          end;
          raise exception 'vat_outside_uk_service_probe_rollback';
        exception when sqlstate 'P0001' then
          if sqlerrm<>'vat_outside_uk_service_probe_rollback' then raise; end if;
        end;
        if (v_result->>'approvalAvailable')::boolean is not false
          or v_result->>'controlStatus'<>'unreconciled' then
          raise exception 'matched source postings were mistaken for full VAT control reconciliation'; end if;
        update "FIN_TaxCodes" set "FINTax_IsRecoverable"=false
          where "FINTax_ID"='00000000-0000-0000-0000-000000000036';
        if (public.multideck_uk_vat_review_evidence(user_id,
          (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000016'),
          '2026-07-17','Reviewed nonrecoverable supplier tax')->>'treatment')<>'nonrecoverable_purchase' then
          raise exception 'nonrecoverable purchase treatment was not recorded'; end if;
        v_result:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
        if (v_result#>>'{boxes,4}')::numeric<>0
          or (v_result#>>'{boxes,7}')::numeric<>50
          or v_result#>>'{sourceLedger,status}'<>'mismatch' then
          raise exception 'old input VAT posting was accepted for nonrecoverable purchase'; end if;
        update "FIN_PostingLines" set "FINPostLine_NominalAccountID"='00000000-0000-0000-0000-000000000032',
          "FINPostLine_Description"='Nonrecoverable tax: purchase'
          where "FINPostLine_BatchID"='00000000-0000-0000-0000-000000000014'
            and "FINPostLine_DocumentLineID"='00000000-0000-0000-0000-000000000016'
            and "FINPostLine_Description" like 'Tax:%';
        v_result:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
        if v_result#>>'{sourceLedger,status}'<>'matched' then
          raise exception 'nonrecoverable tax charged to purchase cost did not match the source'; end if;
        update "FIN_PostingLines" set "FINPostLine_NominalAccountID"='00000000-0000-0000-0000-000000000033',
          "FINPostLine_Description"='Tax: purchase'
          where "FINPostLine_BatchID"='00000000-0000-0000-0000-000000000014'
            and "FINPostLine_DocumentLineID"='00000000-0000-0000-0000-000000000016'
            and "FINPostLine_Description" like 'Nonrecoverable tax:%';
        update "FIN_TaxCodes" set "FINTax_IsRecoverable"=true
          where "FINTax_ID"='00000000-0000-0000-0000-000000000036';
        if (public.multideck_uk_vat_review_evidence(user_id,
          (select id from "FIN_IndirectTaxEvidence" where source_document_line_id='00000000-0000-0000-0000-000000000016'),
          '2026-07-17','Restored reviewed recoverable supplier VAT')->>'treatment')<>'domestic_purchase' then
          raise exception 'recoverable purchase could not be restored'; end if;
        v_result:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
        v_matched_digest:=v_result->>'sourceDigest';
        update "FIN_PostingLines" set "FINPostLine_CreditAmount"=19
          where "FINPostLine_BatchID"=batch and "FINPostLine_DocumentLineID"=line
            and "FINPostLine_Description" like 'Tax:%';
        v_result:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
        if (select control_reconciliation#>>'{sourceLedger,status}' from "FIN_IndirectTaxCalculations"
          where id=(v_result->>'calculationId')::uuid)<>'mismatch'
          or v_result->>'sourceDigest'=v_matched_digest then
          raise exception 'incorrect native VAT posting was not reported'; end if;
        update "FIN_PostingLines" set "FINPostLine_CreditAmount"=20
          where "FINPostLine_BatchID"=batch and "FINPostLine_DocumentLineID"=line
            and "FINPostLine_Description" like 'Tax:%';
        v_result:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
        if v_result->>'sourceDigest'<>v_matched_digest then
          raise exception 'restored native ledger did not restore the source fingerprint'; end if;
        update "FIN_DocumentLines" set "FINDocLine_LocalNetAmount"=-24
          where "FINDocLine_ID"='00000000-0000-0000-0000-000000000011';
        begin
          perform public.multideck_uk_vat_calculate_draft(user_id,period_id);
          raise exception 'changed posted source line was accepted before VAT sign-off';
        exception when sqlstate '22023' then
          if sqlerrm not like 'VAT source or approved treatment changed%' then raise; end if;
        end;
        update "FIN_DocumentLines" set "FINDocLine_LocalNetAmount"=-25
          where "FINDocLine_ID"='00000000-0000-0000-0000-000000000011';
        v_result:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
        if v_result->>'sourceDigest'<>v_matched_digest then
          raise exception 'restored source line did not restore the reviewed fingerprint'; end if;
        calc_id:=(v_result->>'calculationId')::uuid;
        update "FIN_PostingLines" set "FINPostLine_NominalAccountID"='00000000-0000-0000-0000-000000000030'
          where "FINPostLine_BatchID"=batch and "FINPostLine_DocumentLineID"=line
            and "FINPostLine_Description" like 'Tax:%';
        v_result:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
        if (select control_reconciliation#>>'{sourceLedger,status}' from "FIN_IndirectTaxCalculations"
          where id=(v_result->>'calculationId')::uuid)<>'mismatch'
          or (select control_reconciliation#>>'{sourceLedger,mismatchSample,0,expectedTaxNominalId}'
            from "FIN_IndirectTaxCalculations" where id=(v_result->>'calculationId')::uuid)
            <>'00000000-0000-0000-0000-000000000031'
          or (select control_reconciliation#>>'{sourceLedger,mismatchSample,0,expectedTaxNominalCode}'
            from "FIN_IndirectTaxCalculations" where id=(v_result->>'calculationId')::uuid)<>'2100'
          or (select control_reconciliation#>>'{sourceLedger,mismatchSample,0,postedTaxNominalCodes,0}'
            from "FIN_IndirectTaxCalculations" where id=(v_result->>'calculationId')::uuid)<>'4000'
          or v_result->>'sourceDigest'=v_matched_digest then
          raise exception 'VAT amount on a non-VAT nominal was treated as matched'; end if;
        begin
          perform public.multideck_uk_vat_reconcile_transactions(user_id,e,calc_id,v_matched_digest,
            array[event_id],'Attempted sign-off after the VAT nominal changed');
          raise exception 'stale VAT nominal mapping allowed transaction sign-off';
        exception when sqlstate '22023' then null; end;
        update "FIN_PostingLines" set "FINPostLine_NominalAccountID"='00000000-0000-0000-0000-000000000031'
          where "FINPostLine_BatchID"=batch and "FINPostLine_DocumentLineID"=line
            and "FINPostLine_Description" like 'Tax:%';
        v_result:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
        if v_result->>'sourceDigest'<>v_matched_digest then
          raise exception 'restored VAT nominal did not restore the source fingerprint'; end if;
        update "FIN_TaxCodes" set "FINTax_OutputNominalID"='00000000-0000-0000-0000-000000000030'
          where "FINTax_ID"='00000000-0000-0000-0000-000000000013';
        v_result:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
        if (select control_reconciliation#>>'{sourceLedger,status}' from "FIN_IndirectTaxCalculations"
          where id=(v_result->>'calculationId')::uuid)<>'mismatch'
          or v_result->>'sourceDigest'=v_matched_digest then
          raise exception 'changed tax-code VAT mapping did not invalidate the draft'; end if;
        update "FIN_TaxCodes" set "FINTax_OutputNominalID"='00000000-0000-0000-0000-000000000031'
          where "FINTax_ID"='00000000-0000-0000-0000-000000000013';
        v_result:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
        if v_result->>'sourceDigest'<>v_matched_digest then
          raise exception 'restored VAT mapping did not restore the source fingerprint'; end if;
        calc_id:=(v_result->>'calculationId')::uuid;
        v_result:=public.multideck_uk_vat_tax_posting_inventory('00000000-0000-0000-0000-000000000018',e,calc_id,0,2);
        if (v_result->>'totalLines')::integer<>6
          or (v_result->>'linkedLines')::integer<>3
          or (v_result->>'unlinkedLines')::integer<>3
          or (v_result->>'taxLinesOffVatAccounts')::integer<>1
          or (v_result->>'nonGbpLines')::integer<>1
          or (v_result->>'totalDebitGbp')::numeric<>17
          or (v_result->>'totalCreditGbp')::numeric<>21
          or (v_result->>'linkedVatAccountDebitGbp')::numeric<>15
          or (v_result->>'linkedVatAccountCreditGbp')::numeric<>20
          or (v_result->>'unlinkedVatAccountDebitGbp')::numeric<>2
          or (v_result->>'unlinkedVatAccountCreditGbp')::numeric<>0
          or (v_result->>'taxOffVatAccountDebitGbp')::numeric<>0
          or (v_result->>'taxOffVatAccountCreditGbp')::numeric<>1
          or (v_result#>>'{controlBridge,sourceVatDueGbp}')::numeric<>5
          or (v_result#>>'{controlBridge,vatAccountNetCreditGbp}')::numeric<>3
          or (v_result#>>'{controlBridge,differenceGbp}')::numeric<>-2
          or (v_result#>>'{controlBridge,expectedTaxPostingLines}')::integer<>3
          or (v_result#>>'{controlBridge,linkedVatAccountTaxLines}')::integer<>3
          or (v_result#>>'{controlBridge,accountingCoverageExact}')::boolean is not true
          or jsonb_array_length(v_result->'rows')<>2 then
          raise exception 'VAT-account GL posting inventory missed the direct journal or source links'; end if;
        insert into "FIN_Periods"("FINPeriod_ID","FINPeriod_LegalEntityID","FINPeriod_StartDate","FINPeriod_EndDate")
          values('00000000-0000-0000-0000-000000000037',e,'2026-09-30','2026-10-01');
        v_result:=public.multideck_uk_vat_tax_posting_inventory(user_id,e,calc_id,0,2);
        if (v_result#>>'{controlBridge,accountingCoverageExact}')::boolean is not false
          or (v_result#>>'{controlBridge,daysWithoutOneAccountingPeriod}')::integer<>1
          or (v_result#>>'{controlBridge,straddlingAccountingPeriods}')::integer<>1 then
          raise exception 'overlapping accounting-period scope was shown as exact'; end if;
        delete from "FIN_Periods" where "FINPeriod_ID"='00000000-0000-0000-0000-000000000037';
        begin
          perform public.multideck_uk_vat_tax_posting_inventory('00000000-0000-0000-0000-000000000017',e,calc_id,0,10);
          raise exception 'foreign company read VAT tax postings';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_tax_posting_inventory(user_id,e,calc_id,0,101);
          raise exception 'unbounded VAT tax posting page was accepted';
        exception when sqlstate '22023' then null; end;
        v_result:=public.multideck_uk_vat_account('00000000-0000-0000-0000-000000000018',e,calc_id,0,2);
        if (v_result->>'totalTransactions')::integer<>3
          or (v_result->>'signedTransactions')::integer<>0
          or jsonb_array_length(v_result->'rows')<>2
          or (v_result#>>'{rawBoxTotals,1}')::numeric<>15
          or (v_result#>>'{rawBoxTotals,4}')::numeric<>10
          or (v_result#>>'{returnBoxes,5}')::numeric<>5
          or v_result->>'controlStatus'<>'unreconciled' then
          raise exception 'VAT account did not connect source totals to the draft return'; end if;
        begin
          perform public.multideck_uk_vat_account('00000000-0000-0000-0000-000000000017',e,calc_id,0,10);
          raise exception 'foreign company read the VAT account';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_account(user_id,other,calc_id,0,10);
          raise exception 'another entity read the VAT account';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_account(user_id,e,calc_id,0,101);
          raise exception 'unbounded VAT account page was accepted';
        exception when sqlstate '22023' then null; end;
        v_result:=public.multideck_uk_vat_calculation_detail('00000000-0000-0000-0000-000000000018',e,calc_id,0,2);
        if (v_result->>'sourceDigest') is null or (v_result->>'latestRevision')::boolean is not true
          or (v_result->>'totalLines')::integer<>6 or jsonb_array_length(v_result->'lines')<>2
          or (v_result#>>'{lines,0,decision_id}') is null or (v_result#>>'{lines,0,source_version}') is null
          or v_result::text like '%other-company-source%' then
          raise exception 'VAT calculation did not expose bounded, sourced box detail to a same-company viewer';
        end if;
        begin
          perform public.multideck_uk_vat_calculation_detail('00000000-0000-0000-0000-000000000017',e,calc_id,0,10);
          raise exception 'foreign company read UK VAT calculation detail';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_calculation_detail(user_id,other,calc_id,0,10);
          raise exception 'another entity read UK VAT calculation detail';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_calculation_detail(user_id,e,calc_id,0,101);
          raise exception 'unbounded UK VAT calculation page was accepted';
        exception when sqlstate '22023' then null; end;
        if exists(select 1 from "FIN_IndirectTaxReconciliations") then
          raise exception 'a draft calculation silently dated VAT reconciliation'; end if;
        v_result:=public.multideck_uk_vat_document_reconciliation(user_id,e,doc);
        if v_result->>'status'<>'pending' or v_result->>'vatReconciledAt' is not null
          or (v_result->>'sourceLocked')::boolean is not false then
          raise exception 'an unsigned document was shown as VAT reconciled'; end if;
        begin
          perform public.multideck_uk_vat_reconcile_transactions('00000000-0000-0000-0000-000000000018',e,
            calc_id,v_matched_digest,array[event_id],'Read-only colleague attempted VAT reconciliation');
          raise exception 'read-only colleague reconciled VAT';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_reconcile_transactions('00000000-0000-0000-0000-000000000017',e,
            calc_id,v_matched_digest,array[event_id],'Foreign company attempted VAT reconciliation');
          raise exception 'foreign company reconciled VAT';
        exception when sqlstate '42501' then null; end;
        insert into "FIN_DocumentLineJobLinks"("FINDocLineJob_ID","FINDocLineJob_DocumentID","FINDocLineJob_DocumentLineID")
          values('00000000-0000-0000-0000-000000000087',doc,line);
        begin
          insert into "FIN_IndirectTaxReconciliations"(
            period_id,calculation_id,evidence_id,decision_id,source_digest,
            reconciled_at,reconciled_by,reason
          ) values (period_id,calc_id,event_id,
            (select decision.id from "FIN_IndirectTaxDecisions" decision
              where decision.evidence_id=event_id order by revision desc limit 1),
            v_matched_digest,'2000-01-01'::timestamptz,user_id,
            'Privileged timestamp override probe for signed VAT evidence')
          returning reconciled_at into v_reconciled_at;
          if v_reconciled_at<>now() then
            raise exception 'the database accepted a caller-supplied VAT reconciliation date'; end if;
          raise exception 'vat_timestamp_probe_rollback';
        exception when sqlstate 'P0001' then
          if sqlerrm<>'vat_timestamp_probe_rollback' then raise; end if;
        end;
        v_result:=public.multideck_uk_vat_reconcile_transactions(user_id,e,calc_id,v_matched_digest,
          array[event_id],'Finance reviewer signed off the source and VAT posting');
        if (v_result->>'inserted')::integer<>1 or (v_result#>>'{transactions,0,vatReconciledAt}') is null then
          raise exception 'explicit VAT sign-off did not record its date'; end if;
        v_reconciled_at:=(v_result#>>'{transactions,0,vatReconciledAt}')::timestamptz;
        calc_id:=(v_result->>'calculationId')::uuid;
        v_result:=public.multideck_uk_vat_account(user_id,e,calc_id,0,100);
        if (v_result->>'signedTransactions')::integer<>1
          or (select count(*) from jsonb_array_elements(v_result->'rows') item
              where item->>'evidence_id'=event_id::text
                and (item->>'vat_reconciled_at')::timestamptz=v_reconciled_at
                and (item->>'source_locked')::boolean is true)<>1 then
          raise exception 'VAT account did not show the recorded transaction date'; end if;
        if (public.multideck_uk_vat_list_periods(user_id,e)#>>'{periods,0,signed_transaction_count}')::integer<>1
          or (public.multideck_uk_vat_list_periods(user_id,e)#>>'{periods,0,transaction_count}')::integer<2 then
          raise exception 'period list did not count the dated transaction sign-off'; end if;
        if not exists(select 1 from "FIN_IndirectTaxReconciliations" signed
          where signed.evidence_id=event_id and signed.reconciled_at=v_reconciled_at
            and signed.reconciled_by=user_id and signed.source_digest=v_matched_digest)
          or not exists(select 1 from "FIN_IndirectTaxEvidencePeriods" assigned
            where assigned.evidence_id=event_id
              and assigned.period_id=(select calculation.period_id from "FIN_IndirectTaxCalculations" calculation
                where calculation.id=calc_id)
              and assigned.first_reconciled_by=user_id
              and assigned.first_reconciled_at=v_reconciled_at)
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='reconcile_vat_transactions'
            and "AuditEvent_UserID"=user_id and "AuditEvent_RecordID"=period_id) then
          raise exception 'VAT reconciliation date, reviewer or audit was not retained'; end if;
        if (select count(*) from jsonb_array_elements(
          public.multideck_uk_vat_calculation_detail(user_id,e,calc_id,0,100)->'lines') item
          where item->>'evidence_id'=event_id::text and item->>'vat_reconciled_at' is not null
            and (item->>'source_locked')::boolean is true)<>2 then
          raise exception 'source drill-down did not show the VAT reconciled date'; end if;
        v_result:=public.multideck_uk_vat_document_reconciliation(user_id,e,doc);
        if v_result->>'status'<>'reconciled' or (v_result->>'reconciledLines')::integer<>1
          or (v_result->>'vatReconciledAt')::timestamptz<>v_reconciled_at
          or (v_result->>'firstCompleteVatReconciledAt')::timestamptz<>v_reconciled_at
          or (v_result->>'sourceLocked')::boolean is not true then
          raise exception 'finance document did not expose its complete VAT reconciliation date'; end if;
        begin
          declare v_later_calculation uuid;
          begin
            insert into "FIN_IndirectTaxCalculations"(period_id,revision,calculation_version,
              source_digest,registration_snapshot,box_totals,exceptions,control_reconciliation,calculated_by)
            select prior.period_id,prior.revision+1,prior.calculation_version,repeat('c',64),
              prior.registration_snapshot,prior.box_totals,prior.exceptions,
              prior.control_reconciliation,prior.calculated_by
            from "FIN_IndirectTaxCalculations" prior where prior.id=calc_id
            returning id into v_later_calculation;
            insert into "FIN_IndirectTaxCalculationLines"(calculation_id,period_id,evidence_id,
              decision_id,box_number,signed_amount)
            select v_later_calculation,prior.period_id,prior.evidence_id,prior.decision_id,
              prior.box_number,prior.signed_amount
            from "FIN_IndirectTaxCalculationLines" prior where prior.calculation_id=calc_id;
            v_result:=public.multideck_uk_vat_document_reconciliation(user_id,e,doc);
            if v_result->>'status'<>'pending' or v_result->>'vatReconciledAt' is not null
              or (v_result->>'firstCompleteVatReconciledAt')::timestamptz<>v_reconciled_at
              or (v_result->>'sourceLocked')::boolean is not true then
              raise exception 'a later calculation hid the original VAT sign-off date or source lock'; end if;
            raise exception 'vat_history_probe_rollback';
          exception when sqlstate 'P0001' then
            if sqlerrm<>'vat_history_probe_rollback' then raise; end if;
          end;
        end;
        if (public.multideck_uk_vat_document_reconciliation('00000000-0000-0000-0000-000000000018',e,doc)->>'status')<>'reconciled' then
          raise exception 'same-company compliance viewer could not read a colleague VAT date'; end if;
        begin
          perform public.multideck_uk_vat_document_reconciliation('00000000-0000-0000-0000-000000000017',e,doc);
          raise exception 'foreign company read a VAT reconciliation date';
        exception when sqlstate '42501' then null; end;
        v_result:=public.multideck_uk_vat_reconcile_transactions(user_id,e,calc_id,v_matched_digest,
          array[event_id],'Rechecking the same VAT reconciliation sign-off');
        if (v_result->>'inserted')::integer<>0
          or (v_result#>>'{transactions,0,vatReconciledAt}')::timestamptz<>v_reconciled_at then
          raise exception 'repeated VAT sign-off changed its original date'; end if;
        calc_id:=(v_result->>'calculationId')::uuid;
        begin
          perform public.multideck_uk_vat_review_control(user_id,e,calc_id,v_matched_digest,
            'Reviewed the draft and VAT control postings');
          raise exception 'incomplete transaction sign-offs passed control review';
        exception when sqlstate '22023' then null; end;
        v_result:=public.multideck_uk_vat_reconcile_transactions(user_id,e,calc_id,v_matched_digest,
          array(select distinct source.evidence_id from "FIN_IndirectTaxCalculationLines" source
            where source.calculation_id=calc_id and source.evidence_id<>event_id),
          'Reviewed the remaining source and VAT postings');
        if (v_result->>'inserted')::integer<>2 then
          raise exception 'remaining transactions were not signed off'; end if;
        calc_id:=(v_result->>'calculationId')::uuid;
        begin
          perform public.multideck_uk_vat_review_control('00000000-0000-0000-0000-000000000018',e,
            calc_id,v_matched_digest,'Read-only colleague attempted control review');
          raise exception 'read-only colleague recorded a VAT control review';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_control('00000000-0000-0000-0000-000000000017',e,
            calc_id,v_matched_digest,'Foreign company attempted control review');
          raise exception 'foreign company recorded a VAT control review';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_control(user_id,e,calc_id,v_matched_digest,
            'Reviewed the unlinked direct VAT journal');
          raise exception 'unlinked direct journal passed VAT control review';
        exception when sqlstate '22023' then null; end;
        delete from "FIN_PostingLines" where "FINPostLine_BatchID"='00000000-0000-0000-0000-000000000035';
        v_result:=public.multideck_uk_vat_review_control(user_id,e,calc_id,v_matched_digest,
          'Reconciled every source to the VAT control movement');
        if (v_result->>'inserted')::boolean is not true
          or (v_result#>>'{bridge,differenceGbp}')::numeric<>0
          or (select count(*) from "FIN_IndirectTaxControlReviews")<>1 then
          raise exception 'clean VAT control review was not recorded'; end if;
        v_control_review:=(v_result->>'reviewId')::uuid;
        v_control_at:=(v_result->>'reviewedAt')::timestamptz;
        calc_id:=(v_result->>'calculationId')::uuid;
        begin
          perform public.multideck_uk_vat_review_whole_pounds('00000000-0000-0000-0000-000000000018',e,
            calc_id,v_matched_digest,'Read-only colleague attempted filing-value review');
          raise exception 'read-only colleague reviewed VAT filing values';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_whole_pounds('00000000-0000-0000-0000-000000000017',e,
            calc_id,v_matched_digest,'Foreign company attempted filing-value review');
          raise exception 'foreign company reviewed VAT filing values';
        exception when sqlstate '42501' then null; end;
        v_result:=public.multideck_uk_vat_review_whole_pounds(user_id,e,calc_id,v_matched_digest,
          'Reviewed source pence and proposed whole-pound HMRC filing values');
        if (v_result->>'inserted')::boolean is not true
          or (v_result->>'ruleVersion')<>'uk-whole-pound-nearest-v1'
          or (v_result#>>'{filedBoxes,6}')::numeric<>round((v_result#>>'{sourceBoxes,6}')::numeric,0)
          or (v_result#>>'{filedBoxes,7}')::numeric<>round((v_result#>>'{sourceBoxes,7}')::numeric,0)
          or (select count(*) from "FIN_IndirectTaxFilingProjections")<>1 then
          raise exception 'dated, sourced HMRC filing projection was not recorded'; end if;
        v_projection_review:=(v_result->>'reviewId')::uuid;
        v_projection_at:=(v_result->>'reviewedAt')::timestamptz;
        v_next:=public.multideck_uk_vat_prior_period_error_preview(user_id,e,period_id,false);
        if v_next->>'method'<>'separate_notification'
          or v_next->>'reason'<>'over_one_percent'
          or (v_next->>'filingProjectionId')::uuid<>v_projection_review
          or (v_next->>'reviewedBox6Gbp')::numeric<0
          or v_next->>'conductReviewRequired'<>'false'
          or v_next->>'immediateNotificationReviewRequired'<>'true'
          or v_next->>'carelessDisclosureAdvisory'<>'true' then
          raise exception 'prior-period error did not use the current reviewed Box 6 threshold'; end if;
        if (public.multideck_uk_vat_list_filing_projections('00000000-0000-0000-0000-000000000018',e,period_id)
          #>>'{reviews,0,review_id}')::uuid<>v_projection_review then
          raise exception 'same-company viewer could not read reviewed filing values'; end if;
        begin
          perform public.multideck_uk_vat_list_filing_projections('00000000-0000-0000-0000-000000000017',e,period_id);
          raise exception 'foreign company read reviewed filing values';
        exception when sqlstate '42501' then null; end;
        begin
          update "FIN_IndirectTaxFilingProjections" set reason='Changed projection reason'
            where id=v_projection_review;
          raise exception 'immutable VAT filing projection was changed';
        exception when sqlstate '22023' then null; end;
        calc_id:=(v_result->>'calculationId')::uuid;
        v_result:=public.multideck_uk_vat_review_whole_pounds(user_id,e,calc_id,v_matched_digest,
          'Rechecked the same whole-pound filing values');
        if (v_result->>'inserted')::boolean is not false
          or (v_result->>'reviewId')::uuid<>v_projection_review
          or (v_result->>'reviewedAt')::timestamptz<>v_projection_at
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='review_vat_filing_projection'
            and "AuditEvent_RecordID"=v_projection_review) then
          raise exception 'unchanged filing values were duplicated or unaudited'; end if;
        calc_id:=(v_result->>'calculationId')::uuid;
        begin
          insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
            "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot")
            values('00000000-0000-0000-0000-000000000035',4,
              '00000000-0000-0000-0000-000000000031','New unlinked VAT journal',1,0,'GBP');
          perform public.multideck_uk_vat_review_whole_pounds(user_id,e,calc_id,v_matched_digest,
            'Attempted filing review after an unlinked VAT control posting');
          raise exception 'unchanged source digest hid a changed VAT control account';
        exception when sqlstate '22023' then null; end;
        if (select count(*) from "FIN_IndirectTaxFilingProjections")<>1 then
          raise exception 'failed control revalidation created a filing projection'; end if;
        begin
          perform public.multideck_uk_vat_lock_review('00000000-0000-0000-0000-000000000018',e,
            calc_id,v_matched_digest,v_projection_review,'Read-only colleague attempted VAT review lock');
          raise exception 'read-only colleague locked a VAT period';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_lock_review('00000000-0000-0000-0000-000000000017',e,
            calc_id,v_matched_digest,v_projection_review,'Foreign company attempted VAT review lock');
          raise exception 'foreign company locked a VAT period';
        exception when sqlstate '42501' then null; end;
        v_result:=public.multideck_uk_vat_lock_review(user_id,e,calc_id,v_matched_digest,
          v_projection_review,'Locked reviewed source, control and filing values before HMRC verification');
        v_period_lock:=(v_result->>'lockId')::uuid;
        v_lock_fingerprint:=v_result->>'lockFingerprint';
        calc_id:=(v_result->>'calculationId')::uuid;
        if v_result->>'status'<>'review_locked'
          or (select status from "FIN_IndirectTaxPeriods" where id=period_id)<>'review_locked'
          or (select active_review_lock_id from "FIN_IndirectTaxPeriods" where id=period_id)<>v_period_lock
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='lock_vat_period_review'
            and "AuditEvent_RecordID"=v_period_lock) then
          raise exception 'VAT period review lock was not recorded atomically'; end if;
        perform set_config('TimeZone','Pacific/Honolulu',true);
        if public.multideck_uk_vat_review_lock_freshness(user_id,e,period_id)->>'ready'<>'true' then
          raise exception 'unchanged VAT review became stale in another database time zone'; end if;
        perform set_config('TimeZone','UTC',true);
        v_locked_period_id:=period_id;
        select count(*) into v_calculation_count from "FIN_IndirectTaxCalculations" calculation
          where calculation.period_id=v_locked_period_id;
        v_result:=public.multideck_uk_vat_current_snapshot(user_id,period_id);
        if v_result->>'sourceDigest'<>v_matched_digest
          or v_result->>'previewOnly'<>'true'
          or v_result->'boxes'<>(select box_totals from "FIN_IndirectTaxCalculations" where id=calc_id)
          or (select count(*) from "FIN_IndirectTaxCalculations" calculation
            where calculation.period_id=v_locked_period_id)<>v_calculation_count then
          raise exception 'locked VAT snapshot was not a read-only replay of the draft'; end if;
        if public.multideck_uk_vat_review_lock_freshness(user_id,e,period_id)->>'ready'<>'true' then
          raise exception 'unchanged review lock failed whole-period freshness check'; end if;
        begin
          perform public.multideck_uk_vat_review_lock_freshness('00000000-0000-0000-0000-000000000018',e,period_id);
          raise exception 'read-only colleague checked privileged VAT lock freshness';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_current_snapshot('00000000-0000-0000-0000-000000000017',period_id);
          raise exception 'foreign company previewed a locked VAT period';
        exception when sqlstate '42501' then null; end;
        select "FINPostLine_CreditAmount" into v_tax_credit from "FIN_PostingLines"
          where "FINPostLine_BatchID"=batch and "FINPostLine_DocumentLineID"=line
            and "FINPostLine_Description" like 'Tax:%';
        begin
          update "FIN_PostingLines" set "FINPostLine_CreditAmount"=v_tax_credit-1
            where "FINPostLine_BatchID"=batch and "FINPostLine_DocumentLineID"=line
              and "FINPostLine_Description" like 'Tax:%';
          raise exception 'signed VAT posting was changed';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled source posting cannot be changed%' then raise; end if;
        end;
        if public.multideck_uk_vat_review_lock_freshness(user_id,e,period_id)->>'ready'<>'true'
          or (public.multideck_uk_vat_document_reconciliation(user_id,e,doc)->>'vatReconciledAt')::timestamptz<>v_reconciled_at then
          raise exception 'a denied source edit changed the VAT lock or reconciliation date'; end if;
        insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
          "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot")
          values('00000000-0000-0000-0000-000000000035',4,
            '00000000-0000-0000-0000-000000000031','New unlinked VAT journal',1,0,'GBP')
          returning "FINPostLine_ID" into v_unlinked_line;
        if public.multideck_uk_vat_review_lock_freshness(user_id,e,period_id)->>'reason'<>'control_changed' then
          raise exception 'unlinked VAT control posting retained a fresh review lock'; end if;
        delete from "FIN_PostingLines" where "FINPostLine_ID"=v_unlinked_line;
        if public.multideck_uk_vat_review_lock_freshness(user_id,e,period_id)->>'ready'<>'true' then
          raise exception 'restored VAT control did not restore lock freshness'; end if;
        insert into "FIN_HmrcVatConnections" values(v_hmrc_connection,'tenant-ref',e,registration,
          '123456789','sandbox',user_id,'connected',now()+interval '1 year',now()+interval '1 hour',null);
        insert into "FIN_HmrcVatObligationVerifications" values(v_hmrc_observation,period_id,e,
          'tenant-ref',registration,v_hmrc_connection,'123456789','sandbox','#001',now()-interval '1 minute');
        insert into "FIN_HmrcVatObligationVerifications" values(v_stale_observation,period_id,e,
          'tenant-ref',registration,v_hmrc_connection,'123456789','sandbox','#001',now()-interval '1 hour');
        begin
          perform public.multideck_uk_vat_confirm_filing_approval(user_id,e,'tenant-ref',period_id,
            v_stale_observation,v_lock_fingerprint,'hmrc-vat-business-v1',true);
          raise exception 'stale HMRC obligation was accepted for approval';
        exception when sqlstate '22023' then null; end;
        insert into "FIN_HmrcVatConnections" values(v_production_connection,'tenant-ref',e,registration,
          '123456789','production',user_id,'connected',now()+interval '1 year',now()+interval '1 hour',null);
        insert into "FIN_HmrcVatObligationVerifications" values(v_production_observation,period_id,e,
          'tenant-ref',registration,v_production_connection,'123456789','production','#001',now()-interval '2 minutes');
        begin
          perform public.multideck_uk_vat_confirm_filing_approval(user_id,e,'tenant-ref',period_id,
            v_production_observation,v_lock_fingerprint,'hmrc-vat-business-v1',true);
          raise exception 'foundation pack approved production VAT filing';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_confirm_filing_approval(user_id,e,'tenant-ref',period_id,
            v_hmrc_observation,v_lock_fingerprint,'hmrc-vat-agent-v1',true);
          raise exception 'unsupported agent declaration was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_confirm_filing_approval(user_id,e,'tenant-ref',period_id,
            v_hmrc_observation,v_lock_fingerprint,'hmrc-vat-business-v1',false);
          raise exception 'unconfirmed legal declaration was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_confirm_filing_approval(user_id,e,'other-tenant',period_id,
            v_hmrc_observation,v_lock_fingerprint,'hmrc-vat-business-v1',true);
          raise exception 'foreign tenant obligation was accepted for approval';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_confirm_filing_approval('00000000-0000-0000-0000-000000000018',e,
            'tenant-ref',period_id,v_hmrc_observation,v_lock_fingerprint,'hmrc-vat-business-v1',true);
          raise exception 'read-only colleague confirmed legal declaration';
        exception when sqlstate '42501' then null; end;
        v_result:=public.multideck_uk_vat_confirm_filing_approval(user_id,e,'tenant-ref',period_id,
          v_hmrc_observation,v_lock_fingerprint,'hmrc-vat-business-v1',true);
        v_filing_approval:=(v_result->>'approvalId')::uuid;
        if v_result->>'status'<>'approved_for_dispatch_review'
          or not exists(select 1 from "FIN_IndirectTaxFilingApprovals" approval
            where approval.id=v_filing_approval and approval.review_lock_id=v_period_lock
              and approval.period_key='#001' and approval.confirmed_by=user_id)
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='confirm_vat_filing_approval'
            and "AuditEvent_RecordID"=v_filing_approval) then
          raise exception 'confirmed VAT declaration lacked bound evidence or audit'; end if;
        begin
          perform public.multideck_uk_vat_confirm_filing_approval(user_id,e,'tenant-ref',period_id,
            v_hmrc_observation,v_lock_fingerprint,'hmrc-vat-business-v1',true);
          raise exception 'VAT period accepted two active legal declarations';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_unlock_review(user_id,e,period_id,
            'Attempted to reopen VAT review without revoking the legal declaration');
          raise exception 'review lock reopened with an active filing approval';
        exception when sqlstate '22023' then null; end;
        begin
          update "FIN_IndirectTaxFilingApprovals" set period_key='26B1' where id=v_filing_approval;
          raise exception 'immutable VAT filing approval changed';
        exception when sqlstate '22023' then null; end;
        select jsonb_build_object('periodKey',approval.period_key,
          'vatDueSales',approval.filed_boxes->'1',
          'vatDueAcquisitions',approval.filed_boxes->'2',
          'totalVatDue',approval.filed_boxes->'3',
          'vatReclaimedCurrPeriod',approval.filed_boxes->'4',
          'netVatDue',approval.filed_boxes->'5',
          'totalValueSalesExVAT',approval.filed_boxes->'6',
          'totalValuePurchasesExVAT',approval.filed_boxes->'7',
          'totalValueGoodsSuppliedExVAT',approval.filed_boxes->'8',
          'totalAcquisitionsExVAT',approval.filed_boxes->'9','finalised',true)::text
          into v_payload_body from "FIN_IndirectTaxFilingApprovals" approval
          where approval.id=v_filing_approval;
        begin
          perform public.multideck_uk_vat_reserve_submission(user_id,e,'tenant-ref',v_filing_approval,
            replace(v_payload_body,'"finalised": true','"finalised": false'));
          raise exception 'an unapproved VAT payload was reserved';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_reserve_submission(user_id,e,'foreign-tenant',v_filing_approval,v_payload_body);
          raise exception 'foreign tenant reserved a VAT submission';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_reserve_submission('00000000-0000-0000-0000-000000000018',e,
            'tenant-ref',v_filing_approval,v_payload_body);
          raise exception 'read-only colleague reserved a VAT submission';
        exception when sqlstate '42501' then null; end;
        v_result:=public.multideck_uk_vat_reserve_submission(user_id,e,'tenant-ref',v_filing_approval,v_payload_body);
        v_submission_attempt:=(v_result->>'attemptId')::uuid;
        if v_result->>'status'<>'reserved' or not exists(select 1 from "FIN_HmrcVatSubmissionAttempts"
          where id=v_submission_attempt and payload_body=v_payload_body
            and payload_sha256=encode(sha256(convert_to(v_payload_body,'UTF8')),'hex')) then
          raise exception 'VAT submission reservation did not preserve the exact approved payload'; end if;
        begin
          perform public.multideck_uk_vat_revoke_filing_approval(user_id,e,v_filing_approval,
            'Tried revoking after reserving a VAT return for submission');
          raise exception 'approval revoked with an active VAT submission reservation';
        exception when sqlstate '22023' then null; end;
        begin
          v_result:=public.multideck_uk_vat_claim_submission_dispatch(user_id,e,'tenant-ref',v_submission_attempt);
          if v_result->>'payloadBody'<>v_payload_body then
            raise exception 'dispatch body changed'; end if;
          begin
            perform public.multideck_uk_vat_claim_submission_dispatch(user_id,e,'tenant-ref',v_submission_attempt);
            raise exception 'VAT dispatch was claimed twice';
          exception when sqlstate '22023' then null; end;
          begin
            perform public.multideck_uk_vat_cancel_submission_reservation(user_id,e,'tenant-ref',
              v_submission_attempt,'A claimed dispatch cannot be cancelled as unsent');
            raise exception 'claimed VAT dispatch was cancelled';
          exception when sqlstate '22023' then null; end;
          begin
            perform public.multideck_uk_vat_revoke_filing_approval(user_id,e,v_filing_approval,
              'Tried revoking after the VAT dispatch was claimed');
            raise exception 'approval revoked after a claimed VAT dispatch';
          exception when sqlstate '22023' then null; end;
          begin
            v_result:=public.multideck_uk_vat_record_return_readback(user_id,e,'tenant-ref',
              v_submission_attempt,v_hmrc_connection,404,null,null);
            if v_result->>'status'<>'reconciliation_required'
              or (select status from "FIN_HmrcVatSubmissionAttempts"
                where id=v_submission_attempt)<>'reconciliation_required' then
              raise exception 'readback 404 did not block a claimed VAT dispatch'; end if;
            raise exception 'rollback early readback fixture' using errcode='P0003';
          exception when sqlstate 'P0003' then null; end;
          v_result:=public.multideck_uk_vat_record_submission_uncertainty(user_id,e,'tenant-ref',
            v_submission_attempt,'network_failure',null);
          if v_result->>'status'<>'reconciliation_required' then
            raise exception 'uncertain VAT outcome was treated as resolved'; end if;
          begin
            perform public.multideck_uk_vat_cancel_submission_reservation(user_id,e,'tenant-ref',
              v_submission_attempt,'Cannot cancel an uncertain VAT submission outcome');
            raise exception 'uncertain VAT dispatch was cancelled';
          exception when sqlstate '22023' then null; end;
          begin
            perform public.multideck_uk_vat_record_submission_receipt(user_id,e,'tenant-ref',
              v_submission_attempt,200,'{}'::jsonb);
            raise exception 'non-201 VAT receipt was accepted';
          exception when sqlstate '22023' then null; end;
          begin
            perform public.multideck_uk_vat_record_submission_receipt(user_id,e,'foreign-tenant',
              v_submission_attempt,201,jsonb_build_object(
                'processingDate','2026-09-24T10:20:30.000+0000',
                'formBundleNumber','256660290587',
                'correlationId','c75f40a6-a3df-4429-a697-471eeec46435',
                'receiptId','2dd537bc-4244-4ebf-bac9-96321be13cdc',
                'receiptTimestamp','2026-09-24T10:20:30Z'));
            raise exception 'foreign tenant recorded a VAT receipt';
          exception when sqlstate '22023' then null; end;
          v_result:=public.multideck_uk_vat_record_return_readback(user_id,e,'tenant-ref',
            v_submission_attempt,v_hmrc_connection,404,null,null);
          if v_result->>'result'<>'not_found'
            or (select status from "FIN_HmrcVatSubmissionAttempts"
              where id=v_submission_attempt)<>'reconciliation_required' then
            raise exception 'HMRC 404 was treated as proof of a missing submission'; end if;
          begin
            perform public.multideck_uk_vat_record_return_readback(user_id,e,'foreign-tenant',
              v_submission_attempt,v_hmrc_connection,404,null,null);
            raise exception 'foreign tenant recorded HMRC VAT readback';
          exception when sqlstate '22023' then null; end;
          begin
            perform public.multideck_uk_vat_record_return_readback('00000000-0000-0000-0000-000000000018',e,
              'tenant-ref',v_submission_attempt,v_hmrc_connection,404,null,null);
            raise exception 'read-only colleague recorded HMRC VAT readback';
          exception when sqlstate '42501' then null; end;
          v_result:=public.multideck_uk_vat_record_return_readback(user_id,e,'tenant-ref',
            v_submission_attempt,v_hmrc_connection,200,
            jsonb_set((v_payload_body::jsonb)-'finalised','{vatDueSales}','14.99'::jsonb)::text,
            'c75f40a6-a3df-4429-a697-471eeec46435');
          if v_result->>'result'<>'mismatch'
            or (select status from "FIN_HmrcVatSubmissionAttempts"
              where id=v_submission_attempt)<>'reconciliation_required' then
            raise exception 'a mismatched HMRC return was accepted'; end if;
          v_result:=public.multideck_uk_vat_record_return_readback(user_id,e,'tenant-ref',
            v_submission_attempt,v_hmrc_connection,200,
            left(((v_payload_body::jsonb)-'finalised')::text,
              length(((v_payload_body::jsonb)-'finalised')::text)-1)
              ||',"vatDueSales":'||(v_payload_body::jsonb->'vatDueSales')::text||'}',
            'c75f40a6-a3df-4429-a697-471eeec46435');
          if v_result->>'result'<>'mismatch' then
            raise exception 'duplicate HMRC readback field was accepted'; end if;
          v_result:=public.multideck_uk_vat_record_return_readback(user_id,e,'tenant-ref',
            v_submission_attempt,v_hmrc_connection,200,
            ((v_payload_body::jsonb)-'finalised')::text,
            'c75f40a6-a3df-4429-a697-471eeec46435');
          if v_result->>'status'<>'accepted_readback'
            or not exists(select 1 from "FIN_HmrcVatReturnReadbackChecks"
              where id=(v_result->>'readbackId')::uuid and result='matched'
                and payload_sha256=encode(sha256(convert_to(v_payload_body,'UTF8')),'hex')) then
            raise exception 'exact HMRC readback did not resolve the uncertain return'; end if;
          begin
            perform public.multideck_uk_vat_record_return_readback(user_id,e,'tenant-ref',
              v_submission_attempt,v_hmrc_connection,200,
              ((v_payload_body::jsonb)-'finalised')::text,
              'c75f40a6-a3df-4429-a697-471eeec46435');
            raise exception 'accepted readback was recorded twice';
          exception when sqlstate '22023' then null; end;
          v_result:=public.multideck_uk_vat_record_submission_receipt(user_id,e,'tenant-ref',
            v_submission_attempt,201,jsonb_build_object(
              'processingDate','2026-09-24T10:20:30.000+0000',
              'formBundleNumber','256660290587',
              'correlationId','c75f40a6-a3df-4429-a697-471eeec46435',
              'receiptId','2dd537bc-4244-4ebf-bac9-96321be13cdc',
              'receiptTimestamp','2026-09-24T10:20:30Z'));
          if v_result->>'status'<>'accepted'
            or not exists(select 1 from "FIN_HmrcVatSubmissionReceipts"
              where id=(v_result->>'receiptId')::uuid and attempt_id=v_submission_attempt
                and payload_sha256=encode(sha256(convert_to(v_payload_body,'UTF8')),'hex')) then
            raise exception 'accepted VAT submission lost its receipt'; end if;
          v_submission_receipt:=(v_result->>'receiptId')::uuid;
          v_result:=public.multideck_uk_vat_filing_status(
            '00000000-0000-0000-0000-000000000018',e,period_id);
          if v_result#>>'{attempt,status}'<>'accepted'
            or v_result#>>'{receipt,formBundleNumber}'<>'256660290587'
            or v_result#>>'{readback,result}'<>'matched'
            or v_result ? 'payloadBody' or v_result ? 'tenantProjectRef'
            or v_result::text like '%tenant-ref%'
            or v_result::text like '%vatDueSales%'
            or v_result::text like '%periodKey%'
            or v_result::text like '%#001%' then
            raise exception 'same-company viewer could not read bounded HMRC filing status'; end if;
          begin
            perform public.multideck_uk_vat_filing_status(
              '00000000-0000-0000-0000-000000000017',e,period_id);
            raise exception 'foreign-company actor read HMRC filing status';
          exception when sqlstate '42501' then null; end;
          begin
            update "FIN_HmrcVatSubmissionReceipts" set form_bundle_number='000000000000'
              where id=v_submission_receipt;
            raise exception 'immutable HMRC VAT receipt was changed';
          exception when sqlstate '22023' then null; end;
          begin
            perform public.multideck_uk_vat_revoke_filing_approval(user_id,e,v_filing_approval,
              'Tried revoking an HMRC accepted VAT return');
            raise exception 'accepted VAT return approval was revoked';
          exception when sqlstate '22023' then null; end;
          begin
            perform public.multideck_uk_vat_record_submission_receipt(user_id,e,'tenant-ref',
              v_submission_attempt,201,jsonb_build_object(
                'processingDate','2026-09-24T10:20:30.000+0000',
                'formBundleNumber','256660290587',
                'correlationId','c75f40a6-a3df-4429-a697-471eeec46435',
                'receiptId','2dd537bc-4244-4ebf-bac9-96321be13cdc',
                'receiptTimestamp','2026-09-24T10:20:30Z'));
            raise exception 'duplicate HMRC receipt was accepted';
          exception when sqlstate '22023' then null; end;
          raise exception 'rollback claim fixture' using errcode='P0002';
        exception when sqlstate 'P0002' then null; end;
        v_result:=public.multideck_uk_vat_cancel_submission_reservation(user_id,e,'tenant-ref',
          v_submission_attempt,'Cancelled the still unsent sandbox VAT return reservation');
        if v_result->>'status'<>'cancelled' then raise exception 'unsent VAT reservation was not cancelled'; end if;
        v_result:=public.multideck_uk_vat_revoke_filing_approval(user_id,e,v_filing_approval,
          'Revoked the declaration before any HMRC dispatch for correction');
        v_filing_revocation:=(v_result->>'revocationId')::uuid;
        if not exists(select 1 from "FIN_IndirectTaxFilingApprovalRevocations"
            where id=v_filing_revocation and approval_id=v_filing_approval)
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='revoke_vat_filing_approval'
            and "AuditEvent_RecordID"=v_filing_revocation) then
          raise exception 'VAT declaration revocation was not audited'; end if;
        insert into "FIN_HmrcVatObligationVerifications" values(v_new_observation,period_id,e,
          'tenant-ref',registration,v_hmrc_connection,'123456789','sandbox','#001',now());
        if (public.multideck_uk_vat_filing_status(user_id,e,period_id)
          #>>'{obligation,verificationId}')::uuid<>v_new_observation then
          raise exception 'revoked declaration hid the latest HMRC obligation check'; end if;
        v_result:=public.multideck_uk_vat_confirm_filing_approval(user_id,e,'tenant-ref',period_id,
          v_new_observation,v_lock_fingerprint,'hmrc-vat-business-v1',true);
        if (v_result->>'approvalId')::uuid=v_filing_approval then
          raise exception 'fresh declaration reused a revoked approval row'; end if;
        v_filing_approval:=(v_result->>'approvalId')::uuid;
        perform public.multideck_uk_vat_revoke_filing_approval(user_id,e,v_filing_approval,
          'Reopened filing approval after the second declaration was cancelled');
        if (public.multideck_uk_vat_list_review_locks('00000000-0000-0000-0000-000000000018',e,period_id)
          #>>'{activeLockId}')::uuid<>v_period_lock then
          raise exception 'same-company viewer could not read the VAT review lock'; end if;
        begin
          perform public.multideck_uk_vat_list_review_locks('00000000-0000-0000-0000-000000000017',e,period_id);
          raise exception 'foreign company read the VAT review lock';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_calculate_draft(user_id,period_id);
          raise exception 'review-locked VAT period accepted a new calculation';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_review_whole_pounds(user_id,e,calc_id,v_matched_digest,
            'Attempted filing-value review while VAT period was locked');
          raise exception 'review-locked VAT period accepted a new filing review';
        exception when sqlstate '22023' then null; end;
        begin
          update "FIN_IndirectTaxPeriods" set status='draft',active_review_lock_id=null where id=period_id;
          raise exception 'VAT period was directly reopened without an audit record';
        exception when sqlstate '22023' then null; end;
        begin
          update "FIN_IndirectTaxPeriodReviewLocks" set reason='Changed lock reason' where id=v_period_lock;
          raise exception 'immutable VAT review lock changed';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_unlock_review('00000000-0000-0000-0000-000000000018',e,
            period_id,'Read-only colleague attempted to reopen VAT review');
          raise exception 'read-only colleague reopened a VAT review lock';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_unlock_review('00000000-0000-0000-0000-000000000017',e,
            period_id,'Foreign company attempted to reopen VAT review');
          raise exception 'foreign company reopened a VAT review lock';
        exception when sqlstate '42501' then null; end;
        update "FIN_LegalEntityComplianceRegistrations" set "FINComplianceReg_RegistrationReference"='INVALID'
          where "FINComplianceReg_ID"=registration;
        begin
          perform public.multideck_uk_vat_review_lock_freshness(user_id,e,period_id);
          raise exception 'changed VAT registration retained a fresh review lock';
        exception when sqlstate '22023' then null; end;
        v_result:=public.multideck_uk_vat_unlock_review(user_id,e,period_id,
          'Reopened the review lock after registration changed for correction');
        v_period_unlock:=(v_result->>'unlockId')::uuid;
        if v_result->>'status'<>'draft'
          or (select status from "FIN_IndirectTaxPeriods" where id=period_id)<>'draft'
          or (select active_review_lock_id from "FIN_IndirectTaxPeriods" where id=period_id) is not null
          or not exists(select 1 from "FIN_IndirectTaxPeriodReviewUnlocks"
            where id=v_period_unlock and lock_id=v_period_lock)
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='unlock_vat_period_review'
            and "AuditEvent_RecordID"=v_period_unlock) then
          raise exception 'VAT review unlock did not retain its immutable audit'; end if;
        update "FIN_LegalEntityComplianceRegistrations" set "FINComplianceReg_RegistrationReference"='123456789'
          where "FINComplianceReg_ID"=registration;
        begin
          update "FIN_IndirectTaxPeriods" set status='review_locked',active_review_lock_id=v_period_lock
            where id=period_id;
          raise exception 'previously reopened VAT lock was reactivated directly';
        exception when sqlstate '22023' then null; end;
        if (public.multideck_uk_vat_list_control_reviews('00000000-0000-0000-0000-000000000018',e,period_id)
            #>>'{reviews,0,review_id}')::uuid<>v_control_review then
          raise exception 'same-company viewer could not read a colleague control review'; end if;
        begin
          perform public.multideck_uk_vat_list_control_reviews('00000000-0000-0000-0000-000000000017',e,period_id);
          raise exception 'foreign company read a VAT control review';
        exception when sqlstate '42501' then null; end;
        begin
          update "FIN_IndirectTaxControlReviews" set reason='Changed control review reason'
            where id=v_control_review;
          raise exception 'immutable VAT control review was changed';
        exception when sqlstate '22023' then null; end;
        v_result:=public.multideck_uk_vat_review_control(user_id,e,calc_id,v_matched_digest,
          'Rechecked unchanged VAT control movement');
        if (v_result->>'inserted')::boolean is not false
          or (v_result->>'reviewId')::uuid<>v_control_review
          or (v_result->>'reviewedAt')::timestamptz<>v_control_at
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='review_vat_control'
            and "AuditEvent_RecordID"=v_control_review and "AuditEvent_UserID"=user_id) then
          raise exception 'unchanged VAT control review was duplicated or unaudited'; end if;
        calc_id:=(v_result->>'calculationId')::uuid;
        begin
          update "FIN_PostingLines" set "FINPostLine_CreditAmount"=19
            where "FINPostLine_BatchID"=batch and "FINPostLine_DocumentLineID"=line
              and "FINPostLine_Description" like 'Tax:%';
          raise exception 'signed VAT source posting was changed after period unlock';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled source posting cannot be changed%' then raise; end if;
        end;
        begin
          update "FIN_Documents" set "FINDoc_DocumentDate"='2026-07-16' where "FINDoc_ID"=doc;
          raise exception 'signed VAT document date was changed';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction cannot be changed%' then raise; end if;
        end;
        begin
          update "FIN_Documents" set "FINDoc_OutstandingAmount"=80,
            "FINDoc_LocalOutstandingAmount"=80,"FINDoc_ExportStatusCode"='synced',
            "FINDoc_PostingStatusCode"='posted',"FINDoc_StatusCode"='submitted'
            where "FINDoc_ID"=doc;
          if not exists(select 1 from "FIN_Documents" where "FINDoc_ID"=doc
            and "FINDoc_OutstandingAmount"=80 and "FINDoc_StatusCode"='submitted') then
            raise exception 'settlement or delivery update was blocked'; end if;
          raise exception 'vat_delivery_probe_rollback';
        exception when sqlstate 'P0001' then
          if sqlerrm<>'vat_delivery_probe_rollback' then raise; end if;
        end;
        begin
          update "FIN_Documents" set "FINDoc_StatusCode"='draft' where "FINDoc_ID"=doc;
          raise exception 'signed VAT document returned to draft';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction cannot be changed%' then raise; end if;
        end;
        begin
          update "FIN_Documents" set "FINDoc_IsLocked"=false where "FINDoc_ID"=doc;
          raise exception 'signed VAT document was unlocked';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction cannot be changed%' then raise; end if;
        end;
        begin
          update "FIN_DocumentLines" set "FINDocLine_NetAmount"=101 where "FINDocLine_ID"=line;
          raise exception 'signed VAT document line was changed';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction line cannot be changed%' then raise; end if;
        end;
        begin
          delete from "FIN_Documents" where "FINDoc_ID"=doc;
          raise exception 'signed VAT document was deleted';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction cannot be deleted%' then raise; end if;
        end;
        begin
          delete from "FIN_DocumentLines" where "FINDocLine_ID"=line;
          raise exception 'signed VAT document line was deleted';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction line cannot be changed%' then raise; end if;
        end;
        begin
          insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID","FINDocLine_NetAmount",
            "FINDocLine_TaxAmount","FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount")
            values(gen_random_uuid(),doc,1,0,1,0);
          raise exception 'signed VAT document accepted a new line';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction line cannot be changed%' then raise; end if;
        end;
        begin
          insert into "FIN_DocumentLineJobLinks"("FINDocLineJob_DocumentID","FINDocLineJob_DocumentLineID")
            values(doc,line);
          raise exception 'signed VAT document accepted a new job link';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction job link cannot be changed%' then raise; end if;
        end;
        begin
          insert into "FIN_DocumentLineJobLinks"("FINDocLineJob_DocumentID","FINDocLineJob_DocumentLineID")
            values('00000000-0000-0000-0000-000000000012',line);
          raise exception 'signed VAT line accepted a job link through another document';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction job link cannot be changed%' then raise; end if;
        end;
        begin
          update "FIN_DocumentLineJobLinks" set "FINDocLineJob_JobID"=gen_random_uuid()
            where "FINDocLineJob_ID"='00000000-0000-0000-0000-000000000087';
          raise exception 'signed VAT job link was changed';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction job link cannot be changed%' then raise; end if;
        end;
        begin
          delete from "FIN_DocumentLineJobLinks"
            where "FINDocLineJob_ID"='00000000-0000-0000-0000-000000000087';
          raise exception 'signed VAT job link was deleted';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction job link cannot be changed%' then raise; end if;
        end;
        begin
          update "FIN_PostingBatches" set "FINPostBatch_StatusCode"='draft' where "FINPostBatch_ID"=batch;
          raise exception 'signed VAT posting batch was changed';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled posting batch cannot be changed%' then raise; end if;
        end;
        begin
          delete from "FIN_PostingBatches" where "FINPostBatch_ID"=batch;
          raise exception 'signed VAT posting batch was deleted';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled posting batch cannot be changed%' then raise; end if;
        end;
        begin
          delete from "FIN_PostingLines" where "FINPostLine_BatchID"=batch
            and "FINPostLine_DocumentLineID"=line;
          raise exception 'signed VAT posting line was deleted';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled source posting cannot be changed%' then raise; end if;
        end;
        begin
          insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
            "FINPostLine_DocumentID","FINPostLine_DocumentLineID","FINPostLine_Description",
            "FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot")
            values(batch,99,'00000000-0000-0000-0000-000000000031',doc,line,'Tax: injection',0,1,'GBP');
          raise exception 'signed VAT posting batch accepted a new line';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled source posting cannot be changed%' then raise; end if;
        end;
        begin
          insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
            "FINPostLine_DocumentID","FINPostLine_DocumentLineID","FINPostLine_Description",
            "FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot")
            values('00000000-0000-0000-0000-000000000035',99,
              '00000000-0000-0000-0000-000000000031',null,line,'Tax: indirect injection',0,1,'GBP');
          raise exception 'signed VAT line accepted a posting through an unrelated batch';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled source posting cannot be changed%' then raise; end if;
        end;
        v_result:=public.multideck_uk_vat_calculate_draft(user_id,period_id);
        if v_result->>'sourceDigest'<>v_matched_digest
          or (public.multideck_uk_vat_document_reconciliation(user_id,e,doc)->>'vatReconciledAt')::timestamptz<>v_reconciled_at then
          raise exception 'denied transaction edits changed the original sign-off date'; end if;
        update "FIN_LegalEntityComplianceRegistrations" set "FINComplianceReg_RegistrationReference"='INVALID'
          where "FINComplianceReg_ID"=registration;
        begin
          perform public.multideck_uk_vat_calculate_draft(user_id,period_id);
          raise exception 'changed VAT registration was accepted';
        exception when sqlstate '22023' then null; end;
        update "FIN_LegalEntityComplianceRegistrations" set "FINComplianceReg_RegistrationReference"='123456789'
          where "FINComplianceReg_ID"=registration;
        insert into "FIN_Documents" values('00000000-0000-0000-0000-000000000030',e,'draft',batch,'GBP',1,'2026-07-20',user_id,'sl_invoice','PAGE-1');
        insert into "FIN_Documents" values('00000000-0000-0000-0000-000000000032',e,'draft',batch,'GBP',1,'2026-07-21',user_id,'sl_invoice','PAGE-2');
        insert into "FIN_DocumentLines" values('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000030',10,2,10,2,'00000000-0000-0000-0000-000000000013','UK20',20);
        insert into "FIN_DocumentLines" values('00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000032',20,4,20,4,'00000000-0000-0000-0000-000000000013','UK20',20);
        update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted' where "FINDoc_ID" in
          ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000032');
        v_result:=public.multideck_uk_vat_review_queue(user_id,e,1);
        if (v_result->>'totalUnreviewed')::integer<>2 or jsonb_array_length(v_result->'items')<>1
          or v_result->'nextCursor' is null or v_result->'nextCursor'='null'::jsonb then
          raise exception 'VAT review queue did not return a bounded first page and cursor'; end if;
        v_next:=public.multideck_uk_vat_review_queue(user_id,e,1,
          (v_result#>>'{nextCursor,recordedAt}')::timestamptz,(v_result#>>'{nextCursor,evidenceId}')::uuid);
        if (v_next->>'totalUnreviewed')::integer<>2 or jsonb_array_length(v_next->'items')<>1
          or v_next->'nextCursor'<>'null'::jsonb
          or v_next#>>'{items,0,evidence_id}'=v_result#>>'{items,0,evidence_id}' then
          raise exception 'VAT review queue skipped or repeated an evidence page'; end if;
        begin
          perform public.multideck_uk_vat_review_queue(user_id,e,1,now(),null);
          raise exception 'incomplete VAT review cursor was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_review_evidence(user_id,event_id,'2026-07-16',
            'Attempted to revise a reconciled tax point within the same period');
          raise exception 'signed VAT treatment was revised within its period';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction cannot have its tax treatment changed%' then
            raise exception 'same-period review failed for an unrelated reason: %',sqlerrm; end if;
        end;
        begin
          insert into "FIN_IndirectTaxDecisions"(evidence_id,revision,tax_point,scheme_code,treatment_code,
            reviewed_rule_reference,review_reason,reviewed_by)
            values(event_id,4,'2026-07-16','standard','domestic_sale','same-period-probe',
              'Direct service write must not revise a signed source',user_id);
          raise exception 'direct decision insert revised signed VAT treatment';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction cannot have its tax treatment changed%' then
            raise exception 'same-period decision guard failed for an unrelated reason: %',sqlerrm; end if;
        end;
        begin
          perform public.multideck_uk_vat_review_evidence(user_id,event_id,'2026-10-15',
            'Attempted tax-point move after a VAT reconciliation date was recorded');
          raise exception 'signed VAT evidence moved into a second period';
        exception when sqlstate '22023' then
          if sqlerrm not like 'This signed VAT transaction cannot move%' then
            raise exception 'cross-period review failed for an unrelated reason: %',sqlerrm; end if;
        end;
        if (select max(revision) from "FIN_IndirectTaxDecisions" where evidence_id=event_id)<>3 then
          raise exception 'a rejected cross-period review created a decision'; end if;
        begin
          update "FIN_IndirectTaxEvidencePeriods" set first_reconciled_by='00000000-0000-0000-0000-000000000018'
            where evidence_id=event_id;
          raise exception 'signed VAT period assignment was changed';
        exception when sqlstate '22023' then null; end;
        begin
          insert into "FIN_IndirectTaxDecisions"(evidence_id,revision,tax_point,scheme_code,treatment_code,
            reviewed_rule_reference,review_reason,reviewed_by)
            values(event_id,4,'2026-10-15','standard','domestic_sale','cross-period-probe',
              'Direct service write must not move a signed source',user_id);
          raise exception 'direct decision insert moved signed VAT evidence';
        exception when sqlstate '22023' then
          if sqlerrm not like 'A VAT-reconciled transaction cannot have its tax treatment changed%' then
            raise exception 'decision guard failed for an unrelated reason: %',sqlerrm; end if;
        end;
        period_b:=(public.multideck_uk_vat_create_draft_period(user_id,e,'2026-10-01','2026-12-31')->>'periodId')::uuid;
        begin
          insert into "FIN_IndirectTaxEvidencePeriods"(evidence_id,period_id,first_reconciled_by)
            values(event_id,period_b,user_id);
          raise exception 'evidence was assigned to two VAT periods';
        exception when sqlstate '23505' then null; end;
        begin
          execute 'alter table "FIN_IndirectTaxDecisions" disable trigger indirect_tax_decision_period_guard';
          insert into "FIN_IndirectTaxDecisions"(evidence_id,revision,tax_point,scheme_code,treatment_code,
            reviewed_rule_reference,review_reason,reviewed_by)
            values(event_id,4,'2026-10-15','standard','domestic_sale','cross-period-probe',
              'Direct service write must not move a signed source',user_id) returning id into decision_b;
          execute 'alter table "FIN_IndirectTaxDecisions" enable trigger indirect_tax_decision_period_guard';
          insert into "FIN_IndirectTaxCalculations"(period_id,revision,calculation_version,source_digest,
            registration_snapshot,box_totals,exceptions,control_reconciliation,calculated_by)
            values(period_b,1,'uk-standard-v1',repeat('b',64),'{}','{}','[]','{}',user_id)
            returning id into calc_b;
          insert into "FIN_IndirectTaxCalculationLines"(calculation_id,period_id,evidence_id,decision_id,box_number,signed_amount)
            values(calc_b,period_b,event_id,decision_b,1,20);
          raise exception 'signed evidence entered a second VAT period calculation';
        exception when sqlstate '22023' then
          if sqlerrm not like 'VAT evidence signed in another period%' then
            raise exception 'calculation guard failed for an unrelated reason: %',sqlerrm; end if;
        end;
        if exists(select 1 from "FIN_IndirectTaxCalculationLines" second_line where second_line.period_id=period_b)
          or exists(select 1 from "FIN_IndirectTaxDecisions" where evidence_id=event_id and revision=4)
          or not exists(select 1 from pg_trigger where tgname='indirect_tax_decision_period_guard' and tgenabled='O') then
          raise exception 'cross-period probe left a decision or calculation line'; end if;
        begin
          execute 'alter table "FIN_IndirectTaxDecisions" disable trigger indirect_tax_decision_period_guard';
          insert into "FIN_IndirectTaxDecisions"(evidence_id,revision,tax_point,scheme_code,treatment_code,
            reviewed_rule_reference,review_reason,reviewed_by)
            values(event_id,4,'2026-10-15','standard','domestic_sale','cross-period-probe',
              'Reconciliation guard needs a controlled second-period setup',user_id) returning id into decision_b;
          execute 'alter table "FIN_IndirectTaxDecisions" enable trigger indirect_tax_decision_period_guard';
          insert into "FIN_IndirectTaxCalculations"(period_id,revision,calculation_version,source_digest,
            registration_snapshot,box_totals,exceptions,control_reconciliation,calculated_by)
            values(period_b,1,'uk-standard-v1',repeat('b',64),'{}','{}','[]',
              '{"sourceLedger":{"status":"matched"}}',user_id) returning id into calc_b;
          execute 'alter table "FIN_IndirectTaxCalculationLines" disable trigger indirect_tax_calculation_line_guard';
          insert into "FIN_IndirectTaxCalculationLines"(calculation_id,period_id,evidence_id,decision_id,box_number,signed_amount)
            values(calc_b,period_b,event_id,decision_b,1,20);
          execute 'alter table "FIN_IndirectTaxCalculationLines" enable trigger indirect_tax_calculation_line_guard';
          insert into "FIN_IndirectTaxReconciliations"(period_id,calculation_id,evidence_id,decision_id,
            source_digest,reconciled_by,reason)
            values(period_b,calc_b,event_id,decision_b,repeat('b',64),user_id,
              'Second-period sign-off must be rejected by the final guard');
          raise exception 'same VAT source received two period sign-offs';
        exception when sqlstate '22023' then
          if sqlerrm not like 'VAT evidence is already signed in another period%' then
            raise exception 'reconciliation guard failed for an unrelated reason: %',sqlerrm; end if;
        end;
        if (select count(*) from "FIN_IndirectTaxReconciliations" where evidence_id=event_id)<>1
          or exists(select 1 from "FIN_IndirectTaxCalculationLines" second_line where second_line.period_id=period_b)
          or not exists(select 1 from pg_trigger where tgname='indirect_tax_calculation_line_guard' and tgenabled='O') then
          raise exception 'cross-period reconciliation probe left a second sign-off or disabled guard'; end if;
        update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=user_id;
        begin
          perform public.multideck_uk_vat_calculate_draft(user_id,period_id);
          raise exception 'revoked calculator was accepted';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_source_coverage(user_id,e);
          raise exception 'revoked user read VAT coverage';
        exception when sqlstate '42501' then null; end;
        raise notice 'checked';
      end $test$;
      select 'ok';
    `), "ok")
    assert.equal(sql(`
      do $annual$
      declare entity_id uuid:='00000000-0000-0000-0000-000000000090';
        registration_id uuid:='00000000-0000-0000-0000-000000000091';
        period_id uuid; batch_id uuid:='00000000-0000-0000-0000-000000000092';
        document_id uuid:='00000000-0000-0000-0000-000000000093';
        line_id uuid:='00000000-0000-0000-0000-000000000094';
        tax_id uuid:='00000000-0000-0000-0000-000000000095';
        actor uuid:='00000000-0000-0000-0000-000000000003';
        result jsonb;
      begin
        update "cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor;
        insert into "cmp_LegalEntities"("LegalEntity_ID","LegalEntity_IsActive","LegalEntity_CountryCode")
          values(entity_id,true,'GB');
        insert into "FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_ID","FINComplianceReg_LegalEntityID","FINComplianceReg_ObligationID","FINComplianceReg_StatusCode","FINComplianceReg_RegistrationReference","FINComplianceReg_EffectiveFrom","FINComplianceReg_EffectiveTo","FINComplianceReg_SettingsJSON") values(
          registration_id,entity_id,'00000000-0000-0000-0000-000000000005',
          'configured','987654321','2020-01-01',null,'{"schemeCode":"annual"}');
        insert into "FIN_Periods"("FINPeriod_ID","FINPeriod_LegalEntityID","FINPeriod_StartDate","FINPeriod_EndDate")
          values('00000000-0000-0000-0000-000000000096',entity_id,
          '2026-07-01','2027-06-30');
        insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code","FINNom_Name","FINNom_ControlTypeCode") values
          ('00000000-0000-0000-0000-000000000097',entity_id,'4000','Annual sales',null),
          ('00000000-0000-0000-0000-000000000098',entity_id,'2100','Annual output VAT','vat');
        insert into "FIN_TaxCodes" values(tax_id,entity_id,'GB','vat',true,'2026-06-01',
          'ANNUAL20',20,'2020-01-01',null,'domestic_standard',true,
          '00000000-0000-0000-0000-000000000098',null);
        insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_LegalEntityID","FINPostBatch_StatusCode","FINPostBatch_PeriodID")
          values(batch_id,entity_id,'posted','00000000-0000-0000-0000-000000000096');
        insert into "FIN_Documents" values(document_id,entity_id,'posted',batch_id,'GBP',1,'2026-10-15',actor);
        insert into "FIN_DocumentLines" values(line_id,document_id,1000,200,1000,200,
          tax_id,'ANNUAL20',20);
        insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
          "FINPostLine_DocumentID","FINPostLine_DocumentLineID","FINPostLine_Description",
          "FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot") values
          (batch_id,1,'00000000-0000-0000-0000-000000000097',document_id,line_id,'Annual sale',0,1000,'GBP'),
          (batch_id,2,'00000000-0000-0000-0000-000000000098',document_id,line_id,'Tax: annual sale',0,200,'GBP');
        insert into "FIN_IndirectTaxEvidence"(legal_entity_id,jurisdiction_code,source_kind,source_id,
          source_posting_batch_id,source_document_id,source_document_line_id,source_version,
          currency_code,exchange_rate,signed_net_amount,signed_tax_amount,
          signed_net_reporting,signed_tax_reporting,recorded_by)
          values(entity_id,'GB','posted_document_line',line_id,batch_id,document_id,line_id,
            batch_id::text,'GBP',1,1000,200,1000,200,actor);
        result:=public.multideck_uk_vat_create_draft_period(actor,entity_id,'2026-07-01','2027-06-30');
        period_id:=(result->>'periodId')::uuid;
        if (select scheme_code from "FIN_IndirectTaxPeriods" where id=period_id)<>'annual'
          or (public.multideck_uk_vat_create_draft_period(actor,entity_id,'2026-07-01','2027-06-30')->>'periodId')::uuid<>period_id then
          raise exception 'annual scheme draft was not prepared idempotently'; end if;
        perform public.multideck_uk_vat_review_evidence(actor,
          (select id from "FIN_IndirectTaxEvidence" where source_document_line_id=line_id),
          '2026-10-15','Reviewed annual-accounting sale and tax point');
        result:=public.multideck_uk_vat_calculate_draft(actor,period_id);
        if (result#>>'{boxes,1}')::numeric<>200
          or (result#>>'{boxes,5}')::numeric<>200
          or (result#>>'{boxes,6}')::numeric<>1000
          or result#>>'{sourceLedger,status}'<>'matched'
          or (select calculation_version from "FIN_IndirectTaxCalculations"
            where id=(result->>'calculationId')::uuid)<>'uk-annual-v3' then
          raise exception 'annual accounting did not retain normal VAT return boxes and version'; end if;
        update "FIN_LegalEntityComplianceRegistrations"
          set "FINComplianceReg_SettingsJSON"='{"schemeCode":"standard"}'
          where "FINComplianceReg_ID"=registration_id;
        begin
          perform public.multideck_uk_vat_calculate_draft(actor,period_id);
          raise exception 'annual draft ignored a changed registration scheme';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_create_draft_period(actor,entity_id,'2026-07-01','2027-06-30');
          raise exception 'idempotent period preparation hid an annual scheme change';
        exception when sqlstate '22023' then null; end;
        update "FIN_LegalEntityComplianceRegistrations"
          set "FINComplianceReg_SettingsJSON"='{"schemeCode":"cash"}'
          where "FINComplianceReg_ID"=registration_id;
        begin
          perform public.multideck_uk_vat_create_draft_period(actor,entity_id,'2027-07-01','2028-06-30');
          raise exception 'unsupported cash scheme prepared a VAT period';
        exception when sqlstate '22023' then null; end;
      end $annual$;
      select 'ok';
    `), "ok")
    sql(`alter table "FIN_Documents" add column "FINDoc_MetadataJSON" jsonb not null default '{}'::jsonb;
      alter table "FIN_Documents" add column "FINDoc_SourceTable" text;
      alter table "FIN_Documents" add column "FINDoc_SourceID" uuid;
      alter table "FIN_DocumentLines" add column "FINDocLine_LineNo" integer;`)
    sql(reversalLinks)
    sql(reversalAuditLinks)
    sql(ordinaryCreditLinks)
    sql(clawbackSnapshot)
    sql(inputTaxRepaymentProposals)
    sql(inputTaxRepaymentReviews)
    sql(inputTaxRepaymentSchedule)
    sql(inputTaxRepaymentNativePosting)
    sql(priorErrorFilingGate)
    sql(method1NativePosting)
    sql(inputTaxRepaymentCalculation)
    sql(laterInputTaxRestorationSource)
    sql(laterInputTaxRestorationReviews)
    sql(laterInputTaxRestorationPosting)
    sql(laterInputTaxRestorationCalculation)
    sql(multiPeriodInputTaxRestorationSource)
    sql(supplierInputTaxHistory)
    assert.equal(sql(`select has_function_privilege('authenticated',
      'public.multideck_uk_vat_clawback_source_snapshot(uuid,uuid,uuid,uuid)','EXECUTE')`), "f")
    assert.equal(sql(`select has_function_privilege('authenticated',
      'public.multideck_uk_vat_prepare_first_input_tax_repayment(uuid,uuid,uuid,uuid,text)','EXECUTE')`), "f")
    assert.equal(sql(`select count(*) from information_schema.role_table_grants
      where table_name='FIN_IndirectTaxInputTaxRepaymentProposals'
        and grantee in ('authenticated','service_role')
        and privilege_type in ('INSERT','UPDATE','DELETE')`), "0")
    assert.equal(sql(`select count(*) from information_schema.role_table_grants
      where table_name in ('FIN_IndirectTaxInputTaxRepaymentReviews',
        'FIN_IndirectTaxInputTaxRepaymentReviewRevocations')
        and grantee in ('authenticated','service_role')
        and privilege_type in ('INSERT','UPDATE','DELETE')`), "0")
    assert.equal(sql(`select has_function_privilege('authenticated',
      'public.multideck_uk_vat_review_input_tax_repayment(uuid,uuid,uuid,uuid,text)','EXECUTE')`), "f")
    assert.equal(sql(`select has_function_privilege('authenticated',
      'public.multideck_uk_vat_revoke_input_tax_repayment_review(uuid,uuid,uuid,text)','EXECUTE')`), "f")
    assert.equal(sql(`
      do $snapshot_access$
      declare entity_id uuid:='00000000-0000-0000-0000-000000000001';
        target uuid; source_doc uuid;
      begin
        select id into target from "FIN_IndirectTaxPeriods"
          where legal_entity_id=entity_id and status='draft'
          order by end_date desc limit 1;
        select "FINDoc_ID" into source_doc from "FIN_Documents"
          where "FINDoc_LegalEntityID"=entity_id and "FINDoc_TypeCode"='pl_invoice'
            and "FINDoc_NativePostingStatusCode"='posted' limit 1;
        if target is null or source_doc is null then raise exception 'VAT snapshot fixture missing'; end if;
        begin
          perform public.multideck_uk_vat_clawback_source_snapshot(
            '00000000-0000-0000-0000-000000000018',entity_id,target,source_doc);
          raise exception 'read-only colleague read privileged clawback evidence';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_clawback_source_snapshot(
            '00000000-0000-0000-0000-000000000017',entity_id,target,source_doc);
          raise exception 'foreign-company actor read clawback evidence';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_clawback_source_snapshot(
            '00000000-0000-0000-0000-000000000003',entity_id,target,source_doc);
          raise exception 'unfiled input VAT was accepted as a clawback source';
        exception when sqlstate '22023' then null; end;
      end $snapshot_access$;
      select 'denied';`), "denied")
    assert.equal(sql(`
      do $snapshot_positive$
      declare entity_id uuid:=gen_random_uuid();
        obligation_id uuid:='00000000-0000-0000-0000-000000000005'; registration_id uuid:=gen_random_uuid();
        actor uuid:='00000000-0000-0000-0000-000000000003';
        original_period uuid; target_period uuid; next_period uuid; missed_period uuid;
        zero_period uuid; jan_lock_id uuid:=gen_random_uuid();
        jan_calc_id uuid; jan_digest text;
        target_lock_id uuid:=gen_random_uuid(); target_calc_id uuid;
        target_digest text; doc_id uuid:=gen_random_uuid();
        oct_lock_id uuid:=gen_random_uuid(); oct_calc_id uuid; oct_digest text;
        line_id uuid:=gen_random_uuid(); batch_id uuid:=gen_random_uuid();
        evidence_id uuid; decision_id uuid:=gen_random_uuid(); calc_id uuid:=gen_random_uuid();
        lock_id uuid:=gen_random_uuid(); approval_id uuid:=gen_random_uuid();
        attempt_id uuid:=gen_random_uuid(); control_id uuid; projection_id uuid;
        cash_a uuid:=gen_random_uuid(); cash_b uuid:=gen_random_uuid();
        cash_after uuid:=gen_random_uuid(); cash_full uuid:=gen_random_uuid();
        cash_small uuid:=gen_random_uuid(); cash_zero uuid:=gen_random_uuid();
        result jsonb; before_fingerprint text;
        proposal_id uuid; offset_account uuid:=gen_random_uuid();
        replacement_account uuid:=gen_random_uuid(); control_account uuid:=gen_random_uuid();
        review_id uuid; replacement_review uuid; revocation_id uuid;
        later_review uuid;
        body text:=repeat('x',120); digest text:=repeat('a',64);
      begin
        insert into "cmp_LegalEntities" values(entity_id,true,'GB');
        insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID",
          "FINNom_Code","FINNom_Name","FINNom_IsControlAccount","FINNom_AllowManualPosting")
          values(offset_account,entity_id,'VAT-ADJ','Reviewed input VAT repayment offset',false,true),
            (replacement_account,entity_id,'VAT-ADJ-2','Replacement input VAT offset',false,true),
            (control_account,entity_id,'VAT-CTRL','VAT control account',true,false);
        insert into "FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_ID",
          "FINComplianceReg_LegalEntityID","FINComplianceReg_ObligationID",
          "FINComplianceReg_StatusCode","FINComplianceReg_RegistrationReference",
          "FINComplianceReg_EffectiveFrom","FINComplianceReg_SettingsJSON")
          values(registration_id,entity_id,obligation_id,'production_verified',
            '123456789','2024-01-01','{"schemeCode":"standard"}'::jsonb);
        original_period:=(public.multideck_uk_vat_create_draft_period(actor,entity_id,
          '2024-01-01','2024-03-31')->>'periodId')::uuid;
        target_period:=(public.multideck_uk_vat_create_draft_period(actor,entity_id,
          '2024-07-01','2024-09-30')->>'periodId')::uuid;
        insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_LegalEntityID",
          "FINPostBatch_StatusCode") values(batch_id,entity_id,'posted');
        insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID",
          "FINDoc_NativePostingStatusCode","FINDoc_NativePostingBatchID",
          "FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate","FINDoc_DocumentDate",
          "FINDoc_NativePostedBy","FINDoc_TypeCode","FINDoc_Number","FINDoc_GrossAmount",
          "FINDoc_DueDate") values(doc_id,entity_id,'posted',batch_id,'GBP',1,
            '2024-01-15',actor,'pl_invoice','SNAP-1',120,'2024-01-31');
        insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID",
          "FINDocLine_NetAmount","FINDocLine_TaxAmount",
          "FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount")
          values(line_id,doc_id,100,20,100,20);
        insert into "FIN_IndirectTaxEvidence"(legal_entity_id,jurisdiction_code,
          source_kind,source_id,source_posting_batch_id,source_document_id,
          source_document_line_id,source_version,source_document_date,currency_code,
          exchange_rate,signed_net_amount,signed_tax_amount,signed_net_reporting,
          signed_tax_reporting,recorded_by)
          values(entity_id,'GB','posted_document_line',line_id,batch_id,doc_id,
            line_id,batch_id::text,'2024-01-15','GBP',1,100,20,100,20,actor)
          returning id into evidence_id;
        insert into "FIN_IndirectTaxDecisions"(id,evidence_id,revision,tax_point,
          scheme_code,treatment_code,reviewed_rule_reference,review_reason,reviewed_by)
          values(decision_id,evidence_id,1,'2024-01-15','standard','domestic_purchase',
            'vat-notice-700-18','Reviewed the original input VAT claim',actor);
        insert into "FIN_IndirectTaxCalculations"(id,period_id,revision,
          calculation_version,source_digest,registration_snapshot,box_totals,
          exceptions,control_reconciliation,calculated_by)
          values(calc_id,original_period,1,'uk-standard-v3',digest,'{}','{}','[]',
            '{"sourceLedger":{"status":"matched"}}',actor);
        insert into "FIN_IndirectTaxCalculationLines"(calculation_id,period_id,
          evidence_id,decision_id,box_number,signed_amount)
          values(calc_id,original_period,evidence_id,decision_id,4,20);
        insert into "FIN_IndirectTaxReconciliations"(period_id,calculation_id,
          evidence_id,decision_id,source_digest,reconciled_by,reason)
          values(original_period,calc_id,evidence_id,decision_id,digest,actor,
            'Reviewed and reconciled the original supplier input VAT');
        select id into control_id from "FIN_IndirectTaxControlReviews" limit 1;
        select id into projection_id from "FIN_IndirectTaxFilingProjections" limit 1;
        if control_id is null or projection_id is null then
          raise exception 'review fixture missing'; end if;
        insert into "FIN_IndirectTaxPeriodReviewLocks"(id,period_id,calculation_id,
          source_digest,control_review_id,control_fingerprint,filing_projection_id,
          projection_fingerprint,lock_fingerprint,locked_by,reason)
          values(lock_id,original_period,calc_id,digest,control_id,repeat('b',64),
            projection_id,repeat('c',64),repeat('d',64),actor,
            'Reviewed the original supplier VAT return');
        insert into "FIN_IndirectTaxFilingApprovals"(id,period_id,review_lock_id,
          obligation_verification_id,tenant_project_ref,environment,registration_id,
          vrn,period_key,lock_fingerprint,filed_boxes,declaration_code,
          approval_fingerprint,confirmed_by)
          values(approval_id,original_period,lock_id,
            (select id from "FIN_HmrcVatObligationVerifications" limit 1),
            'tenant-ref','production',registration_id,'123456789','24A1',
            repeat('d',64),'{}','hmrc-vat-business-v1',repeat('e',64),actor);
        insert into "FIN_HmrcVatSubmissionAttempts"(id,period_id,approval_id,
          tenant_project_ref,environment,registration_id,vrn,period_key,
          payload_body,payload_sha256,status,reserved_by,dispatching_at,accepted_at)
          values(attempt_id,original_period,approval_id,'tenant-ref','production',
            registration_id,'123456789','24A1',body,
            encode(sha256(convert_to(body,'UTF8')),'hex'),'accepted',actor,now(),now());
        begin
          perform public.multideck_uk_vat_clawback_source_snapshot(
            actor,entity_id,target_period,doc_id);
          raise exception 'accepted status without receipt proved an original claim';
        exception when sqlstate '22023' then null; end;
        insert into "FIN_HmrcVatSubmissionReceipts"(attempt_id,period_id,
          tenant_project_ref,payload_sha256,processing_date,form_bundle_number,
          correlation_id,receipt_id,receipt_timestamp,recorded_by)
          values(attempt_id,original_period,'tenant-ref',
            encode(sha256(convert_to(body,'UTF8')),'hex'),
            '2024-04-01T10:00:00Z','123456789012',
            '12345678-1234-1234-1234-123456789012',
            '12345678-1234-1234-1234-123456789013',
            '2024-04-01T10:00:00Z',actor);
        insert into "FIN_CashTransactions" values(cash_a,entity_id,'supplier_payment',
          'posted','2024-06-01'),(cash_b,entity_id,'supplier_payment','posted','2024-08-01');
        insert into "FIN_CashAllocations" values(cash_a,doc_id,'allocated',30,
          '2024-06-01 12:00:00+00'),(cash_b,doc_id,'allocated',20,
          '2024-08-01 12:00:00+00');
        result:=public.multideck_uk_vat_clawback_source_snapshot(
          actor,entity_id,target_period,doc_id);
        if result->>'status'<>'source_verified_only'
          or (result->>'originallyClaimedInputVatGbp')::numeric<>20
          or (result->>'paidByFirstDate')::numeric<>30
          or (result->>'paidByPeriodEnd')::numeric<>50
          or (result->>'unpaidAtFirstDate')::numeric<>90
          or (result->>'unpaidAtPeriodEnd')::numeric<>70
          or result->>'firstPossibleRepaymentDate'<>'2024-07-31'
          or length(result->>'sourceFingerprint')<>64 then
          raise exception 'original claim and dated payments were not verified: %',result;
        end if;
        before_fingerprint:=result->>'sourceFingerprint';
        insert into "FIN_CashTransactions" values(cash_after,entity_id,'supplier_payment',
          'posted','2024-10-01');
        insert into "FIN_CashAllocations" values(cash_after,doc_id,'allocated',20,
          '2024-10-01 12:00:00+00');
        result:=public.multideck_uk_vat_clawback_source_snapshot(
          actor,entity_id,target_period,doc_id);
        if result->>'sourceFingerprint'<>before_fingerprint
          or (result->>'paidByPeriodEnd')::numeric<>50
          or jsonb_array_length(result->'payments')<>2 then
          raise exception 'later payment changed a prior-period VAT source snapshot';
        end if;
        begin
          perform public.multideck_uk_vat_prepare_first_input_tax_repayment(
            '00000000-0000-0000-0000-000000000018',entity_id,target_period,doc_id,
            'Read-only colleague tried preparing input VAT repayment');
          raise exception 'read-only colleague prepared VAT repayment';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_prepare_first_input_tax_repayment(
            '00000000-0000-0000-0000-000000000017',entity_id,target_period,doc_id,
            'Foreign-company actor tried preparing input VAT repayment');
          raise exception 'foreign-company actor prepared VAT repayment';
        exception when sqlstate '42501' then null; end;
        result:=public.multideck_uk_vat_prepare_first_input_tax_repayment(
          actor,entity_id,target_period,doc_id,
          'Reviewed the six-month unpaid supplier input VAT calculation');
        proposal_id:=(result->>'proposalId')::uuid;
        if result->>'status'<>'awaiting_accountant_review_and_posting'
          or result->>'ruleVersion'<>'uk-input-tax-six-month-v2'
          or (result->>'proposedRepaymentGbp')::numeric<>15
          or (result->>'proposedRestorationGbp')::numeric<>3.34
          or (result->>'proposedBox4DeltaGbp')::numeric<>-11.66
          or result->>'inserted'<>'true'
          or not exists(select 1 from "FIN_IndirectTaxInputTaxRepaymentProposals" proposal
            where proposal.id=proposal_id and proposal.legal_entity_id=entity_id
              and proposal.source_fingerprint=before_fingerprint
              and proposal.unpaid_at_first_date=90
              and proposal.proposed_repayment_gbp=15
              and proposal.proposed_restoration_gbp=3.34
              and proposal.proposed_box4_delta_gbp=-11.66)
          or not exists(select 1 from "Audit_Events"
            where "AuditEvent_Action"='prepare_input_tax_repayment'
              and "AuditEvent_RecordID"=proposal_id) then
          raise exception 'first input VAT repayment proposal was not auditable: %',result;
        end if;
        result:=public.multideck_uk_vat_prepare_first_input_tax_repayment(
          actor,entity_id,target_period,doc_id,
          'Rechecked the same proposed input VAT repayment');
        if (result->>'proposalId')::uuid<>proposal_id or result->>'inserted'<>'false'
          or (select count(*) from "FIN_IndirectTaxInputTaxRepaymentProposals"
            where period_id=target_period and document_id=doc_id)<>1 then
          raise exception 'unchanged input VAT proposal was duplicated'; end if;
        begin
          insert into "FIN_CashTransactions" values(cash_full,entity_id,'supplier_payment',
            'posted','2024-09-15');
          insert into "FIN_CashAllocations" values(cash_full,doc_id,'allocated',70,
            '2024-09-15 12:00:00+00');
          if public._multideck_uk_vat_unpaid_input_tax_risks(entity_id,'2024-09-30')<>1 then
            raise exception 'full later payment erased the first repayment event'; end if;
          result:=public.multideck_uk_vat_prepare_first_input_tax_repayment(
            actor,entity_id,target_period,doc_id,
            'Prepared a repayment and full same-period restoration');
          if (result->>'proposedRepaymentGbp')::numeric<>15
            or (result->>'proposedRestorationGbp')::numeric<>15
            or (result->>'proposedBox4DeltaGbp')::numeric<>0 then
            raise exception 'same-period full settlement lost either VAT account entry'; end if;
          raise exception 'rollback full settlement fixture' using errcode='P0003';
        exception when sqlstate 'P0003' then null; end;
        begin
          update "FIN_IndirectTaxInputTaxRepaymentProposals"
            set proposed_repayment_gbp=1 where id=proposal_id;
          raise exception 'immutable input VAT proposal changed';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_review_input_tax_repayment(
            '00000000-0000-0000-0000-000000000018',entity_id,proposal_id,
            offset_account,'Read-only colleague attempted to review input VAT');
          raise exception 'read-only colleague reviewed input VAT repayment';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_input_tax_repayment(
            '00000000-0000-0000-0000-000000000017',entity_id,proposal_id,
            offset_account,'Foreign-company actor attempted to review input VAT');
          raise exception 'foreign-company actor reviewed input VAT repayment';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_input_tax_repayment(actor,entity_id,
            proposal_id,control_account,'Attempted to choose a VAT control offset');
          raise exception 'VAT control account was accepted as a review offset';
        exception when sqlstate '22023' then null; end;
        begin
          update "FIN_CashAllocations" set "FINCashAlloc_AllocatedAmount"=25
            where "FINCashAlloc_CashID"=cash_b;
          perform public.multideck_uk_vat_review_input_tax_repayment(actor,entity_id,
            proposal_id,offset_account,'Attempted to review stale supplier payment evidence');
          raise exception 'stale input VAT proposal was reviewed';
        exception when sqlstate '22023' then
          if sqlerrm not like 'The repayment proposal is stale%' then raise; end if;
        end;
        result:=public.multideck_uk_vat_review_input_tax_repayment(actor,entity_id,
          proposal_id,offset_account,'Reviewed the original claim and offset account');
        review_id:=(result->>'reviewId')::uuid;
        if result->>'status'<>'reviewed_for_posting_only'
          or result->>'inserted'<>'true'
          or not exists(select 1 from "FIN_IndirectTaxInputTaxRepaymentReviews" review
            where review.id=review_id and review.proposal_id=(result->>'proposalId')::uuid
              and review.offset_nominal_id=offset_account)
          or not exists(select 1 from "Audit_Events"
            where "AuditEvent_Action"='review_input_tax_repayment'
              and "AuditEvent_RecordID"=review_id) then
          raise exception 'input VAT repayment review lacked binding or audit'; end if;
        result:=public.multideck_uk_vat_review_input_tax_repayment(actor,entity_id,
          proposal_id,offset_account,'Checked the same input VAT review again');
        if (result->>'reviewId')::uuid<>review_id or result->>'inserted'<>'false' then
          raise exception 'unchanged input VAT review duplicated'; end if;
        begin
          perform public.multideck_uk_vat_review_input_tax_repayment(actor,entity_id,
            proposal_id,replacement_account,'Attempted to change the reviewed offset');
          raise exception 'active input VAT review changed account without revocation';
        exception when sqlstate '22023' then
          if sqlerrm not like 'Revoke the current repayment review%' then raise; end if;
        end;
        begin
          update "FIN_IndirectTaxInputTaxRepaymentReviews"
            set offset_nominal_id=control_account where id=review_id;
          raise exception 'immutable input VAT review changed';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_revoke_input_tax_repayment_review(
            '00000000-0000-0000-0000-000000000018',entity_id,review_id,
            'Read-only colleague attempted to revoke the accountant review');
          raise exception 'read-only colleague revoked the review';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_revoke_input_tax_repayment_review(
            '00000000-0000-0000-0000-000000000017',entity_id,review_id,
            'Foreign-company actor attempted to revoke the accountant review');
          raise exception 'foreign-company actor revoked the review';
        exception when sqlstate '42501' then null; end;
        result:=public.multideck_uk_vat_revoke_input_tax_repayment_review(actor,entity_id,
          review_id,'Revoked this review before any adjustment posting');
        revocation_id:=(result->>'revocationId')::uuid;
        if result->>'status'<>'revoked_before_posting'
          or not exists(select 1 from "FIN_IndirectTaxInputTaxRepaymentReviewRevocations" revocation
            where revocation.id=revocation_id and revocation.review_id=(result->>'reviewId')::uuid)
          or not exists(select 1 from "Audit_Events"
            where "AuditEvent_Action"='revoke_input_tax_repayment_review'
              and "AuditEvent_RecordID"=revocation_id) then
          raise exception 'review revocation was not audited'; end if;
        result:=public.multideck_uk_vat_review_input_tax_repayment(actor,entity_id,
          proposal_id,replacement_account,'Re-reviewed replacement offset after revocation');
        replacement_review:=(result->>'reviewId')::uuid;
        if replacement_review=review_id or result->>'inserted'<>'true'
          or (result->>'offsetNominalId')::uuid<>replacement_account then
          raise exception 'revoked input VAT review could not be replaced'; end if;
        begin
          perform public.multideck_uk_vat_input_tax_repayment_schedule(actor,entity_id,review_id);
          raise exception 'revoked input VAT review produced a posting schedule';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_input_tax_repayment_schedule(
            '00000000-0000-0000-0000-000000000018',entity_id,replacement_review);
          raise exception 'read-only colleague received a posting schedule';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_input_tax_repayment_schedule(
            '00000000-0000-0000-0000-000000000017',entity_id,replacement_review);
          raise exception 'foreign colleague received a posting schedule';
        exception when sqlstate '42501' then null; end;
        result:=public.multideck_uk_vat_input_tax_repayment_schedule(
          actor,entity_id,replacement_review);
        if result->>'status'<>'reviewed_schedule_only_no_posting'
          or result#>>'{events,0,eventDate}'<>'2024-07-31'
          or (result#>>'{events,0,signedBox4DeltaGbp}')::numeric<>-15
          or result#>>'{events,1,eventDate}'<>'2024-08-01'
          or (result#>>'{events,1,signedBox4DeltaGbp}')::numeric<>3.34
          or jsonb_array_length(result->'events')<>2
          or (result->>'proposedBox4DeltaGbp')::numeric<>-11.66
          or length(result->>'scheduleFingerprint')<>64 then
          raise exception 'dated input VAT repayment and restoration did not reconcile: %',result;
        end if;
        if public._multideck_uk_vat_unpaid_input_tax_risks(entity_id,'2024-09-30')<>1
          or exists(select 1 from "FIN_IndirectTaxEvidence"
            where legal_entity_id=entity_id and source_kind='adjustment') then
          raise exception 'an unposted repayment proposal cleared the VAT draft gate';
        end if;
        insert into "FIN_Periods"("FINPeriod_ID","FINPeriod_LegalEntityID",
          "FINPeriod_StartDate","FINPeriod_EndDate","FINPeriod_StatusCode")
          values(gen_random_uuid(),entity_id,'2024-09-01','2024-09-30','open');
        insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID",
          "FINNom_Code","FINNom_Name","FINNom_ControlTypeCode",
          "FINNom_IsControlAccount","FINNom_AllowManualPosting")
          values(gen_random_uuid(),entity_id,'1200','Input VAT control','input_vat',true,false);
        begin
          perform public.multideck_uk_vat_post_input_tax_repayment(
            '00000000-0000-0000-0000-000000000018',entity_id,replacement_review,
            'Read-only colleague attempted supplier VAT posting',true);
          raise exception 'read-only colleague posted supplier VAT adjustment';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_post_input_tax_repayment(
            '00000000-0000-0000-0000-000000000017',entity_id,replacement_review,
            'Foreign colleague attempted supplier VAT posting',true);
          raise exception 'foreign colleague posted supplier VAT adjustment';
        exception when sqlstate '42501' then null; end;
        result:=public.multideck_uk_vat_post_input_tax_repayment(actor,entity_id,
          replacement_review,'Posted reviewed six-month supplier VAT movements',true);
        if result->>'status'<>'posted_pending_vat_calculation_and_signoff'
          or (result->>'box4DeltaGbp')::numeric<>-11.66
          or (result->>'eventCount')::integer<>2
          or (select "FINPostBatch_StatusCode" from "FIN_PostingBatches"
            where "FINPostBatch_ID"=(result->>'batchId')::uuid)<>'posted'
          or (select "FINPostBatch_DebitTotal" from "FIN_PostingBatches"
            where "FINPostBatch_ID"=(result->>'batchId')::uuid)<>18.34
          or (select count(*) from "FIN_PostingLines"
            where "FINPostLine_BatchID"=(result->>'batchId')::uuid)<>4
          or (select count(*) from "FIN_IndirectTaxInputTaxRepaymentPostingEvents"
            where posting_id=(result->>'postingId')::uuid)<>2
          or not exists(select 1 from "Audit_Events"
            where "AuditEvent_Action"='post_input_tax_repayment'
              and "AuditEvent_RecordID"=(result->>'postingId')::uuid) then
          raise exception 'supplier VAT repayment did not post balanced dated evidence'; end if;
        result:=public.multideck_uk_vat_calculate_draft(actor,target_period);
        target_calc_id:=(result->>'calculationId')::uuid;
        target_digest:=result->>'sourceDigest';
        if (result#>>'{boxes,4}')::numeric<>-11.66
          or (result#>>'{boxes,5}')::numeric<>11.66
          or (result#>>'{boxes,7}')::numeric<>0
          or result#>>'{sourceLedger,status}'<>'matched'
          or (result#>>'{sourceLedger,checked}')::integer<>2
          or (select calculation_version from "FIN_IndirectTaxCalculations"
            where id=(result->>'calculationId')::uuid)<>'uk-standard-input-tax-repayment-v1'
          or (select count(*) from "FIN_IndirectTaxCalculationLines" line
            join "FIN_IndirectTaxInputTaxRepaymentPostingEvents" event
              on event.evidence_id=line.evidence_id
            where line.calculation_id=(result->>'calculationId')::uuid
              and line.box_number=4 and line.signed_amount=event.signed_box4_delta_gbp)<>2 then
          raise exception 'supplier VAT repayment did not reconcile into Box 4: %',result;
        end if;
        result:=public.multideck_uk_vat_tax_posting_inventory(actor,entity_id,
          (result->>'calculationId')::uuid);
        if (result->>'linkedLines')::integer<>2
          or (result#>>'{controlBridge,sourceVatDueGbp}')::numeric<>11.66
          or (result#>>'{controlBridge,vatAccountNetCreditGbp}')::numeric<>11.66
          or (result#>>'{controlBridge,differenceGbp}')::numeric<>0 then
          raise exception 'supplier VAT repayment was absent from the native VAT control bridge: %',result;
        end if;
        begin
          update "FIN_PostingLines" set "FINPostLine_CreditAmount"=0
            where "FINPostLine_ID"=(select tax_posting_line_id
              from "FIN_IndirectTaxInputTaxRepaymentPostingEvents"
              where period_id=target_period and event_kind='six_month_repayment');
          perform public.multideck_uk_vat_current_snapshot(actor,target_period);
          raise exception 'tampered supplier VAT journal was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          update "FIN_IndirectTaxDecisions" set tax_point='2024-10-01'
            where id=(select posted_event.decision_id
              from "FIN_IndirectTaxInputTaxRepaymentPostingEvents" posted_event
              where posted_event.period_id=target_period
                and posted_event.event_kind='payment_restoration');
          perform public.multideck_uk_vat_current_snapshot(actor,target_period);
          raise exception 'supplier VAT event escaped its posted period';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_post_input_tax_repayment(actor,entity_id,
            replacement_review,'Duplicate supplier VAT posting is forbidden',true);
          raise exception 'duplicate supplier VAT repayment was posted';
        exception when sqlstate '23505' then null; end;
        begin
          perform public.multideck_uk_vat_revoke_input_tax_repayment_review(actor,entity_id,
            replacement_review,'Attempted to revoke an already posted VAT review');
          raise exception 'posted supplier VAT review was revoked';
        exception when sqlstate '22023' then null; end;
        next_period:=(public.multideck_uk_vat_create_draft_period(actor,entity_id,
          '2024-10-01','2024-12-31')->>'periodId')::uuid;
        begin
          perform public.multideck_uk_vat_later_input_tax_restoration_source(
            actor,entity_id,next_period,doc_id);
          raise exception 'an unreviewed initial clawback allowed later restoration';
        exception when sqlstate '22023' then null; end;
        insert into "FIN_IndirectTaxPeriodReviewLocks"(id,period_id,calculation_id,
          source_digest,control_review_id,control_fingerprint,filing_projection_id,
          projection_fingerprint,lock_fingerprint,locked_by,reason)
          values(target_lock_id,target_period,target_calc_id,target_digest,
            control_id,repeat('b',64),projection_id,repeat('c',64),
            repeat('f',64),actor,'Reviewed supplier input VAT repayment');
        update "FIN_IndirectTaxPeriods" set status='review_locked',
          active_review_lock_id=target_lock_id where id=target_period;
        begin
          perform public.multideck_uk_vat_later_input_tax_restoration_source(
            '00000000-0000-0000-0000-000000000018',entity_id,next_period,doc_id);
          raise exception 'read-only colleague prepared later supplier VAT restoration';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_later_input_tax_restoration_source(
            '00000000-0000-0000-0000-000000000017',entity_id,next_period,doc_id);
          raise exception 'foreign colleague prepared later supplier VAT restoration';
        exception when sqlstate '42501' then null; end;
        result:=public.multideck_uk_vat_later_input_tax_restoration_source(
          actor,entity_id,next_period,doc_id);
        if result->>'status'<>'source_only_no_posting'
          or (result->>'restorationBox4Gbp')::numeric<>3.33
          or (result->>'paidBeforePeriodGbp')::numeric<>50
          or (result->>'paidByPeriodEndGbp')::numeric<>70
          or (result->>'unpaidAtPeriodEndGbp')::numeric<>50
          or (result#>>'{events,0,eventDate}')<>'2024-10-01'
          or (result#>>'{events,0,signedBox4DeltaGbp}')::numeric<>3.33
          or length(result->>'sourceFingerprint')<>64 then
          raise exception 'later supplier payment did not produce its own dated restoration: %',result;
        end if;
        before_fingerprint:=result->>'sourceFingerprint';
        begin
          perform public.multideck_uk_vat_review_later_input_tax_restoration(
            '00000000-0000-0000-0000-000000000018',entity_id,next_period,doc_id,
            replacement_account,'Read-only colleague attempted later VAT review',true);
          raise exception 'read-only colleague reviewed supplier VAT restoration';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_later_input_tax_restoration(
            '00000000-0000-0000-0000-000000000017',entity_id,next_period,doc_id,
            replacement_account,'Foreign colleague attempted later VAT review',true);
          raise exception 'foreign colleague reviewed supplier VAT restoration';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_later_input_tax_restoration(
            actor,entity_id,next_period,doc_id,control_account,
            'Control account must not be an adjustment offset',true);
          raise exception 'VAT control account was accepted as restoration offset';
        exception when sqlstate '22023' then null; end;
        result:=public.multideck_uk_vat_review_later_input_tax_restoration(
          actor,entity_id,next_period,doc_id,replacement_account,
          'Reviewed the October supplier input VAT restoration',true);
        later_review:=(result->>'reviewId')::uuid;
        if result->>'status'<>'reviewed_not_posted'
          or (result->>'restorationBox4Gbp')::numeric<>3.33
          or result->>'sourceFingerprint'<>before_fingerprint
          or result->>'inserted'<>'true'
          or not exists(select 1 from "Audit_Events"
            where "AuditEvent_Action"='review_later_input_tax_restoration'
              and "AuditEvent_RecordID"=later_review) then
          raise exception 'later supplier VAT restoration review was not bound to source';
        end if;
        result:=public.multideck_uk_vat_review_later_input_tax_restoration(
          actor,entity_id,next_period,doc_id,replacement_account,
          'Reviewed the October supplier input VAT restoration',true);
        if (result->>'reviewId')::uuid<>later_review
          or result->>'inserted'<>'false'
          or (select count(*) from "FIN_IndirectTaxLaterInputTaxRestorationReviews"
            where period_id=next_period and document_id=doc_id)<>1 then
          raise exception 'repeat accountant review was not idempotent';
        end if;
        result:=public.multideck_uk_vat_later_input_tax_restoration_reviews(
          '00000000-0000-0000-0000-000000000018',entity_id,next_period,doc_id);
        if (result->>'total')::integer<>1
          or (result#>>'{reviews,0,reviewId}')::uuid<>later_review then
          raise exception 'same-company colleague could not read later VAT review';
        end if;
        begin
          insert into "FIN_CashTransactions" values(cash_small,entity_id,
            'supplier_payment','posted','2024-10-02');
          insert into "FIN_CashAllocations" values(cash_small,doc_id,'allocated',0.01,
            '2024-10-02 12:00:00+00');
          result:=public.multideck_uk_vat_later_input_tax_restoration_source(
            actor,entity_id,next_period,doc_id);
          if (result->>'restorationBox4Gbp')::numeric<>3.33
            or jsonb_array_length(result->'events')<>1
            or result->>'sourceFingerprint'=before_fingerprint then
            raise exception 'a sub-penny VAT effect was mishandled';
          end if;
          raise exception 'rollback small-payment probe' using errcode='P0001';
        exception when sqlstate 'P0001' then null; end;
        insert into "FIN_Periods"("FINPeriod_ID","FINPeriod_LegalEntityID",
          "FINPeriod_StartDate","FINPeriod_EndDate","FINPeriod_StatusCode")
          values(gen_random_uuid(),entity_id,'2024-12-01','2024-12-31','open');
        begin
          perform public.multideck_uk_vat_post_later_input_tax_restoration(
            '00000000-0000-0000-0000-000000000018',entity_id,later_review,
            'Read-only colleague attempted later supplier VAT posting',true);
          raise exception 'read-only colleague posted later supplier VAT restoration';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_post_later_input_tax_restoration(
            '00000000-0000-0000-0000-000000000017',entity_id,later_review,
            'Foreign colleague attempted later supplier VAT posting',true);
          raise exception 'foreign colleague posted later supplier VAT restoration';
        exception when sqlstate '42501' then null; end;
        result:=public.multideck_uk_vat_post_later_input_tax_restoration(
          actor,entity_id,later_review,
          'Posted reviewed October supplier input VAT restoration',true);
        if result->>'status'<>'posted_pending_vat_calculation_and_signoff'
          or (result->>'restorationBox4Gbp')::numeric<>3.33
          or (result->>'eventCount')::integer<>1
          or (select "FINPostBatch_StatusCode" from "FIN_PostingBatches"
            where "FINPostBatch_ID"=(result->>'batchId')::uuid)<>'posted'
          or (select "FINPostBatch_DebitTotal" from "FIN_PostingBatches"
            where "FINPostBatch_ID"=(result->>'batchId')::uuid)<>3.33
          or (select count(*) from "FIN_PostingLines"
            where "FINPostLine_BatchID"=(result->>'batchId')::uuid)<>2
          or (select count(*) from "FIN_IndirectTaxLaterInputTaxRestorationPostingEvents"
            where posting_id=(result->>'postingId')::uuid)<>1
          or not exists(select 1 from "Audit_Events"
            where "AuditEvent_Action"='post_later_input_tax_restoration'
              and "AuditEvent_RecordID"=(result->>'postingId')::uuid) then
          raise exception 'later supplier VAT restoration did not post native evidence: %',result;
        end if;
        result:=public.multideck_uk_vat_calculate_draft(actor,next_period);
        oct_calc_id:=(result->>'calculationId')::uuid;
        oct_digest:=result->>'sourceDigest';
        if (result#>>'{boxes,4}')::numeric<>3.33
          or (result#>>'{boxes,5}')::numeric<>3.33
          or (result#>>'{boxes,7}')::numeric<>0
          or result#>>'{sourceLedger,status}'<>'matched'
          or (result#>>'{sourceLedger,checked}')::integer<>1
          or (select calculation_version from "FIN_IndirectTaxCalculations"
            where id=(result->>'calculationId')::uuid)<>'uk-standard-later-restoration-v1'
          or (select count(*) from "FIN_IndirectTaxCalculationLines" line
            join "FIN_IndirectTaxLaterInputTaxRestorationPostingEvents" event
              on event.evidence_id=line.evidence_id
            where line.calculation_id=(result->>'calculationId')::uuid
              and line.box_number=4 and line.signed_amount=event.signed_box4_delta_gbp)<>1 then
          raise exception 'later supplier VAT restoration was omitted from Box 4: %',result;
        end if;
        result:=public.multideck_uk_vat_tax_posting_inventory(actor,entity_id,
          (result->>'calculationId')::uuid);
        if (result->>'linkedLines')::integer<>1
          or (result#>>'{controlBridge,sourceVatDueGbp}')::numeric<>-3.33
          or (result#>>'{controlBridge,vatAccountNetCreditGbp}')::numeric<>-3.33
          or (result#>>'{controlBridge,differenceGbp}')::numeric<>0 then
          raise exception 'later supplier VAT restoration missed the control bridge: %',result;
        end if;
        begin
          perform public.multideck_uk_vat_post_later_input_tax_restoration(
            actor,entity_id,later_review,'Duplicate later supplier VAT posting denied',true);
          raise exception 'duplicate later supplier VAT restoration was posted';
        exception when sqlstate '23505' then null; end;
        begin
          perform public.multideck_uk_vat_review_later_input_tax_restoration(
            actor,entity_id,next_period,doc_id,replacement_account,
            'A later review must not replace a posted supplier VAT adjustment',true);
          raise exception 'posted supplier VAT restoration received another review';
        exception when sqlstate '22023' then null; end;
        insert into "FIN_CashTransactions" values(cash_full,entity_id,'supplier_payment',
          'posted','2025-01-05');
        insert into "FIN_CashAllocations" values(cash_full,doc_id,'allocated',10,
          '2025-01-05 12:00:00+00');
        result:=public.multideck_uk_vat_later_input_tax_restoration_source(
          actor,entity_id,next_period,doc_id);
        if result->>'sourceFingerprint'<>before_fingerprint then
          raise exception 'a later-period payment rewrote the previous restoration source';
        end if;
        missed_period:=(public.multideck_uk_vat_create_draft_period(actor,entity_id,
          '2025-01-01','2025-03-31')->>'periodId')::uuid;
        begin
          perform public.multideck_uk_vat_later_input_tax_restoration_source(
            actor,entity_id,missed_period,doc_id);
          raise exception 'an unreviewed October supplier payment moved to January';
        exception when sqlstate '22023' then null; end;
        insert into "FIN_IndirectTaxPeriodReviewLocks"(id,period_id,calculation_id,
          source_digest,control_review_id,control_fingerprint,filing_projection_id,
          projection_fingerprint,lock_fingerprint,locked_by,reason)
          values(oct_lock_id,next_period,oct_calc_id,oct_digest,
            control_id,repeat('b',64),projection_id,repeat('c',64),
            repeat('e',64),actor,'Reviewed October supplier VAT restoration');
        update "FIN_IndirectTaxPeriods" set status='review_locked',
          active_review_lock_id=oct_lock_id where id=next_period;
        result:=public.multideck_uk_vat_later_input_tax_restoration_source(
          actor,entity_id,missed_period,doc_id);
        if (result->>'restorationBox4Gbp')::numeric<>1.67
          or (result->>'priorRepaymentOutstandingGbp')::numeric<>8.33
          or (result->>'paidBeforePeriodGbp')::numeric<>70
          or (result->>'paidByPeriodEndGbp')::numeric<>80
          or (result#>>'{events,0,eventDate}')<>'2025-01-05' then
          raise exception 'January restoration did not continue the October VAT chain: %',result;
        end if;
        result:=public.multideck_uk_vat_review_later_input_tax_restoration(
          actor,entity_id,missed_period,doc_id,replacement_account,
          'Reviewed January supplier input VAT restoration',true);
        later_review:=(result->>'reviewId')::uuid;
        insert into "FIN_Periods"("FINPeriod_ID","FINPeriod_LegalEntityID",
          "FINPeriod_StartDate","FINPeriod_EndDate","FINPeriod_StatusCode")
          values(gen_random_uuid(),entity_id,'2025-03-01','2025-03-31','open');
        result:=public.multideck_uk_vat_post_later_input_tax_restoration(
          actor,entity_id,later_review,
          'Posted reviewed January supplier input VAT restoration',true);
        if (result->>'restorationBox4Gbp')::numeric<>1.67
          or (result->>'eventCount')::integer<>1 then
          raise exception 'January supplier VAT restoration did not post: %',result;
        end if;
        result:=public.multideck_uk_vat_calculate_draft(actor,missed_period);
        jan_calc_id:=(result->>'calculationId')::uuid;
        jan_digest:=result->>'sourceDigest';
        if (result#>>'{boxes,4}')::numeric<>1.67
          or (result#>>'{boxes,5}')::numeric<>1.67
          or result#>>'{sourceLedger,status}'<>'matched'
          or (result#>>'{sourceLedger,checked}')::integer<>1 then
          raise exception 'January supplier VAT restoration did not reach Box 4: %',result;
        end if;
        insert into "FIN_IndirectTaxPeriodReviewLocks"(id,period_id,calculation_id,
          source_digest,control_review_id,control_fingerprint,filing_projection_id,
          projection_fingerprint,lock_fingerprint,locked_by,reason)
          values(jan_lock_id,missed_period,jan_calc_id,jan_digest,
            control_id,repeat('b',64),projection_id,repeat('c',64),
            repeat('d',64),actor,'Reviewed January supplier VAT restoration');
        update "FIN_IndirectTaxPeriods" set status='review_locked',
          active_review_lock_id=jan_lock_id where id=missed_period;
        zero_period:=(public.multideck_uk_vat_create_draft_period(actor,entity_id,
          '2025-04-01','2025-06-30')->>'periodId')::uuid;
        insert into "FIN_CashTransactions" values(cash_zero,entity_id,
          'supplier_payment','posted','2025-04-01');
        insert into "FIN_CashAllocations" values(cash_zero,doc_id,'allocated',0.01,
          '2025-04-01 12:00:00+00');
        result:=public.multideck_uk_vat_later_input_tax_restoration_source(
          actor,entity_id,zero_period,doc_id);
        if result->>'status'<>'source_only_no_tax_effect'
          or (result->>'restorationBox4Gbp')::numeric<>0
          or jsonb_array_length(result->'events')<>0
          or (result->>'unpaidAtPeriodEndGbp')::numeric<>39.99 then
          raise exception 'zero-penny supplier VAT payment source was misclassified: %',result;
        end if;
        result:=public.multideck_uk_vat_review_later_input_tax_restoration(
          actor,entity_id,zero_period,doc_id,replacement_account,
          'Reviewed the zero-penny VAT effect of supplier payment',true);
        later_review:=(result->>'reviewId')::uuid;
        result:=public.multideck_uk_vat_post_later_input_tax_restoration(
          actor,entity_id,later_review,
          'Confirmed the zero-penny supplier VAT effect without a journal',true);
        if result->>'status'<>'zero_tax_effect_confirmed'
          or result->>'batchId' is not null
          or (result->>'eventCount')::integer<>0 then
          raise exception 'zero-penny supplier payment created an invalid journal: %',result;
        end if;
        result:=public.multideck_uk_vat_calculate_draft(actor,zero_period);
        if (result#>>'{boxes,4}')::numeric<>0
          or (result#>>'{sourceLedger,checked}')::integer<>0
          or result#>>'{sourceLedger,status}'<>'matched'
          or (select calculation_version from "FIN_IndirectTaxCalculations"
            where id=(result->>'calculationId')::uuid)<>'uk-standard-later-restoration-v1' then
          raise exception 'zero-penny supplier payment did not preserve VAT period integrity: %',result;
        end if;
        result:=public.multideck_uk_vat_supplier_input_tax_history(
          '00000000-0000-0000-0000-000000000018',entity_id,
          target_period,doc_id);
        if jsonb_array_length(result->'firstProposals')<1
          or jsonb_array_length(result->'firstReviews')<1
          or jsonb_array_length(result->'firstPostings')<>1
          or (result#>>'{firstPostings,0,box4DeltaGbp}')::numeric<>-11.66 then
          raise exception 'company colleague could not read first supplier VAT history';
        end if;
        result:=public.multideck_uk_vat_supplier_input_tax_history(
          '00000000-0000-0000-0000-000000000018',entity_id,
          zero_period,doc_id);
        if jsonb_array_length(result->'laterReviews')<>1
          or jsonb_array_length(result->'laterPostings')<>1
          or result#>>'{laterPostings,0,status}'<>'zero_tax_effect_confirmed' then
          raise exception 'zero-effect supplier VAT audit history was unavailable';
        end if;
        begin
          perform public.multideck_uk_vat_supplier_input_tax_history(
            '00000000-0000-0000-0000-000000000017',entity_id,
            zero_period,doc_id);
          raise exception 'foreign colleague read supplier VAT adjustment history';
        exception when sqlstate '42501' then null; end;
      end $snapshot_positive$;
      select 'verified';`), "verified")
    assert.equal(sql(`select count(*) from information_schema.role_table_grants
      where table_name='FIN_IndirectTaxCreditLinks' and grantee='service_role'
        and privilege_type in ('INSERT','UPDATE','DELETE')`), '0')
    sql(`set role service_role;
      do $credit_write$ begin
        begin
          insert into public."FIN_IndirectTaxCreditLinks" default values;
          raise exception 'service role inserted a VAT credit link directly';
        exception when insufficient_privilege then null; end;
      end $credit_write$;`)
    assert.equal(sql(`select has_function_privilege('authenticated',
      'public.multideck_uk_vat_account(uuid,uuid,uuid,integer,integer)','EXECUTE')`), "f")
    assert.equal(sql(`select has_function_privilege('authenticated',
      'public._multideck_uk_vat_account_base(uuid,uuid,uuid,integer,integer)','EXECUTE')`), "f")
    assert.equal(sql(`
      do $reversal$
      declare entity_id uuid:='00000000-0000-0000-0000-000000000001';
        actor uuid:='00000000-0000-0000-0000-000000000003';
        original_doc uuid:='00000000-0000-0000-0000-0000000000a1';
        original_line uuid:='00000000-0000-0000-0000-0000000000a2';
        original_batch uuid:='00000000-0000-0000-0000-0000000000a3';
        source_doc uuid:='00000000-0000-0000-0000-0000000000b0';
        source_line uuid:='00000000-0000-0000-0000-0000000000b1';
        source_batch uuid:='00000000-0000-0000-0000-0000000000b2';
        conflict_doc uuid:='00000000-0000-0000-0000-0000000000b3';
        conflict_line uuid:='00000000-0000-0000-0000-0000000000b4';
        conflict_batch uuid:='00000000-0000-0000-0000-0000000000b5';
        reversal_doc uuid:='00000000-0000-0000-0000-0000000000a4';
        reversal_line uuid:='00000000-0000-0000-0000-0000000000a5';
        reversal_batch uuid:='00000000-0000-0000-0000-0000000000a6';
        bad_doc uuid:='00000000-0000-0000-0000-0000000000a7';
        bad_line uuid:='00000000-0000-0000-0000-0000000000a8';
        bad_batch uuid:='00000000-0000-0000-0000-0000000000a9';
        credit_doc uuid:='00000000-0000-0000-0000-0000000000aa';
        credit_line uuid:='00000000-0000-0000-0000-0000000000ab';
        credit_batch uuid:='00000000-0000-0000-0000-0000000000ac';
        excess_doc uuid:='00000000-0000-0000-0000-0000000000ad';
        excess_line uuid:='00000000-0000-0000-0000-0000000000ae';
        excess_batch uuid:='00000000-0000-0000-0000-0000000000af';
        original_evidence uuid; source_evidence uuid; reversal_evidence uuid; credit_evidence uuid; excess_evidence uuid;
        account_period uuid; account_calculation uuid; reversal_decision uuid; credit_decision uuid;
        account_result jsonb; linked_row jsonb; ordinary_row jsonb; credit_link jsonb;
        candidates jsonb;
      begin
        insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_LegalEntityID","FINPostBatch_StatusCode")
          values(original_batch,entity_id,'posted'),(reversal_batch,entity_id,'posted'),
            (bad_batch,entity_id,'posted'),(credit_batch,entity_id,'posted'),
            (source_batch,entity_id,'posted');
        insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_NativePostingStatusCode",
          "FINDoc_NativePostingBatchID","FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate",
          "FINDoc_DocumentDate","FINDoc_NativePostedBy","FINDoc_TypeCode","FINDoc_Number")
          values(original_doc,entity_id,'draft',original_batch,'GBP',1,'2026-08-01',actor,'sl_invoice','ORIG-1');
        insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID","FINDocLine_LineNo",
          "FINDocLine_NetAmount","FINDocLine_TaxAmount","FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount")
          values(original_line,original_doc,1,100,20,100,20);
        update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
          where "FINDoc_ID"=original_doc;
        select id into original_evidence from "FIN_IndirectTaxEvidence"
          where source_document_line_id=original_line;
        if original_evidence is null then raise exception 'original VAT evidence was not captured'; end if;
        insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_NativePostingStatusCode",
          "FINDoc_NativePostingBatchID","FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate",
          "FINDoc_DocumentDate","FINDoc_NativePostedBy","FINDoc_TypeCode","FINDoc_Number")
          values(source_doc,entity_id,'draft',source_batch,'GBP',1,'2026-08-01',actor,'sl_invoice','SOURCE-1');
        insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID","FINDocLine_LineNo",
          "FINDocLine_NetAmount","FINDocLine_TaxAmount","FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount")
          values(source_line,source_doc,1,100,20,100,20);
        update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
          where "FINDoc_ID"=source_doc;
        select id into source_evidence from "FIN_IndirectTaxEvidence"
          where source_document_line_id=source_line;
        if source_evidence is null then raise exception 'second original invoice evidence was not captured'; end if;
        insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_NativePostingStatusCode",
          "FINDoc_NativePostingBatchID","FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate",
          "FINDoc_DocumentDate","FINDoc_NativePostedBy","FINDoc_TypeCode",
          "FINDoc_SourceTable","FINDoc_SourceID","FINDoc_MetadataJSON")
          values(reversal_doc,entity_id,'draft',reversal_batch,'GBP',1,'2026-08-02',actor,'credit_note',
            'FIN_Documents',original_doc,jsonb_build_object('billingPartyCorrection',true,
              'correctionRole','reversal','sourceDocumentId',original_doc));
        insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID","FINDocLine_LineNo",
          "FINDocLine_NetAmount","FINDocLine_TaxAmount","FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount")
          values(reversal_line,reversal_doc,1,-100,-20,-100,-20);
        update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
          where "FINDoc_ID"=reversal_doc;
        if (select reverses_evidence_id from "FIN_IndirectTaxEvidence"
          where source_document_line_id=reversal_line) is distinct from original_evidence then
          raise exception 'billing-party reversal lost its original VAT evidence link'; end if;
        select id into reversal_evidence from "FIN_IndirectTaxEvidence"
          where source_document_line_id=reversal_line;
        insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_NativePostingStatusCode",
          "FINDoc_NativePostingBatchID","FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate",
          "FINDoc_DocumentDate","FINDoc_NativePostedBy","FINDoc_TypeCode",
          "FINDoc_SourceTable","FINDoc_SourceID","FINDoc_MetadataJSON")
          values(bad_doc,entity_id,'draft',bad_batch,'GBP',1,'2026-08-03',actor,'credit_note',
            'FIN_Documents',original_doc,jsonb_build_object('billingPartyCorrection',true,
              'correctionRole','reversal','sourceDocumentId',original_doc));
        insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID","FINDocLine_LineNo",
          "FINDocLine_NetAmount","FINDocLine_TaxAmount","FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount")
          values(bad_line,bad_doc,1,-99,-20,-99,-20);
        begin
          update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
            where "FINDoc_ID"=bad_doc;
          raise exception 'mismatched VAT reversal was posted';
        exception when sqlstate '22023' then
          if sqlerrm not like 'VAT correction reversal lacks matching original line evidence%' then raise; end if;
        end;
        insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_NativePostingStatusCode",
          "FINDoc_NativePostingBatchID","FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate",
          "FINDoc_DocumentDate","FINDoc_NativePostedBy","FINDoc_TypeCode")
          values(credit_doc,entity_id,'draft',credit_batch,'GBP',1,'2026-08-04',actor,'credit_note');
        insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID","FINDocLine_LineNo",
          "FINDocLine_NetAmount","FINDocLine_TaxAmount","FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount")
          values(credit_line,credit_doc,1,-5,-1,-5,-1);
        update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
          where "FINDoc_ID"=credit_doc;
        if not exists(select 1 from "FIN_IndirectTaxEvidence"
          where source_document_line_id=credit_line and reverses_evidence_id is null) then
          raise exception 'ordinary credit was incorrectly classified as a reversal'; end if;
        select id into credit_evidence from "FIN_IndirectTaxEvidence"
          where source_document_line_id=credit_line;
        candidates:=public.multideck_uk_vat_credit_candidates(actor,entity_id,credit_evidence,'SOURCE');
        if jsonb_array_length(candidates->'candidates')<>1
          or candidates#>>'{candidates,0,evidenceId}' is distinct from source_evidence::text
          or candidates#>>'{candidates,0,lineNo}' is distinct from '1'
          or candidates#>>'{candidates,0,currencyCode}' is distinct from 'GBP' then
          raise exception 'VAT credit candidate search did not find the original invoice line'; end if;
        if jsonb_array_length((public.multideck_uk_vat_credit_candidates(actor,entity_id,
            credit_evidence,'ORIG'))->'candidates')<>0 then
          raise exception 'exactly reversed invoice appeared as a credit candidate'; end if;
        begin
          perform public.multideck_uk_vat_credit_candidates(
            '00000000-0000-0000-0000-000000000018',entity_id,credit_evidence,'SOURCE');
          raise exception 'read-only colleague searched VAT credit origins';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_link_credit(
            '00000000-0000-0000-0000-000000000018',entity_id,credit_evidence,
            source_evidence,'Read-only colleague attempted a VAT credit link');
          raise exception 'read-only colleague linked a VAT credit';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_link_credit(
            '00000000-0000-0000-0000-000000000017',entity_id,credit_evidence,
            source_evidence,'Foreign company attempted a VAT credit link');
          raise exception 'foreign company linked a VAT credit';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_link_credit(actor,entity_id,credit_evidence,
            original_evidence,'Tried to link the credit to an already reversed invoice');
          raise exception 'exactly reversed invoice received an ordinary credit link';
        exception when sqlstate '22023' then
          if sqlerrm not like 'An exactly reversed invoice cannot%' then raise; end if;
        end;
        credit_link:=public.multideck_uk_vat_link_credit(actor,entity_id,credit_evidence,
          source_evidence,'Partial customer credit correcting the original invoice line');
        if credit_link->>'inserted'<>'true'
          or (credit_link->>'creditEvidenceId')::uuid<>credit_evidence
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='link_vat_credit'
            and "AuditEvent_RecordID"=(credit_link->>'linkId')::uuid) then
          raise exception 'ordinary VAT credit link was not recorded and audited'; end if;
        if (public.multideck_uk_vat_link_credit(actor,entity_id,credit_evidence,
            source_evidence,'Repeated partial customer credit review')->>'linkedAt')
            is distinct from credit_link->>'linkedAt' then
          raise exception 'VAT credit link retry changed the original date'; end if;
        begin
          perform public.multideck_uk_vat_link_credit(actor,entity_id,credit_evidence,
            original_evidence,'Tried to link the credit to an already reversed invoice');
          raise exception 'exactly reversed invoice received an ordinary credit link';
        exception when sqlstate '22023' then null; end;
        begin
          update "FIN_IndirectTaxCreditLinks" set reason='Changed link reason'
            where id=(credit_link->>'linkId')::uuid;
          raise exception 'VAT credit link was mutable';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_link_credit(actor,entity_id,reversal_evidence,
            original_evidence,'Tried to relabel an exact reversal as a partial credit');
          raise exception 'exact reversal received an ordinary credit link';
        exception when sqlstate '22023' then null; end;
        insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_LegalEntityID","FINPostBatch_StatusCode")
          values(conflict_batch,entity_id,'posted');
        insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_NativePostingStatusCode",
          "FINDoc_NativePostingBatchID","FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate",
          "FINDoc_DocumentDate","FINDoc_NativePostedBy","FINDoc_TypeCode",
          "FINDoc_SourceTable","FINDoc_SourceID","FINDoc_MetadataJSON")
          values(conflict_doc,entity_id,'draft',conflict_batch,'GBP',1,'2026-08-05',actor,'credit_note',
            'FIN_Documents',source_doc,jsonb_build_object('billingPartyCorrection',true,
              'correctionRole','reversal','sourceDocumentId',source_doc));
        insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID","FINDocLine_LineNo",
          "FINDocLine_NetAmount","FINDocLine_TaxAmount","FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount")
          values(conflict_line,conflict_doc,1,-100,-20,-100,-20);
        begin
          update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
            where "FINDoc_ID"=conflict_doc;
          raise exception 'invoice with linked credit received an exact reversal';
        exception when sqlstate '22023' then
          if sqlerrm not like 'An invoice with linked credits cannot%' then raise; end if;
        end;
        insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_LegalEntityID","FINPostBatch_StatusCode")
          values(excess_batch,entity_id,'posted');
        insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_NativePostingStatusCode",
          "FINDoc_NativePostingBatchID","FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate",
          "FINDoc_DocumentDate","FINDoc_NativePostedBy","FINDoc_TypeCode")
          values(excess_doc,entity_id,'draft',excess_batch,'GBP',1,'2026-08-05',actor,'credit_note');
        insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID","FINDocLine_LineNo",
          "FINDocLine_NetAmount","FINDocLine_TaxAmount","FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount")
          values(excess_line,excess_doc,1,-96,-19,-96,-19);
        update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
          where "FINDoc_ID"=excess_doc;
        select id into excess_evidence from "FIN_IndirectTaxEvidence"
          where source_document_line_id=excess_line;
        candidates:=public.multideck_uk_vat_credit_candidates(actor,entity_id,excess_evidence,'SOURCE');
        if jsonb_array_length(candidates->'candidates')<>0 then
          raise exception 'overcredit original remained an eligible search result'; end if;
        begin
          perform public.multideck_uk_vat_link_credit(actor,entity_id,excess_evidence,
            source_evidence,'Second credit would exceed the original invoice line');
          raise exception 'overcredited VAT invoice was linked';
        exception when sqlstate '22023' then
          if sqlerrm not like 'The linked VAT credits exceed%' then raise; end if;
        end;
        begin
          insert into "FIN_IndirectTaxEvidence"(legal_entity_id,jurisdiction_code,source_kind,source_id,
            source_posting_batch_id,source_document_id,source_document_line_id,source_version,
            currency_code,exchange_rate,signed_net_amount,signed_tax_amount,
            signed_net_reporting,signed_tax_reporting,reverses_evidence_id,recorded_by)
          values(entity_id,'GB','posted_document_line',credit_line,credit_batch,credit_doc,
            credit_line,credit_batch::text,'GBP',1,-5,-1,-5,-1,original_evidence,actor);
          raise exception 'ordinary credit forged a VAT reversal link';
        exception when sqlstate '22023' then
          if sqlerrm not like 'VAT reversal evidence must match its posted original line%' then raise; end if;
        end;
        select id into account_period from "FIN_IndirectTaxPeriods"
          where legal_entity_id=entity_id and start_date='2026-07-01' and end_date='2026-09-30';
        insert into "FIN_IndirectTaxDecisions"(evidence_id,revision,tax_point,scheme_code,
          treatment_code,reviewed_rule_reference,review_reason,reviewed_by)
          values(reversal_evidence,1,'2026-08-02','standard','domestic_standard','UK20',
            'Reviewed reversal for account readback',actor) returning id into reversal_decision;
        insert into "FIN_IndirectTaxDecisions"(evidence_id,revision,tax_point,scheme_code,
          treatment_code,reviewed_rule_reference,review_reason,reviewed_by)
          values(credit_evidence,1,'2026-08-04','standard','domestic_standard','UK20',
            'Reviewed ordinary credit for account readback',actor) returning id into credit_decision;
        insert into "FIN_IndirectTaxCalculations"(period_id,revision,calculation_version,
          source_digest,registration_snapshot,box_totals,exceptions,control_reconciliation,calculated_by)
          values(account_period,1000,'account-link-fixture',repeat('a',64),'{}','{}','[]',
            '{"status":"unreconciled"}',actor) returning id into account_calculation;
        insert into "FIN_IndirectTaxCalculationLines"(calculation_id,period_id,evidence_id,
          decision_id,box_number,signed_amount)
          values(account_calculation,account_period,reversal_evidence,reversal_decision,1,-20),
            (account_calculation,account_period,credit_evidence,credit_decision,1,-1);
        account_result:=public.multideck_uk_vat_account(
          '00000000-0000-0000-0000-000000000018',entity_id,account_calculation);
        select value into linked_row from jsonb_array_elements(account_result->'rows') value
          where value->>'evidence_id'=reversal_evidence::text;
        select value into ordinary_row from jsonb_array_elements(account_result->'rows') value
          where value->>'evidence_id'=credit_evidence::text;
        if jsonb_array_length(account_result->'rows')<>2
          or linked_row->>'reverses_evidence_id' is distinct from original_evidence::text
          or linked_row->>'original_document_id' is distinct from original_doc::text
          or linked_row->>'original_document_number' is distinct from 'ORIG-1'
          or linked_row->>'original_document_type' is distinct from 'sl_invoice'
          or ordinary_row->>'original_document_id' is not null
          or ordinary_row->>'credit_original_evidence_id' is distinct from source_evidence::text
          or ordinary_row->>'credit_original_document_id' is distinct from source_doc::text
          or ordinary_row->>'credit_original_document_number' is distinct from 'SOURCE-1'
          or ordinary_row->>'credit_linked_at' is null then
          raise exception 'VAT account did not distinguish linked reversal from ordinary credit'; end if;
        begin
          perform public.multideck_uk_vat_account(
            '00000000-0000-0000-0000-000000000017',entity_id,account_calculation);
          raise exception 'foreign-company actor read VAT reversal audit links';
        exception when sqlstate '42501' then null; end;
      end $reversal$;
      select 'ok';
    `), "ok")
    sql(`alter table "FIN_CashTransactions"
      add column "FINCash_StatusCode" text not null default 'approved',
      add column "FINCash_ExportStatusCode" text not null default 'queued',
      add column "FINCash_UpdatedAt" timestamptz not null default now(),
      add column "FINCash_Amount" numeric not null default 20,
      add column "FINCash_Number" text not null default 'CASH-TEST',
      add column "FINCash_CurrencyCodeSnapshot" text not null default 'GBP',
      add column "FINCash_NativePostingBatchID" uuid not null default '00000000-0000-0000-0000-000000000098';
      alter table "FIN_CashAllocations"
        add column "FINCashAlloc_ID" uuid not null default gen_random_uuid();
      alter table "FIN_CashAllocations" add primary key ("FINCashAlloc_ID");
      insert into "FIN_CashTransactions"("FINCash_ID","FINCash_LegalEntityID",
        "FINCash_TypeCode","FINCash_NativePostingStatusCode","FINCash_TransactionDate")
        values('00000000-0000-0000-0000-000000000099',
          '00000000-0000-0000-0000-000000000001','customer_receipt','posted','2026-08-01');
      insert into "FIN_CashAllocations" values(
        '00000000-0000-0000-0000-000000000099',
        '00000000-0000-0000-0000-000000000010','allocated',20,'2026-08-01 12:00:00+00');`)
    sql(postedCashSourceLocks)
    assert.equal(sql(`do $cash_lock$
      begin
        begin
          update "FIN_CashTransactions" set "FINCash_TransactionDate"='2026-07-31'
            where "FINCash_ID"='00000000-0000-0000-0000-000000000099';
          raise exception 'posted cash date changed';
        exception when sqlstate '22023' then null; end;
        begin
          update "FIN_CashTransactions" set "FINCash_Amount"=21
            where "FINCash_ID"='00000000-0000-0000-0000-000000000099';
          raise exception 'posted cash amount changed';
        exception when sqlstate '22023' then null; end;
        begin
          update "FIN_CashAllocations" set "FINCashAlloc_AllocatedAmount"=21
            where "FINCashAlloc_CashID"='00000000-0000-0000-0000-000000000099';
          raise exception 'posted cash allocation changed';
        exception when sqlstate '22023' then null; end;
        begin
          insert into "FIN_CashAllocations" values(
            '00000000-0000-0000-0000-000000000099',
            '00000000-0000-0000-0000-000000000011','allocated',1,'2026-08-02 12:00:00+00');
          raise exception 'posted cash acquired a late allocation';
        exception when sqlstate '22023' then null; end;
        begin
          delete from "FIN_CashAllocations"
            where "FINCashAlloc_CashID"='00000000-0000-0000-0000-000000000099';
          raise exception 'posted cash allocation was deleted';
        exception when sqlstate '22023' then null; end;
        update "FIN_CashTransactions" set "FINCash_StatusCode"='submitted',
          "FINCash_ExportStatusCode"='synced',"FINCash_UpdatedAt"=now()
          where "FINCash_ID"='00000000-0000-0000-0000-000000000099';
        if (select "FINCash_StatusCode" from "FIN_CashTransactions"
          where "FINCash_ID"='00000000-0000-0000-0000-000000000099')<>'submitted' then
          raise exception 'provider delivery state was blocked after cash posting'; end if;
      end $cash_lock$; select 'locked';`), "locked")
    sql(cashPaymentDateReviews)
    assert.equal(sql(`do $cash_date$
      declare v_result jsonb; v_cash uuid:='00000000-0000-0000-0000-000000000099';
        v_entity uuid:='00000000-0000-0000-0000-000000000001';
        v_actor uuid:='00000000-0000-0000-0000-000000000003';
      begin
        begin
          perform public.multideck_uk_vat_review_cash_payment_date(
            '00000000-0000-0000-0000-000000000018',v_entity,v_cash,
            'bank_credit_or_debit','2026-08-02',null,'BANK-001',
            'Reviewed the bank credit date and payment source');
          raise exception 'read-only colleague reviewed a VAT payment date';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_cash_payment_date(
            '00000000-0000-0000-0000-000000000017',v_entity,v_cash,
            'bank_credit_or_debit','2026-08-02',null,'BANK-001',
            'Reviewed the bank credit date and payment source');
          raise exception 'foreign colleague reviewed a VAT payment date';
        exception when sqlstate '42501' then null; end;
        v_result:=public.multideck_uk_vat_review_cash_payment_date(v_actor,v_entity,v_cash,
          'bank_credit_or_debit','2026-08-02',null,'BANK-001',
          'Reviewed the bank credit date and payment source');
        if v_result->>'inserted'<>'true' or v_result->>'vatPaymentDate'<>'2026-08-02'
          or public.multideck_uk_vat_review_cash_payment_date(v_actor,v_entity,v_cash,
            'bank_credit_or_debit','2026-08-02',null,'BANK-001',
            'Reviewed the bank credit date and payment source')->>'inserted'<>'false'
          or public.multideck_uk_vat_cash_payment_date_queue(
            '00000000-0000-0000-0000-000000000018',v_entity,0,25)
            #>>'{items,0,vat_payment_date}'<>'2026-08-02'
          or not exists(select 1 from "Audit_Events"
            where "AuditEvent_Action"='review_uk_vat_cash_payment_date'
              and "AuditEvent_RecordID"=(v_result->>'reviewId')::uuid) then
          raise exception 'cash VAT payment date review was not scoped and audited'; end if;
        begin
          update "FIN_IndirectTaxCashPaymentDateReviews" set vat_payment_date='2026-08-03'
            where id=(v_result->>'reviewId')::uuid;
          raise exception 'immutable cash VAT payment date review changed';
        exception when sqlstate '22023' then null; end;
        v_result:=public.multideck_uk_vat_review_cash_payment_date(v_actor,v_entity,v_cash,
          'cheque','2026-08-03','2026-08-05','CHEQUE-002',
          'Cheque date was later than the date it was received');
        if v_result->>'vatPaymentDate'<>'2026-08-05'
          or v_result->>'revision'<>'2'
          or public.multideck_uk_vat_cash_payment_date_queue(v_actor,v_entity,0,25)
            #>>'{items,0,review_history,0,vatPaymentDate}'<>'2026-08-02' then
          raise exception 'cheque review did not derive the later date or retain history'; end if;
        begin
          perform public.multideck_uk_vat_review_cash_payment_date(v_actor,v_entity,v_cash,
            'cheque','2026-08-03',null,'CHEQUE-003',
            'A cheque review without cheque date should fail');
          raise exception 'cheque missing its written date was reviewed';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_cash_payment_date_queue(
            '00000000-0000-0000-0000-000000000017',v_entity,0,25);
          raise exception 'foreign colleague read cash VAT payment reviews';
        exception when sqlstate '42501' then null; end;
      end $cash_date$; select 'reviewed';`), "reviewed")
    sql(`alter table "FIN_Documents" add column if not exists "FINDoc_LocalGrossAmount" numeric not null default 100;
      alter table "FIN_DocumentLines"
        add column if not exists "FINDocLine_LineNo" integer not null default 1,
        add column if not exists "FINDocLine_LocalGrossAmount" numeric not null default 100;
      alter table "FIN_CashAllocations" add column if not exists "FINCashAlloc_DocumentLineID" uuid;`)
    sql(cashSourceSnapshot)
    sql(cashEventProjections)
    sql(cashProjectionIntegrity)
    assert.equal(sql(`do $cash_snapshot$
      declare v_result jsonb;
      begin
        v_result:=public.multideck_uk_vat_cash_source_snapshot(
          '00000000-0000-0000-0000-000000000018',
          '00000000-0000-0000-0000-000000000001','2026-07-01','2026-09-30');
        if v_result->>'status'<>'source_only_not_filing'
          or v_result->>'unreviewedPostedCash'<>'0'
          or v_result->>'allocationCount'<>'1'
          or v_result#>>'{periodCash,0,vat_payment_date}'<>'2026-08-05'
          or v_result#>>'{allocations,0,document_type}'<>'credit_note'
          or jsonb_array_length(v_result#>'{allocations,0,lines}')<>1 then
          raise exception 'cash source snapshot missed reviewed payment or invoice evidence'; end if;
        begin
          perform public.multideck_uk_vat_cash_source_snapshot(
            '00000000-0000-0000-0000-000000000017',
            '00000000-0000-0000-0000-000000000001','2026-07-01','2026-09-30');
          raise exception 'foreign colleague read cash VAT sources';
        exception when sqlstate '42501' then null; end;
      end $cash_snapshot$; select 'snapshotted';`), "snapshotted")
    assert.equal(sql(`do $prior_filing_gate$
      declare v_entity uuid:='00000000-0000-0000-0000-000000000001';
        v_actor uuid:='00000000-0000-0000-0000-000000000003';
        v_template public."FIN_IndirectTaxFilingApprovals"%rowtype;
        v_attempt_template public."FIN_HmrcVatSubmissionAttempts"%rowtype;
        v_approval uuid; v_second_approval uuid; v_attempt uuid; v_error uuid;
      begin
        begin
          select * into v_template from "FIN_IndirectTaxFilingApprovals"
            where period_id in (select id from "FIN_IndirectTaxPeriods"
              where legal_entity_id=v_entity and start_date='2026-07-01'
                and end_date='2026-09-30') limit 1;
          select * into v_attempt_template from "FIN_HmrcVatSubmissionAttempts"
            where period_id=v_template.period_id and status='cancelled' limit 1;
          if v_template.id is null or v_attempt_template.id is null then
            raise exception 'filing approval fixture is missing'; end if;
          perform public._multideck_uk_vat_require_resolved_prior_errors(v_template.period_id);
          begin
            insert into "FIN_IndirectTaxPriorPeriodErrorIntake"(
              legal_entity_id,discovery_period_id,original_period_start,
              original_period_end,discovered_on,source_reference,tax_side,
              signed_vat_error_gbp,conduct,explanation,recorded_by)
            values(v_entity,v_template.period_id,'2026-01-01','2026-03-31',
              '2026-07-20','GATE-UNRESOLVED-1','output',20,'reasonable_care',
              'This earlier return omitted output VAT',v_actor);
            begin
              perform public._multideck_uk_vat_require_resolved_prior_errors(v_template.period_id);
              raise exception 'unresolved prior error passed the filing preflight';
            exception when sqlstate '22023' then null; end;
            begin
              insert into "FIN_IndirectTaxFilingApprovals"(
                period_id,review_lock_id,obligation_verification_id,
                tenant_project_ref,environment,registration_id,vrn,period_key,
                lock_fingerprint,filed_boxes,declaration_code,
                approval_fingerprint,confirmed_by)
              values(v_template.period_id,v_template.review_lock_id,
                v_template.obligation_verification_id,v_template.tenant_project_ref,
                v_template.environment,v_template.registration_id,v_template.vrn,
                v_template.period_key,v_template.lock_fingerprint,
                v_template.filed_boxes,v_template.declaration_code,
                v_template.approval_fingerprint,v_actor);
              raise exception 'unresolved prior error reached VAT filing approval';
            exception when sqlstate '22023' then null; end;
            raise exception 'prior_approval_denial_rollback' using errcode='ZX004';
          exception when sqlstate 'ZX004' then null; end;
          insert into "FIN_IndirectTaxFilingApprovals"(
            period_id,review_lock_id,obligation_verification_id,
            tenant_project_ref,environment,registration_id,vrn,period_key,
            lock_fingerprint,filed_boxes,declaration_code,
            approval_fingerprint,confirmed_by)
          values(v_template.period_id,v_template.review_lock_id,
            v_template.obligation_verification_id,v_template.tenant_project_ref,
            v_template.environment,v_template.registration_id,v_template.vrn,
            v_template.period_key,v_template.lock_fingerprint,
            v_template.filed_boxes,v_template.declaration_code,
            v_template.approval_fingerprint,v_actor) returning id into v_approval;
          insert into "FIN_HmrcVatSubmissionAttempts"(
            period_id,approval_id,tenant_project_ref,environment,registration_id,
            vrn,period_key,payload_body,payload_sha256,status,reserved_by)
          values(v_template.period_id,v_approval,v_attempt_template.tenant_project_ref,
            v_attempt_template.environment,v_attempt_template.registration_id,
            v_attempt_template.vrn,v_attempt_template.period_key,
            v_attempt_template.payload_body,v_attempt_template.payload_sha256,
            'reserved',v_actor) returning id into v_attempt;
          insert into "FIN_IndirectTaxFilingApprovals"(
            period_id,review_lock_id,obligation_verification_id,
            tenant_project_ref,environment,registration_id,vrn,period_key,
            lock_fingerprint,filed_boxes,declaration_code,
            approval_fingerprint,confirmed_by)
          values(v_template.period_id,v_template.review_lock_id,
            v_template.obligation_verification_id,v_template.tenant_project_ref,
            v_template.environment,v_template.registration_id,v_template.vrn,
            v_template.period_key,v_template.lock_fingerprint,
            v_template.filed_boxes,v_template.declaration_code,
            v_template.approval_fingerprint,v_actor) returning id into v_second_approval;
          insert into "FIN_IndirectTaxPriorPeriodErrorIntake"(
            legal_entity_id,discovery_period_id,original_period_start,
            original_period_end,discovered_on,source_reference,tax_side,
            signed_vat_error_gbp,conduct,explanation,recorded_by)
          values(v_entity,v_template.period_id,'2026-01-01','2026-03-31',
            '2026-07-21','GATE-UNRESOLVED-2','input',-20,'reasonable_care',
            'This earlier return overstated recoverable input VAT',v_actor)
          returning id into v_error;
          begin
            insert into "FIN_HmrcVatSubmissionAttempts"(
              period_id,approval_id,tenant_project_ref,environment,registration_id,
              vrn,period_key,payload_body,payload_sha256,status,reserved_by)
            values(v_template.period_id,v_second_approval,
              v_attempt_template.tenant_project_ref,v_attempt_template.environment,
              v_attempt_template.registration_id,v_attempt_template.vrn,
              v_attempt_template.period_key,v_attempt_template.payload_body,
              v_attempt_template.payload_sha256,'reserved',v_actor);
            raise exception 'new unresolved error reached submission reservation';
          exception when sqlstate '22023' then null; end;
          begin
            update "FIN_HmrcVatSubmissionAttempts" set status='dispatching',
              dispatching_at=clock_timestamp() where id=v_attempt;
            raise exception 'new unresolved error reached HMRC dispatch';
          exception when sqlstate '22023' then null; end;
          perform public.multideck_uk_vat_record_external_error_notification(
            v_actor,v_entity,v_template.period_id,array[v_error],
            '2026-07-22','hmrc_online','GATE-HMRC-NOTICE',
            'The separate error correction was submitted to HMRC',true);
          update "FIN_HmrcVatSubmissionAttempts" set status='dispatching',
            dispatching_at=clock_timestamp() where id=v_attempt;
          if (select status from "FIN_HmrcVatSubmissionAttempts" where id=v_attempt)
            <>'dispatching' then
            raise exception 'separately notified error did not clear dispatch gate'; end if;
          raise exception 'prior_filing_gate_probe_rollback';
        exception when sqlstate 'P0001' then
          if sqlerrm<>'prior_filing_gate_probe_rollback' then raise; end if;
        end;
      end $prior_filing_gate$; select 'prior filing gated';`), "prior filing gated")
    assert.equal(sql(`do $cash_projection$
      declare v_entity uuid:='00000000-0000-0000-0000-000000000001';
        v_actor uuid:='00000000-0000-0000-0000-000000000003';
        v_doc uuid:='00000000-0000-0000-0000-0000000000d1';
        v_line uuid:='00000000-0000-0000-0000-0000000000d2';
        v_batch uuid:='00000000-0000-0000-0000-0000000000d3';
        v_cash uuid:='00000000-0000-0000-0000-0000000000d4';
        v_evidence uuid; v_decision uuid; v_source jsonb; v_preview jsonb;
        v_allocation jsonb; v_source_line jsonb; v_result jsonb; v_history jsonb;
      begin
        begin
          insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_LegalEntityID",
            "FINPostBatch_StatusCode") values(v_batch,v_entity,'posted');
          insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID",
            "FINDoc_NativePostingStatusCode","FINDoc_NativePostingBatchID",
            "FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate","FINDoc_DocumentDate",
            "FINDoc_DueDate","FINDoc_TypeCode","FINDoc_GrossAmount",
            "FINDoc_LocalGrossAmount","FINDoc_Number","FINDoc_NativePostedBy")
          values(v_doc,v_entity,'draft',v_batch,'GBP',1,'2026-08-08',
            '2026-09-08','sl_invoice',120,120,'CASH-EVENT-1',v_actor);
          insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID",
            "FINDocLine_LineNo","FINDocLine_NetAmount","FINDocLine_TaxAmount",
            "FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount",
            "FINDocLine_LocalGrossAmount")
          values(v_line,v_doc,1,100,20,100,20,120);
          update "FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
            where "FINDoc_ID"=v_doc;
          select id into v_evidence from "FIN_IndirectTaxEvidence"
            where source_document_line_id=v_line and source_posting_batch_id=v_batch;
          if v_evidence is null then
            insert into "FIN_IndirectTaxEvidence"(legal_entity_id,jurisdiction_code,
              source_kind,source_id,source_posting_batch_id,source_document_id,
              source_document_line_id,source_version,currency_code,exchange_rate,
              signed_net_amount,signed_tax_amount,signed_net_reporting,
              signed_tax_reporting,recorded_by)
            values(v_entity,'GB','posted_document_line',v_line,v_batch,v_doc,
              v_line,v_batch::text,'GBP',1,100,20,100,20,v_actor)
            returning id into v_evidence;
          end if;
          insert into "FIN_IndirectTaxDecisions"(evidence_id,revision,tax_point,
            scheme_code,treatment_code,reviewed_rule_reference,review_reason,reviewed_by)
          values(v_evidence,1,'2026-08-08','standard','domestic_sale','UK20',
            'Reviewed posted invoice tax for the partial receipt',v_actor)
          returning id into v_decision;
          insert into "FIN_CashTransactions"("FINCash_ID","FINCash_LegalEntityID",
            "FINCash_TypeCode","FINCash_NativePostingStatusCode",
            "FINCash_TransactionDate","FINCash_Amount")
          values(v_cash,v_entity,'draft','draft','2026-08-09',60);
          update "FIN_CashTransactions" set "FINCash_TypeCode"='customer_receipt'
            where "FINCash_ID"=v_cash;
          insert into "FIN_CashAllocations"("FINCashAlloc_CashID",
            "FINCashAlloc_DocumentID","FINCashAlloc_AllocationStatusCode",
            "FINCashAlloc_AllocatedAmount") values(v_cash,v_doc,'allocated',60);
          update "FIN_CashTransactions" set "FINCash_NativePostingStatusCode"='posted'
            where "FINCash_ID"=v_cash;
          perform public.multideck_uk_vat_review_cash_payment_date(v_actor,v_entity,v_cash,
            'bank_credit_or_debit','2026-08-09',null,'BANK-CASH-EVENT',
            'Reviewed the bank receipt for partial Cash Accounting allocation');
          v_source:=public.multideck_uk_vat_cash_source_snapshot(
            v_actor,v_entity,'2026-08-09','2026-08-09');
          v_allocation:=v_source#>'{allocations,0}';
          v_source_line:=v_allocation#>'{lines,0}';
          if v_source->>'unreviewedPostedCash'<>'0'
            or jsonb_array_length(v_source->'periodCash')<>1
            or v_source_line->>'evidenceId' is distinct from v_evidence::text
            or v_source_line->>'reviewId' is distinct from v_decision::text then
            raise exception 'cash event fixture did not extract a complete reviewed source';
          end if;
          v_preview:=jsonb_build_object('legalEntityId',v_entity,'startDate','2026-08-09',
            'endDate','2026-08-09','sourceStatus','source_only_not_filing',
            'calculationValid',true,'issueCount',0,'candidateAllocationCount',1,
            'excludedAllocationCount',0,'excludedAllocations','[]'::jsonb,
            'sourceBoxesGbp',jsonb_build_object('1','10.0000','4','0.0000',
              '6','50.0000','7','0.0000'),
            'allocationLines',jsonb_build_array(jsonb_build_object(
              'allocationId',v_allocation->>'allocation_id',
              'cashId',v_allocation->>'cash_id',
              'paymentReviewId',v_allocation->>'payment_review_id',
              'invoiceId',v_allocation->>'document_id',
              'paymentDate',v_allocation->>'vat_payment_date',
              'lineId',v_source_line->>'lineId',
              'evidenceId',v_source_line->>'evidenceId',
              'treatmentReviewId',v_source_line->>'reviewId',
              'treatment','domestic_sale','netGbp','50.0000','vatGbp','10.0000')));
          begin
            perform public.multideck_uk_vat_record_cash_event_projection(
              '00000000-0000-0000-0000-000000000018',v_entity,
              '2026-08-09','2026-08-09',v_source,v_preview);
            raise exception 'read-only colleague recorded a cash VAT projection';
          exception when sqlstate '42501' then null; end;
          begin
            perform public.multideck_uk_vat_record_cash_event_projection(
              '00000000-0000-0000-0000-000000000017',v_entity,
              '2026-08-09','2026-08-09',v_source,v_preview);
            raise exception 'foreign colleague recorded a cash VAT projection';
          exception when sqlstate '42501' then null; end;
          begin
            perform public.multideck_uk_vat_record_cash_event_projection(
              v_actor,v_entity,'2026-08-09','2026-08-09',v_source,
              jsonb_set(v_preview,'{allocationLines,0,vatGbp}','"11.0000"'));
            raise exception 'altered cash VAT part-payment amount was recorded';
          exception when sqlstate '22023' then null; end;
          v_result:=public.multideck_uk_vat_record_cash_event_projection(
            v_actor,v_entity,'2026-08-09','2026-08-09',v_source,v_preview);
          if v_result->>'inserted'<>'true'
            or v_result->>'eventLineCount'<>'1'
            or public.multideck_uk_vat_record_cash_event_projection(
              v_actor,v_entity,'2026-08-09','2026-08-09',v_source,v_preview)
              ->>'inserted'<>'false' then
            raise exception 'cash VAT event projection was not immutable and idempotent';
          end if;
          v_result:=public.multideck_uk_vat_cash_projection_integrity(
            '00000000-0000-0000-0000-000000000018',v_entity,
            (v_result->>'projectionId')::uuid);
          if v_result->>'status'<>'current_verified_source_only'
            or v_result->>'eventLineCount'<>'1'
            or v_result#>>'{sourceBoxesGbp,1}'<>'10.0000'
            or length(v_result->>'fingerprint')<>64 then
            raise exception 'cash VAT event integrity did not match the current source';
          end if;
          begin
            perform set_config('session_replication_role','replica',true);
            update "FIN_IndirectTaxCashEventLines" set vat_gbp=11
              where projection_id=(v_result->>'projectionId')::uuid;
            perform set_config('session_replication_role','origin',true);
            if (select vat_gbp from "FIN_IndirectTaxCashEventLines"
              where projection_id=(v_result->>'projectionId')::uuid limit 1)<>11 then
              raise exception 'cash event tamper probe did not change the stored line';
            end if;
            perform public.multideck_uk_vat_cash_projection_integrity(v_actor,v_entity,
              (v_result->>'projectionId')::uuid);
            raise exception 'altered Cash Accounting event passed integrity' using errcode='ZX001';
          exception when sqlstate '22023' then null; end;
          begin
            perform public.multideck_uk_vat_cash_projection_integrity(
              '00000000-0000-0000-0000-000000000017',v_entity,
              (v_result->>'projectionId')::uuid);
            raise exception 'foreign colleague verified private cash VAT events';
          exception when sqlstate '42501' then null; end;
          v_history:=public.multideck_uk_vat_cash_event_projection_history(
            '00000000-0000-0000-0000-000000000018',v_entity,
            '2026-08-09','2026-08-09');
          if v_history#>>'{items,0,source_current}'<>'true'
            or v_history#>>'{items,0,event_lines,0,net_gbp}'<>'50.0000' then
            raise exception 'standard colleague could not read source-bound cash event line'; end if;
          begin
            perform public.multideck_uk_vat_cash_event_projection_history(
              '00000000-0000-0000-0000-000000000017',v_entity,
              '2026-08-09','2026-08-09');
            raise exception 'foreign colleague read a cash VAT projection';
          exception when sqlstate '42501' then null; end;
          perform public.multideck_uk_vat_review_cash_payment_date(v_actor,v_entity,v_cash,
            'bank_credit_or_debit','2026-08-09',null,'BANK-CASH-EVENT-REVISED',
            'Revised the bank evidence reference after the projection');
          v_history:=public.multideck_uk_vat_cash_event_projection_history(
            v_actor,v_entity,'2026-08-09','2026-08-09');
          if v_history#>>'{items,0,source_current}'<>'false' then
            raise exception 'cash VAT projection did not become stale after review revision'; end if;
          begin
            perform public.multideck_uk_vat_cash_projection_integrity(v_actor,v_entity,
              (v_result->>'projectionId')::uuid);
            raise exception 'stale cash VAT projection passed integrity';
          exception when sqlstate '22023' then null; end;
          begin
            perform public.multideck_uk_vat_record_cash_event_projection(
              v_actor,v_entity,'2026-08-09','2026-08-09',v_source,v_preview);
            raise exception 'stale cash VAT evidence was recorded again';
          exception when sqlstate '22023' then null; end;
          raise exception 'cash_projection_probe_rollback';
        exception when sqlstate 'P0001' then
          if sqlerrm<>'cash_projection_probe_rollback' then raise; end if;
        end;
      end $cash_projection$; select 'cash projection checked';`), "cash projection checked")
    assert.equal(sql(`do $cash_foreign_document$
      declare v_result jsonb; v_cash uuid:='00000000-0000-0000-0000-0000000000b1';
        v_foreign uuid:='00000000-0000-0000-0000-0000000000b2';
        v_row jsonb;
      begin
        insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID",
          "FINDoc_NativePostingStatusCode","FINDoc_CurrencyCodeSnapshot",
          "FINDoc_ExchangeRate","FINDoc_DocumentDate","FINDoc_TypeCode",
          "FINDoc_GrossAmount","FINDoc_LocalGrossAmount","FINDoc_Number")
          values(v_foreign,'00000000-0000-0000-0000-000000000002',
            'draft','GBP',1,'2026-08-01','sl_invoice',20,20,'FOREIGN-SECRET');
        insert into "FIN_CashTransactions"("FINCash_ID","FINCash_LegalEntityID",
          "FINCash_TypeCode","FINCash_NativePostingStatusCode","FINCash_TransactionDate")
          values(v_cash,'00000000-0000-0000-0000-000000000001',
            'customer_receipt','draft','2026-08-06');
        insert into "FIN_CashAllocations"("FINCashAlloc_CashID","FINCashAlloc_DocumentID",
          "FINCashAlloc_AllocationStatusCode","FINCashAlloc_AllocatedAmount")
          values(v_cash,v_foreign,'allocated',20);
        update "FIN_CashTransactions" set "FINCash_NativePostingStatusCode"='posted'
          where "FINCash_ID"=v_cash;
        perform public.multideck_uk_vat_review_cash_payment_date(
          '00000000-0000-0000-0000-000000000003',
          '00000000-0000-0000-0000-000000000001',v_cash,
          'bank_credit_or_debit','2026-08-06',null,'BANK-FOREIGN',
          'The bank date was reviewed before discovering foreign document scope');
        v_result:=public.multideck_uk_vat_cash_source_snapshot(
          '00000000-0000-0000-0000-000000000018',
          '00000000-0000-0000-0000-000000000001','2026-07-01','2026-09-30');
        select value into v_row from jsonb_array_elements(v_result->'allocations') value
          where value->>'cash_id'=v_cash::text;
        if v_row is null or v_row->>'document_id' is not null
          or v_row->'lines'<>'[]'::jsonb
          or position('FOREIGN-SECRET' in v_result::text)>0
          or position(v_foreign::text in v_result::text)>0 then
          raise exception 'foreign document data escaped through cash preview'; end if;
      end $cash_foreign_document$; select 'contained';`), "contained")
    assert.equal(sql(`do $cash_transition$
      declare v_cash uuid:='00000000-0000-0000-0000-0000000000c1';
        v_doc uuid:='00000000-0000-0000-0000-000000000008';
        v_evidence uuid; v_result jsonb; v_line jsonb;
        v_template public."FIN_IndirectTaxFilingApprovals"%rowtype;
        v_approval uuid:=gen_random_uuid(); v_attempt uuid:=gen_random_uuid();
        v_payload text; v_period uuid;
      begin
        begin
          select id into v_evidence from "FIN_IndirectTaxEvidence"
            where source_document_id=v_doc and source_kind='posted_document_line' limit 1;
          if v_evidence is null then raise exception 'reviewed Standard invoice fixture is missing'; end if;
          insert into "FIN_CashTransactions"("FINCash_ID","FINCash_LegalEntityID",
            "FINCash_TypeCode","FINCash_NativePostingStatusCode",
            "FINCash_TransactionDate","FINCash_Amount")
            values(v_cash,'00000000-0000-0000-0000-000000000001',
              'customer_receipt','draft','2026-08-07',100);
          insert into "FIN_CashAllocations"("FINCashAlloc_CashID","FINCashAlloc_DocumentID",
            "FINCashAlloc_AllocationStatusCode","FINCashAlloc_AllocatedAmount")
            values(v_cash,v_doc,'allocated',100);
          update "FIN_CashTransactions" set "FINCash_NativePostingStatusCode"='posted'
            where "FINCash_ID"=v_cash;
          perform public.multideck_uk_vat_review_cash_payment_date(
            '00000000-0000-0000-0000-000000000003',
            '00000000-0000-0000-0000-000000000001',v_cash,
            'bank_credit_or_debit','2026-08-07',null,'BANK-TRANSITION',
            'Reviewed the payment received after invoice-basis VAT sign-off');
          v_result:=public.multideck_uk_vat_cash_source_snapshot(
            '00000000-0000-0000-0000-000000000018',
            '00000000-0000-0000-0000-000000000001','2026-07-01','2026-09-30');
          select line into v_line from jsonb_array_elements(v_result->'allocations') allocation,
            lateral jsonb_array_elements(allocation->'lines') line
            where allocation->>'cash_id'=v_cash::text and line->>'evidenceId'=v_evidence::text;
          if v_line->>'standardVatReconciledAt' is null
            or v_line->>'standardProductionAcceptedAt' is not null then
            raise exception 'unaccepted Standard sign-off was treated as production VAT accounting'; end if;
          -- Rollback-only accepted production fixture checks the exact filed
          -- calculation/lock join. Authorised filing lifecycle is tested above.
          select period_id into v_period from "FIN_IndirectTaxReconciliations"
            where evidence_id=v_evidence limit 1;
          select approval.* into v_template from "FIN_IndirectTaxFilingApprovals" approval
            join "FIN_IndirectTaxPeriodReviewLocks" filed_lock
              on filed_lock.id=approval.review_lock_id
            join "FIN_IndirectTaxCalculationLines" filed_line
              on filed_line.calculation_id=filed_lock.calculation_id
              and filed_line.evidence_id=v_evidence
            where approval.period_id=v_period limit 1;
          select payload_body into v_payload from "FIN_HmrcVatSubmissionAttempts"
            where period_id=v_period and status='cancelled' limit 1;
          if v_template.id is null or v_payload is null then
            raise exception 'filed source template is missing'; end if;
          insert into "FIN_IndirectTaxFilingApprovals"(
            id,period_id,review_lock_id,obligation_verification_id,
            tenant_project_ref,environment,registration_id,vrn,period_key,
            lock_fingerprint,filed_boxes,declaration_code,approval_fingerprint,
            confirmed_by)
          values(v_approval,v_template.period_id,v_template.review_lock_id,
            v_template.obligation_verification_id,v_template.tenant_project_ref,
            'production',v_template.registration_id,v_template.vrn,
            v_template.period_key,v_template.lock_fingerprint,v_template.filed_boxes,
            v_template.declaration_code,v_template.approval_fingerprint,
            v_template.confirmed_by);
          insert into "FIN_HmrcVatSubmissionAttempts"(
            id,period_id,approval_id,tenant_project_ref,environment,
            registration_id,vrn,period_key,payload_body,payload_sha256,
            status,reserved_by,dispatching_at,accepted_at)
          values(v_attempt,v_period,v_approval,v_template.tenant_project_ref,
            'production',v_template.registration_id,v_template.vrn,
            v_template.period_key,v_payload,
            encode(sha256(convert_to(v_payload,'UTF8')),'hex'),
            'accepted',v_template.confirmed_by,clock_timestamp(),clock_timestamp());
          v_result:=public.multideck_uk_vat_cash_source_snapshot(
            '00000000-0000-0000-0000-000000000018',
            '00000000-0000-0000-0000-000000000001','2026-07-01','2026-09-30');
          select line into v_line from jsonb_array_elements(v_result->'allocations') allocation,
            lateral jsonb_array_elements(allocation->'lines') line
            where allocation->>'cash_id'=v_cash::text and line->>'evidenceId'=v_evidence::text;
          if v_line->>'standardProductionAcceptedAt' is null then
            raise exception 'accepted production calculation did not exclude its signed invoice'; end if;
          raise exception 'cash_transition_probe_rollback';
        exception when sqlstate 'P0001' then
          if sqlerrm<>'cash_transition_probe_rollback' then raise; end if;
        end;
      end $cash_transition$; select 'transition checked';`), "transition checked")
    assert.equal(sql(`
      do $method1_plan$
      declare v_entity uuid:=gen_random_uuid(); v_actor uuid:='00000000-0000-0000-0000-000000000003';
        v_foreign uuid:='00000000-0000-0000-0000-000000000017';
        v_period uuid; v_intake uuid; v_offset uuid:=gen_random_uuid();
        v_tax_nominal uuid:=gen_random_uuid(); v_plan_id uuid;
        v_calculation jsonb; v_plan jsonb; v_items jsonb;
        v_posted jsonb; v_inventory jsonb; v_projection jsonb; v_lock jsonb;
      begin
        insert into "cmp_LegalEntities"("LegalEntity_ID","LegalEntity_IsActive","LegalEntity_CountryCode")
          values(v_entity,true,'GB');
        perform public.multideck_uk_vat_configure_registration(
          v_actor,v_entity,'123456789','standard','2020-01-01',true);
        insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID",
          "FINNom_Code","FINNom_Name","FINNom_ControlTypeCode","FINNom_IsActive","FINNom_IsControlAccount","FINNom_AllowManualPosting")
          values(v_offset,v_entity,'4000','Prior VAT correction clearing',null,true,false,true),
            (v_tax_nominal,v_entity,'2100','Output VAT control','vat',true,true,false);
        v_period:=(public.multideck_uk_vat_create_draft_period(
          v_actor,v_entity,'2026-04-01','2026-06-30')->>'periodId')::uuid;
        insert into "FIN_Periods"("FINPeriod_ID","FINPeriod_LegalEntityID",
          "FINPeriod_StartDate","FINPeriod_EndDate") values
          (gen_random_uuid(),v_entity,'2026-04-01','2026-04-30'),
          (gen_random_uuid(),v_entity,'2026-05-01','2026-05-31'),
          (gen_random_uuid(),v_entity,'2026-06-01','2026-06-30');
        v_intake:=(public.multideck_uk_vat_record_prior_period_error(
          v_actor,v_entity,v_period,'2025-10-01','2025-12-31','2026-04-15',
          'OUTPUT-OMISSION-1','output',100,'undetermined',
          'The previous submitted return omitted this output VAT')->>'intakeId')::uuid;
        perform public.multideck_uk_vat_review_prior_error_conduct(v_actor,v_entity,v_intake,
          'reasonable_care','Original filing records and circumstances reviewed');
        perform public.multideck_uk_vat_review_prior_error_time_limit(v_actor,v_entity,v_intake,
          'output_underdeclared','VAT-RETURN-2025-12',null,'SALES-EVIDENCE-1',
          'The original submitted return and source records were checked');
        v_calculation:=public.multideck_uk_vat_calculate_draft(v_actor,v_period);
        v_items:=jsonb_build_array(jsonb_build_object('intakeId',v_intake,
          'boxNetDeltaGbp',500,'offsetNominalId',v_offset,
          'evidenceReference','SALES-EVIDENCE-1'));
        if jsonb_array_length(public.multideck_uk_vat_method1_offset_nominals(
          '00000000-0000-0000-0000-000000000018',v_entity)->'nominals')<>1 then
          raise exception 'offset account list omitted the valid non-control nominal'; end if;
        begin
          perform public.multideck_uk_vat_method1_offset_nominals(v_foreign,v_entity);
          raise exception 'foreign manager read Method 1 offset accounts';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_method1_plan(
            '00000000-0000-0000-0000-000000000018',v_entity,v_period,
            (v_calculation->>'calculationId')::uuid,v_calculation->>'sourceDigest',
            v_items,'Complete prior-return correction review',true);
          raise exception 'read-only colleague reviewed a Method 1 plan';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_method1_plan(v_foreign,v_entity,v_period,
            (v_calculation->>'calculationId')::uuid,v_calculation->>'sourceDigest',
            v_items,'Complete prior-return correction review',true);
          raise exception 'foreign manager reviewed a Method 1 plan';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_method1_plan(v_actor,v_entity,v_period,
            (v_calculation->>'calculationId')::uuid,v_calculation->>'sourceDigest',
            v_items,'Complete prior-return correction review',false);
          raise exception 'unconfirmed Method 1 plan was recorded';
        exception when sqlstate '22023' then null; end;
        v_plan:=public.multideck_uk_vat_review_method1_plan(v_actor,v_entity,v_period,
          (v_calculation->>'calculationId')::uuid,v_calculation->>'sourceDigest',
          v_items,'Complete prior-return correction review',true);
        if v_plan->>'status'<>'reviewed_for_posting_only'
          or v_plan->>'netErrorGbp'<>'100.00'
          or v_plan->>'plannedFiledBox6Gbp'<>'500'
          or v_plan->>'thresholdBasis'<>'up_to_10000'
          or v_plan->>'inserted'<>'true'
          or public.multideck_uk_vat_review_method1_plan(v_actor,v_entity,v_period,
            (v_calculation->>'calculationId')::uuid,v_calculation->>'sourceDigest',
            v_items,'Complete prior-return correction review',true)->>'inserted'<>'false'
          or jsonb_array_length(public.multideck_uk_vat_method1_plans(
            v_actor,v_entity,v_period)->'plans')<>1
          or not exists(select 1 from "Audit_Events"
            where "AuditEvent_Action"='review_prior_period_vat_method1_plan'
              and "AuditEvent_RecordID"=(v_plan->>'planId')::uuid) then
          raise exception 'Method 1 plan was not complete, source-bound and audited'; end if;
        v_plan_id:=(v_plan->>'planId')::uuid;
        begin
          update "FIN_IndirectTaxPriorErrorMethod1Plans" set net_error_gbp=1
            where id=(v_plan->>'planId')::uuid;
          raise exception 'reviewed Method 1 plan was changed';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_method1_plans(v_foreign,v_entity,v_period);
          raise exception 'foreign manager read a Method 1 plan';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_review_method1_plan(v_actor,v_entity,v_period,
            (v_calculation->>'calculationId')::uuid,v_calculation->>'sourceDigest',
            v_items||v_items,'Duplicate intake selected',true);
          raise exception 'duplicate Method 1 item passed';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_uk_vat_record_prior_period_error(v_actor,v_entity,v_period,
            '2025-10-01','2025-12-31','2026-04-16','OUTPUT-OMISSION-2',
            'output',20,'undetermined','A second output VAT error was found in the earlier return');
          perform public.multideck_uk_vat_review_method1_plan(v_actor,v_entity,v_period,
            (v_calculation->>'calculationId')::uuid,v_calculation->>'sourceDigest',
            v_items,'Plan omitted the second discovered error',true);
          raise exception 'incomplete Method 1 plan passed';
        exception when sqlstate '22023' then null; end;
        begin
          declare v_second uuid; v_large_items jsonb;
          begin
            v_second:=(public.multideck_uk_vat_record_prior_period_error(v_actor,v_entity,v_period,
              '2025-10-01','2025-12-31','2026-04-16','OUTPUT-OMISSION-3',
              'output',12000,'undetermined','A larger output VAT error was found in the earlier return')->>'intakeId')::uuid;
            perform public.multideck_uk_vat_review_prior_error_conduct(v_actor,v_entity,v_second,
              'reasonable_care','Original source records and circumstances reviewed');
            perform public.multideck_uk_vat_review_prior_error_time_limit(v_actor,v_entity,v_second,
              'output_underdeclared','VAT-RETURN-2025-12',null,'SALES-EVIDENCE-3',
              'The original submitted return and source records were checked');
            v_large_items:=v_items||jsonb_build_array(jsonb_build_object(
              'intakeId',v_second,'boxNetDeltaGbp',1210000,
              'offsetNominalId',v_offset,'evidenceReference','SALES-EVIDENCE-3'));
            begin
              perform public.multideck_uk_vat_review_method1_plan(v_actor,v_entity,v_period,
                (v_calculation->>'calculationId')::uuid,v_calculation->>'sourceDigest',
                v_items||jsonb_build_array(jsonb_build_object('intakeId',v_second,
                  'boxNetDeltaGbp',1200000,'offsetNominalId',v_offset,
                  'evidenceReference','SALES-EVIDENCE-3')),
                'The final Box 6 is below the one-percent test',true);
              raise exception 'the one-percent Method 1 ceiling was bypassed';
            exception when sqlstate '22023' then null; end;
            v_plan:=public.multideck_uk_vat_review_method1_plan(v_actor,v_entity,v_period,
              (v_calculation->>'calculationId')::uuid,v_calculation->>'sourceDigest',
              v_large_items,'The final Box 6 supports the one-percent test',true);
            if v_plan->>'thresholdBasis'<>'up_to_50000_one_percent'
              or v_plan->>'netErrorGbp'<>'12100.00'
              or v_plan->>'plannedFiledBox6Gbp'<>'1210500' then
              raise exception 'conditional Method 1 limit used the wrong final Box 6'; end if;
            raise exception 'conditional threshold probe complete' using errcode='ZX001';
          end;
        exception when sqlstate 'ZX001' then null; end;
        if exists(select 1 from "FIN_PostingBatches" where "FINPostBatch_LegalEntityID"=v_entity)
          or exists(select 1 from "FIN_IndirectTaxEvidence" where legal_entity_id=v_entity) then
          raise exception 'a reviewed plan incorrectly posted or created VAT evidence'; end if;
        begin
          perform public.multideck_uk_vat_post_method1_plan(
            '00000000-0000-0000-0000-000000000018',v_entity,v_plan_id,
            'Native correction checked against the original return',true);
          raise exception 'read-only colleague posted Method 1';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_post_method1_plan(v_foreign,v_entity,v_plan_id,
            'Native correction checked against the original return',true);
          raise exception 'foreign manager posted Method 1';
        exception when sqlstate '42501' then null; end;
        v_posted:=public.multideck_uk_vat_post_method1_plan(v_actor,v_entity,v_plan_id,
          'Native correction checked against the original return',true);
        if v_posted->>'status'<>'posted_pending_vat_calculation_and_signoff'
          or (select "FINPostBatch_StatusCode" from "FIN_PostingBatches"
            where "FINPostBatch_ID"=(v_posted->>'batchId')::uuid)<>'posted'
          or (select "FINPostBatch_DebitTotal" from "FIN_PostingBatches"
            where "FINPostBatch_ID"=(v_posted->>'batchId')::uuid)<>100
          or (select count(*) from "FIN_PostingLines"
            where "FINPostLine_BatchID"=(v_posted->>'batchId')::uuid)<>2
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='post_prior_period_vat_method1'
            and "AuditEvent_RecordID"=(v_posted->>'postingId')::uuid) then
          raise exception 'Method 1 native posting was missing or unbalanced'; end if;
        if (public.multideck_uk_vat_method1_postings(v_actor,v_entity,v_period)#>>
              '{postings,0,batchId}')::uuid<>(v_posted->>'batchId')::uuid
          or (public.multideck_uk_vat_method1_postings(
              '00000000-0000-0000-0000-000000000018',v_entity,v_period)#>>
              '{postings,0,items,0,evidenceId}')::uuid<>
              (v_posted#>>'{postingItems,0,evidenceId}')::uuid then
          raise exception 'a permitted colleague cannot inspect Method 1 posting evidence'; end if;
        begin
          perform public.multideck_uk_vat_method1_postings(v_foreign,v_entity,v_period);
          raise exception 'foreign colleague read Method 1 posting evidence';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_uk_vat_post_method1_plan(v_actor,v_entity,v_plan_id,
            'Duplicate native correction must be rejected',true);
          raise exception 'duplicate Method 1 posting was allowed';
        exception when sqlstate '23505' then null; end;
        begin
          perform public._multideck_uk_vat_require_resolved_prior_errors(v_period);
          raise exception 'unlocked Method 1 posting cleared the filing gate';
        exception when sqlstate '22023' then null; end;
        v_calculation:=public.multideck_uk_vat_calculate_draft(v_actor,v_period);
        if v_calculation->'boxes'->>'1'<>'100.00'
          or v_calculation->'boxes'->>'6'<>'500.00'
          or v_calculation->'boxes'->>'3'<>'100.00'
          or v_calculation->'boxes'->>'5'<>'100.00'
          or v_calculation#>>'{sourceLedger,status}'<>'matched' then
          raise exception 'Method 1 native posting did not enter the nine-box draft'; end if;
        v_inventory:=public.multideck_uk_vat_tax_posting_inventory(v_actor,v_entity,
          (v_calculation->>'calculationId')::uuid,0,10);
        if (v_inventory->>'unlinkedLines')::integer<>0
          or (v_inventory#>>'{controlBridge,differenceGbp}')::numeric<>0
          or (v_inventory#>>'{controlBridge,expectedTaxPostingLines}')::integer<>1
          or (v_inventory#>>'{controlBridge,linkedVatAccountTaxLines}')::integer<>1 then
          raise exception 'Method 1 adjustment did not reconcile to the VAT control account'; end if;
        v_calculation:=public.multideck_uk_vat_reconcile_transactions(v_actor,v_entity,
          (v_calculation->>'calculationId')::uuid,v_calculation->>'sourceDigest',
          array[(v_posted#>>'{postingItems,0,evidenceId}')::uuid],
          'Reviewed the native prior-return VAT correction source');
        v_calculation:=public.multideck_uk_vat_review_control(v_actor,v_entity,
          (v_calculation->>'calculationId')::uuid,v_calculation->>'sourceDigest',
          'The posted correction reconciles to native VAT control');
        v_projection:=public.multideck_uk_vat_review_whole_pounds(v_actor,v_entity,
          (v_calculation->>'calculationId')::uuid,v_calculation->>'sourceDigest',
          'Reviewed the Method 1 correction in all nine filed boxes');
        v_calculation:=v_projection;
        v_lock:=public.multideck_uk_vat_lock_review(v_actor,v_entity,
          (v_calculation->>'calculationId')::uuid,v_calculation->>'sourceDigest',
          (v_projection->>'reviewId')::uuid,
          'Locked the balanced Method 1 correction and final boxes');
        perform public._multideck_uk_vat_require_resolved_prior_errors(v_period);
        if v_lock->>'status'<>'review_locked' then
          raise exception 'Method 1 filing gate cleared without a review lock'; end if;
      end $method1_plan$; select 'method1 plan checked';`), "method1 plan checked")
    sql(readFileSync(new URL('../migrations/20260925153903_uk_vat_reviewed_outside_scope.sql', import.meta.url), 'utf8'))
    assert.equal(sql(`begin;
      do $probe$
      declare e uuid:=gen_random_uuid(); actor uuid:='00000000-0000-0000-0000-000000000003';
        tax uuid:=gen_random_uuid(); doc uuid:=gen_random_uuid(); line uuid:=gen_random_uuid();
        batch uuid:=gen_random_uuid(); nominal uuid:=gen_random_uuid(); control uuid:=gen_random_uuid();
        period_id uuid; event_id uuid; result jsonb; calc uuid;
      begin
        insert into "cmp_LegalEntities"("LegalEntity_ID","LegalEntity_IsActive","LegalEntity_CountryCode") values(e,true,'GB');
        insert into "FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_LegalEntityID","FINComplianceReg_ObligationID","FINComplianceReg_StatusCode","FINComplianceReg_RegistrationReference","FINComplianceReg_EffectiveFrom","FINComplianceReg_SettingsJSON")
          select e,"FINCompliance_ID",'configured','123456789','2026-01-01','{"schemeCode":"standard"}' from "FIN_ComplianceObligations" where "FINCompliance_Code"='gb-vat-mtd' limit 1;
        insert into "FIN_TaxCodes" values(tax,e,'GB','none',true,now(),'OUTSIDE',0,'2026-01-01',null,'out_of_scope',false,null,null);
        insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code","FINNom_ControlTypeCode") values(nominal,e,'4000',null),(control,e,'1100','receivables');
        insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_LegalEntityID","FINPostBatch_StatusCode","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal") values(batch,e,'posted',100,100);
        insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_NativePostingStatusCode","FINDoc_NativePostingBatchID","FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate","FINDoc_DocumentDate","FINDoc_NativePostedBy") values(doc,e,'posted',batch,'GBP',1,'2026-07-15',actor);
        insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID","FINDocLine_NetAmount","FINDocLine_TaxAmount","FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount","FINDocLine_TaxCodeID","FINDocLine_TaxCodeSnapshot","FINDocLine_TaxRatePercent","FINDocLine_NominalAccountID") values(line,doc,100,0,100,0,tax,'OUTSIDE',0,nominal);
        insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DocumentID","FINPostLine_DocumentLineID","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Description") values(batch,1,control,doc,null,100,0,'GBP','Control'),(batch,2,nominal,doc,line,0,100,'GBP','Outside scope source');
        perform public.multideck_uk_vat_backfill_posted(actor,e,100,'Capture outside-scope test source');
        select id into event_id from "FIN_IndirectTaxEvidence" where source_document_id=doc;
        result:=public.multideck_uk_vat_review_evidence(actor,event_id,'2026-07-15','Reviewed explicitly outside-scope source');
        if result->>'treatment'<>'outside_scope' then raise exception 'Outside-scope decision missing'; end if;
        period_id:=(public.multideck_uk_vat_create_draft_period(actor,e,'2026-07-01','2026-09-30')->>'periodId')::uuid;
        result:=public.multideck_uk_vat_calculate_draft(actor,period_id);
        if exists(select 1 from jsonb_each_text(result->'boxes') box where box.value::numeric<>0) then raise exception 'Outside-scope net leaked into a VAT box: %',result; end if;
        calc:=(result->>'calculationId')::uuid;
        if not exists(select 1 from "FIN_IndirectTaxCalculationLines" where calculation_id=calc and evidence_id=event_id and signed_amount=0) then raise exception 'Outside-scope source was lost from audit'; end if;
        update "FIN_TaxCodes" set "FINTax_TreatmentCategoryCode"='zero_rated' where "FINTax_ID"=tax;
        begin
          perform public.multideck_uk_vat_review_evidence(actor,event_id,'2026-07-15','A non-tax code alone must never authorise exclusion');
          raise exception 'Ambiguous non-tax rule accepted';
        exception when sqlstate '22023' then null; end;
        update "FIN_TaxCodes" set "FINTax_TreatmentCategoryCode"='out_of_scope' where "FINTax_ID"=tax;
        result:=public.multideck_uk_vat_reconcile_transactions(actor,e,calc,result->>'sourceDigest',array[event_id],'Reconcile audited outside-scope zero contribution');
        if (result->>'inserted')::integer<>1 then raise exception 'Outside-scope evidence was not reconciled'; end if;
        begin
          perform public.multideck_uk_vat_review_evidence(actor,event_id,'2026-07-15','Attempt to change reconciled exclusion');
          raise exception 'Reconciled outside-scope treatment was changed';
        exception when sqlstate '22023' then null; end;

      end $probe$;
      rollback; select 'outside scope checked';`), 'outside scope checked')
  } finally {
    if (started) run("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"])
    rmSync(directory, { recursive: true, force: true })
  }
})
