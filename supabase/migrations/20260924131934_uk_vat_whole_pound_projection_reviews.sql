begin;

-- This records the accountant's dated review of the numeric projection that
-- HMRC accepts. The exact two-decimal source boxes remain on the calculation.
-- It is not period approval, a lock, or authority to submit a return.
create table public."FIN_IndirectTaxFilingProjections" (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  calculation_id uuid not null,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  control_review_id uuid not null references public."FIN_IndirectTaxControlReviews"(id) on delete restrict,
  control_fingerprint text not null check (control_fingerprint ~ '^[a-f0-9]{64}$'),
  rule_version text not null check (rule_version='uk-whole-pound-nearest-v1'),
  source_boxes jsonb not null check (jsonb_typeof(source_boxes)='object'),
  filed_boxes jsonb not null check (jsonb_typeof(filed_boxes)='object'),
  projection_fingerprint text not null check (projection_fingerprint ~ '^[a-f0-9]{64}$'),
  reviewed_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  reviewed_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  unique (period_id,projection_fingerprint),
  foreign key (calculation_id,period_id)
    references public."FIN_IndirectTaxCalculations"(id,period_id) on delete restrict
);
create index "IX_FIN_IndirectTaxFilingProjections_period"
  on public."FIN_IndirectTaxFilingProjections"(period_id,reviewed_at desc);
create trigger indirect_tax_filing_projection_immutable before update or delete
  on public."FIN_IndirectTaxFilingProjections"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxFilingProjections" enable row level security;
revoke all on public."FIN_IndirectTaxFilingProjections" from public,anon,authenticated;
grant select on public."FIN_IndirectTaxFilingProjections" to service_role;

create function public._multideck_uk_vat_filing_projection_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_calculation public."FIN_IndirectTaxCalculations"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_box integer; v_key text; v_source numeric; v_filed numeric;
  v_fingerprint text;
begin
  perform public._multideck_uk_vat_access(new.reviewed_by,
    (select legal_entity_id from public."FIN_IndirectTaxPeriods" where id=new.period_id));
  select * into v_period from public."FIN_IndirectTaxPeriods" where id=new.period_id for update;
  select * into v_calculation from public."FIN_IndirectTaxCalculations"
    where id=new.calculation_id and period_id=new.period_id;
  if not found or v_period.status<>'draft' or v_period.jurisdiction_code<>'GB'
    or v_calculation.source_digest<>new.source_digest
    or v_calculation.box_totals<>new.source_boxes
    or v_calculation.revision<>(select max(revision) from public."FIN_IndirectTaxCalculations"
      where period_id=new.period_id)
    or (select count(*) from jsonb_object_keys(new.source_boxes))<>9
    or (select count(*) from jsonb_object_keys(new.filed_boxes))<>9
    or not exists(select 1 from public."FIN_IndirectTaxControlReviews" review
      where review.id=new.control_review_id and review.period_id=new.period_id
        and review.source_digest=new.source_digest
        and review.control_fingerprint=new.control_fingerprint) then
    raise exception 'Review the current controlled UK VAT calculation before filing projection.' using errcode='22023';
  end if;
  for v_box in 1..9 loop
    v_key:=v_box::text;
    if jsonb_typeof(new.source_boxes->v_key) is distinct from 'number'
      or jsonb_typeof(new.filed_boxes->v_key) is distinct from 'number' then
      raise exception 'A filing projection needs all nine numeric VAT boxes.' using errcode='22023';
    end if;
    v_source:=(new.source_boxes->>v_key)::numeric;
    v_filed:=(new.filed_boxes->>v_key)::numeric;
    if (v_box<=5 and v_filed<>v_source)
      or (v_box>=6 and (v_filed<>round(v_source,0) or scale(v_filed)<>0)) then
      raise exception 'Filed VAT Box % does not match the reviewed projection rule.',v_box using errcode='22023';
    end if;
  end loop;
  v_fingerprint:=encode(sha256(convert_to(new.rule_version||new.source_digest||new.control_fingerprint||
    new.source_boxes::text||new.filed_boxes::text,'UTF8')),'hex');
  if new.projection_fingerprint<>v_fingerprint then
    raise exception 'VAT filing projection fingerprint is invalid.' using errcode='22023';
  end if;
  new.reviewed_at:=clock_timestamp();
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_filing_projection_guard() from public,anon,authenticated;
create trigger indirect_tax_filing_projection_guard before insert
  on public."FIN_IndirectTaxFilingProjections"
  for each row execute function public._multideck_uk_vat_filing_projection_guard();

create function public.multideck_uk_vat_filing_projection_preview(
  p_actor uuid,p_entity uuid,p_calculation uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_calculation public."FIN_IndirectTaxCalculations"%rowtype;
  v_source jsonb; v_filed jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select period.* into v_period from public."FIN_IndirectTaxPeriods" period
    join public."FIN_IndirectTaxCalculations" calculation on calculation.period_id=period.id
    where calculation.id=p_calculation and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB';
  if not found then raise exception 'UK VAT calculation was not found.' using errcode='P0002'; end if;
  select * into v_calculation from public."FIN_IndirectTaxCalculations" where id=p_calculation;
  v_source:=v_calculation.box_totals;
  v_filed:=v_source||jsonb_build_object(
    '6',round((v_source->>'6')::numeric,0),
    '7',round((v_source->>'7')::numeric,0),
    '8',round((v_source->>'8')::numeric,0),
    '9',round((v_source->>'9')::numeric,0));
  return jsonb_build_object('calculationId',p_calculation,'periodId',v_period.id,
    'sourceDigest',v_calculation.source_digest,'ruleVersion','uk-whole-pound-nearest-v1',
    'sourceBoxes',v_source,'filedBoxes',v_filed,
    'currentDraft',v_period.status='draft' and
      v_calculation.revision=(select max(revision) from public."FIN_IndirectTaxCalculations"
        where period_id=v_period.id),
    'controlReviewed',exists(select 1 from public."FIN_IndirectTaxControlReviews" review
      where review.period_id=v_period.id and review.source_digest=v_calculation.source_digest));
end; $$;
revoke all on function public.multideck_uk_vat_filing_projection_preview(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_filing_projection_preview(uuid,uuid,uuid) to service_role;

create function public.multideck_uk_vat_review_whole_pounds(
  p_actor uuid,p_entity uuid,p_calculation uuid,p_source_digest text,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_control jsonb; v_fresh_id uuid; v_source jsonb; v_filed jsonb;
  v_fingerprint text; v_review uuid; v_at timestamptz; v_inserted boolean:=false;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_source_digest is null or p_source_digest !~ '^[a-f0-9]{64}$'
    or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Review the current VAT draft and give a filing projection reason.' using errcode='22023';
  end if;
  select period.* into v_period from public."FIN_IndirectTaxPeriods" period
    join public."FIN_IndirectTaxCalculations" calculation on calculation.period_id=period.id
    where calculation.id=p_calculation and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB' for update of period;
  if not found or v_period.status<>'draft' then
    raise exception 'A draft UK VAT period is required.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||p_entity::text,0));
  if not exists(select 1 from public."FIN_IndirectTaxControlReviews" review
    where review.period_id=v_period.id and review.source_digest=p_source_digest) then
    raise exception 'VAT evidence or control review changed; review the current draft again.' using errcode='22023';
  end if;
  -- Re-run the whole-period bridge under the same lock. A new unlinked VAT
  -- journal must invalidate filing review even when source lines are unchanged.
  v_control:=public.multideck_uk_vat_review_control(p_actor,p_entity,p_calculation,
    p_source_digest,'Revalidated VAT control before filing-value review');
  v_fresh_id:=(v_control->>'calculationId')::uuid;
  select box_totals into v_source from public."FIN_IndirectTaxCalculations" where id=v_fresh_id;
  v_filed:=v_source||jsonb_build_object(
    '6',round((v_source->>'6')::numeric,0),
    '7',round((v_source->>'7')::numeric,0),
    '8',round((v_source->>'8')::numeric,0),
    '9',round((v_source->>'9')::numeric,0));
  v_fingerprint:=encode(sha256(convert_to('uk-whole-pound-nearest-v1'||
    p_source_digest||(v_control->>'controlFingerprint')||v_source::text||v_filed::text,'UTF8')),'hex');
  insert into public."FIN_IndirectTaxFilingProjections"(
    period_id,calculation_id,source_digest,control_review_id,control_fingerprint,
    rule_version,source_boxes,filed_boxes,
    projection_fingerprint,reviewed_by,reason
  ) values (v_period.id,v_fresh_id,p_source_digest,(v_control->>'reviewId')::uuid,
    v_control->>'controlFingerprint','uk-whole-pound-nearest-v1',
    v_source,v_filed,v_fingerprint,p_actor,btrim(p_reason))
  on conflict (period_id,projection_fingerprint) do nothing
  returning id,reviewed_at into v_review,v_at;
  if v_review is null then
    select id,reviewed_at into v_review,v_at
    from public."FIN_IndirectTaxFilingProjections"
    where period_id=v_period.id and projection_fingerprint=v_fingerprint;
  else
    v_inserted:=true;
    insert into public."Audit_Events"(
      "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
      "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
      "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
    ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
      'FIN_IndirectTaxFilingProjections','indirect_tax_filing_projection',v_review,
      'review_vat_filing_projection',btrim(p_reason),'UK VAT filing values reviewed',
      jsonb_build_object('periodId',v_period.id,'calculationId',v_fresh_id,
        'sourceDigest',p_source_digest,'projectionFingerprint',v_fingerprint,
        'controlFingerprint',v_control->>'controlFingerprint',
        'ruleVersion','uk-whole-pound-nearest-v1'));
  end if;
  return jsonb_build_object('reviewId',v_review,'periodId',v_period.id,
    'calculationId',v_fresh_id,'sourceDigest',p_source_digest,
    'projectionFingerprint',v_fingerprint,'controlFingerprint',v_control->>'controlFingerprint',
    'ruleVersion','uk-whole-pound-nearest-v1',
    'sourceBoxes',v_source,'filedBoxes',v_filed,'reviewedAt',v_at,'inserted',v_inserted);
end; $$;
revoke all on function public.multideck_uk_vat_review_whole_pounds(uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_review_whole_pounds(uuid,uuid,uuid,text,text) to service_role;

create function public.multideck_uk_vat_list_filing_projections(
  p_actor uuid,p_entity uuid,p_period uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if not exists(select 1 from public."FIN_IndirectTaxPeriods" period
    where period.id=p_period and period.legal_entity_id=p_entity and period.jurisdiction_code='GB') then
    raise exception 'UK VAT period was not found.' using errcode='P0002';
  end if;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.reviewed_at desc,item.review_id desc),'[]'::jsonb)
    into v_rows from (
      select projection.id review_id,projection.calculation_id,projection.source_digest,
        projection.control_review_id,projection.control_fingerprint,
        projection.rule_version,projection.source_boxes,projection.filed_boxes,
        projection.projection_fingerprint,projection.reviewed_by,projection.reviewed_at,
        projection.reason
      from public."FIN_IndirectTaxFilingProjections" projection
      where projection.period_id=p_period
      order by projection.reviewed_at desc,projection.id desc limit 20
    ) item;
  return jsonb_build_object('periodId',p_period,'reviews',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_list_filing_projections(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_list_filing_projections(uuid,uuid,uuid) to service_role;

commit;
