begin;

-- An accountant's complete, source-bound plan for a future Method 1 posting.
-- It neither changes the VAT account nor clears the prior-error filing gate.
create table public."FIN_IndirectTaxPriorErrorMethod1Plans" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  discovery_period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  base_calculation_id uuid not null,
  base_source_digest text not null check (base_source_digest ~ '^[a-f0-9]{64}$'),
  item_count integer not null check (item_count between 1 and 100),
  planned_items jsonb not null check (jsonb_typeof(planned_items)='array'),
  net_error_gbp numeric(18,2) not null,
  box6_delta_gbp numeric(18,2) not null,
  box7_delta_gbp numeric(18,2) not null,
  planned_filed_box6_gbp numeric(18,0) not null check (planned_filed_box6_gbp>=0),
  threshold_basis text not null check (threshold_basis in ('up_to_10000','up_to_50000_one_percent')),
  plan_fingerprint text not null check (plan_fingerprint ~ '^[a-f0-9]{64}$'),
  reviewed_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  reviewed_at timestamptz not null default clock_timestamp(),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  unique (discovery_period_id,plan_fingerprint),
  foreign key (base_calculation_id,discovery_period_id)
    references public."FIN_IndirectTaxCalculations"(id,period_id) on delete restrict
);
create index "IX_FIN_IndirectTaxPriorErrorMethod1Plans_period"
  on public."FIN_IndirectTaxPriorErrorMethod1Plans"(discovery_period_id,reviewed_at desc);
create trigger indirect_tax_prior_error_method1_plan_immutable before update or delete
  on public."FIN_IndirectTaxPriorErrorMethod1Plans"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxPriorErrorMethod1Plans" enable row level security;
revoke all on public."FIN_IndirectTaxPriorErrorMethod1Plans" from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxPriorErrorMethod1Plans" to service_role;

create function public.multideck_uk_vat_review_method1_plan(
  p_actor uuid,p_entity uuid,p_period uuid,p_base_calculation uuid,
  p_source_digest text,p_items jsonb,p_reason text,p_confirmed boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_base public."FIN_IndirectTaxCalculations"%rowtype;
  v_intake public."FIN_IndirectTaxPriorPeriodErrorIntake"%rowtype;
  v_conduct public."FIN_IndirectTaxPriorPeriodErrorConductReviews"%rowtype;
  v_deadline public."FIN_IndirectTaxPriorErrorTimeLimitReviews"%rowtype;
  v_nominal public."FIN_NominalAccounts"%rowtype;
  v_item jsonb; v_normalized jsonb:='[]'::jsonb; v_sorted jsonb;
  v_ids uuid[]:='{}'::uuid[]; v_id uuid; v_offset uuid;
  v_delta numeric; v_evidence_ref text; v_total_count integer;
  v_net numeric:=0; v_box6_delta numeric:=0; v_box7_delta numeric:=0;
  v_snapshot jsonb; v_filed_box6 numeric; v_threshold text;
  v_fingerprint text; v_plan uuid; v_reviewed_at timestamptz; v_inserted boolean:=false;
  v_today date:=(clock_timestamp() at time zone 'Europe/London')::date;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_source_digest is null or p_source_digest !~ '^[a-f0-9]{64}$'
    or p_items is null or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items) not between 1 and 100
    or p_reason is null or length(btrim(p_reason)) not between 10 and 2000
    or p_confirmed is distinct from true then
    raise exception 'Confirm every discovered error and provide a reviewed Method 1 posting plan.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB' for update;
  if not found then raise exception 'The discovery VAT period is unavailable.' using errcode='42501'; end if;
  if v_period.status<>'draft' or v_period.scheme_code<>'standard'
    or v_period.reporting_currency<>'GBP' then
    raise exception 'Method 1 planning needs a draft Standard Accounting GBP period.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||p_entity::text,0));
  select * into v_base from public."FIN_IndirectTaxCalculations"
    where id=p_base_calculation and period_id=p_period and source_digest=p_source_digest
      and revision=(select max(revision) from public."FIN_IndirectTaxCalculations"
        where period_id=p_period);
  if not found then
    raise exception 'Review the latest source-matched VAT calculation before planning a correction.' using errcode='22023';
  end if;
  if exists(select 1 from public."FIN_IndirectTaxPriorErrorNotificationItems" linked
    join public."FIN_IndirectTaxPriorPeriodErrorIntake" intake on intake.id=linked.intake_id
    where intake.discovery_period_id=p_period and intake.legal_entity_id=p_entity) then
    raise exception 'A period with separately notified errors needs specialist route review.' using errcode='22023';
  end if;
  select count(*)::integer into v_total_count
    from public."FIN_IndirectTaxPriorPeriodErrorIntake"
    where discovery_period_id=p_period and legal_entity_id=p_entity;
  if v_total_count<>jsonb_array_length(p_items) then
    raise exception 'A Method 1 plan must include every error discovered in this VAT period.' using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object'
      or coalesce(v_item->>'intakeId','') !~ '^[0-9a-fA-F-]{36}$'
      or coalesce(v_item->>'offsetNominalId','') !~ '^[0-9a-fA-F-]{36}$'
      or coalesce(v_item->>'boxNetDeltaGbp','') !~ '^-?(0|[1-9][0-9]*)([.][0-9]{1,2})?$'
      or length(btrim(coalesce(v_item->>'evidenceReference',''))) not between 3 and 160 then
      raise exception 'Each Method 1 item needs an intake, offset account, net-box change and evidence reference.' using errcode='22023';
    end if;
    v_id:=(v_item->>'intakeId')::uuid;
    if v_id=any(v_ids) then
      raise exception 'A prior-return error was selected more than once.' using errcode='22023';
    end if;
    v_ids:=array_append(v_ids,v_id);
    v_offset:=(v_item->>'offsetNominalId')::uuid;
    v_delta:=(v_item->>'boxNetDeltaGbp')::numeric;
    v_evidence_ref:=btrim(v_item->>'evidenceReference');
    if abs(v_delta)>99999999999999 or v_delta<>round(v_delta,2) then
      raise exception 'Net-box changes must be supported GBP amounts to the penny.' using errcode='22023';
    end if;
    select * into v_intake from public."FIN_IndirectTaxPriorPeriodErrorIntake"
      where id=v_id and legal_entity_id=p_entity and discovery_period_id=p_period;
    if not found then
      raise exception 'A selected error is outside this legal entity or discovery period.' using errcode='42501';
    end if;
    select * into v_conduct from public."FIN_IndirectTaxPriorPeriodErrorConductReviews"
      where intake_id=v_id and legal_entity_id=p_entity order by revision desc limit 1;
    if not found or v_conduct.conduct='deliberate' then
      raise exception 'Every Method 1 error needs a reviewed, non-deliberate conduct decision.' using errcode='22023';
    end if;
    select * into v_deadline from public."FIN_IndirectTaxPriorErrorTimeLimitReviews"
      where intake_id=v_id and legal_entity_id=p_entity order by revision desc limit 1;
    if not found or not v_deadline.within_time_limit
      or v_deadline.statutory_deadline_on<v_today then
      raise exception 'Every Method 1 error needs a current, in-time statutory review.' using errcode='22023';
    end if;
    select * into v_nominal from public."FIN_NominalAccounts"
      where "FINNom_ID"=v_offset and "FINNom_LegalEntityID"=p_entity;
    if not found or not v_nominal."FINNom_IsActive"
      or v_nominal."FINNom_IsControlAccount"
      or not v_nominal."FINNom_AllowManualPosting"
      or lower(coalesce(v_nominal."FINNom_ControlTypeCode",'')) like '%vat%'
      or v_nominal."FINNom_Code" ~ '^(1200|2100)([.]00[.]00)?$' then
      raise exception 'Choose an active, manually postable non-control offset nominal for every error.' using errcode='22023';
    end if;
    v_net:=v_net+v_intake.signed_vat_error_gbp;
    if v_intake.tax_side='output' then
      v_box6_delta:=v_box6_delta+v_delta;
    else
      v_box7_delta:=v_box7_delta+v_delta;
    end if;
    v_normalized:=v_normalized||jsonb_build_array(jsonb_build_object(
      'intakeId',v_id,'taxSide',v_intake.tax_side,
      'signedVatErrorGbp',v_intake.signed_vat_error_gbp,
      'boxNetDeltaGbp',v_delta,'offsetNominalId',v_offset,
      'evidenceReference',v_evidence_ref,'conductReviewId',v_conduct.id,
      'timeLimitReviewId',v_deadline.id,'statutoryDeadlineOn',v_deadline.statutory_deadline_on,
      'originalReturnReference',v_deadline.original_return_reference,
      'sourceReference',v_intake.source_reference));
  end loop;
  select jsonb_agg(value order by value->>'intakeId') into v_sorted
    from jsonb_array_elements(v_normalized);
  v_snapshot:=public.multideck_uk_vat_current_snapshot(p_actor,p_period);
  if v_snapshot->>'sourceDigest' is distinct from p_source_digest then
    raise exception 'VAT sources changed since the selected base calculation.' using errcode='22023';
  end if;
  v_filed_box6:=round((v_snapshot->'boxes'->>'6')::numeric+v_box6_delta,0);
  if v_filed_box6<0 then
    raise exception 'The planned Box 6 cannot be negative.' using errcode='22023';
  end if;
  if abs(v_net)<=10000 then
    v_threshold:='up_to_10000';
  elsif abs(v_net)<=50000 and abs(v_net)*100<=v_filed_box6 then
    v_threshold:='up_to_50000_one_percent';
  else
    raise exception 'The aggregate prior-return error exceeds the Method 1 limit; use separate HMRC notification.' using errcode='22023';
  end if;
  v_fingerprint:=encode(sha256(convert_to('uk-method1-plan-v1'||p_period::text||
    p_source_digest||v_sorted::text||v_net::text||v_filed_box6::text,'UTF8')),'hex');
  insert into public."FIN_IndirectTaxPriorErrorMethod1Plans"(
    legal_entity_id,discovery_period_id,base_calculation_id,base_source_digest,
    item_count,planned_items,net_error_gbp,box6_delta_gbp,box7_delta_gbp,
    planned_filed_box6_gbp,threshold_basis,plan_fingerprint,reviewed_by,reason)
  values(p_entity,p_period,p_base_calculation,p_source_digest,
    v_total_count,v_sorted,v_net,v_box6_delta,v_box7_delta,
    v_filed_box6,v_threshold,v_fingerprint,p_actor,btrim(p_reason))
  on conflict (discovery_period_id,plan_fingerprint) do nothing
  returning id,reviewed_at into v_plan,v_reviewed_at;
  if v_plan is null then
    select id,reviewed_at into v_plan,v_reviewed_at
      from public."FIN_IndirectTaxPriorErrorMethod1Plans"
      where discovery_period_id=p_period and plan_fingerprint=v_fingerprint;
  else
    v_inserted:=true;
    insert into public."Audit_Events"(
      "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
      "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
      "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
    ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
      'FIN_IndirectTaxPriorErrorMethod1Plans','prior_period_vat_method1_plan',v_plan,
      'review_prior_period_vat_method1_plan',btrim(p_reason),
      'UK VAT Method 1 posting plan reviewed',
      jsonb_build_object('periodId',p_period,'baseCalculationId',p_base_calculation,
        'baseSourceDigest',p_source_digest,'itemCount',v_total_count,
        'netErrorGbp',v_net,'box6DeltaGbp',v_box6_delta,'box7DeltaGbp',v_box7_delta,
        'plannedFiledBox6Gbp',v_filed_box6,'thresholdBasis',v_threshold,
        'planFingerprint',v_fingerprint,'status','reviewed_for_posting_only'));
  end if;
  return jsonb_build_object('planId',v_plan,'periodId',p_period,
    'planFingerprint',v_fingerprint,'itemCount',v_total_count,
    'netErrorGbp',v_net,'box6DeltaGbp',v_box6_delta,'box7DeltaGbp',v_box7_delta,
    'plannedFiledBox6Gbp',v_filed_box6,'thresholdBasis',v_threshold,
    'reviewedAt',v_reviewed_at,'inserted',v_inserted,
    'status','reviewed_for_posting_only');
end; $$;
revoke all on function public.multideck_uk_vat_review_method1_plan(
  uuid,uuid,uuid,uuid,text,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_review_method1_plan(
  uuid,uuid,uuid,uuid,text,jsonb,text,boolean) to service_role;

create function public.multideck_uk_vat_method1_plans(
  p_actor uuid,p_entity uuid,p_period uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if not exists(select 1 from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB') then
    raise exception 'The discovery VAT period is unavailable.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(plan) order by plan.reviewed_at desc,plan.id desc),'[]'::jsonb)
    into v_rows from (
    select * from public."FIN_IndirectTaxPriorErrorMethod1Plans"
    where discovery_period_id=p_period and legal_entity_id=p_entity
    order by reviewed_at desc,id desc limit 20
  ) plan;
  return jsonb_build_object('periodId',p_period,'plans',v_rows,
    'status','reviewed_for_posting_only');
end; $$;
revoke all on function public.multideck_uk_vat_method1_plans(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_method1_plans(uuid,uuid,uuid)
  to service_role;

create function public.multideck_uk_vat_method1_offset_nominals(
  p_actor uuid,p_entity uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',nominal."FINNom_ID",'code',nominal."FINNom_Code",
    'name',nominal."FINNom_Name") order by nominal."FINNom_Code",nominal."FINNom_ID"),'[]'::jsonb)
    into v_rows from public."FIN_NominalAccounts" nominal
    where nominal."FINNom_LegalEntityID"=p_entity
      and nominal."FINNom_IsActive"
      and not nominal."FINNom_IsControlAccount"
      and nominal."FINNom_AllowManualPosting"
      and lower(coalesce(nominal."FINNom_ControlTypeCode",'')) not like '%vat%'
      and nominal."FINNom_Code" !~ '^(1200|2100)([.]00[.]00)?$';
  return jsonb_build_object('legalEntityId',p_entity,'nominals',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_method1_offset_nominals(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_method1_offset_nominals(uuid,uuid)
  to service_role;

commit;
