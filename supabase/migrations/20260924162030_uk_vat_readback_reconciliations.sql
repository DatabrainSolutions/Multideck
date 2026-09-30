begin;

-- A matching HMRC GET proves the filed values are present for this VRN and
-- period key. It does not invent the separate POST receipt references.
alter table public."FIN_HmrcVatSubmissionAttempts"
  drop constraint vat_attempt_status_check,
  drop constraint vat_attempt_status_times;
alter table public."FIN_HmrcVatSubmissionAttempts"
  add constraint vat_attempt_status_check check
    (status in ('reserved','dispatching','reconciliation_required',
      'accepted','accepted_readback','cancelled')),
  add constraint vat_attempt_status_times check (
    (status='reserved' and dispatching_at is null and uncertain_at is null
      and uncertainty_kind is null and accepted_at is null and cancelled_at is null)
    or (status='dispatching' and dispatching_at is not null and uncertain_at is null
      and uncertainty_kind is null and accepted_at is null and cancelled_at is null)
    or (status='reconciliation_required' and dispatching_at is not null
      and uncertain_at is not null and uncertainty_kind is not null
      and accepted_at is null and cancelled_at is null)
    or (status in ('accepted','accepted_readback') and dispatching_at is not null
      and accepted_at is not null and cancelled_at is null)
    or (status='cancelled' and dispatching_at is null and uncertain_at is null
      and uncertainty_kind is null and accepted_at is null and cancelled_at is not null));
drop index public."UX_FIN_HmrcVatSubmissionAttempts_blocking_period";
create unique index "UX_FIN_HmrcVatSubmissionAttempts_blocking_period"
  on public."FIN_HmrcVatSubmissionAttempts"(period_id)
  where status in ('reserved','dispatching','reconciliation_required',
    'accepted','accepted_readback');

create table public."FIN_HmrcVatReturnReadbackChecks" (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public."FIN_HmrcVatSubmissionAttempts"(id) on delete restrict,
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  connection_id uuid not null references public."FIN_HmrcVatConnections"(id) on delete restrict,
  tenant_project_ref text not null,
  environment text not null check (environment in ('sandbox','production')),
  vrn char(9) not null,
  period_key text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  result text not null check (result in ('matched','mismatch','not_found')),
  http_status integer not null check (http_status in (200,404)),
  raw_body text,
  raw_body_sha256 text check (raw_body_sha256 ~ '^[a-f0-9]{64}$'),
  correlation_id text check (length(correlation_id)=36),
  observed_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  observed_at timestamptz not null default clock_timestamp(),
  constraint hmrc_vat_readback_shape check (
    (http_status=404 and result='not_found' and raw_body is null and raw_body_sha256 is null)
    or (http_status=200 and result in ('matched','mismatch') and raw_body is not null
      and raw_body_sha256 is not null and correlation_id is not null))
);
create index "IX_FIN_HmrcVatReturnReadbackChecks_attempt"
  on public."FIN_HmrcVatReturnReadbackChecks"(attempt_id,observed_at desc);
create unique index "UX_FIN_HmrcVatReturnReadbackChecks_one_match"
  on public."FIN_HmrcVatReturnReadbackChecks"(attempt_id) where result='matched';
create trigger hmrc_vat_return_readback_immutable before update or delete
  on public."FIN_HmrcVatReturnReadbackChecks"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_HmrcVatReturnReadbackChecks" enable row level security;
revoke all on public."FIN_HmrcVatReturnReadbackChecks" from public,anon,authenticated,service_role;
grant select on public."FIN_HmrcVatReturnReadbackChecks" to service_role;

create function public.multideck_uk_vat_record_return_readback(
  p_actor uuid,p_entity uuid,p_project_ref text,p_attempt uuid,p_connection uuid,
  p_http_status integer,p_raw_body text,p_correlation_id text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_attempt public."FIN_HmrcVatSubmissionAttempts"%rowtype;
  v_connection public."FIN_HmrcVatConnections"%rowtype;
  v_readback jsonb; v_expected jsonb; v_result text;
  v_has_duplicates boolean;
  v_id uuid; v_at timestamptz; v_hash text;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_http_status is null or p_http_status not in (200,404)
    or (p_http_status=404 and p_raw_body is not null)
    or (p_http_status=200 and (p_raw_body is null
      or length(p_raw_body) not between 50 and 8192
      or p_correlation_id is null or p_correlation_id !~ '^[!-~]{36}$'))
    or (p_correlation_id is not null and p_correlation_id !~ '^[!-~]{36}$') then
    raise exception 'Record only a bounded HMRC VAT return readback response.' using errcode='22023';
  end if;
  select attempt.* into v_attempt from public."FIN_HmrcVatSubmissionAttempts" attempt
    join public."FIN_IndirectTaxPeriods" period on period.id=attempt.period_id
    where attempt.id=p_attempt and period.legal_entity_id=p_entity
      and attempt.tenant_project_ref=p_project_ref for update of attempt;
  if not found or v_attempt.status not in ('dispatching','reconciliation_required') then
    raise exception 'A claimed, unresolved VAT submission attempt is required.' using errcode='22023';
  end if;
  select * into v_connection from public."FIN_HmrcVatConnections"
    where id=p_connection and tenant_project_ref=p_project_ref
      and legal_entity_id=p_entity and registration_id=v_attempt.registration_id
      and vrn=v_attempt.vrn and environment=v_attempt.environment
      and status='connected' and authority_expires_at>now()
      and access_expires_at>now() and refresh_lease_id is null;
  if not found then raise exception 'Current HMRC VAT authority is required for readback.' using errcode='42501'; end if;
  perform public._multideck_uk_vat_access(v_connection.granted_by_actor_id,p_entity);
  if p_http_status=404 then
    v_result:='not_found';
  else
    begin v_readback:=p_raw_body::jsonb;
    exception when invalid_text_representation then
      raise exception 'HMRC VAT return readback must be valid JSON.' using errcode='22023';
    end;
    v_expected:=v_attempt.payload_body::jsonb;
    if jsonb_typeof(v_readback)<>'object' then
      raise exception 'HMRC VAT return readback must be an object.' using errcode='22023';
    end if;
    select exists(select 1 from json_each(p_raw_body::json)
      group by key having count(*)>1) into v_has_duplicates;
    if v_has_duplicates
      or (v_readback ? 'finalised' and v_readback->'finalised'<>'true'::jsonb)
      or v_readback-'finalised'<>v_expected-'finalised' then
      v_result:='mismatch';
    else
      v_result:='matched';
    end if;
  end if;
  v_hash:=case when p_raw_body is null then null
    else encode(sha256(convert_to(p_raw_body,'UTF8')),'hex') end;
  insert into public."FIN_HmrcVatReturnReadbackChecks"(
    attempt_id,period_id,connection_id,tenant_project_ref,environment,
    vrn,period_key,payload_sha256,result,http_status,
    raw_body,raw_body_sha256,correlation_id,observed_by
  ) values (p_attempt,v_attempt.period_id,p_connection,p_project_ref,
    v_attempt.environment,v_attempt.vrn,v_attempt.period_key,
    v_attempt.payload_sha256,v_result,p_http_status,p_raw_body,v_hash,
    p_correlation_id,p_actor) returning id,observed_at into v_id,v_at;
  if v_result='matched' then
    update public."FIN_HmrcVatSubmissionAttempts"
      set status='accepted_readback',accepted_at=clock_timestamp(),http_status=200
      where id=p_attempt;
  elsif v_attempt.status='dispatching' then
    update public."FIN_HmrcVatSubmissionAttempts"
      set status='reconciliation_required',uncertain_at=clock_timestamp(),
        uncertainty_kind='other'
      where id=p_attempt;
  end if;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_HmrcVatReturnReadbackChecks','hmrc_vat_return_readback',v_id,
    'record_hmrc_vat_return_readback','HMRC VAT return readback checked',
    jsonb_build_object('attemptId',p_attempt,'periodId',v_attempt.period_id,
      'result',v_result,'httpStatus',p_http_status,'correlationId',p_correlation_id,
      'payloadSha256',v_attempt.payload_sha256,'readbackSha256',v_hash));
  return jsonb_build_object('readbackId',v_id,'attemptId',p_attempt,
    'status',case when v_result='matched' then 'accepted_readback'
      else 'reconciliation_required' end,
    'result',v_result,'observedAt',v_at);
end; $$;
revoke all on function public.multideck_uk_vat_record_return_readback(uuid,uuid,text,uuid,uuid,integer,text,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_record_return_readback(uuid,uuid,text,uuid,uuid,integer,text,text)
  to service_role;

create or replace function public._multideck_uk_vat_attempt_blocks_change()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public."FIN_HmrcVatSubmissionAttempts" attempt
    where attempt.period_id=new.period_id
      and attempt.status in ('reserved','dispatching','reconciliation_required',
        'accepted','accepted_readback')) then
    raise exception 'Resolve the HMRC VAT submission attempt before changing this declaration.' using errcode='22023';
  end if;
  return new;
end; $$;

commit;
