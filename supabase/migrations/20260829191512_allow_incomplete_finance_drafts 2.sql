-- Draft capture remains deliberately more permissive than finance review. Operators
-- may record work before statutory tax setup is approved, but no client-supplied
-- rate is trusted and the document cannot enter review until every line resolves
-- to one approved, effective treatment and the legal-entity currency is active.

begin;

create or replace function public._multideck_finance_apply_approved_line_tax()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_legal_entity_id uuid;
  v_document_type text;
  v_document_status text;
  v_document_date date;
  v_exchange_rate numeric;
  v_direction text;
  v_match_count integer := 0;
  v_tax_id uuid;
  v_tax_code text;
  v_tax_rate numeric := 0;
  v_sign numeric;
  v_net numeric;
  v_tax numeric;
  v_has_approved_tax_advice boolean := false;
begin
  select
    document."FINDoc_LegalEntityID",
    document."FINDoc_TypeCode",
    document."FINDoc_StatusCode",
    document."FINDoc_DocumentDate",
    document."FINDoc_ExchangeRate"
  into
    v_legal_entity_id,
    v_document_type,
    v_document_status,
    v_document_date,
    v_exchange_rate
  from public."FIN_Documents" document
  where document."FINDoc_ID" = new."FINDocLine_DocumentID";

  if v_legal_entity_id is null then
    raise exception 'The finance document for this line does not exist.' using errcode = 'P0002';
  end if;
  if new."FINDocLine_Quantity" <= 0 or new."FINDocLine_UnitAmount" < 0 then
    raise exception 'Check the finance line quantity and unit amount.' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public."FIN_AdministrationRevisions" revision
    where revision."FINAdminRevision_LegalEntityID" = v_legal_entity_id
      and revision."FINAdminRevision_StatusCode" = 'approved'
      and coalesce(revision."FINAdminRevision_ConfigJSON" #>> '{taxSettings,localAdviceConfirmed}', 'false') = 'true'
  ) into v_has_approved_tax_advice;

  new."FINDocLine_TaxCodeSnapshot" := nullif(left(btrim(new."FINDocLine_TaxCodeSnapshot"), 80), '');
  v_direction := case when v_document_type in ('sl_invoice', 'credit_note') then 'sales' else 'purchase' end;

  if v_has_approved_tax_advice and new."FINDocLine_TaxCodeSnapshot" is not null then
    select
      count(*),
      (array_agg(tax."FINTax_ID" order by tax."FINTax_EffectiveFrom" desc))[1],
      (array_agg(tax."FINTax_Code" order by tax."FINTax_EffectiveFrom" desc))[1],
      (array_agg(tax."FINTax_RatePercent" order by tax."FINTax_EffectiveFrom" desc))[1]
    into v_match_count, v_tax_id, v_tax_code, v_tax_rate
    from public."FIN_TaxCodes" tax
    where tax."FINTax_LegalEntityID" = v_legal_entity_id
      and tax."FINTax_Code" = new."FINDocLine_TaxCodeSnapshot"
      and tax."FINTax_IsActive"
      and tax."FINTax_ApprovedAt" is not null
      and tax."FINTax_TransactionTypeCode" in ('both', v_direction)
      and tax."FINTax_EffectiveFrom" <= v_document_date
      and (tax."FINTax_EffectiveTo" is null or tax."FINTax_EffectiveTo" >= v_document_date);

    if v_match_count > 1 then
      raise exception 'The selected tax treatment has overlapping effective rules. Finance must correct the setup.' using errcode = '22023';
    end if;
  end if;

  if v_match_count = 1 then
    new."FINDocLine_TaxCodeID" := v_tax_id;
    new."FINDocLine_TaxCodeSnapshot" := v_tax_code;
    new."FINDocLine_TaxRatePercent" := v_tax_rate;
  else
    if v_document_status <> 'draft' then
      if not v_has_approved_tax_advice then
        raise exception 'Finance must approve local tax advice before this document can enter review.' using errcode = '22023';
      end if;
      raise exception 'Every finance line must use one approved effective tax treatment before review.' using errcode = '22023';
    end if;

    -- A pending line is unmistakable: it has no approved treatment id and no
    -- tax amount. A provisional classification may be retained for later
    -- resolution, but it is not treated as an approved zero-rate decision.
    new."FINDocLine_TaxCodeID" := null;
    new."FINDocLine_TaxRatePercent" := 0;
    v_tax_rate := 0;
  end if;

  v_sign := case when v_document_type in ('credit_note', 'debit_note') then -1 else 1 end;
  v_net := round(new."FINDocLine_Quantity" * new."FINDocLine_UnitAmount", 4) * v_sign;
  v_tax := round(abs(v_net) * v_tax_rate / 100, 4) * v_sign;

  new."FINDocLine_NetAmount" := v_net;
  new."FINDocLine_TaxAmount" := v_tax;
  new."FINDocLine_GrossAmount" := v_net + v_tax;
  new."FINDocLine_LocalNetAmount" := round(v_net * v_exchange_rate, 4);
  new."FINDocLine_LocalTaxAmount" := round(v_tax * v_exchange_rate, 4);
  new."FINDocLine_LocalGrossAmount" := round((v_net + v_tax) * v_exchange_rate, 4);
  return new;
end;
$$;

create or replace function public.multideck_finance_create_document_draft(
  p_company_id uuid,
  p_user_id uuid,
  p_input jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_type text := p_input ->> 'type';
  v_entity uuid;
  v_entity_currency text;
  v_entity_currency_status text;
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
  v_number text;
  v_document uuid;
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
  v_idempotency uuid;
  v_idempotent_company uuid;
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
  if v_type not in ('sl_invoice', 'credit_note', 'pl_invoice', 'debit_note') then
    raise exception 'Choose a supported finance document type.' using errcode = '22023';
  end if;

  begin
    v_entity := (p_input ->> 'legalEntityId')::uuid;
    v_party := (p_input ->> 'partyOrgId')::uuid;
  exception when invalid_text_representation then
    raise exception 'Choose a valid legal entity and party.' using errcode = '22023';
  end;

  select upper(entity."LegalEntity_BaseCurrencyCodeSnapshot")
  into v_entity_currency
  from public."cmp_LegalEntities" entity
  where entity."LegalEntity_ID" = v_entity
    and entity."Company_ID" = p_company_id
    and entity."LegalEntity_IsActive";
  if not found then
    raise exception 'That legal entity is not active in this workspace.' using errcode = '42501';
  end if;

  if v_entity_currency ~ '^[A-Z]{3}$' then
    v_entity_currency_status := 'approved';
  else
    select upper(run."FINConfigRun_PreviewJSON" #>> '{providerPreflight,baseCurrencyCode}')
    into v_entity_currency
    from public."FIN_ConfigurationRuns" run
    where run."FINConfigRun_LegalEntityID" = v_entity
      and run."FINConfigRun_StatusCode" = 'awaiting_approval'
      and run."FINConfigRun_ProviderCode" = run."FINConfigRun_PreviewJSON" #>> '{providerPreflight,providerCode}'
      and run."FINConfigRun_ExternalCompany" = run."FINConfigRun_PreviewJSON" #>> '{providerPreflight,externalCompany}'
      and coalesce((run."FINConfigRun_PreviewJSON" #>> '{providerPreflight,providerRecordsChanged}')::boolean, false) = false
      and upper(coalesce(run."FINConfigRun_PreviewJSON" #>> '{providerPreflight,baseCurrencyCode}', '')) ~ '^[A-Z]{3}$'
      and run."FINConfigRun_RequestedAt" >= now() - interval '24 hours'
    order by run."FINConfigRun_RequestedAt" desc
    limit 1;
    if v_entity_currency is null then
      raise exception 'Approve or prepare a current accounting Company currency review before creating this draft.' using errcode = '22023';
    end if;
    v_entity_currency_status := 'pending_configuration';
  end if;

  if not exists (select 1 from public."Org_Master" where "Org_id" = v_party) then
    raise exception 'Choose a valid customer or supplier.' using errcode = '22023';
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
    select
      office."Company_ID",
      job."Job_LegalEntityID",
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
  begin
    v_idempotency := coalesce(nullif(p_input ->> 'idempotencyKey', '')::uuid, gen_random_uuid());
  exception when invalid_text_representation then
    raise exception 'The finance request key is invalid.' using errcode = '22023';
  end;

  select document."FINDoc_ID", entity."Company_ID"
  into v_document, v_idempotent_company
  from public."FIN_Documents" document
  join public."cmp_LegalEntities" entity on entity."LegalEntity_ID" = document."FINDoc_LegalEntityID"
  where document."FINDoc_IdempotencyKey" = v_idempotency;
  if v_document is not null and v_idempotent_company is distinct from p_company_id then
    raise exception 'The finance request key belongs to another workspace.' using errcode = '42501';
  end if;
  if v_document is not null then
    return (select to_jsonb(document) from public."FIN_Documents" document where document."FINDoc_ID" = v_document);
  end if;

  v_source_kind := case when v_job is null then 'manual' else 'job' end;
  v_number := public._multideck_finance_next_number(v_entity, v_type);
  insert into public."FIN_Documents"(
    "FINDoc_TypeCode", "FINDoc_StatusCode", "FINDoc_Number", "FINDoc_LegalEntityID", "FINDoc_PartyOrgID", "FINDoc_PartyRole",
    "FINDoc_DocumentDate", "FINDoc_AccountingDate", "FINDoc_DueDate", "FINDoc_CurrencyCodeSnapshot", "FINDoc_SourceJobID", "FINDoc_SourceTable", "FINDoc_SourceID",
    "FINDoc_SourceKindCode", "FINDoc_IdempotencyKey", "FINDoc_ExchangeRate", "FINDoc_MetadataJSON", "FINDoc_CreatedBy", "FINDoc_UpdatedBy"
  ) values (
    v_type, 'draft', v_number, v_entity, v_party, case when v_type in ('sl_invoice', 'credit_note') then 'customer' else 'supplier' end,
    v_date, v_date, v_due, v_currency, v_job, case when v_job is null then null else 'Job_Header' end, v_job,
    v_source_kind, v_idempotency, v_exchange,
    jsonb_build_object('source', 'multideck_finance', 'sourceKind', v_source_kind, 'baseCurrency', v_entity_currency, 'baseCurrencyStatus', v_entity_currency_status, 'taxStatus', 'pending'),
    p_user_id, p_user_id
  ) returning "FINDoc_ID" into v_document;

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

    -- The rate is always zero at the RPC boundary. The line trigger resolves
    -- the approved statutory rate when one exists and otherwise keeps it pending.
    v_net := round(v_quantity * v_unit, 4) * case when v_type in ('credit_note', 'debit_note') then -1 else 1 end;
    insert into public."FIN_DocumentLines"(
      "FINDocLine_DocumentID", "FINDocLine_LineNo", "FINDocLine_LineTypeCode", "FINDocLine_ChargeCodeSnapshot", "FINDocLine_Description", "FINDocLine_Quantity", "FINDocLine_UnitAmount",
      "FINDocLine_NetAmount", "FINDocLine_TaxCodeSnapshot", "FINDocLine_TaxRatePercent", "FINDocLine_TaxAmount", "FINDocLine_GrossAmount",
      "FINDocLine_LocalNetAmount", "FINDocLine_LocalTaxAmount", "FINDocLine_LocalGrossAmount"
    ) values (
      v_document, v_index,
      case when v_job is not null then 'freight' when coalesce(v_line ->> 'lineType', '') = 'ancillary' then 'ancillary' else 'service' end,
      left(btrim(v_line ->> 'chargeCode'), 80), btrim(v_line ->> 'description'), v_quantity, v_unit,
      v_net, nullif(left(btrim(v_line ->> 'taxCode'), 80), ''), 0, 0, v_net,
      round(v_net * v_exchange, 4), 0, round(v_net * v_exchange, 4)
    ) returning
      "FINDocLine_ID", "FINDocLine_NetAmount", "FINDocLine_TaxAmount", "FINDocLine_GrossAmount"
    into v_line_id, v_net, v_tax, v_gross;

    if v_job is not null then
      insert into public."FIN_DocumentLineJobLinks"(
        "FINDocLineJob_DocumentID", "FINDocLineJob_DocumentLineID", "FINDocLineJob_JobID", "FINDocLineJob_LinkTypeCode", "FINDocLineJob_NetAmount", "FINDocLineJob_LocalNetAmount", "FINDocLineJob_PercentOfLine"
      ) values (v_document, v_line_id, v_job, 'source_job', v_net, round(v_net * v_exchange, 4), 100);
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
  where line."FINDocLine_DocumentID" = v_document;

  update public."FIN_Documents"
  set "FINDoc_NetAmount" = v_total_net,
      "FINDoc_TaxAmount" = v_total_tax,
      "FINDoc_GrossAmount" = v_total_gross,
      "FINDoc_LocalNetAmount" = round(v_total_net * v_exchange, 4),
      "FINDoc_LocalTaxAmount" = round(v_total_tax * v_exchange, 4),
      "FINDoc_LocalGrossAmount" = round(v_total_gross * v_exchange, 4),
      "FINDoc_OutstandingAmount" = v_total_gross,
      "FINDoc_LocalOutstandingAmount" = round(v_total_gross * v_exchange, 4),
      "FINDoc_MetadataJSON" = jsonb_set("FINDoc_MetadataJSON", '{taxStatus}', to_jsonb(v_tax_status), true),
      "FINDoc_UpdatedAt" = now()
  where "FINDoc_ID" = v_document;

  insert into public."FIN_DocumentStatusHistory"(
    "FINDocStatus_DocumentID", "FINDocStatus_ToStatusCode", "FINDocStatus_ChangedBy", "FINDocStatus_Reason", "FINDocStatus_MetadataJSON"
  ) values (
    v_document, 'draft', p_user_id, 'Created in Multideck finance',
    jsonb_build_object('sourceKind', v_source_kind, 'jobId', v_job, 'taxStatus', v_tax_status, 'baseCurrencyStatus', v_entity_currency_status)
  );
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode", "AuditEvent_UserID", "AuditEvent_LegalEntityID", "AuditEvent_SourceApp", "AuditEvent_SourceModule", "AuditEvent_SourceTableSchema", "AuditEvent_SourceTableName", "AuditEvent_RecordTypeCode", "AuditEvent_RecordID", "AuditEvent_Action", "AuditEvent_Title", "AuditEvent_MetadataJSON"
  ) values (
    'finance_lifecycle', p_user_id, v_entity, 'multideck-app', 'finance', 'public', 'FIN_Documents', v_type, v_document,
    'create_draft', 'Finance document draft created',
    jsonb_build_object('number', v_number, 'sourceKind', v_source_kind, 'grossAmount', v_total_gross, 'currency', v_currency, 'exchangeRate', v_exchange, 'taxStatus', v_tax_status, 'baseCurrencyStatus', v_entity_currency_status)
  );
  return (select to_jsonb(document) from public."FIN_Documents" document where document."FINDoc_ID" = v_document);
end;
$$;

create or replace function public.multideck_finance_transition_document(
  p_company_id uuid,
  p_user_id uuid,
  p_document_id uuid,
  p_transition text,
  p_reason text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_document public."FIN_Documents";
  v_entity_currency text;
  v_next text;
  v_queue uuid;
  v_line_count integer;
  v_line_net numeric;
  v_line_tax numeric;
  v_line_gross numeric;
  v_local_line_net numeric;
  v_local_line_tax numeric;
  v_local_line_gross numeric;
  v_tax_status text;
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
  where document."FINDoc_ID" = p_document_id and entity."Company_ID" = p_company_id
  for update of document;
  if not found then
    raise exception 'Finance document not found in this workspace.' using errcode = 'P0002';
  end if;

  if p_transition = 'request_review' and v_document."FINDoc_StatusCode" = 'draft' then v_next := 'awaiting_approval';
  elsif p_transition = 'approve' and v_document."FINDoc_StatusCode" = 'awaiting_approval' then v_next := 'approved';
  elsif p_transition = 'reject' and v_document."FINDoc_StatusCode" = 'awaiting_approval' then v_next := 'rejected';
  else
    raise exception 'That finance document transition is not available from its current status.' using errcode = '22023';
  end if;

  if v_next = 'awaiting_approval' then
    -- Re-resolve provisional classifications against the now-approved setup.
    -- The line trigger owns the rate and all derived amounts.
    update public."FIN_DocumentLines"
    set "FINDocLine_TaxCodeSnapshot" = "FINDocLine_TaxCodeSnapshot"
    where "FINDocLine_DocumentID" = p_document_id
      and "FINDocLine_TaxCodeID" is null
      and nullif(btrim("FINDocLine_TaxCodeSnapshot"), '') is not null;

    select
      count(*),
      coalesce(sum("FINDocLine_NetAmount"), 0),
      coalesce(sum("FINDocLine_TaxAmount"), 0),
      coalesce(sum("FINDocLine_GrossAmount"), 0),
      coalesce(sum("FINDocLine_LocalNetAmount"), 0),
      coalesce(sum("FINDocLine_LocalTaxAmount"), 0),
      coalesce(sum("FINDocLine_LocalGrossAmount"), 0),
      case when bool_and("FINDocLine_TaxCodeID" is not null) then 'approved' else 'pending' end
    into
      v_line_count, v_line_net, v_line_tax, v_line_gross,
      v_local_line_net, v_local_line_tax, v_local_line_gross, v_tax_status
    from public."FIN_DocumentLines"
    where "FINDocLine_DocumentID" = p_document_id;

    update public."FIN_Documents"
    set "FINDoc_NetAmount" = v_line_net,
        "FINDoc_TaxAmount" = v_line_tax,
        "FINDoc_GrossAmount" = v_line_gross,
        "FINDoc_LocalNetAmount" = v_local_line_net,
        "FINDoc_LocalTaxAmount" = v_local_line_tax,
        "FINDoc_LocalGrossAmount" = v_local_line_gross,
        "FINDoc_OutstandingAmount" = v_line_gross,
        "FINDoc_LocalOutstandingAmount" = v_local_line_gross,
        "FINDoc_MetadataJSON" = jsonb_set("FINDoc_MetadataJSON", '{taxStatus}', to_jsonb(v_tax_status), true),
        "FINDoc_UpdatedAt" = now(),
        "FINDoc_UpdatedBy" = p_user_id
    where "FINDoc_ID" = p_document_id;

    select document.* into v_document
    from public."FIN_Documents" document
    where document."FINDoc_ID" = p_document_id;

    if v_tax_status <> 'approved' then
      raise exception 'Finance must approve local tax advice and every line must use an approved effective treatment before review.' using errcode = '22023';
    end if;
  end if;

  if v_next in ('awaiting_approval', 'approved') then
    select upper("LegalEntity_BaseCurrencyCodeSnapshot")
    into v_entity_currency
    from public."cmp_LegalEntities"
    where "LegalEntity_ID" = v_document."FINDoc_LegalEntityID"
      and "Company_ID" = p_company_id
      and "LegalEntity_IsActive";
    if not found or v_entity_currency is null or v_entity_currency !~ '^[A-Z]{3}$' then
      raise exception 'Configure a valid base currency for this legal entity.' using errcode = '22023';
    end if;
    if upper(coalesce(v_document."FINDoc_CurrencyCodeSnapshot", '')) !~ '^[A-Z]{3}$' then
      raise exception 'The finance document has no valid transaction currency.' using errcode = '22023';
    end if;
    if v_document."FINDoc_ExchangeRate"::text in ('NaN', 'Infinity', '-Infinity')
      or v_document."FINDoc_ExchangeRate" <= 0
      or (upper(v_document."FINDoc_CurrencyCodeSnapshot") = v_entity_currency and v_document."FINDoc_ExchangeRate" <> 1) then
      raise exception 'The finance document has no valid reviewed exchange rate.' using errcode = '22023';
    end if;
    if v_document."FINDoc_DueDate" is not null and v_document."FINDoc_DueDate" < v_document."FINDoc_DocumentDate" then
      raise exception 'The due date cannot be before the document date.' using errcode = '22023';
    end if;
    if v_document."FINDoc_GrossAmount" = 0
      or (v_document."FINDoc_TypeCode" in ('credit_note', 'debit_note') and v_document."FINDoc_GrossAmount" >= 0)
      or (v_document."FINDoc_TypeCode" in ('sl_invoice', 'pl_invoice') and v_document."FINDoc_GrossAmount" <= 0) then
      raise exception 'The finance document amount has the wrong invoice or credit polarity.' using errcode = '22023';
    end if;
    if not exists (select 1 from public."Org_Master" where "Org_id" = v_document."FINDoc_PartyOrgID") then
      raise exception 'The finance document customer or supplier is no longer available.' using errcode = '22023';
    end if;
    if v_document."FINDoc_SourceKindCode" = 'job' and not exists (
      select 1
      from public."Job_Header" job
      join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
      where job."Job_ID" = v_document."FINDoc_SourceJobID"
        and not job."Job_IsDeleted"
        and office."Company_ID" = p_company_id
        and (job."Job_LegalEntityID" is null or job."Job_LegalEntityID" = v_document."FINDoc_LegalEntityID")
        and case when v_document."FINDoc_TypeCode" in ('sl_invoice', 'credit_note') then job."Job_Customer" else job."Job_Supplier" end = v_document."FINDoc_PartyOrgID"
    ) then
      raise exception 'The job, legal entity and customer or supplier no longer match.' using errcode = '22023';
    end if;

    select
      count(*),
      coalesce(sum("FINDocLine_NetAmount"), 0),
      coalesce(sum("FINDocLine_TaxAmount"), 0),
      coalesce(sum("FINDocLine_GrossAmount"), 0)
    into v_line_count, v_line_net, v_line_tax, v_line_gross
    from public."FIN_DocumentLines"
    where "FINDocLine_DocumentID" = p_document_id;
    if v_line_count not between 1 and 100
      or v_line_net is distinct from v_document."FINDoc_NetAmount"
      or v_line_tax is distinct from v_document."FINDoc_TaxAmount"
      or v_line_gross is distinct from v_document."FINDoc_GrossAmount" then
      raise exception 'The finance document header no longer agrees with its lines.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public."FIN_DocumentLines"
      where "FINDocLine_DocumentID" = p_document_id
        and (
          nullif(btrim("FINDocLine_Description"), '') is null
          or nullif(btrim("FINDocLine_ChargeCodeSnapshot"), '') is null
          or "FINDocLine_Quantity" <= 0
          or "FINDocLine_UnitAmount" < 0
          or "FINDocLine_TaxCodeID" is null
          or "FINDocLine_TaxRatePercent" not between 0 and 100
        )
    ) then
      raise exception 'One or more finance document lines are incomplete.' using errcode = '22023';
    end if;
  end if;

  update public."FIN_Documents"
  set "FINDoc_StatusCode" = v_next,
      "FINDoc_PostingStatusCode" = case when v_next = 'approved' then 'queued' else "FINDoc_PostingStatusCode" end,
      "FINDoc_ExportStatusCode" = case when v_next = 'approved' then 'queued' else "FINDoc_ExportStatusCode" end,
      "FINDoc_UpdatedAt" = now(),
      "FINDoc_UpdatedBy" = p_user_id
  where "FINDoc_ID" = p_document_id;

  if v_next = 'awaiting_approval' then
    insert into public."FIN_AuthorisationRequests"(
      "FINAUTHREQ_ActionTypeCode", "FINAUTHREQ_SourceTable", "FINAUTHREQ_SourceID", "FINAUTHREQ_DocumentID", "FINAUTHREQ_RequestedBy", "FINAUTHREQ_Amount", "FINAUTHREQ_CurrencyCodeSnapshot", "FINAUTHREQ_Reason"
    ) values (
      'finance_post', 'FIN_Documents', p_document_id, p_document_id, p_user_id,
      v_document."FINDoc_GrossAmount", v_document."FINDoc_CurrencyCodeSnapshot", coalesce(nullif(btrim(p_reason), ''), 'Finance review requested')
    );
  elsif v_next = 'approved' then
    insert into public."FIN_IntegrationQueue"(
      "FINIntQ_LocalTable", "FINIntQ_LocalID", "FINIntQ_DocumentID", "FINIntQ_StatusCode", "FINIntQ_CreatedBy"
    ) values ('FIN_Documents', p_document_id, p_document_id, 'queued', p_user_id)
    on conflict ("FINIntQ_LocalTable", "FINIntQ_LocalID")
      where "FINIntQ_StatusCode" in ('queued', 'processing', 'blocked')
    do update set "FINIntQ_StatusCode" = 'queued', "FINIntQ_LastError" = null
    returning "FINIntQ_ID" into v_queue;
  end if;

  if v_next in ('approved', 'rejected') then
    with resolved as (
      update public."FIN_AuthorisationRequests"
      set "FINAUTHREQ_StatusCode" = v_next
      where "FINAUTHREQ_SourceTable" = 'FIN_Documents'
        and "FINAUTHREQ_SourceID" = p_document_id
        and "FINAUTHREQ_StatusCode" = 'awaiting_approval'
      returning "FINAUTHREQ_ID"
    )
    insert into public."FIN_AuthorisationDecisions"(
      "FINAUTHDEC_RequestID", "FINAUTHDEC_DecisionCode", "FINAUTHDEC_DecidedBy", "FINAUTHDEC_Comments", "FINAUTHDEC_MetadataJSON"
    )
    select "FINAUTHREQ_ID", v_next, p_user_id, nullif(btrim(p_reason), ''), jsonb_build_object('transition', p_transition)
    from resolved;
  end if;

  insert into public."FIN_DocumentStatusHistory"(
    "FINDocStatus_DocumentID", "FINDocStatus_FromStatusCode", "FINDocStatus_ToStatusCode", "FINDocStatus_ChangedBy", "FINDocStatus_Reason", "FINDocStatus_MetadataJSON"
  ) values (
    p_document_id, v_document."FINDoc_StatusCode", v_next, p_user_id, nullif(btrim(p_reason), ''), jsonb_build_object('integrationQueueId', v_queue)
  );
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode", "AuditEvent_UserID", "AuditEvent_LegalEntityID", "AuditEvent_SourceApp", "AuditEvent_SourceModule", "AuditEvent_SourceTableSchema", "AuditEvent_SourceTableName", "AuditEvent_RecordTypeCode", "AuditEvent_RecordID", "AuditEvent_Action", "AuditEvent_Title", "AuditEvent_MetadataJSON"
  ) values (
    'finance_lifecycle', p_user_id, v_document."FINDoc_LegalEntityID", 'multideck-app', 'finance', 'public', 'FIN_Documents', v_document."FINDoc_TypeCode", p_document_id,
    p_transition, 'Finance document status changed', jsonb_build_object('from', v_document."FINDoc_StatusCode", 'to', v_next, 'integrationQueueId', v_queue)
  );
  return (select to_jsonb(document) from public."FIN_Documents" document where document."FINDoc_ID" = p_document_id);
end;
$$;

revoke all on function public._multideck_finance_apply_approved_line_tax() from public, anon, authenticated;
revoke all on function public.multideck_finance_create_document_draft(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_finance_transition_document(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.multideck_finance_create_document_draft(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_finance_transition_document(uuid, uuid, uuid, text, text) to service_role;

-- Dexter reads the incompleteness as evidence, never as an approved tax result.
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
      concat_ws(' ', document."FINDoc_Number", document."FINDoc_TypeCode", document."FINDoc_StatusCode", organisation."Org_Name", job."Job_Number") search_text,
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', document."FINDoc_ID", 'recordKind', 'document', 'number', document."FINDoc_Number", 'type', document."FINDoc_TypeCode",
        'ledger', case when document."FINDoc_TypeCode" in ('sl_invoice', 'credit_note') then 'receivables' else 'payables' end,
        'status', document."FINDoc_StatusCode", 'party', organisation."Org_Name", 'currency', document."FINDoc_CurrencyCodeSnapshot",
        'netAmount', document."FINDoc_NetAmount", 'taxAmount', document."FINDoc_TaxAmount", 'grossAmount', document."FINDoc_GrossAmount",
        'outstandingAmount', document."FINDoc_OutstandingAmount", 'documentDate', document."FINDoc_DocumentDate", 'dueDate', document."FINDoc_DueDate",
        'sourceKind', document."FINDoc_SourceKindCode", 'jobReference', case when job."Job_ID" is null then null else job."Job_Period" || '-' || job."Job_Number" end,
        'taxStatus', coalesce(document."FINDoc_MetadataJSON" ->> 'taxStatus', 'pending'),
        'postingStatus', document."FINDoc_PostingStatusCode", 'exportStatus', document."FINDoc_ExportStatusCode",
        'evidence', jsonb_build_object('sourceTable', 'FIN_Documents', 'sourceId', document."FINDoc_ID", 'legalEntityId', document."FINDoc_LegalEntityID")
      )) value
    from public."FIN_Documents" document
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID" = document."FINDoc_LegalEntityID"
    left join public."Org_Master" organisation on organisation."Org_id" = document."FINDoc_PartyOrgID"
    left join public."Job_Header" job on job."Job_ID" = document."FINDoc_SourceJobID"
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

create or replace function public._multideck_dexter_finance_watch_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid;
  v_source uuid;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb;
begin
  if tg_table_name = 'FIN_Documents' then
    v_source := new."FINDoc_ID";
    select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID" = new."FINDoc_LegalEntityID";
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object(
        'status', old."FINDoc_StatusCode", 'dueDate', old."FINDoc_DueDate", 'outstandingAmount', old."FINDoc_OutstandingAmount",
        'taxStatus', coalesce(old."FINDoc_MetadataJSON" ->> 'taxStatus', 'pending'),
        'postingStatus', old."FINDoc_PostingStatusCode", 'exportStatus', old."FINDoc_ExportStatusCode"
      );
    end if;
    v_new := jsonb_build_object(
      'number', new."FINDoc_Number", 'status', new."FINDoc_StatusCode", 'dueDate', new."FINDoc_DueDate", 'outstandingAmount', new."FINDoc_OutstandingAmount",
      'taxStatus', coalesce(new."FINDoc_MetadataJSON" ->> 'taxStatus', 'pending'),
      'postingStatus', new."FINDoc_PostingStatusCode", 'exportStatus', new."FINDoc_ExportStatusCode"
    );
  else
    v_source := new."FINCash_ID";
    select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID" = new."FINCash_LegalEntityID";
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('cashStatus', old."FINCash_StatusCode", 'unallocatedAmount', old."FINCash_UnallocatedAmount", 'postingStatus', old."FINCash_PostingStatusCode");
    end if;
    v_new := jsonb_build_object('number', new."FINCash_Number", 'cashStatus', new."FINCash_StatusCode", 'unallocatedAmount', new."FINCash_UnallocatedAmount", 'postingStatus', new."FINCash_PostingStatusCode");
  end if;
  if v_old is distinct from v_new
    and v_company is not null
    and exists (
      select 1 from public."AI_DexterWatches" watch
      where watch."AIDexterWatch_CompanyID" = v_company
        and watch."AIDexterWatch_CapabilityCode" = 'finance'
        and watch."AIDexterWatch_StatusCode" = 'active'
        and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_source)
    ) then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (v_company, 'finance', tg_table_name, v_source, v_old, v_new);
  end if;
  return new;
end;
$$;
revoke all on function public._multideck_dexter_finance_watch_change() from public, anon, authenticated;

update public."sys_AIDexterActions"
set "AIDexterAction_Description" = 'Create one sales invoice, customer credit, purchase invoice or supplier credit draft through the Finance validation boundary. A missing treatment remains explicitly tax-pending and cannot enter review or posting.',
    "AIDexterAction_ParametersJSON" = '{"type":"object","properties":{"type":{"type":"string","enum":["sl_invoice","credit_note","pl_invoice","debit_note"]},"legalEntityId":{"type":"string"},"partyOrgId":{"type":"string"},"documentDate":{"type":"string"},"dueDate":{"type":["string","null"]},"currencyCode":{"type":"string"},"exchangeRate":{"type":"number","exclusiveMinimum":0},"sourceJobId":{"type":["string","null"]},"lines":{"type":"array","minItems":1,"maxItems":100,"items":{"type":"object","properties":{"description":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"unitAmount":{"type":"number","minimum":0},"taxCode":{"type":["string","null"]},"chargeCode":{"type":["string","null"]},"lineType":{"type":"string","enum":["service","ancillary"]}},"required":["description","quantity","unitAmount","taxCode","chargeCode","lineType"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["type","legalEntityId","partyOrgId","documentDate","dueDate","currencyCode","exchangeRate","sourceJobId","lines","reason"],"additionalProperties":false}'::jsonb,
    "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'create_finance_document_draft';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" = 'Event-driven finance document, tax-readiness, receipt, payment, allocation, provider-sync and approved configuration changes.',
    "AIDexterWatchCapability_FieldsJSON" = '["status","dueDate","outstandingAmount","taxStatus","postingStatus","exportStatus","cashStatus","unallocatedAmount","configurationRevision","readiness","baseCurrency","provider"]'::jsonb,
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'finance';

comment on function public._multideck_finance_apply_approved_line_tax() is
  'Derives tax from an approved effective legal-entity treatment, while allowing an unmistakable tax-pending line only on an unposted draft.';

commit;
