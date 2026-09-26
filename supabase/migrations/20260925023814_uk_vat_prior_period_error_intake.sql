begin;

-- Intake is a dated disclosure record only. It neither changes a VAT return
-- nor asserts that Method 1 or Method 2 has been approved or sent to HMRC.
create table public."FIN_IndirectTaxPriorPeriodErrorIntake" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  discovery_period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  original_period_start date not null,
  original_period_end date not null,
  discovered_on date not null,
  source_reference text not null check (length(btrim(source_reference)) between 3 and 160),
  tax_side text not null check (tax_side in ('input','output')),
  signed_vat_error_gbp numeric(18,2) not null check (signed_vat_error_gbp<>0),
  conduct text not null check (conduct in ('undetermined','reasonable_care','careless','deliberate')),
  explanation text not null check (length(btrim(explanation)) between 10 and 2000),
  recorded_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  check (original_period_end>=original_period_start),
  unique (legal_entity_id,source_reference,original_period_start,original_period_end,tax_side)
);
create index "IX_FIN_IndirectTaxPriorPeriodErrorIntake_period"
  on public."FIN_IndirectTaxPriorPeriodErrorIntake"(discovery_period_id,recorded_at,id);
create trigger indirect_tax_prior_period_error_intake_immutable before update or delete
  on public."FIN_IndirectTaxPriorPeriodErrorIntake"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxPriorPeriodErrorIntake" enable row level security;
revoke all on public."FIN_IndirectTaxPriorPeriodErrorIntake" from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxPriorPeriodErrorIntake" to service_role;

create table public."FIN_IndirectTaxPriorPeriodErrorConductReviews" (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public."FIN_IndirectTaxPriorPeriodErrorIntake"(id) on delete restrict,
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  revision integer not null check (revision>0),
  conduct text not null check (conduct in ('reasonable_care','careless','deliberate')),
  reviewed_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  reviewed_at timestamptz not null default clock_timestamp(),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  unique (intake_id,revision)
);
create index "IX_FIN_IndirectTaxPriorPeriodErrorConductReviews_latest"
  on public."FIN_IndirectTaxPriorPeriodErrorConductReviews"(intake_id,revision desc);
create trigger indirect_tax_prior_error_conduct_review_immutable before update or delete
  on public."FIN_IndirectTaxPriorPeriodErrorConductReviews"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxPriorPeriodErrorConductReviews" enable row level security;
revoke all on public."FIN_IndirectTaxPriorPeriodErrorConductReviews" from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxPriorPeriodErrorConductReviews" to service_role;

create function public.multideck_uk_vat_record_prior_period_error(
  p_actor uuid,p_entity uuid,p_discovery_period uuid,
  p_original_start date,p_original_end date,p_discovered_on date,
  p_source_reference text,p_tax_side text,p_signed_vat_error_gbp numeric,
  p_conduct text,p_explanation text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_existing public."FIN_IndirectTaxPriorPeriodErrorIntake"%rowtype;
  v_new public."FIN_IndirectTaxPriorPeriodErrorIntake"%rowtype;
  v_reference text:=btrim(p_source_reference);
  v_explanation text:=btrim(p_explanation);
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_discovery_period is null or p_original_start is null or p_original_end is null
    or p_discovered_on is null or p_original_end<p_original_start
    or p_tax_side not in ('input','output') or p_tax_side is null
    or p_signed_vat_error_gbp is null or p_signed_vat_error_gbp=0
    or p_signed_vat_error_gbp<>round(p_signed_vat_error_gbp,2)
    or p_conduct is null or p_conduct not in ('undetermined','reasonable_care','careless','deliberate')
    or v_reference is null
    or length(v_reference) not between 3 and 160
    or v_explanation is null or length(v_explanation) not between 10 and 2000 then
    raise exception 'Enter complete prior-period VAT error evidence to the penny.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_discovery_period and legal_entity_id=p_entity and jurisdiction_code='GB'
    for update;
  if not found then
    raise exception 'The discovery VAT period is unavailable for this legal entity.' using errcode='42501';
  end if;
  if v_period.status<>'draft' or p_discovered_on not between v_period.start_date and v_period.end_date
    or p_discovered_on>(clock_timestamp() at time zone 'Europe/London')::date
    or p_original_end>=v_period.start_date then
    raise exception 'The error must be discovered by today in this draft VAT period and concern an earlier period.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'uk-vat-prior-error:'||p_entity::text||':'||v_reference||':'||p_original_start::text||':'||p_original_end::text||':'||p_tax_side,0));
  select * into v_existing from public."FIN_IndirectTaxPriorPeriodErrorIntake"
    where legal_entity_id=p_entity and source_reference=v_reference
      and original_period_start=p_original_start and original_period_end=p_original_end
      and tax_side=p_tax_side;
  if found then
    if v_existing.discovery_period_id is distinct from p_discovery_period
      or v_existing.discovered_on is distinct from p_discovered_on
      or v_existing.signed_vat_error_gbp is distinct from p_signed_vat_error_gbp
      or v_existing.conduct is distinct from p_conduct
      or v_existing.explanation is distinct from v_explanation then
      raise exception 'This source already has a different VAT error intake; review its existing record.' using errcode='23505';
    end if;
    return jsonb_build_object('intakeId',v_existing.id,'recordedAt',v_existing.recorded_at,
      'inserted',false,'status','intake_only');
  end if;
  insert into public."FIN_IndirectTaxPriorPeriodErrorIntake"(
    legal_entity_id,discovery_period_id,original_period_start,original_period_end,
    discovered_on,source_reference,tax_side,signed_vat_error_gbp,conduct,
    explanation,recorded_by)
  values(p_entity,p_discovery_period,p_original_start,p_original_end,
    p_discovered_on,v_reference,p_tax_side,p_signed_vat_error_gbp,p_conduct,
    v_explanation,p_actor) returning * into v_new;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxPriorPeriodErrorIntake','prior_period_vat_error',v_new.id,
    'record_prior_period_vat_error',v_explanation,'Prior-period UK VAT error recorded',
    jsonb_build_object('discoveryPeriodId',p_discovery_period,
      'originalPeriodStart',p_original_start,'originalPeriodEnd',p_original_end,
      'discoveredOn',p_discovered_on,'sourceReference',v_reference,
      'taxSide',p_tax_side,'signedVatErrorGbp',p_signed_vat_error_gbp,
      'conduct',p_conduct,'status','intake_only'));
  return jsonb_build_object('intakeId',v_new.id,'recordedAt',v_new.recorded_at,
    'inserted',true,'status','intake_only');
end; $$;
revoke all on function public.multideck_uk_vat_record_prior_period_error(
  uuid,uuid,uuid,date,date,date,text,text,numeric,text,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_record_prior_period_error(
  uuid,uuid,uuid,date,date,date,text,text,numeric,text,text)
  to service_role;

create function public.multideck_uk_vat_review_prior_error_conduct(
  p_actor uuid,p_entity uuid,p_intake uuid,p_conduct text,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_intake public."FIN_IndirectTaxPriorPeriodErrorIntake"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_review public."FIN_IndirectTaxPriorPeriodErrorConductReviews"%rowtype;
  v_revision integer;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_intake is null or p_conduct not in ('reasonable_care','careless','deliberate')
    or p_conduct is null or p_reason is null
    or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Choose the error, conduct category and review reason.' using errcode='22023';
  end if;
  select * into v_intake from public."FIN_IndirectTaxPriorPeriodErrorIntake"
    where id=p_intake and legal_entity_id=p_entity;
  if not found then
    raise exception 'The prior-period VAT error is unavailable.' using errcode='42501';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=v_intake.discovery_period_id and legal_entity_id=p_entity for update;
  if not found or v_period.status<>'draft' then
    raise exception 'Review conduct before the discovery VAT period is locked.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat-prior-error-conduct:'||p_intake::text,0));
  select * into v_review from public."FIN_IndirectTaxPriorPeriodErrorConductReviews"
    where intake_id=p_intake order by revision desc limit 1;
  if v_review.id is not null and v_review.conduct=p_conduct then
    return jsonb_build_object('reviewId',v_review.id,'intakeId',p_intake,
      'revision',v_review.revision,'conduct',v_review.conduct,
      'reviewedAt',v_review.reviewed_at,'inserted',false);
  end if;
  v_revision:=coalesce(v_review.revision,0)+1;
  insert into public."FIN_IndirectTaxPriorPeriodErrorConductReviews"(
    intake_id,legal_entity_id,revision,conduct,reviewed_by,reason)
  values(p_intake,p_entity,v_revision,p_conduct,p_actor,btrim(p_reason))
  returning * into v_review;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxPriorPeriodErrorConductReviews','prior_period_vat_error_conduct',v_review.id,
    'review_prior_period_vat_error_conduct',btrim(p_reason),'Prior-period UK VAT error conduct reviewed',
    jsonb_build_object('intakeId',p_intake,'revision',v_revision,'conduct',p_conduct,
      'discoveryPeriodId',v_intake.discovery_period_id));
  return jsonb_build_object('reviewId',v_review.id,'intakeId',p_intake,
    'revision',v_revision,'conduct',p_conduct,'reviewedAt',v_review.reviewed_at,
    'inserted',true);
end; $$;
revoke all on function public.multideck_uk_vat_review_prior_error_conduct(uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_review_prior_error_conduct(uuid,uuid,uuid,text,text)
  to service_role;

create function public.multideck_uk_vat_prior_period_error_intake(
  p_actor uuid,p_entity uuid,p_discovery_period uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb; v_total integer;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if not exists(select 1 from public."FIN_IndirectTaxPeriods" period
    where period.id=p_discovery_period and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB') then
    raise exception 'The discovery VAT period is unavailable for this legal entity.' using errcode='42501';
  end if;
  select count(*)::integer into v_total from public."FIN_IndirectTaxPriorPeriodErrorIntake" intake
    where intake.legal_entity_id=p_entity and intake.discovery_period_id=p_discovery_period;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.recorded_at,item.id),'[]'::jsonb)
    into v_rows from (
    select intake.id,intake.original_period_start,intake.original_period_end,
      intake.discovered_on,intake.source_reference,intake.tax_side,
      intake.signed_vat_error_gbp,intake.conduct,intake.explanation,
      intake.recorded_by,intake.recorded_at,
      coalesce(conduct_review.conduct,intake.conduct) effective_conduct,
      conduct_review.id conduct_review_id,conduct_review.reviewed_at conduct_reviewed_at,
      (select coalesce(jsonb_agg(jsonb_build_object(
        'reviewId',history.id,'revision',history.revision,'conduct',history.conduct,
        'reviewedBy',history.reviewed_by,'reviewedAt',history.reviewed_at,
        'reason',history.reason) order by history.revision),'[]'::jsonb)
       from public."FIN_IndirectTaxPriorPeriodErrorConductReviews" history
       where history.intake_id=intake.id and history.legal_entity_id=p_entity) conduct_review_history
    from public."FIN_IndirectTaxPriorPeriodErrorIntake" intake
    left join lateral (select review.id,review.conduct,review.reviewed_at
      from public."FIN_IndirectTaxPriorPeriodErrorConductReviews" review
      where review.intake_id=intake.id and review.legal_entity_id=p_entity
      order by review.revision desc limit 1) conduct_review on true
    where intake.legal_entity_id=p_entity and intake.discovery_period_id=p_discovery_period
    order by intake.recorded_at,intake.id limit 100
  ) item;
  return jsonb_build_object('legalEntityId',p_entity,'discoveryPeriodId',p_discovery_period,
    'total',v_total,'items',v_rows,'status','unassessed_no_return_effect');
end; $$;
revoke all on function public.multideck_uk_vat_prior_period_error_intake(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_prior_period_error_intake(uuid,uuid,uuid)
  to service_role;

-- A bounded method preview over all error items discovered in this period.
-- The 1% branch uses the reviewed whole-pound Box 6 for the latest source
-- digest, never a user-entered turnover amount. It is not an assessment or
-- permission to include an adjustment on a return.
create function public.multideck_uk_vat_prior_period_error_preview(
  p_actor uuid,p_entity uuid,p_discovery_period uuid,p_choose_separate boolean default false
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_total integer; v_net numeric; v_largest_error numeric; v_deliberate boolean; v_undetermined boolean;
  v_careless boolean; v_items_fingerprint text;
  v_box6 numeric; v_projection uuid; v_projection_fingerprint text;
  v_latest_digest text; v_fresh jsonb; v_method text; v_reason text;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_choose_separate is null then
    raise exception 'Choose whether to use separate notification.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_discovery_period and legal_entity_id=p_entity and jurisdiction_code='GB';
  if not found then
    raise exception 'The discovery VAT period is unavailable for this legal entity.' using errcode='42501';
  end if;
  select count(*)::integer,coalesce(sum(intake.signed_vat_error_gbp),0),
    coalesce(max(abs(intake.signed_vat_error_gbp)),0),
    coalesce(bool_or(coalesce(conduct_review.conduct,intake.conduct)='deliberate'),false),
    coalesce(bool_or(conduct_review.id is null),false),
    coalesce(bool_or(coalesce(conduct_review.conduct,intake.conduct)='careless'),false),
    encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
      'id',intake.id,'signedVat',intake.signed_vat_error_gbp,
      'conduct',intake.conduct,'conductReviewId',conduct_review.id,
      'effectiveConduct',coalesce(conduct_review.conduct,intake.conduct),
      'originalStart',intake.original_period_start,
      'originalEnd',intake.original_period_end,'discoveredOn',intake.discovered_on)
      order by intake.id)::text,'[]'),'UTF8')),'hex')
    into v_total,v_net,v_largest_error,v_deliberate,v_undetermined,v_careless,v_items_fingerprint
  from public."FIN_IndirectTaxPriorPeriodErrorIntake" intake
  left join lateral (select review.id,review.conduct
    from public."FIN_IndirectTaxPriorPeriodErrorConductReviews" review
    where review.intake_id=intake.id and review.legal_entity_id=p_entity
    order by review.revision desc limit 1) conduct_review on true
  where intake.legal_entity_id=p_entity and intake.discovery_period_id=p_discovery_period;
  select calculation.source_digest into v_latest_digest
    from public."FIN_IndirectTaxCalculations" calculation
    where calculation.period_id=p_discovery_period
    order by calculation.revision desc limit 1;
  select projection.id,projection.projection_fingerprint,
    (projection.filed_boxes->>'6')::numeric
    into v_projection,v_projection_fingerprint,v_box6
    from public."FIN_IndirectTaxFilingProjections" projection
    where projection.period_id=p_discovery_period
      and projection.source_digest=v_latest_digest
      and projection.rule_version='uk-whole-pound-nearest-v1'
    order by projection.reviewed_at desc,projection.id desc limit 1;
  if v_box6 is not null and v_box6<0 then
    v_box6:=null; v_projection:=null; v_projection_fingerprint:=null;
  end if;
  if v_total>0 and not v_deliberate and not p_choose_separate
    and abs(v_net)>10000 and abs(v_net)<=50000 and v_box6 is not null then
    v_fresh:=public.multideck_uk_vat_current_snapshot(p_actor,p_discovery_period);
    if v_fresh->>'sourceDigest' is distinct from v_latest_digest then
      raise exception 'VAT source evidence changed since the reviewed Box 6; review the current draft again.' using errcode='22023';
    end if;
  end if;
  if v_total=0 then
    v_method:='no_errors'; v_reason:='no_errors';
  elsif v_deliberate then
    v_method:='separate_notification'; v_reason:='deliberate';
  elsif p_choose_separate then
    v_method:='separate_notification'; v_reason:='elected_separate';
  elsif abs(v_net)>50000 then
    v_method:='separate_notification'; v_reason:='over_50000';
  elsif abs(v_net)<=10000 then
    v_method:='current_return_adjustment'; v_reason:='within_10000';
  elsif v_box6 is null then
    v_method:='needs_reviewed_current_box6'; v_reason:='box6_missing';
  elsif abs(v_net)*100<=v_box6 then
    v_method:='current_return_adjustment'; v_reason:='within_one_percent';
  else
    v_method:='separate_notification'; v_reason:='over_one_percent';
  end if;
  return jsonb_build_object('periodId',p_discovery_period,'legalEntityId',p_entity,
    'itemCount',v_total,'itemsFingerprint',v_items_fingerprint,'netErrorGbp',v_net,
    'method',v_method,'reason',v_reason,'reviewedBox6Gbp',v_box6,
    'filingProjectionId',v_projection,'projectionFingerprint',v_projection_fingerprint,
    'immediateNotificationReviewRequired',v_largest_error>50000 or
      (v_largest_error>10000 and v_box6 is not null and v_largest_error*100>v_box6),
    'conductReviewRequired',v_undetermined,'carelessDisclosureAdvisory',v_careless,
    'timeLimitReviewRequired',v_total>0,'status','preview_only_no_return_effect');
end; $$;
revoke all on function public.multideck_uk_vat_prior_period_error_preview(uuid,uuid,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_prior_period_error_preview(uuid,uuid,uuid,boolean)
  to service_role;

commit;
