begin;

create extension if not exists btree_gist with schema extensions;

-- Jurisdiction-neutral indirect-tax records. The current UK implementation is
-- foundation-only; no API in this migration can approve or submit a return.
create table public."FIN_IndirectTaxPeriods" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  obligation_id uuid not null references public."FIN_ComplianceObligations"("FINCompliance_ID") on delete restrict,
  registration_id uuid not null references public."FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_ID") on delete restrict,
  jurisdiction_code text not null check (jurisdiction_code ~ '^[A-Z]{2}(-[A-Z0-9]+)?$'),
  scheme_code text not null,
  reporting_currency char(3) not null check (reporting_currency ~ '^[A-Z]{3}$'),
  start_date date not null,
  end_date date not null,
  authority_period_key text,
  authority_obligation_verified_at timestamptz,
  status text not null default 'draft' check (status = 'draft'),
  created_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date < start_date + interval '2 years'),
  check ((authority_period_key is null) = (authority_obligation_verified_at is null)),
  unique (legal_entity_id, obligation_id, start_date, end_date),
  exclude using gist (legal_entity_id with =, jurisdiction_code with =,
    daterange(start_date,end_date,'[]') with &&)
);
create unique index "UQ_FIN_IndirectTaxPeriods_authority_key"
  on public."FIN_IndirectTaxPeriods"(legal_entity_id,obligation_id,authority_period_key)
  where authority_period_key is not null;
create index "IX_FIN_IndirectTaxPeriods_entity_dates"
  on public."FIN_IndirectTaxPeriods"(legal_entity_id,start_date,end_date);

-- An event is a signed, immutable tax record, not a mutable projection of a
-- document. Corrections and credits get new event IDs and source references.
-- Classification is separate, so an invoice can be captured before its tax
-- point and treatment are reviewed without mutating the underlying evidence.
create table public."FIN_IndirectTaxEvidence" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  jurisdiction_code text not null check (jurisdiction_code ~ '^[A-Z]{2}(-[A-Z0-9]+)?$'),
  source_kind text not null check (source_kind in ('posted_document_line','adjustment','import_statement','cash_allocation')),
  source_id uuid not null,
  source_posting_batch_id uuid references public."FIN_PostingBatches"("FINPostBatch_ID") on delete restrict,
  source_document_id uuid references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  source_document_line_id uuid references public."FIN_DocumentLines"("FINDocLine_ID") on delete restrict,
  source_version text not null,
  source_document_date date,
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  exchange_rate numeric(20,10) not null check (exchange_rate > 0),
  signed_net_amount numeric(18,4) not null,
  signed_tax_amount numeric(18,4) not null,
  signed_net_reporting numeric(18,4) not null,
  signed_tax_reporting numeric(18,4) not null,
  reverses_evidence_id uuid references public."FIN_IndirectTaxEvidence"(id) on delete restrict,
  capture_kind text not null default 'native_posting' check (capture_kind in ('native_posting','historical_backfill','manual_adjustment')),
  capture_reason text,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  check (source_version <> ''),
  check (capture_kind<>'historical_backfill' or (capture_reason is not null and length(btrim(capture_reason))>=10)),
  check (source_kind <> 'posted_document_line' or
    (source_posting_batch_id is not null and source_document_id is not null and source_document_line_id is not null)),
  check (reverses_evidence_id is null or reverses_evidence_id <> id),
  unique (legal_entity_id,jurisdiction_code,source_kind,source_id,source_version)
);
create index "IX_FIN_IndirectTaxEvidence_entity_tax_point"
  on public."FIN_IndirectTaxEvidence"(legal_entity_id,jurisdiction_code,recorded_at,id);
create index "IX_FIN_IndirectTaxEvidence_document_line"
  on public."FIN_IndirectTaxEvidence"(source_document_line_id)
  where source_document_line_id is not null;

-- A revised treatment creates another immutable decision. The eventual
-- calculation must select and fingerprint the exact reviewed revision.
create table public."FIN_IndirectTaxDecisions" (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public."FIN_IndirectTaxEvidence"(id) on delete restrict,
  revision integer not null check (revision > 0),
  tax_point date not null,
  scheme_code text not null,
  treatment_code text not null,
  tax_code_id uuid references public."FIN_TaxCodes"("FINTax_ID") on delete restrict,
  reviewed_rule_reference text not null check (reviewed_rule_reference <> ''),
  rule_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(rule_snapshot)='object'),
  review_reason text not null check (review_reason <> ''),
  reviewed_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  reviewed_at timestamptz not null default now(),
  unique (evidence_id,revision),
  unique (id,evidence_id)
);

-- A calculation is immutable evidence. A later re-run creates a new revision;
-- review/approval/lock and HMRC filing will be added with guarded transitions.
create table public."FIN_IndirectTaxCalculations" (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  revision integer not null check (revision > 0),
  calculation_version text not null,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  registration_snapshot jsonb not null check (jsonb_typeof(registration_snapshot) = 'object'),
  box_totals jsonb not null check (jsonb_typeof(box_totals) = 'object'),
  exceptions jsonb not null check (jsonb_typeof(exceptions) = 'array'),
  control_reconciliation jsonb not null check (jsonb_typeof(control_reconciliation) = 'object'),
  calculated_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  calculated_at timestamptz not null default now(),
  unique (period_id,revision),
  unique (id,period_id)
);
create table public."FIN_IndirectTaxCalculationLines" (
  calculation_id uuid not null references public."FIN_IndirectTaxCalculations"(id) on delete restrict,
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  evidence_id uuid not null references public."FIN_IndirectTaxEvidence"(id) on delete restrict,
  decision_id uuid not null,
  box_number smallint not null check (box_number between 1 and 9),
  signed_amount numeric(18,4) not null,
  primary key (calculation_id,evidence_id,box_number),
  foreign key (calculation_id,period_id) references public."FIN_IndirectTaxCalculations"(id,period_id) on delete restrict,
  foreign key (decision_id,evidence_id) references public."FIN_IndirectTaxDecisions"(id,evidence_id) on delete restrict
);
create index "IX_FIN_IndirectTaxCalculationLines_period_box"
  on public."FIN_IndirectTaxCalculationLines"(period_id,box_number);

-- A transaction's VAT reconciliation date is the server-recorded time of
-- explicit finance sign-off against one calculation fingerprint. New evidence,
-- a revised decision or a changed fingerprint needs another sign-off; history
-- is never overwritten. This is distinct from later return approval or filing.
create table public."FIN_IndirectTaxReconciliations" (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  calculation_id uuid not null,
  evidence_id uuid not null references public."FIN_IndirectTaxEvidence"(id) on delete restrict,
  decision_id uuid not null,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  reconciled_at timestamptz not null default now(),
  reconciled_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  unique (evidence_id,decision_id,source_digest),
  foreign key (calculation_id,period_id) references public."FIN_IndirectTaxCalculations"(id,period_id) on delete restrict,
  foreign key (decision_id,evidence_id) references public."FIN_IndirectTaxDecisions"(id,evidence_id) on delete restrict
);
create index "IX_FIN_IndirectTaxReconciliations_period" on public."FIN_IndirectTaxReconciliations"(period_id,reconciled_at);

-- One source is assigned to one VAT period when its first transaction
-- reconciliation is recorded. The primary key closes concurrent sign-off
-- races even under transaction isolation stronger than READ COMMITTED.
create table public."FIN_IndirectTaxEvidencePeriods" (
  evidence_id uuid primary key references public."FIN_IndirectTaxEvidence"(id) on delete restrict,
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  first_reconciled_at timestamptz not null default now(),
  first_reconciled_by uuid not null references public."cmp_Users"("User_ID") on delete restrict
);
create function public._multideck_indirect_tax_assignment_immutable()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op='UPDATE' and new is not distinct from old then return new; end if;
  raise exception 'A signed VAT source period assignment cannot be changed.' using errcode='22023';
end; $$;
revoke all on function public._multideck_indirect_tax_assignment_immutable() from public,anon,authenticated;
create trigger indirect_tax_assignment_immutable before update or delete on public."FIN_IndirectTaxEvidencePeriods"
  for each row execute function public._multideck_indirect_tax_assignment_immutable();

create function public._multideck_indirect_tax_reconciliation_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_assigned uuid; v_document_id uuid;
begin
  select source_document_id into v_document_id from public."FIN_IndirectTaxEvidence" where id=new.evidence_id;
  if v_document_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('vat-source-document:'||v_document_id::text,0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vat-source-period:'||new.evidence_id::text,0));
  if exists(select 1 from public."FIN_IndirectTaxReconciliations" signed
    where signed.evidence_id=new.evidence_id and signed.period_id<>new.period_id) then
    raise exception 'VAT evidence is already signed in another period; use a separate correction event.' using errcode='22023';
  end if;
  if not exists(select 1 from public."FIN_IndirectTaxCalculations" calculation
    join public."FIN_IndirectTaxPeriods" period on period.id=calculation.period_id
    join public."FIN_IndirectTaxCalculationLines" line on line.calculation_id=calculation.id
      and line.period_id=period.id and line.evidence_id=new.evidence_id and line.decision_id=new.decision_id
    where calculation.id=new.calculation_id and period.id=new.period_id
      and period.status='draft' and calculation.source_digest=new.source_digest
      and calculation.exceptions='[]'::jsonb
      and calculation.control_reconciliation#>>'{sourceLedger,status}'='matched'
      and calculation.revision=(select max(revision) from public."FIN_IndirectTaxCalculations" where period_id=period.id)
      and new.decision_id=(select decision.id from public."FIN_IndirectTaxDecisions" decision
        where decision.evidence_id=new.evidence_id order by decision.revision desc limit 1)) then
    raise exception 'VAT transaction reconciliation requires current matched evidence and decision.' using errcode='22023';
  end if;
  insert into public."FIN_IndirectTaxEvidencePeriods" as assigned
    (evidence_id,period_id,first_reconciled_by)
    values(new.evidence_id,new.period_id,new.reconciled_by)
    on conflict (evidence_id) do update set period_id=excluded.period_id
      where assigned.period_id=excluded.period_id
    returning period_id into v_assigned;
  if v_assigned is distinct from new.period_id then
    raise exception 'VAT evidence is assigned to another period; use a separate correction event.' using errcode='22023';
  end if;
  new.reconciled_at:=now();
  return new;
end; $$;
revoke all on function public._multideck_indirect_tax_reconciliation_guard() from public,anon,authenticated;
create trigger indirect_tax_reconciliation_guard before insert on public."FIN_IndirectTaxReconciliations"
  for each row execute function public._multideck_indirect_tax_reconciliation_guard();

-- A privileged direct decision insert must honour the same signed-period
-- boundary as the review RPC. Corrections use a separate evidence event.
create function public._multideck_indirect_tax_decision_period_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('vat-source-period:'||new.evidence_id::text,0));
  if exists(select 1 from public."FIN_IndirectTaxReconciliations" signed
    join public."FIN_IndirectTaxPeriods" period on period.id=signed.period_id
    where signed.evidence_id=new.evidence_id
      and not (new.tax_point between period.start_date and period.end_date)) then
    raise exception 'Signed VAT evidence cannot move into another period; create a correction event.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_indirect_tax_decision_period_guard() from public,anon,authenticated;
create trigger indirect_tax_decision_period_guard before insert on public."FIN_IndirectTaxDecisions"
  for each row execute function public._multideck_indirect_tax_decision_period_guard();

create function public._multideck_indirect_tax_period_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_country text; v_currency text; v_obligation_code text;
  v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
begin
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
revoke all on function public._multideck_indirect_tax_period_guard() from public,anon,authenticated;
create trigger indirect_tax_period_guard before insert or update on public."FIN_IndirectTaxPeriods"
  for each row execute function public._multideck_indirect_tax_period_guard();

create function public._multideck_indirect_tax_evidence_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_document public."FIN_Documents"%rowtype; v_line public."FIN_DocumentLines"%rowtype;
begin
  if new.source_kind='posted_document_line' then
    select * into v_document from public."FIN_Documents" where "FINDoc_ID"=new.source_document_id;
    select * into v_line from public."FIN_DocumentLines" where "FINDocLine_ID"=new.source_document_line_id;
    if v_document."FINDoc_ID" is null or v_line."FINDocLine_ID" is null
      or v_line."FINDocLine_DocumentID" is distinct from v_document."FINDoc_ID"
      or v_document."FINDoc_LegalEntityID" is distinct from new.legal_entity_id
      or v_document."FINDoc_NativePostingStatusCode"<>'posted'
      or v_document."FINDoc_NativePostingBatchID" is distinct from new.source_posting_batch_id
      or new.source_id is distinct from new.source_document_line_id
      or new.source_version is distinct from new.source_posting_batch_id::text
      or new.currency_code is distinct from v_document."FINDoc_CurrencyCodeSnapshot"
      or new.exchange_rate is distinct from v_document."FINDoc_ExchangeRate"
      or new.signed_net_amount is distinct from v_line."FINDocLine_NetAmount"
      or new.signed_tax_amount is distinct from v_line."FINDocLine_TaxAmount"
      or new.signed_net_reporting is distinct from v_line."FINDocLine_LocalNetAmount"
      or new.signed_tax_reporting is distinct from v_line."FINDocLine_LocalTaxAmount" then
      raise exception 'VAT evidence must match one posted document line and its native ledger batch.' using errcode='22023';
    end if;
    if not exists(select 1 from public."FIN_PostingBatches" batch
      where batch."FINPostBatch_ID"=new.source_posting_batch_id
        and batch."FINPostBatch_LegalEntityID"=new.legal_entity_id
        and batch."FINPostBatch_StatusCode"='posted') then
      raise exception 'VAT evidence source batch is not posted for this legal entity.' using errcode='22023';
    end if;
  end if;
  if new.reverses_evidence_id is not null and not exists (
    select 1 from public."FIN_IndirectTaxEvidence" original
    where original.id=new.reverses_evidence_id and original.legal_entity_id=new.legal_entity_id
      and original.jurisdiction_code=new.jurisdiction_code
  ) then
    raise exception 'A tax correction cannot reverse another entity or jurisdiction.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_indirect_tax_evidence_guard() from public,anon,authenticated;
create trigger indirect_tax_evidence_guard before insert on public."FIN_IndirectTaxEvidence"
  for each row execute function public._multideck_indirect_tax_evidence_guard();

-- Capture every newly native-posted document line as unresolved evidence.
-- Tax point and treatment remain undecided until an explicit reviewed decision
-- supplies them; document date is recorded only as source context.
create function public._multideck_indirect_tax_capture_posted_document()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if new."FINDoc_NativePostingStatusCode"<>'posted' then return new; end if;
  if tg_op='UPDATE' then
    if old."FINDoc_NativePostingStatusCode"='posted' then return new; end if;
  end if;
  if not exists(select 1 from public."cmp_LegalEntities" entity
    where entity."LegalEntity_ID"=new."FINDoc_LegalEntityID" and entity."LegalEntity_CountryCode"='GB') then
    return new;
  end if;
  if new."FINDoc_NativePostingBatchID" is null or new."FINDoc_NativePostedBy" is null then
    raise exception 'Posted finance document lacks tax-evidence batch or actor.' using errcode='22023';
  end if;
  insert into public."FIN_IndirectTaxEvidence"(
    legal_entity_id,jurisdiction_code,source_kind,source_id,source_posting_batch_id,
    source_document_id,source_document_line_id,source_version,source_document_date,
    currency_code,exchange_rate,signed_net_amount,signed_tax_amount,
    signed_net_reporting,signed_tax_reporting,recorded_by
  )
  select new."FINDoc_LegalEntityID",'GB','posted_document_line',line."FINDocLine_ID",
    new."FINDoc_NativePostingBatchID",new."FINDoc_ID",line."FINDocLine_ID",
    new."FINDoc_NativePostingBatchID"::text,new."FINDoc_DocumentDate",
    new."FINDoc_CurrencyCodeSnapshot",new."FINDoc_ExchangeRate",
    line."FINDocLine_NetAmount",line."FINDocLine_TaxAmount",
    line."FINDocLine_LocalNetAmount",line."FINDocLine_LocalTaxAmount",
    new."FINDoc_NativePostedBy"
  from public."FIN_DocumentLines" line
  where line."FINDocLine_DocumentID"=new."FINDoc_ID"
  on conflict (legal_entity_id,jurisdiction_code,source_kind,source_id,source_version) do nothing;
  return new;
end; $$;
revoke all on function public._multideck_indirect_tax_capture_posted_document() from public,anon,authenticated;
create trigger indirect_tax_capture_posted_document
  after insert or update of "FINDoc_NativePostingStatusCode" on public."FIN_Documents"
  for each row execute function public._multideck_indirect_tax_capture_posted_document();

create function public._multideck_indirect_tax_calculation_line_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if not exists (
    select 1 from public."FIN_IndirectTaxPeriods" period
    join public."FIN_IndirectTaxEvidence" evidence on evidence.id=new.evidence_id
    join public."FIN_IndirectTaxDecisions" decision on decision.id=new.decision_id and decision.evidence_id=evidence.id
    where period.id=new.period_id and period.legal_entity_id=evidence.legal_entity_id
      and period.jurisdiction_code=evidence.jurisdiction_code
      and decision.tax_point between period.start_date and period.end_date
      and decision.scheme_code=period.scheme_code
  ) then
    raise exception 'Tax calculation line source is outside the period or lacks reviewed tax treatment.' using errcode='22023';
  end if;
  if exists(select 1 from public."FIN_IndirectTaxReconciliations" signed
    where signed.evidence_id=new.evidence_id and signed.period_id<>new.period_id) then
    raise exception 'VAT evidence signed in another period requires a separate correction event.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_indirect_tax_calculation_line_guard() from public,anon,authenticated;
create trigger indirect_tax_calculation_line_guard before insert on public."FIN_IndirectTaxCalculationLines"
  for each row execute function public._multideck_indirect_tax_calculation_line_guard();

create function public._multideck_indirect_tax_immutable()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  raise exception 'Indirect tax evidence and calculations are immutable; create a correction or new revision.' using errcode='22023';
end; $$;
revoke all on function public._multideck_indirect_tax_immutable() from public,anon,authenticated;
create trigger indirect_tax_evidence_immutable before update or delete on public."FIN_IndirectTaxEvidence"
  for each row execute function public._multideck_indirect_tax_immutable();
create trigger indirect_tax_decision_immutable before update or delete on public."FIN_IndirectTaxDecisions"
  for each row execute function public._multideck_indirect_tax_immutable();
create trigger indirect_tax_calculation_immutable before update or delete on public."FIN_IndirectTaxCalculations"
  for each row execute function public._multideck_indirect_tax_immutable();
create trigger indirect_tax_calculation_line_immutable before update or delete on public."FIN_IndirectTaxCalculationLines"
  for each row execute function public._multideck_indirect_tax_immutable();
create trigger indirect_tax_reconciliation_immutable before update or delete on public."FIN_IndirectTaxReconciliations"
  for each row execute function public._multideck_indirect_tax_immutable();

-- All access is through future entity-and-permission-checked server functions.
-- No browser role has a direct table grant or an RLS policy for these records.
alter table public."FIN_IndirectTaxPeriods" enable row level security;
alter table public."FIN_IndirectTaxEvidence" enable row level security;
alter table public."FIN_IndirectTaxDecisions" enable row level security;
alter table public."FIN_IndirectTaxCalculations" enable row level security;
alter table public."FIN_IndirectTaxCalculationLines" enable row level security;
alter table public."FIN_IndirectTaxReconciliations" enable row level security;
alter table public."FIN_IndirectTaxEvidencePeriods" enable row level security;
revoke all on public."FIN_IndirectTaxPeriods",public."FIN_IndirectTaxEvidence",public."FIN_IndirectTaxDecisions",
  public."FIN_IndirectTaxCalculations",public."FIN_IndirectTaxCalculationLines",
  public."FIN_IndirectTaxReconciliations",public."FIN_IndirectTaxEvidencePeriods" from public,anon,authenticated;
-- Service-role clients may read these records for protected Edge orchestration.
-- All writes pass through SECURITY DEFINER functions and posting triggers,
-- where source validation, entity permissions and audit run together.
grant select on public."FIN_IndirectTaxPeriods",public."FIN_IndirectTaxEvidence",
  public."FIN_IndirectTaxDecisions",public."FIN_IndirectTaxCalculations",
  public."FIN_IndirectTaxCalculationLines",public."FIN_IndirectTaxReconciliations",
  public."FIN_IndirectTaxEvidencePeriods" to service_role;

-- All statutory decisions go through an active, entity-scoped finance actor.
create function public._multideck_uk_vat_access(p_actor uuid,p_entity uuid)
returns void language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not exists (
    select 1 from public."cmp_Users" actor
    join public."cmp_LegalEntities" entity on entity."Company_ID"=actor."Company_ID"
    where actor."User_ID"=p_actor and actor."User_AccessStatus"='active'
      and entity."LegalEntity_ID"=p_entity and entity."LegalEntity_IsActive"
      and entity."LegalEntity_CountryCode"='GB'
  ) or not coalesce(public._multideck_dexter_has_permission(p_actor,'Finance.Compliance.Manage'),false) then
    raise exception 'You do not have access to review UK VAT for this legal entity.' using errcode='42501';
  end if;
end; $$;
revoke all on function public._multideck_uk_vat_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public._multideck_uk_vat_access(uuid,uuid) to service_role;

create function public.multideck_uk_vat_create_draft_period(
  p_actor uuid,p_entity uuid,p_start date,p_end date
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_obligation uuid; v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_period uuid; v_currency text; v_scheme text; v_existing record;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_start is null or p_end is null or p_end<p_start or p_end>=p_start+interval '2 years' then
    raise exception 'Choose a valid UK VAT period.' using errcode='22023';
  end if;
  select upper("LegalEntity_BaseCurrencyCodeSnapshot") into v_currency
    from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
  if v_currency<>'GBP' then
    raise exception 'UK VAT calculation requires a GBP native ledger for this legal entity.' using errcode='22023';
  end if;
  select obligation."FINCompliance_ID" into v_obligation
    from public."FIN_ComplianceObligations" obligation
    join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    where obligation."FINCompliance_Code"='gb-vat-mtd' and pack."FINLocPack_CountryCode"='GB';
  if v_obligation is null then raise exception 'The UK VAT obligation pack is not installed.' using errcode='22023'; end if;
  select * into v_registration from public."FIN_LegalEntityComplianceRegistrations"
    where "FINComplianceReg_LegalEntityID"=p_entity and "FINComplianceReg_ObligationID"=v_obligation;
  if not found then raise exception 'Set up the legal entity UK VAT registration before creating a period.' using errcode='22023'; end if;
  v_scheme:=v_registration."FINComplianceReg_SettingsJSON"->>'schemeCode';
  if v_scheme not in ('standard','annual') or v_scheme is null
    or v_registration."FINComplianceReg_StatusCode" not in ('configured','sandbox_verified','production_verified')
    or not coalesce(v_registration."FINComplianceReg_RegistrationReference" ~ '^[0-9]{9}$',false)
    or v_registration."FINComplianceReg_EffectiveFrom">p_start
    or (v_registration."FINComplianceReg_EffectiveTo" is not null
      and v_registration."FINComplianceReg_EffectiveTo"<p_end) then
    raise exception 'One effective, reviewed standard or annual UK VAT registration is required.' using errcode='22023';
  end if;
  insert into public."FIN_IndirectTaxPeriods"(
    legal_entity_id,obligation_id,registration_id,jurisdiction_code,scheme_code,
    reporting_currency,start_date,end_date,created_by
  ) values (p_entity,v_obligation,v_registration."FINComplianceReg_ID",'GB',v_scheme,'GBP',p_start,p_end,p_actor)
  on conflict (legal_entity_id,obligation_id,start_date,end_date) do nothing returning id into v_period;
  if v_period is null then
    select id,registration_id,scheme_code into v_existing from public."FIN_IndirectTaxPeriods"
      where legal_entity_id=p_entity and obligation_id=v_obligation and start_date=p_start and end_date=p_end;
    if v_existing.registration_id is distinct from v_registration."FINComplianceReg_ID"
      or v_existing.scheme_code is distinct from v_scheme then
      raise exception 'The existing VAT period uses a different registration or scheme.' using errcode='22023';
    end if;
    v_period:=v_existing.id;
  end if;
  return jsonb_build_object('periodId',v_period,'status','draft','start',p_start,'end',p_end,
    'authorityObligationVerified',false);
end; $$;
revoke all on function public.multideck_uk_vat_create_draft_period(uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_create_draft_period(uuid,uuid,date,date) to service_role;

-- The reviewer selects a tax point and reason. Treatment is derived from the
-- exact approved tax code snapshotted on the posted line, never from its name.
create function public.multideck_uk_vat_review_evidence(
  p_actor uuid,p_evidence_id uuid,p_tax_point date,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_event public."FIN_IndirectTaxEvidence"%rowtype;
  v_document public."FIN_Documents"%rowtype; v_line public."FIN_DocumentLines"%rowtype;
  v_tax public."FIN_TaxCodes"%rowtype; v_treatment text; v_revision integer; v_decision uuid;
  v_scheme text; v_registration_count integer;
begin
  select * into v_event from public."FIN_IndirectTaxEvidence" where id=p_evidence_id;
  if not found or v_event.jurisdiction_code<>'GB' then raise exception 'UK VAT evidence was not found.' using errcode='P0002'; end if;
  perform public._multideck_uk_vat_access(p_actor,v_event.legal_entity_id);
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||v_event.legal_entity_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('vat-source-period:'||p_evidence_id::text,0));
  select * into v_event from public."FIN_IndirectTaxEvidence" where id=p_evidence_id for update;
  if v_event.source_kind<>'posted_document_line' then
    raise exception 'This evidence source requires a separate reviewed tax rule.' using errcode='22023';
  end if;
  if p_tax_point is null or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Enter a tax point and a review reason of at least ten characters.' using errcode='22023';
  end if;
  select count(*)::integer,min(registration."FINComplianceReg_SettingsJSON"->>'schemeCode')
    into v_registration_count,v_scheme
  from public."FIN_LegalEntityComplianceRegistrations" registration
  join public."FIN_ComplianceObligations" obligation
    on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
  where registration."FINComplianceReg_LegalEntityID"=v_event.legal_entity_id
    and obligation."FINCompliance_Code"='gb-vat-mtd'
    and registration."FINComplianceReg_StatusCode" in ('configured','sandbox_verified','production_verified')
    and registration."FINComplianceReg_EffectiveFrom"<=p_tax_point
    and (registration."FINComplianceReg_EffectiveTo" is null
      or registration."FINComplianceReg_EffectiveTo">=p_tax_point);
  if v_registration_count<>1 or v_scheme not in ('standard','annual') or v_scheme is null then
    raise exception 'One effective standard or annual UK VAT registration is required for review.' using errcode='22023';
  end if;
  if exists(select 1 from public."FIN_IndirectTaxReconciliations" signed
    join public."FIN_IndirectTaxPeriods" period on period.id=signed.period_id
    where signed.evidence_id=p_evidence_id
      and not (p_tax_point between period.start_date and period.end_date)) then
    raise exception 'This signed VAT transaction cannot move to another period; record a correction event.' using errcode='22023';
  end if;
  select * into v_document from public."FIN_Documents" where "FINDoc_ID"=v_event.source_document_id;
  select * into v_line from public."FIN_DocumentLines" where "FINDocLine_ID"=v_event.source_document_line_id;
  select * into v_tax from public."FIN_TaxCodes"
    where "FINTax_ID"=v_line."FINDocLine_TaxCodeID"
      and "FINTax_LegalEntityID"=v_event.legal_entity_id
      and "FINTax_CountryCode"='GB' and "FINTax_TaxTypeCode"='vat'
      and "FINTax_IsActive" and "FINTax_ApprovedAt" is not null
      and "FINTax_Code"=v_line."FINDocLine_TaxCodeSnapshot"
      and "FINTax_RatePercent"=v_line."FINDocLine_TaxRatePercent"
      and "FINTax_EffectiveFrom"<=p_tax_point
      and ("FINTax_EffectiveTo" is null or "FINTax_EffectiveTo">=p_tax_point);
  if not found then raise exception 'The posted line has no currently approved UK VAT rule for that tax point.' using errcode='22023'; end if;
  if v_document."FINDoc_TypeCode" in ('sl_invoice','credit_note') then
    v_treatment:=case v_tax."FINTax_TreatmentCategoryCode"
      when 'domestic_standard' then 'domestic_sale'
      when 'reduced_rate' then 'domestic_sale'
      when 'zero_rated' then 'zero_rated_sale'
      when 'exempt' then 'exempt_sale'
      when 'outside_uk_service_box6' then 'outside_uk_service_sale'
      else null end;
  elsif v_document."FINDoc_TypeCode" in ('pl_invoice','debit_note') then
    v_treatment:=case
      when v_tax."FINTax_TreatmentCategoryCode" in ('domestic_standard','reduced_rate') and v_tax."FINTax_IsRecoverable" then 'domestic_purchase'
      when v_tax."FINTax_TreatmentCategoryCode" in ('domestic_standard','reduced_rate') and not v_tax."FINTax_IsRecoverable" then 'nonrecoverable_purchase'
      when v_tax."FINTax_TreatmentCategoryCode"='zero_rated' then 'zero_rated_purchase'
      when v_tax."FINTax_TreatmentCategoryCode"='exempt' then 'exempt_purchase'
      else null end;
  end if;
  if v_treatment is null or (v_treatment in ('zero_rated_sale','exempt_sale','outside_uk_service_sale','zero_rated_purchase','exempt_purchase')
    and (v_tax."FINTax_RatePercent"<>0 or v_event.signed_tax_amount<>0 or v_event.signed_tax_reporting<>0)) then
    raise exception 'This UK VAT treatment needs a separate reviewed rule or has inconsistent tax.' using errcode='22023';
  end if;
  select coalesce(max(revision),0)+1 into v_revision from public."FIN_IndirectTaxDecisions" where evidence_id=p_evidence_id;
  insert into public."FIN_IndirectTaxDecisions"(
    evidence_id,revision,tax_point,scheme_code,treatment_code,tax_code_id,
    reviewed_rule_reference,rule_snapshot,review_reason,reviewed_by
  ) values (
    p_evidence_id,v_revision,p_tax_point,v_scheme,v_treatment,v_tax."FINTax_ID",
    v_tax."FINTax_ID"::text||':'||v_tax."FINTax_ApprovedAt"::text,
    jsonb_build_object('code',v_tax."FINTax_Code",'ratePercent',v_tax."FINTax_RatePercent",
      'category',v_tax."FINTax_TreatmentCategoryCode",'recoverable',v_tax."FINTax_IsRecoverable",
      'approvedAt',v_tax."FINTax_ApprovedAt",'effectiveFrom',v_tax."FINTax_EffectiveFrom",
      'effectiveTo',v_tax."FINTax_EffectiveTo"),btrim(p_reason),p_actor
  ) returning id into v_decision;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,v_event.legal_entity_id,'multideck-app','finance','public',
    'FIN_IndirectTaxDecisions','indirect_tax_decision',v_decision,'review_vat_evidence',btrim(p_reason),
    'UK VAT evidence reviewed',jsonb_build_object('evidenceId',p_evidence_id,'revision',v_revision,
      'taxPoint',p_tax_point,'scheme',v_scheme,'treatment',v_treatment,'taxCodeId',v_tax."FINTax_ID"));
  return jsonb_build_object('decisionId',v_decision,'evidenceId',p_evidence_id,
    'revision',v_revision,'taxPoint',p_tax_point,'scheme',v_scheme,'treatment',v_treatment);
end; $$;
revoke all on function public.multideck_uk_vat_review_evidence(uuid,uuid,date,text) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_review_evidence(uuid,uuid,date,text) to service_role;

-- An unpaid supplier invoice with recoverable input VAT may need the six-month
-- input-tax clawback. Calculate the unpaid balance at the period end from
-- posted allocations, not today's outstanding balance: a later payment must
-- not erase an earlier return's obligation. This is a conservative release
-- gate until the reviewed clawback and repayment-adjustment workflow exists.
create function public._multideck_uk_vat_unpaid_input_tax_risk_rows(p_entity uuid,p_end date)
returns table(document_id uuid,document_number text,document_date date,due_date date,
  currency_code text,gross_amount numeric,paid_by_period_end numeric,
  unpaid_at_period_end numeric,first_possible_clawback_date date)
language sql stable security definer set search_path=pg_catalog,public as $$
  select document."FINDoc_ID",document."FINDoc_Number"::text,
    document."FINDoc_DocumentDate",document."FINDoc_DueDate",
    document."FINDoc_CurrencyCodeSnapshot"::text,document."FINDoc_GrossAmount",
    coalesce(paid.amount,0),document."FINDoc_GrossAmount"-coalesce(paid.amount,0),
    reviewed.first_possible_date
  from public."FIN_Documents" document
  left join lateral (
    select sum(allocation."FINCashAlloc_AllocatedAmount") amount
    from public."FIN_CashAllocations" allocation
    join public."FIN_CashTransactions" cash
      on cash."FINCash_ID"=allocation."FINCashAlloc_CashID"
    where allocation."FINCashAlloc_DocumentID"=document."FINDoc_ID"
      and allocation."FINCashAlloc_AllocationStatusCode"='allocated'
      and cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_TypeCode"='supplier_payment'
      and cash."FINCash_NativePostingStatusCode"='posted'
      and cash."FINCash_TransactionDate"<=p_end
  ) paid on true
  join lateral (
    select min((greatest(coalesce(document."FINDoc_DueDate",document."FINDoc_DocumentDate"),
      decision.tax_point)+interval '6 months')::date) first_possible_date
    from public."FIN_IndirectTaxEvidence" evidence
    join lateral (
      select latest.tax_point,latest.treatment_code
      from public."FIN_IndirectTaxDecisions" latest
      where latest.evidence_id=evidence.id
      order by latest.revision desc limit 1
    ) decision on true
    where evidence.source_document_id=document."FINDoc_ID"
      and evidence.legal_entity_id=p_entity
      and evidence.jurisdiction_code='GB'
      and evidence.source_kind='posted_document_line'
      and evidence.signed_tax_reporting>0
      and decision.treatment_code='domestic_purchase'
      and decision.tax_point<=p_end
  ) reviewed on reviewed.first_possible_date<=p_end
  where document."FINDoc_LegalEntityID"=p_entity
    and document."FINDoc_TypeCode"='pl_invoice'
    and document."FINDoc_NativePostingStatusCode"='posted'
    and document."FINDoc_GrossAmount"-coalesce(paid.amount,0)>0;
$$;
revoke all on function public._multideck_uk_vat_unpaid_input_tax_risk_rows(uuid,date) from public,anon,authenticated;

create function public._multideck_uk_vat_unpaid_input_tax_risks(p_entity uuid,p_end date)
returns integer language sql stable security definer set search_path=pg_catalog,public as $$
  select count(*)::integer from public._multideck_uk_vat_unpaid_input_tax_risk_rows(p_entity,p_end);
$$;
revoke all on function public._multideck_uk_vat_unpaid_input_tax_risks(uuid,date) from public,anon,authenticated;

create function public.multideck_uk_vat_clawback_candidates(p_actor uuid,p_entity uuid,p_period uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype; v_total integer; v_rows jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB';
  if not found then raise exception 'UK VAT period was not found.' using errcode='P0002'; end if;
  select count(*)::integer into v_total from public._multideck_uk_vat_unpaid_input_tax_risk_rows(p_entity,v_period.end_date);
  select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.first_possible_clawback_date,
    candidate.document_date,candidate.document_id),'[]'::jsonb) into v_rows
  from (select * from public._multideck_uk_vat_unpaid_input_tax_risk_rows(p_entity,v_period.end_date)
    order by first_possible_clawback_date,document_date,document_id limit 50) candidate;
  return jsonb_build_object('periodId',p_period,'legalEntityId',p_entity,
    'periodEnd',v_period.end_date,'totalCandidates',v_total,'items',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_clawback_candidates(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_clawback_candidates(uuid,uuid,uuid) to service_role;

-- A draft calculator only. Approval, VAT control reconciliation and HMRC
-- obligations are separate gates; none is implied by a successful draft.
create function public._multideck_uk_vat_calculate_core(p_actor uuid,p_period_id uuid,p_persist boolean)
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
  v_ledger_digest text;
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
      and evidence.source_kind<>'posted_document_line';
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
    if exists(select 1 from public."FIN_IndirectTaxReconciliations" signed
      where signed.evidence_id=v_row.id and signed.period_id<>v_period.id) then
      raise exception 'VAT evidence % was signed in another period; record a correction event.',v_row.id using errcode='22023';
    end if;
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
  v_control:=jsonb_build_object('status','unreconciled',
    'reason','Whole-period VAT control balance and timing differences require review before approval',
    'sourceLedger',jsonb_build_object('status',case when v_ledger_mismatched=0 then 'matched' else 'mismatch' end,
      'checked',v_ledger_checked,'mismatched',v_ledger_mismatched,
      'postingDigest',v_ledger_digest,'mismatchSample',v_ledger_sample));
  v_version:=case when v_period.scheme_code='annual' then 'uk-annual-v3' else 'uk-standard-v5' end;
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
revoke all on function public._multideck_uk_vat_calculate_core(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public._multideck_uk_vat_calculate_core(uuid,uuid,boolean) to service_role;

create function public.multideck_uk_vat_calculate_draft(p_actor uuid,p_period_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog,public as $$
  select public._multideck_uk_vat_calculate_core(p_actor,p_period_id,true);
$$;
revoke all on function public.multideck_uk_vat_calculate_draft(uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_calculate_draft(uuid,uuid) to service_role;

-- Recompute all current source and native-ledger inputs while a period is
-- locked. The return is ephemeral and never creates a calculation revision.
create function public.multideck_uk_vat_current_snapshot(p_actor uuid,p_period_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog,public as $$
  select public._multideck_uk_vat_calculate_core(p_actor,p_period_id,false);
$$;
revoke all on function public.multideck_uk_vat_current_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_current_snapshot(uuid,uuid) to service_role;

create function public.multideck_uk_vat_reconcile_transactions(
  p_actor uuid,p_entity uuid,p_calculation uuid,p_source_digest text,
  p_evidence_ids uuid[],p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_calculation public."FIN_IndirectTaxCalculations"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_fresh jsonb; v_fresh_id uuid; v_evidence uuid; v_decisions uuid[];
  v_reconciliation uuid; v_at timestamptz; v_rows jsonb:='[]'::jsonb; v_inserted integer:=0;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_source_digest is null or p_source_digest !~ '^[a-f0-9]{64}$'
    or p_evidence_ids is null or cardinality(p_evidence_ids) not between 1 and 100
    or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Choose up to 100 VAT transactions, the reviewed digest and a reconciliation reason.' using errcode='22023';
  end if;
  if (select count(distinct item) from unnest(p_evidence_ids) item)<>cardinality(p_evidence_ids)
    or array_position(p_evidence_ids,null) is not null then
    raise exception 'VAT transaction identifiers must be distinct and complete.' using errcode='22023';
  end if;
  select period.* into v_period from public."FIN_IndirectTaxPeriods" period
    join public."FIN_IndirectTaxCalculations" calculation on calculation.period_id=period.id
    where calculation.id=p_calculation and period.legal_entity_id=p_entity and period.jurisdiction_code='GB'
    for update of period;
  if not found then raise exception 'UK VAT calculation was not found.' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||p_entity::text,0));
  select * into v_calculation from public."FIN_IndirectTaxCalculations" where id=p_calculation;
  if v_period.status<>'draft' or v_calculation.source_digest<>p_source_digest
    or v_calculation.revision<>(select max(revision) from public."FIN_IndirectTaxCalculations" where period_id=v_period.id)
    or v_calculation.exceptions<>'[]'::jsonb
    or v_calculation.control_reconciliation#>>'{sourceLedger,status}'<>'matched' then
    raise exception 'Review the latest matched VAT draft before reconciling its transactions.' using errcode='22023';
  end if;
  -- Source edits take the same per-document advisory lock. Acquire every
  -- selected document lock before the freshness calculation to close the
  -- race between that calculation and the sign-off insert.
  for v_evidence in select distinct evidence.source_document_id
    from public."FIN_IndirectTaxEvidence" evidence
    where evidence.id=any(p_evidence_ids) and evidence.legal_entity_id=p_entity
      and evidence.source_document_id is not null
    order by evidence.source_document_id loop
    perform pg_advisory_xact_lock(hashtextextended('vat-source-document:'||v_evidence::text,0));
  end loop;
  -- Recalculate while the period is locked. Any changed registration, source,
  -- tax decision or posting line changes the digest and rolls this action back.
  v_fresh:=public.multideck_uk_vat_calculate_draft(p_actor,v_period.id);
  if v_fresh->>'sourceDigest'<>p_source_digest
    or v_fresh#>>'{sourceLedger,status}'<>'matched' then
    raise exception 'VAT sources changed since the reviewed calculation.' using errcode='22023';
  end if;
  v_fresh_id:=(v_fresh->>'calculationId')::uuid;
  foreach v_evidence in array p_evidence_ids loop
    select array_agg(distinct line.decision_id) into v_decisions
    from public."FIN_IndirectTaxCalculationLines" line
    where line.calculation_id=v_fresh_id and line.period_id=v_period.id and line.evidence_id=v_evidence;
    if cardinality(v_decisions) is distinct from 1 then
      raise exception 'VAT transaction % is not in the reviewed calculation.',v_evidence using errcode='22023';
    end if;
    insert into public."FIN_IndirectTaxReconciliations"(
      period_id,calculation_id,evidence_id,decision_id,source_digest,reconciled_by,reason
    ) values (v_period.id,v_fresh_id,v_evidence,v_decisions[1],p_source_digest,p_actor,btrim(p_reason))
    on conflict (evidence_id,decision_id,source_digest) do nothing
    returning id,reconciled_at into v_reconciliation,v_at;
    if v_reconciliation is null then
      select id,reconciled_at into v_reconciliation,v_at
      from public."FIN_IndirectTaxReconciliations" where evidence_id=v_evidence
        and decision_id=v_decisions[1] and source_digest=p_source_digest;
    else
      v_inserted:=v_inserted+1;
    end if;
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object('evidenceId',v_evidence,
      'decisionId',v_decisions[1],'reconciliationId',v_reconciliation,'vatReconciledAt',v_at));
    v_reconciliation:=null;
  end loop;
  if v_inserted>0 then
    insert into public."Audit_Events"(
      "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
      "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
      "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
    ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
      'FIN_IndirectTaxReconciliations','indirect_tax_reconciliation',v_period.id,
      'reconcile_vat_transactions',btrim(p_reason),'UK VAT transactions reconciled',
      jsonb_build_object('periodId',v_period.id,'calculationId',v_fresh_id,
        'sourceDigest',p_source_digest,'inserted',v_inserted,'evidenceIds',to_jsonb(p_evidence_ids)));
  end if;
  return jsonb_build_object('periodId',v_period.id,'calculationId',v_fresh_id,
    'sourceDigest',p_source_digest,'inserted',v_inserted,'transactions',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_reconcile_transactions(uuid,uuid,uuid,text,uuid[],text) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_reconcile_transactions(uuid,uuid,uuid,text,uuid[],text) to service_role;

create function public._multideck_uk_vat_read_access(p_actor uuid,p_entity uuid)
returns void language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not exists (
    select 1 from public."cmp_Users" actor
    join public."cmp_LegalEntities" entity on entity."Company_ID"=actor."Company_ID"
    where actor."User_ID"=p_actor and actor."User_AccessStatus"='active'
      and entity."LegalEntity_ID"=p_entity and entity."LegalEntity_IsActive"
      and entity."LegalEntity_CountryCode"='GB'
  ) or not coalesce(public._multideck_dexter_has_permission(p_actor,'Finance.Compliance.View'),false) then
    raise exception 'You do not have access to UK VAT evidence for this legal entity.' using errcode='42501';
  end if;
end; $$;
revoke all on function public._multideck_uk_vat_read_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public._multideck_uk_vat_read_access(uuid,uuid) to service_role;

-- A document date is complete only when every line from its current posting
-- has an explicit sign-off against its latest VAT treatment decision.
create function public.multideck_uk_vat_document_reconciliation(p_actor uuid,p_entity uuid,p_document uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_document public."FIN_Documents"%rowtype; v_total integer; v_signed integer; v_date timestamptz;
  v_source_locked boolean;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select * into v_document from public."FIN_Documents"
    where "FINDoc_ID"=p_document and "FINDoc_LegalEntityID"=p_entity;
  if not found then
    raise exception 'Finance document is unavailable for this legal entity.' using errcode='42501';
  end if;
  select exists (
    select 1 from public."FIN_IndirectTaxReconciliations" reconciliation
    join public."FIN_IndirectTaxEvidence" evidence on evidence.id=reconciliation.evidence_id
    where evidence.legal_entity_id=p_entity and evidence.source_document_id=p_document
  ) into v_source_locked;
  if v_document."FINDoc_NativePostingStatusCode"<>'posted' then
    return jsonb_build_object('status','not_posted','totalLines',0,'reconciledLines',0,
      'vatReconciledAt',null,'sourceLocked',v_source_locked);
  end if;
  select count(*),count(signed.reconciled_at),max(signed.reconciled_at)
    into v_total,v_signed,v_date
  from public."FIN_DocumentLines" line
  left join public."FIN_IndirectTaxEvidence" evidence
    on evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
      and evidence.source_kind='posted_document_line'
      and evidence.source_document_line_id=line."FINDocLine_ID"
      and evidence.source_posting_batch_id=v_document."FINDoc_NativePostingBatchID"
  left join lateral (
    select decision.id from public."FIN_IndirectTaxDecisions" decision
    where decision.evidence_id=evidence.id order by decision.revision desc limit 1
  ) latest on true
  left join lateral (
    select reconciliation.reconciled_at from public."FIN_IndirectTaxReconciliations" reconciliation
    join public."FIN_IndirectTaxCalculations" calculation
      on calculation.period_id=reconciliation.period_id
      and calculation.source_digest=reconciliation.source_digest
      and calculation.revision=(select max(latest.revision)
        from public."FIN_IndirectTaxCalculations" latest
        where latest.period_id=reconciliation.period_id)
    join public."FIN_IndirectTaxCalculationLines" calculation_line
      on calculation_line.calculation_id=calculation.id
      and calculation_line.evidence_id=evidence.id
      and calculation_line.decision_id=latest.id
    where reconciliation.evidence_id=evidence.id and reconciliation.decision_id=latest.id
    order by reconciliation.reconciled_at desc,reconciliation.id desc limit 1
  ) signed on true
  where line."FINDocLine_DocumentID"=p_document;
  return jsonb_build_object('status',case when v_total=0 or v_signed=0 then 'pending'
    when v_signed=v_total then 'reconciled' else 'partial' end,
    'totalLines',v_total,'reconciledLines',v_signed,'sourceLocked',v_source_locked,
    'vatReconciledAt',case when v_total>0 and v_signed=v_total then v_date else null end);
end; $$;
revoke all on function public.multideck_uk_vat_document_reconciliation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_document_reconciliation(uuid,uuid,uuid) to service_role;

-- Read-only preflight for the complete posted source population, not only the
-- selected VAT period. Samples are bounded; counts always cover all rows.
create function public.multideck_uk_vat_source_coverage(p_actor uuid,p_entity uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_posted bigint; v_missing bigint; v_unreviewed bigint; v_pending bigint; v_unsupported bigint;
  v_missing_sample jsonb; v_unreviewed_sample jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select count(*),count(*) filter (where evidence.id is null)
    into v_posted,v_missing
  from public."FIN_Documents" document
  join public."FIN_DocumentLines" line on line."FINDocLine_DocumentID"=document."FINDoc_ID"
  left join public."FIN_IndirectTaxEvidence" evidence
    on evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
      and evidence.source_kind='posted_document_line'
      and evidence.source_document_line_id=line."FINDocLine_ID"
      and evidence.source_posting_batch_id=document."FINDoc_NativePostingBatchID"
  where document."FINDoc_LegalEntityID"=p_entity and document."FINDoc_NativePostingStatusCode"='posted';
  select count(*) into v_unreviewed from public."FIN_IndirectTaxEvidence" evidence
  where evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
    and not exists(select 1 from public."FIN_IndirectTaxDecisions" decision where decision.evidence_id=evidence.id);
  select count(*) into v_pending from public."FIN_Documents" document
    where document."FINDoc_LegalEntityID"=p_entity
      and document."FINDoc_NativePostingStatusCode" in ('pending_migration','reversed');
  select count(*) into v_unsupported from public."FIN_IndirectTaxEvidence" evidence
    where evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
      and evidence.source_kind<>'posted_document_line';
  select coalesce(jsonb_agg(to_jsonb(sample)),'[]'::jsonb) into v_missing_sample from (
    select document."FINDoc_ID" document_id,document."FINDoc_Number" document_number,
      document."FINDoc_DocumentDate" document_date,line."FINDocLine_ID" line_id
    from public."FIN_Documents" document
    join public."FIN_DocumentLines" line on line."FINDocLine_DocumentID"=document."FINDoc_ID"
    where document."FINDoc_LegalEntityID"=p_entity and document."FINDoc_NativePostingStatusCode"='posted'
      and not exists(select 1 from public."FIN_IndirectTaxEvidence" evidence
        where evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
          and evidence.source_kind='posted_document_line'
          and evidence.source_document_line_id=line."FINDocLine_ID"
          and evidence.source_posting_batch_id=document."FINDoc_NativePostingBatchID")
    order by document."FINDoc_DocumentDate",document."FINDoc_ID",line."FINDocLine_ID" limit 50
  ) sample;
  select coalesce(jsonb_agg(to_jsonb(sample)),'[]'::jsonb) into v_unreviewed_sample from (
    select evidence.id evidence_id,evidence.source_document_id document_id,
      evidence.source_document_line_id line_id,evidence.source_document_date document_date,
      evidence.signed_net_reporting net_gbp,evidence.signed_tax_reporting vat_gbp,
      line."FINDocLine_TaxCodeSnapshot" tax_code
    from public."FIN_IndirectTaxEvidence" evidence
    left join public."FIN_DocumentLines" line on line."FINDocLine_ID"=evidence.source_document_line_id
    where evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
      and not exists(select 1 from public."FIN_IndirectTaxDecisions" decision where decision.evidence_id=evidence.id)
    order by evidence.source_document_date nulls first,evidence.id limit 100
  ) sample;
  return jsonb_build_object('legalEntityId',p_entity,'jurisdiction','GB','postedDocumentLines',v_posted,
    'missingCapturedLines',v_missing,'unreviewedEvents',v_unreviewed,
    'pendingOrReversedDocuments',v_pending,'unsupportedSourceKinds',v_unsupported,
    'missingSample',v_missing_sample,'unreviewedSample',v_unreviewed_sample,
    'complete',v_missing=0 and v_unreviewed=0 and v_pending=0 and v_unsupported=0);
end; $$;
revoke all on function public.multideck_uk_vat_source_coverage(uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_source_coverage(uuid,uuid) to service_role;

create function public.multideck_uk_vat_list_periods(p_actor uuid,p_entity uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_total bigint; v_rows jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select count(*) into v_total from public."FIN_IndirectTaxPeriods" period
    where period.legal_entity_id=p_entity and period.jurisdiction_code='GB';
  select coalesce(jsonb_agg(to_jsonb(item) order by item.start_date desc,item.period_id),'[]'::jsonb)
    into v_rows from (
    select period.id period_id,period.start_date,period.end_date,period.status,
      period.scheme_code,period.reporting_currency,period.authority_obligation_verified_at,
      calculation.id latest_calculation_id,calculation.revision latest_revision,
      calculation.box_totals latest_boxes,
      calculation.control_reconciliation->>'status' control_status,
      signoffs.transaction_count,signoffs.signed_transaction_count
    from public."FIN_IndirectTaxPeriods" period
    left join lateral (
      select * from public."FIN_IndirectTaxCalculations" candidate
      where candidate.period_id=period.id order by candidate.revision desc limit 1
    ) calculation on true
    left join lateral (
      select count(*)::integer transaction_count,
        count(*) filter (where exists (
          select 1 from public."FIN_IndirectTaxReconciliations" signed
          where signed.period_id=period.id and signed.evidence_id=source.evidence_id
            and signed.decision_id=source.decision_id
            and signed.source_digest=calculation.source_digest
        ))::integer signed_transaction_count
      from (select distinct line.evidence_id,line.decision_id
        from public."FIN_IndirectTaxCalculationLines" line
        where line.calculation_id=calculation.id and line.period_id=period.id) source
    ) signoffs on true
    where period.legal_entity_id=p_entity and period.jurisdiction_code='GB'
    order by period.start_date desc,period.id limit 100
  ) item;
  return jsonb_build_object('legalEntityId',p_entity,'total',v_total,'periods',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_list_periods(uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_list_periods(uuid,uuid) to service_role;

-- A reviewer can inspect one immutable calculation revision and its source
-- lines. The page limit is deliberately bounded for large VAT periods.
create function public.multideck_uk_vat_calculation_detail(
  p_actor uuid,p_entity uuid,p_calculation uuid,p_offset integer default 0,p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_calculation public."FIN_IndirectTaxCalculations"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_total bigint; v_lines jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Choose a valid VAT calculation page.' using errcode='22023';
  end if;
  select calculation.* into v_calculation from public."FIN_IndirectTaxCalculations" calculation
    join public."FIN_IndirectTaxPeriods" period on period.id=calculation.period_id
    where calculation.id=p_calculation and period.legal_entity_id=p_entity and period.jurisdiction_code='GB';
  if not found then raise exception 'UK VAT calculation was not found.' using errcode='P0002'; end if;
  select * into v_period from public."FIN_IndirectTaxPeriods" where id=v_calculation.period_id;
  select count(*) into v_total from public."FIN_IndirectTaxCalculationLines" line
    where line.calculation_id=p_calculation;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.box_number,item.evidence_id),'[]'::jsonb)
    into v_lines from (
    select line.box_number,line.signed_amount amount_gbp,line.evidence_id,line.decision_id,
      evidence.source_kind,evidence.source_id,evidence.source_version,
      evidence.source_document_id document_id,evidence.source_document_line_id document_line_id,
      document."FINDoc_Number" document_number,document."FINDoc_TypeCode" document_type,
      decision.revision decision_revision,decision.tax_point,decision.treatment_code,
      decision.reviewed_rule_reference,decision.rule_snapshot,
      evidence.signed_net_reporting net_gbp,evidence.signed_tax_reporting vat_gbp,
      exists(select 1 from public."FIN_IndirectTaxReconciliations" prior_signoff
        join public."FIN_IndirectTaxEvidence" prior_evidence on prior_evidence.id=prior_signoff.evidence_id
        where prior_evidence.source_document_id=evidence.source_document_id) source_locked,
      reconciliation.reconciled_at vat_reconciled_at,
      reconciliation.reconciled_by vat_reconciled_by
    from public."FIN_IndirectTaxCalculationLines" line
    join public."FIN_IndirectTaxEvidence" evidence on evidence.id=line.evidence_id
    join public."FIN_IndirectTaxDecisions" decision on decision.id=line.decision_id and decision.evidence_id=evidence.id
    left join lateral (
      select signed.reconciled_at,signed.reconciled_by
      from public."FIN_IndirectTaxReconciliations" signed
      where signed.period_id=v_period.id and signed.evidence_id=evidence.id
        and signed.decision_id=decision.id and signed.source_digest=v_calculation.source_digest
      order by signed.reconciled_at desc limit 1
    ) reconciliation on true
    left join public."FIN_Documents" document on document."FINDoc_ID"=evidence.source_document_id
    where line.calculation_id=p_calculation and line.period_id=v_period.id
      and evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
    order by line.box_number,line.evidence_id
    offset p_offset limit p_limit
  ) item;
  return jsonb_build_object('calculationId',v_calculation.id,'periodId',v_period.id,
    'legalEntityId',p_entity,'startDate',v_period.start_date,'endDate',v_period.end_date,
    'periodStatus',v_period.status,'scheme',v_period.scheme_code,
    'revision',v_calculation.revision,'calculationVersion',v_calculation.calculation_version,
    'sourceDigest',v_calculation.source_digest,'registration',v_calculation.registration_snapshot,
    'boxes',v_calculation.box_totals,'exceptions',v_calculation.exceptions,
    'controlReconciliation',v_calculation.control_reconciliation,
    'calculatedBy',v_calculation.calculated_by,'calculatedAt',v_calculation.calculated_at,
    'latestRevision',v_calculation.revision=(select max(revision) from public."FIN_IndirectTaxCalculations"
      where period_id=v_period.id),'totalLines',v_total,'offset',p_offset,'lines',v_lines);
end; $$;
revoke all on function public.multideck_uk_vat_calculation_detail(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_calculation_detail(uuid,uuid,uuid,integer,integer) to service_role;

-- The VAT account is a source-to-return audit view of one immutable draft.
-- Transaction sign-offs are shown, but they do not constitute period control.
create function public.multideck_uk_vat_account(
  p_actor uuid,p_entity uuid,p_calculation uuid,p_offset integer default 0,p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_calculation public."FIN_IndirectTaxCalculations"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_total bigint; v_signed bigint; v_rows jsonb; v_raw_boxes jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Choose a valid VAT account page.' using errcode='22023';
  end if;
  select calculation.* into v_calculation from public."FIN_IndirectTaxCalculations" calculation
    join public."FIN_IndirectTaxPeriods" period on period.id=calculation.period_id
    where calculation.id=p_calculation and period.legal_entity_id=p_entity and period.jurisdiction_code='GB';
  if not found then raise exception 'UK VAT calculation was not found.' using errcode='P0002'; end if;
  select * into v_period from public."FIN_IndirectTaxPeriods" where id=v_calculation.period_id;

  select count(*),count(*) filter (where reconciliation.reconciled_at is not null)
    into v_total,v_signed
  from (select distinct line.evidence_id,line.decision_id
    from public."FIN_IndirectTaxCalculationLines" line
    where line.calculation_id=p_calculation and line.period_id=v_period.id) source
  left join lateral (
    select signed.reconciled_at from public."FIN_IndirectTaxReconciliations" signed
    where signed.period_id=v_period.id and signed.evidence_id=source.evidence_id
      and signed.decision_id=source.decision_id and signed.source_digest=v_calculation.source_digest
    order by signed.reconciled_at desc limit 1
  ) reconciliation on true;
  select coalesce(jsonb_object_agg(totals.box_number::text,totals.amount_gbp),'{}'::jsonb)
    into v_raw_boxes from (
    select line.box_number,sum(line.signed_amount) amount_gbp
    from public."FIN_IndirectTaxCalculationLines" line
    where line.calculation_id=p_calculation and line.period_id=v_period.id
    group by line.box_number
  ) totals;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.tax_point,item.evidence_id),'[]'::jsonb)
    into v_rows from (
    select source.evidence_id,source.decision_id,source.boxes,
      evidence.source_kind,evidence.source_id,evidence.source_version,
      evidence.source_document_id document_id,evidence.source_document_line_id document_line_id,
      document."FINDoc_Number" document_number,document."FINDoc_TypeCode" document_type,
      decision.tax_point,decision.treatment_code,decision.revision decision_revision,
      decision.reviewed_rule_reference,decision.rule_snapshot,
      evidence.signed_net_reporting net_gbp,evidence.signed_tax_reporting vat_gbp,
      exists(select 1 from public."FIN_IndirectTaxReconciliations" prior_signoff
        join public."FIN_IndirectTaxEvidence" prior_evidence on prior_evidence.id=prior_signoff.evidence_id
        where prior_evidence.source_document_id=evidence.source_document_id) source_locked,
      reconciliation.reconciled_at vat_reconciled_at,reconciliation.reconciled_by vat_reconciled_by
    from (
      select line.evidence_id,line.decision_id,
        jsonb_object_agg(line.box_number::text,line.signed_amount order by line.box_number) boxes
      from public."FIN_IndirectTaxCalculationLines" line
      where line.calculation_id=p_calculation and line.period_id=v_period.id
      group by line.evidence_id,line.decision_id
    ) source
    join public."FIN_IndirectTaxEvidence" evidence on evidence.id=source.evidence_id
      and evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
    join public."FIN_IndirectTaxDecisions" decision on decision.id=source.decision_id
      and decision.evidence_id=evidence.id
    left join public."FIN_Documents" document on document."FINDoc_ID"=evidence.source_document_id
    left join lateral (
      select signed.reconciled_at,signed.reconciled_by
      from public."FIN_IndirectTaxReconciliations" signed
      where signed.period_id=v_period.id and signed.evidence_id=evidence.id
        and signed.decision_id=decision.id and signed.source_digest=v_calculation.source_digest
      order by signed.reconciled_at desc limit 1
    ) reconciliation on true
    order by decision.tax_point,evidence.id
    offset p_offset limit p_limit
  ) item;
  return jsonb_build_object('calculationId',v_calculation.id,'periodId',v_period.id,
    'legalEntityId',p_entity,'revision',v_calculation.revision,
    'sourceDigest',v_calculation.source_digest,'returnBoxes',v_calculation.box_totals,
    'rawBoxTotals',v_raw_boxes,'controlStatus',v_calculation.control_reconciliation->>'status',
    'totalTransactions',v_total,'signedTransactions',v_signed,
    'offset',p_offset,'rows',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_account(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_account(uuid,uuid,uuid,integer,integer) to service_role;

-- An accounting-period inventory for VAT-account review. Accounting period
-- overlap is deliberately disclosed: it is not a VAT tax-point reconciliation.
-- Include tax-account postings even when a manual journal has no 'Tax:' label.
create function public.multideck_uk_vat_tax_posting_inventory(
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
          and evidence.source_document_id=posting."FINPostLine_DocumentID"
          and evidence.source_document_line_id=posting."FINPostLine_DocumentLineID"
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
revoke all on function public.multideck_uk_vat_tax_posting_inventory(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_tax_posting_inventory(uuid,uuid,uuid,integer,integer) to service_role;

-- An unresolved queue for human review. The source document date is context,
-- not an inferred VAT tax point. Rows and the total remain entity-scoped.
create function public.multideck_uk_vat_review_queue(
  p_actor uuid,p_entity uuid,p_limit integer default 100,
  p_after_at timestamptz default null,p_after_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_total bigint; v_rows jsonb; v_has_more boolean;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if p_limit is null or p_limit not between 1 and 100
    or (p_after_at is null)<>(p_after_id is null) then
    raise exception 'Choose up to 100 UK VAT evidence rows and a complete page cursor.' using errcode='22023';
  end if;
  select count(*) into v_total from public."FIN_IndirectTaxEvidence" evidence
    where evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
      and not exists(select 1 from public."FIN_IndirectTaxDecisions" decision where decision.evidence_id=evidence.id);
  select coalesce(jsonb_agg(to_jsonb(item)-'row_number' order by item.recorded_at,item.evidence_id)
      filter (where item.row_number<=p_limit),'[]'::jsonb),count(*)>p_limit
    into v_rows,v_has_more from (
    select page.*,row_number() over (order by page.recorded_at,page.evidence_id) row_number
    from (
    select evidence.id evidence_id,evidence.recorded_at,evidence.recorded_by,
      evidence.capture_kind,evidence.capture_reason,evidence.source_version,
      evidence.source_kind,evidence.source_document_id document_id,
      document."FINDoc_Number" document_number,document."FINDoc_TypeCode" document_type,
      evidence.source_document_line_id line_id,evidence.source_document_date document_date,
      evidence.currency_code,evidence.signed_net_reporting net_gbp,
      evidence.signed_tax_reporting vat_gbp,line."FINDocLine_TaxCodeSnapshot" tax_code
    from public."FIN_IndirectTaxEvidence" evidence
    left join public."FIN_Documents" document on document."FINDoc_ID"=evidence.source_document_id
    left join public."FIN_DocumentLines" line on line."FINDocLine_ID"=evidence.source_document_line_id
    where evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
      and not exists(select 1 from public."FIN_IndirectTaxDecisions" decision where decision.evidence_id=evidence.id)
      and (p_after_at is null or (evidence.recorded_at,evidence.id)>(p_after_at,p_after_id))
    order by evidence.recorded_at,evidence.id limit p_limit+1
    ) page
  ) item;
  return jsonb_build_object('legalEntityId',p_entity,'totalUnreviewed',v_total,'items',v_rows,
    'nextCursor',case when v_has_more then jsonb_build_object(
      'recordedAt',v_rows->-1->>'recorded_at','evidenceId',v_rows->-1->>'evidence_id') else null end);
end; $$;
revoke all on function public.multideck_uk_vat_review_queue(uuid,uuid,integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_review_queue(uuid,uuid,integer,timestamptz,uuid) to service_role;

-- Backfill is bounded and idempotent. It preserves original posting metadata
-- and records the actual operator and reason for this later capture.
create function public.multideck_uk_vat_backfill_posted(
  p_actor uuid,p_entity uuid,p_limit integer,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_inserted integer; v_before jsonb; v_after jsonb;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_limit is null or p_limit not between 1 and 500 or p_reason is null
    or length(btrim(p_reason)) not between 10 and 1000 then
    raise exception 'Choose up to 500 posted lines and record the backfill reason.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||p_entity::text,0));
  v_before:=public.multideck_uk_vat_source_coverage(p_actor,p_entity);
  insert into public."FIN_IndirectTaxEvidence"(
    legal_entity_id,jurisdiction_code,source_kind,source_id,source_posting_batch_id,
    source_document_id,source_document_line_id,source_version,source_document_date,
    currency_code,exchange_rate,signed_net_amount,signed_tax_amount,
    signed_net_reporting,signed_tax_reporting,capture_kind,capture_reason,recorded_by
  )
  select p_entity,'GB','posted_document_line',source.line_id,source.batch_id,
    source.document_id,source.line_id,source.batch_id::text,source.document_date,
    source.currency_code,source.exchange_rate,source.net_amount,source.tax_amount,
    source.net_reporting,source.tax_reporting,'historical_backfill',btrim(p_reason),p_actor
  from (
    select document."FINDoc_ID" document_id,document."FINDoc_NativePostingBatchID" batch_id,
      document."FINDoc_DocumentDate" document_date,
      document."FINDoc_CurrencyCodeSnapshot" currency_code,document."FINDoc_ExchangeRate" exchange_rate,
      line."FINDocLine_ID" line_id,line."FINDocLine_NetAmount" net_amount,
      line."FINDocLine_TaxAmount" tax_amount,line."FINDocLine_LocalNetAmount" net_reporting,
      line."FINDocLine_LocalTaxAmount" tax_reporting
    from public."FIN_Documents" document
    join public."FIN_DocumentLines" line on line."FINDocLine_DocumentID"=document."FINDoc_ID"
    join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=document."FINDoc_NativePostingBatchID"
      and batch."FINPostBatch_StatusCode"='posted' and batch."FINPostBatch_LegalEntityID"=p_entity
    where document."FINDoc_LegalEntityID"=p_entity and document."FINDoc_NativePostingStatusCode"='posted'
      and not exists(select 1 from public."FIN_IndirectTaxEvidence" evidence
        where evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
          and evidence.source_kind='posted_document_line'
          and evidence.source_document_line_id=line."FINDocLine_ID"
          and evidence.source_posting_batch_id=document."FINDoc_NativePostingBatchID")
    order by document."FINDoc_DocumentDate",document."FINDoc_ID",line."FINDocLine_ID" limit p_limit
  ) source
  on conflict (legal_entity_id,jurisdiction_code,source_kind,source_id,source_version) do nothing;
  get diagnostics v_inserted=row_count;
  v_after:=public.multideck_uk_vat_source_coverage(p_actor,p_entity);
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordKeyJSON","AuditEvent_Action",
    "AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxEvidence','indirect_tax_evidence',jsonb_build_object('legalEntityId',p_entity),
    'historical_backfill',btrim(p_reason),
    'UK VAT posted-line evidence backfill',jsonb_build_object('inserted',v_inserted,
      'missingBefore',v_before->'missingCapturedLines','missingAfter',v_after->'missingCapturedLines'));
  return jsonb_build_object('inserted',v_inserted,'coverage',v_after);
end; $$;
revoke all on function public.multideck_uk_vat_backfill_posted(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_backfill_posted(uuid,uuid,integer,text) to service_role;

commit;
