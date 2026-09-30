begin;

create table public."FIN_IndirectTaxLaterInputTaxRestorationPostings" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  document_id uuid not null references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  first_posting_id uuid not null references public."FIN_IndirectTaxInputTaxRepaymentPostings"(id) on delete restrict,
  review_id uuid not null unique references public."FIN_IndirectTaxLaterInputTaxRestorationReviews"(id) on delete restrict,
  batch_id uuid unique references public."FIN_PostingBatches"("FINPostBatch_ID") on delete restrict,
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('posted','zero_tax_effect_confirmed')),
  event_count integer not null check (event_count>=0),
  restoration_box4_gbp numeric(18,2) not null check (restoration_box4_gbp>=0),
  remaining_repayment_gbp numeric(18,2) not null check (remaining_repayment_gbp>=0),
  unpaid_at_period_end_gbp numeric(18,4) not null check (unpaid_at_period_end_gbp>=0),
  posted_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  posted_at timestamptz not null default clock_timestamp(),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  unique (period_id,document_id),
  check ((status='posted' and batch_id is not null and event_count>0
    and restoration_box4_gbp>0)
    or (status='zero_tax_effect_confirmed' and batch_id is null and event_count=0
      and restoration_box4_gbp=0))
);
create index "IX_FIN_IndirectTaxLaterInputTaxRestorationPostings_document"
  on public."FIN_IndirectTaxLaterInputTaxRestorationPostings"(
    legal_entity_id,document_id,period_id);
create trigger indirect_tax_later_input_tax_restoration_posting_immutable
  before update or delete on public."FIN_IndirectTaxLaterInputTaxRestorationPostings"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxLaterInputTaxRestorationPostings" enable row level security;
revoke all on public."FIN_IndirectTaxLaterInputTaxRestorationPostings"
  from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxLaterInputTaxRestorationPostings" to service_role;

create table public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents" (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references public."FIN_IndirectTaxLaterInputTaxRestorationPostings"(id) on delete restrict,
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  document_id uuid not null references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  event_date date not null,
  source_payment_gbp numeric(18,4) not null check (source_payment_gbp>0),
  signed_box4_delta_gbp numeric(18,2) not null check (signed_box4_delta_gbp>0),
  evidence_id uuid not null unique references public."FIN_IndirectTaxEvidence"(id) on delete restrict,
  decision_id uuid not null unique references public."FIN_IndirectTaxDecisions"(id) on delete restrict,
  tax_posting_line_id uuid not null unique references public."FIN_PostingLines"("FINPostLine_ID") on delete restrict,
  offset_posting_line_id uuid not null unique references public."FIN_PostingLines"("FINPostLine_ID") on delete restrict,
  tax_nominal_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  offset_nominal_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  unique (posting_id,event_date)
);
create index "IX_FIN_IndirectTaxLaterInputTaxRestorationPostingEvents_period"
  on public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents"(
    period_id,posting_id,event_date);
create trigger indirect_tax_later_input_tax_restoration_event_immutable
  before update or delete on public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents" enable row level security;
revoke all on public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents"
  from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents" to service_role;

create function public._multideck_uk_vat_prevent_posted_later_restoration_review()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public."FIN_IndirectTaxLaterInputTaxRestorationPostings" posted
    where posted.legal_entity_id=new.legal_entity_id
      and posted.period_id=new.period_id and posted.document_id=new.document_id) then
    raise exception 'A posted supplier VAT restoration cannot be reviewed again; use a later dated period.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_prevent_posted_later_restoration_review()
  from public,anon,authenticated,service_role;
create trigger later_input_tax_restoration_posted_review_lock before insert
  on public."FIN_IndirectTaxLaterInputTaxRestorationReviews"
  for each row execute function public._multideck_uk_vat_prevent_posted_later_restoration_review();

create function public.multideck_uk_vat_post_later_input_tax_restoration(
  p_actor uuid,p_entity uuid,p_review uuid,p_reason text,p_confirmed boolean
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_review public."FIN_IndirectTaxLaterInputTaxRestorationReviews"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_offset public."FIN_NominalAccounts"%rowtype;
  v_tax public."FIN_NominalAccounts"%rowtype;
  v_source jsonb; v_event jsonb; v_items jsonb:='[]'::jsonb;
  v_accounting uuid; v_accounting_count integer;
  v_batch uuid; v_posting uuid; v_tax_line uuid; v_offset_line uuid;
  v_evidence uuid; v_decision uuid; v_line_number integer:=0;
  v_amount numeric; v_total numeric:=0; v_debits numeric; v_credits numeric;
  v_today date:=(clock_timestamp() at time zone 'Europe/London')::date;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_review is null or p_reason is null
    or length(btrim(p_reason)) not between 10 and 2000
    or p_confirmed is distinct from true then
    raise exception 'Confirm the reviewed later supplier VAT restoration and give a posting reason.' using errcode='22023';
  end if;
  select * into v_review from public."FIN_IndirectTaxLaterInputTaxRestorationReviews"
    where id=p_review and legal_entity_id=p_entity;
  if not found then raise exception 'Later supplier VAT review is unavailable.' using errcode='42501'; end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=v_review.period_id and legal_entity_id=p_entity for update;
  if not found or v_period.status<>'draft' or v_period.scheme_code<>'standard'
    or v_period.jurisdiction_code<>'GB' or v_period.reporting_currency<>'GBP'
    or v_period.end_date>=v_today then
    raise exception 'Post later supplier VAT restoration only after the draft Standard period ends.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||p_entity::text,0));
  perform pg_advisory_xact_lock(hashtextextended(
    'uk-vat-later-input-tax-review:'||p_entity::text||':'||
    v_period.id::text||':'||v_review.document_id::text,0));
  if exists(select 1 from public."FIN_IndirectTaxLaterInputTaxRestorationPostings"
    where period_id=v_period.id and document_id=v_review.document_id) then
    raise exception 'This later supplier VAT restoration was already recorded for the period.' using errcode='23505';
  end if;
  if p_review is distinct from (select latest.id
    from public."FIN_IndirectTaxLaterInputTaxRestorationReviews" latest
    where latest.legal_entity_id=p_entity and latest.period_id=v_period.id
      and latest.document_id=v_review.document_id
    order by latest.revision desc limit 1) then
    raise exception 'Post only the latest accountant review for this supplier payment period.' using errcode='22023';
  end if;
  select * into v_offset from public."FIN_NominalAccounts"
    where "FINNom_ID"=v_review.offset_nominal_id
      and "FINNom_LegalEntityID"=p_entity;
  if not found or not v_offset."FINNom_IsActive"
    or v_offset."FINNom_IsControlAccount"
    or not v_offset."FINNom_AllowManualPosting"
    or lower(coalesce(v_offset."FINNom_ControlTypeCode",'')) like '%vat%' then
    raise exception 'The reviewed supplier VAT offset account is no longer postable.' using errcode='22023';
  end if;
  v_source:=public.multideck_uk_vat_later_input_tax_restoration_source(
    p_actor,p_entity,v_period.id,v_review.document_id);
  if v_source->>'sourceFingerprint' is distinct from v_review.source_fingerprint
    or v_source->>'firstPostingId' is distinct from v_review.first_posting_id::text
    or (v_source->>'priorRepaymentOutstandingGbp')::numeric
      is distinct from v_review.prior_repayment_outstanding_gbp
    or (v_source->>'restorationBox4Gbp')::numeric
      is distinct from v_review.restoration_box4_gbp
    or (v_source->>'unpaidAtPeriodEndGbp')::numeric
      is distinct from v_review.unpaid_at_period_end_gbp
    or v_source->'events' is distinct from v_review.source_events
    or v_source->>'status' not in ('source_only_no_posting','source_only_no_tax_effect') then
    raise exception 'Supplier payment source changed since the accountant review.' using errcode='22023';
  end if;
  if v_review.restoration_box4_gbp>0 then
    select count(*)::integer,(array_agg(accounting."FINPeriod_ID"))[1]
      into v_accounting_count,v_accounting
      from public."FIN_Periods" accounting
      where accounting."FINPeriod_LegalEntityID"=p_entity
        and v_period.end_date between accounting."FINPeriod_StartDate"
          and accounting."FINPeriod_EndDate"
        and accounting."FINPeriod_StatusCode"='open';
    if v_accounting_count<>1 then
      raise exception 'Configure one open native accounting period covering this VAT period end.' using errcode='22023';
    end if;
    select * into v_tax from public."FIN_NominalAccounts"
      where "FINNom_LegalEntityID"=p_entity and "FINNom_IsActive"
        and "FINNom_Code" ~ '^1200([.]00[.]00)?$'
      order by case when "FINNom_Code"='1200' then 0 else 1 end,"FINNom_ID" limit 1;
    if not found or (not v_tax."FINNom_IsControlAccount"
      and lower(coalesce(v_tax."FINNom_ControlTypeCode",'')) not like '%vat%') then
      raise exception 'Configure an active native input VAT control nominal.' using errcode='22023';
    end if;
    insert into public."FIN_PostingBatches"(
      "FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable",
      "FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID",
      "FINPostBatch_DebitTotal","FINPostBatch_CreditTotal",
      "FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_CreatedBy")
    values('VAT-ITR-L-'||left(v_review.id::text,8),'draft',
      'FIN_IndirectTaxLaterInputTaxRestorationReviews',v_review.id,v_accounting,p_entity,
      0,0,'GBP',p_actor) returning "FINPostBatch_ID" into v_batch;
  end if;
  insert into public."FIN_IndirectTaxLaterInputTaxRestorationPostings"(
    legal_entity_id,period_id,document_id,first_posting_id,review_id,batch_id,
    source_fingerprint,status,event_count,restoration_box4_gbp,
    remaining_repayment_gbp,unpaid_at_period_end_gbp,posted_by,reason)
  values(p_entity,v_period.id,v_review.document_id,v_review.first_posting_id,
    v_review.id,v_batch,v_review.source_fingerprint,
    case when v_review.restoration_box4_gbp=0
      then 'zero_tax_effect_confirmed' else 'posted' end,
    jsonb_array_length(v_source->'events'),v_review.restoration_box4_gbp,
    v_review.prior_repayment_outstanding_gbp-v_review.restoration_box4_gbp,
    v_review.unpaid_at_period_end_gbp,p_actor,btrim(p_reason))
  returning id into v_posting;
  for v_event in select value from jsonb_array_elements(v_source->'events') loop
    v_amount:=(v_event->>'signedBox4DeltaGbp')::numeric;
    if v_amount<=0 or v_amount<>round(v_amount,2)
      or (v_event->>'eventDate')::date not between v_period.start_date and v_period.end_date
      or v_event->>'kind'<>'later_payment_restoration' then
      raise exception 'A dated supplier VAT restoration event is invalid.' using errcode='22023';
    end if;
    v_line_number:=v_line_number+1;
    insert into public."FIN_PostingLines"(
      "FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
      "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount",
      "FINPostLine_CurrencyCodeSnapshot")
    values(v_batch,v_line_number,v_tax."FINNom_ID",
      'Tax: Later supplier input VAT restoration',v_amount,0,'GBP')
    returning "FINPostLine_ID" into v_tax_line;
    v_line_number:=v_line_number+1;
    insert into public."FIN_PostingLines"(
      "FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
      "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount",
      "FINPostLine_CurrencyCodeSnapshot")
    values(v_batch,v_line_number,v_review.offset_nominal_id,
      'Later supplier input VAT restoration offset',0,v_amount,'GBP')
    returning "FINPostLine_ID" into v_offset_line;
    insert into public."FIN_IndirectTaxEvidence"(
      legal_entity_id,jurisdiction_code,source_kind,source_id,source_posting_batch_id,
      source_version,source_document_date,currency_code,exchange_rate,
      signed_net_amount,signed_tax_amount,signed_net_reporting,signed_tax_reporting,
      capture_kind,capture_reason,recorded_by)
    values(p_entity,'GB','adjustment',v_tax_line,v_batch,v_batch::text,
      (v_event->>'eventDate')::date,'GBP',1,0,v_amount,0,v_amount,
      'manual_adjustment',btrim(p_reason),p_actor) returning id into v_evidence;
    insert into public."FIN_IndirectTaxDecisions"(
      evidence_id,revision,tax_point,scheme_code,treatment_code,
      reviewed_rule_reference,rule_snapshot,review_reason,reviewed_by)
    values(v_evidence,1,(v_event->>'eventDate')::date,'standard',
      'input_tax_later_payment_restoration','HMRC VAT Notice 700/18 section 4.7',
      jsonb_build_object('reviewId',v_review.id,'firstPostingId',v_review.first_posting_id,
        'documentId',v_review.document_id,
        'sourceFingerprint',v_review.source_fingerprint,'event',v_event),
      btrim(p_reason),p_actor) returning id into v_decision;
    insert into public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents"(
      posting_id,legal_entity_id,period_id,document_id,event_date,
      source_payment_gbp,signed_box4_delta_gbp,evidence_id,decision_id,
      tax_posting_line_id,offset_posting_line_id,tax_nominal_id,offset_nominal_id)
    values(v_posting,p_entity,v_period.id,v_review.document_id,
      (v_event->>'eventDate')::date,(v_event->>'sourcePaymentGbp')::numeric,
      v_amount,v_evidence,v_decision,v_tax_line,v_offset_line,
      v_tax."FINNom_ID",v_review.offset_nominal_id);
    v_total:=v_total+v_amount;
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'eventDate',v_event->>'eventDate','signedBox4DeltaGbp',v_amount,
      'evidenceId',v_evidence,'decisionId',v_decision,
      'taxPostingLineId',v_tax_line,'offsetPostingLineId',v_offset_line));
  end loop;
  if v_total is distinct from v_review.restoration_box4_gbp then
    raise exception 'Posted supplier VAT restorations do not match the review.' using errcode='22023';
  end if;
  if v_batch is not null then
    select coalesce(sum("FINPostLine_DebitAmount"),0),
      coalesce(sum("FINPostLine_CreditAmount"),0) into v_debits,v_credits
      from public."FIN_PostingLines" where "FINPostLine_BatchID"=v_batch;
    if v_debits<=0 or v_debits<>v_credits then
      raise exception 'Later supplier VAT restoration journal is not balanced.' using errcode='22023';
    end if;
    update public."FIN_PostingBatches" set "FINPostBatch_StatusCode"='posted',
      "FINPostBatch_DebitTotal"=v_debits,"FINPostBatch_CreditTotal"=v_credits,
      "FINPostBatch_PostedAt"=clock_timestamp(),"FINPostBatch_PostedBy"=p_actor
    where "FINPostBatch_ID"=v_batch;
  end if;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxLaterInputTaxRestorationPostings',
    'later_input_tax_restoration_posting',v_posting,
    'post_later_input_tax_restoration',btrim(p_reason),
    'Later supplier input VAT restoration recorded',
    jsonb_build_object('periodId',v_period.id,'documentId',v_review.document_id,
      'reviewId',v_review.id,'firstPostingId',v_review.first_posting_id,
      'batchId',v_batch,'sourceFingerprint',v_review.source_fingerprint,
      'restorationBox4Gbp',v_total,'events',v_items));
  return jsonb_build_object('postingId',v_posting,'periodId',v_period.id,
    'documentId',v_review.document_id,'batchId',v_batch,
    'restorationBox4Gbp',v_total,'eventCount',jsonb_array_length(v_items),
    'events',v_items,'status',case when v_batch is null
      then 'zero_tax_effect_confirmed' else 'posted_pending_vat_calculation_and_signoff' end);
end; $$;
revoke all on function public.multideck_uk_vat_post_later_input_tax_restoration(
  uuid,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_post_later_input_tax_restoration(
  uuid,uuid,uuid,text,boolean) to service_role;

commit;
