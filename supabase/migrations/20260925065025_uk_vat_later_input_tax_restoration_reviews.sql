begin;

create table public."FIN_IndirectTaxLaterInputTaxRestorationReviews" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  document_id uuid not null references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  first_posting_id uuid not null references public."FIN_IndirectTaxInputTaxRepaymentPostings"(id) on delete restrict,
  revision integer not null check (revision>0),
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  prior_repayment_outstanding_gbp numeric(18,2) not null check (prior_repayment_outstanding_gbp>0),
  restoration_box4_gbp numeric(18,2) not null check (restoration_box4_gbp>=0),
  unpaid_at_period_end_gbp numeric(18,4) not null check (unpaid_at_period_end_gbp>=0),
  source_events jsonb not null check (jsonb_typeof(source_events)='array'),
  offset_nominal_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  reviewed_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  reviewed_at timestamptz not null default clock_timestamp(),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  unique (period_id,document_id,revision)
);
create index "IX_FIN_IndirectTaxLaterInputTaxRestorationReviews_latest"
  on public."FIN_IndirectTaxLaterInputTaxRestorationReviews"(
    legal_entity_id,period_id,document_id,revision desc);
create trigger indirect_tax_later_input_tax_restoration_review_immutable
  before update or delete on public."FIN_IndirectTaxLaterInputTaxRestorationReviews"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxLaterInputTaxRestorationReviews" enable row level security;
revoke all on public."FIN_IndirectTaxLaterInputTaxRestorationReviews"
  from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxLaterInputTaxRestorationReviews" to service_role;

create function public.multideck_uk_vat_review_later_input_tax_restoration(
  p_actor uuid,p_entity uuid,p_period uuid,p_document uuid,
  p_offset_nominal uuid,p_reason text,p_confirmed boolean
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_offset public."FIN_NominalAccounts"%rowtype;
  v_first public."FIN_IndirectTaxInputTaxRepaymentPostings"%rowtype;
  v_source jsonb;
  v_prior public."FIN_IndirectTaxLaterInputTaxRestorationReviews"%rowtype;
  v_review public."FIN_IndirectTaxLaterInputTaxRestorationReviews"%rowtype;
  v_revision integer;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_period is null or p_document is null or p_offset_nominal is null
    or p_reason is null or length(btrim(p_reason)) not between 10 and 2000
    or p_confirmed is distinct from true then
    raise exception 'Confirm the dated supplier VAT restoration and give an accountant review reason.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity for update;
  if not found or v_period.status<>'draft' or v_period.scheme_code<>'standard'
    or v_period.jurisdiction_code<>'GB' or v_period.reporting_currency<>'GBP' then
    raise exception 'Review a draft Standard Accounting GBP VAT period.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'uk-vat-later-input-tax-review:'||p_entity::text||':'||
    p_period::text||':'||p_document::text,0));
  select * into v_offset from public."FIN_NominalAccounts"
    where "FINNom_ID"=p_offset_nominal and "FINNom_LegalEntityID"=p_entity;
  if not found or not v_offset."FINNom_IsActive"
    or v_offset."FINNom_IsControlAccount"
    or not v_offset."FINNom_AllowManualPosting"
    or lower(coalesce(v_offset."FINNom_ControlTypeCode",'')) like '%vat%' then
    raise exception 'Choose an active non-control nominal that permits reviewed posting.' using errcode='22023';
  end if;
  v_source:=public.multideck_uk_vat_later_input_tax_restoration_source(
    p_actor,p_entity,p_period,p_document);
  if v_source->>'status' not in ('source_only_no_posting','source_only_no_tax_effect')
    or v_source->>'sourceFingerprint' !~ '^[a-f0-9]{64}$'
    or (v_source->>'restorationBox4Gbp')::numeric<0
    or jsonb_typeof(v_source->'events')<>'array' then
    raise exception 'Later supplier VAT source is incomplete.' using errcode='22023';
  end if;
  select * into v_first from public."FIN_IndirectTaxInputTaxRepaymentPostings"
    where id=(v_source->>'firstPostingId')::uuid and legal_entity_id=p_entity
      and document_id=p_document;
  if not found then
    raise exception 'The original supplier VAT repayment is unavailable.' using errcode='22023';
  end if;
  select * into v_prior from public."FIN_IndirectTaxLaterInputTaxRestorationReviews"
    where legal_entity_id=p_entity and period_id=p_period and document_id=p_document
    order by revision desc limit 1;
  if v_prior.id is not null
    and v_prior.source_fingerprint=v_source->>'sourceFingerprint'
    and v_prior.restoration_box4_gbp=(v_source->>'restorationBox4Gbp')::numeric
    and v_prior.unpaid_at_period_end_gbp=(v_source->>'unpaidAtPeriodEndGbp')::numeric
    and v_prior.offset_nominal_id=p_offset_nominal
    and v_prior.source_events=v_source->'events'
    and v_prior.reason=btrim(p_reason) then
    return jsonb_build_object('reviewId',v_prior.id,'revision',v_prior.revision,
      'periodId',p_period,'documentId',p_document,
      'sourceFingerprint',v_prior.source_fingerprint,
      'restorationBox4Gbp',v_prior.restoration_box4_gbp,
      'reviewedAt',v_prior.reviewed_at,'inserted',false,
      'status','reviewed_not_posted');
  end if;
  v_revision:=coalesce(v_prior.revision,0)+1;
  insert into public."FIN_IndirectTaxLaterInputTaxRestorationReviews"(
    legal_entity_id,period_id,document_id,first_posting_id,revision,
    source_fingerprint,prior_repayment_outstanding_gbp,
    restoration_box4_gbp,unpaid_at_period_end_gbp,source_events,
    offset_nominal_id,reviewed_by,reason)
  values(p_entity,p_period,p_document,v_first.id,v_revision,
    v_source->>'sourceFingerprint',
    (v_source->>'priorRepaymentOutstandingGbp')::numeric,
    (v_source->>'restorationBox4Gbp')::numeric,
    (v_source->>'unpaidAtPeriodEndGbp')::numeric,
    v_source->'events',p_offset_nominal,p_actor,btrim(p_reason))
  returning * into v_review;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxLaterInputTaxRestorationReviews',
    'later_input_tax_restoration_review',v_review.id,
    'review_later_input_tax_restoration',btrim(p_reason),
    'Later supplier input VAT restoration reviewed',
    jsonb_build_object('periodId',p_period,'documentId',p_document,
      'firstPostingId',v_first.id,'revision',v_revision,
      'sourceFingerprint',v_review.source_fingerprint,
      'restorationBox4Gbp',v_review.restoration_box4_gbp,
      'eventCount',jsonb_array_length(v_review.source_events),
      'offsetNominalId',p_offset_nominal));
  return jsonb_build_object('reviewId',v_review.id,'revision',v_revision,
    'periodId',p_period,'documentId',p_document,
    'sourceFingerprint',v_review.source_fingerprint,
    'restorationBox4Gbp',v_review.restoration_box4_gbp,
    'reviewedAt',v_review.reviewed_at,'inserted',true,
    'status','reviewed_not_posted');
end; $$;
revoke all on function public.multideck_uk_vat_review_later_input_tax_restoration(
  uuid,uuid,uuid,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_review_later_input_tax_restoration(
  uuid,uuid,uuid,uuid,uuid,text,boolean) to service_role;

create function public.multideck_uk_vat_later_input_tax_restoration_reviews(
  p_actor uuid,p_entity uuid,p_period uuid,p_document uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_rows jsonb; v_total integer;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if not exists(select 1 from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB') then
    raise exception 'VAT period is unavailable for this legal entity.' using errcode='42501';
  end if;
  select count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'reviewId',review.id,'revision',review.revision,
      'documentId',review.document_id,'firstPostingId',review.first_posting_id,
      'sourceFingerprint',review.source_fingerprint,
      'priorRepaymentOutstandingGbp',review.prior_repayment_outstanding_gbp,
      'restorationBox4Gbp',review.restoration_box4_gbp,
      'unpaidAtPeriodEndGbp',review.unpaid_at_period_end_gbp,
      'events',review.source_events,'offsetNominalId',review.offset_nominal_id,
      'reviewedBy',review.reviewed_by,'reviewedAt',review.reviewed_at,
      'reason',review.reason) order by review.revision desc),'[]'::jsonb)
    into v_total,v_rows
    from public."FIN_IndirectTaxLaterInputTaxRestorationReviews" review
    where review.legal_entity_id=p_entity and review.period_id=p_period
      and review.document_id=p_document;
  return jsonb_build_object('periodId',p_period,'documentId',p_document,
    'total',v_total,'reviews',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_later_input_tax_restoration_reviews(
  uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_later_input_tax_restoration_reviews(
  uuid,uuid,uuid,uuid) to service_role;

commit;
