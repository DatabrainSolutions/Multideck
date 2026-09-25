begin;

-- The current sign-off can become pending when a new calculation revision is
-- required. Keep the original completed document sign-off date visible without
-- presenting it as approval of that later revision.
create or replace function public.multideck_uk_vat_document_reconciliation(p_actor uuid,p_entity uuid,p_document uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_document public."FIN_Documents"%rowtype; v_total integer; v_signed integer; v_date timestamptz;
  v_source_locked boolean; v_historical_signed integer; v_first_complete_date timestamptz;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select * into v_document from public."FIN_Documents"
    where "FINDoc_ID"=p_document and "FINDoc_LegalEntityID"=p_entity;
  if not found then
    raise exception 'Finance document is unavailable for this legal entity.' using errcode='42501';
  end if;
  select count(*),count(first_signed.reconciled_at),max(first_signed.reconciled_at)
    into v_total,v_historical_signed,v_first_complete_date
  from public."FIN_DocumentLines" line
  left join lateral (
    select min(signed.reconciled_at) reconciled_at
    from public."FIN_IndirectTaxEvidence" evidence
    join public."FIN_IndirectTaxReconciliations" signed on signed.evidence_id=evidence.id
    where evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
      and evidence.source_kind='posted_document_line'
      and evidence.source_document_id=p_document
      and evidence.source_document_line_id=line."FINDocLine_ID"
      and evidence.source_posting_batch_id=v_document."FINDoc_NativePostingBatchID"
  ) first_signed on true
  where line."FINDocLine_DocumentID"=p_document;
  select exists (
    select 1 from public."FIN_IndirectTaxReconciliations" reconciliation
    join public."FIN_IndirectTaxEvidence" evidence on evidence.id=reconciliation.evidence_id
    where evidence.legal_entity_id=p_entity and evidence.source_document_id=p_document
  ) into v_source_locked;
  if v_document."FINDoc_NativePostingStatusCode"<>'posted' then
    return jsonb_build_object('status','not_posted','totalLines',0,'reconciledLines',0,
      'vatReconciledAt',null,'firstCompleteVatReconciledAt',null,'sourceLocked',v_source_locked);
  end if;
  select count(signed.reconciled_at),max(signed.reconciled_at)
    into v_signed,v_date
  from public."FIN_DocumentLines" line
  left join public."FIN_IndirectTaxEvidence" evidence
    on evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
      and evidence.source_kind='posted_document_line'
      and evidence.source_document_line_id=line."FINDocLine_ID"
      and evidence.source_posting_batch_id=v_document."FINDoc_NativePostingBatchID"
  left join lateral (
    select decision.id from public."FIN_IndirectTaxDecisions" decision
    where decision.evidence_id=evidence.id order by decision.revision desc limit 1
  ) latest on true
  left join lateral (
    select reconciliation.reconciled_at from public."FIN_IndirectTaxReconciliations" reconciliation
    join public."FIN_IndirectTaxCalculations" calculation
      on calculation.period_id=reconciliation.period_id
      and calculation.source_digest=reconciliation.source_digest
      and calculation.revision=(select max(current_calculation.revision)
        from public."FIN_IndirectTaxCalculations" current_calculation
        where current_calculation.period_id=reconciliation.period_id)
    join public."FIN_IndirectTaxCalculationLines" calculation_line
      on calculation_line.calculation_id=calculation.id
      and calculation_line.evidence_id=evidence.id
      and calculation_line.decision_id=latest.id
    where reconciliation.evidence_id=evidence.id and reconciliation.decision_id=latest.id
    order by reconciliation.reconciled_at desc,reconciliation.id desc limit 1
  ) signed on true
  where line."FINDocLine_DocumentID"=p_document;
  return jsonb_build_object('status',case when v_total=0 or v_signed=0 then 'pending'
    when v_signed=v_total then 'reconciled' else 'partial' end,
    'totalLines',v_total,'reconciledLines',v_signed,'sourceLocked',v_source_locked,
    'vatReconciledAt',case when v_total>0 and v_signed=v_total then v_date else null end,
    'firstCompleteVatReconciledAt',case when v_total>0 and v_historical_signed=v_total
      then v_first_complete_date else null end);
end; $$;
revoke all on function public.multideck_uk_vat_document_reconciliation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_document_reconciliation(uuid,uuid,uuid) to service_role;

commit;
