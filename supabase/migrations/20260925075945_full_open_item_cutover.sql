begin;

-- The VAT stream replaces this fail-closed hook only after historical opening
-- documents are excluded from capture, backfill, coverage and calculation.
create function public._multideck_opening_vat_cutover_ready(p_entity uuid,p_package uuid)
returns boolean language sql stable set search_path=pg_catalog,public as $$select false$$;
revoke all on function public._multideck_opening_vat_cutover_ready(uuid,uuid) from public,anon,authenticated;

create function public._multideck_finance_validate_full_opening(p_package uuid)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare package public."FIN_OpeningBalancePackages"; rec record; nominal public."FIN_NominalAccounts";
  debit_total numeric:=0; credit_total numeric:=0; tb_count integer:=0; item_count integer:=0;
  mode text; connected boolean; native_enabled boolean; v_controls jsonb;
begin
  select * into package from public."FIN_OpeningBalancePackages" where id=p_package for update;
  if not found or package.package_kind<>'full_open_items' then
    raise exception 'Full opening balance package not found.' using errcode='P0002'; end if;
  if package.status not in ('staged','approved') then
    raise exception 'Full opening balance package is no longer awaiting review.' using errcode='22023'; end if;
  if exists(select 1 from public."FIN_PostingBatches" where "FINPostBatch_LegalEntityID"=package.legal_entity_id
    and "FINPostBatch_StatusCode"='posted') then
    raise exception 'Opening balances require an empty native ledger for this legal entity.' using errcode='22023'; end if;
  if exists(select 1 from public."FIN_Documents" where "FINDoc_LegalEntityID"=package.legal_entity_id)
    or exists(select 1 from public."FIN_CashTransactions" where "FINCash_LegalEntityID"=package.legal_entity_id) then
    raise exception 'Resolve existing finance documents and cash before full open-item cutover.' using errcode='22023'; end if;
  select mirror_mode,active_connection,native_ledger_enabled into mode,connected,native_enabled
    from public._multideck_finance_mirror_state(package.legal_entity_id);
  if not native_enabled then raise exception 'Enable the native ledger before opening-balance cutover.' using errcode='22023'; end if;
  if mode='required' and not connected then
    raise exception 'The required accounting mirror is not connected.' using errcode='22023'; end if;
  if package.opening_date is distinct from package.closing_date+1
    or package.base_currency is distinct from (select upper("LegalEntity_BaseCurrencyCodeSnapshot")
      from public."cmp_LegalEntities" where "LegalEntity_ID"=package.legal_entity_id) then
    raise exception 'Opening date or legal-entity base currency changed; stage a new package.' using errcode='22023'; end if;
  for rec in select * from public."FIN_OpeningBalanceRows" where package_id=p_package order by source_row_number loop
    select * into nominal from public."FIN_NominalAccounts" where "FINNom_ID"=rec.nominal_account_id for share;
    if not found or nominal."FINNom_LegalEntityID" is distinct from package.legal_entity_id
      or not nominal."FINNom_IsActive" or nominal."FINNom_Code" is distinct from rec.nominal_code_snapshot then
      raise exception 'A staged trial-balance nominal changed; stage a new package.' using errcode='22023'; end if;
    debit_total:=debit_total+rec.debit; credit_total:=credit_total+rec.credit; tb_count:=tb_count+1;
  end loop;
  if tb_count<2 or debit_total<=0 or debit_total is distinct from credit_total
    or debit_total is distinct from package.debit_total or credit_total is distinct from package.credit_total then
    raise exception 'Staged trial balance no longer agrees with approved totals.' using errcode='22023'; end if;
  for rec in select s.*,n."FINNom_LegalEntityID" entity_id,n."FINNom_IsActive" active,
      n."FINNom_IsControlAccount" control_account,n."FINNom_AccountTypeCode" account_type,
      o."Org_AccCode" current_party_code,e."Company_ID" company_id
      from public."FIN_OpeningSourceItems" s
      join public."FIN_NominalAccounts" n on n."FINNom_ID"=s.control_nominal_id
      join public."Org_Master" o on o."Org_id"=s.party_org_id
      join public."cmp_LegalEntities" e on e."LegalEntity_ID"=package.legal_entity_id
      where s.package_id=p_package order by s.source_row_number
  loop
    item_count:=item_count+1;
    if rec.entity_id is distinct from package.legal_entity_id or not rec.active or not rec.control_account
      or rec.account_type is distinct from (case when rec.kind like 'customer_%' then 'Receivable' else 'Payable' end)
      or rec.document_date>package.closing_date
      or not exists(select 1 from public."CRM_AccountProfiles" profile
        where profile."CRMAccount_OrgID"=rec.party_org_id and profile."CRMAccount_CompanyID"=rec.company_id
          and not profile."CRMAccount_IsDeleted"
          and (profile."CRMAccount_LegalEntityID" is null or profile."CRMAccount_LegalEntityID"=package.legal_entity_id))
      or exists(select 1 from public."FIN_Documents" d where d."FINDoc_ID"=rec.operational_document_id)
      or exists(select 1 from public."FIN_CashTransactions" c where c."FINCash_ID"=rec.operational_cash_id) then
      raise exception 'An opening source item changed or is outside the reviewed entity, party or control account.' using errcode='22023'; end if;
    if rec.currency_code=package.base_currency and (rec.original_base_amount<>rec.original_amount
      or rec.outstanding_base_amount<>rec.outstanding_amount) then
      raise exception 'Base-currency opening items must have identical source and carrying amounts.' using errcode='22023'; end if;
    if round(rec.outstanding_amount*round(rec.outstanding_base_amount/rec.outstanding_amount,10),4)
      is distinct from rec.outstanding_base_amount then
      raise exception 'Source FX carrying amount cannot be represented exactly at the ledger exchange-rate precision.' using errcode='22023'; end if;
    if (select "LegalEntity_CountryCode" from public."cmp_LegalEntities"
      where "LegalEntity_ID"=package.legal_entity_id)='GB'
      and coalesce(length(btrim(rec.historical_vat_evidence_ref)),0)<3 then
      raise exception 'UK opening items require a reviewed prior-filing evidence reference.' using errcode='22023'; end if;
  end loop;
  if item_count<>package.source_items_count then
    raise exception 'The source open-item row count changed after staging.' using errcode='22023'; end if;
  with trial as (
    select r.nominal_account_id account_id,sum(r.debit-r.credit) balance
      from public."FIN_OpeningBalanceRows" r join public."FIN_NominalAccounts" n on n."FINNom_ID"=r.nominal_account_id
      where r.package_id=p_package and n."FINNom_IsControlAccount" and n."FINNom_AccountTypeCode" in ('Receivable','Payable')
      group by r.nominal_account_id
  ), items as (
    select s.control_nominal_id account_id,
      sum(s.outstanding_base_amount*case s.kind
        when 'customer_invoice' then 1 when 'customer_credit' then -1 when 'customer_receipt' then -1
        when 'supplier_invoice' then -1 when 'supplier_credit' then 1 else 1 end) balance
      from public."FIN_OpeningSourceItems" s where s.package_id=p_package group by s.control_nominal_id
  ), comparison as (
    select coalesce(t.account_id,i.account_id) account_id,coalesce(t.balance,0) trial_balance,
      coalesce(i.balance,0) item_balance from trial t full join items i using(account_id)
  ) select coalesce(jsonb_agg(jsonb_build_object('accountId',account_id,'trialBalance',trial_balance,
      'openItems',item_balance,'difference',item_balance-trial_balance) order by account_id),'[]'::jsonb)
    into v_controls from comparison;
  if exists(with trial as (
      select r.nominal_account_id account_id,sum(r.debit-r.credit) balance from public."FIN_OpeningBalanceRows" r
        join public."FIN_NominalAccounts" n on n."FINNom_ID"=r.nominal_account_id
        where r.package_id=p_package and n."FINNom_IsControlAccount" and n."FINNom_AccountTypeCode" in ('Receivable','Payable')
        group by r.nominal_account_id
    ), items as (
      select control_nominal_id account_id,sum(outstanding_base_amount*case kind
        when 'customer_invoice' then 1 when 'customer_credit' then -1 when 'customer_receipt' then -1
        when 'supplier_invoice' then -1 when 'supplier_credit' then 1 else 1 end) balance
        from public."FIN_OpeningSourceItems" where package_id=p_package group by control_nominal_id
    ) select 1 from trial t full join items i using(account_id)
      where coalesce(t.balance,0)<>coalesce(i.balance,0)) then
    raise exception 'Open-item carrying values do not reconcile to each trial-balance AR/AP control.' using errcode='22023'; end if;
  return jsonb_build_object('rows',tb_count,'openItems',item_count,'debit',debit_total,'credit',credit_total,
    'currency',package.base_currency,'controls',v_controls,'mirrorMode',mode,'mirrorConnected',connected);
end; $$;
revoke all on function public._multideck_finance_validate_full_opening(uuid) from public,anon,authenticated;

create function public._multideck_finance_full_opening_action(p_actor uuid,p_entity uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare package public."FIN_OpeningBalancePackages"; nominal public."FIN_NominalAccounts"; source_item public."FIN_OpeningSourceItems";
  entry jsonb; row_no integer; row_count integer:=0; item_count integer:=0; debit numeric; credit numeric;
  debit_total numeric:=0; credit_total numeric:=0; original numeric; original_base numeric; outstanding numeric;
  outstanding_base numeric; source_date date; due_date date; closing_date date; base_currency text;
  party_id uuid; account_id uuid; item_kind text; item_currency text; v_check jsonb; batch uuid;
  period_id uuid; line_no integer:=0; v_mirror_mode text; v_mirror_connected boolean; v_native_enabled boolean;
  mirror_connection uuid; mirror_connection_count integer; country text;
begin
  if p_action not in ('stage','approve','post') then
    raise exception 'Unknown full opening balance action.' using errcode='22023'; end if;
  perform public._multideck_journal_access(p_actor,p_entity,
    case when p_action='stage' then 'Finance.Configuration.Manage' else 'Finance.Management.Post' end);
  perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for update;
  if p_action='stage' then
    if p_input->>'sourceSystem' is distinct from 'CargoWise'
      or coalesce(length(btrim(p_input->>'sourceFileName')),0) not between 1 and 240
      or coalesce(p_input->>'sourceSha256','') !~ '^[a-f0-9]{64}$'
      or coalesce(length(btrim(p_input->>'sourceItemsFileName')),0) not between 1 and 240
      or coalesce(p_input->>'sourceItemsSha256','') !~ '^[a-f0-9]{64}$' then
      raise exception 'Record both exact CargoWise filenames and SHA-256 hashes.' using errcode='22023'; end if;
    if jsonb_typeof(p_input->'trialBalance')<>'array' or jsonb_array_length(p_input->'trialBalance') not between 2 and 10000
      or jsonb_typeof(p_input->'openItems')<>'array' or jsonb_array_length(p_input->'openItems') not between 1 and 50000 then
      raise exception 'Provide two to 10,000 trial-balance rows and one to 50,000 open-item rows.' using errcode='22023'; end if;
    if jsonb_typeof(p_input->'evidence')<>'object'
      or not (p_input->'evidence' ?& array['bank','tax','accrualWip','sourceReconciliation','partyMapping','openItems','fx'])
      or exists(select 1 from jsonb_each_text(p_input->'evidence') e where length(btrim(e.value))<3) then
      raise exception 'Record bank, tax, accrual/WIP, party, open-item, FX and source reconciliation references.' using errcode='22023'; end if;
    closing_date:=(p_input->>'cutoffDate')::date;
    if closing_date is null or closing_date::text is distinct from p_input->>'cutoffDate' then
      raise exception 'Choose an exact CargoWise closing date.' using errcode='22023'; end if;
    select upper("LegalEntity_BaseCurrencyCodeSnapshot"),"LegalEntity_CountryCode" into base_currency,country
      from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
    if base_currency is null or base_currency!~'^[A-Z]{3}$' or p_input->>'baseCurrency' is distinct from base_currency then
      raise exception 'Use the legal entity base currency for the trial balance.' using errcode='22023'; end if;
    if exists(select 1 from public."FIN_PostingBatches" where "FINPostBatch_LegalEntityID"=p_entity
      and "FINPostBatch_StatusCode"='posted') then
      raise exception 'Opening balances require an empty native ledger for this legal entity.' using errcode='22023'; end if;
    if exists(select 1 from public."FIN_Documents" where "FINDoc_LegalEntityID"=p_entity)
      or exists(select 1 from public."FIN_CashTransactions" where "FINCash_LegalEntityID"=p_entity) then
      raise exception 'Resolve existing finance documents and cash before full open-item cutover.' using errcode='22023'; end if;
    for entry in select value from jsonb_array_elements(p_input->'trialBalance') loop
      row_count:=row_count+1; row_no:=(entry->>'sourceRow')::integer;
      if row_no is null or row_no<=0 or coalesce(entry->>'accountCode','')=''
        or entry->>'accountCode' is distinct from btrim(entry->>'accountCode')
        or coalesce(entry->>'debit','') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$'
        or coalesce(entry->>'credit','') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$' then
        raise exception 'Trial-balance row % has an invalid source row, account or amount.',row_count using errcode='22023'; end if;
      select * into nominal from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=p_entity
        and "FINNom_Code"=entry->>'accountCode' and "FINNom_IsActive" for share;
      if not found then raise exception 'Source trial-balance row % has no active nominal in this entity.',row_no using errcode='22023'; end if;
      debit:=(entry->>'debit')::numeric; credit:=(entry->>'credit')::numeric;
      if not ((debit>0 and credit=0) or (credit>0 and debit=0)) then
        raise exception 'Trial-balance row % must have one closing balance side.',row_no using errcode='22023'; end if;
      debit_total:=debit_total+debit; credit_total:=credit_total+credit;
    end loop;
    if debit_total<=0 or debit_total is distinct from credit_total then
      raise exception 'Closing trial balance must balance before staging.' using errcode='22023'; end if;
    insert into public."FIN_OpeningBalancePackages"(legal_entity_id,source_system,source_file_name,
      source_sha256,closing_date,opening_date,base_currency,evidence,debit_total,credit_total,staged_by,
      package_kind,source_items_file_name,source_items_sha256,source_items_sheet_name,source_items_count)
      values(p_entity,'CargoWise',btrim(p_input->>'sourceFileName'),p_input->>'sourceSha256',
        closing_date,closing_date+1,base_currency,p_input->'evidence',debit_total,credit_total,p_actor,
        'full_open_items',btrim(p_input->>'sourceItemsFileName'),p_input->>'sourceItemsSha256',
        nullif(btrim(p_input->>'sourceItemsSheetName'),''),jsonb_array_length(p_input->'openItems'))
      returning * into package;
    for entry in select value from jsonb_array_elements(p_input->'trialBalance') loop
      select * into nominal from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=p_entity
        and "FINNom_Code"=entry->>'accountCode' and "FINNom_IsActive" for share;
      insert into public."FIN_OpeningBalanceRows"(package_id,source_row_number,source_account_code,
        nominal_account_id,nominal_code_snapshot,nominal_name_snapshot,debit,credit)
        values(package.id,(entry->>'sourceRow')::integer,entry->>'accountCode',nominal."FINNom_ID",
          nominal."FINNom_Code",nominal."FINNom_Name",(entry->>'debit')::numeric,(entry->>'credit')::numeric);
    end loop;
    for entry in select value from jsonb_array_elements(p_input->'openItems') loop
      item_count:=item_count+1;
      row_no:=(entry->>'sourceRow')::integer;
      item_kind:=entry->>'kind'; item_currency:=entry->>'currency';
      party_id:=(entry->>'partyOrgId')::uuid;
      if row_no is null or row_no<=0 or item_kind not in ('customer_invoice','customer_credit','customer_receipt',
          'supplier_invoice','supplier_credit','supplier_payment')
        or item_currency!~'^[A-Z]{3}$'
        or coalesce(length(btrim(entry->>'sourceId')),0) not between 1 and 180
        or coalesce(length(btrim(entry->>'partyCode')),0) not between 1 and 80
        or coalesce(length(btrim(entry->>'reference')),0) not between 1 and 180
        or coalesce(entry->>'originalAmount','') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$'
        or coalesce(entry->>'originalBaseAmount','') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$'
        or coalesce(entry->>'outstandingAmount','') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$'
        or coalesce(entry->>'outstandingBaseAmount','') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$' then
        raise exception 'Open-item source row % has invalid IDs, type, currency or exact amounts.',item_count using errcode='22023'; end if;
      source_date:=(entry->>'documentDate')::date;
      due_date:=nullif(entry->>'dueDate','')::date;
      if source_date::text is distinct from entry->>'documentDate' or source_date>closing_date
        or (due_date is not null and due_date::text is distinct from entry->>'dueDate') then
        raise exception 'Open-item source row % has an invalid historical date.',row_no using errcode='22023'; end if;
      select "FINNom_ID" into account_id from public."FIN_NominalAccounts"
        where "FINNom_LegalEntityID"=p_entity and "FINNom_Code"=entry->>'accountCode'
          and "FINNom_IsActive" and "FINNom_IsControlAccount"
          and "FINNom_AccountTypeCode"=case when item_kind like 'customer_%' then 'Receivable' else 'Payable' end for share;
      if account_id is null then raise exception 'Open-item source row % needs the matching active AR/AP control nominal.',row_no using errcode='22023'; end if;
      perform public._accounting_require_party_profile(party_id,p_entity);
      if not exists(select 1 from public."Org_Master_Type" membership
        join public."Org_Types" role on role."OrgType_ID"=membership."OrgType_ID"
        where membership."Org_ID"=party_id and lower(role."OrgType_Name") in
          (case when item_kind like 'customer_%' then 'customer' else 'supplier' end,
           case when item_kind like 'customer_%' then 'key customer account' else 'supplier' end)) then
        raise exception 'Open-item source row % has no matching customer or supplier party role.',row_no using errcode='22023'; end if;
      if exists(select 1 from public."FIN_OpeningSourceItems" existing
        where existing.package_id=package.id and existing.source_party_code=entry->>'partyCode'
          and existing.party_org_id<>party_id) then
        raise exception 'A CargoWise party code maps to more than one customer or supplier.' using errcode='22023'; end if;
      original:=(entry->>'originalAmount')::numeric; original_base:=(entry->>'originalBaseAmount')::numeric;
      outstanding:=(entry->>'outstandingAmount')::numeric; outstanding_base:=(entry->>'outstandingBaseAmount')::numeric;
      if original<=0 or original_base<=0 or outstanding<=0 or outstanding>original or outstanding_base<=0
        or (item_currency=base_currency and (original_base<>original or outstanding_base<>outstanding))
        or round(outstanding*round(outstanding_base/outstanding,10),4)<>outstanding_base then
        raise exception 'Open-item source row % has invalid or unrepresentable FX carrying amounts.',row_no using errcode='22023'; end if;
      if country='GB' and coalesce(length(btrim(entry->>'historicalVatEvidenceRef')),0)<3 then
        raise exception 'UK open-item source row % needs a prior accepted VAT filing reference.',row_no using errcode='22023'; end if;
      insert into public."FIN_OpeningSourceItems"(package_id,source_row_number,source_id,source_party_code,
        party_org_id,source_reference,control_nominal_id,kind,document_date,due_date,currency_code,
        original_amount,original_base_amount,outstanding_amount,outstanding_base_amount,
        historical_vat_evidence_ref,operational_document_id,operational_cash_id)
        values(package.id,row_no,entry->>'sourceId',entry->>'partyCode',party_id,entry->>'reference',
          account_id,item_kind,source_date,due_date,item_currency,original,original_base,outstanding,
          outstanding_base,nullif(btrim(entry->>'historicalVatEvidenceRef'),''),
          case when item_kind in ('customer_receipt','supplier_payment') then null else gen_random_uuid() end,
          case when item_kind in ('customer_receipt','supplier_payment') then gen_random_uuid() else null end);
    end loop;
    v_check:=public._multideck_finance_validate_full_opening(package.id);
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
      "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title",
      "AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
      values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_OpeningBalancePackages',
        'opening_balances',package.id,'stage','Full CargoWise opening stage',true,1,
        jsonb_build_object('sourceSha256',package.source_sha256,'openSourceSha256',package.source_items_sha256,
          'openItems',package.source_items_count));
    return to_jsonb(package)||jsonb_build_object('reconciliation',v_check);
  end if;
  select * into package from public."FIN_OpeningBalancePackages"
    where id=(p_input->>'id')::uuid and legal_entity_id=p_entity and package_kind='full_open_items' for update;
  if not found then raise exception 'Full opening balance package not found.' using errcode='P0002'; end if;
  if (p_action='approve' and package.status<>'staged') or (p_action='post' and package.status<>'approved') then
    raise exception 'Complete full opening-balance stages in order.' using errcode='22023'; end if;
  if p_actor=package.staged_by then
    raise exception 'A second finance operator must approve and post opening balances.' using errcode='42501'; end if;
  v_check:=public._multideck_finance_validate_full_opening(package.id);
  if p_action='approve' then
    update public."FIN_OpeningBalancePackages" set status='approved',approved_by=p_actor,approved_at=now()
      where id=package.id returning * into package;
  else
    select "LegalEntity_CountryCode" into country from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
    if country='GB' then
      if (select count(*) from public."FIN_LegalEntityComplianceRegistrations" reg
        join public."FIN_ComplianceObligations" obligation on obligation."FINCompliance_ID"=reg."FINComplianceReg_ObligationID"
        where reg."FINComplianceReg_LegalEntityID"=p_entity and obligation."FINCompliance_Code"='gb-vat-mtd'
          and reg."FINComplianceReg_StatusCode" in ('configured','sandbox_verified','production_verified')
          and reg."FINComplianceReg_EffectiveFrom"<=package.closing_date
          and (reg."FINComplianceReg_EffectiveTo" is null or reg."FINComplianceReg_EffectiveTo">=package.closing_date)
          and reg."FINComplianceReg_SettingsJSON"->>'schemeCode'='standard'
          and reg."FINComplianceReg_SettingsJSON"->>'accountingBasis'='invoice')<>1
        or not public._multideck_opening_vat_cutover_ready(p_entity,package.id) then
        raise exception 'UK opening items need one reviewed Standard invoice VAT registration and historical filing exclusion.' using errcode='22023';
      end if;
    end if;
    select state.mirror_mode,state.active_connection,state.native_ledger_enabled
      into v_mirror_mode,v_mirror_connected,v_native_enabled
      from public._multideck_finance_mirror_state(p_entity) state;
    if v_mirror_mode<>'disabled' and v_mirror_connected then
      select count(*),(array_agg("ACCIC_ID" order by "ACCIC_ID"))[1]
        into mirror_connection_count,mirror_connection
        from public."ACCI_Connections" where "ACCIC_LegalEntityID"=p_entity
          and "ACCIC_StatusCode"='active' and "ACCIC_ProviderCode"='erpnext'
          and "ACCIC_ExternalBaseCurrencyCode"=package.base_currency;
      if mirror_connection_count<>1 then
        raise exception 'Choose exactly one active ERPNext mirror with the reviewed base currency.' using errcode='22023'; end if;
    end if;
    period_id:=public._multideck_finance_ensure_period(p_entity,to_char(package.opening_date,'YYYYMM'),p_actor);
    perform 1 from public."FIN_Periods" where "FINPeriod_ID"=period_id and "FINPeriod_StatusCode"='open' for update;
    if not found then raise exception 'Opening date must be in an open accounting period.' using errcode='22023'; end if;
    insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable",
      "FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal",
      "FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy",
      "FINPostBatch_CreatedBy")
      values('OPEN-'||left(package.id::text,8),'posted','FIN_OpeningBalancePackages',package.id,period_id,
        p_entity,package.debit_total,package.credit_total,package.base_currency,now(),p_actor,p_actor)
      returning "FINPostBatch_ID" into batch;
    for entry in select to_jsonb(r) from public."FIN_OpeningBalanceRows" r
      where r.package_id=package.id order by r.source_row_number loop
      line_no:=line_no+1;
      insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
        "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot")
        values(batch,line_no,(entry->>'nominal_account_id')::uuid,
          'CargoWise opening · source row '||(entry->>'source_row_number')||' · '||(entry->>'source_account_code'),
          (entry->>'debit')::numeric,(entry->>'credit')::numeric,package.base_currency);
    end loop;
    for source_item in select * from public."FIN_OpeningSourceItems" where package_id=package.id
      order by source_row_number loop
      if source_item.operational_document_id is not null then
        insert into public."FIN_Documents"("FINDoc_ID","FINDoc_TypeCode","FINDoc_StatusCode","FINDoc_Number",
          "FINDoc_LegalEntityID","FINDoc_PartyOrgID","FINDoc_PartyRole","FINDoc_DocumentDate",
          "FINDoc_AccountingDate","FINDoc_SourceAccountingDate","FINDoc_DueDate","FINDoc_PeriodID",
          "FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate","FINDoc_NetAmount","FINDoc_TaxAmount",
          "FINDoc_GrossAmount","FINDoc_LocalNetAmount","FINDoc_LocalTaxAmount","FINDoc_LocalGrossAmount",
          "FINDoc_OutstandingAmount","FINDoc_LocalOutstandingAmount","FINDoc_SourceTable","FINDoc_SourceID",
          "FINDoc_PostingStatusCode","FINDoc_ExportStatusCode","FINDoc_PostedAt","FINDoc_PostedBy",
          "FINDoc_IsLocked","FINDoc_MetadataJSON","FINDoc_CreatedBy","FINDoc_UpdatedBy",
          "FINDoc_NativePostingStatusCode","FINDoc_NativePostingBatchID","FINDoc_NativePostedAt",
          "FINDoc_NativePostedBy","FINDoc_OpeningBalancePackageID")
          values(source_item.operational_document_id,
            case source_item.kind when 'customer_invoice' then 'sl_invoice' when 'customer_credit' then 'credit_note'
              when 'supplier_invoice' then 'pl_invoice' else 'debit_note' end,
            'approved',left(source_item.source_reference,80),p_entity,source_item.party_org_id,
            case when source_item.kind like 'customer_%' then 'customer' else 'supplier' end,
            source_item.document_date,package.opening_date,source_item.document_date,source_item.due_date,period_id,
            source_item.currency_code,round(source_item.outstanding_base_amount/source_item.outstanding_amount,10),
            source_item.outstanding_amount,0,source_item.outstanding_amount,source_item.outstanding_base_amount,0,
            source_item.outstanding_base_amount,source_item.outstanding_amount,source_item.outstanding_base_amount,
            'FIN_OpeningSourceItems',source_item.id,'posted','not_required',now(),p_actor,true,
            jsonb_build_object('openingSourceId',source_item.source_id,'openingSourceRow',source_item.source_row_number,
              'sourceOriginalAmount',source_item.original_amount,'sourceOriginalBaseAmount',source_item.original_base_amount,
              'sourceFileSha256',package.source_items_sha256,'historicalVatEvidenceRef',source_item.historical_vat_evidence_ref),
            p_actor,p_actor,'pending_migration',batch,now(),p_actor,package.id);
        update public."FIN_Documents" set "FINDoc_NativePostingStatusCode"='posted'
          where "FINDoc_ID"=source_item.operational_document_id;
      else
        insert into public."FIN_CashTransactions"("FINCash_ID","FINCash_TypeCode","FINCash_StatusCode",
          "FINCash_Number","FINCash_BankAccountID","FINCash_PartyOrgID","FINCash_TransactionDate",
          "FINCash_AccountingDate","FINCash_PeriodID","FINCash_CurrencyCodeSnapshot","FINCash_ExchangeRate",
          "FINCash_Amount","FINCash_LocalAmount","FINCash_UnallocatedAmount","FINCash_LocalUnallocatedAmount",
          "FINCash_Reference","FINCash_PostingStatusCode","FINCash_CreatedBy","FINCash_LegalEntityID",
          "FINCash_MetadataJSON","FINCash_UpdatedBy","FINCash_NativePostingStatusCode","FINCash_NativePostingBatchID",
          "FINCash_NativePostedAt","FINCash_NativePostedBy","FINCash_ExportStatusCode","FINCash_OpeningBalancePackageID")
          values(source_item.operational_cash_id,
            case when source_item.kind='customer_receipt' then 'customer_receipt' else 'supplier_payment' end,
            'approved',left(source_item.source_reference,80),null,source_item.party_org_id,source_item.document_date,
            package.opening_date,period_id,source_item.currency_code,
            round(source_item.outstanding_base_amount/source_item.outstanding_amount,10),
            source_item.outstanding_amount,source_item.outstanding_base_amount,source_item.outstanding_amount,
            source_item.outstanding_base_amount,left(source_item.source_reference,180),'posted',p_actor,p_entity,
            jsonb_build_object('openingSourceId',source_item.source_id,'openingSourceRow',source_item.source_row_number,
              'sourceOriginalAmount',source_item.original_amount,'sourceOriginalBaseAmount',source_item.original_base_amount,
              'sourceFileSha256',package.source_items_sha256,'historicalVatEvidenceRef',source_item.historical_vat_evidence_ref),
            p_actor,'pending_migration',batch,now(),p_actor,'not_required',package.id);
        update public."FIN_CashTransactions" set "FINCash_NativePostingStatusCode"='posted'
          where "FINCash_ID"=source_item.operational_cash_id;
      end if;
    end loop;
    update public."FIN_OpeningBalancePackages" set status='posted',posted_by=p_actor,posted_at=now(),
      posting_batch_id=batch where id=package.id returning * into package;
    if v_mirror_mode<>'disabled' and v_mirror_connected then
      perform public.multideck_finance_opening_mirror_enqueue(p_actor,p_entity,package.id,mirror_connection);
    end if;
  end if;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title",
    "AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_OpeningBalancePackages',
      'opening_balances',package.id,p_action,'Full CargoWise opening '||p_action,true,1,
      jsonb_build_object('sourceSha256',package.source_sha256,'openSourceSha256',package.source_items_sha256,
        'openItems',package.source_items_count,'postingBatchId',package.posting_batch_id));
  return to_jsonb(package)||jsonb_build_object('reconciliation',v_check);
end; $$;
revoke all on function public._multideck_finance_full_opening_action(uuid,uuid,text,jsonb) from public,anon,authenticated;

alter function public.multideck_finance_opening_balances(uuid,uuid,text,jsonb)
  rename to _multideck_finance_opening_balances_gl_only;
revoke all on function public._multideck_finance_opening_balances_gl_only(uuid,uuid,text,jsonb)
  from public,anon,authenticated,service_role;
create function public.multideck_finance_opening_balances(p_actor uuid,p_entity uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_action='stage' and p_input->>'packageKind'='full_open_items' then
    return public._multideck_finance_full_opening_action(p_actor,p_entity,p_action,p_input);
  end if;
  if p_action in ('approve','post') and exists(select 1 from public."FIN_OpeningBalancePackages"
    where id=nullif(p_input->>'id','')::uuid and legal_entity_id=p_entity and package_kind='full_open_items') then
    return public._multideck_finance_full_opening_action(p_actor,p_entity,p_action,p_input);
  end if;
  return public._multideck_finance_opening_balances_gl_only(p_actor,p_entity,p_action,p_input);
end; $$;
revoke all on function public.multideck_finance_opening_balances(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_opening_balances(uuid,uuid,text,jsonb) to service_role;

commit;
