-- Run on a newly provisioned, disposable tenant project. These checks inspect
-- the installed database, not historical SQL text in the schema snapshot.
with checks(name, passed) as (
  values
    ('ledger lifecycle',
      to_regprocedure('public.multideck_finance_create_document_draft(uuid,uuid,jsonb)') is not null
      and to_regprocedure('public.multideck_finance_transition_document(uuid,uuid,uuid,text,text)') is not null
      and to_regclass('public."FIN_DocumentStatusHistory"') is not null
      and not has_function_privilege('anon','public.multideck_finance_create_document_draft(uuid,uuid,jsonb)','EXECUTE')),
    ('finance administration',
      to_regprocedure('public.multideck_finance_save_administration(uuid,uuid,uuid,jsonb,text)') is not null
      and to_regclass('public."FIN_AdministrationRevisions"') is not null
      and to_regclass('public."FIN_ConfigurationRunEvents"') is not null
      and not has_function_privilege('authenticated','public.multideck_finance_save_administration(uuid,uuid,uuid,jsonb,text)','EXECUTE')),
    ('customer and supplier finance profiles',
      to_regclass('public."CRM_AccountProfiles"') is not null
      and to_regprocedure('public._multideck_crm_validate_account_finance_preferences()') is not null
      and exists (select 1 from pg_trigger where tgname='TR_CRM_AccountOperationalProfiles_validate_finance' and not tgisinternal)),
    ('approved tax controls',
      to_regprocedure('public._multideck_finance_apply_approved_line_tax()') is not null
      and exists (select 1 from pg_trigger where tgname='TR_FIN_DocumentLines_approved_tax' and not tgisinternal)
      and exists (select 1 from pg_trigger where tgname='TR_FIN_Documents_approved_tax_review' and not tgisinternal)),
    ('draft safeguards',
      to_regclass('public."FIN_Documents"') is not null
      and to_regclass('public."FIN_DocumentLines"') is not null
      and exists (select 1 from pg_constraint where conname='CK_FIN_Documents_source_kind')
      and not has_function_privilege('anon','public.multideck_finance_transition_document(uuid,uuid,uuid,text,text)','EXECUTE')),
    ('finance numbering',
      to_regprocedure('public._multideck_finance_next_number(uuid,text)') is not null
      and to_regclass('public."FIN_NumberSequences"') is not null
      and exists (select 1 from pg_index i join pg_class c on c.oid=i.indrelid where c.relname='FIN_NumberSequences' and i.indisunique and pg_get_indexdef(i.indexrelid) like '%FINSeq_LegalEntityID%FINSeq_Code%')),
    ('audit record types',
      (select count(*) from public."sys_WorkflowRecordTypes" where "WorkflowRecordType_Code" in
        ('sl_invoice','credit_note','pl_invoice','debit_note','customer_receipt','supplier_payment','finance_configuration'))=7),
    ('reporting access boundary',
      (select count(*) = 18 and bool_and(
        not has_table_privilege('anon', c.oid, 'SELECT')
        and not has_table_privilege('authenticated', c.oid, 'SELECT')
        and has_table_privilege('service_role', c.oid, 'SELECT')
        and c.reloptions @> array['security_invoker=true'])
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = any(array[
         'FIN_AccountingDateWorklist','FIN_CutoffRunSummary','FIN_WIPAccrualSummary',
         'FIN_DocumentBalanceSummary','FIN_JobFinanceSummary','FIN_JobChargeFinanceSummary',
         'FIN_ROEWorklist','FIN_JobROESummary','FIN_FXGainLossSummary',
         'FIN_CashAllocationSummary','FIN_DebtChasingQueue','FIN_CommissionAccrualSummary',
         'FIN_ProfitShareSummary','FIN_ExportReadinessQueue','FIN_AIInsightQueue',
         'FIN_CustomerPaymentRiskSummary','FIN_CreditStopRecommendationSummary',
         'FIN_DisruptionCostRiskSummary']))),
    ('sandbox tax restriction',
      to_regprocedure('public._multideck_finance_demo_tax_allowed(uuid)') is not null
      and exists (select 1 from pg_trigger where tgname='TR_FIN_AdministrationRevisions_demo_guard' and not tgisinternal)),
    ('sandbox readiness',
      to_regprocedure('public._multideck_finance_normalise_revision_readiness()') is not null
      and exists (select 1 from pg_trigger where tgname='TR_FIN_AdministrationRevisions_tax_readiness' and not tgisinternal)),
    ('document recovery',
      to_regprocedure('public.multideck_finance_update_document_draft(uuid,uuid,uuid,jsonb)') is not null
      and to_regprocedure('public.multideck_finance_reopen_document_draft(uuid,uuid,uuid,text)') is not null
      and not has_function_privilege('anon','public.multideck_finance_reopen_document_draft(uuid,uuid,uuid,text)','EXECUTE')),
    ('tenant-owned documents',
      to_regclass('public."FIN_Documents"') is not null
      and to_regclass('public."FIN_CashTransactions"') is not null
      and (select relrowsecurity from pg_class where oid='public."FIN_Documents"'::regclass)
      and (select relrowsecurity from pg_class where oid='public."FIN_CashTransactions"'::regclass)
      and not has_function_privilege('authenticated','public.multideck_finance_create_cash_draft(uuid,uuid,jsonb)','EXECUTE')),
    ('linked account party sync',
      to_regclass('public."ACCI_SyncRuns"') is not null
      and to_regclass('public."ACCI_SyncEvents"') is not null
      and exists (select 1 from pg_trigger where tgname='TR_ACCI_SyncRuns_dexter_party_watch' and not tgisinternal)
      and (select relrowsecurity from pg_class where oid='public."ACCI_SyncRuns"'::regclass))
)
select name, coalesce(passed,false) as passed from checks order by name;
