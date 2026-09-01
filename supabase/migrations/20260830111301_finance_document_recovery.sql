-- A finance document can be edited only while it is an unlocked draft. Provider
-- failures are recovered separately so retrying never weakens the approval lock.
begin;

create or replace function public.multideck_finance_update_document_draft(
  p_company_id uuid,
  p_user_id uuid,
  p_document_id uuid,
  p_input jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_document public."FIN_Documents";
  v_type text;
  v_entity uuid;
  v_entity_currency text;
  v_party uuid;
  v_job uuid;
  v_job_company uuid;
  v_job_entity uuid;
  v_job_party uuid;
  v_date date;
  v_due date;
  v_currency text;
  v_exchange numeric;
  v_source_kind text;
  v_line jsonb;
  v_index integer := 0;
  v_quantity numeric;
  v_unit numeric;
  v_net numeric;
  v_tax numeric;
  v_gross numeric;
  v_total_net numeric := 0;
  v_total_tax numeric := 0;
  v_total_gross numeric := 0;
  v_line_id uuid;
  v_tax_status text;
begin
  if jsonb_typeof(p_input) <> 'object' then
    raise exception 'Finance input must be an object.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public."cmp_Users"
    where "User_ID" = p_user_id
      and "Company_ID" = p_company_id
      and coalesce("User_AccessStatus", 'active') = 'active'
  ) then
    raise exception 'The finance operator is outside this workspace.' using errcode = '42501';
  end if;

  select document.*
  into v_document
  from public."FIN_Documents" document
  join public."cmp_LegalEntities" entity on entity."LegalEntity_ID" = document."FINDoc_LegalEntityID"
  where document."FINDoc_ID" = p_document_id
    and entity."Company_ID" = p_company_id
  for update of document;
  if not found then
    raise exception 'Finance document not found in this workspace.' using errcode = 'P0002';
  end if;
  if v_document."FINDoc_StatusCode" <> 'draft'
    or v_document."FINDoc_IsLocked"
    or v_document."FINDoc_PostedAt" is not null then
    raise exception 'Only an unlocked draft can be edited.' using errcode = '22023';
  end if;

  v_type := v_document."FINDoc_TypeCode";
  v_entity := v_document."FINDoc_LegalEntityID";
  begin
    v_party := (p_input ->> 'partyOrgId')::uuid;
  exception when invalid_text_representation then
    raise exception 'Choose a valid customer or supplier.' using errcode = '22023';
  end;
  if not exists (select 1 from public."Org_Master" where "Org_id" = v_party) then
    raise exception 'Choose a valid customer or supplier.' using errcode = '22023';
  end if;

  select upper(entity."LegalEntity_BaseCurrencyCodeSnapshot")
  into v_entity_currency
  from public."cmp_LegalEntities" entity
  where entity."LegalEntity_ID" = v_entity
    and entity."Company_ID" = p_company_id
    and entity."LegalEntity_IsActive";
  if not found or v_entity_currency !~ '^[A-Z]{3}$' then
    raise exception 'Configure a valid base currency for this legal entity.' using errcode = '22023';
  end if;

  begin
    v_date := coalesce(nullif(p_input ->> 'documentDate', '')::date, current_date);
    v_due := nullif(p_input ->> 'dueDate', '')::date;
  exception when invalid_datetime_format then
    raise exception 'Check the document and due dates.' using errcode = '22023';
  end;
  if v_due is not null and v_due < v_date then
    raise exception 'The due date cannot be before the document date.' using errcode = '22023';
  end if;

  v_currency := upper(coalesce(nullif(btrim(p_input ->> 'currencyCode'), ''), v_entity_currency));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Enter a three-letter currency code.' using errcode = '22023';
  end if;
  begin
    v_exchange := coalesce(nullif(p_input ->> 'exchangeRate', '')::numeric, 1);
  exception when invalid_text_representation then
    raise exception 'Enter a valid exchange rate.' using errcode = '22023';
  end;
  if v_exchange::text in ('NaN', 'Infinity', '-Infinity')
    or v_exchange <= 0
    or (v_currency <> v_entity_currency and nullif(p_input ->> 'exchangeRate', '') is null) then
    raise exception 'Enter the reviewed exchange rate from document currency to base currency.' using errcode = '22023';
  end if;
  if v_currency = v_entity_currency then v_exchange := 1; end if;

  if nullif(p_input ->> 'sourceJobId', '') is not null then
    begin
      v_job := (p_input ->> 'sourceJobId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Choose a valid job.' using errcode = '22023';
    end;
    select office."Company_ID", job."Job_LegalEntityID",
      case when v_type in ('sl_invoice', 'credit_note') then job."Job_Customer" else job."Job_Supplier" end
    into v_job_company, v_job_entity, v_job_party
    from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    where job."Job_ID" = v_job and not job."Job_IsDeleted";
    if v_job_company is distinct from p_company_id
      or (v_job_entity is not null and v_job_entity is distinct from v_entity) then
      raise exception 'That job is outside the selected company or legal entity.' using errcode = '42501';
    end if;
    if v_job_party is null or v_job_party is distinct from v_party then
      raise exception 'The selected party must match the customer or supplier on the job.' using errcode = '22023';
    end if;
  end if;

  if jsonb_typeof(p_input -> 'lines') <> 'array'
    or jsonb_array_length(p_input -> 'lines') not between 1 and 100 then
    raise exception 'Add between one and 100 document lines.' using errcode = '22023';
  end if;

  delete from public."FIN_DocumentLines"
  where "FINDocLine_DocumentID" = p_document_id;

  v_source_kind := case when v_job is null then 'manual' else 'job' end;
  for v_line in select value from jsonb_array_elements(p_input -> 'lines') loop
    v_index := v_index + 1;
    begin
      v_quantity := coalesce(nullif(v_line ->> 'quantity', '')::numeric, 1);
      v_unit := coalesce(nullif(v_line ->> 'unitAmount', '')::numeric, 0);
    exception when invalid_text_representation then
      raise exception 'Check finance line %.', v_index using errcode = '22023';
    end;
    if v_quantity::text in ('NaN', 'Infinity', '-Infinity')
      or v_unit::text in ('NaN', 'Infinity', '-Infinity')
      or nullif(btrim(v_line ->> 'description'), '') is null
      or length(v_line ->> 'description') > 1000
      or nullif(btrim(v_line ->> 'chargeCode'), '') is null
      or length(v_line ->> 'chargeCode') > 80
      or length(coalesce(v_line ->> 'taxCode', '')) > 80
      or v_quantity <= 0
      or v_unit < 0 then
      raise exception 'Check finance line %.', v_index using errcode = '22023';
    end if;

    v_net := round(v_quantity * v_unit, 4) * case when v_type in ('credit_note', 'debit_note') then -1 else 1 end;
    insert into public."FIN_DocumentLines"(
      "FINDocLine_DocumentID", "FINDocLine_LineNo", "FINDocLine_LineTypeCode", "FINDocLine_ChargeCodeSnapshot", "FINDocLine_Description", "FINDocLine_Quantity", "FINDocLine_UnitAmount",
      "FINDocLine_NetAmount", "FINDocLine_TaxCodeSnapshot", "FINDocLine_TaxRatePercent", "FINDocLine_TaxAmount", "FINDocLine_GrossAmount",
      "FINDocLine_LocalNetAmount", "FINDocLine_LocalTaxAmount", "FINDocLine_LocalGrossAmount"
    ) values (
      p_document_id, v_index,
      case when v_job is not null then 'freight' when coalesce(v_line ->> 'lineType', '') = 'ancillary' then 'ancillary' else 'service' end,
      left(btrim(v_line ->> 'chargeCode'), 80), btrim(v_line ->> 'description'), v_quantity, v_unit,
      v_net, nullif(left(btrim(v_line ->> 'taxCode'), 80), ''), 0, 0, v_net,
      round(v_net * v_exchange, 4), 0, round(v_net * v_exchange, 4)
    ) returning "FINDocLine_ID", "FINDocLine_NetAmount", "FINDocLine_TaxAmount", "FINDocLine_GrossAmount"
    into v_line_id, v_net, v_tax, v_gross;

    if v_job is not null then
      insert into public."FIN_DocumentLineJobLinks"(
        "FINDocLineJob_DocumentID", "FINDocLineJob_DocumentLineID", "FINDocLineJob_JobID", "FINDocLineJob_LinkTypeCode", "FINDocLineJob_NetAmount", "FINDocLineJob_LocalNetAmount", "FINDocLineJob_PercentOfLine"
      ) values (p_document_id, v_line_id, v_job, 'source_job', v_net, round(v_net * v_exchange, 4), 100);
    end if;
    v_total_net := v_total_net + v_net;
    v_total_tax := v_total_tax + v_tax;
    v_total_gross := v_total_gross + v_gross;
  end loop;

  if abs(v_total_gross) <= 0 then
    raise exception 'The finance document gross amount must be greater than zero.' using errcode = '22023';
  end if;
  select case when bool_and(line."FINDocLine_TaxCodeID" is not null) then 'approved' else 'pending' end
  into v_tax_status
  from public."FIN_DocumentLines" line
  where line."FINDocLine_DocumentID" = p_document_id;

  update public."FIN_Documents"
  set "FINDoc_PartyOrgID" = v_party,
      "FINDoc_PartyRole" = case when v_type in ('sl_invoice', 'credit_note') then 'customer' else 'supplier' end,
      "FINDoc_DocumentDate" = v_date,
      "FINDoc_AccountingDate" = v_date,
      "FINDoc_DueDate" = v_due,
      "FINDoc_CurrencyCodeSnapshot" = v_currency,
      "FINDoc_ExchangeRate" = v_exchange,
      "FINDoc_SourceJobID" = v_job,
      "FINDoc_SourceTable" = case when v_job is null then null else 'Job_Header' end,
      "FINDoc_SourceID" = v_job,
      "FINDoc_SourceKindCode" = v_source_kind,
      "FINDoc_NetAmount" = v_total_net,
      "FINDoc_TaxAmount" = v_total_tax,
      "FINDoc_GrossAmount" = v_total_gross,
      "FINDoc_LocalNetAmount" = round(v_total_net * v_exchange, 4),
      "FINDoc_LocalTaxAmount" = round(v_total_tax * v_exchange, 4),
      "FINDoc_LocalGrossAmount" = round(v_total_gross * v_exchange, 4),
      "FINDoc_OutstandingAmount" = v_total_gross,
      "FINDoc_LocalOutstandingAmount" = round(v_total_gross * v_exchange, 4),
      "FINDoc_MetadataJSON" = jsonb_set(
        jsonb_set("FINDoc_MetadataJSON", '{sourceKind}', to_jsonb(v_source_kind), true),
        '{taxStatus}', to_jsonb(v_tax_status), true
      ),
      "FINDoc_UpdatedAt" = now(),
      "FINDoc_UpdatedBy" = p_user_id
  where "FINDoc_ID" = p_document_id;

  insert into public."FIN_DocumentStatusHistory"(
    "FINDocStatus_DocumentID", "FINDocStatus_FromStatusCode", "FINDocStatus_ToStatusCode", "FINDocStatus_ChangedBy", "FINDocStatus_Reason", "FINDocStatus_MetadataJSON"
  ) values (
    p_document_id, 'draft', 'draft', p_user_id, 'Draft edited in Multideck finance',
    jsonb_build_object('sourceKind', v_source_kind, 'jobId', v_job, 'taxStatus', v_tax_status)
  );
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode", "AuditEvent_UserID", "AuditEvent_LegalEntityID", "AuditEvent_SourceApp", "AuditEvent_SourceModule", "AuditEvent_SourceTableSchema", "AuditEvent_SourceTableName", "AuditEvent_RecordTypeCode", "AuditEvent_RecordID", "AuditEvent_Action", "AuditEvent_Title", "AuditEvent_MetadataJSON"
  ) values (
    'finance_lifecycle', p_user_id, v_entity, 'multideck-app', 'finance', 'public', 'FIN_Documents', v_type, p_document_id,
    'update_draft', 'Finance document draft updated',
    jsonb_build_object('grossAmount', v_total_gross, 'currency', v_currency, 'exchangeRate', v_exchange, 'taxStatus', v_tax_status)
  );
  return (select to_jsonb(document) from public."FIN_Documents" document where document."FINDoc_ID" = p_document_id);
end;
$$;

-- Reopening is the controlled escape hatch for rejected documents and approved
-- documents whose provider delivery is blocked or failed. It revokes the
-- approval and cancels the old queue item before any fields become editable.
create or replace function public.multideck_finance_reopen_document_draft(
  p_company_id uuid,
  p_user_id uuid,
  p_document_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_document public."FIN_Documents";
  v_reason text;
  v_cancelled integer := 0;
begin
  if not exists (
    select 1 from public."cmp_Users"
    where "User_ID" = p_user_id
      and "Company_ID" = p_company_id
      and coalesce("User_AccessStatus", 'active') = 'active'
  ) then
    raise exception 'The finance operator is outside this workspace.' using errcode = '42501';
  end if;
  select document.*
  into v_document
  from public."FIN_Documents" document
  join public."cmp_LegalEntities" entity on entity."LegalEntity_ID" = document."FINDoc_LegalEntityID"
  where document."FINDoc_ID" = p_document_id
    and entity."Company_ID" = p_company_id
  for update of document;
  if not found then
    raise exception 'Finance document not found in this workspace.' using errcode = 'P0002';
  end if;
  if v_document."FINDoc_PostedAt" is not null
    or v_document."FINDoc_PostingStatusCode" = 'posted'
    or v_document."FINDoc_StatusCode" = 'submitted' then
    raise exception 'A posted document is immutable and cannot be returned to draft.' using errcode = '22023';
  end if;
  if not (
    v_document."FINDoc_StatusCode" = 'rejected'
    or (
      v_document."FINDoc_StatusCode" = 'approved'
      and v_document."FINDoc_PostingStatusCode" in ('blocked', 'failed')
    )
  ) then
    raise exception 'Only a rejected or provider-blocked approved document can be returned to draft.' using errcode = '22023';
  end if;

  v_reason := coalesce(nullif(btrim(p_reason), ''), 'Returned to draft for correction');
  update public."FIN_IntegrationQueue"
  set "FINIntQ_StatusCode" = 'cancelled',
      "FINIntQ_LastError" = 'Approval revoked: ' || left(v_reason, 460)
  where "FINIntQ_LocalTable" = 'FIN_Documents'
    and "FINIntQ_LocalID" = p_document_id
    and "FINIntQ_StatusCode" in ('queued', 'processing', 'blocked', 'failed');
  get diagnostics v_cancelled = row_count;

  update public."ACCI_ReconciliationIssues"
  set "ACCIRI_StatusCode" = 'synced',
      "ACCIRI_ResolutionText" = 'Document returned to draft: ' || left(v_reason, 460),
      "ACCIRI_ResolvedAt" = now(),
      "ACCIRI_ResolvedBy" = p_user_id
  where "ACCIRI_LocalTable" = 'FIN_Documents'
    and "ACCIRI_LocalID" = p_document_id
    and "ACCIRI_StatusCode" <> 'synced';

  update public."FIN_Documents"
  set "FINDoc_StatusCode" = 'draft',
      "FINDoc_PostingStatusCode" = 'draft',
      "FINDoc_ExportStatusCode" = 'not_queued',
      "FINDoc_ExportBatchID" = null,
      "FINDoc_IsLocked" = false,
      "FINDoc_PostedAt" = null,
      "FINDoc_PostedBy" = null,
      "FINDoc_UpdatedAt" = now(),
      "FINDoc_UpdatedBy" = p_user_id
  where "FINDoc_ID" = p_document_id;

  insert into public."FIN_DocumentStatusHistory"(
    "FINDocStatus_DocumentID", "FINDocStatus_FromStatusCode", "FINDocStatus_ToStatusCode", "FINDocStatus_ChangedBy", "FINDocStatus_Reason", "FINDocStatus_MetadataJSON"
  ) values (
    p_document_id, v_document."FINDoc_StatusCode", 'draft', p_user_id, v_reason,
    jsonb_build_object('priorPostingStatus', v_document."FINDoc_PostingStatusCode", 'cancelledQueueItems', v_cancelled, 'approvalRevoked', true)
  );
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode", "AuditEvent_UserID", "AuditEvent_LegalEntityID", "AuditEvent_SourceApp", "AuditEvent_SourceModule", "AuditEvent_SourceTableSchema", "AuditEvent_SourceTableName", "AuditEvent_RecordTypeCode", "AuditEvent_RecordID", "AuditEvent_Action", "AuditEvent_Title", "AuditEvent_MetadataJSON"
  ) values (
    'finance_lifecycle', p_user_id, v_document."FINDoc_LegalEntityID", 'multideck-app', 'finance', 'public', 'FIN_Documents', v_document."FINDoc_TypeCode", p_document_id,
    'reopen_draft', 'Finance document approval revoked and returned to draft',
    jsonb_build_object('from', v_document."FINDoc_StatusCode", 'priorPostingStatus', v_document."FINDoc_PostingStatusCode", 'cancelledQueueItems', v_cancelled, 'reason', v_reason)
  );
  return (select to_jsonb(document) from public."FIN_Documents" document where document."FINDoc_ID" = p_document_id);
end;
$$;

revoke all on function public.multideck_finance_update_document_draft(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_finance_reopen_document_draft(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.multideck_finance_update_document_draft(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_finance_reopen_document_draft(uuid, uuid, uuid, text) to service_role;

-- Dexter can explain the provider evidence and give the exact recovery route.
-- The sensitive retry and approval-revocation controls remain manual-only.
create or replace function public.multideck_dexter_domain_finance(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with records as (
    select
      document."FINDoc_ID" record_id,
      document."FINDoc_UpdatedAt" updated_at,
      concat_ws(' ', document."FINDoc_Number", document."FINDoc_TypeCode", document."FINDoc_StatusCode", document."FINDoc_PostingStatusCode", organisation."Org_Name", job."Job_Number", queue."FINIntQ_LastError") search_text,
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', document."FINDoc_ID", 'recordKind', 'document', 'number', document."FINDoc_Number", 'type', document."FINDoc_TypeCode",
        'ledger', case when document."FINDoc_TypeCode" in ('sl_invoice', 'credit_note') then 'receivables' else 'payables' end,
        'status', document."FINDoc_StatusCode", 'party', organisation."Org_Name", 'currency', document."FINDoc_CurrencyCodeSnapshot",
        'netAmount', document."FINDoc_NetAmount", 'taxAmount', document."FINDoc_TaxAmount", 'grossAmount', document."FINDoc_GrossAmount",
        'outstandingAmount', document."FINDoc_OutstandingAmount", 'documentDate', document."FINDoc_DocumentDate", 'dueDate', document."FINDoc_DueDate",
        'sourceKind', document."FINDoc_SourceKindCode", 'jobReference', case when job."Job_ID" is null then null else job."Job_Period" || '-' || job."Job_Number" end,
        'taxStatus', coalesce(document."FINDoc_MetadataJSON" ->> 'taxStatus', 'pending'),
        'postingStatus', document."FINDoc_PostingStatusCode", 'exportStatus', document."FINDoc_ExportStatusCode",
        'postingError', queue."FINIntQ_LastError", 'postingAttemptCount', queue."FINIntQ_AttemptCount", 'postingLastAttemptAt', queue."FINIntQ_LastAttemptAt",
        'recoveryRoute', '/finance/' || case when document."FINDoc_TypeCode" in ('sl_invoice', 'credit_note') then 'receivables' else 'payables' end || '/documents/' || document."FINDoc_ID",
        'recoveryActions', case
          when document."FINDoc_StatusCode" = 'approved' and document."FINDoc_PostingStatusCode" in ('blocked', 'failed')
            then jsonb_build_array('fix_provider_setup', 'retry_posting', 'return_to_draft')
          when document."FINDoc_StatusCode" = 'rejected' then jsonb_build_array('return_to_draft')
          else '[]'::jsonb
        end,
        'evidence', jsonb_build_object('sourceTable', 'FIN_Documents', 'sourceId', document."FINDoc_ID", 'legalEntityId', document."FINDoc_LegalEntityID", 'integrationQueueId', queue."FINIntQ_ID")
      )) value
    from public."FIN_Documents" document
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID" = document."FINDoc_LegalEntityID"
    left join public."Org_Master" organisation on organisation."Org_id" = document."FINDoc_PartyOrgID"
    left join public."Job_Header" job on job."Job_ID" = document."FINDoc_SourceJobID"
    left join lateral (
      select integration_queue."FINIntQ_ID", integration_queue."FINIntQ_AttemptCount", integration_queue."FINIntQ_LastAttemptAt", integration_queue."FINIntQ_LastError"
      from public."FIN_IntegrationQueue" integration_queue
      where integration_queue."FINIntQ_LocalTable" = 'FIN_Documents'
        and integration_queue."FINIntQ_LocalID" = document."FINDoc_ID"
      order by integration_queue."FINIntQ_CreatedAt" desc
      limit 1
    ) queue on true
    where entity."Company_ID" = p_company_id

    union all

    select
      cash."FINCash_ID", cash."FINCash_UpdatedAt",
      concat_ws(' ', cash."FINCash_Number", cash."FINCash_TypeCode", cash."FINCash_StatusCode", organisation."Org_Name", cash."FINCash_Reference"),
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', cash."FINCash_ID", 'recordKind', 'cash', 'number', cash."FINCash_Number", 'type', cash."FINCash_TypeCode",
        'ledger', case when cash."FINCash_TypeCode" = 'customer_receipt' then 'receivables' else 'payables' end,
        'status', cash."FINCash_StatusCode", 'party', organisation."Org_Name", 'currency', cash."FINCash_CurrencyCodeSnapshot",
        'amount', cash."FINCash_Amount", 'unallocatedAmount', cash."FINCash_UnallocatedAmount", 'transactionDate', cash."FINCash_TransactionDate",
        'reference', cash."FINCash_Reference", 'postingStatus', cash."FINCash_PostingStatusCode",
        'evidence', jsonb_build_object('sourceTable', 'FIN_CashTransactions', 'sourceId', cash."FINCash_ID", 'legalEntityId', cash."FINCash_LegalEntityID")
      ))
    from public."FIN_CashTransactions" cash
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID" = cash."FINCash_LegalEntityID"
    left join public."Org_Master" organisation on organisation."Org_id" = cash."FINCash_PartyOrgID"
    where entity."Company_ID" = p_company_id

    union all

    select
      revision."FINAdminRevision_ID", revision."FINAdminRevision_ApprovedAt",
      concat_ws(' ', 'finance settings administration', entity."LegalEntity_Name", entity."LegalEntity_BaseCurrencyCodeSnapshot", entity."LegalEntity_CountryCode", entity."LegalEntity_SettingsJSON" #>> '{financeProvider,providerCode}'),
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', revision."FINAdminRevision_ID", 'recordKind', 'configuration', 'legalEntityId', entity."LegalEntity_ID",
        'legalEntity', entity."LegalEntity_Name", 'baseCurrency', entity."LegalEntity_BaseCurrencyCodeSnapshot", 'country', entity."LegalEntity_CountryCode",
        'provider', entity."LegalEntity_SettingsJSON" #>> '{financeProvider,providerCode}', 'revision', revision."FINAdminRevision_Number",
        'readiness', revision."FINAdminRevision_ReadinessJSON", 'approvedAt', revision."FINAdminRevision_ApprovedAt",
        'evidence', jsonb_build_object('sourceTable', 'FIN_AdministrationRevisions', 'sourceId', revision."FINAdminRevision_ID", 'legalEntityId', entity."LegalEntity_ID")
      ))
    from public."FIN_AdministrationRevisions" revision
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID" = revision."FINAdminRevision_LegalEntityID"
    where entity."Company_ID" = p_company_id and revision."FINAdminRevision_StatusCode" = 'approved'
  )
  select coalesce(jsonb_agg(value order by updated_at desc), '[]'::jsonb)
  from (
    select value, updated_at
    from records
    where nullif(btrim(p_search), '') is null or search_text ilike '%' || btrim(p_search) || '%'
    order by updated_at desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) bounded;
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid, text, integer) from public, anon, authenticated;

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" = 'Event-driven finance document, tax-readiness, receipt, payment, allocation, provider-sync, recovery and approved configuration changes.',
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'finance';

commit;
