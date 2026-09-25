begin;

-- Reclassify only native, bank-matched settlements of accepted earlier Cash
-- returns. A generic journal, missing bank match, or Standard transition
-- remains visible and blocking in the Cash control bridge.
alter function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  rename to _multideck_uk_vat_cash_control_source_inventory_before_settlements;
revoke all on function public._multideck_uk_vat_cash_control_source_inventory_before_settlements(
  uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_control_source_inventory(
  p_actor uuid,p_entity uuid,p_period uuid,p_projection uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_source jsonb; v_start date; v_end date; v_settlements jsonb;
  v_total integer; v_valid integer; v_current_count integer;
  v_opening numeric; v_current numeric;
  v_ledger jsonb; v_balance jsonb; v_ledger_lines jsonb; v_balance_lines jsonb;
  v_ledger_unresolved integer; v_balance_opening_unclassified integer;
  v_balance_current_unclassified integer; v_ledger_digest text;
  v_balance_digest text; v_settlement_digest text; v_ledger_status text;
  v_balance_status text;
begin
  v_source:=public._multideck_uk_vat_cash_control_source_inventory_before_settlements(
    p_actor,p_entity,p_period,p_projection);
  if v_source->>'truncated'='true' then
    return v_source||jsonb_build_object('settlements',null,'sourceDigest',null);
  end if;
  v_start:=(v_source#>>'{context,periodStart}')::date;
  v_end:=(v_source#>>'{context,periodEnd}')::date;
  if v_start is null or v_end is null or v_start>v_end then
    raise exception 'Cash VAT settlement bridge requires one valid period.' using errcode='22023';
  end if;
  with candidates as materialized (
    select settlement.id,settlement.attempt_id,settlement.statement_line_id,
      settlement.vat_posting_line_id,settlement.bank_posting_line_id,
      settlement.posting_batch_id,settlement.amount_gbp,settlement.direction,
      settlement.accounting_period_id,statement."FINStmtLine_TransactionDate" statement_date,
      accounting."FINPeriod_StartDate" accounting_start,
      accounting."FINPeriod_EndDate" accounting_end,
      batch."FINPostBatch_StatusCode" batch_status,
      batch."FINPostBatch_LegalEntityID" batch_entity,
      batch."FINPostBatch_SourceTable" batch_source,
      batch."FINPostBatch_SourceID" batch_source_id,
      batch."FINPostBatch_PeriodID" batch_period,
      vat_line."FINPostLine_BatchID" vat_batch,
      vat_line."FINPostLine_NominalAccountID" vat_nominal,
      vat_line."FINPostLine_DebitAmount" vat_debit,
      vat_line."FINPostLine_CreditAmount" vat_credit,
      bank_line."FINPostLine_BatchID" bank_batch,
      bank_line."FINPostLine_NominalAccountID" bank_nominal,
      bank_line."FINPostLine_DebitAmount" bank_debit,
      bank_line."FINPostLine_CreditAmount" bank_credit,
      statement."FINStmtLine_Amount" statement_amount,
      statement."FINStmtLine_CurrencyCodeSnapshot" statement_currency,
      statement."FINStmtLine_MatchStatusCode" match_status,
      imported.legal_entity_id import_entity,
      imported."FINStmtImp_BankAccountID" import_bank,
      imported.currency_code import_currency,
      bank."FINBank_NominalAccountID" mapped_bank_nominal,
      bank."FINBank_LegalEntityID" bank_entity,
      match."FINBankMatch_ID" match_id,
      match."FINBankMatch_CashID" match_cash,
      match."FINBankMatch_MatchTypeCode" match_type,
      attempt.status attempt_status,
      attempt.environment attempt_environment,
      attempt.period_id vat_period_id,
      vat_period.legal_entity_id vat_period_entity,
      vat_period.scheme_code vat_scheme
    from public."FIN_HmrcVatSettlements" settlement
    join public."FIN_StatementLines" statement
      on statement."FINStmtLine_ID"=settlement.statement_line_id
    left join public."FIN_Periods" accounting
      on accounting."FINPeriod_ID"=settlement.accounting_period_id
    left join public."FIN_PostingBatches" batch
      on batch."FINPostBatch_ID"=settlement.posting_batch_id
    left join public."FIN_PostingLines" vat_line
      on vat_line."FINPostLine_ID"=settlement.vat_posting_line_id
    left join public."FIN_PostingLines" bank_line
      on bank_line."FINPostLine_ID"=settlement.bank_posting_line_id
    left join public."FIN_StatementImports" imported
      on imported."FINStmtImp_ID"=statement."FINStmtLine_ImportID"
    left join public."FIN_BankAccounts" bank
      on bank."FINBank_ID"=settlement.bank_account_id
    left join public."FIN_BankMatches" match
      on match.vat_settlement_id=settlement.id
    left join public."FIN_HmrcVatSubmissionAttempts" attempt
      on attempt.id=settlement.attempt_id
    left join public."FIN_IndirectTaxPeriods" vat_period
      on vat_period.id=attempt.period_id
    where settlement.legal_entity_id=p_entity
      and settlement.posting_batch_id is not null
      and statement."FINStmtLine_TransactionDate"<=v_end
  ), checked as materialized (
    select candidate.*,
      candidate.batch_status='posted'
      and candidate.batch_entity=p_entity
      and candidate.batch_source='FIN_HmrcVatSettlements'
      and candidate.batch_source_id=candidate.id
      and candidate.batch_period=candidate.accounting_period_id
      and candidate.accounting_end<=v_end
      and candidate.accounting_start<=candidate.statement_date
      and candidate.accounting_end>=candidate.statement_date
      and candidate.vat_batch=candidate.posting_batch_id
      and candidate.bank_batch=candidate.posting_batch_id
      and candidate.vat_debit-candidate.vat_credit=
        case when candidate.direction='payment' then candidate.amount_gbp
          else -candidate.amount_gbp end
      and candidate.bank_debit-candidate.bank_credit=
        case when candidate.direction='payment' then -candidate.amount_gbp
          else candidate.amount_gbp end
      and candidate.vat_nominal in (
        select nominal."FINNom_ID" from public."FIN_NominalAccounts" nominal
          where nominal."FINNom_LegalEntityID"=p_entity
            and lower(coalesce(nominal."FINNom_ControlTypeCode",'')) like '%vat%')
      and candidate.bank_nominal=candidate.mapped_bank_nominal
      and candidate.bank_entity=p_entity
      and candidate.import_entity=p_entity
      and candidate.import_bank in (
        select bank."FINBank_ID" from public."FIN_BankAccounts" bank
          where bank."FINBank_ID"=candidate.import_bank
            and bank."FINBank_LegalEntityID"=p_entity)
      and candidate.import_currency='GBP' and candidate.statement_currency='GBP'
      and candidate.statement_amount=candidate.bank_debit-candidate.bank_credit
      and candidate.match_status='matched' and candidate.match_id is not null
      and candidate.match_cash is null and candidate.match_type='vat_settlement'
      and candidate.attempt_status in ('accepted','accepted_readback')
      and candidate.attempt_environment='production'
      and candidate.vat_period_entity=p_entity and candidate.vat_scheme='cash'
      and exists(select 1 from jsonb_array_elements(v_source#>'{acceptedHistory,periods}') prior(value)
        where prior.value->>'attemptId'=candidate.attempt_id::text
          and prior.value->>'periodId'=candidate.vat_period_id::text
          and prior.value->>'status'='accepted') valid
    from candidates candidate
  )
  select count(*)::integer,count(*) filter (where valid)::integer,
    count(*) filter (where valid and accounting_end>=v_start)::integer,
    coalesce(sum(vat_credit-vat_debit) filter
      (where valid and accounting_end<v_start),0),
    coalesce(sum(vat_credit-vat_debit) filter
      (where valid and accounting_end>=v_start),0),
    coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'attemptId',attempt_id,'statementLineId',statement_line_id,
      'vatPostingLineId',vat_posting_line_id,'bankPostingLineId',bank_posting_line_id,
      'postingBatchId',posting_batch_id,'amountGbp',amount_gbp::text,
      'direction',direction,'accountingPeriodId',accounting_period_id,
      'accountingEnd',accounting_end,'valid',coalesce(valid,false))
      order by accounting_end,id),'[]'::jsonb)
    into v_total,v_valid,v_current_count,v_opening,v_current,v_settlements
  from checked;
  v_settlement_digest:=encode(sha256(convert_to(v_settlements::text,'UTF8')),'hex');
  v_ledger:=v_source->'ledgerMovements';
  v_balance:=v_source->'controlBalance';
  select coalesce(jsonb_agg(case when exists(
      select 1 from jsonb_array_elements(v_settlements) settlement(value)
        where settlement.value->>'valid'='true'
          and settlement.value->>'vatPostingLineId'=line.value->>'id')
      and line.value->>'classification'='unsupported'
      then line.value||jsonb_build_object('classification','accepted_hmrc_settlement')
      else line.value end order by line.value->>'id'),'[]'::jsonb)
    into v_ledger_lines
  from jsonb_array_elements(v_ledger->'lines') line(value);
  select coalesce(jsonb_agg(case when exists(
      select 1 from jsonb_array_elements(v_settlements) settlement(value)
        where settlement.value->>'valid'='true'
          and settlement.value->>'vatPostingLineId'=line.value->>'id')
      and line.value->>'classification'='unclassified'
      then line.value||jsonb_build_object('classification','accepted_hmrc_settlement')
      else line.value end order by line.value->>'accountingStart',line.value->>'id'),'[]'::jsonb)
    into v_balance_lines
  from jsonb_array_elements(v_balance->'lines') line(value);
  select count(*) filter (where value->>'classification'='unsupported')::integer
    into v_ledger_unresolved from jsonb_array_elements(v_ledger_lines);
  select count(*) filter (where value->>'phase'='opening'
      and value->>'classification'='unclassified')::integer,
    count(*) filter (where value->>'phase'='current'
      and value->>'classification'='unclassified')::integer
    into v_balance_opening_unclassified,v_balance_current_unclassified
  from jsonb_array_elements(v_balance_lines);
  v_ledger:=v_ledger||jsonb_build_object('lines',v_ledger_lines,
    'unresolvedLines',v_ledger_unresolved,
    'acceptedSettlementLines',v_current_count);
  v_ledger_digest:=encode(sha256(convert_to((v_ledger-'digest'-'status')::text,'UTF8')),'hex');
  v_ledger_status:=case when v_total=v_valid and v_ledger_unresolved=0
    and (v_ledger->>'duplicateSourcePostingReferences')::integer=0
    and (v_ledger->>'partialAccountingPeriods')::integer=0
    and (v_ledger->>'invalidAccountingPeriodTaxLines')::integer=0
    and (v_ledger->>'invalidSourcePeriodLinks')::integer=0
    and (v_ledger->>'matchedInvoiceLines')::integer=(v_ledger->>'expectedPostingCount')::integer
    and (v_ledger->>'lineCount')::integer=
      (v_ledger->>'matchedInvoiceLines')::integer
      +(v_ledger->>'verifiedOpeningExcludedLines')::integer+v_current_count
    and (v_ledger->>'postedOutputVatGbp')::numeric=
      (v_ledger->>'expectedOutputVatGbp')::numeric
    and (v_ledger->>'postedInputVatGbp')::numeric=
      (v_ledger->>'expectedInputVatGbp')::numeric
    and v_source#>>'{accountingControls,status}'='verified'
    then 'period_movements_matched' else 'blocked' end;
  v_ledger:=v_ledger||jsonb_build_object('digest',v_ledger_digest,'status',v_ledger_status);
  v_balance:=v_balance||jsonb_build_object('lines',v_balance_lines,
    'unclassifiedOpeningLines',v_balance_opening_unclassified,
    'unclassifiedPeriodLines',v_balance_current_unclassified,
    'openingSettlementNetCreditGbp',v_opening::text,
    'periodSettlementNetCreditGbp',v_current::text);
  v_balance_digest:=encode(sha256(convert_to((v_balance-'digest'-'status')::text,'UTF8')),'hex');
  v_balance_status:=case when v_total=v_valid
    and v_balance_opening_unclassified=0 and v_balance_current_unclassified=0
    and (v_balance->>'invalidAccountingPeriodLines')::integer=0
    and (v_balance->>'openingNetCreditGbp')::numeric
      +(v_balance->>'periodNetCreditGbp')::numeric
      =(v_balance->>'closingNetCreditGbp')::numeric
    and (v_balance->>'periodNetCreditGbp')::numeric
      =(v_balance->>'periodInvoiceNetCreditGbp')::numeric
        +(v_balance->>'periodPackageNetCreditGbp')::numeric+v_current
    and v_ledger_status='period_movements_matched'
    then 'balance_rollforward_matched' else 'blocked' end;
  v_balance:=v_balance||jsonb_build_object('digest',v_balance_digest,
    'status',v_balance_status);
  return v_source||jsonb_build_object('ledgerMovements',v_ledger,
    'controlBalance',v_balance,
    'settlements',jsonb_build_object('count',v_total,'validCount',v_valid,
      'openingNetCreditGbp',v_opening::text,
      'periodNetCreditGbp',v_current::text,
      'lines',v_settlements,'digest',v_settlement_digest,
      'status',case when v_total=v_valid then 'verified' else 'blocked' end),
    'sourceDigest',case when v_source->>'sourceDigest' is null then null else
      encode(sha256(convert_to(jsonb_build_object(
        'priorSourceDigest',v_source->>'sourceDigest',
        'ledgerDigest',v_ledger_digest,'balanceDigest',v_balance_digest,
        'settlementDigest',v_settlement_digest)::text,'UTF8')),'hex') end,
    'status','cash_control_source_only','returnReady',false);
end; $$;
revoke all on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  to service_role;

commit;
