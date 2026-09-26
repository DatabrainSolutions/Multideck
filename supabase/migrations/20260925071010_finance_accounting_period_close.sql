begin;

create table public."FIN_AccountingCloseReviews" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  period_id uuid not null references public."FIN_Periods"("FINPeriod_ID"),
  source_digest text not null,
  snapshot jsonb not null,
  prepared_by uuid not null references public."cmp_Users"("User_ID"),
  prepared_at timestamptz not null default now(),
  reason text not null check(length(btrim(reason)) between 10 and 2000)
);
create index on public."FIN_AccountingCloseReviews"(legal_entity_id,period_id,prepared_at desc,id desc);
create table public."FIN_AccountingClosedPacks" (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public."FIN_AccountingCloseReviews"(id),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  period_id uuid not null unique references public."FIN_Periods"("FINPeriod_ID"),
  source_digest text not null,
  snapshot jsonb not null,
  closed_by uuid not null references public."cmp_Users"("User_ID"),
  closed_at timestamptz not null default now(),
  reason text not null check(length(btrim(reason)) between 10 and 2000)
);
alter table public."FIN_AccountingCloseReviews" enable row level security;
alter table public."FIN_AccountingClosedPacks" enable row level security;
revoke all on public."FIN_AccountingCloseReviews",public."FIN_AccountingClosedPacks" from public,anon,authenticated;
grant select on public."FIN_AccountingCloseReviews",public."FIN_AccountingClosedPacks" to service_role;

create function public._multideck_accounting_close_immutable() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  raise exception 'Accounting close evidence is immutable. Prepare a new review.' using errcode='22023';
end; $$;
create trigger accounting_close_review_immutable before update or delete on public."FIN_AccountingCloseReviews"
  for each row execute function public._multideck_accounting_close_immutable();
create trigger accounting_close_pack_immutable before update or delete on public."FIN_AccountingClosedPacks"
  for each row execute function public._multideck_accounting_close_immutable();
revoke all on function public._multideck_accounting_close_immutable() from public,anon,authenticated;

insert into public."sys_WorkflowRecordTypes"("WorkflowRecordType_Code","WorkflowRecordType_Name","WorkflowRecordType_SourceTable","WorkflowRecordType_Description")
values ('accounting_period_close','Accounting period close','FIN_AccountingClosedPacks','Immutable source-backed close pack and independent period lock')
on conflict ("WorkflowRecordType_Code") do nothing;

-- Only a prepared, independently authorised close can move a period to locked.
-- There is deliberately no implicit reopen: late corrections use an open period.
create function public._multideck_accounting_period_status_guard() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if old."FINPeriod_StatusCode"='locked' and
    (new."FINPeriod_StatusCode",new."FINPeriod_LockedAt",new."FINPeriod_LockedBy") is distinct from
    (old."FINPeriod_StatusCode",old."FINPeriod_LockedAt",old."FINPeriod_LockedBy") then
    raise exception 'A locked accounting period cannot be reopened without a separate approved correction policy.' using errcode='22023';
  end if;
  if new."FINPeriod_StatusCode"='locked' and old."FINPeriod_StatusCode"<>'locked' and not exists (
    select 1 from public."FIN_AccountingClosedPacks" pack where pack.period_id=new."FINPeriod_ID"
      and pack.legal_entity_id=new."FINPeriod_LegalEntityID" and pack.closed_by=new."FINPeriod_LockedBy"
  ) then raise exception 'Prepare and independently approve a current accounting close pack first.' using errcode='22023'; end if;
  return new;
end; $$;
create trigger accounting_period_status_guard before update of "FINPeriod_StatusCode","FINPeriod_LockedAt","FINPeriod_LockedBy" on public."FIN_Periods"
  for each row execute function public._multideck_accounting_period_status_guard();
revoke all on function public._multideck_accounting_period_status_guard() from public,anon,authenticated;

-- Posting and close take compatible locks on the same period row. A posting
-- cannot commit between the final close read and the lock status change.
create function public._multideck_closed_period_posting_guard() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare v_period uuid; v_status text;
begin
  if tg_table_name='FIN_PostingBatches' then
    if tg_op='DELETE' then v_period:=old."FINPostBatch_PeriodID";
    else v_period:=new."FINPostBatch_PeriodID"; end if;
  else
    if tg_op='DELETE' then
      select "FINPostBatch_PeriodID" into v_period from public."FIN_PostingBatches"
        where "FINPostBatch_ID"=old."FINPostLine_BatchID";
    else
      select "FINPostBatch_PeriodID" into v_period from public."FIN_PostingBatches"
        where "FINPostBatch_ID"=new."FINPostLine_BatchID";
    end if;
  end if;
  if v_period is not null then
    select "FINPeriod_StatusCode" into v_status from public."FIN_Periods" where "FINPeriod_ID"=v_period for share;
    if v_status='locked' then raise exception 'The accounting period is locked; post a dated correction in an open period.' using errcode='22023'; end if;
  end if;
  if tg_table_name='FIN_PostingBatches' then
    if tg_op='UPDATE' then
      if old."FINPostBatch_PeriodID" is distinct from new."FINPostBatch_PeriodID" then
        select "FINPeriod_StatusCode" into v_status from public."FIN_Periods" where "FINPeriod_ID"=old."FINPostBatch_PeriodID" for share;
        if v_status='locked' then raise exception 'A posted batch cannot be moved out of a locked period.' using errcode='22023'; end if;
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger closed_period_batch_guard before insert or update or delete on public."FIN_PostingBatches"
  for each row execute function public._multideck_closed_period_posting_guard();
create trigger closed_period_line_guard before insert or update or delete on public."FIN_PostingLines"
  for each row execute function public._multideck_closed_period_posting_guard();
revoke all on function public._multideck_closed_period_posting_guard() from public,anon,authenticated;

create function public._multideck_closed_period_source_guard() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare v_entity uuid; v_date date; v_posted boolean; v_changed boolean;
begin
  if tg_table_name='FIN_Documents' then
    v_entity:=case when tg_op='INSERT' then new."FINDoc_LegalEntityID" else old."FINDoc_LegalEntityID" end;
    v_date:=case when tg_op='INSERT' then new."FINDoc_AccountingDate" else old."FINDoc_AccountingDate" end;
    v_posted:=case when tg_op='INSERT' then new."FINDoc_NativePostingStatusCode"='posted' else old."FINDoc_NativePostingStatusCode"='posted' end;
    v_changed:=tg_op in ('INSERT','DELETE');
    if tg_op='UPDATE' then
      v_changed:=(new."FINDoc_TypeCode",new."FINDoc_LegalEntityID",new."FINDoc_PartyOrgID",new."FINDoc_AccountingDate",
        new."FINDoc_CurrencyCodeSnapshot",new."FINDoc_ExchangeRate",new."FINDoc_LocalNetAmount",new."FINDoc_LocalTaxAmount",
        new."FINDoc_LocalGrossAmount",new."FINDoc_NativePostingStatusCode",new."FINDoc_NativePostingBatchID") is distinct from
        (old."FINDoc_TypeCode",old."FINDoc_LegalEntityID",old."FINDoc_PartyOrgID",old."FINDoc_AccountingDate",
        old."FINDoc_CurrencyCodeSnapshot",old."FINDoc_ExchangeRate",old."FINDoc_LocalNetAmount",old."FINDoc_LocalTaxAmount",
        old."FINDoc_LocalGrossAmount",old."FINDoc_NativePostingStatusCode",old."FINDoc_NativePostingBatchID");
    end if;
  elsif tg_table_name='FIN_CashTransactions' then
    v_entity:=case when tg_op='INSERT' then new."FINCash_LegalEntityID" else old."FINCash_LegalEntityID" end;
    v_date:=case when tg_op='INSERT' then new."FINCash_AccountingDate" else old."FINCash_AccountingDate" end;
    v_posted:=case when tg_op='INSERT' then new."FINCash_NativePostingStatusCode"='posted' else old."FINCash_NativePostingStatusCode"='posted' end;
    v_changed:=tg_op in ('INSERT','DELETE');
    if tg_op='UPDATE' then
      v_changed:=(new."FINCash_TypeCode",new."FINCash_LegalEntityID",new."FINCash_PartyOrgID",new."FINCash_BankAccountID",
        new."FINCash_AccountingDate",new."FINCash_CurrencyCodeSnapshot",new."FINCash_ExchangeRate",new."FINCash_LocalAmount",
        new."FINCash_NativePostingStatusCode",new."FINCash_NativePostingBatchID") is distinct from
        (old."FINCash_TypeCode",old."FINCash_LegalEntityID",old."FINCash_PartyOrgID",old."FINCash_BankAccountID",
        old."FINCash_AccountingDate",old."FINCash_CurrencyCodeSnapshot",old."FINCash_ExchangeRate",old."FINCash_LocalAmount",
        old."FINCash_NativePostingStatusCode",old."FINCash_NativePostingBatchID");
    end if;
  end if;
  if v_posted and v_changed and exists(select 1 from public."FIN_Periods" period
    where period."FINPeriod_LegalEntityID"=v_entity and v_date between period."FINPeriod_StartDate" and period."FINPeriod_EndDate"
      and period."FINPeriod_StatusCode"='locked') then
    raise exception 'A posted source in a locked period is immutable; issue a correction in an open period.' using errcode='22023';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger closed_period_document_guard before insert or update or delete on public."FIN_Documents"
  for each row execute function public._multideck_closed_period_source_guard();
create trigger closed_period_cash_guard before insert or update or delete on public."FIN_CashTransactions"
  for each row execute function public._multideck_closed_period_source_guard();
revoke all on function public._multideck_closed_period_source_guard() from public,anon,authenticated;

create function public._multideck_closed_period_charge_link_guard() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare v_document uuid;
begin
  for v_document in select distinct document_id from (values
    (case when tg_op<>'INSERT' then old."FINDocLineJob_DocumentID" end),
    (case when tg_op<>'DELETE' then new."FINDocLineJob_DocumentID" end)
  ) candidate(document_id) where document_id is not null loop
    if exists(select 1 from public."FIN_Documents" doc join public."FIN_Periods" period
      on period."FINPeriod_LegalEntityID"=doc."FINDoc_LegalEntityID"
      and doc."FINDoc_AccountingDate" between period."FINPeriod_StartDate" and period."FINPeriod_EndDate"
      where doc."FINDoc_ID"=v_document and doc."FINDoc_NativePostingStatusCode"='posted'
        and period."FINPeriod_StatusCode"='locked') then
      raise exception 'A posted charge link in a locked period is immutable; review a later-period correction.' using errcode='22023';
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger closed_period_charge_link_guard before insert or update or delete on public."FIN_DocumentLineJobLinks"
  for each row execute function public._multideck_closed_period_charge_link_guard();
revoke all on function public._multideck_closed_period_charge_link_guard() from public,anon,authenticated;

create function public._multideck_finance_close_snapshot(p_actor uuid,p_entity uuid,p_period uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_Periods"; v_trial numeric; v_bad_batches bigint; v_cost numeric; v_cost_gl numeric;
  v_wip numeric; v_wip_gl numeric; v_future bigint; v_docs bigint; v_cash bigint; v_queue bigint;
  v_mode text; v_connected boolean; v_native boolean; v_mirror_pending bigint; v_bank record; v_connection record;
  v_bank_result jsonb; v_bank_rows jsonb:='[]'; v_provider jsonb; v_provider_rows jsonb:='[]'; v_provider_status text;
  v_trade jsonb; v_trade_status text;
  v_vat jsonb; v_vat_status text; v_country text;
  v_blockers text[]:='{}';
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View');
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity;
  if not found then raise exception 'Accounting period not found in this legal entity.' using errcode='P0002'; end if;
  with totals as (
    select batch."FINPostBatch_ID",batch."FINPostBatch_DebitTotal" debits,batch."FINPostBatch_CreditTotal" credits,
      coalesce(sum(line."FINPostLine_DebitAmount"),0) line_debits,coalesce(sum(line."FINPostLine_CreditAmount"),0) line_credits
    from public."FIN_PostingBatches" batch left join public."FIN_PostingLines" line on line."FINPostLine_BatchID"=batch."FINPostBatch_ID"
    where batch."FINPostBatch_LegalEntityID"=p_entity and batch."FINPostBatch_PeriodID"=p_period and batch."FINPostBatch_StatusCode"='posted'
    group by batch."FINPostBatch_ID"
  ) select coalesce(sum(line_debits-line_credits),0),count(*) filter(where debits<>credits or debits<>line_debits or credits<>line_credits)
    into v_trial,v_bad_batches from totals;
  if v_trial<>0 or v_bad_batches>0 then v_blockers:=array_append(v_blockers,'trial_balance'); end if;
  select coalesce(sum(a."FINAccrual_AccruedAmount"-a."FINAccrual_RelievedAmount"),0) into v_cost
    from public."FIN_Accruals" a join public."FIN_Periods" source_period on source_period."FINPeriod_ID"=a."FINAccrual_PeriodID"
    where source_period."FINPeriod_LegalEntityID"=p_entity and source_period."FINPeriod_EndDate"<=v_period."FINPeriod_EndDate";
  select coalesce(sum(line."FINPostLine_CreditAmount"-line."FINPostLine_DebitAmount"),0) into v_cost_gl
    from public."FIN_PostingLines" line join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=line."FINPostLine_BatchID"
    join public."FIN_Periods" posting_period on posting_period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
    join public."FIN_NominalAccounts" account on account."FINNom_ID"=line."FINPostLine_NominalAccountID"
    where batch."FINPostBatch_LegalEntityID"=p_entity and batch."FINPostBatch_StatusCode"='posted'
      and posting_period."FINPeriod_EndDate"<=v_period."FINPeriod_EndDate" and line."FINPostLine_AccrualID" is not null and account."FINNom_IsControlAccount";
  if v_cost<>v_cost_gl then v_blockers:=array_append(v_blockers,'cost_accrual_control'); end if;
  select coalesce(sum(w."FINWIP_WIPAmount"-w."FINWIP_RelievedAmount"),0) into v_wip
    from public."FIN_WIPItems" w join public."FIN_Periods" source_period on source_period."FINPeriod_ID"=w."FINWIP_PeriodID"
    where source_period."FINPeriod_LegalEntityID"=p_entity and source_period."FINPeriod_EndDate"<=v_period."FINPeriod_EndDate";
  select coalesce(sum(line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount"),0) into v_wip_gl
    from public."FIN_PostingLines" line join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=line."FINPostLine_BatchID"
    join public."FIN_Periods" posting_period on posting_period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
    join public."FIN_NominalAccounts" account on account."FINNom_ID"=line."FINPostLine_NominalAccountID"
    where batch."FINPostBatch_LegalEntityID"=p_entity and batch."FINPostBatch_StatusCode"='posted'
      and posting_period."FINPeriod_EndDate"<=v_period."FINPeriod_EndDate" and line."FINPostLine_WIPID" is not null and account."FINNom_IsControlAccount";
  if v_wip<>v_wip_gl then v_blockers:=array_append(v_blockers,'revenue_wip_control'); end if;
  select count(*) into v_future from public."FIN_PostingLines" line
    join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=line."FINPostLine_BatchID"
    join public."FIN_Periods" posting_period on posting_period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
    where batch."FINPostBatch_LegalEntityID"=p_entity and batch."FINPostBatch_StatusCode"='posted'
      and posting_period."FINPeriod_EndDate">v_period."FINPeriod_EndDate"
      and (line."FINPostLine_AccrualID" is not null or line."FINPostLine_WIPID" is not null);
  if v_future>0 then v_blockers:=array_append(v_blockers,'later_charge_movements'); end if;
  select count(*) into v_queue from public."FIN_ChargeLifecycleQueue" where legal_entity_id=p_entity and status<>'settled';
  if v_queue>0 then v_blockers:=array_append(v_blockers,'charge_lifecycle_queue'); end if;
  select count(*) into v_docs from public."FIN_Documents" where "FINDoc_LegalEntityID"=p_entity
    and "FINDoc_NativePostingStatusCode"='posted' and "FINDoc_AccountingDate"<=v_period."FINPeriod_EndDate";
  select count(*) into v_cash from public."FIN_CashTransactions" where "FINCash_LegalEntityID"=p_entity
    and "FINCash_NativePostingStatusCode"='posted' and "FINCash_AccountingDate"<=v_period."FINPeriod_EndDate";
  if to_regprocedure('public.multideck_finance_trade_control_bridge(uuid,uuid,uuid)') is null then
    v_trade_status:=case when v_docs+v_cash=0 then 'not_applicable' else 'unavailable' end;
  else
    execute 'select public.multideck_finance_trade_control_bridge($1,$2,$3)' into v_trade using p_actor,p_entity,p_period;
    v_trade_status:=v_trade->>'status';
  end if;
  if v_trade_status not in ('verified','not_applicable') then v_blockers:=array_append(v_blockers,'ar_ap_control'); end if;
  -- A return-period VAT review cannot clear an accounting month. The separate
  -- signed accounting-period control must bind the current native VAT lines.
  select to_jsonb(entity)->>'LegalEntity_CountryCode' into v_country from public."cmp_LegalEntities" entity
    where entity."LegalEntity_ID"=p_entity;
  if to_regprocedure('public.multideck_finance_accounting_vat_control_status(uuid,uuid,uuid)') is not null then
    execute 'select public.multideck_finance_accounting_vat_control_status($1,$2,$3)'
      into v_vat using p_actor,p_entity,p_period;
    v_vat_status:=v_vat->>'status';
  else
    v_vat_status:=case when v_country='GB' or v_docs>0 then 'unavailable' else 'not_applicable' end;
  end if;
  if v_vat_status not in ('verified','not_applicable') then
    v_blockers:=array_append(v_blockers,'vat_control_unavailable'); end if;
  for v_bank in select "FINBank_ID" id from public."FIN_BankAccounts"
    where "FINBank_LegalEntityID"=p_entity and "FINBank_IsActive" loop
    if to_regprocedure('public.multideck_bank_statement_control(uuid,uuid,uuid,uuid)') is null then
      v_bank_result:=jsonb_build_object('bankId',v_bank.id,'status','unavailable');
    else
      execute 'select public.multideck_bank_statement_control($1,$2,$3,$4)' into v_bank_result using p_actor,p_entity,p_period,v_bank.id;
    end if;
    v_bank_rows:=v_bank_rows||jsonb_build_array(v_bank_result);
    if v_bank_result->>'status' is distinct from 'verified' then v_blockers:=array_append(v_blockers,'bank_reconciliation'); end if;
  end loop;
  select mirror_mode,active_connection,native_ledger_enabled into v_mode,v_connected,v_native from public._multideck_finance_mirror_state(p_entity);
  if not v_native then v_blockers:=array_append(v_blockers,'native_ledger_disabled'); end if;
  select count(*) into v_mirror_pending from public."FIN_Journals" journal
    where journal.legal_entity_id=p_entity and journal.accounting_date<=v_period."FINPeriod_EndDate"
      and journal.status='posted' and journal.mirror_status not in ('not_required','synced');
  if v_mirror_pending>0 then v_blockers:=array_append(v_blockers,'journal_mirror_delivery'); end if;
  v_provider_status:='not_required';
  if v_mode='required' and not v_connected then
    v_provider_status:='unavailable'; v_blockers:=array_append(v_blockers,'provider_reconciliation');
  elsif v_mode<>'disabled' and v_connected then
    v_provider_status:='verified';
    for v_connection in select "ACCIC_ID" id from public."ACCI_Connections"
      where "ACCIC_LegalEntityID"=p_entity and "ACCIC_StatusCode"='active' loop
      if to_regprocedure('public.multideck_finance_provider_period_status(uuid,uuid,uuid,uuid)') is null then
        v_provider:=jsonb_build_object('connectionId',v_connection.id,'status','incomplete');
      else
        execute 'select public.multideck_finance_provider_period_status($1,$2,$3,$4)' into v_provider using p_actor,p_entity,p_period,v_connection.id;
      end if;
      v_provider_rows:=v_provider_rows||jsonb_build_array(v_provider);
      if v_provider->>'status' is distinct from 'verified' then v_provider_status:='incomplete'; end if;
    end loop;
    if jsonb_array_length(v_provider_rows)=0 then v_provider_status:='incomplete'; end if;
    if v_provider_status<>'verified' then v_blockers:=array_append(v_blockers,'provider_reconciliation'); end if;
  end if;
  return jsonb_build_object('legalEntityId',p_entity,'periodId',p_period,'periodCode',v_period."FINPeriod_Code",
    'periodEnd',v_period."FINPeriod_EndDate",'currency',v_period."FINPeriod_BaseCurrencyCode",
    'trialBalance',jsonb_build_object('difference',v_trial,'invalidBatches',v_bad_batches),
    'costAccrual',jsonb_build_object('subledger',v_cost,'control',v_cost_gl,'difference',v_cost-v_cost_gl),
    'revenueWip',jsonb_build_object('subledger',v_wip,'control',v_wip_gl,'difference',v_wip-v_wip_gl),
    'futureChargeMovements',v_future,'pendingChargeCases',v_queue,
    'arApStatus',v_trade_status,'tradeControl',v_trade,
    'vatStatus',v_vat_status,'vatControl',v_vat,
    'bankControls',v_bank_rows,'mirror',jsonb_build_object('mode',v_mode,'connected',v_connected,'pendingJournals',v_mirror_pending,'providerStatus',v_provider_status,'providerControls',v_provider_rows),
    'blockers',to_jsonb(v_blockers));
end; $$;
revoke all on function public._multideck_finance_close_snapshot(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public._multideck_finance_close_snapshot(uuid,uuid,uuid) to service_role;

create function public.multideck_finance_accounting_close(p_actor uuid,p_entity uuid,p_period uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_Periods"; v_snapshot jsonb; v_digest text; v_review public."FIN_AccountingCloseReviews";
  v_pack public."FIN_AccountingClosedPacks"; v_reason text;
begin
  perform public._multideck_journal_access(p_actor,p_entity,case when p_action='read' then 'Finance.Management.View'
    when p_action='prepare' then 'Finance.Management.Prepare' else 'Finance.Management.Approve' end);
  if p_action not in ('read','prepare','close') then raise exception 'Unknown accounting close action.' using errcode='22023'; end if;
  if p_action='close' then perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Post'); end if;
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity
    for update;
  if not found then raise exception 'Accounting period not found in this legal entity.' using errcode='P0002'; end if;
  if p_action='close' and to_regclass('public."FIN_IndirectTaxEvidence"') is not null
    and to_regclass('public."FIN_IndirectTaxDecisions"') is not null
    and to_regclass('public."FIN_IndirectTaxReconciliations"') is not null then
    -- Retain the exact signed monthly VAT snapshot until the period lock
    -- commits; ordinary posting already shares this period row lock.
    execute 'lock table public."FIN_IndirectTaxEvidence",public."FIN_IndirectTaxDecisions",public."FIN_IndirectTaxReconciliations" in share mode';
  end if;
  v_snapshot:=public._multideck_finance_close_snapshot(p_actor,p_entity,p_period);
  v_digest:=md5(v_snapshot::text);
  if p_action='read' then
    return jsonb_build_object('snapshot',v_snapshot,'sourceDigest',v_digest,
      'reviews',coalesce((select jsonb_agg(to_jsonb(review) order by prepared_at desc) from
        (select * from public."FIN_AccountingCloseReviews" where period_id=p_period order by prepared_at desc limit 10) review),'[]'::jsonb),
      'closedPack',(select to_jsonb(pack) from public."FIN_AccountingClosedPacks" pack where pack.period_id=p_period));
  end if;
  if v_period."FINPeriod_StatusCode" not in ('open','soft_closed') then raise exception 'Only an open accounting period can be prepared or closed.' using errcode='22023'; end if;
  v_reason:=btrim(p_input->>'reason');
  if coalesce(length(v_reason),0) not between 10 and 2000 then raise exception 'Record the accounting close reason.' using errcode='22023'; end if;
  if p_action='prepare' then
    insert into public."FIN_AccountingCloseReviews"(legal_entity_id,period_id,source_digest,snapshot,prepared_by,reason)
      values(p_entity,p_period,v_digest,v_snapshot,p_actor,v_reason) returning * into v_review;
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
      values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_AccountingCloseReviews','accounting_period_close',v_review.id,'prepare_close','Accounting close prepared',v_reason,jsonb_build_object('periodId',p_period,'sourceDigest',v_digest,'blockers',v_snapshot->'blockers'));
    return to_jsonb(v_review);
  end if;
  select * into v_review from public."FIN_AccountingCloseReviews" where id=(p_input->>'reviewId')::uuid
    and legal_entity_id=p_entity and period_id=p_period;
  if not found then raise exception 'Accounting close review not found.' using errcode='P0002'; end if;
  if v_review.prepared_by=p_actor then raise exception 'Another authorised finance operator must close this period.' using errcode='42501'; end if;
  if v_review.source_digest<>v_digest or v_review.snapshot is distinct from v_snapshot then
    raise exception 'Accounting source changed; prepare a fresh close review.' using errcode='40001'; end if;
  if jsonb_array_length(v_snapshot->'blockers')>0 then raise exception 'Resolve the close pack blockers before locking the period: %',v_snapshot->'blockers' using errcode='22023'; end if;
  insert into public."FIN_AccountingClosedPacks"(review_id,legal_entity_id,period_id,source_digest,snapshot,closed_by,reason)
    values(v_review.id,p_entity,p_period,v_digest,v_snapshot,p_actor,v_reason) returning * into v_pack;
  update public."FIN_Periods" set "FINPeriod_StatusCode"='locked',"FINPeriod_LockedAt"=now(),"FINPeriod_LockedBy"=p_actor
    where "FINPeriod_ID"=p_period;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_AccountingClosedPacks','accounting_period_close',v_pack.id,'close_period','Accounting period locked',v_reason,jsonb_build_object('periodId',p_period,'sourceDigest',v_digest,'reviewId',v_review.id));
  return to_jsonb(v_pack);
end; $$;
revoke all on function public.multideck_finance_accounting_close(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_accounting_close(uuid,uuid,uuid,text,jsonb) to service_role;

commit;
