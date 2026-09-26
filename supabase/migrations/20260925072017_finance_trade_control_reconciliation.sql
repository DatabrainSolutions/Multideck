begin;

-- Compare source-native AR/AP documents and cash with ALL posted movements on
-- their exact control accounts. Unallocated cash remains in the control balance.
-- Local gross amounts are locked posting evidence; source currency is retained
-- separately on each document/cash transaction.
create function public.multideck_finance_trade_control_bridge(p_actor uuid,p_entity uuid,p_period uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_Periods"; v_ar_source numeric:=0; v_ap_source numeric:=0;
  v_ar_gl numeric:=0; v_ap_gl numeric:=0; v_issues integer:=0; v_pending integer:=0;
  v_sources integer:=0; v_issue_rows jsonb:='[]'; v_ar_accounts uuid[]:='{}'; v_ap_accounts uuid[]:='{}';
  v_opening jsonb;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View');
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity;
  if not found then raise exception 'Accounting period not found in this legal entity.' using errcode='P0002'; end if;
  with source as (
    select d."FINDoc_ID" id,'FIN_Documents'::text source_table,
      case when d."FINDoc_TypeCode" in ('sl_invoice','credit_note') then 'ar' else 'ap' end side,
      case when d."FINDoc_TypeCode" in ('credit_note','debit_note') then -abs(d."FINDoc_LocalGrossAmount") else abs(d."FINDoc_LocalGrossAmount") end expected,
      d."FINDoc_NativePostingBatchID" batch_id,d."FINDoc_AccountingDate" accounting_date,d."FINDoc_CurrencyCodeSnapshot" source_currency
    from public."FIN_Documents" d where d."FINDoc_LegalEntityID"=p_entity
      and to_jsonb(d)->>'FINDoc_OpeningBalancePackageID' is null
      and d."FINDoc_AccountingDate"<=v_period."FINPeriod_EndDate" and d."FINDoc_NativePostingStatusCode"='posted'
      and d."FINDoc_TypeCode" in ('sl_invoice','credit_note','pl_invoice','debit_note')
    union all
    select cash."FINCash_ID",'FIN_CashTransactions',
      case when cash."FINCash_TypeCode"='customer_receipt' then 'ar' else 'ap' end,
      -abs(cash."FINCash_LocalAmount"),cash."FINCash_NativePostingBatchID",cash."FINCash_AccountingDate",cash."FINCash_CurrencyCodeSnapshot"
    from public."FIN_CashTransactions" cash where cash."FINCash_LegalEntityID"=p_entity
      and to_jsonb(cash)->>'FINCash_OpeningBalancePackageID' is null
      and cash."FINCash_AccountingDate"<=v_period."FINPeriod_EndDate" and cash."FINCash_NativePostingStatusCode"='posted'
      and cash."FINCash_TypeCode" in ('customer_receipt','supplier_payment')
  ), matched as (
    select s.*,count(line."FINPostLine_BatchID") filter(where nominal."FINNom_IsControlAccount" and nominal."FINNom_LegalEntityID"=p_entity) control_lines,
      (min(line."FINPostLine_NominalAccountID"::text) filter(where nominal."FINNom_IsControlAccount" and nominal."FINNom_LegalEntityID"=p_entity))::uuid account_id,
      coalesce(sum(case when s.side='ar' then line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount"
        else line."FINPostLine_CreditAmount"-line."FINPostLine_DebitAmount" end)
        filter(where nominal."FINNom_IsControlAccount" and nominal."FINNom_LegalEntityID"=p_entity),0) posted_value,
      bool_and(batch."FINPostBatch_StatusCode"='posted' and batch."FINPostBatch_LegalEntityID"=p_entity
        and posting_period."FINPeriod_EndDate"<=v_period."FINPeriod_EndDate"
        and posting_period."FINPeriod_LegalEntityID"=p_entity) correct_period
    from source s
    left join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=s.batch_id
    left join public."FIN_Periods" posting_period on posting_period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
    left join public."FIN_PostingLines" line on line."FINPostLine_BatchID"=s.batch_id
      and ((s.source_table='FIN_Documents' and line."FINPostLine_DocumentID"=s.id and line."FINPostLine_DocumentLineID" is null)
        or (s.source_table='FIN_CashTransactions' and line."FINPostLine_CashID"=s.id and line."FINPostLine_LineNo"=2))
    left join public."FIN_NominalAccounts" nominal on nominal."FINNom_ID"=line."FINPostLine_NominalAccountID"
    group by s.id,s.source_table,s.side,s.expected,s.batch_id,s.accounting_date,s.source_currency
  ), issues as (
    select m.*,m.control_lines<>1 or m.batch_id is null or m.posted_value<>m.expected or m.expected=0
      or coalesce(not m.correct_period,true) as invalid
    from matched m
  ) select coalesce(sum(expected) filter(where side='ar'),0),coalesce(sum(expected) filter(where side='ap'),0),
      count(*)::integer,count(*) filter(where invalid)::integer,
      coalesce(jsonb_agg(jsonb_build_object('sourceTable',source_table,'sourceId',id,'side',side,
        'expected',expected,'posted',posted_value,'controlLines',control_lines,'batchId',batch_id)
        order by accounting_date,id) filter(where invalid),'[]'::jsonb),
      coalesce(array_agg(distinct account_id) filter(where side='ar' and account_id is not null),'{}'::uuid[]),
      coalesce(array_agg(distinct account_id) filter(where side='ap' and account_id is not null),'{}'::uuid[])
    into v_ar_source,v_ap_source,v_sources,v_issues,v_issue_rows,v_ar_accounts,v_ap_accounts from issues;
  select count(*) into v_pending from public."FIN_Documents" d
    where d."FINDoc_LegalEntityID"=p_entity and d."FINDoc_AccountingDate"<=v_period."FINPeriod_EndDate"
      and to_jsonb(d)->>'FINDoc_OpeningBalancePackageID' is null
      and d."FINDoc_StatusCode" in ('approved','submitted') and d."FINDoc_NativePostingStatusCode"<>'posted';
  v_pending:=v_pending+(select count(*) from public."FIN_CashTransactions" cash
    where cash."FINCash_LegalEntityID"=p_entity and cash."FINCash_AccountingDate"<=v_period."FINPeriod_EndDate"
      and to_jsonb(cash)->>'FINCash_OpeningBalancePackageID' is null
      and cash."FINCash_StatusCode" in ('approved','submitted') and cash."FINCash_NativePostingStatusCode"<>'posted');
  -- Explicit control types and account types include configured accounts with
  -- no current open item. A manual journal on one is still a difference.
  select coalesce(array_agg("FINNom_ID") filter(where lower(coalesce("FINNom_ControlTypeCode",'')) in ('trade_receivables','receivables','accounts_receivable')
      or lower("FINNom_AccountTypeCode")='receivable'),'{}'::uuid[]),
    coalesce(array_agg("FINNom_ID") filter(where lower(coalesce("FINNom_ControlTypeCode",'')) in ('trade_payables','payables','accounts_payable')
      or lower("FINNom_AccountTypeCode")='payable'),'{}'::uuid[])
    into v_ar_accounts,v_ap_accounts
    from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=p_entity and "FINNom_IsControlAccount";
  -- Include original control accounts even when their account type is legacy.
  select coalesce(array_agg(distinct account_id) filter(where side='ar'),'{}'::uuid[]),
    coalesce(array_agg(distinct account_id) filter(where side='ap'),'{}'::uuid[])
    into v_ar_accounts,v_ap_accounts from (
      select unnest(v_ar_accounts) account_id,'ar'::text side union all select unnest(v_ap_accounts),'ap'
      union all
      select line."FINPostLine_NominalAccountID",case when d."FINDoc_TypeCode" in ('sl_invoice','credit_note') then 'ar' else 'ap' end
      from public."FIN_Documents" d join public."FIN_PostingLines" line on line."FINPostLine_BatchID"=d."FINDoc_NativePostingBatchID"
        and line."FINPostLine_DocumentID"=d."FINDoc_ID" and line."FINPostLine_DocumentLineID" is null
      where d."FINDoc_LegalEntityID"=p_entity and d."FINDoc_NativePostingStatusCode"='posted' and d."FINDoc_AccountingDate"<=v_period."FINPeriod_EndDate"
        and to_jsonb(d)->>'FINDoc_OpeningBalancePackageID' is null
      union all
      select line."FINPostLine_NominalAccountID",case when cash."FINCash_TypeCode"='customer_receipt' then 'ar' else 'ap' end
      from public."FIN_CashTransactions" cash join public."FIN_PostingLines" line on line."FINPostLine_BatchID"=cash."FINCash_NativePostingBatchID"
        and line."FINPostLine_CashID"=cash."FINCash_ID" and line."FINPostLine_LineNo"=2
      where cash."FINCash_LegalEntityID"=p_entity and cash."FINCash_NativePostingStatusCode"='posted' and cash."FINCash_AccountingDate"<=v_period."FINPeriod_EndDate"
        and to_jsonb(cash)->>'FINCash_OpeningBalancePackageID' is null
    ) accounts;
  if to_regprocedure('public._multideck_finance_opening_trade_control(uuid,uuid)') is not null then
    execute 'select public._multideck_finance_opening_trade_control($1,$2)' into v_opening using p_entity,p_period;
    v_ar_source:=v_ar_source+coalesce((v_opening->>'arSource')::numeric,0);
    v_ap_source:=v_ap_source+coalesce((v_opening->>'apSource')::numeric,0);
    v_sources:=v_sources+coalesce((v_opening->>'sourceCount')::integer,0);
    v_issues:=v_issues+coalesce((v_opening->>'issueCount')::integer,0);
    v_issue_rows:=v_issue_rows||coalesce(v_opening->'issues','[]'::jsonb);
    select coalesce(array_agg(distinct account_id),'{}'::uuid[]) into v_ar_accounts from (
      select unnest(v_ar_accounts) account_id union all
      select value::text::uuid from jsonb_array_elements_text(coalesce(v_opening->'arAccountIds','[]'::jsonb)) value) accounts;
    select coalesce(array_agg(distinct account_id),'{}'::uuid[]) into v_ap_accounts from (
      select unnest(v_ap_accounts) account_id union all
      select value::text::uuid from jsonb_array_elements_text(coalesce(v_opening->'apAccountIds','[]'::jsonb)) value) accounts;
  end if;
  if v_ar_accounts && v_ap_accounts then v_issues:=v_issues+1; v_issue_rows:=v_issue_rows||jsonb_build_array(jsonb_build_object('reason','shared_ar_ap_control_account')); end if;
  select coalesce(sum(line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount") filter(where line."FINPostLine_NominalAccountID"=any(v_ar_accounts)),0),
    coalesce(sum(line."FINPostLine_CreditAmount"-line."FINPostLine_DebitAmount") filter(where line."FINPostLine_NominalAccountID"=any(v_ap_accounts)),0)
    into v_ar_gl,v_ap_gl
    from public."FIN_PostingLines" line join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=line."FINPostLine_BatchID"
    join public."FIN_Periods" posting_period on posting_period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
    where batch."FINPostBatch_LegalEntityID"=p_entity and batch."FINPostBatch_StatusCode"='posted'
      and posting_period."FINPeriod_EndDate"<=v_period."FINPeriod_EndDate";
  return jsonb_build_object('status',case when v_issues=0 and v_pending=0 and v_ar_source=v_ar_gl and v_ap_source=v_ap_gl then 'verified' else 'unreconciled' end,
    'legalEntityId',p_entity,'periodId',p_period,'sourceCount',v_sources,'unpostedApprovedCount',v_pending,
    'ar',jsonb_build_object('source',v_ar_source,'control',v_ar_gl,'difference',v_ar_source-v_ar_gl,'accountIds',to_jsonb(v_ar_accounts)),
    'ap',jsonb_build_object('source',v_ap_source,'control',v_ap_gl,'difference',v_ap_source-v_ap_gl,'accountIds',to_jsonb(v_ap_accounts)),
    'issueCount',v_issues,'issues',v_issue_rows);
end; $$;
revoke all on function public.multideck_finance_trade_control_bridge(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_trade_control_bridge(uuid,uuid,uuid) to service_role;

commit;
