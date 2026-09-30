begin;

-- A Method 1 posting is an immutable bridge from one reviewed plan to native
-- double entry and VAT source evidence. It is still subject to recalculation,
-- transaction sign-off, control review, return lock and declaration.
create table public."FIN_IndirectTaxPriorErrorMethod1Postings" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  discovery_period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  plan_id uuid not null unique references public."FIN_IndirectTaxPriorErrorMethod1Plans"(id) on delete restrict,
  batch_id uuid not null unique references public."FIN_PostingBatches"("FINPostBatch_ID") on delete restrict,
  item_count integer not null check (item_count between 1 and 100),
  plan_fingerprint text not null check (plan_fingerprint ~ '^[a-f0-9]{64}$'),
  posted_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  posted_at timestamptz not null default clock_timestamp(),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  unique (discovery_period_id)
);
create trigger indirect_tax_method1_posting_immutable before update or delete
  on public."FIN_IndirectTaxPriorErrorMethod1Postings"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxPriorErrorMethod1Postings" enable row level security;
revoke all on public."FIN_IndirectTaxPriorErrorMethod1Postings" from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxPriorErrorMethod1Postings" to service_role;

create table public."FIN_IndirectTaxPriorErrorMethod1PostingItems" (
  intake_id uuid primary key references public."FIN_IndirectTaxPriorPeriodErrorIntake"(id) on delete restrict,
  posting_id uuid not null references public."FIN_IndirectTaxPriorErrorMethod1Postings"(id) on delete restrict,
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  discovery_period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  evidence_id uuid not null unique references public."FIN_IndirectTaxEvidence"(id) on delete restrict,
  decision_id uuid not null unique references public."FIN_IndirectTaxDecisions"(id) on delete restrict,
  tax_posting_line_id uuid not null unique references public."FIN_PostingLines"("FINPostLine_ID") on delete restrict,
  offset_posting_line_id uuid not null unique references public."FIN_PostingLines"("FINPostLine_ID") on delete restrict,
  tax_nominal_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  offset_nominal_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  signed_vat_error_gbp numeric(18,2) not null check (signed_vat_error_gbp<>0),
  box_net_delta_gbp numeric(18,2) not null,
  conduct_review_id uuid not null references public."FIN_IndirectTaxPriorPeriodErrorConductReviews"(id) on delete restrict,
  time_limit_review_id uuid not null references public."FIN_IndirectTaxPriorErrorTimeLimitReviews"(id) on delete restrict,
  evidence_reference text not null check (length(btrim(evidence_reference)) between 3 and 160)
);
create index "IX_FIN_IndirectTaxPriorErrorMethod1PostingItems_posting"
  on public."FIN_IndirectTaxPriorErrorMethod1PostingItems"(posting_id,intake_id);
create trigger indirect_tax_method1_posting_item_immutable before update or delete
  on public."FIN_IndirectTaxPriorErrorMethod1PostingItems"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxPriorErrorMethod1PostingItems" enable row level security;
revoke all on public."FIN_IndirectTaxPriorErrorMethod1PostingItems" from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxPriorErrorMethod1PostingItems" to service_role;

create function public.multideck_uk_vat_post_method1_plan(
  p_actor uuid,p_entity uuid,p_plan uuid,p_reason text,p_confirmed boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_plan public."FIN_IndirectTaxPriorErrorMethod1Plans"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_intake public."FIN_IndirectTaxPriorPeriodErrorIntake"%rowtype;
  v_conduct public."FIN_IndirectTaxPriorPeriodErrorConductReviews"%rowtype;
  v_deadline public."FIN_IndirectTaxPriorErrorTimeLimitReviews"%rowtype;
  v_offset public."FIN_NominalAccounts"%rowtype;
  v_tax public."FIN_NominalAccounts"%rowtype;
  v_item jsonb; v_snapshot jsonb; v_expected_box6 numeric;
  v_accounting uuid; v_accounting_count integer; v_intake_count integer;
  v_batch uuid; v_posting uuid; v_tax_line uuid; v_offset_line uuid;
  v_evidence uuid; v_decision uuid; v_amount numeric; v_signed numeric;
  v_box_delta numeric; v_line_number integer:=0; v_ids jsonb:='[]'::jsonb;
  v_debits numeric; v_credits numeric; v_today date:=(clock_timestamp() at time zone 'Europe/London')::date;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_plan is null or p_reason is null or length(btrim(p_reason)) not between 10 and 2000
    or p_confirmed is distinct from true then
    raise exception 'Confirm the reviewed Method 1 plan and give a native posting reason.' using errcode='22023';
  end if;
  select * into v_plan from public."FIN_IndirectTaxPriorErrorMethod1Plans"
    where id=p_plan and legal_entity_id=p_entity;
  if not found then raise exception 'The Method 1 plan is unavailable for this legal entity.' using errcode='42501'; end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=v_plan.discovery_period_id and legal_entity_id=p_entity for update;
  if not found or v_period.status<>'draft' or v_period.jurisdiction_code<>'GB'
    or v_period.scheme_code<>'standard' or v_period.reporting_currency<>'GBP'
    or v_period.end_date>=v_today then
    raise exception 'Post Method 1 only after the draft Standard Accounting period has ended.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||p_entity::text,0));
  if exists(select 1 from public."FIN_IndirectTaxPriorErrorMethod1Postings"
    where discovery_period_id=v_period.id) then
    raise exception 'This VAT period already has a Method 1 posting; review the existing correction.' using errcode='23505';
  end if;
  if v_plan.id is distinct from (select id from public."FIN_IndirectTaxPriorErrorMethod1Plans"
    where discovery_period_id=v_period.id order by reviewed_at desc,id desc limit 1) then
    raise exception 'Post only the latest reviewed Method 1 plan.' using errcode='22023';
  end if;
  if exists(select 1 from public."FIN_IndirectTaxPriorErrorNotificationItems" linked
    join public."FIN_IndirectTaxPriorPeriodErrorIntake" intake on intake.id=linked.intake_id
    where intake.discovery_period_id=v_period.id and intake.legal_entity_id=p_entity) then
    raise exception 'Separately notified errors cannot be posted through this Method 1 plan.' using errcode='22023';
  end if;
  select count(*)::integer into v_intake_count
    from public."FIN_IndirectTaxPriorPeriodErrorIntake"
    where discovery_period_id=v_period.id and legal_entity_id=p_entity;
  if v_intake_count<>v_plan.item_count
    or jsonb_array_length(v_plan.planned_items)<>v_plan.item_count then
    raise exception 'The discovered-error set changed; review a new complete plan.' using errcode='22023';
  end if;
  v_snapshot:=public.multideck_uk_vat_current_snapshot(p_actor,v_period.id);
  if v_snapshot->>'sourceDigest' is distinct from v_plan.base_source_digest
    or not exists(select 1 from public."FIN_IndirectTaxCalculations"
      where id=v_plan.base_calculation_id and period_id=v_period.id
        and source_digest=v_plan.base_source_digest
        and revision=(select max(revision) from public."FIN_IndirectTaxCalculations"
          where period_id=v_period.id)) then
    raise exception 'VAT sources changed since the reviewed Method 1 plan.' using errcode='22023';
  end if;
  v_expected_box6:=round((v_snapshot->'boxes'->>'6')::numeric+v_plan.box6_delta_gbp,0);
  if v_expected_box6 is distinct from v_plan.planned_filed_box6_gbp
    or v_expected_box6<0 or
    not (abs(v_plan.net_error_gbp)<=10000 or
      (abs(v_plan.net_error_gbp)<=50000 and
        abs(v_plan.net_error_gbp)*100<=v_expected_box6)) then
    raise exception 'The final Box 6 no longer supports this Method 1 correction.' using errcode='22023';
  end if;
  select count(*)::integer,(array_agg(accounting."FINPeriod_ID"))[1]
    into v_accounting_count,v_accounting
    from public."FIN_Periods" accounting
    where accounting."FINPeriod_LegalEntityID"=p_entity
      and v_period.end_date between accounting."FINPeriod_StartDate" and accounting."FINPeriod_EndDate"
      and accounting."FINPeriod_StatusCode"='open';
  if v_accounting_count<>1 then
    raise exception 'Configure one open native accounting period covering this VAT period end.' using errcode='22023';
  end if;
  -- Check every planned source and nominal before touching the GL. The period
  -- and entity advisory locks fence later reviews, errors and posting races.
  for v_item in select value from jsonb_array_elements(v_plan.planned_items) loop
    select * into v_intake from public."FIN_IndirectTaxPriorPeriodErrorIntake"
      where id=(v_item->>'intakeId')::uuid and discovery_period_id=v_period.id
        and legal_entity_id=p_entity;
    if not found or v_intake.signed_vat_error_gbp is distinct from
      (v_item->>'signedVatErrorGbp')::numeric
      or v_intake.tax_side is distinct from v_item->>'taxSide'
      or v_intake.source_reference is distinct from v_item->>'sourceReference' then
      raise exception 'A planned previous-return error changed or is unavailable.' using errcode='22023';
    end if;
    select * into v_conduct from public."FIN_IndirectTaxPriorPeriodErrorConductReviews"
      where intake_id=v_intake.id and legal_entity_id=p_entity
      order by revision desc limit 1;
    if not found or v_conduct.id::text is distinct from v_item->>'conductReviewId'
      or v_conduct.conduct='deliberate' then
      raise exception 'A Method 1 conduct decision changed; review the plan again.' using errcode='22023';
    end if;
    select * into v_deadline from public."FIN_IndirectTaxPriorErrorTimeLimitReviews"
      where intake_id=v_intake.id and legal_entity_id=p_entity
      order by revision desc limit 1;
    if not found or v_deadline.id::text is distinct from v_item->>'timeLimitReviewId'
      or not v_deadline.within_time_limit or v_deadline.statutory_deadline_on<v_today then
      raise exception 'The Method 1 time-limit review changed or has expired.' using errcode='22023';
    end if;
    select * into v_offset from public."FIN_NominalAccounts"
      where "FINNom_ID"=(v_item->>'offsetNominalId')::uuid
        and "FINNom_LegalEntityID"=p_entity;
    if not found or not v_offset."FINNom_IsActive" or v_offset."FINNom_IsControlAccount"
      or not v_offset."FINNom_AllowManualPosting"
      or lower(coalesce(v_offset."FINNom_ControlTypeCode",'')) like '%vat%'
      or v_offset."FINNom_Code" ~ '^(1200|2100)([.]00[.]00)?$' then
      raise exception 'A planned offset account changed or is not postable.' using errcode='22023';
    end if;
    v_box_delta:=(v_item->>'boxNetDeltaGbp')::numeric;
    if v_box_delta<>round(v_box_delta,2) then
      raise exception 'A planned net-box amount is not to the penny.' using errcode='22023';
    end if;
  end loop;
  insert into public."FIN_PostingBatches"(
    "FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable",
    "FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID",
    "FINPostBatch_DebitTotal","FINPostBatch_CreditTotal",
    "FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_CreatedBy")
  values('VAT-M1-'||left(v_plan.id::text,8),'draft',
    'FIN_IndirectTaxPriorErrorMethod1Plans',v_plan.id,v_accounting,p_entity,
    0,0,'GBP',p_actor) returning "FINPostBatch_ID" into v_batch;
  insert into public."FIN_IndirectTaxPriorErrorMethod1Postings"(
    legal_entity_id,discovery_period_id,plan_id,batch_id,item_count,
    plan_fingerprint,posted_by,reason)
  values(p_entity,v_period.id,v_plan.id,v_batch,v_plan.item_count,
    v_plan.plan_fingerprint,p_actor,btrim(p_reason)) returning id into v_posting;
  for v_item in select value from jsonb_array_elements(v_plan.planned_items) loop
    select * into v_intake from public."FIN_IndirectTaxPriorPeriodErrorIntake"
      where id=(v_item->>'intakeId')::uuid;
    v_signed:=v_intake.signed_vat_error_gbp;
    v_amount:=abs(v_signed);
    v_box_delta:=(v_item->>'boxNetDeltaGbp')::numeric;
    select * into v_tax from public."FIN_NominalAccounts"
      where "FINNom_LegalEntityID"=p_entity and "FINNom_IsActive"
        and "FINNom_Code" ~ case when v_intake.tax_side='output'
          then '^2100([.]00[.]00)?$' else '^1200([.]00[.]00)?$' end
      order by case when "FINNom_Code" in ('2100','1200') then 0 else 1 end,
        "FINNom_ID" limit 1;
    if not found or lower(coalesce(v_tax."FINNom_ControlTypeCode",'')) not like '%vat%'
      and not v_tax."FINNom_IsControlAccount" then
      raise exception 'Configure an active native input and output VAT control nominal.' using errcode='22023';
    end if;
    v_line_number:=v_line_number+1;
    insert into public."FIN_PostingLines"(
      "FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
      "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount",
      "FINPostLine_CurrencyCodeSnapshot")
    values(v_batch,v_line_number,v_tax."FINNom_ID",
      'Tax: Prior-return VAT correction '||v_intake.source_reference,
      case when v_signed<0 then v_amount else 0 end,
      case when v_signed>0 then v_amount else 0 end,'GBP')
    returning "FINPostLine_ID" into v_tax_line;
    v_line_number:=v_line_number+1;
    insert into public."FIN_PostingLines"(
      "FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
      "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount",
      "FINPostLine_CurrencyCodeSnapshot")
    values(v_batch,v_line_number,(v_item->>'offsetNominalId')::uuid,
      'Prior-return VAT correction offset '||v_intake.source_reference,
      case when v_signed>0 then v_amount else 0 end,
      case when v_signed<0 then v_amount else 0 end,'GBP')
    returning "FINPostLine_ID" into v_offset_line;
    insert into public."FIN_IndirectTaxEvidence"(
      legal_entity_id,jurisdiction_code,source_kind,source_id,source_posting_batch_id,
      source_version,source_document_date,currency_code,exchange_rate,
      signed_net_amount,signed_tax_amount,signed_net_reporting,signed_tax_reporting,
      capture_kind,capture_reason,recorded_by)
    values(p_entity,'GB','adjustment',v_tax_line,v_batch,v_batch::text,
      v_period.end_date,'GBP',1,v_box_delta,
      case when v_intake.tax_side='output' then v_signed else -v_signed end,
      v_box_delta,case when v_intake.tax_side='output' then v_signed else -v_signed end,
      'manual_adjustment',btrim(p_reason),p_actor) returning id into v_evidence;
    insert into public."FIN_IndirectTaxDecisions"(
      evidence_id,revision,tax_point,scheme_code,treatment_code,
      reviewed_rule_reference,rule_snapshot,review_reason,reviewed_by)
    values(v_evidence,1,v_period.end_date,'standard',
      case when v_intake.tax_side='output' then 'prior_error_method1_output'
        else 'prior_error_method1_input' end,
      'HMRC VAT Notice 700/45 section 4.3',
      jsonb_build_object('planId',v_plan.id,'planFingerprint',v_plan.plan_fingerprint,
        'intakeId',v_intake.id,'conductReviewId',v_item->>'conductReviewId',
        'timeLimitReviewId',v_item->>'timeLimitReviewId',
        'evidenceReference',v_item->>'evidenceReference'),
      btrim(p_reason),p_actor) returning id into v_decision;
    insert into public."FIN_IndirectTaxPriorErrorMethod1PostingItems"(
      intake_id,posting_id,legal_entity_id,discovery_period_id,
      evidence_id,decision_id,tax_posting_line_id,offset_posting_line_id,
      tax_nominal_id,offset_nominal_id,signed_vat_error_gbp,box_net_delta_gbp,
      conduct_review_id,time_limit_review_id,evidence_reference)
    values(v_intake.id,v_posting,p_entity,v_period.id,
      v_evidence,v_decision,v_tax_line,v_offset_line,
      v_tax."FINNom_ID",(v_item->>'offsetNominalId')::uuid,
      v_signed,v_box_delta,(v_item->>'conductReviewId')::uuid,
      (v_item->>'timeLimitReviewId')::uuid,v_item->>'evidenceReference');
    v_ids:=v_ids||jsonb_build_array(jsonb_build_object(
      'intakeId',v_intake.id,'evidenceId',v_evidence,'decisionId',v_decision,
      'taxPostingLineId',v_tax_line,'offsetPostingLineId',v_offset_line));
  end loop;
  select coalesce(sum("FINPostLine_DebitAmount"),0),
    coalesce(sum("FINPostLine_CreditAmount"),0)
    into v_debits,v_credits from public."FIN_PostingLines"
    where "FINPostLine_BatchID"=v_batch;
  if v_debits<=0 or v_debits<>v_credits or v_debits<abs(v_plan.net_error_gbp) then
    raise exception 'Method 1 native journal is not a complete balanced entry.' using errcode='22023';
  end if;
  update public."FIN_PostingBatches" set
    "FINPostBatch_StatusCode"='posted',
    "FINPostBatch_DebitTotal"=v_debits,"FINPostBatch_CreditTotal"=v_credits,
    "FINPostBatch_PostedAt"=clock_timestamp(),"FINPostBatch_PostedBy"=p_actor
  where "FINPostBatch_ID"=v_batch;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxPriorErrorMethod1Postings','prior_period_vat_method1_posting',v_posting,
    'post_prior_period_vat_method1',btrim(p_reason),
    'UK VAT Method 1 correction posted to native ledger',
    jsonb_build_object('periodId',v_period.id,'planId',v_plan.id,'batchId',v_batch,
      'planFingerprint',v_plan.plan_fingerprint,'itemCount',v_plan.item_count,
      'netErrorGbp',v_plan.net_error_gbp,'postingItems',v_ids));
  return jsonb_build_object('postingId',v_posting,'periodId',v_period.id,
    'planId',v_plan.id,'batchId',v_batch,'itemCount',v_plan.item_count,
    'postingItems',v_ids,'status','posted_pending_vat_calculation_and_signoff');
end; $$;
revoke all on function public.multideck_uk_vat_post_method1_plan(uuid,uuid,uuid,text,boolean)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_post_method1_plan(uuid,uuid,uuid,text,boolean)
  to service_role;

-- The calculator and control inventory call this for each adjustment. They
-- must never trust an adjustment merely because an evidence row exists.
create function public._multideck_uk_vat_method1_source_fingerprint(
  p_evidence uuid,p_period uuid
) returns text language plpgsql stable set search_path=pg_catalog,public as $$
declare v_item public."FIN_IndirectTaxPriorErrorMethod1PostingItems"%rowtype;
  v_posting public."FIN_IndirectTaxPriorErrorMethod1Postings"%rowtype;
  v_plan public."FIN_IndirectTaxPriorErrorMethod1Plans"%rowtype;
  v_intake public."FIN_IndirectTaxPriorPeriodErrorIntake"%rowtype;
  v_evidence public."FIN_IndirectTaxEvidence"%rowtype;
  v_decision public."FIN_IndirectTaxDecisions"%rowtype;
  v_batch public."FIN_PostingBatches"%rowtype;
  v_tax_line public."FIN_PostingLines"%rowtype;
  v_offset_line public."FIN_PostingLines"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_planned_item jsonb; v_amount numeric; v_tax_nominal public."FIN_NominalAccounts"%rowtype;
  v_offset_nominal public."FIN_NominalAccounts"%rowtype;
  v_line_count integer; v_debits numeric; v_credits numeric;
begin
  select * into v_item from public."FIN_IndirectTaxPriorErrorMethod1PostingItems"
    where evidence_id=p_evidence and discovery_period_id=p_period;
  if not found then
    raise exception 'Method 1 VAT adjustment has no posting-item link.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods" where id=p_period;
  select * into v_posting from public."FIN_IndirectTaxPriorErrorMethod1Postings"
    where id=v_item.posting_id;
  select * into v_plan from public."FIN_IndirectTaxPriorErrorMethod1Plans"
    where id=v_posting.plan_id;
  select * into v_intake from public."FIN_IndirectTaxPriorPeriodErrorIntake"
    where id=v_item.intake_id;
  select * into v_evidence from public."FIN_IndirectTaxEvidence"
    where id=v_item.evidence_id;
  select * into v_decision from public."FIN_IndirectTaxDecisions"
    where id=v_item.decision_id;
  select * into v_batch from public."FIN_PostingBatches"
    where "FINPostBatch_ID"=v_posting.batch_id;
  select * into v_tax_line from public."FIN_PostingLines"
    where "FINPostLine_ID"=v_item.tax_posting_line_id;
  select * into v_offset_line from public."FIN_PostingLines"
    where "FINPostLine_ID"=v_item.offset_posting_line_id;
  select * into v_tax_nominal from public."FIN_NominalAccounts"
    where "FINNom_ID"=v_item.tax_nominal_id;
  select * into v_offset_nominal from public."FIN_NominalAccounts"
    where "FINNom_ID"=v_item.offset_nominal_id;
  select value into v_planned_item
    from jsonb_array_elements(v_plan.planned_items) planned(value)
    where value->>'intakeId'=v_intake.id::text;
  v_amount:=abs(v_intake.signed_vat_error_gbp);
  select count(*)::integer,coalesce(sum("FINPostLine_DebitAmount"),0),
    coalesce(sum("FINPostLine_CreditAmount"),0)
    into v_line_count,v_debits,v_credits
    from public."FIN_PostingLines" where "FINPostLine_BatchID"=v_batch."FINPostBatch_ID";
  if v_period.id is null or v_posting.id is null or v_plan.id is null
    or v_intake.id is null or v_evidence.id is null or v_decision.id is null
    or v_batch."FINPostBatch_ID" is null or v_tax_line."FINPostLine_ID" is null
    or v_offset_line."FINPostLine_ID" is null or v_planned_item is null
    or v_period.id is distinct from v_posting.discovery_period_id
    or v_period.id is distinct from v_plan.discovery_period_id
    or v_period.id is distinct from v_intake.discovery_period_id
    or v_period.legal_entity_id is distinct from v_posting.legal_entity_id
    or v_period.legal_entity_id is distinct from v_plan.legal_entity_id
    or v_period.legal_entity_id is distinct from v_intake.legal_entity_id
    or v_period.legal_entity_id is distinct from v_item.legal_entity_id
    or v_posting.plan_fingerprint is distinct from v_plan.plan_fingerprint
    or v_posting.item_count is distinct from v_plan.item_count
    or v_posting.item_count is distinct from (select count(*)
      from public."FIN_IndirectTaxPriorErrorMethod1PostingItems"
      where posting_id=v_posting.id)
    or v_batch."FINPostBatch_LegalEntityID" is distinct from v_period.legal_entity_id
    or v_batch."FINPostBatch_SourceTable" is distinct from 'FIN_IndirectTaxPriorErrorMethod1Plans'
    or v_batch."FINPostBatch_SourceID" is distinct from v_plan.id
    or v_batch."FINPostBatch_StatusCode" is distinct from 'posted'
    or v_batch."FINPostBatch_CurrencyCodeSnapshot" is distinct from 'GBP'
    or v_batch."FINPostBatch_DebitTotal" is distinct from v_debits
    or v_batch."FINPostBatch_CreditTotal" is distinct from v_credits
    or v_debits<=0 or v_debits<>v_credits or v_line_count<>v_posting.item_count*2
    or v_evidence.legal_entity_id is distinct from v_period.legal_entity_id
    or v_evidence.jurisdiction_code is distinct from 'GB'
    or v_evidence.source_kind is distinct from 'adjustment'
    or v_evidence.source_id is distinct from v_tax_line."FINPostLine_ID"
    or v_evidence.source_posting_batch_id is distinct from v_batch."FINPostBatch_ID"
    or v_evidence.source_version is distinct from v_batch."FINPostBatch_ID"::text
    or v_evidence.source_document_id is not null
    or v_evidence.source_document_line_id is not null
    or v_evidence.source_document_date is distinct from v_period.end_date
    or v_evidence.currency_code is distinct from 'GBP' or v_evidence.exchange_rate<>1
    or v_evidence.capture_kind is distinct from 'manual_adjustment'
    or v_evidence.signed_net_amount is distinct from v_item.box_net_delta_gbp
    or v_evidence.signed_net_reporting is distinct from v_item.box_net_delta_gbp
    or v_evidence.signed_tax_amount is distinct from
      (case when v_intake.tax_side='output' then v_intake.signed_vat_error_gbp
        else -v_intake.signed_vat_error_gbp end)
    or v_evidence.signed_tax_reporting is distinct from v_evidence.signed_tax_amount
    or v_decision.evidence_id is distinct from v_evidence.id
    or v_decision.revision<>1 or v_decision.tax_point is distinct from v_period.end_date
    or v_decision.scheme_code is distinct from 'standard'
    or v_decision.treatment_code is distinct from
      (case when v_intake.tax_side='output' then 'prior_error_method1_output'
        else 'prior_error_method1_input' end)
    or v_decision.rule_snapshot->>'planId' is distinct from v_plan.id::text
    or v_decision.rule_snapshot->>'intakeId' is distinct from v_intake.id::text
    or v_decision.id is distinct from (select latest.id
      from public."FIN_IndirectTaxDecisions" latest
      where latest.evidence_id=v_evidence.id order by latest.revision desc limit 1)
    or v_item.conduct_review_id is distinct from (select latest.id
      from public."FIN_IndirectTaxPriorPeriodErrorConductReviews" latest
      where latest.intake_id=v_intake.id order by latest.revision desc limit 1)
    or v_item.time_limit_review_id is distinct from (select latest.id
      from public."FIN_IndirectTaxPriorErrorTimeLimitReviews" latest
      where latest.intake_id=v_intake.id order by latest.revision desc limit 1)
    or v_tax_line."FINPostLine_BatchID" is distinct from v_batch."FINPostBatch_ID"
    or v_offset_line."FINPostLine_BatchID" is distinct from v_batch."FINPostBatch_ID"
    or v_tax_line."FINPostLine_NominalAccountID" is distinct from v_item.tax_nominal_id
    or v_offset_line."FINPostLine_NominalAccountID" is distinct from v_item.offset_nominal_id
    or v_tax_line."FINPostLine_CurrencyCodeSnapshot" is distinct from 'GBP'
    or v_offset_line."FINPostLine_CurrencyCodeSnapshot" is distinct from 'GBP'
    or v_tax_line."FINPostLine_Description" not like 'Tax: Prior-return VAT correction %'
    or v_offset_line."FINPostLine_Description" not like 'Prior-return VAT correction offset %'
    or v_tax_line."FINPostLine_DebitAmount" is distinct from
      (case when v_intake.signed_vat_error_gbp<0 then v_amount else 0 end)
    or v_tax_line."FINPostLine_CreditAmount" is distinct from
      (case when v_intake.signed_vat_error_gbp>0 then v_amount else 0 end)
    or v_offset_line."FINPostLine_DebitAmount" is distinct from
      (case when v_intake.signed_vat_error_gbp>0 then v_amount else 0 end)
    or v_offset_line."FINPostLine_CreditAmount" is distinct from
      (case when v_intake.signed_vat_error_gbp<0 then v_amount else 0 end)
    or v_tax_nominal."FINNom_LegalEntityID" is distinct from v_period.legal_entity_id
    or v_tax_nominal."FINNom_Code" !~ (case when v_intake.tax_side='output'
      then '^2100([.]00[.]00)?$' else '^1200([.]00[.]00)?$' end)
    or v_offset_nominal."FINNom_LegalEntityID" is distinct from v_period.legal_entity_id
    or v_offset_nominal."FINNom_IsControlAccount"
    or lower(coalesce(v_offset_nominal."FINNom_ControlTypeCode",'')) like '%vat%'
    or (v_planned_item->>'signedVatErrorGbp')::numeric
      is distinct from v_intake.signed_vat_error_gbp
    or (v_planned_item->>'boxNetDeltaGbp')::numeric is distinct from v_item.box_net_delta_gbp
    or v_planned_item->>'offsetNominalId' is distinct from v_item.offset_nominal_id::text
    or v_planned_item->>'conductReviewId' is distinct from v_item.conduct_review_id::text
    or v_planned_item->>'timeLimitReviewId' is distinct from v_item.time_limit_review_id::text
    or v_planned_item->>'evidenceReference' is distinct from v_item.evidence_reference then
    raise exception 'Method 1 correction source or balanced native posting changed.' using errcode='22023';
  end if;
  return encode(sha256(convert_to(jsonb_build_object(
    'plan',v_plan.plan_fingerprint,'posting',v_posting.id,
    'intake',v_intake.id,'evidence',v_evidence.id,'decision',v_decision.id,
    'batch',v_batch."FINPostBatch_ID",'batchStatus',v_batch."FINPostBatch_StatusCode",
    'batchDebit',v_batch."FINPostBatch_DebitTotal",
    'batchCredit',v_batch."FINPostBatch_CreditTotal",
    'taxLine',to_jsonb(v_tax_line),'offsetLine',to_jsonb(v_offset_line),
    'vat',v_item.signed_vat_error_gbp,'net',v_item.box_net_delta_gbp)::text,'UTF8')),'hex');
end; $$;
revoke all on function public._multideck_uk_vat_method1_source_fingerprint(uuid,uuid)
  from public,anon,authenticated,service_role;

-- Extend the calculation and VAT control inventory with verified Method 1 sources.
create or replace function public._multideck_uk_vat_calculate_core(p_actor uuid,p_period_id uuid,p_persist boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_pack record;
  v_row record; v_entry jsonb; v_entries jsonb:='[]'::jsonb; v_sources jsonb:='[]'::jsonb;
  v_registration_snapshot jsonb; v_boxes jsonb; v_control jsonb;
  v_amounts numeric[]:=array_fill(0::numeric,array[9]);
  v_missing integer; v_unreviewed integer; v_unmigrated integer; v_other_sources integer;
  v_clawback_risks integer;
  v_revision integer; v_calculation uuid; v_digest text; v_version text;
  v_ledger_checked integer; v_ledger_mismatched integer; v_ledger_sample jsonb;
  v_ledger_digest text; v_method1_fingerprints jsonb:='[]'::jsonb;
  v_adjustment_fingerprint text;
begin
  select * into v_period from public."FIN_IndirectTaxPeriods" where id=p_period_id for update;
  if not found or v_period.jurisdiction_code<>'GB' then raise exception 'UK VAT period was not found.' using errcode='P0002'; end if;
  perform public._multideck_uk_vat_access(p_actor,v_period.legal_entity_id);
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||v_period.legal_entity_id::text,0));
  if p_persist is null or (p_persist and v_period.status<>'draft')
    or (not p_persist and v_period.status not in ('draft','review_locked'))
    or v_period.scheme_code not in ('standard','annual') or v_period.reporting_currency<>'GBP' then
    raise exception 'This VAT period is not a supported GBP draft or review lock.' using errcode='22023';
  end if;
  if (select upper("LegalEntity_BaseCurrencyCodeSnapshot") from public."cmp_LegalEntities"
      where "LegalEntity_ID"=v_period.legal_entity_id)<>'GBP' then
    raise exception 'The legal entity no longer has a GBP native ledger.' using errcode='22023';
  end if;
  select * into v_registration from public."FIN_LegalEntityComplianceRegistrations"
    where "FINComplianceReg_ID"=v_period.registration_id and "FINComplianceReg_LegalEntityID"=v_period.legal_entity_id
      and "FINComplianceReg_ObligationID"=v_period.obligation_id;
  if not found or v_registration."FINComplianceReg_StatusCode" not in ('configured','sandbox_verified','production_verified')
    or not coalesce(v_registration."FINComplianceReg_RegistrationReference" ~ '^[0-9]{9}$',false)
    or v_registration."FINComplianceReg_SettingsJSON"->>'schemeCode' is distinct from v_period.scheme_code
    or v_registration."FINComplianceReg_EffectiveFrom">v_period.start_date
    or (v_registration."FINComplianceReg_EffectiveTo" is not null and v_registration."FINComplianceReg_EffectiveTo"<v_period.end_date) then
    raise exception 'UK VAT registration or scheme changed; review the period setup.' using errcode='22023';
  end if;
  select pack."FINLocPack_ID" pack_id,pack."FINLocPack_Version" pack_version,
    pack."FINLocPack_ComplianceStatusCode" pack_status,obligation."FINCompliance_Code" obligation_code
    into v_pack
    from public."FIN_ComplianceObligations" obligation
    join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    where obligation."FINCompliance_ID"=v_period.obligation_id and obligation."FINCompliance_Code"='gb-vat-mtd';
  if not found then raise exception 'The UK VAT rule pack changed or is missing.' using errcode='22023'; end if;
  -- Compare the ledger itself to captured candidates. An older posted source
  -- without a VAT event or any unresolved candidate blocks calculation.
  select count(*) into v_missing from public."FIN_Documents" doc
    join public."FIN_DocumentLines" line on line."FINDocLine_DocumentID"=doc."FINDoc_ID"
    where doc."FINDoc_LegalEntityID"=v_period.legal_entity_id
      and doc."FINDoc_NativePostingStatusCode"='posted'
      and not exists(select 1 from public."FIN_IndirectTaxEvidence" evidence
        where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
          and evidence.source_kind='posted_document_line' and evidence.source_document_line_id=line."FINDocLine_ID"
          and evidence.source_posting_batch_id=doc."FINDoc_NativePostingBatchID");
  select count(*) into v_unmigrated from public."FIN_Documents" doc
    where doc."FINDoc_LegalEntityID"=v_period.legal_entity_id
      and doc."FINDoc_NativePostingStatusCode" in ('pending_migration','reversed');
  select count(*) into v_unreviewed from public."FIN_IndirectTaxEvidence" evidence
    where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
      and not exists(select 1 from public."FIN_IndirectTaxDecisions" decision where decision.evidence_id=evidence.id);
  select count(*) into v_other_sources from public."FIN_IndirectTaxEvidence" evidence
    where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
      and evidence.source_kind not in ('posted_document_line','adjustment');
  select v_other_sources+count(*) into v_other_sources
    from public."FIN_IndirectTaxEvidence" evidence
    where evidence.legal_entity_id=v_period.legal_entity_id
      and evidence.jurisdiction_code='GB' and evidence.source_kind='adjustment'
      and not exists(select 1 from public."FIN_IndirectTaxPriorErrorMethod1PostingItems" linked
        where linked.evidence_id=evidence.id and linked.legal_entity_id=v_period.legal_entity_id);
  if v_missing<>0 or v_unmigrated<>0 or v_unreviewed<>0 or v_other_sources<>0 then
    raise exception 'VAT source review is incomplete: % missing posted lines, % pending/reversed documents, % unreviewed events, % unsupported source kinds.',
      v_missing,v_unmigrated,v_unreviewed,v_other_sources using errcode='22023';
  end if;
  select public._multideck_uk_vat_unpaid_input_tax_risks(v_period.legal_entity_id,v_period.end_date)
    into v_clawback_risks;
  if v_clawback_risks<>0 then
    raise exception '% unpaid supplier invoices may require six-month input VAT clawback before this period can be reviewed. Resolve the VAT adjustment outside this unsupported workflow.',v_clawback_risks
      using errcode='22023';
  end if;
  v_registration_snapshot:=jsonb_build_object(
    'registrationId',v_registration."FINComplianceReg_ID",
    'vrn',v_registration."FINComplianceReg_RegistrationReference",
    'status',v_registration."FINComplianceReg_StatusCode",
    'scheme',v_period.scheme_code,'effectiveFrom',v_registration."FINComplianceReg_EffectiveFrom",
    'effectiveTo',v_registration."FINComplianceReg_EffectiveTo",
    -- JSONB text is part of the source digest. A timestamptz rendered in the
    -- session time zone would make unchanged evidence hash differently.
    'updatedAt',to_char(v_registration."FINComplianceReg_UpdatedAt" at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )||jsonb_build_object('packId',v_pack.pack_id,'packVersion',v_pack.pack_version,
    'packStatus',v_pack.pack_status,'obligationCode',v_pack.obligation_code);
  for v_row in
    select evidence.*, decision.id decision_id,decision.tax_point,decision.treatment_code,
      decision.rule_snapshot,decision.reviewed_rule_reference,decision.tax_code_id
    from public."FIN_IndirectTaxEvidence" evidence
    join lateral (
      select * from public."FIN_IndirectTaxDecisions" d where d.evidence_id=evidence.id
      order by d.revision desc limit 1
    ) decision on true
    where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
      and decision.tax_point between v_period.start_date and v_period.end_date
    order by evidence.id
  loop
    v_adjustment_fingerprint:=null;
    if exists(select 1 from public."FIN_IndirectTaxReconciliations" signed
      where signed.evidence_id=v_row.id and signed.period_id<>v_period.id) then
      raise exception 'VAT evidence % was signed in another period; record a correction event.',v_row.id using errcode='22023';
    end if;
    if v_row.source_kind='posted_document_line' then
    if not exists(select 1 from public."FIN_Documents" doc
      join public."FIN_DocumentLines" source_line
        on source_line."FINDocLine_ID"=v_row.source_document_line_id
        and source_line."FINDocLine_DocumentID"=doc."FINDoc_ID"
      where doc."FINDoc_ID"=v_row.source_document_id
        and doc."FINDoc_LegalEntityID"=v_row.legal_entity_id
        and doc."FINDoc_NativePostingStatusCode"='posted'
        and doc."FINDoc_NativePostingBatchID"=v_row.source_posting_batch_id
        and doc."FINDoc_CurrencyCodeSnapshot"=v_row.currency_code
        and doc."FINDoc_ExchangeRate"=v_row.exchange_rate
        and (v_row.source_document_date is null or doc."FINDoc_DocumentDate"=v_row.source_document_date)
        and source_line."FINDocLine_NetAmount"=v_row.signed_net_amount
        and source_line."FINDocLine_TaxAmount"=v_row.signed_tax_amount
        and source_line."FINDocLine_LocalNetAmount"=v_row.signed_net_reporting
        and source_line."FINDocLine_LocalTaxAmount"=v_row.signed_tax_reporting)
      or not exists(select 1 from public."FIN_TaxCodes" tax
        where tax."FINTax_ID"=v_row.tax_code_id and tax."FINTax_LegalEntityID"=v_period.legal_entity_id
          and tax."FINTax_ApprovedAt"=(v_row.rule_snapshot->>'approvedAt')::timestamptz
          and tax."FINTax_Code"=v_row.rule_snapshot->>'code'
          and tax."FINTax_RatePercent"=(v_row.rule_snapshot->>'ratePercent')::numeric
          and tax."FINTax_TreatmentCategoryCode"=v_row.rule_snapshot->>'category'
          and tax."FINTax_IsRecoverable"=(v_row.rule_snapshot->>'recoverable')::boolean
          and tax."FINTax_EffectiveFrom"=(v_row.rule_snapshot->>'effectiveFrom')::date
          and tax."FINTax_EffectiveTo" is not distinct from (v_row.rule_snapshot->>'effectiveTo')::date
          and tax."FINTax_EffectiveFrom"<=v_row.tax_point
          and (tax."FINTax_EffectiveTo" is null or tax."FINTax_EffectiveTo">=v_row.tax_point)) then
      raise exception 'VAT source or approved treatment changed; review evidence % again.',v_row.id using errcode='22023';
    end if;
    elsif v_row.source_kind='adjustment' then
      v_adjustment_fingerprint:=public._multideck_uk_vat_method1_source_fingerprint(v_row.id,v_period.id);
      v_method1_fingerprints:=v_method1_fingerprints||jsonb_build_array(jsonb_build_object(
        'evidenceId',v_row.id,'postingFingerprint',v_adjustment_fingerprint));
    else
      raise exception 'Unsupported UK VAT source kind %.',v_row.source_kind using errcode='22023';
    end if;
    if v_row.treatment_code='domestic_sale' then
      v_amounts[1]:=v_amounts[1]+v_row.signed_tax_reporting;
      v_amounts[6]:=v_amounts[6]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',1,'amount',v_row.signed_tax_reporting),
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',6,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code in ('zero_rated_sale','exempt_sale','outside_uk_service_sale') then
      if v_row.signed_tax_amount<>0 or v_row.signed_tax_reporting<>0 then
        raise exception 'A zero-UK-VAT sale has source VAT.' using errcode='22023';
      end if;
      v_amounts[6]:=v_amounts[6]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',6,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code='domestic_purchase' then
      v_amounts[4]:=v_amounts[4]+v_row.signed_tax_reporting;
      v_amounts[7]:=v_amounts[7]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',4,'amount',v_row.signed_tax_reporting),
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',7,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code='nonrecoverable_purchase' then
      v_amounts[7]:=v_amounts[7]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',7,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code in ('zero_rated_purchase','exempt_purchase') then
      if v_row.signed_tax_amount<>0 or v_row.signed_tax_reporting<>0 then
        raise exception 'Zero-rated or exempt purchase evidence has VAT.' using errcode='22023';
      end if;
      v_amounts[7]:=v_amounts[7]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',7,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code='prior_error_method1_output' then
      v_amounts[1]:=v_amounts[1]+v_row.signed_tax_reporting;
      v_amounts[6]:=v_amounts[6]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',1,'amount',v_row.signed_tax_reporting),
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',6,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code='prior_error_method1_input' then
      v_amounts[4]:=v_amounts[4]+v_row.signed_tax_reporting;
      v_amounts[7]:=v_amounts[7]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',4,'amount',v_row.signed_tax_reporting),
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',7,'amount',v_row.signed_net_reporting));
    else
      raise exception 'UK VAT treatment % is unsupported in the standard draft.',v_row.treatment_code using errcode='22023';
    end if;
    v_sources:=v_sources||jsonb_build_array(jsonb_build_object('evidence',v_row.id,
      'decision',v_row.decision_id,'taxPoint',v_row.tax_point,'treatment',v_row.treatment_code,
      'net',v_row.signed_net_reporting,'vat',v_row.signed_tax_reporting,
      'sourceVersion',v_row.source_version,'rule',v_row.reviewed_rule_reference));
  end loop;
  -- HMRC validates box 3 against the submitted boxes 1 and 2, and box 5
  -- against the submitted boxes 3 and 4. Round those inputs first; source
  -- lines and the control bridge retain their four-decimal amounts.
  v_amounts[3]:=round(v_amounts[1],2)+round(v_amounts[2],2);
  v_amounts[5]:=abs(v_amounts[3]-round(v_amounts[4],2));
  v_boxes:=jsonb_build_object('1',round(v_amounts[1],2),'2',round(v_amounts[2],2),
    '3',round(v_amounts[3],2),'4',round(v_amounts[4],2),'5',round(v_amounts[5],2),
    '6',round(v_amounts[6],2),'7',round(v_amounts[7],2),'8',round(v_amounts[8],2),'9',round(v_amounts[9],2));
  -- Match each reviewed VAT source to the native journal lines that actually
  -- posted it. This is a source check, not a whole-period VAT control balance:
  -- timing differences and other journal sources remain unreconciled.
  with checked as (
    select evidence.id evidence_id,evidence.source_document_id document_id,
      evidence.source_document_line_id document_line_id,
      evidence.signed_net_reporting net_gbp,evidence.signed_tax_reporting vat_gbp,
      doc."FINDoc_TypeCode" document_type,
      (doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false) nonrecoverable_purchase,
      batch."FINPostBatch_StatusCode" batch_status,
      batch."FINPostBatch_LegalEntityID" batch_entity,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_Description" not like 'Tax:%'
        and line."FINPostLine_Description" not like 'Nonrecoverable tax:%') net_lines,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_Description" like 'Tax:%'
        or line."FINPostLine_Description" like 'Nonrecoverable tax:%') tax_lines,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_NominalAccountID"=expected.nominal_id
        and ((doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false
          and line."FINPostLine_Description" like 'Nonrecoverable tax:%')
          or (not (doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false)
          and line."FINPostLine_Description" like 'Tax:%'))) tax_nominal_lines,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_Description" not like 'Tax:%'
        and line."FINPostLine_Description" not like 'Nonrecoverable tax:%'
        and line."FINPostLine_NominalAccountID"=expected.nominal_id
        and not (doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false)) misplaced_net_lines,
      expected.nominal_id expected_tax_nominal_id,
      expected_nominal."FINNom_Code" expected_tax_nominal_code,
      coalesce(jsonb_agg(distinct line."FINPostLine_NominalAccountID") filter
        (where line."FINPostLine_Description" like 'Tax:%'
          or line."FINPostLine_Description" like 'Nonrecoverable tax:%'),'[]'::jsonb) posted_tax_nominal_ids,
      coalesce(jsonb_agg(distinct posted_nominal."FINNom_Code") filter
        (where (line."FINPostLine_Description" like 'Tax:%'
          or line."FINPostLine_Description" like 'Nonrecoverable tax:%')
          and posted_nominal."FINNom_Code" is not null),'[]'::jsonb) posted_tax_nominal_codes,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_NominalAccountID" is null
        or line."FINPostLine_CurrencyCodeSnapshot"<>'GBP') invalid_lines,
      encode(sha256(convert_to(coalesce(batch."FINPostBatch_StatusCode",'')||
        coalesce(batch."FINPostBatch_LegalEntityID"::text,'')||doc."FINDoc_TypeCode"||
        coalesce(expected.nominal_id::text,'')||
        coalesce(jsonb_agg(jsonb_build_object(
        'id',line."FINPostLine_ID",'nominal',line."FINPostLine_NominalAccountID",
        'debit',line."FINPostLine_DebitAmount",'credit',line."FINPostLine_CreditAmount",
        'currency',line."FINPostLine_CurrencyCodeSnapshot",'description',line."FINPostLine_Description")
        order by line."FINPostLine_ID") filter (where line."FINPostLine_ID" is not null),'[]'::jsonb)::text,'UTF8')),'hex') posting_digest,
      coalesce(sum(line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount")
        filter (where line."FINPostLine_Description" not like 'Tax:%'
          and line."FINPostLine_Description" not like 'Nonrecoverable tax:%'),0) net_posted,
      coalesce(sum(line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount")
        filter (where line."FINPostLine_Description" like 'Tax:%'
          or line."FINPostLine_Description" like 'Nonrecoverable tax:%'),0) tax_posted
    from public."FIN_IndirectTaxEvidence" evidence
    join lateral (select d.tax_point from public."FIN_IndirectTaxDecisions" d
      where d.evidence_id=evidence.id order by d.revision desc limit 1) decision on true
    join public."FIN_Documents" doc on doc."FINDoc_ID"=evidence.source_document_id
    left join public."FIN_DocumentLines" document_line
      on document_line."FINDocLine_ID"=evidence.source_document_line_id
      and document_line."FINDocLine_DocumentID"=evidence.source_document_id
    left join public."FIN_TaxCodes" tax
      on tax."FINTax_ID"=document_line."FINDocLine_TaxCodeID"
      and tax."FINTax_LegalEntityID"=v_period.legal_entity_id
    left join lateral (select public._multideck_finance_resolve_nominal(
      v_period.legal_entity_id,
      case when doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false
        then document_line."FINDocLine_NominalAccountID"
        when doc."FINDoc_TypeCode" in ('sl_invoice','credit_note')
        then tax."FINTax_OutputNominalID" else tax."FINTax_InputNominalID" end,
      case when doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false then '5000'
        when doc."FINDoc_TypeCode" in ('sl_invoice','credit_note') then '2100' else '1200' end
    ) nominal_id) expected on true
    left join public."FIN_NominalAccounts" expected_nominal
      on expected_nominal."FINNom_ID"=expected.nominal_id
      and expected_nominal."FINNom_LegalEntityID"=v_period.legal_entity_id
    left join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=evidence.source_posting_batch_id
    left join public."FIN_PostingLines" line on line."FINPostLine_BatchID"=evidence.source_posting_batch_id
      and line."FINPostLine_DocumentID"=evidence.source_document_id
      and line."FINPostLine_DocumentLineID"=evidence.source_document_line_id
    left join public."FIN_NominalAccounts" posted_nominal
      on posted_nominal."FINNom_ID"=line."FINPostLine_NominalAccountID"
      and posted_nominal."FINNom_LegalEntityID"=v_period.legal_entity_id
    where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
      and decision.tax_point between v_period.start_date and v_period.end_date
      and evidence.source_kind='posted_document_line'
    group by evidence.id,doc."FINDoc_TypeCode",tax."FINTax_IsRecoverable",batch."FINPostBatch_StatusCode",
      batch."FINPostBatch_LegalEntityID",expected.nominal_id,expected_nominal."FINNom_Code"
  ), evaluated as (
    select *,
      batch_status='posted' and batch_entity=v_period.legal_entity_id and invalid_lines=0
      and document_type in ('sl_invoice','credit_note','pl_invoice','debit_note')
      and net_lines=case when net_gbp=0 then 0 else 1 end
      and tax_lines=case when vat_gbp=0 then 0 else 1 end
      and tax_nominal_lines=tax_lines and misplaced_net_lines=0
      and (vat_gbp=0 or expected_tax_nominal_id is not null)
      and net_posted=case when document_type in ('sl_invoice','debit_note') then -abs(net_gbp) else abs(net_gbp) end
      and tax_posted=case when document_type in ('sl_invoice','debit_note') then -abs(vat_gbp) else abs(vat_gbp) end
      as matched
    from checked
  ), ranked as (
    select *,row_number() over (partition by coalesce(matched,false) order by evidence_id) mismatch_order
    from evaluated
  )
  select count(*)::integer,count(*) filter (where not coalesce(matched,false))::integer,
    coalesce(jsonb_agg(jsonb_build_object('evidenceId',evidence_id,'documentId',document_id,
      'documentLineId',document_line_id,'netGbp',net_gbp,'vatGbp',vat_gbp,
      'documentType',document_type,'batchStatus',batch_status,
      'netPosted',net_posted,'taxPosted',tax_posted,'netLines',net_lines,'taxLines',tax_lines,
      'taxNominalLines',tax_nominal_lines,'misplacedNetLines',misplaced_net_lines,
      'expectedTaxNominalId',expected_tax_nominal_id,'expectedTaxNominalCode',expected_tax_nominal_code,
      'postedTaxNominalIds',posted_tax_nominal_ids,'postedTaxNominalCodes',posted_tax_nominal_codes)
      order by evidence_id) filter (where not coalesce(matched,false) and mismatch_order<=20),'[]'::jsonb),
    encode(sha256(convert_to(coalesce(string_agg(evidence_id::text||posting_digest,'|' order by evidence_id),''),'UTF8')),'hex')
    into v_ledger_checked,v_ledger_mismatched,v_ledger_sample,v_ledger_digest from ranked;
  if jsonb_array_length(v_method1_fingerprints)>0 then
    v_ledger_checked:=v_ledger_checked+jsonb_array_length(v_method1_fingerprints);
    v_ledger_digest:=encode(sha256(convert_to(v_ledger_digest||v_method1_fingerprints::text,'UTF8')),'hex');
  end if;
  v_control:=jsonb_build_object('status','unreconciled',
    'reason','Whole-period VAT control balance and timing differences require review before approval',
    'sourceLedger',jsonb_build_object('status',case when v_ledger_mismatched=0 then 'matched' else 'mismatch' end,
      'checked',v_ledger_checked,'mismatched',v_ledger_mismatched,
      'postingDigest',v_ledger_digest,'mismatchSample',v_ledger_sample));
  v_version:=case when v_period.scheme_code='annual' then 'uk-annual-v3'
    when jsonb_array_length(v_method1_fingerprints)>0 then 'uk-standard-method1-v1'
    else 'uk-standard-v5' end;
  v_digest:=encode(sha256(convert_to(v_version||v_period.id::text||
    v_registration_snapshot::text||v_sources::text||v_boxes::text||v_ledger_digest,'UTF8')),'hex');
  if not p_persist then
    return jsonb_build_object('periodId',p_period_id,'boxes',v_boxes,
      'sourceDigest',v_digest,'calculationVersion',v_version,
      'sourceLedger',v_control->'sourceLedger','previewOnly',true);
  end if;
  select coalesce(max(revision),0)+1 into v_revision from public."FIN_IndirectTaxCalculations" where period_id=p_period_id;
  insert into public."FIN_IndirectTaxCalculations"(
    period_id,revision,calculation_version,source_digest,registration_snapshot,
    box_totals,exceptions,control_reconciliation,calculated_by
  ) values (p_period_id,v_revision,v_version,v_digest,v_registration_snapshot,
    v_boxes,'[]'::jsonb,v_control,p_actor) returning id into v_calculation;
  for v_entry in select value from jsonb_array_elements(v_entries) loop
    insert into public."FIN_IndirectTaxCalculationLines"(
      calculation_id,period_id,evidence_id,decision_id,box_number,signed_amount
    ) values (v_calculation,p_period_id,(v_entry->>'evidence')::uuid,(v_entry->>'decision')::uuid,
      (v_entry->>'box')::smallint,(v_entry->>'amount')::numeric);
  end loop;
  return jsonb_build_object('calculationId',v_calculation,'revision',v_revision,'boxes',v_boxes,
    'sourceDigest',v_digest,'controlStatus','unreconciled',
    'sourceLedger',v_control->'sourceLedger','approvalAvailable',false);
end; $$;

create or replace function public.multideck_uk_vat_tax_posting_inventory(
  p_actor uuid,p_entity uuid,p_calculation uuid,p_offset integer default 0,p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_result jsonb; v_raw_vat_due numeric; v_expected_tax_lines integer;
  v_uncovered_days integer; v_straddling_periods integer; v_control_net numeric;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Choose a valid VAT tax-posting page.' using errcode='22023';
  end if;
  select period.* into v_period from public."FIN_IndirectTaxCalculations" calculation
    join public."FIN_IndirectTaxPeriods" period on period.id=calculation.period_id
    where calculation.id=p_calculation and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB';
  if not found then raise exception 'UK VAT calculation was not found.' using errcode='P0002'; end if;
  select coalesce(sum(case line.box_number when 1 then line.signed_amount
      when 4 then -line.signed_amount else 0 end),0),
    count(*) filter (where line.box_number in (1,4) and line.signed_amount<>0)
    into v_raw_vat_due,v_expected_tax_lines
  from public."FIN_IndirectTaxCalculationLines" line
  where line.calculation_id=p_calculation and line.period_id=v_period.id;
  select count(*) filter (where coverage.period_count<>1) into v_uncovered_days
  from generate_series(v_period.start_date,v_period.end_date,interval '1 day') day
  cross join lateral (
    select count(*) period_count from public."FIN_Periods" accounting
    where accounting."FINPeriod_LegalEntityID"=p_entity
      and day::date between accounting."FINPeriod_StartDate" and accounting."FINPeriod_EndDate"
  ) coverage;
  select count(*) into v_straddling_periods from public."FIN_Periods" accounting
    where accounting."FINPeriod_LegalEntityID"=p_entity
      and accounting."FINPeriod_StartDate"<=v_period.end_date
      and accounting."FINPeriod_EndDate">=v_period.start_date
      and (accounting."FINPeriod_StartDate"<v_period.start_date
        or accounting."FINPeriod_EndDate">v_period.end_date);
  with tax_accounts as (
    select nominal."FINNom_ID" id from public."FIN_NominalAccounts" nominal
    where nominal."FINNom_LegalEntityID"=p_entity
      and (lower(coalesce(nominal."FINNom_ControlTypeCode",'')) like '%vat%'
        or nominal."FINNom_Code" ~ '^(1200|2100)([.]00[.]00)?$'
        or nominal."FINNom_ID" in (
          select tax."FINTax_OutputNominalID" from public."FIN_TaxCodes" tax
            where tax."FINTax_LegalEntityID"=p_entity and tax."FINTax_OutputNominalID" is not null
          union
          select tax."FINTax_InputNominalID" from public."FIN_TaxCodes" tax
            where tax."FINTax_LegalEntityID"=p_entity and tax."FINTax_InputNominalID" is not null))
  ), inventory as materialized (
    select posting."FINPostLine_ID" posting_line_id,
      batch."FINPostBatch_ID" batch_id,batch."FINPostBatch_Number" batch_number,
      batch."FINPostBatch_SourceTable" batch_source,
      batch."FINPostBatch_PostedAt" posted_at,
      accounting."FINPeriod_ID" accounting_period_id,
      accounting."FINPeriod_StartDate" accounting_start,
      accounting."FINPeriod_EndDate" accounting_end,
      posting."FINPostLine_LineNo" line_number,
      posting."FINPostLine_DocumentID" document_id,
      posting."FINPostLine_DocumentLineID" document_line_id,
      posting."FINPostLine_NominalAccountID" nominal_id,
      nominal."FINNom_Code" nominal_code,nominal."FINNom_Name" nominal_name,
      posting."FINPostLine_Description" description,
      posting."FINPostLine_DebitAmount" debit_gbp,
      posting."FINPostLine_CreditAmount" credit_gbp,
      posting."FINPostLine_CurrencyCodeSnapshot" currency,
      posting."FINPostLine_Description" like 'Tax:%' tax_labelled,
      posting."FINPostLine_NominalAccountID" in (select id from tax_accounts) vat_account,
      exists (
        select 1 from public."FIN_IndirectTaxCalculationLines" calc_line
        join public."FIN_IndirectTaxEvidence" evidence on evidence.id=calc_line.evidence_id
        where calc_line.calculation_id=p_calculation
          and evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
          and evidence.source_posting_batch_id=batch."FINPostBatch_ID"
          and ((evidence.source_kind='posted_document_line'
            and evidence.source_document_id=posting."FINPostLine_DocumentID"
            and evidence.source_document_line_id=posting."FINPostLine_DocumentLineID")
            or (evidence.source_kind='adjustment'
              and evidence.source_id=posting."FINPostLine_ID"
              and exists(select 1 from public."FIN_IndirectTaxPriorErrorMethod1PostingItems" method1
                where method1.evidence_id=evidence.id
                  and method1.tax_posting_line_id=posting."FINPostLine_ID"
                  and method1.legal_entity_id=p_entity
                  and method1.discovery_period_id=v_period.id)))
      ) linked_to_draft
    from public."FIN_PostingLines" posting
    join public."FIN_PostingBatches" batch
      on batch."FINPostBatch_ID"=posting."FINPostLine_BatchID"
      and batch."FINPostBatch_LegalEntityID"=p_entity
      and batch."FINPostBatch_StatusCode"='posted'
    join public."FIN_Periods" accounting
      on accounting."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
      and accounting."FINPeriod_LegalEntityID"=p_entity
      and accounting."FINPeriod_StartDate"<=v_period.end_date
      and accounting."FINPeriod_EndDate">=v_period.start_date
    left join public."FIN_NominalAccounts" nominal
      on nominal."FINNom_ID"=posting."FINPostLine_NominalAccountID"
      and nominal."FINNom_LegalEntityID"=p_entity
    where posting."FINPostLine_Description" like 'Tax:%'
      or posting."FINPostLine_NominalAccountID" in (select id from tax_accounts)
  )
  select jsonb_build_object(
    'calculationId',p_calculation,'periodId',v_period.id,'legalEntityId',p_entity,
    'scope','posted GL tax lines in accounting periods overlapping the VAT period',
    'vatPeriodStart',v_period.start_date,'vatPeriodEnd',v_period.end_date,
    'postingDigest',(select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
      'id',posting_line_id,'batch',batch_id,'accountingPeriod',accounting_period_id,
      'nominal',nominal_id,'debit',debit_gbp,'credit',credit_gbp,'currency',currency,
      'description',description,'vatAccount',vat_account,'linked',linked_to_draft)
      order by posting_line_id),'[]'::jsonb)::text,'UTF8')),'hex') from inventory),
    'accountingScopeDigest',(select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
      'id',accounting."FINPeriod_ID",'start',accounting."FINPeriod_StartDate",
      'end',accounting."FINPeriod_EndDate") order by accounting."FINPeriod_ID"),'[]'::jsonb)::text,'UTF8')),'hex')
      from public."FIN_Periods" accounting where accounting."FINPeriod_LegalEntityID"=p_entity
        and accounting."FINPeriod_StartDate"<=v_period.end_date
        and accounting."FINPeriod_EndDate">=v_period.start_date),
    'totalLines',(select count(*) from inventory),
    'linkedLines',(select count(*) from inventory where linked_to_draft),
    'unlinkedLines',(select count(*) from inventory where not linked_to_draft),
    'taxLinesOffVatAccounts',(select count(*) from inventory where tax_labelled and not coalesce(vat_account,false)),
    'nonGbpLines',(select count(*) from inventory where currency<>'GBP'),
    'totalDebitGbp',(select coalesce(sum(debit_gbp),0) from inventory where currency='GBP'),
    'totalCreditGbp',(select coalesce(sum(credit_gbp),0) from inventory where currency='GBP'),
    'linkedVatAccountDebitGbp',(select coalesce(sum(debit_gbp),0) from inventory
      where currency='GBP' and vat_account and linked_to_draft),
    'linkedVatAccountCreditGbp',(select coalesce(sum(credit_gbp),0) from inventory
      where currency='GBP' and vat_account and linked_to_draft),
    'unlinkedVatAccountDebitGbp',(select coalesce(sum(debit_gbp),0) from inventory
      where currency='GBP' and vat_account and not linked_to_draft),
    'unlinkedVatAccountCreditGbp',(select coalesce(sum(credit_gbp),0) from inventory
      where currency='GBP' and vat_account and not linked_to_draft),
    'taxOffVatAccountDebitGbp',(select coalesce(sum(debit_gbp),0) from inventory
      where currency='GBP' and tax_labelled and not coalesce(vat_account,false)),
    'taxOffVatAccountCreditGbp',(select coalesce(sum(credit_gbp),0) from inventory
      where currency='GBP' and tax_labelled and not coalesce(vat_account,false)),
    'linkedVatAccountTaxLines',(select count(*) from inventory
      where currency='GBP' and vat_account and linked_to_draft and tax_labelled),
    'offset',p_offset,
    'rows',(select coalesce(jsonb_agg(to_jsonb(page) order by page.accounting_start,page.batch_id,page.line_number,page.posting_line_id),'[]'::jsonb)
      from (select * from inventory order by accounting_start,batch_id,line_number,posting_line_id
        offset p_offset limit p_limit) page)
  ) into v_result;
  v_control_net:=(v_result->>'linkedVatAccountCreditGbp')::numeric
    +(v_result->>'unlinkedVatAccountCreditGbp')::numeric
    -(v_result->>'linkedVatAccountDebitGbp')::numeric
    -(v_result->>'unlinkedVatAccountDebitGbp')::numeric;
  v_result:=v_result||jsonb_build_object('controlBridge',jsonb_build_object(
    'sourceVatDueGbp',v_raw_vat_due,'vatAccountNetCreditGbp',v_control_net,
    'differenceGbp',v_control_net-v_raw_vat_due,
    'expectedTaxPostingLines',v_expected_tax_lines,
    'linkedVatAccountTaxLines',(v_result->>'linkedVatAccountTaxLines')::integer,
    'accountingCoverageExact',v_uncovered_days=0 and v_straddling_periods=0,
    'daysWithoutOneAccountingPeriod',v_uncovered_days,
    'straddlingAccountingPeriods',v_straddling_periods,
    'scope','GBP VAT-account movements in accounting periods overlapping the VAT period; comparison only'));
  return v_result;
end; $$;

create function public._multideck_uk_vat_prevent_mixed_prior_error_routes()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_table_name='FIN_IndirectTaxPriorErrorNotificationItems' then
    if exists(select 1 from public."FIN_IndirectTaxPriorErrorMethod1PostingItems" method1
      where method1.intake_id=new.intake_id) then
      raise exception 'This previous-return error is already posted through Method 1.' using errcode='23505';
    end if;
  elsif tg_table_name='FIN_IndirectTaxPriorErrorMethod1Plans' then
    if exists(select 1 from public."FIN_IndirectTaxPriorErrorMethod1Postings" posted
      where posted.discovery_period_id=new.discovery_period_id) then
      raise exception 'A Method 1 posting already exists for this period.' using errcode='23505';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_prevent_mixed_prior_error_routes()
  from public,anon,authenticated,service_role;
create trigger vat_prior_error_notification_excludes_method1 before insert
  on public."FIN_IndirectTaxPriorErrorNotificationItems"
  for each row execute function public._multideck_uk_vat_prevent_mixed_prior_error_routes();
create trigger vat_method1_plan_excludes_posted_period before insert
  on public."FIN_IndirectTaxPriorErrorMethod1Plans"
  for each row execute function public._multideck_uk_vat_prevent_mixed_prior_error_routes();

create or replace function public._multideck_uk_vat_require_resolved_prior_errors(p_period uuid)
returns void language plpgsql stable set search_path=pg_catalog,public as $$
declare v_unresolved integer;
begin
  select count(*)::integer into v_unresolved
  from public."FIN_IndirectTaxPriorPeriodErrorIntake" intake
  where intake.discovery_period_id=p_period
    and not exists (
      select 1 from public."FIN_IndirectTaxPriorErrorNotificationItems" linked
      join public."FIN_IndirectTaxPriorErrorNotifications" notice
        on notice.id=linked.notification_id
        and notice.legal_entity_id=intake.legal_entity_id
        and notice.discovery_period_id=intake.discovery_period_id
      where linked.intake_id=intake.id
        and linked.legal_entity_id=intake.legal_entity_id)
    and not exists (
      select 1 from public."FIN_IndirectTaxPriorErrorMethod1PostingItems" item
      join public."FIN_IndirectTaxPriorErrorMethod1Postings" posting
        on posting.id=item.posting_id
        and posting.discovery_period_id=intake.discovery_period_id
        and posting.legal_entity_id=intake.legal_entity_id
      join public."FIN_IndirectTaxPeriods" period
        on period.id=posting.discovery_period_id
        and period.status='review_locked'
      join public."FIN_IndirectTaxPeriodReviewLocks" review_lock
        on review_lock.id=period.active_review_lock_id
        and review_lock.period_id=period.id
      join public."FIN_IndirectTaxCalculationLines" tax_line
        on tax_line.calculation_id=review_lock.calculation_id
        and tax_line.period_id=period.id
        and tax_line.evidence_id=item.evidence_id
        and tax_line.decision_id=item.decision_id
        and tax_line.box_number=case when intake.tax_side='output' then 1 else 4 end
      where item.intake_id=intake.id and item.legal_entity_id=intake.legal_entity_id
        and item.discovery_period_id=intake.discovery_period_id
        and item.signed_vat_error_gbp=intake.signed_vat_error_gbp);
  if v_unresolved>0 then
    raise exception '% previous-return VAT error(s) lack a completed correction route. Post and lock a reviewed Method 1 adjustment or record separate HMRC notification evidence before filing.',v_unresolved
      using errcode='22023';
  end if;
end; $$;
revoke all on function public._multideck_uk_vat_require_resolved_prior_errors(uuid)
  from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_method1_postings(
  p_actor uuid,p_entity uuid,p_period uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if not exists(select 1 from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB') then
    raise exception 'The discovery VAT period is unavailable.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',posting.id,'planId',posting.plan_id,'batchId',posting.batch_id,
    'itemCount',posting.item_count,'planFingerprint',posting.plan_fingerprint,
    'postedBy',posting.posted_by,'postedAt',posting.posted_at,'reason',posting.reason,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'intakeId',item.intake_id,'evidenceId',item.evidence_id,
      'decisionId',item.decision_id,'taxPostingLineId',item.tax_posting_line_id,
      'offsetPostingLineId',item.offset_posting_line_id,
      'signedVatErrorGbp',item.signed_vat_error_gbp,
      'boxNetDeltaGbp',item.box_net_delta_gbp,'evidenceReference',item.evidence_reference)
      order by item.intake_id) from public."FIN_IndirectTaxPriorErrorMethod1PostingItems" item
      where item.posting_id=posting.id),'[]'::jsonb)) order by posting.posted_at desc),'[]'::jsonb)
    into v_rows from public."FIN_IndirectTaxPriorErrorMethod1Postings" posting
    where posting.discovery_period_id=p_period and posting.legal_entity_id=p_entity;
  return jsonb_build_object('periodId',p_period,'postings',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_method1_postings(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_method1_postings(uuid,uuid,uuid)
  to service_role;

commit;
