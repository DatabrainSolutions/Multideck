begin;

-- Billing-party correction posts a separate, exact reversal and replacement.
-- Link only its reversal evidence to the original line. This is an accounting
-- correction trail; it does not classify a previously filed VAT return error.
create function public._multideck_indirect_tax_reversal_evidence_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.source_kind<>'posted_document_line' or new.reverses_evidence_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public."FIN_Documents" reversal
    join public."FIN_DocumentLines" reversal_line
      on reversal_line."FINDocLine_ID"=new.source_document_line_id
      and reversal_line."FINDocLine_DocumentID"=reversal."FINDoc_ID"
    join public."FIN_Documents" source
      on source."FINDoc_ID"=reversal."FINDoc_SourceID"
      and source."FINDoc_LegalEntityID"=reversal."FINDoc_LegalEntityID"
    join public."FIN_DocumentLines" source_line
      on source_line."FINDocLine_DocumentID"=source."FINDoc_ID"
      and source_line."FINDocLine_LineNo"=reversal_line."FINDocLine_LineNo"
    join public."FIN_IndirectTaxEvidence" original
      on original.id=new.reverses_evidence_id
      and original.source_document_line_id=source_line."FINDocLine_ID"
      and original.source_document_id=source."FINDoc_ID"
      and original.source_posting_batch_id=source."FINDoc_NativePostingBatchID"
      and original.legal_entity_id=new.legal_entity_id
      and original.jurisdiction_code=new.jurisdiction_code
      and original.source_kind='posted_document_line'
    where reversal."FINDoc_ID"=new.source_document_id
      and reversal."FINDoc_LegalEntityID"=new.legal_entity_id
      and reversal."FINDoc_SourceTable"='FIN_Documents'
      and reversal."FINDoc_MetadataJSON"->>'billingPartyCorrection'='true'
      and reversal."FINDoc_MetadataJSON"->>'correctionRole'='reversal'
      and reversal."FINDoc_MetadataJSON"->>'sourceDocumentId'=source."FINDoc_ID"::text
      and reversal."FINDoc_NativePostingBatchID"=new.source_posting_batch_id
      and source."FINDoc_NativePostingStatusCode"='posted'
      and source."FINDoc_CurrencyCodeSnapshot"=reversal."FINDoc_CurrencyCodeSnapshot"
      and source."FINDoc_ExchangeRate"=reversal."FINDoc_ExchangeRate"
      and (source."FINDoc_TypeCode",reversal."FINDoc_TypeCode") in
        (('sl_invoice','credit_note'),('credit_note','sl_invoice'),
         ('pl_invoice','debit_note'),('debit_note','pl_invoice'))
      and source_line."FINDocLine_NetAmount"=-reversal_line."FINDocLine_NetAmount"
      and source_line."FINDocLine_TaxAmount"=-reversal_line."FINDocLine_TaxAmount"
      and source_line."FINDocLine_LocalNetAmount"=-reversal_line."FINDocLine_LocalNetAmount"
      and source_line."FINDocLine_LocalTaxAmount"=-reversal_line."FINDocLine_LocalTaxAmount"
  ) then
    raise exception 'VAT reversal evidence must match its posted original line and correction document.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_indirect_tax_reversal_evidence_guard()
  from public,anon,authenticated;
create trigger indirect_tax_reversal_evidence_guard before insert
  on public."FIN_IndirectTaxEvidence" for each row
  execute function public._multideck_indirect_tax_reversal_evidence_guard();

create or replace function public._multideck_indirect_tax_capture_posted_document()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_reversal boolean;
  v_source public."FIN_Documents"%rowtype;
  v_line public."FIN_DocumentLines"%rowtype;
  v_original uuid;
begin
  if new."FINDoc_NativePostingStatusCode"<>'posted' then return new; end if;
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

commit;
