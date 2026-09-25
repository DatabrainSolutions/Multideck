begin;

-- The legacy statement tables were placeholders. Keep their identities, but
-- make imports, matches and sign-off service-only and entity-scoped.
alter table public."FIN_StatementImports"
  add column if not exists legal_entity_id uuid references public."cmp_LegalEntities"("LegalEntity_ID"),
  add column if not exists currency_code text,
  add column if not exists opening_balance numeric(18,4),
  add column if not exists closing_balance numeric(18,4),
  add column if not exists verified_period_id uuid references public."FIN_Periods"("FINPeriod_ID"),
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public."cmp_Users"("User_ID"),
  add column if not exists verification_evidence jsonb not null default '{}'::jsonb;

alter table public."FIN_StatementImports" add constraint fin_statement_import_currency
  check (currency_code is null or currency_code ~ '^[A-Z]{3}$') not valid;
alter table public."FIN_StatementImports" add constraint fin_statement_import_hash
  check ("FINStmtImp_FileHashSHA256" is null or "FINStmtImp_FileHashSHA256" ~ '^[a-f0-9]{64}$') not valid;
create unique index fin_statement_file_once on public."FIN_StatementImports"
  ("FINStmtImp_BankAccountID","FINStmtImp_FileHashSHA256") where "FINStmtImp_FileHashSHA256" is not null;
create unique index fin_statement_line_number on public."FIN_StatementLines"("FINStmtLine_ImportID","FINStmtLine_LineNo");
create unique index fin_statement_one_match_per_line on public."FIN_BankMatches"("FINBankMatch_StatementLineID");
create unique index fin_statement_one_match_per_cash on public."FIN_BankMatches"("FINBankMatch_CashID") where "FINBankMatch_CashID" is not null;

revoke all on public."FIN_StatementImports",public."FIN_StatementLines",public."FIN_BankMatches" from public,anon,authenticated;
grant select,insert,update on public."FIN_StatementImports",public."FIN_StatementLines",public."FIN_BankMatches" to service_role;
grant delete on public."FIN_BankMatches" to service_role;

create function public._multideck_bank_statement_access(p_actor uuid,p_entity uuid,p_permission text)
returns void language plpgsql set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public."cmp_Users" u join public."cmp_LegalEntities" e on e."Company_ID"=u."Company_ID"
    where u."User_ID"=p_actor and u."User_AccessStatus"='active' and e."LegalEntity_ID"=p_entity and e."LegalEntity_IsActive")
    or not coalesce(public._multideck_dexter_has_permission(p_actor,p_permission),false) then
    raise exception 'You do not have access to this bank statement.' using errcode='42501';
  end if;
end; $$;
revoke all on function public._multideck_bank_statement_access(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public._multideck_bank_statement_access(uuid,uuid,text) to service_role;

create function public.multideck_bank_statement_import(p_actor uuid,p_entity uuid,p_bank uuid,p_file_name text,p_file_hash text,p_input jsonb)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare b public."FIN_BankAccounts"; i public."FIN_StatementImports"; item jsonb; row_number integer:=0;
  previous_balance numeric; amount numeric; balance numeric; transaction_date date; previous_date date;
begin
  perform public._multideck_bank_statement_access(p_actor,p_entity,'Finance.Banks.Manage');
  select * into b from public."FIN_BankAccounts" where "FINBank_ID"=p_bank and "FINBank_LegalEntityID"=p_entity and "FINBank_IsActive" for share;
  if not found or b."FINBank_NominalAccountID" is null then raise exception 'Choose an active bank with a mapped nominal account.' using errcode='22023'; end if;
  if p_file_name is null or length(btrim(p_file_name)) not between 1 and 240 or p_file_hash !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_input->'rows') is distinct from 'array' or jsonb_array_length(p_input->'rows') not between 1 and 1000
    or p_input->>'openingBalance' !~ '^-?[0-9]{1,14}\.[0-9]{4}$'
    or p_input->>'closingBalance' !~ '^-?[0-9]{1,14}\.[0-9]{4}$'
    or p_input->>'dateFrom' !~ '^\d{4}-\d{2}-\d{2}$'
    or p_input->>'dateTo' !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'The statement file or balances are invalid.' using errcode='22023';
  end if;
  select * into i from public."FIN_StatementImports" where "FINStmtImp_BankAccountID"=p_bank and "FINStmtImp_FileHashSHA256"=p_file_hash;
  if found then return jsonb_build_object('id',i."FINStmtImp_ID",'duplicate',true,'status',i."FINStmtImp_StatusCode"); end if;
  previous_balance:=(p_input->>'openingBalance')::numeric;
  for item in select value from jsonb_array_elements(p_input->'rows') loop
    row_number:=row_number+1;
    if jsonb_typeof(item) is distinct from 'object' or item->>'lineNo' is distinct from row_number::text
      or item->>'date' !~ '^\d{4}-\d{2}-\d{2}$'
      or item->>'amount' !~ '^-?[0-9]{1,14}\.[0-9]{4}$'
      or item->>'balance' !~ '^-?[0-9]{1,14}\.[0-9]{4}$'
      or length(coalesce(item->>'reference',''))>180 or length(coalesce(item->>'description',''))>1000
      or (btrim(coalesce(item->>'reference',''))='' and btrim(coalesce(item->>'description',''))='') then
      raise exception 'Statement line % is invalid.',row_number using errcode='22023';
    end if;
    transaction_date:=(item->>'date')::date;
    amount:=(item->>'amount')::numeric; balance:=(item->>'balance')::numeric;
    if amount=0 or previous_balance+amount<>balance or (previous_date is not null and transaction_date<previous_date) then
      raise exception 'Statement line % does not reconcile or is out of date order.',row_number using errcode='22023';
    end if;
    if transaction_date<(p_input->>'dateFrom')::date or transaction_date>(p_input->>'dateTo')::date then raise exception 'Statement line lies outside its stated coverage.' using errcode='22023'; end if;
    previous_balance:=balance; previous_date:=transaction_date;
  end loop;
  if previous_balance<>(p_input->>'closingBalance')::numeric then
    raise exception 'Statement closing balance differs from its final line.' using errcode='22023';
  end if;
  insert into public."FIN_StatementImports"("FINStmtImp_BankAccountID","FINStmtImp_SourceTypeCode","FINStmtImp_FileName","FINStmtImp_FileHashSHA256","FINStmtImp_StatementDateFrom","FINStmtImp_StatementDateTo","FINStmtImp_RowCount","FINStmtImp_ImportedBy",legal_entity_id,currency_code,opening_balance,closing_balance)
    values(p_bank,'csv',p_file_name,p_file_hash,(p_input->>'dateFrom')::date,(p_input->>'dateTo')::date,row_number,p_actor,p_entity,b."FINBank_CurrencyCode",(p_input->>'openingBalance')::numeric,(p_input->>'closingBalance')::numeric) returning * into i;
  insert into public."FIN_StatementLines"("FINStmtLine_ImportID","FINStmtLine_LineNo","FINStmtLine_TransactionDate","FINStmtLine_Reference","FINStmtLine_Description","FINStmtLine_CurrencyCodeSnapshot","FINStmtLine_Amount","FINStmtLine_BalanceAfter","FINStmtLine_RawJSON")
    select i."FINStmtImp_ID",(value->>'lineNo')::integer,(value->>'date')::date,nullif(value->>'reference',''),nullif(value->>'description',''),b."FINBank_CurrencyCode",(value->>'amount')::numeric,(value->>'balance')::numeric,value
    from jsonb_array_elements(p_input->'rows');
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_StatementImports','bank_statement',i."FINStmtImp_ID",'import','Bank statement imported',jsonb_build_object('bankId',p_bank,'fileHash',p_file_hash,'rowCount',row_number));
  return jsonb_build_object('id',i."FINStmtImp_ID",'duplicate',false,'status','imported');
end; $$;
revoke all on function public.multideck_bank_statement_import(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_bank_statement_import(uuid,uuid,uuid,text,text,jsonb) to service_role;

create function public.multideck_bank_statement_match(p_actor uuid,p_entity uuid,p_line uuid,p_cash uuid,p_reason text)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare i public."FIN_StatementImports"; l public."FIN_StatementLines"; c public."FIN_CashTransactions"; expected numeric;
begin
  perform public._multideck_bank_statement_access(p_actor,p_entity,'Finance.Banks.Manage');
  select * into l from public."FIN_StatementLines" where "FINStmtLine_ID"=p_line for update;
  select * into i from public."FIN_StatementImports" where "FINStmtImp_ID"=l."FINStmtLine_ImportID" and legal_entity_id=p_entity for update;
  if not found or i.verified_at is not null then raise exception 'Statement line is unavailable or already verified.' using errcode='22023'; end if;
  select * into c from public."FIN_CashTransactions" where "FINCash_ID"=p_cash and "FINCash_LegalEntityID"=p_entity for update;
  if not found or c."FINCash_BankAccountID" is distinct from i."FINStmtImp_BankAccountID" or c."FINCash_CurrencyCodeSnapshot"<>i.currency_code
    or c."FINCash_NativePostingStatusCode"<>'posted' or c."FINCash_StatusCode" not in ('approved','submitted')
    or c."FINCash_TypeCode" not in ('customer_receipt','supplier_payment') then
    raise exception 'Choose a posted cash transaction for this bank, entity and currency.' using errcode='22023';
  end if;
  expected:=case when c."FINCash_TypeCode"='customer_receipt' then c."FINCash_Amount" else -c."FINCash_Amount" end;
  if l."FINStmtLine_Amount"<>expected or l."FINStmtLine_TransactionDate"<>c."FINCash_TransactionDate" then
    raise exception 'Statement date or signed amount differs from this cash transaction.' using errcode='22023';
  end if;
  if length(btrim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Explain this bank match.' using errcode='22023'; end if;
  insert into public."FIN_BankMatches"("FINBankMatch_StatementLineID","FINBankMatch_CashID","FINBankMatch_MatchTypeCode","FINBankMatch_MatchedBy","FINBankMatch_Notes")
    values(p_line,p_cash,'manual',p_actor,btrim(p_reason));
  update public."FIN_StatementLines" set "FINStmtLine_MatchStatusCode"='matched' where "FINStmtLine_ID"=p_line;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_BankMatches','bank_match',p_line,'match','Bank statement line matched',jsonb_build_object('cashId',p_cash,'reason',btrim(p_reason)));
  return jsonb_build_object('lineId',p_line,'cashId',p_cash,'status','matched');
end; $$;
revoke all on function public.multideck_bank_statement_match(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_bank_statement_match(uuid,uuid,uuid,uuid,text) to service_role;

create function public.multideck_bank_statement_unmatch(p_actor uuid,p_entity uuid,p_line uuid,p_reason text)
returns boolean language plpgsql set search_path=pg_catalog,public as $$
declare i public."FIN_StatementImports"; matched_cash uuid;
begin
  perform public._multideck_bank_statement_access(p_actor,p_entity,'Finance.Banks.Manage');
  select imp.* into i from public."FIN_StatementImports" imp join public."FIN_StatementLines" line on line."FINStmtLine_ImportID"=imp."FINStmtImp_ID"
    where line."FINStmtLine_ID"=p_line and imp.legal_entity_id=p_entity for update of imp;
  if not found or i.verified_at is not null then raise exception 'Statement line is unavailable or already verified.' using errcode='22023'; end if;
  if length(btrim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Explain why this match is removed.' using errcode='22023'; end if;
  delete from public."FIN_BankMatches" where "FINBankMatch_StatementLineID"=p_line returning "FINBankMatch_CashID" into matched_cash;
  if matched_cash is null then raise exception 'No match exists for this statement line.' using errcode='22023'; end if;
  update public."FIN_StatementLines" set "FINStmtLine_MatchStatusCode"='unmatched' where "FINStmtLine_ID"=p_line;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_BankMatches','bank_match',p_line,'unmatch','Bank statement match removed',jsonb_build_object('cashId',matched_cash,'reason',btrim(p_reason)));
  return true;
end; $$;
revoke all on function public.multideck_bank_statement_unmatch(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_bank_statement_unmatch(uuid,uuid,uuid,text) to service_role;

create function public.multideck_bank_statement_control(p_actor uuid,p_entity uuid,p_period uuid,p_bank uuid)
returns jsonb language plpgsql stable set search_path=pg_catalog,public as $$
declare p public."FIN_Periods"; b public."FIN_BankAccounts"; i public."FIN_StatementImports";
  statement_rows integer:=0; unmatched_rows integer:=0; invalid_matches integer:=0; unrepresented_cash integer:=0;
  orphan_bank_lines integer:=0; opening_gl numeric:=0; movement_gl numeric:=0; cash_movement numeric:=0;
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
    where line."FINStmtLine_ImportID"=i."FINStmtImp_ID" and (
      cash."FINCash_ID" is null or cash."FINCash_LegalEntityID"<>p_entity or cash."FINCash_BankAccountID"<>p_bank
      or cash."FINCash_StatusCode" not in ('approved','submitted') or cash."FINCash_NativePostingStatusCode"<>'posted'
      or cash."FINCash_CurrencyCodeSnapshot"<>i.currency_code or cash."FINCash_TransactionDate"<>line."FINStmtLine_TransactionDate"
      or line."FINStmtLine_Amount"<>case when cash."FINCash_TypeCode"='customer_receipt' then cash."FINCash_Amount" when cash."FINCash_TypeCode"='supplier_payment' then -cash."FINCash_Amount" else null end);
  if invalid_matches>0 then issues:=issues||jsonb_build_array('A matched cash transaction changed or is no longer posted.'); end if;
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
  select coalesce(sum(case when period."FINPeriod_EndDate"<p."FINPeriod_StartDate" then line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount" else 0 end),0),
    coalesce(sum(case when period."FINPeriod_ID"=p_period then line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount" else 0 end),0),
    count(*) filter (where period."FINPeriod_ID"=p_period and (line."FINPostLine_CashID" is null or not exists (
      select 1 from public."FIN_BankMatches" match join public."FIN_StatementLines" statement_line on statement_line."FINStmtLine_ID"=match."FINBankMatch_StatementLineID"
      where match."FINBankMatch_CashID"=line."FINPostLine_CashID" and statement_line."FINStmtLine_ImportID"=i."FINStmtImp_ID")))
    into opening_gl,movement_gl,orphan_bank_lines
    from public."FIN_PostingLines" line join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=line."FINPostLine_BatchID"
      join public."FIN_Periods" period on period."FINPeriod_ID"=batch."FINPostBatch_PeriodID" and period."FINPeriod_LegalEntityID"=p_entity
    where batch."FINPostBatch_LegalEntityID"=p_entity and batch."FINPostBatch_StatusCode"='posted'
      and line."FINPostLine_NominalAccountID"=b."FINBank_NominalAccountID" and period."FINPeriod_EndDate"<=p."FINPeriod_EndDate";
  if orphan_bank_lines>0 then issues:=issues||jsonb_build_array('Bank ledger lines lack a matched cash transaction.'); end if;
  if opening_gl<>i.opening_balance or opening_gl+movement_gl<>i.closing_balance or movement_gl<>cash_movement then
    issues:=issues||jsonb_build_array('Statement opening, closing, cash-book and bank-ledger balances differ.');
  end if;
  ready:=jsonb_array_length(issues)=0;
  return jsonb_build_object('status',case when not ready then 'incomplete' when i.verified_at is not null and i.verified_period_id=p_period then 'verified' else 'ready_for_review' end,
    'statementId',i."FINStmtImp_ID",'bankId',p_bank,'periodId',p_period,'currency',i.currency_code,
    'rowCount',statement_rows,'unmatchedRows',unmatched_rows,'invalidMatches',invalid_matches,'unrepresentedCash',unrepresented_cash,'orphanBankLines',orphan_bank_lines,
    'openingStatement',i.opening_balance,'closingStatement',i.closing_balance,'openingLedger',opening_gl,'closingLedger',opening_gl+movement_gl,
    'cashMovement',cash_movement,'ledgerMovement',movement_gl,'issues',issues,'verifiedAt',i.verified_at,'verifiedBy',i.verified_by);
end; $$;
revoke all on function public.multideck_bank_statement_control(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_bank_statement_control(uuid,uuid,uuid,uuid) to service_role;

create function public.multideck_bank_statement_verify(p_actor uuid,p_entity uuid,p_period uuid,p_bank uuid,p_reason text)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare result jsonb; i public."FIN_StatementImports";
begin
  perform public._multideck_bank_statement_access(p_actor,p_entity,'Finance.Banks.Manage');
  if length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'Record a bank reconciliation reason.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_entity::text||p_period::text||p_bank::text,0));
  result:=public.multideck_bank_statement_control(p_actor,p_entity,p_period,p_bank);
  if result->>'status' not in ('ready_for_review','verified') then raise exception 'Bank reconciliation is incomplete.' using errcode='22023'; end if;
  select * into i from public."FIN_StatementImports" where "FINStmtImp_ID"=(result->>'statementId')::uuid for update;
  if i.verified_at is not null then return result; end if;
  update public."FIN_StatementImports" set "FINStmtImp_StatusCode"='verified',verified_period_id=p_period,verified_at=now(),verified_by=p_actor,
    verification_evidence=result||jsonb_build_object('reason',btrim(p_reason)) where "FINStmtImp_ID"=i."FINStmtImp_ID";
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_StatementImports','bank_statement',i."FINStmtImp_ID",'verify','Bank statement reconciled',jsonb_build_object('periodId',p_period,'bankId',p_bank,'reason',btrim(p_reason),'control',result));
  return result||jsonb_build_object('status','verified');
end; $$;
revoke all on function public.multideck_bank_statement_verify(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_bank_statement_verify(uuid,uuid,uuid,uuid,text) to service_role;

commit;
