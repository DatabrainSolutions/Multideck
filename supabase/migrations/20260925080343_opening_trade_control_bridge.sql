begin;

-- Opening operational items are one-to-many evidence for a single CargoWise
-- trial-balance batch. Count their carrying values once, then compare each
-- control account to the corresponding native opening line. Ordinary invoices
-- and cash continue through one-to-one native source checks.
create function public._multideck_finance_opening_trade_control(p_entity uuid,p_period uuid)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare v_period public."FIN_Periods"; package public."FIN_OpeningBalancePackages";
  item public."FIN_OpeningSourceItems"; account record; v_doc record; v_cash record;
  v_side text; v_sign integer; v_ar numeric:=0; v_ap numeric:=0; v_gl numeric; v_source numeric;
  v_count integer:=0; v_package_count integer; v_issues jsonb:='[]'; v_issue_count integer:=0;
  v_ar_accounts uuid[]:='{}'; v_ap_accounts uuid[]:='{}'; v_fx record;
begin
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity;
  if not found then raise exception 'Opening reconciliation period is outside this legal entity.' using errcode='P0002'; end if;
  for package in select * from public."FIN_OpeningBalancePackages" where legal_entity_id=p_entity
    and status='posted' and opening_date<=v_period."FINPeriod_EndDate" order by opening_date,id loop
    if package.package_kind<>'full_open_items' then continue; end if;
    select count(*) into v_package_count from public."FIN_OpeningSourceItems" where package_id=package.id;
    if v_package_count<>package.source_items_count or v_package_count=0 then
      v_issue_count:=v_issue_count+1;
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('reason','opening_source_count','packageId',package.id,
        'expected',package.source_items_count,'actual',v_package_count));
    end if;
    if not exists(select 1 from public."FIN_PostingBatches" b join public."FIN_Periods" p on p."FINPeriod_ID"=b."FINPostBatch_PeriodID"
      where b."FINPostBatch_ID"=package.posting_batch_id and b."FINPostBatch_LegalEntityID"=p_entity
        and b."FINPostBatch_SourceTable"='FIN_OpeningBalancePackages' and b."FINPostBatch_SourceID"=package.id
        and b."FINPostBatch_StatusCode"='posted' and p."FINPeriod_LegalEntityID"=p_entity
        and p."FINPeriod_EndDate"<=v_period."FINPeriod_EndDate") then
      v_issue_count:=v_issue_count+1;
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('reason','opening_batch_not_posted','packageId',package.id));
    end if;
    for item in select * from public."FIN_OpeningSourceItems" where package_id=package.id order by source_row_number loop
      v_count:=v_count+1;
      v_side:=case when item.kind like 'customer_%' then 'ar' else 'ap' end;
      v_sign:=case when item.kind in ('customer_invoice','supplier_invoice') then 1 else -1 end;
      if v_side='ar' then
        v_ar:=v_ar+v_sign*item.outstanding_base_amount;
        v_ar_accounts:=array_append(v_ar_accounts,item.control_nominal_id);
      else
        v_ap:=v_ap+v_sign*item.outstanding_base_amount;
        v_ap_accounts:=array_append(v_ap_accounts,item.control_nominal_id);
      end if;
      if item.outstanding_base_amount>item.original_base_amount
        or not exists(select 1 from public."FIN_NominalAccounts" n where n."FINNom_ID"=item.control_nominal_id
          and n."FINNom_LegalEntityID"=p_entity and n."FINNom_IsControlAccount"
          and lower(n."FINNom_AccountTypeCode")=case when v_side='ar' then 'receivable' else 'payable' end) then
        v_issue_count:=v_issue_count+1;
        v_issues:=v_issues||jsonb_build_array(jsonb_build_object('reason','opening_item_control_or_amount','itemId',item.id));
      end if;
      if item.operational_document_id is not null then
        select d."FINDoc_LegalEntityID" entity,d."FINDoc_OpeningBalancePackageID" marker,
          d."FINDoc_NativePostingBatchID" batch_id,d."FINDoc_NativePostingStatusCode" native_status,
          d."FINDoc_TypeCode" kind,d."FINDoc_PartyOrgID" party_id,d."FINDoc_CurrencyCodeSnapshot" currency,
          d."FINDoc_LocalOutstandingAmount" outstanding_local into v_doc from public."FIN_Documents" d
          where d."FINDoc_ID"=item.operational_document_id;
        if not found or v_doc.entity is distinct from p_entity or v_doc.marker is distinct from package.id
          or v_doc.batch_id is distinct from package.posting_batch_id or v_doc.native_status<>'posted'
          or v_doc.party_id is distinct from item.party_org_id or v_doc.currency is distinct from item.currency_code
          or v_doc.kind is distinct from (case item.kind when 'customer_invoice' then 'sl_invoice'
            when 'customer_credit' then 'credit_note' when 'supplier_invoice' then 'pl_invoice'
            when 'supplier_credit' then 'debit_note' end)
          or v_doc.outstanding_local<0 or v_doc.outstanding_local>item.outstanding_base_amount then
          v_issue_count:=v_issue_count+1;
          v_issues:=v_issues||jsonb_build_array(jsonb_build_object('reason','opening_document_link_or_carrying','itemId',item.id));
        end if;
      else
        select cash."FINCash_LegalEntityID" entity,cash."FINCash_OpeningBalancePackageID" marker,
          cash."FINCash_NativePostingBatchID" batch_id,cash."FINCash_NativePostingStatusCode" native_status,
          cash."FINCash_TypeCode" kind,cash."FINCash_PartyOrgID" party_id,cash."FINCash_CurrencyCodeSnapshot" currency,
          cash."FINCash_LocalUnallocatedAmount" unallocated_local into v_cash from public."FIN_CashTransactions" cash
          where cash."FINCash_ID"=item.operational_cash_id;
        if not found or v_cash.entity is distinct from p_entity or v_cash.marker is distinct from package.id
          or v_cash.batch_id is distinct from package.posting_batch_id or v_cash.native_status<>'posted'
          or v_cash.party_id is distinct from item.party_org_id or v_cash.currency is distinct from item.currency_code
          or v_cash.kind is distinct from item.kind or v_cash.unallocated_local<0
          or v_cash.unallocated_local>item.outstanding_base_amount then
          v_issue_count:=v_issue_count+1;
          v_issues:=v_issues||jsonb_build_array(jsonb_build_object('reason','opening_cash_link_or_carrying','itemId',item.id));
        end if;
      end if;
    end loop;
    for account in select source.control_nominal_id,source.side,source.carried from (
      select i.control_nominal_id,case when i.kind like 'customer_%' then 'ar' else 'ap' end side,
        sum(case when i.kind in ('customer_invoice','supplier_invoice') then i.outstanding_base_amount
          else -i.outstanding_base_amount end) carried
      from public."FIN_OpeningSourceItems" i where i.package_id=package.id
      group by i.control_nominal_id,case when i.kind like 'customer_%' then 'ar' else 'ap' end
    ) source loop
      select coalesce(sum(case when account.side='ar' then l."FINPostLine_DebitAmount"-l."FINPostLine_CreditAmount"
        else l."FINPostLine_CreditAmount"-l."FINPostLine_DebitAmount" end),0) into v_gl
        from public."FIN_PostingLines" l where l."FINPostLine_BatchID"=package.posting_batch_id
          and l."FINPostLine_NominalAccountID"=account.control_nominal_id;
      if v_gl is distinct from account.carried then
        v_issue_count:=v_issue_count+1;
        v_issues:=v_issues||jsonb_build_array(jsonb_build_object('reason','opening_control_mismatch','packageId',package.id,
          'accountId',account.control_nominal_id,'side',account.side,'source',account.carried,'posted',v_gl));
      end if;
    end loop;
    -- Existing cash approval records allocated local value at the document
    -- rate. A different cash rate requires a posted realised-FX true-up; until
    -- that path is evidenced, the opening control remains unreconciled.
    for v_fx in select a."FINCashAlloc_ID" id,a."FINCashAlloc_LocalAllocatedAmount" document_local,
        round(a."FINCashAlloc_AllocatedAmount"*cash."FINCash_ExchangeRate",4) cash_local
      from public."FIN_OpeningSourceItems" i
      join public."FIN_CashAllocations" a on a."FINCashAlloc_DocumentID"=i.operational_document_id
        and a."FINCashAlloc_AllocationStatusCode"='allocated'
      join public."FIN_CashTransactions" cash on cash."FINCash_ID"=a."FINCashAlloc_CashID"
      where i.package_id=package.id and i.operational_document_id is not null
        and cash."FINCash_NativePostingStatusCode"='posted'
        and cash."FINCash_AccountingDate"<=v_period."FINPeriod_EndDate"
        and a."FINCashAlloc_AllocatedAt"::date<=v_period."FINPeriod_EndDate"
        and a."FINCashAlloc_LocalAllocatedAmount" is distinct from round(a."FINCashAlloc_AllocatedAmount"*cash."FINCash_ExchangeRate",4)
    loop
      v_issue_count:=v_issue_count+1;
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('reason','opening_allocation_fx_trueup_required',
        'allocationId',v_fx.id,'documentLocal',v_fx.document_local,'cashLocal',v_fx.cash_local));
    end loop;
  end loop;
  select coalesce(array_agg(distinct a),'{}'::uuid[]) into v_ar_accounts from unnest(v_ar_accounts) a;
  select coalesce(array_agg(distinct a),'{}'::uuid[]) into v_ap_accounts from unnest(v_ap_accounts) a;
  return jsonb_build_object('arSource',v_ar,'apSource',v_ap,'sourceCount',v_count,'issueCount',v_issue_count,
    'issues',v_issues,'arAccountIds',to_jsonb(v_ar_accounts),'apAccountIds',to_jsonb(v_ap_accounts));
end; $$;
revoke all on function public._multideck_finance_opening_trade_control(uuid,uuid) from public,anon,authenticated;
grant execute on function public._multideck_finance_opening_trade_control(uuid,uuid) to service_role;

commit;
