begin;

create table public."ACCI_PeriodReconciliationRuns" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  period_id uuid not null references public."FIN_Periods"("FINPeriod_ID") on delete restrict,
  connection_id uuid not null references public."ACCI_Connections"("ACCIC_ID") on delete restrict,
  provider_code text not null check(provider_code in ('erpnext','sage_50')),
  provider_company text not null,
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  period_start date not null,
  period_end date not null,
  source_cutoff timestamptz not null,
  provider_checkpoint text not null,
  mapping_revision text not null,
  status text not null check(status in ('incomplete','differences','verified')),
  local_hash text not null check(local_hash ~ '^[a-f0-9]{64}$'),
  provider_hash text not null check(provider_hash ~ '^[a-f0-9]{64}$'),
  evidence jsonb not null check(jsonb_typeof(evidence)='object'),
  comparison jsonb not null check(jsonb_typeof(comparison)='object'),
  requested_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  completed_at timestamptz not null default now(),
  check(period_end>=period_start)
);
create index on public."ACCI_PeriodReconciliationRuns"(legal_entity_id,period_id,connection_id,completed_at desc);
alter table public."ACCI_PeriodReconciliationRuns" enable row level security;
revoke all on public."ACCI_PeriodReconciliationRuns" from public,anon,authenticated;
grant select,insert on public."ACCI_PeriodReconciliationRuns" to service_role;

create table public."ACCI_PeriodReconciliationDifferences" (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public."ACCI_PeriodReconciliationRuns"(id) on delete restrict,
  domain text not null check(domain in ('documents','allocations','journal_lines','tax_lines','trial_balance','controls')),
  identity text not null,
  kind text not null check(kind in ('missing_provider','external_only','conflict','changed','duplicate_local','duplicate_provider')),
  local_snapshot jsonb,
  provider_snapshot jsonb,
  common_snapshot jsonb,
  review_status text not null default 'pending' check(review_status in ('pending','proposed','acknowledged')),
  review_action text,
  review_reason text,
  reviewed_by uuid references public."cmp_Users"("User_ID") on delete restrict,
  reviewed_at timestamptz,
  unique(run_id,domain,identity,kind)
);
create index on public."ACCI_PeriodReconciliationDifferences"(run_id,review_status,domain);
alter table public."ACCI_PeriodReconciliationDifferences" enable row level security;
revoke all on public."ACCI_PeriodReconciliationDifferences" from public,anon,authenticated;
grant select,insert,update on public."ACCI_PeriodReconciliationDifferences" to service_role;

create function public.multideck_finance_period_local_snapshot(p_actor uuid,p_entity uuid,p_period uuid,p_connection uuid)
returns jsonb language plpgsql stable set search_path=pg_catalog,public as $$
declare p public."FIN_Periods"; c public."ACCI_Connections"; entity_currency text; total_rows bigint;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View');
  select * into p from public."FIN_Periods" where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity;
  select * into c from public."ACCI_Connections" where "ACCIC_ID"=p_connection and "ACCIC_LegalEntityID"=p_entity and "ACCIC_StatusCode"='active';
  select "LegalEntity_BaseCurrencyCodeSnapshot" into entity_currency from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
  if p."FINPeriod_ID" is null or c."ACCIC_ID" is null or c."ACCIC_ProviderCode" not in ('erpnext','sage_50')
    or c."ACCIC_ExternalTenantName" is null or c."ACCIC_ExternalBaseCurrencyCode" is distinct from entity_currency
    or p."FINPeriod_BaseCurrencyCode" is distinct from entity_currency then
    raise exception 'Period, active connection, company or base currency is incomplete.' using errcode='22023';
  end if;
  select (select count(*) from public."FIN_Documents" where "FINDoc_LegalEntityID"=p_entity and "FINDoc_AccountingDate"<=p."FINPeriod_EndDate" and "FINDoc_NativePostingStatusCode"='posted')
    +(select count(*) from public."FIN_CashTransactions" where "FINCash_LegalEntityID"=p_entity and "FINCash_AccountingDate"<=p."FINPeriod_EndDate" and "FINCash_NativePostingStatusCode"='posted')
    +(select count(*) from public."FIN_PostingLines" l join public."FIN_PostingBatches" b on b."FINPostBatch_ID"=l."FINPostLine_BatchID"
      join public."FIN_Periods" period on period."FINPeriod_ID"=b."FINPostBatch_PeriodID" where b."FINPostBatch_LegalEntityID"=p_entity and b."FINPostBatch_StatusCode"='posted' and period."FINPeriod_EndDate"<=p."FINPeriod_EndDate")
    into total_rows;
  if total_rows>20000 then raise exception 'The accounting period exceeds the bounded reconciliation read. Use an authorised larger service window.' using errcode='22023'; end if;
  return jsonb_build_object(
    'entityId',p_entity,'periodId',p_period,'from',p."FINPeriod_StartDate",'to',p."FINPeriod_EndDate",'currency',entity_currency,
    'periodStatus',p."FINPeriod_StatusCode",'connectionId',p_connection,'providerCode',c."ACCIC_ProviderCode",'company',c."ACCIC_ExternalTenantName",'connectionUpdatedAt',c."ACCIC_UpdatedAt",
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d."FINDoc_ID",'type',d."FINDoc_TypeCode",'status',d."FINDoc_StatusCode",'number',d."FINDoc_Number",'date',d."FINDoc_AccountingDate",'partyId',d."FINDoc_PartyOrgID",'currency',d."FINDoc_CurrencyCodeSnapshot",'net',d."FINDoc_NetAmount"::text,'tax',d."FINDoc_TaxAmount"::text,'gross',d."FINDoc_GrossAmount"::text,'outstanding',d."FINDoc_OutstandingAmount"::text,'openingPackageId',d."FINDoc_OpeningBalancePackageID",'updatedAt',d."FINDoc_UpdatedAt") order by d."FINDoc_ID") from public."FIN_Documents" d where d."FINDoc_LegalEntityID"=p_entity and d."FINDoc_AccountingDate"<=p."FINPeriod_EndDate" and d."FINDoc_NativePostingStatusCode"='posted'),'[]'::jsonb),
    'documentLines',coalesce((select jsonb_agg(jsonb_build_object('id',line."FINDocLine_ID",'documentId',line."FINDocLine_DocumentID",'lineNo',line."FINDocLine_LineNo",'taxCode',line."FINDocLine_TaxCodeSnapshot",'rate',line."FINDocLine_TaxRatePercent"::text,'tax',line."FINDocLine_TaxAmount"::text,'localTax',line."FINDocLine_LocalTaxAmount"::text) order by line."FINDocLine_DocumentID",line."FINDocLine_LineNo") from public."FIN_DocumentLines" line join public."FIN_Documents" d on d."FINDoc_ID"=line."FINDocLine_DocumentID" where d."FINDoc_LegalEntityID"=p_entity and d."FINDoc_AccountingDate"<=p."FINPeriod_EndDate" and d."FINDoc_NativePostingStatusCode"='posted'),'[]'::jsonb),
    'cash',coalesce((select jsonb_agg(jsonb_build_object('id',cash."FINCash_ID",'type',cash."FINCash_TypeCode",'status',cash."FINCash_StatusCode",'number',cash."FINCash_Number",'date',cash."FINCash_AccountingDate",'partyId',cash."FINCash_PartyOrgID",'bankId',cash."FINCash_BankAccountID",'currency',cash."FINCash_CurrencyCodeSnapshot",'amount',cash."FINCash_Amount"::text,'unallocated',cash."FINCash_UnallocatedAmount"::text,'openingPackageId',cash."FINCash_OpeningBalancePackageID",'updatedAt',cash."FINCash_UpdatedAt") order by cash."FINCash_ID") from public."FIN_CashTransactions" cash where cash."FINCash_LegalEntityID"=p_entity and cash."FINCash_AccountingDate"<=p."FINPeriod_EndDate" and cash."FINCash_NativePostingStatusCode"='posted'),'[]'::jsonb),
    'allocations',coalesce((select jsonb_agg(jsonb_build_object('id',a."FINCashAlloc_ID",'cashId',a."FINCashAlloc_CashID",'documentId',a."FINCashAlloc_DocumentID",'amount',a."FINCashAlloc_AllocatedAmount"::text,'localAmount',a."FINCashAlloc_LocalAllocatedAmount"::text,'status',a."FINCashAlloc_AllocationStatusCode") order by a."FINCashAlloc_ID") from public."FIN_CashAllocations" a join public."FIN_CashTransactions" cash on cash."FINCash_ID"=a."FINCashAlloc_CashID" where cash."FINCash_LegalEntityID"=p_entity and cash."FINCash_AccountingDate"<=p."FINPeriod_EndDate" and cash."FINCash_NativePostingStatusCode"='posted'),'[]'::jsonb),
    'taxes',coalesce((select jsonb_agg(jsonb_build_object('id',tax."FINDocTax_ID",'documentId',tax."FINDocTax_DocumentID",'code',tax."FINDocTax_TaxCodeSnapshot",'rate',tax."FINDocTax_TaxRatePercent"::text,'taxable',tax."FINDocTax_TaxableAmount"::text,'amount',tax."FINDocTax_TaxAmount"::text,'localAmount',tax."FINDocTax_LocalTaxAmount"::text) order by tax."FINDocTax_ID") from public."FIN_DocumentTaxes" tax join public."FIN_Documents" d on d."FINDoc_ID"=tax."FINDocTax_DocumentID" where d."FINDoc_LegalEntityID"=p_entity and d."FINDoc_AccountingDate"<=p."FINPeriod_EndDate" and d."FINDoc_NativePostingStatusCode"='posted'),'[]'::jsonb),
    'postingLines',coalesce((select jsonb_agg(jsonb_build_object('id',l."FINPostLine_ID",'batchId',b."FINPostBatch_ID",'sourceTable',b."FINPostBatch_SourceTable",'sourceId',b."FINPostBatch_SourceID",'periodId',period."FINPeriod_ID",'periodStart',period."FINPeriod_StartDate",'periodEnd',period."FINPeriod_EndDate",'nominalId',l."FINPostLine_NominalAccountID",'debit',l."FINPostLine_DebitAmount"::text,'credit',l."FINPostLine_CreditAmount"::text,'lineNo',l."FINPostLine_LineNo",'postedAt',b."FINPostBatch_PostedAt") order by period."FINPeriod_EndDate",b."FINPostBatch_ID",l."FINPostLine_LineNo") from public."FIN_PostingLines" l join public."FIN_PostingBatches" b on b."FINPostBatch_ID"=l."FINPostLine_BatchID" join public."FIN_Periods" period on period."FINPeriod_ID"=b."FINPostBatch_PeriodID" where b."FINPostBatch_LegalEntityID"=p_entity and b."FINPostBatch_StatusCode"='posted' and period."FINPeriod_EndDate"<=p."FINPeriod_EndDate"),'[]'::jsonb),
    'nominals',coalesce((select jsonb_agg(jsonb_build_object('id',n."FINNom_ID",'code',n."FINNom_Code",'type',n."FINNom_AccountTypeCode",'control',n."FINNom_ControlTypeCode",'active',n."FINNom_IsActive") order by n."FINNom_ID") from public."FIN_NominalAccounts" n where n."FINNom_LegalEntityID"=p_entity),'[]'::jsonb),
    'externalRefs',coalesce((select jsonb_agg(jsonb_build_object('localTable',r."ACCIER_LocalTable",'localId',r."ACCIER_LocalID",'externalType',r."ACCIER_ExternalObjectType",'externalId',r."ACCIER_ExternalID",'status',r."ACCIER_SyncStatusCode",'lastPayload',r."ACCIER_LastPayloadJSON") order by r."ACCIER_ID") from public."ACCI_ExternalRefs" r where r."ACCIER_ConnectionID"=p_connection),'[]'::jsonb),
    'accountMappings',coalesce((select jsonb_agg(jsonb_build_object('localContext',m."ACCIAM_LocalContextCode",'providerAccount',m."ACCIAM_ProviderAccountID") order by m."ACCIAM_ID") from public."ACCI_AccountMappings" m where m."ACCIAM_ConnectionID"=p_connection and m."ACCIAM_IsActive"),'[]'::jsonb),
    'taxMappings',coalesce((select jsonb_agg(jsonb_build_object('localCode',m."ACCITM_LocalTaxCode",'direction',m."ACCITM_DirectionCode",'providerCode',m."ACCITM_ProviderTaxCode") order by m."ACCITM_ID") from public."ACCI_TaxCodeMappings" m where m."ACCITM_ConnectionID"=p_connection and m."ACCITM_IsActive"),'[]'::jsonb),
    'partyMappings',coalesce((select jsonb_agg(jsonb_build_object('localId',m."ACCIPM_OrgID",'providerId',m."ACCIPM_ProviderPartyID",'type',m."ACCIPM_PartyType") order by m."ACCIPM_ID") from public."ACCI_PartyMappings" m where m."ACCIPM_ConnectionID"=p_connection and m."ACCIPM_IsActive"),'[]'::jsonb),
    'banks',coalesce((select jsonb_agg(jsonb_build_object('id',b."FINBank_ID",'nominalId',b."FINBank_NominalAccountID",'currency',b."FINBank_CurrencyCode",'active',b."FINBank_IsActive") order by b."FINBank_ID") from public."FIN_BankAccounts" b where b."FINBank_LegalEntityID"=p_entity),'[]'::jsonb),
    'journals',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'batchId',j.batch_id,'externalId',j.external_id,'status',j.status,'mirrorStatus',j.mirror_status) order by j.id) from public."FIN_Journals" j where j.legal_entity_id=p_entity and j.accounting_date<=p."FINPeriod_EndDate" and j.status='posted'),'[]'::jsonb),
    'openingPackages',coalesce((select jsonb_agg(jsonb_build_object('id',opening.id,'batchId',opening.posting_batch_id,'mirrorStatus',mirror.status,
      'externalId',case when mirror.connection_id=p_connection and mirror.status='matched' then mirror.external_id else null end,
      'readbackHash',case when mirror.connection_id=p_connection and mirror.status='matched' then mirror.readback_hash else null end) order by opening.id)
      from public."FIN_OpeningBalancePackages" opening left join public."FIN_OpeningMirrorDeliveries" mirror on mirror.package_id=opening.id
      where opening.legal_entity_id=p_entity and opening.status='posted' and opening.opening_date<=p."FINPeriod_EndDate"),'[]'::jsonb)
  );
end; $$;
revoke all on function public.multideck_finance_period_local_snapshot(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_period_local_snapshot(uuid,uuid,uuid,uuid) to service_role;

create function public.multideck_finance_period_record_run(p_actor uuid,p_entity uuid,p_period uuid,p_connection uuid,p_payload jsonb)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare p public."FIN_Periods"; c public."ACCI_Connections"; run_id uuid; status text; difference jsonb; domain text; source jsonb;
  sources jsonb; comparison jsonb; evidence jsonb; local_hash text; provider_hash text; cutoff timestamptz;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View');
  select * into p from public."FIN_Periods" where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity for share;
  select * into c from public."ACCI_Connections" where "ACCIC_ID"=p_connection and "ACCIC_LegalEntityID"=p_entity and "ACCIC_StatusCode"='active' for share;
  if p."FINPeriod_ID" is null or c."ACCIC_ID" is null then raise exception 'Period or active connection not found.' using errcode='P0002'; end if;
  status:=p_payload#>>'{comparison,status}'; sources:=p_payload->'sources'; comparison:=p_payload->'comparison'; evidence:=p_payload->'evidence';
  local_hash:=p_payload->>'localHash'; provider_hash:=p_payload->>'providerHash';
  if status not in ('incomplete','differences','verified') or jsonb_typeof(sources) is distinct from 'object'
    or jsonb_typeof(evidence) is distinct from 'object' or jsonb_typeof(comparison) is distinct from 'object'
    or jsonb_typeof(comparison->'differences') is distinct from 'array' or jsonb_typeof(comparison->'issues') is distinct from 'array'
    or jsonb_array_length(comparison->'differences')>5000 or local_hash is null or local_hash !~ '^[a-f0-9]{64}$' or provider_hash is null or provider_hash !~ '^[a-f0-9]{64}$'
    or p_payload->>'providerCode' is distinct from c."ACCIC_ProviderCode" or p_payload->>'company' is distinct from c."ACCIC_ExternalTenantName"
    or p_payload->>'currency' is distinct from p."FINPeriod_BaseCurrencyCode" or p_payload->>'from' is distinct from p."FINPeriod_StartDate"::text
    or p_payload->>'to' is distinct from p."FINPeriod_EndDate"::text or length(coalesce(p_payload->>'mappingRevision',''))<16
    or length(coalesce(p_payload->>'checkpoint',''))<1 or p_payload->>'cutoff' is null then
    raise exception 'Period reconciliation evidence is incomplete.' using errcode='22023';
  end if;
  cutoff:=(p_payload->>'cutoff')::timestamptz;
  if cutoff>now() or cutoff<now()-interval '2 hours' then raise exception 'Provider source cut-off is stale or in the future.' using errcode='22023'; end if;
  if status='verified' then
    if jsonb_array_length(comparison->'differences')<>0 or jsonb_array_length(comparison->'issues')<>0 then
      raise exception 'A period with differences or missing reads cannot be verified.' using errcode='22023';
    end if;
    for domain in select unnest(array['documents','allocations','journal_lines','tax_lines','trial_balance','controls']) loop
      if jsonb_typeof(sources#>array['local','domains',domain,'rows']) is distinct from 'array'
        or jsonb_typeof(sources#>array['provider','domains',domain,'rows']) is distinct from 'array'
        or sources#>>array['local','domains',domain,'complete'] is distinct from 'true'
        or sources#>>array['provider','domains',domain,'complete'] is distinct from 'true'
        or (sources#>>array['local','domains',domain,'count'])::integer is distinct from jsonb_array_length(sources#>array['local','domains',domain,'rows'])
        or (sources#>>array['provider','domains',domain,'count'])::integer is distinct from jsonb_array_length(sources#>array['provider','domains',domain,'rows']) then
        raise exception 'A required reconciliation domain has a partial read.' using errcode='22023';
      end if;
    end loop;
  end if;
  if status='differences' and jsonb_array_length(comparison->'differences')=0 then
    raise exception 'A difference run must retain its differences.' using errcode='22023';
  end if;
  insert into public."ACCI_PeriodReconciliationRuns"(legal_entity_id,period_id,connection_id,provider_code,provider_company,currency,period_start,period_end,source_cutoff,provider_checkpoint,mapping_revision,status,local_hash,provider_hash,evidence,comparison,requested_by)
    values(p_entity,p_period,p_connection,c."ACCIC_ProviderCode",c."ACCIC_ExternalTenantName",p."FINPeriod_BaseCurrencyCode",p."FINPeriod_StartDate",p."FINPeriod_EndDate",cutoff,p_payload->>'checkpoint',p_payload->>'mappingRevision',status,local_hash,provider_hash,evidence,comparison,p_actor) returning id into run_id;
  for difference in select value from jsonb_array_elements(comparison->'differences') loop
    insert into public."ACCI_PeriodReconciliationDifferences"(run_id,domain,identity,kind,local_snapshot,provider_snapshot,common_snapshot)
      values(run_id,difference->>'domain',difference->>'identity',difference->>'kind',difference->'local',difference->'provider',difference->'common');
  end loop;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','ACCI_PeriodReconciliationRuns','provider_reconciliation',run_id,'compare','Provider period reconciliation recorded',jsonb_build_object('periodId',p_period,'connectionId',p_connection,'status',status,'differences',jsonb_array_length(comparison->'differences')));
  return jsonb_build_object('id',run_id,'status',status,'differenceCount',jsonb_array_length(comparison->'differences'));
end; $$;
revoke all on function public.multideck_finance_period_record_run(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_period_record_run(uuid,uuid,uuid,uuid,jsonb) to service_role;

create function public.multideck_finance_provider_period_status(p_actor uuid,p_entity uuid,p_period uuid,p_connection uuid)
returns jsonb language plpgsql stable set search_path=pg_catalog,public as $$
declare r public."ACCI_PeriodReconciliationRuns"; c public."ACCI_Connections";
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View');
  select * into c from public."ACCI_Connections" where "ACCIC_ID"=p_connection and "ACCIC_LegalEntityID"=p_entity and "ACCIC_StatusCode"='active';
  if c."ACCIC_ID" is null then return jsonb_build_object('status','incomplete','reason','The exact accounting connection is unavailable.'); end if;
  select * into r from public."ACCI_PeriodReconciliationRuns" where legal_entity_id=p_entity and period_id=p_period and connection_id=p_connection order by completed_at desc,id desc limit 1;
  if r.id is null then return jsonb_build_object('status','incomplete','reason','No complete provider period comparison has run.'); end if;
  if r.status='verified' and (r.completed_at<now()-interval '15 minutes' or c."ACCIC_UpdatedAt">r.source_cutoff
    or r.evidence->'rawLocal' is distinct from public.multideck_finance_period_local_snapshot(p_actor,p_entity,p_period,p_connection)
    or exists(select 1 from public."ACCI_WebhookEvents" e where e."ACCIWH_ConnectionID"=p_connection and e."ACCIWH_ReceivedAt">r.source_cutoff)
    or exists(select 1 from public."FIN_Documents" d join public."FIN_Periods" p on p."FINPeriod_ID"=r.period_id
      where d."FINDoc_LegalEntityID"=p_entity and d."FINDoc_AccountingDate"<=p."FINPeriod_EndDate" and d."FINDoc_UpdatedAt">r.source_cutoff)
    or exists(select 1 from public."FIN_CashTransactions" cash join public."FIN_Periods" p on p."FINPeriod_ID"=r.period_id
      where cash."FINCash_LegalEntityID"=p_entity and cash."FINCash_AccountingDate"<=p."FINPeriod_EndDate" and cash."FINCash_UpdatedAt">r.source_cutoff)
    or exists(select 1 from public."FIN_PostingBatches" b join public."FIN_Periods" p on p."FINPeriod_ID"=b."FINPostBatch_PeriodID"
      join public."FIN_Periods" target on target."FINPeriod_ID"=r.period_id
      where b."FINPostBatch_LegalEntityID"=p_entity and p."FINPeriod_EndDate"<=target."FINPeriod_EndDate" and b."FINPostBatch_PostedAt">r.source_cutoff)) then
    return jsonb_build_object('status','incomplete','reason','The last verified provider comparison is stale or new provider changes arrived.','runId',r.id,'asOf',r.source_cutoff);
  end if;
  return jsonb_build_object('status',r.status,'runId',r.id,'asOf',r.source_cutoff,'differenceCount',jsonb_array_length(r.comparison->'differences'),'issues',r.comparison->'issues');
end; $$;
revoke all on function public.multideck_finance_provider_period_status(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_provider_period_status(uuid,uuid,uuid,uuid) to service_role;

create function public.multideck_finance_period_review_difference(p_actor uuid,p_entity uuid,p_difference uuid,p_action text,p_reason text)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare d public."ACCI_PeriodReconciliationDifferences"; r public."ACCI_PeriodReconciliationRuns";
begin
  select run.* into r from public."ACCI_PeriodReconciliationRuns" run join public."ACCI_PeriodReconciliationDifferences" difference on difference.run_id=run.id
    where difference.id=p_difference and run.legal_entity_id=p_entity;
  if r.id is null then raise exception 'Reconciliation difference not found.' using errcode='P0002'; end if;
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Approve');
  if p_action not in ('prepare_draft','requires_adjustment','expected_difference') or length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then
    raise exception 'Choose a reviewed disposition and reason.' using errcode='22023';
  end if;
  select * into d from public."ACCI_PeriodReconciliationDifferences" where id=p_difference and run_id=r.id for update;
  if d.review_status<>'pending' then raise exception 'This difference already has a review decision.' using errcode='22023'; end if;
  if p_action='prepare_draft' and d.kind not in ('external_only','changed') then raise exception 'Only an external-only change can be proposed for a controlled draft.' using errcode='22023'; end if;
  update public."ACCI_PeriodReconciliationDifferences" set review_status=case when p_action='prepare_draft' then 'proposed' else 'acknowledged' end,
    review_action=p_action,review_reason=btrim(p_reason),reviewed_by=p_actor,reviewed_at=now() where id=d.id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','ACCI_PeriodReconciliationDifferences','provider_difference',d.id,'review','Provider difference reviewed',jsonb_build_object('action',p_action,'reason',btrim(p_reason),'runId',r.id));
  return jsonb_build_object('id',d.id,'status',case when p_action='prepare_draft' then 'proposed' else 'acknowledged' end,'action',p_action);
end; $$;
revoke all on function public.multideck_finance_period_review_difference(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_period_review_difference(uuid,uuid,uuid,text,text) to service_role;

commit;
