begin;

-- Review locking is reversible and local. HMRC obligation verification,
-- statutory declaration, submission and final approval are separate gates.
alter table public."FIN_IndirectTaxPeriods"
  drop constraint "FIN_IndirectTaxPeriods_status_check";
alter table public."FIN_IndirectTaxPeriods"
  add column active_review_lock_id uuid;
alter table public."FIN_IndirectTaxPeriods"
  add constraint "FIN_IndirectTaxPeriods_status_check"
    check ((status='draft' and active_review_lock_id is null)
      or (status='review_locked' and active_review_lock_id is not null));

create table public."FIN_IndirectTaxPeriodReviewLocks" (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  calculation_id uuid not null,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  control_review_id uuid not null references public."FIN_IndirectTaxControlReviews"(id) on delete restrict,
  control_fingerprint text not null check (control_fingerprint ~ '^[a-f0-9]{64}$'),
  filing_projection_id uuid not null references public."FIN_IndirectTaxFilingProjections"(id) on delete restrict,
  projection_fingerprint text not null check (projection_fingerprint ~ '^[a-f0-9]{64}$'),
  lock_fingerprint text not null check (lock_fingerprint ~ '^[a-f0-9]{64}$'),
  locked_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  locked_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  foreign key (calculation_id,period_id)
    references public."FIN_IndirectTaxCalculations"(id,period_id) on delete restrict
);
create index "IX_FIN_IndirectTaxPeriodReviewLocks_period"
  on public."FIN_IndirectTaxPeriodReviewLocks"(period_id,locked_at desc);
alter table public."FIN_IndirectTaxPeriods"
  add constraint "FK_FIN_IndirectTaxPeriods_active_review_lock"
    foreign key (active_review_lock_id)
      references public."FIN_IndirectTaxPeriodReviewLocks"(id) on delete restrict;

create table public."FIN_IndirectTaxPeriodReviewUnlocks" (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  lock_id uuid not null unique references public."FIN_IndirectTaxPeriodReviewLocks"(id) on delete restrict,
  unlocked_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  unlocked_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) between 10 and 2000)
);
create index "IX_FIN_IndirectTaxPeriodReviewUnlocks_period"
  on public."FIN_IndirectTaxPeriodReviewUnlocks"(period_id,unlocked_at desc);
create trigger indirect_tax_review_lock_immutable before update or delete
  on public."FIN_IndirectTaxPeriodReviewLocks"
  for each row execute function public._multideck_indirect_tax_immutable();
create trigger indirect_tax_review_unlock_immutable before update or delete
  on public."FIN_IndirectTaxPeriodReviewUnlocks"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxPeriodReviewLocks" enable row level security;
alter table public."FIN_IndirectTaxPeriodReviewUnlocks" enable row level security;
revoke all on public."FIN_IndirectTaxPeriodReviewLocks",public."FIN_IndirectTaxPeriodReviewUnlocks"
  from public,anon,authenticated;
grant select on public."FIN_IndirectTaxPeriodReviewLocks",public."FIN_IndirectTaxPeriodReviewUnlocks"
  to service_role;

-- A direct period update cannot bypass the lock/unlock evidence, even as the
-- trusted backend role. Later HMRC verification needs its own guarded change.
create function public._multideck_indirect_tax_review_lock_transition()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op<>'UPDATE' then return new; end if;
  if old.status='review_locked' and new.status='review_locked' then
    if new is distinct from old then
      raise exception 'A review-locked VAT period cannot be changed.' using errcode='22023';
    end if;
  elsif old.status='draft' and new.status='review_locked' then
    if (to_jsonb(new)-'status'-'active_review_lock_id')
       <>(to_jsonb(old)-'status'-'active_review_lock_id')
      or not exists(select 1 from public."FIN_IndirectTaxPeriodReviewLocks" lock
        where lock.id=new.active_review_lock_id and lock.period_id=old.id)
      or exists(select 1 from public."FIN_IndirectTaxPeriodReviewUnlocks" unlocked
        where unlocked.lock_id=new.active_review_lock_id) then
      raise exception 'A VAT review lock must name its current immutable evidence.' using errcode='22023';
    end if;
  elsif old.status='review_locked' and new.status='draft' then
    if new.active_review_lock_id is not null
      or (to_jsonb(new)-'status'-'active_review_lock_id')
         <>(to_jsonb(old)-'status'-'active_review_lock_id')
      or not exists(select 1 from public."FIN_IndirectTaxPeriodReviewUnlocks" unlocked
        where unlocked.lock_id=old.active_review_lock_id and unlocked.period_id=old.id) then
      raise exception 'A VAT review lock needs an immutable unlock reason.' using errcode='22023';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public._multideck_indirect_tax_review_lock_transition() from public,anon,authenticated;
create trigger indirect_tax_review_lock_transition before update
  on public."FIN_IndirectTaxPeriods"
  for each row execute function public._multideck_indirect_tax_review_lock_transition();

-- Unlocking remains possible if the registration has drifted; the unlocked
-- draft must still pass registration checks before any new calculation.
create or replace function public._multideck_indirect_tax_period_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_country text; v_currency text; v_obligation_code text;
  v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
begin
  if tg_op='UPDATE' and old.status='review_locked' and new.status='draft'
    and (to_jsonb(new)-'status'-'active_review_lock_id')
      =(to_jsonb(old)-'status'-'active_review_lock_id') then
    return new;
  end if;
  select pack."FINLocPack_CountryCode",pack."FINLocPack_ReportingCurrencyCode",obligation."FINCompliance_Code"
    into v_country,v_currency,v_obligation_code
  from public."FIN_LegalEntityComplianceRegistrations" registration
  join public."FIN_ComplianceObligations" obligation on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
  join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
  where registration."FINComplianceReg_ID"=new.registration_id
    and registration."FINComplianceReg_LegalEntityID"=new.legal_entity_id
    and obligation."FINCompliance_ID"=new.obligation_id
    and obligation."FINCompliance_ObligationTypeCode"='indirect_tax';
  if not found or v_country is null or new.jurisdiction_code !~ ('^'||v_country||'(-|$)')
    or new.reporting_currency is distinct from v_currency then
    raise exception 'Tax period registration, obligation, jurisdiction or currency does not match its legal entity.' using errcode='22023';
  end if;
  if not exists(select 1 from public."cmp_LegalEntities" entity
    where entity."LegalEntity_ID"=new.legal_entity_id and entity."LegalEntity_IsActive") then
    raise exception 'Tax period legal entity is inactive or missing.' using errcode='42501';
  end if;
  if new.jurisdiction_code='GB' then
    select * into v_registration from public."FIN_LegalEntityComplianceRegistrations"
      where "FINComplianceReg_ID"=new.registration_id;
    if v_obligation_code<>'gb-vat-mtd' or new.scheme_code not in ('standard','annual') or new.reporting_currency<>'GBP'
      or v_registration."FINComplianceReg_StatusCode" not in ('configured','sandbox_verified','production_verified')
      or not coalesce(v_registration."FINComplianceReg_RegistrationReference" ~ '^[0-9]{9}$',false)
      or v_registration."FINComplianceReg_SettingsJSON"->>'schemeCode' is distinct from new.scheme_code
      or v_registration."FINComplianceReg_EffectiveFrom">new.start_date
      or (v_registration."FINComplianceReg_EffectiveTo" is not null and v_registration."FINComplianceReg_EffectiveTo"<new.end_date) then
      raise exception 'UK VAT registration, supported scheme or effective dates are not ready for this period.' using errcode='22023';
    end if;
  end if;
  return new;
end; $$;

create function public.multideck_uk_vat_lock_review(
  p_actor uuid,p_entity uuid,p_calculation uuid,p_source_digest text,
  p_projection uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_projection public."FIN_IndirectTaxFilingProjections"%rowtype;
  v_current jsonb; v_calculation uuid; v_fingerprint text; v_lock uuid; v_at timestamptz;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_source_digest is null or p_source_digest !~ '^[a-f0-9]{64}$'
    or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Choose the reviewed VAT calculation, filing values and lock reason.' using errcode='22023';
  end if;
  select period.* into v_period from public."FIN_IndirectTaxPeriods" period
    join public."FIN_IndirectTaxCalculations" calculation on calculation.period_id=period.id
    where calculation.id=p_calculation and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB' for update of period;
  if not found or v_period.status<>'draft' then
    raise exception 'Only a draft UK VAT period can be review-locked.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||p_entity::text,0));
  select * into v_projection from public."FIN_IndirectTaxFilingProjections"
    where id=p_projection and period_id=v_period.id and source_digest=p_source_digest;
  if not found then
    raise exception 'Choose a reviewed filing projection for this VAT period.' using errcode='22023';
  end if;
  v_current:=public.multideck_uk_vat_review_whole_pounds(p_actor,p_entity,p_calculation,
    p_source_digest,'Revalidated VAT control and filing values before review lock');
  if (v_current->>'reviewId')::uuid<>p_projection
    or v_current->>'projectionFingerprint'<>v_projection.projection_fingerprint
    or v_current->>'controlFingerprint'<>v_projection.control_fingerprint then
    raise exception 'VAT control or filing values changed; review the new snapshot before locking.' using errcode='22023';
  end if;
  v_calculation:=(v_current->>'calculationId')::uuid;
  v_fingerprint:=encode(sha256(convert_to(v_period.id::text||p_source_digest||
    v_projection.control_fingerprint||v_projection.projection_fingerprint,'UTF8')),'hex');
  insert into public."FIN_IndirectTaxPeriodReviewLocks"(
    period_id,calculation_id,source_digest,control_review_id,control_fingerprint,
    filing_projection_id,projection_fingerprint,lock_fingerprint,locked_by,reason
  ) values (v_period.id,v_calculation,p_source_digest,v_projection.control_review_id,
    v_projection.control_fingerprint,p_projection,v_projection.projection_fingerprint,
    v_fingerprint,p_actor,btrim(p_reason)) returning id,locked_at into v_lock,v_at;
  update public."FIN_IndirectTaxPeriods" set status='review_locked',active_review_lock_id=v_lock
    where id=v_period.id;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxPeriodReviewLocks','indirect_tax_period_review_lock',v_lock,
    'lock_vat_period_review',btrim(p_reason),'UK VAT period review locked',
    jsonb_build_object('periodId',v_period.id,'calculationId',v_calculation,
      'sourceDigest',p_source_digest,'controlFingerprint',v_projection.control_fingerprint,
      'projectionFingerprint',v_projection.projection_fingerprint,'lockFingerprint',v_fingerprint));
  return jsonb_build_object('lockId',v_lock,'periodId',v_period.id,'calculationId',v_calculation,
    'sourceDigest',p_source_digest,'lockFingerprint',v_fingerprint,'lockedAt',v_at,
    'status','review_locked');
end; $$;
revoke all on function public.multideck_uk_vat_lock_review(uuid,uuid,uuid,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_lock_review(uuid,uuid,uuid,text,uuid,text) to service_role;

create function public.multideck_uk_vat_unlock_review(
  p_actor uuid,p_entity uuid,p_period uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_unlock uuid; v_at timestamptz;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Explain why this VAT review lock is being reopened.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB' for update;
  if not found or v_period.status<>'review_locked' or v_period.active_review_lock_id is null then
    raise exception 'A review-locked UK VAT period is required.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||p_entity::text,0));
  insert into public."FIN_IndirectTaxPeriodReviewUnlocks"(period_id,lock_id,unlocked_by,reason)
    values(v_period.id,v_period.active_review_lock_id,p_actor,btrim(p_reason))
    returning id,unlocked_at into v_unlock,v_at;
  update public."FIN_IndirectTaxPeriods" set status='draft',active_review_lock_id=null
    where id=v_period.id;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxPeriodReviewUnlocks','indirect_tax_period_review_unlock',v_unlock,
    'unlock_vat_period_review',btrim(p_reason),'UK VAT period review reopened',
    jsonb_build_object('periodId',v_period.id,'lockId',v_period.active_review_lock_id));
  return jsonb_build_object('unlockId',v_unlock,'periodId',v_period.id,
    'lockId',v_period.active_review_lock_id,'unlockedAt',v_at,'status','draft');
end; $$;
revoke all on function public.multideck_uk_vat_unlock_review(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_unlock_review(uuid,uuid,uuid,text) to service_role;

create function public.multideck_uk_vat_list_review_locks(
  p_actor uuid,p_entity uuid,p_period uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb; v_active uuid;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select active_review_lock_id into v_active from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB';
  if not found then raise exception 'UK VAT period was not found.' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.locked_at desc,item.lock_id desc),'[]'::jsonb)
    into v_rows from (
      select lock.id lock_id,lock.calculation_id,lock.source_digest,
        lock.control_review_id,lock.control_fingerprint,lock.filing_projection_id,
        lock.projection_fingerprint,lock.lock_fingerprint,lock.locked_by,lock.locked_at,
        lock.reason,unlocked.id unlock_id,unlocked.unlocked_by,unlocked.unlocked_at,
        unlocked.reason unlock_reason
      from public."FIN_IndirectTaxPeriodReviewLocks" lock
      left join public."FIN_IndirectTaxPeriodReviewUnlocks" unlocked on unlocked.lock_id=lock.id
      where lock.period_id=p_period order by lock.locked_at desc,lock.id desc limit 20
    ) item;
  return jsonb_build_object('periodId',p_period,'activeLockId',v_active,'locks',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_list_review_locks(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_list_review_locks(uuid,uuid,uuid) to service_role;

-- Read-only preflight for a review-locked period. This is not an approval or
-- dispatch gate; the same checks must run again immediately before filing.
create function public.multideck_uk_vat_review_lock_freshness(
  p_actor uuid,p_entity uuid,p_period uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_lock public."FIN_IndirectTaxPeriodReviewLocks"%rowtype;
  v_snapshot jsonb; v_inventory jsonb; v_account jsonb; v_bridge jsonb;
  v_control_fingerprint text;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB' for update;
  if not found or v_period.status<>'review_locked' or v_period.active_review_lock_id is null then
    raise exception 'A review-locked UK VAT period is required.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||p_entity::text,0));
  select * into v_lock from public."FIN_IndirectTaxPeriodReviewLocks"
    where id=v_period.active_review_lock_id and period_id=p_period;
  if not found then raise exception 'The VAT review lock is missing.' using errcode='22023'; end if;
  v_snapshot:=public.multideck_uk_vat_current_snapshot(p_actor,p_period);
  if v_snapshot->>'sourceDigest'<>v_lock.source_digest
    or v_snapshot#>>'{sourceLedger,status}'<>'matched'
    or v_snapshot->'boxes' is distinct from
      (select calculation.box_totals from public."FIN_IndirectTaxCalculations" calculation
        where calculation.id=v_lock.calculation_id and calculation.period_id=p_period) then
    return jsonb_build_object('periodId',p_period,'lockId',v_lock.id,
      'ready',false,'reason','source_changed');
  end if;
  v_account:=public.multideck_uk_vat_account(p_actor,p_entity,v_lock.calculation_id,0,1);
  v_inventory:=public.multideck_uk_vat_tax_posting_inventory(p_actor,p_entity,v_lock.calculation_id,0,1);
  v_bridge:=v_inventory->'controlBridge';
  if (v_account->>'totalTransactions')::integer<>(v_account->>'signedTransactions')::integer
    or (v_bridge->>'accountingCoverageExact')::boolean is not true
    or (v_inventory->>'unlinkedLines')::integer<>0
    or (v_inventory->>'nonGbpLines')::integer<>0
    or (v_inventory->>'taxLinesOffVatAccounts')::integer<>0
    or (v_bridge->>'expectedTaxPostingLines')::integer<>(v_bridge->>'linkedVatAccountTaxLines')::integer
    or (v_bridge->>'differenceGbp')::numeric<>0 then
    return jsonb_build_object('periodId',p_period,'lockId',v_lock.id,
      'ready',false,'reason','control_changed');
  end if;
  v_control_fingerprint:=encode(sha256(convert_to(v_lock.source_digest||
    (v_inventory->>'postingDigest')||(v_inventory->>'accountingScopeDigest')||
    v_bridge::text||(v_account->>'totalTransactions')||(v_account->>'signedTransactions'),'UTF8')),'hex');
  if v_control_fingerprint<>v_lock.control_fingerprint then
    return jsonb_build_object('periodId',p_period,'lockId',v_lock.id,
      'ready',false,'reason','control_changed');
  end if;
  return jsonb_build_object('periodId',p_period,'lockId',v_lock.id,
    'ready',true,'sourceDigest',v_lock.source_digest,
    'controlFingerprint',v_control_fingerprint,
    'projectionFingerprint',v_lock.projection_fingerprint,
    'lockFingerprint',v_lock.lock_fingerprint);
end; $$;
revoke all on function public.multideck_uk_vat_review_lock_freshness(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_review_lock_freshness(uuid,uuid,uuid)
  to service_role;

commit;
