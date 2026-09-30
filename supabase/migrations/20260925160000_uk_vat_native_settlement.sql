begin;

-- A VAT remittance or repayment is a bank movement against an already accepted
-- HMRC return. It is never a second VAT return or a customer/supplier receipt.
create table public."FIN_HmrcVatSettlements" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  attempt_id uuid not null references public."FIN_HmrcVatSubmissionAttempts"(id) on delete restrict,
  statement_line_id uuid not null references public."FIN_StatementLines"("FINStmtLine_ID") on delete restrict,
  accounting_period_id uuid not null references public."FIN_Periods"("FINPeriod_ID") on delete restrict,
  bank_account_id uuid not null references public."FIN_BankAccounts"("FINBank_ID") on delete restrict,
  direction text not null check (direction in ('payment','refund')),
  amount_gbp numeric(18,4) not null check (amount_gbp>0),
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  prepared_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  prepared_at timestamptz not null default clock_timestamp(),
  preparation_reason text not null check (length(btrim(preparation_reason)) between 10 and 2000),
  posting_batch_id uuid unique references public."FIN_PostingBatches"("FINPostBatch_ID") on delete restrict,
  vat_posting_line_id uuid unique references public."FIN_PostingLines"("FINPostLine_ID") on delete restrict,
  bank_posting_line_id uuid unique references public."FIN_PostingLines"("FINPostLine_ID") on delete restrict,
  posted_by uuid references public."cmp_Users"("User_ID") on delete restrict,
  posted_at timestamptz,
  posting_reason text,
  check ((posting_batch_id is null and vat_posting_line_id is null
      and bank_posting_line_id is null and posted_by is null and posted_at is null
      and posting_reason is null)
    or (posting_batch_id is not null and vat_posting_line_id is not null
      and bank_posting_line_id is not null and posted_by is not null
      and posted_at is not null and length(btrim(posting_reason)) between 10 and 2000))
);
create index "IX_FIN_HmrcVatSettlements_attempt" on public."FIN_HmrcVatSettlements"(attempt_id,posted_at);
create unique index "UX_FIN_HmrcVatSettlements_posted_statement"
  on public."FIN_HmrcVatSettlements"(statement_line_id)
  where posting_batch_id is not null;
alter table public."FIN_HmrcVatSettlements" enable row level security;
revoke all on public."FIN_HmrcVatSettlements" from public,anon,authenticated,service_role;
grant select on public."FIN_HmrcVatSettlements" to service_role;

create function public._multideck_hmrc_vat_settlement_immutable()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' or old.posting_batch_id is not null then
    raise exception 'A posted HMRC VAT settlement cannot be changed.' using errcode='22023';
  end if;
  if (to_jsonb(new)-'posting_batch_id'-'vat_posting_line_id'-'bank_posting_line_id'
      -'posted_by'-'posted_at'-'posting_reason')<>
     (to_jsonb(old)-'posting_batch_id'-'vat_posting_line_id'-'bank_posting_line_id'
      -'posted_by'-'posted_at'-'posting_reason') then
    raise exception 'A prepared HMRC VAT settlement source cannot be changed.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_hmrc_vat_settlement_immutable()
  from public,anon,authenticated;
create trigger hmrc_vat_settlement_immutable before update or delete
  on public."FIN_HmrcVatSettlements" for each row
  execute function public._multideck_hmrc_vat_settlement_immutable();

alter table public."FIN_BankMatches" add column vat_settlement_id uuid unique
  references public."FIN_HmrcVatSettlements"(id) on delete restrict;

create function public._multideck_hmrc_vat_bank_match_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' then
    if old.vat_settlement_id is not null then
      raise exception 'A posted HMRC VAT bank match cannot be removed.' using errcode='22023';
    end if;
    return old;
  end if;
  if tg_op='UPDATE' and old.vat_settlement_id is not null then
    raise exception 'A posted HMRC VAT bank match cannot be changed.' using errcode='22023';
  end if;
  if new.vat_settlement_id is not null then
    if new."FINBankMatch_CashID" is not null
      or new."FINBankMatch_MatchTypeCode"<>'vat_settlement'
      or not exists(select 1 from public."FIN_HmrcVatSettlements" settlement
        where settlement.id=new.vat_settlement_id
          and settlement.statement_line_id=new."FINBankMatch_StatementLineID"
          and settlement.posting_batch_id is not null) then
      raise exception 'A VAT bank match requires its posted settlement.' using errcode='22023';
    end if;
  elsif new."FINBankMatch_MatchTypeCode"='vat_settlement' then
    raise exception 'VAT bank match is missing its settlement.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_hmrc_vat_bank_match_guard()
  from public,anon,authenticated;
create trigger hmrc_vat_bank_match_guard before insert or update or delete
  on public."FIN_BankMatches" for each row
  execute function public._multideck_hmrc_vat_bank_match_guard();

create function public._multideck_hmrc_vat_statement_source_lock()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public."FIN_HmrcVatSettlements" settlement
      where settlement.statement_line_id=old."FINStmtLine_ID"
        and settlement.posting_batch_id is not null) then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_op='DELETE' or old."FINStmtLine_MatchStatusCode"='matched'
    or (to_jsonb(new)-'FINStmtLine_MatchStatusCode')<>
       (to_jsonb(old)-'FINStmtLine_MatchStatusCode')
    or new."FINStmtLine_MatchStatusCode"<>'matched'
    or not exists(select 1 from public."FIN_BankMatches" match
      join public."FIN_HmrcVatSettlements" settlement
        on settlement.id=match.vat_settlement_id
      where settlement.statement_line_id=old."FINStmtLine_ID"
        and match."FINBankMatch_StatementLineID"=old."FINStmtLine_ID") then
    raise exception 'A posted HMRC VAT settlement locks its bank statement source.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_hmrc_vat_statement_source_lock()
  from public,anon,authenticated;
create trigger hmrc_vat_statement_source_lock before update or delete
  on public."FIN_StatementLines" for each row
  execute function public._multideck_hmrc_vat_statement_source_lock();

create function public._multideck_hmrc_vat_statement_import_lock()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public."FIN_StatementLines" line
      join public."FIN_HmrcVatSettlements" settlement
        on settlement.statement_line_id=line."FINStmtLine_ID"
      where line."FINStmtLine_ImportID"=old."FINStmtImp_ID"
        and settlement.posting_batch_id is not null) then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_op='DELETE' or
    (to_jsonb(new)-'FINStmtImp_StatusCode'-'verified_period_id'
      -'verified_at'-'verified_by'-'verification_evidence')<>
    (to_jsonb(old)-'FINStmtImp_StatusCode'-'verified_period_id'
      -'verified_at'-'verified_by'-'verification_evidence') then
    raise exception 'A posted HMRC VAT settlement locks its bank statement import.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_hmrc_vat_statement_import_lock()
  from public,anon,authenticated;
create trigger hmrc_vat_statement_import_lock before update or delete
  on public."FIN_StatementImports" for each row
  execute function public._multideck_hmrc_vat_statement_import_lock();

create function public._multideck_uk_vat_settlement_source(
  p_actor uuid,p_entity uuid,p_attempt uuid,p_statement_line uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_attempt public."FIN_HmrcVatSubmissionAttempts"; v_period public."FIN_IndirectTaxPeriods";
  v_calculation public."FIN_IndirectTaxCalculations"; v_line public."FIN_StatementLines";
  v_import public."FIN_StatementImports"; v_bank public."FIN_BankAccounts";
  v_accounting public."FIN_Periods"; v_vat public."FIN_NominalAccounts";
  v_due numeric; v_remaining numeric; v_amount numeric; v_direction text; v_digest text;
  v_accounting_count integer;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  perform public._multideck_bank_statement_access(p_actor,p_entity,'Finance.Banks.Manage');
  select attempt.* into v_attempt from public."FIN_HmrcVatSubmissionAttempts" attempt
    where attempt.id=p_attempt and attempt.environment='production'
      and attempt.status in ('accepted','accepted_readback');
  if not found or v_attempt.payload_sha256 is distinct from
      encode(sha256(convert_to(v_attempt.payload_body,'UTF8')),'hex') then
    raise exception 'Choose an accepted production HMRC VAT return.' using errcode='22023';
  end if;
  select period.* into v_period from public."FIN_IndirectTaxPeriods" period
    where period.id=v_attempt.period_id and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB' and period.status='review_locked';
  if not found then raise exception 'HMRC return belongs to another VAT period or entity.' using errcode='42501'; end if;
  select calculation.* into v_calculation
    from public."FIN_IndirectTaxFilingApprovals" approval
    join public."FIN_IndirectTaxPeriodReviewLocks" lock
      on lock.id=approval.review_lock_id and lock.period_id=v_period.id
      and lock.id=v_period.active_review_lock_id
      and lock.lock_fingerprint=approval.lock_fingerprint
    join public."FIN_IndirectTaxCalculations" calculation
      on calculation.id=lock.calculation_id and calculation.period_id=v_period.id
      and calculation.source_digest=lock.source_digest
    where approval.id=v_attempt.approval_id and approval.period_id=v_period.id
      and approval.registration_id=v_attempt.registration_id
      and approval.tenant_project_ref=v_attempt.tenant_project_ref
      and approval.environment=v_attempt.environment
      and approval.vrn=v_attempt.vrn and approval.period_key=v_attempt.period_key
      and not exists(select 1 from public."FIN_IndirectTaxFilingApprovalRevocations" revoked
        where revoked.approval_id=approval.id)
      and not exists(select 1 from public."FIN_IndirectTaxPeriodReviewUnlocks" unlocked
        where unlocked.lock_id=lock.id);
  if not found or not (
      exists(select 1 from public."FIN_HmrcVatSubmissionReceipts" receipt
        where receipt.attempt_id=v_attempt.id and receipt.period_id=v_period.id
          and receipt.tenant_project_ref=v_attempt.tenant_project_ref
          and receipt.payload_sha256=v_attempt.payload_sha256)
      or exists(select 1 from public."FIN_HmrcVatReturnReadbackChecks" readback
        where readback.attempt_id=v_attempt.id and readback.period_id=v_period.id
          and readback.tenant_project_ref=v_attempt.tenant_project_ref
          and readback.payload_sha256=v_attempt.payload_sha256
          and readback.result='matched')) then
    raise exception 'HMRC acceptance needs a matching receipt or return readback.' using errcode='22023';
  end if;
  v_due:=(v_calculation.box_totals->>'3')::numeric
    -(v_calculation.box_totals->>'4')::numeric;
  if v_due is null or v_due=0 or v_due<>round(v_due,2)
    or abs(v_due)<>(v_calculation.box_totals->>'5')::numeric then
    raise exception 'Accepted VAT return has no valid net settlement amount.' using errcode='22023';
  end if;
  v_direction:=case when v_due>0 then 'payment' else 'refund' end;
  select line.* into v_line from public."FIN_StatementLines" line
    where line."FINStmtLine_ID"=p_statement_line;
  select imp.* into v_import from public."FIN_StatementImports" imp
    where imp."FINStmtImp_ID"=v_line."FINStmtLine_ImportID"
      and imp.legal_entity_id=p_entity;
  select bank.* into v_bank from public."FIN_BankAccounts" bank
    where bank."FINBank_ID"=v_import."FINStmtImp_BankAccountID"
      and bank."FINBank_LegalEntityID"=p_entity and bank."FINBank_IsActive";
  if v_line."FINStmtLine_ID" is null or v_import."FINStmtImp_ID" is null
    or v_bank."FINBank_ID" is null or v_import.verified_at is not null
    or v_import."FINStmtImp_FileHashSHA256" is null
    or v_import.currency_code<>'GBP' or v_bank."FINBank_CurrencyCode"<>'GBP'
    or v_line."FINStmtLine_CurrencyCodeSnapshot"<>'GBP'
    or v_line."FINStmtLine_MatchStatusCode"<>'unmatched'
    or v_bank."FINBank_NominalAccountID" is null
    or exists(select 1 from public."FIN_BankMatches" matched
      where matched."FINBankMatch_StatementLineID"=p_statement_line) then
    raise exception 'Choose an unmatched GBP line from an unverified bank statement in this entity.' using errcode='22023';
  end if;
  v_amount:=abs(v_line."FINStmtLine_Amount");
  if v_amount=0 or v_amount<>round(v_amount,2)
    or (v_direction='payment' and v_line."FINStmtLine_Amount">=0)
    or (v_direction='refund' and v_line."FINStmtLine_Amount"<=0) then
    raise exception 'Bank statement amount or direction differs from the accepted return.' using errcode='22023';
  end if;
  select count(*)::integer into v_accounting_count from public."FIN_Periods" accounting
    where accounting."FINPeriod_LegalEntityID"=p_entity
      and v_line."FINStmtLine_TransactionDate" between accounting."FINPeriod_StartDate"
        and accounting."FINPeriod_EndDate"
      and accounting."FINPeriod_StatusCode"='open';
  if v_accounting_count<>1 or v_line."FINStmtLine_TransactionDate"<v_period.end_date
    or v_line."FINStmtLine_TransactionDate" not between
      v_import."FINStmtImp_StatementDateFrom" and v_import."FINStmtImp_StatementDateTo" then
    raise exception 'Settlement needs one open accounting month and a dated HMRC return.' using errcode='22023';
  end if;
  select accounting.* into v_accounting from public."FIN_Periods" accounting
    where accounting."FINPeriod_LegalEntityID"=p_entity
      and v_line."FINStmtLine_TransactionDate" between accounting."FINPeriod_StartDate"
        and accounting."FINPeriod_EndDate"
      and accounting."FINPeriod_StatusCode"='open';
  select nominal.* into v_vat from public."FIN_NominalAccounts" nominal
    where nominal."FINNom_LegalEntityID"=p_entity and nominal."FINNom_IsActive"
      and nominal."FINNom_Code" ~ '^2100([.]00[.]00)?$'
    order by case when nominal."FINNom_Code"='2100' then 0 else 1 end,nominal."FINNom_ID" limit 1;
  if not found or lower(coalesce(v_vat."FINNom_ControlTypeCode",'')) not like '%vat%'
    or v_vat."FINNom_ID"=v_bank."FINBank_NominalAccountID" then
    raise exception 'Configure separate active VAT and bank control nominals.' using errcode='22023';
  end if;
  select abs(v_due)-coalesce(sum(settlement.amount_gbp),0) into v_remaining
    from public."FIN_HmrcVatSettlements" settlement
    where settlement.attempt_id=p_attempt and settlement.posting_batch_id is not null;
  if v_amount>v_remaining then
    raise exception 'The bank settlement exceeds the accepted return balance.' using errcode='22023';
  end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object(
    'attemptId',p_attempt,'payloadHash',v_attempt.payload_sha256,
    'calculationId',v_calculation.id,'calculationDigest',v_calculation.source_digest,
    'netDue',v_due,'settledBefore',abs(v_due)-v_remaining,
    'statementLineId',p_statement_line,'statementImportId',v_import."FINStmtImp_ID",
    'statementFileHash',v_import."FINStmtImp_FileHashSHA256",
    'statementAmount',v_line."FINStmtLine_Amount",
    'statementDate',v_line."FINStmtLine_TransactionDate",
    'bankNominalId',v_bank."FINBank_NominalAccountID",
    'vatNominalId',v_vat."FINNom_ID",
    'accountingPeriodId',v_accounting."FINPeriod_ID")::text,'UTF8')),'hex');
  return jsonb_build_object('sourceDigest',v_digest,'attemptId',p_attempt,
    'statementLineId',p_statement_line,'legalEntityId',p_entity,
    'accountingPeriodId',v_accounting."FINPeriod_ID",
    'bankAccountId',v_bank."FINBank_ID",
    'bankNominalId',v_bank."FINBank_NominalAccountID",
    'vatNominalId',v_vat."FINNom_ID",'direction',v_direction,
    'amountGbp',v_amount::text,'netReturnDueGbp',v_due::text,
    'remainingBeforeGbp',v_remaining::text);
end; $$;
revoke all on function public._multideck_uk_vat_settlement_source(uuid,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_settlement(
  p_actor uuid,p_entity uuid,p_action text,p_attempt uuid,
  p_statement_line uuid,p_review uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_review public."FIN_HmrcVatSettlements"; v_source jsonb;
  v_batch uuid; v_vat_line uuid; v_bank_line uuid; v_amount numeric;
  v_period public."FIN_Periods"; v_statement public."FIN_StatementLines";
begin
  if p_action is null or p_action not in ('prepare','post')
    or length(btrim(coalesce(p_reason,''))) not between 10 and 2000 then
    raise exception 'Choose a VAT settlement action and reason.' using errcode='22023';
  end if;
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  perform public._multideck_bank_statement_access(p_actor,p_entity,'Finance.Banks.Manage');
  if p_action='post' then
    select * into v_review from public."FIN_HmrcVatSettlements" where id=p_review
      and legal_entity_id=p_entity for update;
    if not found then raise exception 'VAT settlement review not found in this entity.' using errcode='P0002'; end if;
    if v_review.posting_batch_id is not null then raise exception 'This settlement was already posted.' using errcode='23505'; end if;
    if v_review.prepared_by=p_actor then
      raise exception 'A second authorised operator must post the VAT settlement.' using errcode='42501';
    end if;
    p_attempt:=v_review.attempt_id; p_statement_line:=v_review.statement_line_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat-settlement:'||p_attempt::text,0));
  v_source:=public._multideck_uk_vat_settlement_source(
    p_actor,p_entity,p_attempt,p_statement_line);
  if p_action='prepare' then
    insert into public."FIN_HmrcVatSettlements"(
      legal_entity_id,attempt_id,statement_line_id,accounting_period_id,
      bank_account_id,direction,amount_gbp,source_digest,prepared_by,preparation_reason)
    values(p_entity,p_attempt,p_statement_line,(v_source->>'accountingPeriodId')::uuid,
      (v_source->>'bankAccountId')::uuid,v_source->>'direction',
      (v_source->>'amountGbp')::numeric,v_source->>'sourceDigest',p_actor,btrim(p_reason))
    returning * into v_review;
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
      values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_HmrcVatSettlements','hmrc_vat_settlement',v_review.id,'prepare','HMRC VAT bank settlement prepared',jsonb_build_object('attemptId',p_attempt,'statementLineId',p_statement_line,'amount',v_review.amount_gbp,'reason',btrim(p_reason)));
    return jsonb_build_object('id',v_review.id,'status','prepared','source',v_source);
  end if;
  if v_source->>'sourceDigest' is distinct from v_review.source_digest
    or v_source->>'direction' is distinct from v_review.direction
    or (v_source->>'amountGbp')::numeric is distinct from v_review.amount_gbp
    or (v_source->>'accountingPeriodId')::uuid is distinct from v_review.accounting_period_id
    or (v_source->>'bankAccountId')::uuid is distinct from v_review.bank_account_id then
    raise exception 'VAT settlement source changed; prepare a new review.' using errcode='40001';
  end if;
  v_amount:=v_review.amount_gbp;
  select * into v_period from public."FIN_Periods"
    where "FINPeriod_ID"=v_review.accounting_period_id and "FINPeriod_StatusCode"='open' for update;
  select * into v_statement from public."FIN_StatementLines"
    where "FINStmtLine_ID"=v_review.statement_line_id for update;
  insert into public."FIN_PostingBatches"(
    "FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable",
    "FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID",
    "FINPostBatch_DebitTotal","FINPostBatch_CreditTotal",
    "FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_CreatedBy")
  values('VAT-SET-'||left(v_review.id::text,8),'draft','FIN_HmrcVatSettlements',
    v_review.id,v_period."FINPeriod_ID",p_entity,v_amount,v_amount,'GBP',p_actor)
  returning "FINPostBatch_ID" into v_batch;
  insert into public."FIN_PostingLines"(
    "FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
    "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount",
    "FINPostLine_CurrencyCodeSnapshot")
  values(v_batch,1,(v_source->>'vatNominalId')::uuid,'HMRC VAT settlement',
    case when v_review.direction='payment' then v_amount else 0 end,
    case when v_review.direction='refund' then v_amount else 0 end,'GBP')
  returning "FINPostLine_ID" into v_vat_line;
  insert into public."FIN_PostingLines"(
    "FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
    "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount",
    "FINPostLine_CurrencyCodeSnapshot")
  values(v_batch,2,(v_source->>'bankNominalId')::uuid,'HMRC VAT bank movement',
    case when v_review.direction='refund' then v_amount else 0 end,
    case when v_review.direction='payment' then v_amount else 0 end,'GBP')
  returning "FINPostLine_ID" into v_bank_line;
  update public."FIN_PostingBatches" set "FINPostBatch_StatusCode"='posted',
    "FINPostBatch_PostedAt"=clock_timestamp(),"FINPostBatch_PostedBy"=p_actor
    where "FINPostBatch_ID"=v_batch;
  update public."FIN_HmrcVatSettlements" set posting_batch_id=v_batch,
    vat_posting_line_id=v_vat_line,bank_posting_line_id=v_bank_line,
    posted_by=p_actor,posted_at=clock_timestamp(),posting_reason=btrim(p_reason)
    where id=v_review.id;
  insert into public."FIN_BankMatches"(
    "FINBankMatch_StatementLineID","FINBankMatch_MatchTypeCode",
    "FINBankMatch_MatchedBy","FINBankMatch_Notes",vat_settlement_id)
  values(v_statement."FINStmtLine_ID",'vat_settlement',p_actor,btrim(p_reason),v_review.id);
  update public."FIN_StatementLines" set "FINStmtLine_MatchStatusCode"='matched'
    where "FINStmtLine_ID"=v_statement."FINStmtLine_ID";
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_HmrcVatSettlements','hmrc_vat_settlement',v_review.id,'post','HMRC VAT bank settlement posted',jsonb_build_object('attemptId',p_attempt,'statementLineId',p_statement_line,'batchId',v_batch,'amount',v_amount,'reason',btrim(p_reason)));
  return jsonb_build_object('id',v_review.id,'status','posted',
    'batchId',v_batch,'vatPostingLineId',v_vat_line,'bankPostingLineId',v_bank_line);
end; $$;
revoke all on function public.multideck_uk_vat_settlement(uuid,uuid,text,uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_settlement(uuid,uuid,text,uuid,uuid,uuid,text)
  to service_role;

create or replace function public.multideck_bank_statement_control(p_actor uuid,p_entity uuid,p_period uuid,p_bank uuid)
returns jsonb language plpgsql stable set search_path=pg_catalog,public as $$
declare p public."FIN_Periods"; b public."FIN_BankAccounts"; i public."FIN_StatementImports";
  statement_rows integer:=0; unmatched_rows integer:=0; invalid_matches integer:=0; unrepresented_cash integer:=0;
  orphan_bank_lines integer:=0; opening_gl numeric:=0; movement_gl numeric:=0; cash_movement numeric:=0;
  settlement_movement numeric:=0; unrepresented_settlements integer:=0;
  issues jsonb:='[]'::jsonb; ready boolean:=false;
begin
  perform public._multideck_bank_statement_access(p_actor,p_entity,'Finance.Management.View');
  select * into p from public."FIN_Periods" where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity;
  select * into b from public."FIN_BankAccounts" where "FINBank_ID"=p_bank and "FINBank_LegalEntityID"=p_entity;
  if p."FINPeriod_ID" is null or b."FINBank_ID" is null then raise exception 'Bank or period not found in this legal entity.' using errcode='P0002'; end if;
  select * into i from public."FIN_StatementImports" where legal_entity_id=p_entity and "FINStmtImp_BankAccountID"=p_bank
    and "FINStmtImp_StatementDateFrom"=p."FINPeriod_StartDate" and "FINStmtImp_StatementDateTo"=p."FINPeriod_EndDate"
    order by "FINStmtImp_ImportedAt" desc limit 1;
  if i."FINStmtImp_ID" is null then return jsonb_build_object('status','incomplete','reason','A complete period bank statement has not been imported.','bankId',p_bank,'periodId',p_period); end if;
  if b."FINBank_NominalAccountID" is null or not b."FINBank_IsActive" or b."FINBank_CurrencyCode"<>p."FINPeriod_BaseCurrencyCode" or i.currency_code<>b."FINBank_CurrencyCode" then
    issues:=issues||jsonb_build_array('The bank nominal or base-currency mapping is incomplete.');
  end if;
  select count(*),count(*) filter (where line."FINStmtLine_MatchStatusCode"<>'matched' or match."FINBankMatch_ID" is null)
    into statement_rows,unmatched_rows
    from public."FIN_StatementLines" line left join public."FIN_BankMatches" match on match."FINBankMatch_StatementLineID"=line."FINStmtLine_ID"
    where line."FINStmtLine_ImportID"=i."FINStmtImp_ID";
  if statement_rows<>i."FINStmtImp_RowCount" or unmatched_rows>0 then issues:=issues||jsonb_build_array('The imported statement has missing or unmatched lines.'); end if;
  select count(*) into invalid_matches from public."FIN_StatementLines" line
    join public."FIN_BankMatches" match on match."FINBankMatch_StatementLineID"=line."FINStmtLine_ID"
    left join public."FIN_CashTransactions" cash on cash."FINCash_ID"=match."FINBankMatch_CashID"
    left join public."FIN_HmrcVatSettlements" settlement on settlement.id=match.vat_settlement_id
    left join public."FIN_PostingBatches" settlement_batch
      on settlement_batch."FINPostBatch_ID"=settlement.posting_batch_id
    left join public."FIN_PostingLines" settlement_bank_line
      on settlement_bank_line."FINPostLine_ID"=settlement.bank_posting_line_id
    where line."FINStmtLine_ImportID"=i."FINStmtImp_ID" and (
      (match.vat_settlement_id is null and (
        match."FINBankMatch_CashID" is null or cash."FINCash_ID" is null
        or cash."FINCash_LegalEntityID"<>p_entity or cash."FINCash_BankAccountID"<>p_bank
        or cash."FINCash_StatusCode" not in ('approved','submitted') or cash."FINCash_NativePostingStatusCode"<>'posted'
        or cash."FINCash_CurrencyCodeSnapshot"<>i.currency_code or cash."FINCash_TransactionDate"<>line."FINStmtLine_TransactionDate"
        or line."FINStmtLine_Amount"<>case when cash."FINCash_TypeCode"='customer_receipt' then cash."FINCash_Amount" when cash."FINCash_TypeCode"='supplier_payment' then -cash."FINCash_Amount" else null end))
      or (match.vat_settlement_id is not null and (
        match."FINBankMatch_CashID" is not null or match."FINBankMatch_MatchTypeCode"<>'vat_settlement'
        or settlement.id is null or settlement.legal_entity_id<>p_entity
        or settlement.bank_account_id<>p_bank or settlement.statement_line_id<>line."FINStmtLine_ID"
        or settlement_batch."FINPostBatch_ID" is null
        or settlement_batch."FINPostBatch_StatusCode"<>'posted'
        or settlement_batch."FINPostBatch_LegalEntityID"<>p_entity
        or settlement_batch."FINPostBatch_SourceTable"<>'FIN_HmrcVatSettlements'
        or settlement_batch."FINPostBatch_SourceID"<>settlement.id
        or settlement_bank_line."FINPostLine_ID" is null
        or settlement_bank_line."FINPostLine_BatchID"<>settlement_batch."FINPostBatch_ID"
        or settlement_bank_line."FINPostLine_NominalAccountID"<>b."FINBank_NominalAccountID"
        or line."FINStmtLine_CurrencyCodeSnapshot"<>'GBP'
        or line."FINStmtLine_Amount"<>case when settlement.direction='payment'
          then -settlement.amount_gbp else settlement.amount_gbp end
        or settlement_bank_line."FINPostLine_DebitAmount"-settlement_bank_line."FINPostLine_CreditAmount"
          <>line."FINStmtLine_Amount")));
  if invalid_matches>0 then issues:=issues||jsonb_build_array('A matched cash or VAT settlement changed or is no longer posted.'); end if;
  select count(*),coalesce(sum(case when cash."FINCash_TypeCode"='customer_receipt' then cash."FINCash_Amount" when cash."FINCash_TypeCode"='supplier_payment' then -cash."FINCash_Amount" else 0 end),0)
    into unrepresented_cash,cash_movement from public."FIN_CashTransactions" cash
    where cash."FINCash_LegalEntityID"=p_entity and cash."FINCash_BankAccountID"=p_bank and cash."FINCash_AccountingDate" between p."FINPeriod_StartDate" and p."FINPeriod_EndDate"
      and cash."FINCash_NativePostingStatusCode"='posted' and cash."FINCash_StatusCode" in ('approved','submitted');
  select unrepresented_cash-count(*) into unrepresented_cash from public."FIN_StatementLines" line
    join public."FIN_BankMatches" match on match."FINBankMatch_StatementLineID"=line."FINStmtLine_ID"
    join public."FIN_CashTransactions" cash on cash."FINCash_ID"=match."FINBankMatch_CashID"
    where line."FINStmtLine_ImportID"=i."FINStmtImp_ID" and cash."FINCash_AccountingDate" between p."FINPeriod_StartDate" and p."FINPeriod_EndDate"
      and cash."FINCash_BankAccountID"=p_bank and cash."FINCash_NativePostingStatusCode"='posted';
  if unrepresented_cash<>0 then issues:=issues||jsonb_build_array('Posted cash entries and statement matches do not cover each other exactly.'); end if;
  select count(*),coalesce(sum(case when direction='payment' then -amount_gbp else amount_gbp end),0)
    into unrepresented_settlements,settlement_movement
    from public."FIN_HmrcVatSettlements" settlement
    where settlement.legal_entity_id=p_entity and settlement.bank_account_id=p_bank
      and settlement.accounting_period_id=p_period and settlement.posting_batch_id is not null;
  select unrepresented_settlements-count(*) into unrepresented_settlements
    from public."FIN_HmrcVatSettlements" settlement
    join public."FIN_BankMatches" match on match.vat_settlement_id=settlement.id
    join public."FIN_StatementLines" line on line."FINStmtLine_ID"=match."FINBankMatch_StatementLineID"
    where line."FINStmtLine_ImportID"=i."FINStmtImp_ID"
      and settlement.legal_entity_id=p_entity and settlement.bank_account_id=p_bank
      and settlement.accounting_period_id=p_period and settlement.posting_batch_id is not null;
  if unrepresented_settlements<>0 then
    issues:=issues||jsonb_build_array('Posted HMRC VAT settlements and statement matches do not cover each other exactly.');
  end if;
  select coalesce(sum(case when period."FINPeriod_EndDate"<p."FINPeriod_StartDate"
      or (period."FINPeriod_ID"=p_period and batch."FINPostBatch_SourceTable"='FIN_OpeningBalancePackages')
      then line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount" else 0 end),0),
    coalesce(sum(case when period."FINPeriod_ID"=p_period and batch."FINPostBatch_SourceTable" is distinct from 'FIN_OpeningBalancePackages'
      then line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount" else 0 end),0),
    count(*) filter (where period."FINPeriod_ID"=p_period and batch."FINPostBatch_SourceTable" is distinct from 'FIN_OpeningBalancePackages' and not exists (
      select 1 from public."FIN_BankMatches" match join public."FIN_StatementLines" statement_line on statement_line."FINStmtLine_ID"=match."FINBankMatch_StatementLineID"
      where statement_line."FINStmtLine_ImportID"=i."FINStmtImp_ID"
        and (match."FINBankMatch_CashID"=line."FINPostLine_CashID"
          or exists(select 1 from public."FIN_HmrcVatSettlements" settlement
            where settlement.id=match.vat_settlement_id
              and settlement.bank_posting_line_id=line."FINPostLine_ID"))))
    into opening_gl,movement_gl,orphan_bank_lines
    from public."FIN_PostingLines" line join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=line."FINPostLine_BatchID"
      join public."FIN_Periods" period on period."FINPeriod_ID"=batch."FINPostBatch_PeriodID" and period."FINPeriod_LegalEntityID"=p_entity
    where batch."FINPostBatch_LegalEntityID"=p_entity and batch."FINPostBatch_StatusCode"='posted'
      and line."FINPostLine_NominalAccountID"=b."FINBank_NominalAccountID" and period."FINPeriod_EndDate"<=p."FINPeriod_EndDate";
  if orphan_bank_lines>0 then issues:=issues||jsonb_build_array('Bank ledger lines lack a matched cash transaction.'); end if;
  if opening_gl<>i.opening_balance or opening_gl+movement_gl<>i.closing_balance or movement_gl<>cash_movement+settlement_movement then
    issues:=issues||jsonb_build_array('Statement opening, closing, cash-book and bank-ledger balances differ.');
  end if;
  ready:=jsonb_array_length(issues)=0;
  return jsonb_build_object('status',case when not ready then 'incomplete' when i.verified_at is not null and i.verified_period_id=p_period then 'verified' else 'ready_for_review' end,
    'statementId',i."FINStmtImp_ID",'bankId',p_bank,'periodId',p_period,'currency',i.currency_code,
    'rowCount',statement_rows,'unmatchedRows',unmatched_rows,'invalidMatches',invalid_matches,'unrepresentedCash',unrepresented_cash,'orphanBankLines',orphan_bank_lines,
    'openingStatement',i.opening_balance,'closingStatement',i.closing_balance,'openingLedger',opening_gl,'closingLedger',opening_gl+movement_gl,
    'cashMovement',cash_movement,'vatSettlementMovement',settlement_movement,'unrepresentedVatSettlements',unrepresented_settlements,'ledgerMovement',movement_gl,'issues',issues,'verifiedAt',i.verified_at,'verifiedBy',i.verified_by);
end; $$;

commit;
