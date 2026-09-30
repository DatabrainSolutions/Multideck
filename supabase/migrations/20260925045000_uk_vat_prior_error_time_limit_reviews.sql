begin;

-- A review of the statutory deadline is evidence, not a correction or an
-- extension of time. The deadline must be checked again when Method 1 posts.
create table public."FIN_IndirectTaxPriorErrorTimeLimitReviews" (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public."FIN_IndirectTaxPriorPeriodErrorIntake"(id) on delete restrict,
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  revision integer not null check (revision>0),
  error_category text not null check (error_category in
    ('output_underdeclared','output_overdeclared','input_overclaimed','input_underclaimed')),
  original_return_reference text not null check (length(btrim(original_return_reference)) between 3 and 160),
  original_return_due_on date,
  statutory_deadline_on date not null,
  assessment_on date not null,
  within_time_limit boolean not null,
  evidence_reference text not null check (length(btrim(evidence_reference)) between 3 and 160),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  reviewed_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  reviewed_at timestamptz not null default clock_timestamp(),
  unique (intake_id,revision),
  check ((error_category='input_underclaimed')=(original_return_due_on is not null))
);
create index "IX_FIN_IndirectTaxPriorErrorTimeLimitReviews_latest"
  on public."FIN_IndirectTaxPriorErrorTimeLimitReviews"(intake_id,revision desc);
create trigger indirect_tax_prior_error_time_limit_review_immutable before update or delete
  on public."FIN_IndirectTaxPriorErrorTimeLimitReviews"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxPriorErrorTimeLimitReviews" enable row level security;
revoke all on public."FIN_IndirectTaxPriorErrorTimeLimitReviews" from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxPriorErrorTimeLimitReviews" to service_role;

create function public.multideck_uk_vat_review_prior_error_time_limit(
  p_actor uuid,p_entity uuid,p_intake uuid,p_category text,
  p_original_return_reference text,p_original_return_due_on date,
  p_evidence_reference text,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_intake public."FIN_IndirectTaxPriorPeriodErrorIntake"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_review public."FIN_IndirectTaxPriorErrorTimeLimitReviews"%rowtype;
  v_deadline date; v_today date:=(clock_timestamp() at time zone 'Europe/London')::date;
  v_revision integer;
  v_return_reference text:=btrim(p_original_return_reference);
  v_evidence_reference text:=btrim(p_evidence_reference);
  v_reason text:=btrim(p_reason);
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_intake is null or p_category is null or p_category not in
    ('output_underdeclared','output_overdeclared','input_overclaimed','input_underclaimed')
    or v_return_reference is null or length(v_return_reference) not between 3 and 160
    or v_evidence_reference is null or length(v_evidence_reference) not between 3 and 160
    or v_reason is null or length(v_reason) not between 10 and 2000 then
    raise exception 'Provide the original return, error category and supporting time-limit evidence.' using errcode='22023';
  end if;
  select * into v_intake from public."FIN_IndirectTaxPriorPeriodErrorIntake"
    where id=p_intake and legal_entity_id=p_entity;
  if not found then
    raise exception 'The prior-period VAT error is unavailable.' using errcode='42501';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=v_intake.discovery_period_id and legal_entity_id=p_entity for update;
  if not found or v_period.status<>'draft' then
    raise exception 'Review the deadline before the discovery VAT period is locked.' using errcode='22023';
  end if;
  if (v_intake.tax_side='output') is distinct from (p_category like 'output_%')
    or (v_intake.signed_vat_error_gbp>0) is distinct from
      (p_category in ('output_underdeclared','input_overclaimed')) then
    raise exception 'The error category conflicts with its tax side or signed amount.' using errcode='22023';
  end if;
  if p_category='input_underclaimed' then
    if p_original_return_due_on is null or p_original_return_due_on<v_intake.original_period_end
      or p_original_return_due_on>v_intake.original_period_end+interval '1 year' then
      raise exception 'Enter the original return due date for underclaimed input tax.' using errcode='22023';
    end if;
    v_deadline:=(p_original_return_due_on+interval '4 years')::date;
  else
    if p_original_return_due_on is not null then
      raise exception 'Only underclaimed input tax uses the original return due date.' using errcode='22023';
    end if;
    v_deadline:=(v_intake.original_period_end+interval '4 years')::date;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat-prior-error-time-limit:'||p_intake::text,0));
  select * into v_review from public."FIN_IndirectTaxPriorErrorTimeLimitReviews"
    where intake_id=p_intake order by revision desc limit 1;
  if v_review.id is not null
    and v_review.error_category=p_category
    and v_review.original_return_reference=v_return_reference
    and v_review.original_return_due_on is not distinct from p_original_return_due_on
    and v_review.evidence_reference=v_evidence_reference
    and v_review.reason=v_reason
    and v_review.assessment_on=v_today then
    return jsonb_build_object('reviewId',v_review.id,'revision',v_review.revision,
      'deadlineOn',v_review.statutory_deadline_on,'withinTimeLimit',v_review.within_time_limit,
      'assessmentOn',v_review.assessment_on,'inserted',false,'status','assessment_only');
  end if;
  v_revision:=coalesce(v_review.revision,0)+1;
  insert into public."FIN_IndirectTaxPriorErrorTimeLimitReviews"(
    intake_id,legal_entity_id,revision,error_category,original_return_reference,
    original_return_due_on,statutory_deadline_on,assessment_on,within_time_limit,
    evidence_reference,reason,reviewed_by)
  values(p_intake,p_entity,v_revision,p_category,v_return_reference,
    p_original_return_due_on,v_deadline,v_today,v_today<=v_deadline,
    v_evidence_reference,v_reason,p_actor) returning * into v_review;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxPriorErrorTimeLimitReviews','prior_period_vat_error_time_limit',v_review.id,
    'review_prior_period_vat_error_time_limit',v_reason,'Prior-period UK VAT error deadline reviewed',
    jsonb_build_object('intakeId',p_intake,'revision',v_revision,'category',p_category,
      'originalReturnReference',v_return_reference,'originalReturnDueOn',p_original_return_due_on,
      'statutoryDeadlineOn',v_deadline,'assessmentOn',v_today,
      'withinTimeLimit',v_review.within_time_limit,'evidenceReference',v_evidence_reference,
      'status','assessment_only'));
  return jsonb_build_object('reviewId',v_review.id,'revision',v_revision,
    'deadlineOn',v_deadline,'withinTimeLimit',v_review.within_time_limit,
    'assessmentOn',v_today,'inserted',true,'status','assessment_only');
end; $$;
revoke all on function public.multideck_uk_vat_review_prior_error_time_limit(
  uuid,uuid,uuid,text,text,date,text,text) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_review_prior_error_time_limit(
  uuid,uuid,uuid,text,text,date,text,text) to service_role;

create function public.multideck_uk_vat_prior_error_time_limit_history(
  p_actor uuid,p_entity uuid,p_intake uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_history jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if not exists(select 1 from public."FIN_IndirectTaxPriorPeriodErrorIntake"
    where id=p_intake and legal_entity_id=p_entity) then
    raise exception 'The prior-period VAT error is unavailable.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(review) order by review.revision),'[]'::jsonb)
    into v_history from public."FIN_IndirectTaxPriorErrorTimeLimitReviews" review
    where review.intake_id=p_intake and review.legal_entity_id=p_entity;
  return jsonb_build_object('intakeId',p_intake,'reviews',v_history,
    'status','assessment_only_no_return_effect');
end; $$;
revoke all on function public.multideck_uk_vat_prior_error_time_limit_history(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_prior_error_time_limit_history(uuid,uuid,uuid)
  to service_role;

commit;
