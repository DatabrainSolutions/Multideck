begin;

create function public.multideck_uk_vat_supplier_input_tax_history(
  p_actor uuid,p_entity uuid,p_period uuid,p_document uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_first_proposals jsonb; v_first_reviews jsonb;
  v_first_postings jsonb; v_later_reviews jsonb; v_later_postings jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if not exists(select 1 from public."FIN_IndirectTaxPeriods" period
    where period.id=p_period and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB')
    or not exists(select 1 from public."FIN_Documents" document
      where document."FINDoc_ID"=p_document
        and document."FINDoc_LegalEntityID"=p_entity
        and document."FINDoc_TypeCode"='pl_invoice') then
    raise exception 'Supplier VAT period or document is unavailable for this legal entity.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'proposalId',proposal.id,'sourceFingerprint',proposal.source_fingerprint,
    'ruleVersion',proposal.rule_version,
    'originalClaimedInputVatGbp',proposal.original_claimed_input_vat_gbp,
    'unpaidAtFirstDate',proposal.unpaid_at_first_date,
    'unpaidAtPeriodEnd',proposal.unpaid_at_period_end,
    'proposedRepaymentGbp',proposal.proposed_repayment_gbp,
    'proposedRestorationGbp',proposal.proposed_restoration_gbp,
    'proposedBox4DeltaGbp',proposal.proposed_box4_delta_gbp,
    'preparedBy',proposal.prepared_by,'preparedAt',proposal.prepared_at,
    'reason',proposal.reason) order by proposal.prepared_at desc,proposal.id desc),'[]'::jsonb)
    into v_first_proposals
    from public."FIN_IndirectTaxInputTaxRepaymentProposals" proposal
    where proposal.legal_entity_id=p_entity and proposal.period_id=p_period
      and proposal.document_id=p_document;
  select coalesce(jsonb_agg(jsonb_build_object(
    'reviewId',review.id,'proposalId',review.proposal_id,
    'sourceFingerprint',review.source_fingerprint,
    'offsetNominalId',review.offset_nominal_id,
    'reviewedBy',review.reviewed_by,'reviewedAt',review.reviewed_at,
    'reason',review.reason,'revokedAt',revocation.revoked_at)
    order by review.reviewed_at desc,review.id desc),'[]'::jsonb)
    into v_first_reviews
    from public."FIN_IndirectTaxInputTaxRepaymentReviews" review
    left join public."FIN_IndirectTaxInputTaxRepaymentReviewRevocations" revocation
      on revocation.review_id=review.id and revocation.legal_entity_id=p_entity
    where review.legal_entity_id=p_entity and review.period_id=p_period
      and review.document_id=p_document;
  select coalesce(jsonb_agg(jsonb_build_object(
    'postingId',posting.id,'reviewId',posting.review_id,
    'batchId',posting.batch_id,'eventCount',posting.event_count,
    'box4DeltaGbp',posting.box4_delta_gbp,
    'unpaidAtPeriodEnd',posting.unpaid_at_period_end,
    'postedBy',posting.posted_by,'postedAt',posting.posted_at,
    'reason',posting.reason,'events',
      (select coalesce(jsonb_agg(jsonb_build_object(
        'eventDate',event.event_date,'kind',event.event_kind,
        'signedBox4DeltaGbp',event.signed_box4_delta_gbp,
        'evidenceId',event.evidence_id,'decisionId',event.decision_id,
        'taxPostingLineId',event.tax_posting_line_id)
        order by event.event_date,event.id),'[]'::jsonb)
        from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" event
        where event.posting_id=posting.id))
    order by posting.posted_at desc,posting.id desc),'[]'::jsonb)
    into v_first_postings
    from public."FIN_IndirectTaxInputTaxRepaymentPostings" posting
    where posting.legal_entity_id=p_entity and posting.period_id=p_period
      and posting.document_id=p_document;
  select coalesce(jsonb_agg(jsonb_build_object(
    'reviewId',review.id,'revision',review.revision,
    'firstPostingId',review.first_posting_id,
    'sourceFingerprint',review.source_fingerprint,
    'priorRepaymentOutstandingGbp',review.prior_repayment_outstanding_gbp,
    'restorationBox4Gbp',review.restoration_box4_gbp,
    'unpaidAtPeriodEndGbp',review.unpaid_at_period_end_gbp,
    'events',review.source_events,'offsetNominalId',review.offset_nominal_id,
    'reviewedBy',review.reviewed_by,'reviewedAt',review.reviewed_at,
    'reason',review.reason) order by review.revision desc),'[]'::jsonb)
    into v_later_reviews
    from public."FIN_IndirectTaxLaterInputTaxRestorationReviews" review
    where review.legal_entity_id=p_entity and review.period_id=p_period
      and review.document_id=p_document;
  select coalesce(jsonb_agg(jsonb_build_object(
    'postingId',posting.id,'reviewId',posting.review_id,
    'firstPostingId',posting.first_posting_id,
    'status',posting.status,'batchId',posting.batch_id,
    'eventCount',posting.event_count,
    'restorationBox4Gbp',posting.restoration_box4_gbp,
    'remainingRepaymentGbp',posting.remaining_repayment_gbp,
    'unpaidAtPeriodEndGbp',posting.unpaid_at_period_end_gbp,
    'postedBy',posting.posted_by,'postedAt',posting.posted_at,
    'reason',posting.reason,'events',
      (select coalesce(jsonb_agg(jsonb_build_object(
        'eventDate',event.event_date,
        'signedBox4DeltaGbp',event.signed_box4_delta_gbp,
        'evidenceId',event.evidence_id,'decisionId',event.decision_id,
        'taxPostingLineId',event.tax_posting_line_id)
        order by event.event_date,event.id),'[]'::jsonb)
        from public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents" event
        where event.posting_id=posting.id))
    order by posting.posted_at desc,posting.id desc),'[]'::jsonb)
    into v_later_postings
    from public."FIN_IndirectTaxLaterInputTaxRestorationPostings" posting
    where posting.legal_entity_id=p_entity and posting.period_id=p_period
      and posting.document_id=p_document;
  return jsonb_build_object('periodId',p_period,'documentId',p_document,
    'firstProposals',v_first_proposals,'firstReviews',v_first_reviews,
    'firstPostings',v_first_postings,
    'laterReviews',v_later_reviews,'laterPostings',v_later_postings);
end; $$;
revoke all on function public.multideck_uk_vat_supplier_input_tax_history(
  uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_supplier_input_tax_history(
  uuid,uuid,uuid,uuid) to service_role;

commit;
