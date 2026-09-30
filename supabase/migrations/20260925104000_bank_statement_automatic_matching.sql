begin;

-- A policy may remove routine matching work, but never relax the bank or GL
-- control. Every automatic pair is unique, exact, posted, and auditable.
create function public._multideck_bank_statement_match_status() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare v_import uuid; v_status text;
begin
  select "FINStmtLine_ImportID" into v_import from public."FIN_StatementLines"
    where "FINStmtLine_ID"=case when tg_op='DELETE' then old."FINBankMatch_StatementLineID" else new."FINBankMatch_StatementLineID" end;
  if v_import is null then return null; end if;
  v_status:=case when exists(
    select 1 from public."FIN_StatementLines" line
    where line."FINStmtLine_ImportID"=v_import and not exists(
      select 1 from public."FIN_BankMatches" match where match."FINBankMatch_StatementLineID"=line."FINStmtLine_ID")
  ) then 'imported' else 'matched' end;
  update public."FIN_StatementImports" set "FINStmtImp_StatusCode"=v_status
    where "FINStmtImp_ID"=v_import and verified_at is null and "FINStmtImp_StatusCode"<>v_status;
  return null;
end; $$;
revoke all on function public._multideck_bank_statement_match_status() from public,anon,authenticated;
create trigger bank_statement_match_status after insert or delete on public."FIN_BankMatches"
  for each row execute function public._multideck_bank_statement_match_status();

create function public.multideck_bank_statement_auto_match(p_actor uuid,p_entity uuid,p_import uuid)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare v_import public."FIN_StatementImports"; v_line public."FIN_StatementLines";
  v_cash uuid; v_candidate_count integer; v_line_count integer; v_matched integer:=0;
  v_review integer; v_policy jsonb; v_company uuid; v_exceptions jsonb:='[]'::jsonb;
  v_reason text;
begin
  perform public._multideck_bank_statement_access(p_actor,p_entity,'Finance.Banks.Manage');
  select e."Company_ID" into v_company from public."cmp_LegalEntities" e where e."LegalEntity_ID"=p_entity and e."LegalEntity_IsActive";
  select * into v_import from public."FIN_StatementImports"
    where "FINStmtImp_ID"=p_import and legal_entity_id=p_entity for update;
  if not found then raise exception 'Statement import not found in this legal entity.' using errcode='P0002'; end if;
  if v_import.verified_at is not null then
    return jsonb_build_object('matched',0,'requiresReview',0,'status','verified');
  end if;
  for v_line in
    select line.* from public."FIN_StatementLines" line
    where line."FINStmtLine_ImportID"=p_import and line."FINStmtLine_MatchStatusCode"='unmatched'
    order by line."FINStmtLine_LineNo" for update
  loop
    v_policy:=null;
    -- Posted cash alone is insufficient: require its bank nominal GL line to
    -- carry the same signed amount in the statement period.
    select count(*),min(cash."FINCash_ID"::text)::uuid into v_candidate_count,v_cash
    from public."FIN_CashTransactions" cash
    where cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_BankAccountID"=v_import."FINStmtImp_BankAccountID"
      and cash."FINCash_CurrencyCodeSnapshot"=v_import.currency_code
      and cash."FINCash_TransactionDate"=v_line."FINStmtLine_TransactionDate"
      and cash."FINCash_AccountingDate" between v_import."FINStmtImp_StatementDateFrom" and v_import."FINStmtImp_StatementDateTo"
      and cash."FINCash_StatusCode" in ('approved','submitted')
      and cash."FINCash_NativePostingStatusCode"='posted'
      and cash."FINCash_TypeCode" in ('customer_receipt','supplier_payment')
      and (case when cash."FINCash_TypeCode"='customer_receipt' then cash."FINCash_Amount" else -cash."FINCash_Amount" end)=v_line."FINStmtLine_Amount"
      and not exists(select 1 from public."FIN_BankMatches" match where match."FINBankMatch_CashID"=cash."FINCash_ID")
      and exists(
        select 1 from public."FIN_PostingLines" posting
        join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=posting."FINPostLine_BatchID"
        join public."FIN_Periods" period on period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
        join public."FIN_BankAccounts" bank on bank."FINBank_ID"=cash."FINCash_BankAccountID"
        where posting."FINPostLine_CashID"=cash."FINCash_ID"
          and posting."FINPostLine_NominalAccountID"=bank."FINBank_NominalAccountID"
          and batch."FINPostBatch_LegalEntityID"=p_entity and batch."FINPostBatch_StatusCode"='posted'
          and period."FINPeriod_LegalEntityID"=p_entity
          and period."FINPeriod_StartDate"=v_import."FINStmtImp_StatementDateFrom"
          and period."FINPeriod_EndDate"=v_import."FINStmtImp_StatementDateTo"
          and period."FINPeriod_BaseCurrencyCode"=v_import.currency_code
        having sum(posting."FINPostLine_DebitAmount"-posting."FINPostLine_CreditAmount")=v_line."FINStmtLine_Amount"
      );
    v_reason:=case when v_candidate_count=0 then 'no_exact_posted_cash'
      when v_candidate_count>1 then 'ambiguous_cash_candidates' else null end;
    if v_candidate_count=1 then
      select count(*) into v_line_count from public."FIN_StatementLines" competing
      where competing."FINStmtLine_ImportID"=p_import and competing."FINStmtLine_MatchStatusCode"='unmatched'
        and competing."FINStmtLine_TransactionDate"=v_line."FINStmtLine_TransactionDate"
        and competing."FINStmtLine_Amount"=v_line."FINStmtLine_Amount";
      if v_line_count<>1 then v_reason:='ambiguous_statement_lines'; end if;
    end if;
    if v_reason is null then
      v_policy:=public.multideck_finance_approval_decision(v_company,p_entity,'bank_match',abs(v_line."FINStmtLine_Amount"),
        jsonb_build_object('hardException',false,'advisoryException',false,'variancePercent',0));
      if v_policy->>'canAuto' is distinct from 'true' then v_reason:='policy_review_'||coalesce(v_policy->>'reason','unknown'); end if;
    end if;
    if v_reason is null then
      insert into public."FIN_BankMatches"("FINBankMatch_StatementLineID","FINBankMatch_CashID","FINBankMatch_MatchTypeCode",
        "FINBankMatch_ConfidenceScore","FINBankMatch_MatchedBy","FINBankMatch_Notes")
      values(v_line."FINStmtLine_ID",v_cash,'automatic',1,null,
        'Exact unique posted cash and bank ledger match; policy revision '||(v_policy->>'revision'))
      on conflict do nothing;
      if found then
        update public."FIN_StatementLines" set "FINStmtLine_MatchStatusCode"='matched'
          where "FINStmtLine_ID"=v_line."FINStmtLine_ID";
        v_matched:=v_matched+1;
        insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
          "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
          "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
        values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_BankMatches','bank_match',
          v_line."FINStmtLine_ID",'auto_match','Bank statement line matched automatically',
          jsonb_build_object('cashId',v_cash,'statementId',p_import,'criteria','unique_exact_posted_bank_gl',
            'policyId',v_policy->>'policyId','policyRevision',v_policy->>'revision','policyDecision',v_policy));
      else
        v_reason:='already_matched_concurrently';
      end if;
    end if;
    if v_reason is not null then
      v_exceptions:=v_exceptions||jsonb_build_array(jsonb_build_object('lineId',v_line."FINStmtLine_ID",
        'lineNo',v_line."FINStmtLine_LineNo",'reason',v_reason,'policyDecision',v_policy));
    end if;
  end loop;
  v_review:=jsonb_array_length(v_exceptions);
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_StatementImports','bank_statement',
    p_import,'auto_match_run','Bank statement automatic matching evaluated',
    jsonb_build_object('matched',v_matched,'requiresReview',v_review,'exceptions',v_exceptions));
  return jsonb_build_object('matched',v_matched,'requiresReview',v_review,'exceptions',v_exceptions);
end; $$;
revoke all on function public.multideck_bank_statement_auto_match(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_bank_statement_auto_match(uuid,uuid,uuid) to service_role;

create function public.multideck_bank_statement_import_with_auto(
  p_actor uuid,p_entity uuid,p_bank uuid,p_file_name text,p_file_hash text,p_input jsonb
) returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare v_import jsonb; v_matching jsonb;
begin
  v_import:=public.multideck_bank_statement_import(p_actor,p_entity,p_bank,p_file_name,p_file_hash,p_input);
  v_matching:=public.multideck_bank_statement_auto_match(p_actor,p_entity,(v_import->>'id')::uuid);
  return v_import||jsonb_build_object('automaticMatching',v_matching);
end; $$;
revoke all on function public.multideck_bank_statement_import_with_auto(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_bank_statement_import_with_auto(uuid,uuid,uuid,text,text,jsonb) to service_role;

create or replace function public.multideck_dexter_domain_bank_reconciliation(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(item),'[]'::jsonb) from (
    select jsonb_build_object('recordId',bank."FINBank_ID",'recordKind','bank_reconciliation','title',bank."FINBank_Name",
      'bankCode',bank."FINBank_Code",'currency',bank."FINBank_CurrencyCode",'savedStatus',statement."FINStmtImp_StatusCode",
      'statementId',statement."FINStmtImp_ID",'periodId',statement.verified_period_id,
      'coverageFrom',statement."FINStmtImp_StatementDateFrom",'coverageTo',statement."FINStmtImp_StatementDateTo",
      'rowCount',statement."FINStmtImp_RowCount",'matchedRows',matches.matched_rows,
      'automaticMatches',matches.automatic_rows,'reviewRows',statement."FINStmtImp_RowCount"-matches.matched_rows,
      'verifiedAt',statement.verified_at,'route','/finance/bank-reconciliation',
      'evidence',jsonb_build_object('sourceTable','FIN_StatementImports','sourceId',statement."FINStmtImp_ID",
        'legalEntityId',entity."LegalEntity_ID",'sourceHash',statement."FINStmtImp_FileHashSHA256",
        'updatedAt',coalesce(statement.verified_at,statement."FINStmtImp_ImportedAt"))) item
    from public."FIN_BankAccounts" bank join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=bank."FINBank_LegalEntityID"
      join lateral (select * from public."FIN_StatementImports" imported where imported."FINStmtImp_BankAccountID"=bank."FINBank_ID"
        and imported.legal_entity_id=entity."LegalEntity_ID" order by imported."FINStmtImp_ImportedAt" desc limit 1) statement on true
      cross join lateral (select count(*)::integer matched_rows,
        count(*) filter (where match."FINBankMatch_MatchTypeCode"='automatic')::integer automatic_rows
        from public."FIN_StatementLines" line join public."FIN_BankMatches" match
          on match."FINBankMatch_StatementLineID"=line."FINStmtLine_ID"
        where line."FINStmtLine_ImportID"=statement."FINStmtImp_ID") matches
    where entity."Company_ID"=p_company_id and entity."LegalEntity_IsActive"
      and (nullif(btrim(p_search),'') is null or concat_ws(' ',bank."FINBank_Code",bank."FINBank_Name",statement."FINStmtImp_StatusCode") ilike '%'||btrim(p_search)||'%')
    order by statement."FINStmtImp_ImportedAt" desc limit greatest(1,least(coalesce(p_take,10),25))
  ) rows;
$$;

update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description"=
  'Saved statement imports, automatic and manual match evidence, and sign-off. Matching can run automatically only within the configured entity policy for unique exact posted cash and bank ledger pairs. Ambiguities and differences require review. Recheck the live control before claiming the bank and ledger agree.'
  where "AIDexterDomain_Code"='bank_reconciliation';
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Description"=
  'Saved statement import, fully matched and verification status changes. Automatic matching needs an eligible entity policy and exact posted evidence; later postings require a live control recheck.'
  where "AIDexterWatchCapability_Code"='bank_reconciliation';

commit;
