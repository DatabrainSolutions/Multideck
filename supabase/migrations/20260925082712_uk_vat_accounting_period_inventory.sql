begin;

-- A monthly close must bind to its own accounting period. A VAT return review
-- covers a different date range and cannot clear this control by implication.
create function public.multideck_uk_vat_accounting_period_inventory(
  p_actor uuid,p_entity uuid,p_period uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_period public."FIN_Periods"%rowtype;
  v_currency text; v_country text; v_result jsonb; v_orphans jsonb; v_documents jsonb;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View');
  select * into v_period from public."FIN_Periods"
    where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity;
  if not found then
    raise exception 'Accounting period is unavailable for this legal entity.' using errcode='42501';
  end if;
  select upper("LegalEntity_BaseCurrencyCodeSnapshot"),"LegalEntity_CountryCode"
    into v_currency,v_country
    from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
  if v_currency is distinct from 'GBP' or v_country is distinct from 'GB' then
    raise exception 'UK VAT accounting-period control requires a GB/GBP legal entity.' using errcode='22023';
  end if;

  -- Orphan VAT evidence is part of the fingerprint even when no control line
  -- exists. A missing or duplicate source link never becomes a clean close.
  select jsonb_build_object('count',count(*),'digest',encode(sha256(convert_to(
    coalesce(jsonb_agg(jsonb_build_object('id',e.id,'batch',e.source_posting_batch_id,
      'source',e.source_id,'tax',e.signed_tax_reporting) order by e.id),'[]'::jsonb)::text,
    'UTF8')),'hex')) into v_orphans
  from public."FIN_IndirectTaxEvidence" e
  where e.legal_entity_id=p_entity and e.jurisdiction_code='GB'
    and e.source_kind in ('posted_document_line','adjustment')
    and e.signed_tax_reporting<>0
    and e.source_posting_batch_id is not null
    and exists(select 1 from public."FIN_PostingBatches" b
      where b."FINPostBatch_ID"=e.source_posting_batch_id
        and b."FINPostBatch_LegalEntityID"=p_entity
        and b."FINPostBatch_PeriodID"=p_period
        and b."FINPostBatch_StatusCode"='posted')
    and not exists(select 1 from public."FIN_PostingLines" l
      where l."FINPostLine_BatchID"=e.source_posting_batch_id
        and ((e.source_kind='posted_document_line'
          and l."FINPostLine_DocumentID"=e.source_document_id
          and l."FINPostLine_DocumentLineID"=e.source_document_line_id
          and (l."FINPostLine_Description" like 'Tax:%'
            or l."FINPostLine_Description" like 'Nonrecoverable tax:%'))
          or (e.source_kind='adjustment' and l."FINPostLine_ID"=e.source_id)));

  -- This second side of coverage catches a posted source whose VAT evidence
  -- and tax posting are both absent, which a GL-only inventory cannot see.
  with document_sources as (
    select document."FINDoc_ID" document_id,line."FINDocLine_ID" line_id,
      document."FINDoc_NativePostingBatchID" batch_id,
      line."FINDocLine_LocalTaxAmount" tax_gbp,
      exists(select 1 from public."FIN_IndirectTaxEvidence" e
        where e.legal_entity_id=p_entity and e.jurisdiction_code='GB'
          and e.source_kind='posted_document_line'
          and e.source_document_id=document."FINDoc_ID"
          and e.source_document_line_id=line."FINDocLine_ID"
          and e.source_posting_batch_id=document."FINDoc_NativePostingBatchID") has_evidence,
      exists(select 1 from public."FIN_PostingLines" posting
        join public."FIN_PostingBatches" batch
          on batch."FINPostBatch_ID"=posting."FINPostLine_BatchID"
          and batch."FINPostBatch_LegalEntityID"=p_entity
          and batch."FINPostBatch_PeriodID"=p_period
          and batch."FINPostBatch_StatusCode"='posted'
        where posting."FINPostLine_BatchID"=document."FINDoc_NativePostingBatchID"
          and posting."FINPostLine_DocumentID"=document."FINDoc_ID"
          and posting."FINPostLine_DocumentLineID"=line."FINDocLine_ID"
          and (posting."FINPostLine_Description" like 'Tax:%'
            or posting."FINPostLine_Description" like 'Nonrecoverable tax:%')) has_tax_posting
    from public."FIN_Documents" document
    join public."FIN_DocumentLines" line
      on line."FINDocLine_DocumentID"=document."FINDoc_ID"
    where document."FINDoc_LegalEntityID"=p_entity
      and document."FINDoc_PeriodID"=p_period
      and document."FINDoc_NativePostingStatusCode"='posted'
      and (document."FINDoc_OpeningBalancePackageID" is null
        or not public._multideck_uk_vat_opening_document_ready(
          document."FINDoc_ID",p_entity,
          document."FINDoc_OpeningBalancePackageID",document."FINDoc_TypeCode"))
  )
  select jsonb_build_object('count',count(*) filter (where not has_evidence
      or (tax_gbp<>0 and not has_tax_posting)),
    'digest',encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
      'document',document_id,'line',line_id,'batch',batch_id,
      'taxGbp',tax_gbp,'evidence',has_evidence,'taxPosting',has_tax_posting)
      order by document_id,line_id),'[]'::jsonb)::text,'UTF8')),'hex'))
    into v_documents from document_sources;

  with tax_accounts as (
    select n."FINNom_ID" id from public."FIN_NominalAccounts" n
    where n."FINNom_LegalEntityID"=p_entity
      and (lower(coalesce(n."FINNom_ControlTypeCode",'')) like '%vat%'
        or n."FINNom_Code" ~ '^(1200|2100)([.]00[.]00)?$'
        or n."FINNom_ID" in (
          select t."FINTax_OutputNominalID" from public."FIN_TaxCodes" t
            where t."FINTax_LegalEntityID"=p_entity and t."FINTax_OutputNominalID" is not null
          union
          select t."FINTax_InputNominalID" from public."FIN_TaxCodes" t
            where t."FINTax_LegalEntityID"=p_entity and t."FINTax_InputNominalID" is not null))
  ), inventory as materialized (
    select l."FINPostLine_ID" line_id,l."FINPostLine_BatchID" batch_id,
      l."FINPostLine_LineNo" line_number,l."FINPostLine_NominalAccountID" nominal_id,
      l."FINPostLine_DocumentID" document_id,l."FINPostLine_DocumentLineID" document_line_id,
      l."FINPostLine_Description" description,
      l."FINPostLine_DebitAmount" debit_gbp,l."FINPostLine_CreditAmount" credit_gbp,
      l."FINPostLine_CurrencyCodeSnapshot" currency,
      b."FINPostBatch_SourceTable" batch_source,b."FINPostBatch_SourceID" batch_source_id,
      b."FINPostBatch_PostedAt" posted_at,
      l."FINPostLine_NominalAccountID" in (select id from tax_accounts) vat_account,
      l."FINPostLine_Description" like 'Tax:%' tax_labelled,
      exists(select 1 from public."FIN_OpeningBalancePackages" opening
        where opening.id=b."FINPostBatch_SourceID"
          and opening.posting_batch_id=b."FINPostBatch_ID"
          and opening.legal_entity_id=p_entity and opening.status='posted'
          and b."FINPostBatch_SourceTable"='FIN_OpeningBalancePackages') opening_excluded,
      source_state.evidence_count,source_state.source_digest,
      source_state.reviewed_count,source_state.cutoff_count,
      source_state.amount_match_count
    from public."FIN_PostingLines" l
    join public."FIN_PostingBatches" b on b."FINPostBatch_ID"=l."FINPostLine_BatchID"
      and b."FINPostBatch_LegalEntityID"=p_entity
      and b."FINPostBatch_PeriodID"=p_period
      and b."FINPostBatch_StatusCode"='posted'
    left join lateral (
      select count(*) evidence_count,
        coalesce(jsonb_agg(jsonb_build_object(
          'evidenceId',e.id,'sourceVersion',e.source_version,
          'sourceKind',e.source_kind,'sourceTax',e.signed_tax_reporting,
          'decisionId',d.id,'revision',d.revision,'taxPoint',d.tax_point,
          'scheme',d.scheme_code,'treatment',d.treatment_code,
          'reconciliationId',r.id,'reconciledAt',r.reconciled_at)
          order by e.id),'[]'::jsonb) source_digest,
        count(*) filter (where d.id is not null) reviewed_count,
        count(*) filter (where d.tax_point is not null and
          d.tax_point not between v_period."FINPeriod_StartDate" and v_period."FINPeriod_EndDate") cutoff_count,
        count(*) filter (where e.signed_tax_reporting<>0
          and abs(e.signed_tax_reporting)=abs(l."FINPostLine_CreditAmount"-l."FINPostLine_DebitAmount")) amount_match_count
      from public."FIN_IndirectTaxEvidence" e
      left join lateral (select decision.* from public."FIN_IndirectTaxDecisions" decision
        where decision.evidence_id=e.id order by decision.revision desc limit 1) d on true
      left join lateral (select reconciliation.* from public."FIN_IndirectTaxReconciliations" reconciliation
        where reconciliation.evidence_id=e.id and reconciliation.decision_id=d.id
        order by reconciliation.reconciled_at desc,reconciliation.id desc limit 1) r on true
      where e.legal_entity_id=p_entity and e.jurisdiction_code='GB'
        and e.source_posting_batch_id=b."FINPostBatch_ID"
        and ((e.source_kind='posted_document_line'
          and e.source_document_id=l."FINPostLine_DocumentID"
          and e.source_document_line_id=l."FINPostLine_DocumentLineID"
          and l."FINPostLine_Description" like 'Tax:%')
          or (e.source_kind='adjustment' and e.source_id=l."FINPostLine_ID"
            and (exists(select 1 from public."FIN_IndirectTaxPriorErrorMethod1PostingItems" m
              where m.evidence_id=e.id and m.tax_posting_line_id=l."FINPostLine_ID"
                and m.legal_entity_id=p_entity)
              or exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" repayment
                where repayment.evidence_id=e.id and repayment.tax_posting_line_id=l."FINPostLine_ID"
                  and repayment.legal_entity_id=p_entity)
              or exists(select 1 from public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents" restoration
                where restoration.evidence_id=e.id and restoration.tax_posting_line_id=l."FINPostLine_ID"
                  and restoration.legal_entity_id=p_entity))))
    ) source_state on true
    where l."FINPostLine_Description" like 'Tax:%'
      or l."FINPostLine_NominalAccountID" in (select id from tax_accounts)
  ), classified as materialized (
    select *,case
      when opening_excluded then 'opening_excluded'
      when currency<>'GBP' or not vat_account or not tax_labelled
        or evidence_count<>1 or reviewed_count<>1 or amount_match_count<>1
        then 'unclassified'
      when cutoff_count>0 then 'cutoff_difference'
      else 'classified' end classification
    from inventory
  )
  select jsonb_build_object(
    'entityId',p_entity,'periodId',p_period,
    'periodStart',v_period."FINPeriod_StartDate",'periodEnd',v_period."FINPeriod_EndDate",
    'scope','posted VAT-control and tax-labelled lines in this accounting period; verified opening batch separately excluded',
    'lineCount',count(*),
    'openingExcludedLines',count(*) filter (where classification='opening_excluded'),
    'unclassifiedLines',count(*) filter (where classification='unclassified'),
    'unreviewedCutoffDifferences',count(*) filter (where classification='cutoff_difference'),
    'orphanEvidence',v_orphans->'count',
    'missingDocumentSources',v_documents->'count',
    'sourceDigest',encode(sha256(convert_to(jsonb_build_object(
      'entity',p_entity,'period',p_period,
      'start',v_period."FINPeriod_StartDate",'end',v_period."FINPeriod_EndDate",
      'lines',coalesce(jsonb_agg(jsonb_build_object(
        'id',line_id,'batch',batch_id,'lineNumber',line_number,
        'nominal',nominal_id,'document',document_id,'documentLine',document_line_id,
        'debit',debit_gbp,'credit',credit_gbp,'currency',currency,
        'description',description,'batchSource',batch_source,
        'batchSourceId',batch_source_id,'postedAt',posted_at,
        'openingExcluded',opening_excluded,'vatAccount',vat_account,
        'evidence',source_digest,'classification',classification)
        order by line_id),'[]'::jsonb),
      'orphans',v_orphans,'documentSources',v_documents)::text,'UTF8')),'hex'),
    'issues',coalesce(jsonb_agg(jsonb_build_object('lineId',line_id,
      'classification',classification,'batchId',batch_id)
      order by line_id) filter (where classification in ('unclassified','cutoff_difference')),'[]'::jsonb)
  ) into v_result from classified;
  return v_result||jsonb_build_object('status',case
    when (v_result->>'unclassifiedLines')::integer=0
      and (v_result->>'unreviewedCutoffDifferences')::integer=0
      and (v_result->>'orphanEvidence')::integer=0
      and (v_result->>'missingDocumentSources')::integer=0
      then 'ready_for_review' else 'blocked' end);
end; $$;

revoke all on function public.multideck_uk_vat_accounting_period_inventory(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_accounting_period_inventory(uuid,uuid,uuid)
  to service_role;

commit;
