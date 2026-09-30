begin;

-- A claimed POST stays blocking until HMRC acceptance is evidenced. Even an
-- apparent HTTP error is not permission to resubmit without reconciliation.
alter table public."FIN_HmrcVatSubmissionAttempts"
  drop constraint "FIN_HmrcVatSubmissionAttempts_status_check",
  drop constraint vat_attempt_status_times;
alter table public."FIN_HmrcVatSubmissionAttempts"
  add column uncertain_at timestamptz,
  add column uncertainty_kind text check (uncertainty_kind in
    ('network_failure','server_response','client_response','malformed_success','other')),
  add column http_status integer check (http_status between 100 and 599),
  add column accepted_at timestamptz,
  add constraint vat_attempt_status_check check
    (status in ('reserved','dispatching','reconciliation_required','accepted','cancelled')),
  add constraint vat_attempt_status_times check (
    (status='reserved' and dispatching_at is null and uncertain_at is null
      and uncertainty_kind is null and accepted_at is null and cancelled_at is null)
    or (status='dispatching' and dispatching_at is not null and uncertain_at is null
      and uncertainty_kind is null and accepted_at is null and cancelled_at is null)
    or (status='reconciliation_required' and dispatching_at is not null
      and uncertain_at is not null and uncertainty_kind is not null
      and accepted_at is null and cancelled_at is null)
    or (status='accepted' and dispatching_at is not null and accepted_at is not null
      and cancelled_at is null)
    or (status='cancelled' and dispatching_at is null and uncertain_at is null
      and uncertainty_kind is null and accepted_at is null and cancelled_at is not null));
drop index public."UX_FIN_HmrcVatSubmissionAttempts_blocking_period";
create unique index "UX_FIN_HmrcVatSubmissionAttempts_blocking_period"
  on public."FIN_HmrcVatSubmissionAttempts"(period_id)
  where status in ('reserved','dispatching','reconciliation_required','accepted');

create table public."FIN_HmrcVatSubmissionReceipts" (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public."FIN_HmrcVatSubmissionAttempts"(id) on delete restrict,
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  tenant_project_ref text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  processing_date text not null,
  form_bundle_number char(12) not null check (form_bundle_number ~ '^[0-9]{12}$'),
  correlation_id text not null check (length(correlation_id)=36),
  receipt_id text not null check (length(receipt_id)=36),
  receipt_timestamp text not null,
  payment_indicator text check (payment_indicator in ('DD','BANK')),
  charge_ref_number text check (length(charge_ref_number) between 1 and 16),
  recorded_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  recorded_at timestamptz not null default now()
);
create trigger hmrc_vat_submission_receipt_immutable before update or delete
  on public."FIN_HmrcVatSubmissionReceipts"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_HmrcVatSubmissionReceipts" enable row level security;
revoke all on public."FIN_HmrcVatSubmissionReceipts" from public,anon,authenticated,service_role;
grant select on public."FIN_HmrcVatSubmissionReceipts" to service_role;

create function public.multideck_uk_vat_record_submission_uncertainty(
  p_actor uuid,p_entity uuid,p_project_ref text,p_attempt uuid,
  p_kind text,p_http_status integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_attempt public."FIN_HmrcVatSubmissionAttempts"%rowtype;
  v_at timestamptz;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_kind is null or p_kind not in
    ('network_failure','server_response','client_response','malformed_success','other')
    or (p_http_status is not null and p_http_status not between 100 and 599) then
    raise exception 'Classify the unresolved HMRC VAT submission response.' using errcode='22023';
  end if;
  select attempt.* into v_attempt from public."FIN_HmrcVatSubmissionAttempts" attempt
    join public."FIN_IndirectTaxPeriods" period on period.id=attempt.period_id
    where attempt.id=p_attempt and period.legal_entity_id=p_entity
      and attempt.tenant_project_ref=p_project_ref for update of attempt;
  if not found or v_attempt.status<>'dispatching' then
    raise exception 'Only a claimed VAT dispatch can be marked unresolved.' using errcode='22023';
  end if;
  update public."FIN_HmrcVatSubmissionAttempts" set
    status='reconciliation_required',uncertain_at=clock_timestamp(),
    uncertainty_kind=p_kind,http_status=p_http_status
    where id=p_attempt returning uncertain_at into v_at;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_HmrcVatSubmissionAttempts','hmrc_vat_submission_attempt',p_attempt,
    'mark_hmrc_vat_submission_uncertain','HMRC VAT outcome requires reconciliation',
    jsonb_build_object('periodId',v_attempt.period_id,'kind',p_kind,
      'httpStatus',p_http_status,'payloadSha256',v_attempt.payload_sha256));
  return jsonb_build_object('attemptId',p_attempt,'status','reconciliation_required',
    'uncertainAt',v_at);
end; $$;
revoke all on function public.multideck_uk_vat_record_submission_uncertainty(uuid,uuid,text,uuid,text,integer)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_record_submission_uncertainty(uuid,uuid,text,uuid,text,integer)
  to service_role;

create function public.multideck_uk_vat_record_submission_receipt(
  p_actor uuid,p_entity uuid,p_project_ref text,p_attempt uuid,
  p_http_status integer,p_receipt jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_attempt public."FIN_HmrcVatSubmissionAttempts"%rowtype;
  v_id uuid; v_at timestamptz; v_processing timestamptz; v_timestamp timestamptz;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_http_status is distinct from 201 or p_receipt is null
    or jsonb_typeof(p_receipt)<>'object'
    or (select count(*) from jsonb_object_keys(p_receipt)) not between 5 and 7
    or p_receipt->>'processingDate' is null
    or p_receipt->>'formBundleNumber' is null
    or p_receipt->>'correlationId' is null
    or p_receipt->>'receiptId' is null
    or p_receipt->>'receiptTimestamp' is null
    or p_receipt->>'formBundleNumber' !~ '^[0-9]{12}$'
    or p_receipt->>'correlationId' !~ '^[!-~]{36}$'
    or p_receipt->>'receiptId' !~ '^[!-~]{36}$'
    or p_receipt->>'processingDate' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?(Z|[+-][0-9]{2}:?[0-9]{2})$'
    or p_receipt->>'receiptTimestamp' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?(Z|[+-][0-9]{2}:?[0-9]{2})$'
    or (p_receipt ? 'paymentIndicator'
      and coalesce(p_receipt->>'paymentIndicator','') not in ('DD','BANK'))
    or (p_receipt ? 'chargeRefNumber'
      and coalesce(length(p_receipt->>'chargeRefNumber'),0) not between 1 and 16)
    or exists(select 1 from jsonb_object_keys(p_receipt) key
      where key not in ('processingDate','formBundleNumber','correlationId','receiptId',
        'receiptTimestamp','paymentIndicator','chargeRefNumber')) then
    raise exception 'A complete HMRC 201 VAT receipt is required.' using errcode='22023';
  end if;
  begin
    v_processing:=(p_receipt->>'processingDate')::timestamptz;
    v_timestamp:=(p_receipt->>'receiptTimestamp')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'HMRC VAT receipt timestamps are invalid.' using errcode='22023';
  end;
  if v_processing is null or v_timestamp is null then
    raise exception 'HMRC VAT receipt timestamps are required.' using errcode='22023';
  end if;
  select attempt.* into v_attempt from public."FIN_HmrcVatSubmissionAttempts" attempt
    join public."FIN_IndirectTaxPeriods" period on period.id=attempt.period_id
    where attempt.id=p_attempt and period.legal_entity_id=p_entity
      and attempt.tenant_project_ref=p_project_ref for update of attempt;
  if not found or v_attempt.status not in ('dispatching','reconciliation_required','accepted_readback')
    or exists(select 1 from public."FIN_HmrcVatSubmissionReceipts" where attempt_id=p_attempt) then
    raise exception 'A claimed VAT dispatch without a receipt is required.' using errcode='22023';
  end if;
  insert into public."FIN_HmrcVatSubmissionReceipts"(
    attempt_id,period_id,tenant_project_ref,payload_sha256,
    processing_date,form_bundle_number,correlation_id,receipt_id,receipt_timestamp,
    payment_indicator,charge_ref_number,recorded_by
  ) values (p_attempt,v_attempt.period_id,p_project_ref,v_attempt.payload_sha256,
    p_receipt->>'processingDate',p_receipt->>'formBundleNumber',
    p_receipt->>'correlationId',p_receipt->>'receiptId',
    p_receipt->>'receiptTimestamp',p_receipt->>'paymentIndicator',
    p_receipt->>'chargeRefNumber',p_actor) returning id,recorded_at into v_id,v_at;
  update public."FIN_HmrcVatSubmissionAttempts" set status='accepted',
    accepted_at=clock_timestamp(),http_status=201 where id=p_attempt;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_HmrcVatSubmissionReceipts','hmrc_vat_submission_receipt',v_id,
    'record_hmrc_vat_submission_receipt','HMRC VAT return accepted',
    jsonb_build_object('periodId',v_attempt.period_id,'attemptId',p_attempt,
      'formBundleNumber',p_receipt->>'formBundleNumber',
      'correlationId',p_receipt->>'correlationId','payloadSha256',v_attempt.payload_sha256));
  return jsonb_build_object('receiptId',v_id,'attemptId',p_attempt,
    'status','accepted','recordedAt',v_at);
end; $$;
revoke all on function public.multideck_uk_vat_record_submission_receipt(uuid,uuid,text,uuid,integer,jsonb)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_record_submission_receipt(uuid,uuid,text,uuid,integer,jsonb)
  to service_role;

create or replace function public._multideck_uk_vat_attempt_blocks_change()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public."FIN_HmrcVatSubmissionAttempts" attempt
    where attempt.period_id=new.period_id
      and attempt.status in ('reserved','dispatching','reconciliation_required','accepted')) then
    raise exception 'Resolve the HMRC VAT submission attempt before changing this declaration.' using errcode='22023';
  end if;
  return new;
end; $$;

commit;
