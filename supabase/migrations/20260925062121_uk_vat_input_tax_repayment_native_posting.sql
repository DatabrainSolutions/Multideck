begin;

create table public."FIN_IndirectTaxInputTaxRepaymentPostings" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  document_id uuid not null references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  proposal_id uuid not null unique references public."FIN_IndirectTaxInputTaxRepaymentProposals"(id) on delete restrict,
  review_id uuid not null unique references public."FIN_IndirectTaxInputTaxRepaymentReviews"(id) on delete restrict,
  batch_id uuid not null unique references public."FIN_PostingBatches"("FINPostBatch_ID") on delete restrict,
  schedule_fingerprint text not null check (schedule_fingerprint ~ '^[a-f0-9]{64}$'),
  event_count integer not null check (event_count>0),
  box4_delta_gbp numeric(18,2) not null,
  unpaid_at_period_end numeric(18,4) not null check (unpaid_at_period_end>=0),
  posted_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  posted_at timestamptz not null default clock_timestamp(),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  unique (period_id,document_id)
);
create trigger indirect_tax_input_tax_repayment_posting_immutable before update or delete
  on public."FIN_IndirectTaxInputTaxRepaymentPostings"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxInputTaxRepaymentPostings" enable row level security;
revoke all on public."FIN_IndirectTaxInputTaxRepaymentPostings"
  from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxInputTaxRepaymentPostings" to service_role;

create table public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references public."FIN_IndirectTaxInputTaxRepaymentPostings"(id) on delete restrict,
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  document_id uuid not null references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  event_date date not null,
  event_kind text not null check (event_kind in ('six_month_repayment','payment_restoration')),
  signed_box4_delta_gbp numeric(18,2) not null check (signed_box4_delta_gbp<>0),
  evidence_id uuid not null unique references public."FIN_IndirectTaxEvidence"(id) on delete restrict,
  decision_id uuid not null unique references public."FIN_IndirectTaxDecisions"(id) on delete restrict,
  tax_posting_line_id uuid not null unique references public."FIN_PostingLines"("FINPostLine_ID") on delete restrict,
  offset_posting_line_id uuid not null unique references public."FIN_PostingLines"("FINPostLine_ID") on delete restrict,
  tax_nominal_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  offset_nominal_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  unique (posting_id,event_date,event_kind)
);
create index "IX_FIN_IndirectTaxInputTaxRepaymentPostingEvents_period"
  on public."FIN_IndirectTaxInputTaxRepaymentPostingEvents"(period_id,posting_id,event_date);
create trigger indirect_tax_input_tax_repayment_posting_event_immutable before update or delete
  on public."FIN_IndirectTaxInputTaxRepaymentPostingEvents"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" enable row level security;
revoke all on public."FIN_IndirectTaxInputTaxRepaymentPostingEvents"
  from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" to service_role;

create function public._multideck_uk_vat_prevent_posted_repayment_review_revocation()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentPostings"
    where review_id=new.review_id) then
    raise exception 'A posted input VAT repayment review cannot be revoked.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_prevent_posted_repayment_review_revocation()
  from public,anon,authenticated;
create trigger input_tax_repayment_review_posting_lock before insert
  on public."FIN_IndirectTaxInputTaxRepaymentReviewRevocations"
  for each row execute function public._multideck_uk_vat_prevent_posted_repayment_review_revocation();

create function public.multideck_uk_vat_post_input_tax_repayment(
  p_actor uuid,p_entity uuid,p_review uuid,p_reason text,p_confirmed boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_review public."FIN_IndirectTaxInputTaxRepaymentReviews"%rowtype;
  v_proposal public."FIN_IndirectTaxInputTaxRepaymentProposals"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_tax public."FIN_NominalAccounts"%rowtype;
  v_schedule jsonb; v_event jsonb; v_items jsonb:='[]'::jsonb;
  v_accounting uuid; v_accounting_count integer;
  v_batch uuid; v_posting uuid; v_tax_line uuid; v_offset_line uuid;
  v_evidence uuid; v_decision uuid; v_line_number integer:=0;
  v_amount numeric; v_signed numeric; v_total numeric:=0; v_debits numeric; v_credits numeric;
  v_today date:=(clock_timestamp() at time zone 'Europe/London')::date;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_review is null or p_reason is null or length(btrim(p_reason)) not between 10 and 2000
    or p_confirmed is distinct from true then
    raise exception 'Confirm the reviewed supplier VAT adjustment and give a posting reason.' using errcode='22023';
  end if;
  select * into v_review from public."FIN_IndirectTaxInputTaxRepaymentReviews"
    where id=p_review and legal_entity_id=p_entity;
  if not found then raise exception 'The input VAT repayment review is unavailable.' using errcode='42501'; end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=v_review.period_id and legal_entity_id=p_entity for update;
  if not found or v_period.status<>'draft' or v_period.scheme_code<>'standard'
    or v_period.jurisdiction_code<>'GB' or v_period.reporting_currency<>'GBP'
    or v_period.end_date>=v_today then
    raise exception 'Post supplier VAT adjustments only after the draft Standard period ends.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||p_entity::text,0));
  perform pg_advisory_xact_lock(hashtextextended('uk-vat-input-tax-review:'||v_review.proposal_id::text,0));
  if exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentPostings"
    where period_id=v_period.id and document_id=v_review.document_id) then
    raise exception 'This supplier VAT adjustment was already posted for the period.' using errcode='23505';
  end if;
  v_schedule:=public.multideck_uk_vat_input_tax_repayment_schedule(
    p_actor,p_entity,p_review);
  select * into v_proposal from public."FIN_IndirectTaxInputTaxRepaymentProposals"
    where id=v_review.proposal_id and legal_entity_id=p_entity;
  if v_schedule->>'reviewId' is distinct from p_review::text
    or v_schedule->>'status' is distinct from 'reviewed_schedule_only_no_posting'
    or jsonb_array_length(v_schedule->'events')<1
    or v_proposal.id is null then
    raise exception 'The current input VAT repayment schedule is unavailable.' using errcode='22023';
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
  select * into v_tax from public."FIN_NominalAccounts"
    where "FINNom_LegalEntityID"=p_entity and "FINNom_IsActive"
      and "FINNom_Code" ~ '^1200([.]00[.]00)?$'
    order by case when "FINNom_Code"='1200' then 0 else 1 end,"FINNom_ID" limit 1;
  if not found or not v_tax."FINNom_IsControlAccount"
    and lower(coalesce(v_tax."FINNom_ControlTypeCode",'')) not like '%vat%' then
    raise exception 'Configure an active native input VAT control nominal.' using errcode='22023';
  end if;
  insert into public."FIN_PostingBatches"(
    "FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable",
    "FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID",
    "FINPostBatch_DebitTotal","FINPostBatch_CreditTotal",
    "FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_CreatedBy")
  values('VAT-ITR-'||left(v_review.id::text,8),'draft',
    'FIN_IndirectTaxInputTaxRepaymentReviews',v_review.id,v_accounting,p_entity,
    0,0,'GBP',p_actor) returning "FINPostBatch_ID" into v_batch;
  insert into public."FIN_IndirectTaxInputTaxRepaymentPostings"(
    legal_entity_id,period_id,document_id,proposal_id,review_id,batch_id,
    schedule_fingerprint,event_count,box4_delta_gbp,unpaid_at_period_end,posted_by,reason)
  values(p_entity,v_period.id,v_review.document_id,v_proposal.id,v_review.id,v_batch,
    v_schedule->>'scheduleFingerprint',jsonb_array_length(v_schedule->'events'),
    v_proposal.proposed_box4_delta_gbp,v_proposal.unpaid_at_period_end,p_actor,btrim(p_reason))
  returning id into v_posting;
  for v_event in select value from jsonb_array_elements(v_schedule->'events') loop
    v_signed:=(v_event->>'signedBox4DeltaGbp')::numeric;
    v_amount:=abs(v_signed);
    if v_amount<=0 or v_amount<>round(v_amount,2)
      or (v_event->>'eventDate')::date not between v_period.start_date and v_period.end_date
      or v_event->>'kind' not in ('six_month_repayment','payment_restoration') then
      raise exception 'A dated input VAT adjustment is invalid.' using errcode='22023';
    end if;
    v_line_number:=v_line_number+1;
    insert into public."FIN_PostingLines"(
      "FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
      "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount",
      "FINPostLine_CurrencyCodeSnapshot")
    values(v_batch,v_line_number,v_tax."FINNom_ID",
      'Tax: Supplier input VAT '||(v_event->>'kind'),
      case when v_signed>0 then v_amount else 0 end,
      case when v_signed<0 then v_amount else 0 end,'GBP')
    returning "FINPostLine_ID" into v_tax_line;
    v_line_number:=v_line_number+1;
    insert into public."FIN_PostingLines"(
      "FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
      "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount",
      "FINPostLine_CurrencyCodeSnapshot")
    values(v_batch,v_line_number,v_review.offset_nominal_id,
      'Supplier input VAT adjustment offset',
      case when v_signed<0 then v_amount else 0 end,
      case when v_signed>0 then v_amount else 0 end,'GBP')
    returning "FINPostLine_ID" into v_offset_line;
    insert into public."FIN_IndirectTaxEvidence"(
      legal_entity_id,jurisdiction_code,source_kind,source_id,source_posting_batch_id,
      source_version,source_document_date,currency_code,exchange_rate,
      signed_net_amount,signed_tax_amount,signed_net_reporting,signed_tax_reporting,
      capture_kind,capture_reason,recorded_by)
    values(p_entity,'GB','adjustment',v_tax_line,v_batch,v_batch::text,
      (v_event->>'eventDate')::date,'GBP',1,0,v_signed,0,v_signed,
      'manual_adjustment',btrim(p_reason),p_actor) returning id into v_evidence;
    insert into public."FIN_IndirectTaxDecisions"(
      evidence_id,revision,tax_point,scheme_code,treatment_code,
      reviewed_rule_reference,rule_snapshot,review_reason,reviewed_by)
    values(v_evidence,1,(v_event->>'eventDate')::date,'standard',
      case when v_event->>'kind'='six_month_repayment'
        then 'input_tax_six_month_repayment' else 'input_tax_payment_restoration' end,
      'HMRC VAT Notice 700/18 section 4',
      jsonb_build_object('reviewId',v_review.id,'proposalId',v_proposal.id,
        'documentId',v_review.document_id,
        'scheduleFingerprint',v_schedule->>'scheduleFingerprint',
        'sourceFingerprint',v_proposal.source_fingerprint,
        'event',v_event),btrim(p_reason),p_actor) returning id into v_decision;
    insert into public."FIN_IndirectTaxInputTaxRepaymentPostingEvents"(
      posting_id,legal_entity_id,period_id,document_id,event_date,event_kind,
      signed_box4_delta_gbp,evidence_id,decision_id,tax_posting_line_id,
      offset_posting_line_id,tax_nominal_id,offset_nominal_id)
    values(v_posting,p_entity,v_period.id,v_review.document_id,
      (v_event->>'eventDate')::date,v_event->>'kind',v_signed,
      v_evidence,v_decision,v_tax_line,v_offset_line,v_tax."FINNom_ID",v_review.offset_nominal_id);
    v_total:=v_total+v_signed;
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'eventDate',v_event->>'eventDate','kind',v_event->>'kind',
      'signedBox4DeltaGbp',v_signed,'evidenceId',v_evidence,
      'decisionId',v_decision,'taxPostingLineId',v_tax_line,
      'offsetPostingLineId',v_offset_line));
  end loop;
  if v_total is distinct from v_proposal.proposed_box4_delta_gbp then
    raise exception 'Posted input VAT events do not match the reviewed Box 4 delta.' using errcode='22023';
  end if;
  select coalesce(sum("FINPostLine_DebitAmount"),0),
    coalesce(sum("FINPostLine_CreditAmount"),0) into v_debits,v_credits
    from public."FIN_PostingLines" where "FINPostLine_BatchID"=v_batch;
  if v_debits<=0 or v_debits<>v_credits then
    raise exception 'Supplier input VAT posting is not balanced.' using errcode='22023';
  end if;
  update public."FIN_PostingBatches" set "FINPostBatch_StatusCode"='posted',
    "FINPostBatch_DebitTotal"=v_debits,"FINPostBatch_CreditTotal"=v_credits,
    "FINPostBatch_PostedAt"=clock_timestamp(),"FINPostBatch_PostedBy"=p_actor
  where "FINPostBatch_ID"=v_batch;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxInputTaxRepaymentPostings','input_tax_repayment_posting',v_posting,
    'post_input_tax_repayment',btrim(p_reason),
    'UK supplier input VAT repayment posted to native ledger',
    jsonb_build_object('periodId',v_period.id,'documentId',v_review.document_id,
      'proposalId',v_proposal.id,'reviewId',v_review.id,'batchId',v_batch,
      'scheduleFingerprint',v_schedule->>'scheduleFingerprint',
      'eventCount',jsonb_array_length(v_schedule->'events'),'events',v_items));
  return jsonb_build_object('postingId',v_posting,'periodId',v_period.id,
    'documentId',v_review.document_id,'batchId',v_batch,
    'scheduleFingerprint',v_schedule->>'scheduleFingerprint',
    'eventCount',jsonb_array_length(v_schedule->'events'),'box4DeltaGbp',v_total,
    'events',v_items,'status','posted_pending_vat_calculation_and_signoff');
end; $$;
revoke all on function public.multideck_uk_vat_post_input_tax_repayment(uuid,uuid,uuid,text,boolean)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_post_input_tax_repayment(uuid,uuid,uuid,text,boolean)
  to service_role;

commit;
