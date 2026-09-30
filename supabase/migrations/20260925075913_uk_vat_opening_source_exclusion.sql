begin;

-- Opening AR/AP documents carry balances from the CargoWise trial balance.
-- Their historical tax was filed before cutover, so they are not fresh
-- Standard VAT evidence. This exclusion is conditional on a matching,
-- reviewed source item with a prior-filing reference. Post-cutover credits
-- and Cash Accounting settlements require separate scheme-aware rules.
create function public._multideck_uk_vat_opening_document_ready(
  p_document uuid,p_entity uuid,p_package uuid,p_type text
) returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
  select exists(select 1 from public."FIN_OpeningSourceItems" item
    join public."FIN_OpeningBalancePackages" package
      on package.id=item.package_id
      and package.legal_entity_id=p_entity
      and package.status in ('approved','posted')
      and package.package_kind='full_open_items'
    where item.package_id=p_package
      and item.operational_document_id=p_document
      and item.kind=case p_type
        when 'sl_invoice' then 'customer_invoice'
        when 'credit_note' then 'customer_credit'
        when 'pl_invoice' then 'supplier_invoice'
        when 'debit_note' then 'supplier_credit'
        else null end
      and length(btrim(item.historical_vat_evidence_ref))>0);
$$;
revoke all on function public._multideck_uk_vat_opening_document_ready(uuid,uuid,uuid,text)
  from public,anon,authenticated;

-- A posted document cannot acquire an opening marker retrospectively.
create function public._multideck_uk_vat_opening_marker_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op='UPDATE' and old."FINDoc_NativePostingStatusCode"='posted'
    and old."FINDoc_OpeningBalancePackageID" is null
    and new."FINDoc_OpeningBalancePackageID" is not null then
    raise exception 'A posted VAT source cannot become an opening balance.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_opening_marker_guard()
  from public,anon,authenticated;
create trigger vat_opening_marker_guard before update on public."FIN_Documents"
  for each row execute function public._multideck_uk_vat_opening_marker_guard();

-- No alternate writer may manufacture current VAT evidence for an opening row.
create function public._multideck_uk_vat_opening_evidence_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.source_kind='posted_document_line' and exists(
    select 1 from public."FIN_Documents" document
    where document."FINDoc_ID"=new.source_document_id
      and document."FINDoc_OpeningBalancePackageID" is not null) then
    raise exception 'Historical opening document tax is not current VAT evidence.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_opening_evidence_guard()
  from public,anon,authenticated;
create trigger vat_opening_evidence_guard before insert on public."FIN_IndirectTaxEvidence"
  for each row execute function public._multideck_uk_vat_opening_evidence_guard();

create or replace function public._multideck_indirect_tax_capture_posted_document()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_reversal boolean;
  v_source public."FIN_Documents"%rowtype;
  v_line public."FIN_DocumentLines"%rowtype;
  v_original uuid;
begin
  if new."FINDoc_NativePostingStatusCode"<>'posted' then return new; end if;
  if new."FINDoc_OpeningBalancePackageID" is not null then
    if not public._multideck_uk_vat_opening_document_ready(
      new."FINDoc_ID",new."FINDoc_LegalEntityID",
      new."FINDoc_OpeningBalancePackageID",new."FINDoc_TypeCode") then
      raise exception 'Opening document lacks reviewed historical VAT filing evidence.' using errcode='22023';
    end if;
    return new;
  end if;
  if tg_op='UPDATE' and old."FINDoc_NativePostingStatusCode"='posted' then return new; end if;
  if not exists(select 1 from public."cmp_LegalEntities" entity
    where entity."LegalEntity_ID"=new."FINDoc_LegalEntityID"
      and entity."LegalEntity_CountryCode"='GB') then return new; end if;
  if new."FINDoc_NativePostingBatchID" is null or new."FINDoc_NativePostedBy" is null then
    raise exception 'Posted finance document lacks tax-evidence batch or actor.' using errcode='22023';
  end if;
  v_reversal:=new."FINDoc_MetadataJSON"->>'billingPartyCorrection'='true'
    and new."FINDoc_MetadataJSON"->>'correctionRole'='reversal';
  if v_reversal then
    if new."FINDoc_SourceTable" is distinct from 'FIN_Documents'
      or new."FINDoc_SourceID" is null
      or new."FINDoc_MetadataJSON"->>'sourceDocumentId' is distinct from new."FINDoc_SourceID"::text then
      raise exception 'VAT correction reversal has no verified source document.' using errcode='22023';
    end if;
    select * into v_source from public."FIN_Documents"
      where "FINDoc_ID"=new."FINDoc_SourceID"
        and "FINDoc_LegalEntityID"=new."FINDoc_LegalEntityID"
        and "FINDoc_NativePostingStatusCode"='posted'
        and "FINDoc_CurrencyCodeSnapshot"=new."FINDoc_CurrencyCodeSnapshot"
        and "FINDoc_ExchangeRate"=new."FINDoc_ExchangeRate";
    if not found or v_source."FINDoc_ID"=new."FINDoc_ID"
      or (v_source."FINDoc_TypeCode",new."FINDoc_TypeCode") not in
        (('sl_invoice','credit_note'),('credit_note','sl_invoice'),
         ('pl_invoice','debit_note'),('debit_note','pl_invoice')) then
      raise exception 'VAT correction reversal does not match its posted source.' using errcode='22023';
    end if;
  end if;
  for v_line in select * from public."FIN_DocumentLines"
    where "FINDocLine_DocumentID"=new."FINDoc_ID" order by "FINDocLine_LineNo" loop
    v_original:=null;
    if v_reversal then
      select evidence.id into v_original
      from public."FIN_DocumentLines" source_line
      join public."FIN_IndirectTaxEvidence" evidence
        on evidence.source_document_line_id=source_line."FINDocLine_ID"
        and evidence.source_document_id=v_source."FINDoc_ID"
        and evidence.source_posting_batch_id=v_source."FINDoc_NativePostingBatchID"
        and evidence.source_kind='posted_document_line'
        and evidence.legal_entity_id=new."FINDoc_LegalEntityID"
        and evidence.jurisdiction_code='GB'
      where source_line."FINDocLine_DocumentID"=v_source."FINDoc_ID"
        and source_line."FINDocLine_LineNo"=v_line."FINDocLine_LineNo"
        and source_line."FINDocLine_NetAmount"=-v_line."FINDocLine_NetAmount"
        and source_line."FINDocLine_TaxAmount"=-v_line."FINDocLine_TaxAmount"
        and source_line."FINDocLine_LocalNetAmount"=-v_line."FINDocLine_LocalNetAmount"
        and source_line."FINDocLine_LocalTaxAmount"=-v_line."FINDocLine_LocalTaxAmount";
      if v_original is null then
        raise exception 'VAT correction reversal lacks matching original line evidence.' using errcode='22023';
      end if;
    end if;
    insert into public."FIN_IndirectTaxEvidence"(
      legal_entity_id,jurisdiction_code,source_kind,source_id,source_posting_batch_id,
      source_document_id,source_document_line_id,source_version,source_document_date,
      currency_code,exchange_rate,signed_net_amount,signed_tax_amount,
      signed_net_reporting,signed_tax_reporting,reverses_evidence_id,recorded_by
    ) values (new."FINDoc_LegalEntityID",'GB','posted_document_line',v_line."FINDocLine_ID",
      new."FINDoc_NativePostingBatchID",new."FINDoc_ID",v_line."FINDocLine_ID",
      new."FINDoc_NativePostingBatchID"::text,new."FINDoc_DocumentDate",
      new."FINDoc_CurrencyCodeSnapshot",new."FINDoc_ExchangeRate",
      v_line."FINDocLine_NetAmount",v_line."FINDocLine_TaxAmount",
      v_line."FINDocLine_LocalNetAmount",v_line."FINDocLine_LocalTaxAmount",
      v_original,new."FINDoc_NativePostedBy")
    on conflict (legal_entity_id,jurisdiction_code,source_kind,source_id,source_version) do nothing;
  end loop;
  return new;
end; $$;

create or replace function public.multideck_uk_vat_source_coverage(p_actor uuid,p_entity uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_posted bigint; v_missing bigint; v_unreviewed bigint; v_pending bigint; v_unsupported bigint;
  v_missing_sample jsonb; v_unreviewed_sample jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select count(*),count(*) filter (where evidence.id is null)
    into v_posted,v_missing
  from public."FIN_Documents" document
  join public."FIN_DocumentLines" line on line."FINDocLine_DocumentID"=document."FINDoc_ID"
  left join public."FIN_IndirectTaxEvidence" evidence
    on evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
      and evidence.source_kind='posted_document_line'
      and evidence.source_document_line_id=line."FINDocLine_ID"
      and evidence.source_posting_batch_id=document."FINDoc_NativePostingBatchID"
  where document."FINDoc_LegalEntityID"=p_entity and document."FINDoc_NativePostingStatusCode"='posted'
    and document."FINDoc_OpeningBalancePackageID" is null;
  select count(*) into v_unreviewed from public."FIN_IndirectTaxEvidence" evidence
  where evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
    and not exists(select 1 from public."FIN_IndirectTaxDecisions" decision where decision.evidence_id=evidence.id);
  select count(*) into v_pending from public."FIN_Documents" document
    where document."FINDoc_LegalEntityID"=p_entity
      and document."FINDoc_NativePostingStatusCode" in ('pending_migration','reversed');
  select count(*) into v_unsupported from public."FIN_IndirectTaxEvidence" evidence
    where evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
      and evidence.source_kind<>'posted_document_line';
  select coalesce(jsonb_agg(to_jsonb(sample)),'[]'::jsonb) into v_missing_sample from (
    select document."FINDoc_ID" document_id,document."FINDoc_Number" document_number,
      document."FINDoc_DocumentDate" document_date,line."FINDocLine_ID" line_id
    from public."FIN_Documents" document
    join public."FIN_DocumentLines" line on line."FINDocLine_DocumentID"=document."FINDoc_ID"
    where document."FINDoc_LegalEntityID"=p_entity and document."FINDoc_NativePostingStatusCode"='posted'
    and document."FINDoc_OpeningBalancePackageID" is null
      and not exists(select 1 from public."FIN_IndirectTaxEvidence" evidence
        where evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
          and evidence.source_kind='posted_document_line'
          and evidence.source_document_line_id=line."FINDocLine_ID"
          and evidence.source_posting_batch_id=document."FINDoc_NativePostingBatchID")
    order by document."FINDoc_DocumentDate",document."FINDoc_ID",line."FINDocLine_ID" limit 50
  ) sample;
  select coalesce(jsonb_agg(to_jsonb(sample)),'[]'::jsonb) into v_unreviewed_sample from (
    select evidence.id evidence_id,evidence.source_document_id document_id,
      evidence.source_document_line_id line_id,evidence.source_document_date document_date,
      evidence.signed_net_reporting net_gbp,evidence.signed_tax_reporting vat_gbp,
      line."FINDocLine_TaxCodeSnapshot" tax_code
    from public."FIN_IndirectTaxEvidence" evidence
    left join public."FIN_DocumentLines" line on line."FINDocLine_ID"=evidence.source_document_line_id
    where evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
      and not exists(select 1 from public."FIN_IndirectTaxDecisions" decision where decision.evidence_id=evidence.id)
    order by evidence.source_document_date nulls first,evidence.id limit 100
  ) sample;
  return jsonb_build_object('legalEntityId',p_entity,'jurisdiction','GB','postedDocumentLines',v_posted,
    'missingCapturedLines',v_missing,'unreviewedEvents',v_unreviewed,
    'pendingOrReversedDocuments',v_pending,'unsupportedSourceKinds',v_unsupported,
    'missingSample',v_missing_sample,'unreviewedSample',v_unreviewed_sample,
    'complete',v_missing=0 and v_unreviewed=0 and v_pending=0 and v_unsupported=0);
end; $$;

create or replace function public.multideck_uk_vat_backfill_posted(
  p_actor uuid,p_entity uuid,p_limit integer,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_inserted integer; v_before jsonb; v_after jsonb;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_limit is null or p_limit not between 1 and 500 or p_reason is null
    or length(btrim(p_reason)) not between 10 and 1000 then
    raise exception 'Choose up to 500 posted lines and record the backfill reason.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||p_entity::text,0));
  v_before:=public.multideck_uk_vat_source_coverage(p_actor,p_entity);
  insert into public."FIN_IndirectTaxEvidence"(
    legal_entity_id,jurisdiction_code,source_kind,source_id,source_posting_batch_id,
    source_document_id,source_document_line_id,source_version,source_document_date,
    currency_code,exchange_rate,signed_net_amount,signed_tax_amount,
    signed_net_reporting,signed_tax_reporting,capture_kind,capture_reason,recorded_by
  )
  select p_entity,'GB','posted_document_line',source.line_id,source.batch_id,
    source.document_id,source.line_id,source.batch_id::text,source.document_date,
    source.currency_code,source.exchange_rate,source.net_amount,source.tax_amount,
    source.net_reporting,source.tax_reporting,'historical_backfill',btrim(p_reason),p_actor
  from (
    select document."FINDoc_ID" document_id,document."FINDoc_NativePostingBatchID" batch_id,
      document."FINDoc_DocumentDate" document_date,
      document."FINDoc_CurrencyCodeSnapshot" currency_code,document."FINDoc_ExchangeRate" exchange_rate,
      line."FINDocLine_ID" line_id,line."FINDocLine_NetAmount" net_amount,
      line."FINDocLine_TaxAmount" tax_amount,line."FINDocLine_LocalNetAmount" net_reporting,
      line."FINDocLine_LocalTaxAmount" tax_reporting
    from public."FIN_Documents" document
    join public."FIN_DocumentLines" line on line."FINDocLine_DocumentID"=document."FINDoc_ID"
    join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=document."FINDoc_NativePostingBatchID"
      and batch."FINPostBatch_StatusCode"='posted' and batch."FINPostBatch_LegalEntityID"=p_entity
    where document."FINDoc_LegalEntityID"=p_entity and document."FINDoc_NativePostingStatusCode"='posted'
      and document."FINDoc_OpeningBalancePackageID" is null
      and not exists(select 1 from public."FIN_IndirectTaxEvidence" evidence
        where evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
          and evidence.source_kind='posted_document_line'
          and evidence.source_document_line_id=line."FINDocLine_ID"
          and evidence.source_posting_batch_id=document."FINDoc_NativePostingBatchID")
    order by document."FINDoc_DocumentDate",document."FINDoc_ID",line."FINDocLine_ID" limit p_limit
  ) source
  on conflict (legal_entity_id,jurisdiction_code,source_kind,source_id,source_version) do nothing;
  get diagnostics v_inserted=row_count;
  v_after:=public.multideck_uk_vat_source_coverage(p_actor,p_entity);
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordKeyJSON","AuditEvent_Action",
    "AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxEvidence','indirect_tax_evidence',jsonb_build_object('legalEntityId',p_entity),
    'historical_backfill',btrim(p_reason),
    'UK VAT posted-line evidence backfill',jsonb_build_object('inserted',v_inserted,
      'missingBefore',v_before->'missingCapturedLines','missingAfter',v_after->'missingCapturedLines'));
  return jsonb_build_object('inserted',v_inserted,'coverage',v_after);
end; $$;

create or replace function public._multideck_uk_vat_calculate_core(p_actor uuid,p_period_id uuid,p_persist boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_pack record;
  v_row record; v_entry jsonb; v_entries jsonb:='[]'::jsonb; v_sources jsonb:='[]'::jsonb;
  v_registration_snapshot jsonb; v_boxes jsonb; v_control jsonb;
  v_amounts numeric[]:=array_fill(0::numeric,array[9]);
  v_missing integer; v_unreviewed integer; v_unmigrated integer; v_other_sources integer;
  v_invalid_opening integer;
  v_clawback_risks integer;
  v_revision integer; v_calculation uuid; v_digest text; v_version text;
  v_ledger_checked integer; v_ledger_mismatched integer; v_ledger_sample jsonb;
  v_ledger_digest text; v_method1_fingerprints jsonb:='[]'::jsonb;
  v_repayment_fingerprints jsonb:='[]'::jsonb;
  v_later_fingerprints jsonb:='[]'::jsonb; v_later_event_count integer:=0;
  v_later_posting record; v_later_fingerprint text;
  v_adjustment_fingerprint text;
begin
  select * into v_period from public."FIN_IndirectTaxPeriods" where id=p_period_id for update;
  if not found or v_period.jurisdiction_code<>'GB' then raise exception 'UK VAT period was not found.' using errcode='P0002'; end if;
  perform public._multideck_uk_vat_access(p_actor,v_period.legal_entity_id);
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||v_period.legal_entity_id::text,0));
  if p_persist is null or (p_persist and v_period.status<>'draft')
    or (not p_persist and v_period.status not in ('draft','review_locked'))
    or v_period.scheme_code not in ('standard','annual') or v_period.reporting_currency<>'GBP' then
    raise exception 'This VAT period is not a supported GBP draft or review lock.' using errcode='22023';
  end if;
  if (select upper("LegalEntity_BaseCurrencyCodeSnapshot") from public."cmp_LegalEntities"
      where "LegalEntity_ID"=v_period.legal_entity_id)<>'GBP' then
    raise exception 'The legal entity no longer has a GBP native ledger.' using errcode='22023';
  end if;
  select * into v_registration from public."FIN_LegalEntityComplianceRegistrations"
    where "FINComplianceReg_ID"=v_period.registration_id and "FINComplianceReg_LegalEntityID"=v_period.legal_entity_id
      and "FINComplianceReg_ObligationID"=v_period.obligation_id;
  if not found or v_registration."FINComplianceReg_StatusCode" not in ('configured','sandbox_verified','production_verified')
    or not coalesce(v_registration."FINComplianceReg_RegistrationReference" ~ '^[0-9]{9}$',false)
    or v_registration."FINComplianceReg_SettingsJSON"->>'schemeCode' is distinct from v_period.scheme_code
    or v_registration."FINComplianceReg_EffectiveFrom">v_period.start_date
    or (v_registration."FINComplianceReg_EffectiveTo" is not null and v_registration."FINComplianceReg_EffectiveTo"<v_period.end_date) then
    raise exception 'UK VAT registration or scheme changed; review the period setup.' using errcode='22023';
  end if;
  select pack."FINLocPack_ID" pack_id,pack."FINLocPack_Version" pack_version,
    pack."FINLocPack_ComplianceStatusCode" pack_status,obligation."FINCompliance_Code" obligation_code
    into v_pack
    from public."FIN_ComplianceObligations" obligation
    join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    where obligation."FINCompliance_ID"=v_period.obligation_id and obligation."FINCompliance_Code"='gb-vat-mtd';
  if not found then raise exception 'The UK VAT rule pack changed or is missing.' using errcode='22023'; end if;
  -- Compare the ledger itself to captured candidates. An older posted source
  -- without a VAT event or any unresolved candidate blocks calculation.
  select count(*) into v_missing from public."FIN_Documents" doc
    join public."FIN_DocumentLines" line on line."FINDocLine_DocumentID"=doc."FINDoc_ID"
    where doc."FINDoc_LegalEntityID"=v_period.legal_entity_id
      and doc."FINDoc_NativePostingStatusCode"='posted'
      and doc."FINDoc_OpeningBalancePackageID" is null
      and not exists(select 1 from public."FIN_IndirectTaxEvidence" evidence
        where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
          and evidence.source_kind='posted_document_line' and evidence.source_document_line_id=line."FINDocLine_ID"
          and evidence.source_posting_batch_id=doc."FINDoc_NativePostingBatchID");
  select count(*) into v_invalid_opening from public."FIN_Documents" doc
    where doc."FINDoc_LegalEntityID"=v_period.legal_entity_id
      and doc."FINDoc_NativePostingStatusCode"='posted'
      and doc."FINDoc_OpeningBalancePackageID" is not null
      and not public._multideck_uk_vat_opening_document_ready(
        doc."FINDoc_ID",doc."FINDoc_LegalEntityID",
        doc."FINDoc_OpeningBalancePackageID",doc."FINDoc_TypeCode");
  if v_invalid_opening<>0 then
    raise exception 'Opening balance VAT exclusions lack reviewed historical filing evidence.' using errcode='22023';
  end if;
  select count(*) into v_unmigrated from public."FIN_Documents" doc
    where doc."FINDoc_LegalEntityID"=v_period.legal_entity_id
      and doc."FINDoc_NativePostingStatusCode" in ('pending_migration','reversed');
  select count(*) into v_unreviewed from public."FIN_IndirectTaxEvidence" evidence
    where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
      and not exists(select 1 from public."FIN_IndirectTaxDecisions" decision where decision.evidence_id=evidence.id);
  select count(*) into v_other_sources from public."FIN_IndirectTaxEvidence" evidence
    where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
      and evidence.source_kind not in ('posted_document_line','adjustment');
  select v_other_sources+count(*) into v_other_sources
    from public."FIN_IndirectTaxEvidence" evidence
    where evidence.legal_entity_id=v_period.legal_entity_id
      and evidence.jurisdiction_code='GB' and evidence.source_kind='adjustment'
      and not exists(select 1 from public."FIN_IndirectTaxPriorErrorMethod1PostingItems" linked
        where linked.evidence_id=evidence.id and linked.legal_entity_id=v_period.legal_entity_id)
      and not exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" linked
        where linked.evidence_id=evidence.id and linked.legal_entity_id=v_period.legal_entity_id)
      and not exists(select 1 from public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents" linked
        where linked.evidence_id=evidence.id and linked.legal_entity_id=v_period.legal_entity_id);
  if v_missing<>0 or v_unmigrated<>0 or v_unreviewed<>0 or v_other_sources<>0 then
    raise exception 'VAT source review is incomplete: % missing posted lines, % pending/reversed documents, % unreviewed events, % unsupported source kinds.',
      v_missing,v_unmigrated,v_unreviewed,v_other_sources using errcode='22023';
  end if;
  -- Validate every current-period later-payment posting, including a
  -- reviewed payment with no penny of additional recoverable VAT.
  for v_later_posting in
    select posted.id,posted.event_count from public."FIN_IndirectTaxLaterInputTaxRestorationPostings" posted
    where posted.period_id=v_period.id and posted.legal_entity_id=v_period.legal_entity_id
    order by posted.id
  loop
    v_later_fingerprint:=public._multideck_uk_vat_later_restoration_posting_fingerprint(
      p_actor,v_later_posting.id);
    v_later_fingerprints:=v_later_fingerprints||jsonb_build_array(jsonb_build_object(
      'postingId',v_later_posting.id,'postingFingerprint',v_later_fingerprint));
    v_later_event_count:=v_later_event_count+v_later_posting.event_count;
  end loop;
  select count(*)::integer into v_clawback_risks
    from public._multideck_uk_vat_unpaid_input_tax_risk_rows(
      v_period.legal_entity_id,v_period.end_date) risk
    where not exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentPostings" posted
      join public."FIN_IndirectTaxPeriods" posting_period on posting_period.id=posted.period_id
      join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=posted.batch_id
      where posted.legal_entity_id=v_period.legal_entity_id
        and posted.document_id=risk.document_id
        and posting_period.end_date<=v_period.end_date
        and batch."FINPostBatch_StatusCode"='posted'
        and posted.unpaid_at_period_end<=risk.unpaid_at_period_end)
      and not exists(select 1 from public."FIN_IndirectTaxLaterInputTaxRestorationPostings" posted
        join public."FIN_IndirectTaxPeriods" posting_period on posting_period.id=posted.period_id
        where posted.legal_entity_id=v_period.legal_entity_id
          and posted.document_id=risk.document_id
          and posting_period.end_date<=v_period.end_date
          and (posted.period_id=v_period.id or posting_period.status='review_locked')
          and posted.unpaid_at_period_end_gbp<=risk.unpaid_at_period_end);
  if v_clawback_risks<>0 then
    raise exception '% supplier invoices need a reviewed six-month input VAT repayment or later payment restoration before this period can be calculated.',v_clawback_risks
      using errcode='22023';
  end if;
  v_registration_snapshot:=jsonb_build_object(
    'registrationId',v_registration."FINComplianceReg_ID",
    'vrn',v_registration."FINComplianceReg_RegistrationReference",
    'status',v_registration."FINComplianceReg_StatusCode",
    'scheme',v_period.scheme_code,'effectiveFrom',v_registration."FINComplianceReg_EffectiveFrom",
    'effectiveTo',v_registration."FINComplianceReg_EffectiveTo",
    -- JSONB text is part of the source digest. A timestamptz rendered in the
    -- session time zone would make unchanged evidence hash differently.
    'updatedAt',to_char(v_registration."FINComplianceReg_UpdatedAt" at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )||jsonb_build_object('packId',v_pack.pack_id,'packVersion',v_pack.pack_version,
    'packStatus',v_pack.pack_status,'obligationCode',v_pack.obligation_code);
  for v_row in
    select evidence.*, decision.id decision_id,decision.tax_point,decision.treatment_code,
      decision.rule_snapshot,decision.reviewed_rule_reference,decision.tax_code_id
    from public."FIN_IndirectTaxEvidence" evidence
    join lateral (
      select * from public."FIN_IndirectTaxDecisions" d where d.evidence_id=evidence.id
      order by d.revision desc limit 1
    ) decision on true
    where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
      and decision.tax_point between v_period.start_date and v_period.end_date
    order by evidence.id
  loop
    v_adjustment_fingerprint:=null;
    if exists(select 1 from public."FIN_IndirectTaxReconciliations" signed
      where signed.evidence_id=v_row.id and signed.period_id<>v_period.id) then
      raise exception 'VAT evidence % was signed in another period; record a correction event.',v_row.id using errcode='22023';
    end if;
    if v_row.source_kind='posted_document_line' then
    if not exists(select 1 from public."FIN_Documents" doc
      join public."FIN_DocumentLines" source_line
        on source_line."FINDocLine_ID"=v_row.source_document_line_id
        and source_line."FINDocLine_DocumentID"=doc."FINDoc_ID"
      where doc."FINDoc_ID"=v_row.source_document_id
        and doc."FINDoc_LegalEntityID"=v_row.legal_entity_id
        and doc."FINDoc_NativePostingStatusCode"='posted'
        and doc."FINDoc_NativePostingBatchID"=v_row.source_posting_batch_id
        and doc."FINDoc_CurrencyCodeSnapshot"=v_row.currency_code
        and doc."FINDoc_ExchangeRate"=v_row.exchange_rate
        and (v_row.source_document_date is null or doc."FINDoc_DocumentDate"=v_row.source_document_date)
        and source_line."FINDocLine_NetAmount"=v_row.signed_net_amount
        and source_line."FINDocLine_TaxAmount"=v_row.signed_tax_amount
        and source_line."FINDocLine_LocalNetAmount"=v_row.signed_net_reporting
        and source_line."FINDocLine_LocalTaxAmount"=v_row.signed_tax_reporting)
      or not exists(select 1 from public."FIN_TaxCodes" tax
        where tax."FINTax_ID"=v_row.tax_code_id and tax."FINTax_LegalEntityID"=v_period.legal_entity_id
          and tax."FINTax_ApprovedAt"=(v_row.rule_snapshot->>'approvedAt')::timestamptz
          and tax."FINTax_Code"=v_row.rule_snapshot->>'code'
          and tax."FINTax_RatePercent"=(v_row.rule_snapshot->>'ratePercent')::numeric
          and tax."FINTax_TreatmentCategoryCode"=v_row.rule_snapshot->>'category'
          and tax."FINTax_IsRecoverable"=(v_row.rule_snapshot->>'recoverable')::boolean
          and tax."FINTax_EffectiveFrom"=(v_row.rule_snapshot->>'effectiveFrom')::date
          and tax."FINTax_EffectiveTo" is not distinct from (v_row.rule_snapshot->>'effectiveTo')::date
          and tax."FINTax_EffectiveFrom"<=v_row.tax_point
          and (tax."FINTax_EffectiveTo" is null or tax."FINTax_EffectiveTo">=v_row.tax_point)) then
      raise exception 'VAT source or approved treatment changed; review evidence % again.',v_row.id using errcode='22023';
    end if;
    elsif v_row.source_kind='adjustment' then
      if exists(select 1 from public."FIN_IndirectTaxPriorErrorMethod1PostingItems" linked
        where linked.evidence_id=v_row.id and linked.discovery_period_id=v_period.id) then
        v_adjustment_fingerprint:=public._multideck_uk_vat_method1_source_fingerprint(v_row.id,v_period.id);
        v_method1_fingerprints:=v_method1_fingerprints||jsonb_build_array(jsonb_build_object(
          'evidenceId',v_row.id,'postingFingerprint',v_adjustment_fingerprint));
      elsif exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" linked
        where linked.evidence_id=v_row.id and linked.period_id=v_period.id) then
        v_adjustment_fingerprint:=public._multideck_uk_vat_repayment_source_fingerprint(
          p_actor,v_row.id,v_period.id);
        v_repayment_fingerprints:=v_repayment_fingerprints||jsonb_build_array(jsonb_build_object(
          'evidenceId',v_row.id,'postingFingerprint',v_adjustment_fingerprint));
      elsif exists(select 1 from public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents" linked
        where linked.evidence_id=v_row.id and linked.period_id=v_period.id) then
        null; -- The complete posting was checked and fingerprinted above.
      else
        raise exception 'Unsupported UK VAT adjustment evidence %.',v_row.id using errcode='22023';
      end if;
    else
      raise exception 'Unsupported UK VAT source kind %.',v_row.source_kind using errcode='22023';
    end if;
    if v_row.treatment_code='domestic_sale' then
      v_amounts[1]:=v_amounts[1]+v_row.signed_tax_reporting;
      v_amounts[6]:=v_amounts[6]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',1,'amount',v_row.signed_tax_reporting),
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',6,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code in ('zero_rated_sale','exempt_sale','outside_uk_service_sale') then
      if v_row.signed_tax_amount<>0 or v_row.signed_tax_reporting<>0 then
        raise exception 'A zero-UK-VAT sale has source VAT.' using errcode='22023';
      end if;
      v_amounts[6]:=v_amounts[6]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',6,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code='domestic_purchase' then
      v_amounts[4]:=v_amounts[4]+v_row.signed_tax_reporting;
      v_amounts[7]:=v_amounts[7]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',4,'amount',v_row.signed_tax_reporting),
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',7,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code='nonrecoverable_purchase' then
      v_amounts[7]:=v_amounts[7]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',7,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code in ('zero_rated_purchase','exempt_purchase') then
      if v_row.signed_tax_amount<>0 or v_row.signed_tax_reporting<>0 then
        raise exception 'Zero-rated or exempt purchase evidence has VAT.' using errcode='22023';
      end if;
      v_amounts[7]:=v_amounts[7]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',7,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code='prior_error_method1_output' then
      v_amounts[1]:=v_amounts[1]+v_row.signed_tax_reporting;
      v_amounts[6]:=v_amounts[6]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',1,'amount',v_row.signed_tax_reporting),
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',6,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code='prior_error_method1_input' then
      v_amounts[4]:=v_amounts[4]+v_row.signed_tax_reporting;
      v_amounts[7]:=v_amounts[7]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',4,'amount',v_row.signed_tax_reporting),
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',7,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code in ('input_tax_six_month_repayment','input_tax_payment_restoration',
      'input_tax_later_payment_restoration') then
      if v_row.source_kind<>'adjustment' or v_row.signed_net_reporting<>0 then
        raise exception 'Supplier input VAT repayment must be a tax-only adjustment.' using errcode='22023';
      end if;
      v_amounts[4]:=v_amounts[4]+v_row.signed_tax_reporting;
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object(
        'evidence',v_row.id,'decision',v_row.decision_id,'box',4,'amount',v_row.signed_tax_reporting));
    else
      raise exception 'UK VAT treatment % is unsupported in the standard draft.',v_row.treatment_code using errcode='22023';
    end if;
    v_sources:=v_sources||jsonb_build_array(jsonb_build_object('evidence',v_row.id,
      'decision',v_row.decision_id,'taxPoint',v_row.tax_point,'treatment',v_row.treatment_code,
      'net',v_row.signed_net_reporting,'vat',v_row.signed_tax_reporting,
      'sourceVersion',v_row.source_version,'rule',v_row.reviewed_rule_reference));
  end loop;
  if jsonb_array_length(v_repayment_fingerprints)<>
    (select count(*) from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" posted_event
      where posted_event.period_id=v_period.id
        and posted_event.legal_entity_id=v_period.legal_entity_id) then
    raise exception 'A posted supplier input VAT adjustment is missing from this period calculation.' using errcode='22023';
  end if;
  if v_later_event_count<>
    (select count(*) from public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents" posted_event
      where posted_event.period_id=v_period.id
        and posted_event.legal_entity_id=v_period.legal_entity_id) then
    raise exception 'A later supplier VAT restoration event is missing from this period calculation.' using errcode='22023';
  end if;
  -- HMRC validates box 3 against the submitted boxes 1 and 2, and box 5
  -- against the submitted boxes 3 and 4. Round those inputs first; source
  -- lines and the control bridge retain their four-decimal amounts.
  v_amounts[3]:=round(v_amounts[1],2)+round(v_amounts[2],2);
  v_amounts[5]:=abs(v_amounts[3]-round(v_amounts[4],2));
  v_boxes:=jsonb_build_object('1',round(v_amounts[1],2),'2',round(v_amounts[2],2),
    '3',round(v_amounts[3],2),'4',round(v_amounts[4],2),'5',round(v_amounts[5],2),
    '6',round(v_amounts[6],2),'7',round(v_amounts[7],2),'8',round(v_amounts[8],2),'9',round(v_amounts[9],2));
  -- Match each reviewed VAT source to the native journal lines that actually
  -- posted it. This is a source check, not a whole-period VAT control balance:
  -- timing differences and other journal sources remain unreconciled.
  with checked as (
    select evidence.id evidence_id,evidence.source_document_id document_id,
      evidence.source_document_line_id document_line_id,
      evidence.signed_net_reporting net_gbp,evidence.signed_tax_reporting vat_gbp,
      doc."FINDoc_TypeCode" document_type,
      (doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false) nonrecoverable_purchase,
      batch."FINPostBatch_StatusCode" batch_status,
      batch."FINPostBatch_LegalEntityID" batch_entity,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_Description" not like 'Tax:%'
        and line."FINPostLine_Description" not like 'Nonrecoverable tax:%') net_lines,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_Description" like 'Tax:%'
        or line."FINPostLine_Description" like 'Nonrecoverable tax:%') tax_lines,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_NominalAccountID"=expected.nominal_id
        and ((doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false
          and line."FINPostLine_Description" like 'Nonrecoverable tax:%')
          or (not (doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false)
          and line."FINPostLine_Description" like 'Tax:%'))) tax_nominal_lines,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_Description" not like 'Tax:%'
        and line."FINPostLine_Description" not like 'Nonrecoverable tax:%'
        and line."FINPostLine_NominalAccountID"=expected.nominal_id
        and not (doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false)) misplaced_net_lines,
      expected.nominal_id expected_tax_nominal_id,
      expected_nominal."FINNom_Code" expected_tax_nominal_code,
      coalesce(jsonb_agg(distinct line."FINPostLine_NominalAccountID") filter
        (where line."FINPostLine_Description" like 'Tax:%'
          or line."FINPostLine_Description" like 'Nonrecoverable tax:%'),'[]'::jsonb) posted_tax_nominal_ids,
      coalesce(jsonb_agg(distinct posted_nominal."FINNom_Code") filter
        (where (line."FINPostLine_Description" like 'Tax:%'
          or line."FINPostLine_Description" like 'Nonrecoverable tax:%')
          and posted_nominal."FINNom_Code" is not null),'[]'::jsonb) posted_tax_nominal_codes,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_NominalAccountID" is null
        or line."FINPostLine_CurrencyCodeSnapshot"<>'GBP') invalid_lines,
      encode(sha256(convert_to(coalesce(batch."FINPostBatch_StatusCode",'')||
        coalesce(batch."FINPostBatch_LegalEntityID"::text,'')||doc."FINDoc_TypeCode"||
        coalesce(expected.nominal_id::text,'')||
        coalesce(jsonb_agg(jsonb_build_object(
        'id',line."FINPostLine_ID",'nominal',line."FINPostLine_NominalAccountID",
        'debit',line."FINPostLine_DebitAmount",'credit',line."FINPostLine_CreditAmount",
        'currency',line."FINPostLine_CurrencyCodeSnapshot",'description',line."FINPostLine_Description")
        order by line."FINPostLine_ID") filter (where line."FINPostLine_ID" is not null),'[]'::jsonb)::text,'UTF8')),'hex') posting_digest,
      coalesce(sum(line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount")
        filter (where line."FINPostLine_Description" not like 'Tax:%'
          and line."FINPostLine_Description" not like 'Nonrecoverable tax:%'),0) net_posted,
      coalesce(sum(line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount")
        filter (where line."FINPostLine_Description" like 'Tax:%'
          or line."FINPostLine_Description" like 'Nonrecoverable tax:%'),0) tax_posted
    from public."FIN_IndirectTaxEvidence" evidence
    join lateral (select d.tax_point from public."FIN_IndirectTaxDecisions" d
      where d.evidence_id=evidence.id order by d.revision desc limit 1) decision on true
    join public."FIN_Documents" doc on doc."FINDoc_ID"=evidence.source_document_id
    left join public."FIN_DocumentLines" document_line
      on document_line."FINDocLine_ID"=evidence.source_document_line_id
      and document_line."FINDocLine_DocumentID"=evidence.source_document_id
    left join public."FIN_TaxCodes" tax
      on tax."FINTax_ID"=document_line."FINDocLine_TaxCodeID"
      and tax."FINTax_LegalEntityID"=v_period.legal_entity_id
    left join lateral (select public._multideck_finance_resolve_nominal(
      v_period.legal_entity_id,
      case when doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false
        then document_line."FINDocLine_NominalAccountID"
        when doc."FINDoc_TypeCode" in ('sl_invoice','credit_note')
        then tax."FINTax_OutputNominalID" else tax."FINTax_InputNominalID" end,
      case when doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false then '5000'
        when doc."FINDoc_TypeCode" in ('sl_invoice','credit_note') then '2100' else '1200' end
    ) nominal_id) expected on true
    left join public."FIN_NominalAccounts" expected_nominal
      on expected_nominal."FINNom_ID"=expected.nominal_id
      and expected_nominal."FINNom_LegalEntityID"=v_period.legal_entity_id
    left join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=evidence.source_posting_batch_id
    left join public."FIN_PostingLines" line on line."FINPostLine_BatchID"=evidence.source_posting_batch_id
      and line."FINPostLine_DocumentID"=evidence.source_document_id
      and line."FINPostLine_DocumentLineID"=evidence.source_document_line_id
    left join public."FIN_NominalAccounts" posted_nominal
      on posted_nominal."FINNom_ID"=line."FINPostLine_NominalAccountID"
      and posted_nominal."FINNom_LegalEntityID"=v_period.legal_entity_id
    where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
      and decision.tax_point between v_period.start_date and v_period.end_date
      and evidence.source_kind='posted_document_line'
    group by evidence.id,doc."FINDoc_TypeCode",tax."FINTax_IsRecoverable",batch."FINPostBatch_StatusCode",
      batch."FINPostBatch_LegalEntityID",expected.nominal_id,expected_nominal."FINNom_Code"
  ), evaluated as (
    select *,
      batch_status='posted' and batch_entity=v_period.legal_entity_id and invalid_lines=0
      and document_type in ('sl_invoice','credit_note','pl_invoice','debit_note')
      and net_lines=case when net_gbp=0 then 0 else 1 end
      and tax_lines=case when vat_gbp=0 then 0 else 1 end
      and tax_nominal_lines=tax_lines and misplaced_net_lines=0
      and (vat_gbp=0 or expected_tax_nominal_id is not null)
      and net_posted=case when document_type in ('sl_invoice','debit_note') then -abs(net_gbp) else abs(net_gbp) end
      and tax_posted=case when document_type in ('sl_invoice','debit_note') then -abs(vat_gbp) else abs(vat_gbp) end
      as matched
    from checked
  ), ranked as (
    select *,row_number() over (partition by coalesce(matched,false) order by evidence_id) mismatch_order
    from evaluated
  )
  select count(*)::integer,count(*) filter (where not coalesce(matched,false))::integer,
    coalesce(jsonb_agg(jsonb_build_object('evidenceId',evidence_id,'documentId',document_id,
      'documentLineId',document_line_id,'netGbp',net_gbp,'vatGbp',vat_gbp,
      'documentType',document_type,'batchStatus',batch_status,
      'netPosted',net_posted,'taxPosted',tax_posted,'netLines',net_lines,'taxLines',tax_lines,
      'taxNominalLines',tax_nominal_lines,'misplacedNetLines',misplaced_net_lines,
      'expectedTaxNominalId',expected_tax_nominal_id,'expectedTaxNominalCode',expected_tax_nominal_code,
      'postedTaxNominalIds',posted_tax_nominal_ids,'postedTaxNominalCodes',posted_tax_nominal_codes)
      order by evidence_id) filter (where not coalesce(matched,false) and mismatch_order<=20),'[]'::jsonb),
    encode(sha256(convert_to(coalesce(string_agg(evidence_id::text||posting_digest,'|' order by evidence_id),''),'UTF8')),'hex')
    into v_ledger_checked,v_ledger_mismatched,v_ledger_sample,v_ledger_digest from ranked;
  if jsonb_array_length(v_method1_fingerprints)>0
    or jsonb_array_length(v_repayment_fingerprints)>0
    or jsonb_array_length(v_later_fingerprints)>0 then
    v_ledger_checked:=v_ledger_checked+jsonb_array_length(v_method1_fingerprints)
      +jsonb_array_length(v_repayment_fingerprints)+v_later_event_count;
    v_ledger_digest:=encode(sha256(convert_to(v_ledger_digest||v_method1_fingerprints::text||
      v_repayment_fingerprints::text||v_later_fingerprints::text,'UTF8')),'hex');
  end if;
  v_control:=jsonb_build_object('status','unreconciled',
    'reason','Whole-period VAT control balance and timing differences require review before approval',
    'sourceLedger',jsonb_build_object('status',case when v_ledger_mismatched=0 then 'matched' else 'mismatch' end,
      'checked',v_ledger_checked,'mismatched',v_ledger_mismatched,
      'postingDigest',v_ledger_digest,'mismatchSample',v_ledger_sample));
  v_version:=case when v_period.scheme_code='annual' then 'uk-annual-v3'
    when jsonb_array_length(v_later_fingerprints)>0
      and (jsonb_array_length(v_method1_fingerprints)>0
        or jsonb_array_length(v_repayment_fingerprints)>0)
      then 'uk-standard-adjustments-v2'
    when jsonb_array_length(v_later_fingerprints)>0 then 'uk-standard-later-restoration-v1'
    when jsonb_array_length(v_method1_fingerprints)>0 and jsonb_array_length(v_repayment_fingerprints)>0
      then 'uk-standard-adjustments-v1'
    when jsonb_array_length(v_repayment_fingerprints)>0 then 'uk-standard-input-tax-repayment-v1'
    when jsonb_array_length(v_method1_fingerprints)>0 then 'uk-standard-method1-v1'
    else 'uk-standard-v5' end;
  v_digest:=encode(sha256(convert_to(v_version||v_period.id::text||
    v_registration_snapshot::text||v_sources::text||v_boxes::text||v_ledger_digest,'UTF8')),'hex');
  if not p_persist then
    return jsonb_build_object('periodId',p_period_id,'boxes',v_boxes,
      'sourceDigest',v_digest,'calculationVersion',v_version,
      'sourceLedger',v_control->'sourceLedger','previewOnly',true);
  end if;
  select coalesce(max(revision),0)+1 into v_revision from public."FIN_IndirectTaxCalculations" where period_id=p_period_id;
  insert into public."FIN_IndirectTaxCalculations"(
    period_id,revision,calculation_version,source_digest,registration_snapshot,
    box_totals,exceptions,control_reconciliation,calculated_by
  ) values (p_period_id,v_revision,v_version,v_digest,v_registration_snapshot,
    v_boxes,'[]'::jsonb,v_control,p_actor) returning id into v_calculation;
  for v_entry in select value from jsonb_array_elements(v_entries) loop
    insert into public."FIN_IndirectTaxCalculationLines"(
      calculation_id,period_id,evidence_id,decision_id,box_number,signed_amount
    ) values (v_calculation,p_period_id,(v_entry->>'evidence')::uuid,(v_entry->>'decision')::uuid,
      (v_entry->>'box')::smallint,(v_entry->>'amount')::numeric);
  end loop;
  return jsonb_build_object('calculationId',v_calculation,'revision',v_revision,'boxes',v_boxes,
    'sourceDigest',v_digest,'controlStatus','unreconciled',
    'sourceLedger',v_control->'sourceLedger','approvalAvailable',false);
end; $$;

commit;
