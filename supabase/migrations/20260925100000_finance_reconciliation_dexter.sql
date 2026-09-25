begin;

create function public.multideck_dexter_domain_bank_reconciliation(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(item),'[]'::jsonb) from (
    select jsonb_build_object('recordId',bank."FINBank_ID",'recordKind','bank_reconciliation','title',bank."FINBank_Name",
      'bankCode',bank."FINBank_Code",'currency',bank."FINBank_CurrencyCode",'savedStatus',statement."FINStmtImp_StatusCode",
      'statementId',statement."FINStmtImp_ID",'periodId',statement.verified_period_id,'coverageFrom',statement."FINStmtImp_StatementDateFrom",
      'coverageTo',statement."FINStmtImp_StatementDateTo",'rowCount',statement."FINStmtImp_RowCount",'verifiedAt',statement.verified_at,
      'route','/finance/bank-reconciliation','evidence',jsonb_build_object('sourceTable','FIN_StatementImports','sourceId',statement."FINStmtImp_ID",
        'legalEntityId',entity."LegalEntity_ID",'sourceHash',statement."FINStmtImp_FileHashSHA256",'updatedAt',coalesce(statement.verified_at,statement."FINStmtImp_ImportedAt"))) item
    from public."FIN_BankAccounts" bank join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=bank."FINBank_LegalEntityID"
      join lateral (select * from public."FIN_StatementImports" imported where imported."FINStmtImp_BankAccountID"=bank."FINBank_ID"
        and imported.legal_entity_id=entity."LegalEntity_ID" order by imported."FINStmtImp_ImportedAt" desc limit 1) statement on true
    where entity."Company_ID"=p_company_id and entity."LegalEntity_IsActive"
      and (nullif(btrim(p_search),'') is null or concat_ws(' ',bank."FINBank_Code",bank."FINBank_Name",statement."FINStmtImp_StatusCode") ilike '%'||btrim(p_search)||'%')
    order by statement."FINStmtImp_ImportedAt" desc limit greatest(1,least(coalesce(p_take,10),25))
  ) rows;
$$;
revoke all on function public.multideck_dexter_domain_bank_reconciliation(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_bank_reconciliation(uuid,text,integer) to service_role;

create function public.multideck_dexter_domain_provider_reconciliation(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(item),'[]'::jsonb) from (
    select jsonb_build_object('recordId',connection."ACCIC_ID",'recordKind','provider_reconciliation','title',connection."ACCIC_Name",
      'providerCode',run.provider_code,'providerCompany',run.provider_company,'savedStatus',run.status,'runId',run.id,'periodId',run.period_id,
      'currency',run.currency,'sourceCutoff',run.source_cutoff,'completedAt',run.completed_at,
      'differenceCount',jsonb_array_length(run.comparison->'differences'),'issues',run.comparison->'issues',
      'stale',case when run.completed_at<now()-interval '15 minutes' or connection."ACCIC_UpdatedAt">run.source_cutoff
        or exists(select 1 from public."ACCI_WebhookEvents" webhook where webhook."ACCIWH_ConnectionID"=connection."ACCIC_ID" and webhook."ACCIWH_ReceivedAt">run.source_cutoff)
        then true else null end,
      'route','/finance/provider-reconciliation','evidence',jsonb_build_object('sourceTable','ACCI_PeriodReconciliationRuns','sourceId',run.id,
        'legalEntityId',run.legal_entity_id,'localHash',run.local_hash,'providerHash',run.provider_hash,'mappingRevision',run.mapping_revision,
        'checkpoint',run.provider_checkpoint,'updatedAt',run.completed_at)) item
    from public."ACCI_Connections" connection join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=connection."ACCIC_LegalEntityID"
      join lateral (select * from public."ACCI_PeriodReconciliationRuns" result where result.connection_id=connection."ACCIC_ID" and result.legal_entity_id=entity."LegalEntity_ID"
        order by result.completed_at desc limit 1) run on true
    where entity."Company_ID"=p_company_id and entity."LegalEntity_IsActive" and connection."ACCIC_StatusCode"='active'
      and (nullif(btrim(p_search),'') is null or concat_ws(' ',connection."ACCIC_Name",run.provider_company,run.status) ilike '%'||btrim(p_search)||'%')
    order by run.completed_at desc limit greatest(1,least(coalesce(p_take,10),25))
  ) rows;
$$;
revoke all on function public.multideck_dexter_domain_provider_reconciliation(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_provider_reconciliation(uuid,text,integer) to service_role;

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON") values
  ('bank_reconciliation','Bank reconciliation','Saved statement imports and sign-off evidence. Recheck the live control on the Bank reconciliation page before claiming the current bank and ledger still agree. Import, match and verify remain manual finance actions.','multideck_dexter_domain_bank_reconciliation','["Finance.Management.View"]','["financial_record"]'),
  ('provider_reconciliation','Accounts system period reconciliation','Latest source-backed comparison status, cut-off, hashes and difference count. A saved verified run can become stale; open Accounts system reconciliation for current completeness and the full differences. Runs and review decisions remain manual.','multideck_dexter_domain_provider_reconciliation','["Finance.Management.View"]','["financial_record"]');

insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON") values
  ('bank_reconciliation','Bank reconciliation','Saved bank statement import and verification status changes. A later posting requires an on-demand control recheck.','["status"]','["Finance.Management.View"]'),
  ('provider_reconciliation','Accounts system reconciliation','A new complete, different or incomplete provider period run is recorded. Watches follow retained run results, not invisible provider edits between runs.','["status","differenceCount"]','["Finance.Management.View"]');

create function public._multideck_bank_reconciliation_watch() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare company uuid; previous jsonb; current_state jsonb;
begin
  select entity."Company_ID" into company from public."FIN_BankAccounts" bank join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=bank."FINBank_LegalEntityID"
    where bank."FINBank_ID"=new."FINStmtImp_BankAccountID" and entity."LegalEntity_IsActive";
  previous:=case when tg_op='INSERT' then '{}'::jsonb else jsonb_build_object('status',old."FINStmtImp_StatusCode") end;
  current_state:=jsonb_build_object('status',new."FINStmtImp_StatusCode");
  if company is not null and previous is distinct from current_state and exists(select 1 from public."AI_DexterWatches" w join public."cmp_Users" u on u."User_ID"=w."AIDexterWatch_OwnerUserID"
    where w."AIDexterWatch_CompanyID"=company and u."Company_ID"=company and u."User_AccessStatus"='active'
      and public._multideck_dexter_has_permission(u."User_ID",'Finance.Management.View') and w."AIDexterWatch_CapabilityCode"='bank_reconciliation'
      and w."AIDexterWatch_StatusCode"='active' and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=new."FINStmtImp_BankAccountID")) then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
      values(company,'bank_reconciliation','FIN_StatementImports',new."FINStmtImp_BankAccountID",previous,current_state);
  end if;
  return new;
end; $$;
revoke all on function public._multideck_bank_reconciliation_watch() from public,anon,authenticated;
create trigger bank_reconciliation_watch after insert or update of "FINStmtImp_StatusCode" on public."FIN_StatementImports"
  for each row execute function public._multideck_bank_reconciliation_watch();

create function public._multideck_provider_reconciliation_watch() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare company uuid; previous jsonb; current_state jsonb; previous_run public."ACCI_PeriodReconciliationRuns";
begin
  select "Company_ID" into company from public."cmp_LegalEntities" where "LegalEntity_ID"=new.legal_entity_id and "LegalEntity_IsActive";
  select * into previous_run from public."ACCI_PeriodReconciliationRuns" where connection_id=new.connection_id and period_id=new.period_id and id<>new.id order by completed_at desc limit 1;
  previous:=case when previous_run.id is null then '{}'::jsonb else jsonb_build_object('status',previous_run.status,'differenceCount',jsonb_array_length(previous_run.comparison->'differences')) end;
  current_state:=jsonb_build_object('status',new.status,'differenceCount',jsonb_array_length(new.comparison->'differences'));
  if company is not null and previous is distinct from current_state and exists(select 1 from public."AI_DexterWatches" w join public."cmp_Users" u on u."User_ID"=w."AIDexterWatch_OwnerUserID"
    where w."AIDexterWatch_CompanyID"=company and u."Company_ID"=company and u."User_AccessStatus"='active'
      and public._multideck_dexter_has_permission(u."User_ID",'Finance.Management.View') and w."AIDexterWatch_CapabilityCode"='provider_reconciliation'
      and w."AIDexterWatch_StatusCode"='active' and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=new.connection_id)) then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
      values(company,'provider_reconciliation','ACCI_PeriodReconciliationRuns',new.connection_id,previous,current_state);
  end if;
  return new;
end; $$;
revoke all on function public._multideck_provider_reconciliation_watch() from public,anon,authenticated;
create trigger provider_reconciliation_watch after insert on public."ACCI_PeriodReconciliationRuns"
  for each row execute function public._multideck_provider_reconciliation_watch();

create function public.multideck_dexter_can_read_finance_reconciliation_watch(p_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public."cmp_Users" u where u."Auth_User_ID"=auth.uid() and u."Company_ID"=p_company_id
    and u."User_AccessStatus"='active' and public._multideck_dexter_has_permission(u."User_ID",'Finance.Management.View'));
$$;
revoke all on function public.multideck_dexter_can_read_finance_reconciliation_watch(uuid) from public,anon;
grant execute on function public.multideck_dexter_can_read_finance_reconciliation_watch(uuid) to authenticated,service_role;
create policy "Finance reconciliation watches require current access" on public."AI_DexterWatches" as restrictive for select to authenticated
  using ("AIDexterWatch_CapabilityCode" not in ('bank_reconciliation','provider_reconciliation')
    or public.multideck_dexter_can_read_finance_reconciliation_watch("AIDexterWatch_CompanyID"));
alter function public.multideck_dexter_list_watches() rename to _multideck_dexter_list_watches_before_finance_reconciliation_20260925;
create function public.multideck_dexter_list_watches() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb)
  from jsonb_array_elements(public._multideck_dexter_list_watches_before_finance_reconciliation_20260925()) with ordinality as rows(item,ordinal)
  where item->>'capability' not in ('bank_reconciliation','provider_reconciliation') or exists(select 1 from public."AI_DexterWatches" w
    where w."AIDexterWatch_ID"=(item->>'id')::uuid and public.multideck_dexter_can_read_finance_reconciliation_watch(w."AIDexterWatch_CompanyID"));
$$;
revoke all on function public._multideck_dexter_list_watches_before_finance_reconciliation_20260925() from public,anon,authenticated;
revoke all on function public.multideck_dexter_list_watches() from public,anon;
grant execute on function public.multideck_dexter_list_watches() to authenticated,service_role;

commit;
