begin;

-- Evidence of a Method 2 notification made outside Multideck. This does not
-- send anything to HMRC or assert that HMRC accepted the correction.
create table public."FIN_IndirectTaxPriorErrorNotifications" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  discovery_period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  notified_on date not null,
  channel text not null check (channel in ('hmrc_online','letter')),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 3 and 160),
  explanation text not null check (length(btrim(explanation)) between 10 and 2000),
  item_count integer not null check (item_count between 1 and 100),
  net_error_gbp numeric(18,2) not null,
  items_fingerprint text not null check (items_fingerprint ~ '^[a-f0-9]{64}$'),
  recorded_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (legal_entity_id,evidence_reference)
);
create index "IX_FIN_IndirectTaxPriorErrorNotifications_period"
  on public."FIN_IndirectTaxPriorErrorNotifications"(discovery_period_id,recorded_at,id);
create trigger indirect_tax_prior_error_notification_immutable before update or delete
  on public."FIN_IndirectTaxPriorErrorNotifications"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxPriorErrorNotifications" enable row level security;
revoke all on public."FIN_IndirectTaxPriorErrorNotifications" from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxPriorErrorNotifications" to service_role;

create table public."FIN_IndirectTaxPriorErrorNotificationItems" (
  intake_id uuid primary key references public."FIN_IndirectTaxPriorPeriodErrorIntake"(id) on delete restrict,
  notification_id uuid not null references public."FIN_IndirectTaxPriorErrorNotifications"(id) on delete restrict,
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  signed_vat_error_gbp numeric(18,2) not null
);
create index "IX_FIN_IndirectTaxPriorErrorNotificationItems_notification"
  on public."FIN_IndirectTaxPriorErrorNotificationItems"(notification_id,intake_id);
create trigger indirect_tax_prior_error_notification_item_immutable before update or delete
  on public."FIN_IndirectTaxPriorErrorNotificationItems"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxPriorErrorNotificationItems" enable row level security;
revoke all on public."FIN_IndirectTaxPriorErrorNotificationItems" from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxPriorErrorNotificationItems" to service_role;

create function public.multideck_uk_vat_record_external_error_notification(
  p_actor uuid,p_entity uuid,p_discovery_period uuid,p_intake_ids uuid[],
  p_notified_on date,p_channel text,p_evidence_reference text,p_explanation text,
  p_confirmed boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_existing public."FIN_IndirectTaxPriorErrorNotifications"%rowtype;
  v_count integer; v_distinct integer; v_net numeric; v_latest_discovery date;
  v_fingerprint text; v_id uuid; v_at timestamptz;
  v_reference text:=btrim(p_evidence_reference); v_explanation text:=btrim(p_explanation);
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_intake_ids is null or coalesce(array_length(p_intake_ids,1),0) not between 1 and 100
    or array_position(p_intake_ids,null) is not null
    or p_notified_on is null or p_notified_on>(clock_timestamp() at time zone 'Europe/London')::date
    or p_channel is null or p_channel not in ('hmrc_online','letter')
    or v_reference is null or length(v_reference) not between 3 and 160
    or v_explanation is null or length(v_explanation) not between 10 and 2000
    or p_confirmed is distinct from true then
    raise exception 'Confirm the separate HMRC notification and provide its dated evidence.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_discovery_period and legal_entity_id=p_entity and jurisdiction_code='GB' for update;
  if not found then
    raise exception 'The discovery VAT period is unavailable for this legal entity.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat-prior-error-notification:'||p_entity::text,0));
  select count(distinct id)::integer into v_distinct from unnest(p_intake_ids) as selected(id);
  if v_distinct<>array_length(p_intake_ids,1) then
    raise exception 'Select each prior-period error once.' using errcode='22023';
  end if;
  select count(*)::integer,coalesce(sum(intake.signed_vat_error_gbp),0),
    max(intake.discovered_on),
    encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
      'id',intake.id,'sourceReference',intake.source_reference,
      'originalStart',intake.original_period_start,'originalEnd',intake.original_period_end,
      'discoveredOn',intake.discovered_on,'taxSide',intake.tax_side,
      'signedVat',intake.signed_vat_error_gbp,'explanation',intake.explanation)
      order by intake.id)::text,'[]'),'UTF8')),'hex')
    into v_count,v_net,v_latest_discovery,v_fingerprint
    from public."FIN_IndirectTaxPriorPeriodErrorIntake" intake
    where intake.id=any(p_intake_ids) and intake.legal_entity_id=p_entity
      and intake.discovery_period_id=p_discovery_period;
  if v_count<>v_distinct then
    raise exception 'Every selected VAT error must belong to this legal entity and period.' using errcode='42501';
  end if;
  if p_notified_on<v_latest_discovery then
    raise exception 'The notification cannot predate discovery of a selected error.' using errcode='22023';
  end if;
  select * into v_existing from public."FIN_IndirectTaxPriorErrorNotifications"
    where legal_entity_id=p_entity and evidence_reference=v_reference;
  if found then
    if v_existing.discovery_period_id is distinct from p_discovery_period
      or v_existing.notified_on is distinct from p_notified_on
      or v_existing.channel is distinct from p_channel
      or v_existing.explanation is distinct from v_explanation
      or v_existing.item_count is distinct from v_count
      or v_existing.net_error_gbp is distinct from v_net
      or v_existing.items_fingerprint is distinct from v_fingerprint then
      raise exception 'This notification evidence reference already has different details.' using errcode='23505';
    end if;
    return jsonb_build_object('notificationId',v_existing.id,'inserted',false,
      'recordedAt',v_existing.recorded_at,'status','operator_recorded_unverified');
  end if;
  if exists(select 1 from public."FIN_IndirectTaxPriorErrorNotificationItems" linked
    where linked.intake_id=any(p_intake_ids)) then
    raise exception 'A selected VAT error is already linked to a separate notification.' using errcode='23505';
  end if;
  insert into public."FIN_IndirectTaxPriorErrorNotifications"(
    legal_entity_id,discovery_period_id,notified_on,channel,evidence_reference,
    explanation,item_count,net_error_gbp,items_fingerprint,recorded_by)
  values(p_entity,p_discovery_period,p_notified_on,p_channel,v_reference,
    v_explanation,v_count,v_net,v_fingerprint,p_actor)
  returning id,recorded_at into v_id,v_at;
  insert into public."FIN_IndirectTaxPriorErrorNotificationItems"(
    intake_id,notification_id,legal_entity_id,signed_vat_error_gbp)
  select intake.id,v_id,p_entity,intake.signed_vat_error_gbp
    from public."FIN_IndirectTaxPriorPeriodErrorIntake" intake
    where intake.id=any(p_intake_ids) and intake.legal_entity_id=p_entity
      and intake.discovery_period_id=p_discovery_period;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxPriorErrorNotifications','prior_period_vat_error_notification',v_id,
    'record_external_prior_period_vat_error_notification',v_explanation,
    'External UK VAT error correction notification evidence recorded',
    jsonb_build_object('discoveryPeriodId',p_discovery_period,'notifiedOn',p_notified_on,
      'channel',p_channel,'evidenceReference',v_reference,'itemCount',v_count,
      'netErrorGbp',v_net,'itemsFingerprint',v_fingerprint,
      'status','operator_recorded_unverified'));
  return jsonb_build_object('notificationId',v_id,'inserted',true,
    'recordedAt',v_at,'status','operator_recorded_unverified');
end; $$;
revoke all on function public.multideck_uk_vat_record_external_error_notification(
  uuid,uuid,uuid,uuid[],date,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_record_external_error_notification(
  uuid,uuid,uuid,uuid[],date,text,text,text,boolean) to service_role;

create function public.multideck_uk_vat_external_error_notifications(
  p_actor uuid,p_entity uuid,p_discovery_period uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb; v_notified_ids jsonb; v_total integer;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if not exists(select 1 from public."FIN_IndirectTaxPeriods" period
    where period.id=p_discovery_period and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB') then
    raise exception 'The discovery VAT period is unavailable for this legal entity.' using errcode='42501';
  end if;
  select count(*)::integer into v_total from public."FIN_IndirectTaxPriorErrorNotifications"
    where legal_entity_id=p_entity and discovery_period_id=p_discovery_period;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.recorded_at,item.id),'[]'::jsonb)
    into v_rows from (
    select notice.id,notice.notified_on,notice.channel,notice.evidence_reference,
      notice.explanation,notice.item_count,notice.net_error_gbp,
      notice.items_fingerprint,notice.recorded_by,notice.recorded_at,
      (select coalesce(jsonb_agg(linked.intake_id order by linked.intake_id),'[]'::jsonb)
       from public."FIN_IndirectTaxPriorErrorNotificationItems" linked
       where linked.notification_id=notice.id and linked.legal_entity_id=p_entity) intake_ids
    from public."FIN_IndirectTaxPriorErrorNotifications" notice
    where notice.legal_entity_id=p_entity and notice.discovery_period_id=p_discovery_period
    order by notice.recorded_at,notice.id limit 100
  ) item;
  select coalesce(jsonb_agg(linked.intake_id order by linked.intake_id),'[]'::jsonb)
    into v_notified_ids
    from public."FIN_IndirectTaxPriorErrorNotificationItems" linked
    join public."FIN_IndirectTaxPriorPeriodErrorIntake" intake
      on intake.id=linked.intake_id and intake.legal_entity_id=p_entity
    where intake.discovery_period_id=p_discovery_period and linked.legal_entity_id=p_entity;
  return jsonb_build_object('legalEntityId',p_entity,'discoveryPeriodId',p_discovery_period,
    'total',v_total,'items',v_rows,'notifiedIntakeIds',v_notified_ids,
    'status','operator_recorded_unverified');
end; $$;
revoke all on function public.multideck_uk_vat_external_error_notifications(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_external_error_notifications(uuid,uuid,uuid)
  to service_role;

-- Once any error has external notification evidence, a generic Method 1
-- preview over the whole discovery period could double count it. Require
-- explicit reconciliation of the remaining errors before choosing a route.
create function public.multideck_uk_vat_prior_error_status(
  p_actor uuid,p_entity uuid,p_discovery_period uuid,p_choose_separate boolean default false
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_notified integer; v_total integer; v_preview jsonb;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_choose_separate is null then
    raise exception 'Choose whether to use separate notification.' using errcode='22023';
  end if;
  select count(*)::integer into v_notified
    from public."FIN_IndirectTaxPriorErrorNotificationItems" linked
    join public."FIN_IndirectTaxPriorPeriodErrorIntake" intake
      on intake.id=linked.intake_id and intake.legal_entity_id=p_entity
    where linked.legal_entity_id=p_entity and intake.discovery_period_id=p_discovery_period;
  -- A recorded notification may be followed by new discoveries. Do not run
  -- the original current-return threshold path for that mixed set.
  v_preview:=public.multideck_uk_vat_prior_period_error_preview(
    p_actor,p_entity,p_discovery_period,
    case when v_notified>0 then true else p_choose_separate end);
  v_total:=(v_preview->>'itemCount')::integer;
  if v_notified>v_total then
    raise exception 'Prior-period VAT notification links do not match intake.' using errcode='22023';
  end if;
  if v_notified=v_total and v_total>0 then
    v_preview:=v_preview||jsonb_build_object('method','external_notification_evidence_recorded',
      'reason','all_errors_linked_to_external_notification','reviewedBox6Gbp',null,
      'filingProjectionId',null,'projectionFingerprint',null);
  elsif v_notified>0 then
    v_preview:=v_preview||jsonb_build_object('method','notification_history_review_required',
      'reason','some_errors_linked_to_external_notification','reviewedBox6Gbp',null,
      'filingProjectionId',null,'projectionFingerprint',null);
  end if;
  return v_preview||jsonb_build_object('externallyNotifiedCount',v_notified,
    'unnotifiedCount',v_total-v_notified);
end; $$;
revoke all on function public.multideck_uk_vat_prior_error_status(uuid,uuid,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_prior_error_status(uuid,uuid,uuid,boolean)
  to service_role;
revoke execute on function public.multideck_uk_vat_prior_period_error_preview(uuid,uuid,uuid,boolean)
  from service_role;

commit;
