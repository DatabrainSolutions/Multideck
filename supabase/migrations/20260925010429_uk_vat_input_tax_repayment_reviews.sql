begin;

-- A dated accounting decision over one immutable proposal. The chosen offset
-- nominal is reviewed here; posting and VAT return inclusion remain separate.
create table public."FIN_IndirectTaxInputTaxRepaymentReviews" (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public."FIN_IndirectTaxInputTaxRepaymentProposals"(id) on delete restrict,
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  document_id uuid not null references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  calculation_fingerprint text not null check (calculation_fingerprint ~ '^[a-f0-9]{64}$'),
  offset_nominal_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  reviewed_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  reviewed_at timestamptz not null default clock_timestamp(),
  reason text not null check (length(btrim(reason)) between 10 and 2000)
);
create index "IX_FIN_IndirectTaxInputTaxRepaymentReviews_proposal"
  on public."FIN_IndirectTaxInputTaxRepaymentReviews"(proposal_id,reviewed_at desc);
create table public."FIN_IndirectTaxInputTaxRepaymentReviewRevocations" (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public."FIN_IndirectTaxInputTaxRepaymentReviews"(id) on delete restrict,
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  revoked_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  revoked_at timestamptz not null default clock_timestamp(),
  reason text not null check (length(btrim(reason)) between 10 and 2000)
);
create trigger indirect_tax_input_tax_repayment_review_immutable before update or delete
  on public."FIN_IndirectTaxInputTaxRepaymentReviews"
  for each row execute function public._multideck_indirect_tax_immutable();
create trigger indirect_tax_input_tax_repayment_review_revocation_immutable before update or delete
  on public."FIN_IndirectTaxInputTaxRepaymentReviewRevocations"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxInputTaxRepaymentReviews" enable row level security;
alter table public."FIN_IndirectTaxInputTaxRepaymentReviewRevocations" enable row level security;
revoke all on public."FIN_IndirectTaxInputTaxRepaymentReviews",
  public."FIN_IndirectTaxInputTaxRepaymentReviewRevocations"
  from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxInputTaxRepaymentReviews",
  public."FIN_IndirectTaxInputTaxRepaymentReviewRevocations" to service_role;

create function public.multideck_uk_vat_review_input_tax_repayment(
  p_actor uuid,p_entity uuid,p_proposal uuid,p_offset_nominal uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_proposal public."FIN_IndirectTaxInputTaxRepaymentProposals"%rowtype;
  v_snapshot jsonb; v_review public."FIN_IndirectTaxInputTaxRepaymentReviews"%rowtype;
  v_nominal public."FIN_NominalAccounts"%rowtype;
  v_expected numeric; v_expected_restoration numeric;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_proposal is null or p_offset_nominal is null
    or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Choose a repayment proposal, offset account and review reason.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat-input-tax-review:'||p_proposal::text,0));
  select * into v_proposal from public."FIN_IndirectTaxInputTaxRepaymentProposals"
    where id=p_proposal and legal_entity_id=p_entity;
  if not found then
    raise exception 'The input VAT repayment proposal is unavailable.' using errcode='42501';
  end if;
  select * into v_nominal from public."FIN_NominalAccounts"
    where "FINNom_ID"=p_offset_nominal and "FINNom_LegalEntityID"=p_entity;
  if not found or not v_nominal."FINNom_IsActive"
    or v_nominal."FINNom_IsControlAccount"
    or not v_nominal."FINNom_AllowManualPosting" then
    raise exception 'Choose an active non-control offset account for this legal entity.' using errcode='22023';
  end if;
  v_snapshot:=public.multideck_uk_vat_clawback_source_snapshot(
    p_actor,p_entity,v_proposal.period_id,v_proposal.document_id);
  v_expected:=trunc((v_snapshot->>'originallyClaimedInputVatGbp')::numeric
    *(v_snapshot->>'unpaidAtFirstDate')::numeric
    /(v_snapshot->>'grossSourceAmount')::numeric,2);
  v_expected_restoration:=v_expected-trunc(
    (v_snapshot->>'originallyClaimedInputVatGbp')::numeric
    *(v_snapshot->>'unpaidAtPeriodEnd')::numeric
    /(v_snapshot->>'grossSourceAmount')::numeric,2);
  if v_proposal.rule_version<>'uk-input-tax-six-month-v2'
    or v_snapshot->>'sourceFingerprint'<>v_proposal.source_fingerprint
    or v_expected<>v_proposal.proposed_repayment_gbp
    or v_expected_restoration<>v_proposal.proposed_restoration_gbp then
    raise exception 'The repayment proposal is stale; prepare it again from current payment evidence.' using errcode='22023';
  end if;
  select * into v_review from public."FIN_IndirectTaxInputTaxRepaymentReviews" review
    where review.proposal_id=p_proposal and review.legal_entity_id=p_entity
      and not exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentReviewRevocations" revocation
        where revocation.review_id=review.id)
    order by review.reviewed_at desc,review.id desc limit 1;
  if v_review.id is not null then
    if v_review.offset_nominal_id<>p_offset_nominal then
      raise exception 'Revoke the current repayment review before changing its offset account.' using errcode='22023';
    end if;
    return jsonb_build_object('reviewId',v_review.id,'proposalId',p_proposal,
      'periodId',v_review.period_id,'documentId',v_review.document_id,
      'offsetNominalId',v_review.offset_nominal_id,'reviewedAt',v_review.reviewed_at,
      'inserted',false,'status','reviewed_for_posting_only');
  end if;
  insert into public."FIN_IndirectTaxInputTaxRepaymentReviews"(
    proposal_id,legal_entity_id,period_id,document_id,source_fingerprint,
    calculation_fingerprint,offset_nominal_id,reviewed_by,reason)
  values(p_proposal,p_entity,v_proposal.period_id,v_proposal.document_id,
    v_proposal.source_fingerprint,v_proposal.calculation_fingerprint,
    p_offset_nominal,p_actor,btrim(p_reason)) returning * into v_review;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxInputTaxRepaymentReviews','input_tax_repayment_review',v_review.id,
    'review_input_tax_repayment',btrim(p_reason),'UK input VAT repayment reviewed',
    jsonb_build_object('proposalId',p_proposal,'periodId',v_review.period_id,
      'documentId',v_review.document_id,'offsetNominalId',p_offset_nominal,
      'sourceFingerprint',v_review.source_fingerprint,
      'calculationFingerprint',v_review.calculation_fingerprint));
  return jsonb_build_object('reviewId',v_review.id,'proposalId',p_proposal,
    'periodId',v_review.period_id,'documentId',v_review.document_id,
    'offsetNominalId',p_offset_nominal,'reviewedAt',v_review.reviewed_at,
    'inserted',true,'status','reviewed_for_posting_only');
end; $$;
revoke all on function public.multideck_uk_vat_review_input_tax_repayment(uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_review_input_tax_repayment(uuid,uuid,uuid,uuid,text)
  to service_role;

create function public.multideck_uk_vat_revoke_input_tax_repayment_review(
  p_actor uuid,p_entity uuid,p_review uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_review public."FIN_IndirectTaxInputTaxRepaymentReviews"%rowtype;
  v_revocation uuid; v_at timestamptz;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_review is null or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Choose a repayment review and explain its revocation.' using errcode='22023';
  end if;
  select * into v_review from public."FIN_IndirectTaxInputTaxRepaymentReviews"
    where id=p_review and legal_entity_id=p_entity;
  if not found then
    raise exception 'The input VAT repayment review is unavailable.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat-input-tax-review:'||v_review.proposal_id::text,0));
  if exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentReviewRevocations"
    where review_id=p_review) then
    raise exception 'This input VAT repayment review is already revoked.' using errcode='22023';
  end if;
  insert into public."FIN_IndirectTaxInputTaxRepaymentReviewRevocations"(
    review_id,legal_entity_id,revoked_by,reason)
  values(p_review,p_entity,p_actor,btrim(p_reason))
  returning id,revoked_at into v_revocation,v_at;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxInputTaxRepaymentReviewRevocations','input_tax_repayment_review_revocation',
    v_revocation,'revoke_input_tax_repayment_review',btrim(p_reason),
    'UK input VAT repayment review revoked',
    jsonb_build_object('reviewId',p_review,'proposalId',v_review.proposal_id,
      'periodId',v_review.period_id,'documentId',v_review.document_id));
  return jsonb_build_object('revocationId',v_revocation,'reviewId',p_review,
    'proposalId',v_review.proposal_id,'revokedAt',v_at,'status','revoked_before_posting');
end; $$;
revoke all on function public.multideck_uk_vat_revoke_input_tax_repayment_review(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_revoke_input_tax_repayment_review(uuid,uuid,uuid,text)
  to service_role;

commit;
