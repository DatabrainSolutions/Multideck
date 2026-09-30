begin;

create table public."FIN_OpeningBalancePackages" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  source_system text not null check(source_system='CargoWise'),
  source_file_name text not null check(length(btrim(source_file_name)) between 1 and 240),
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  closing_date date not null,
  opening_date date not null,
  base_currency text not null check(base_currency ~ '^[A-Z]{3}$'),
  evidence jsonb not null check(jsonb_typeof(evidence)='object'),
  debit_total numeric(18,4) not null check(debit_total>0),
  credit_total numeric(18,4) not null check(credit_total=debit_total),
  status text not null default 'staged' check(status in ('staged','approved','posted')),
  staged_by uuid not null references public."cmp_Users"("User_ID"),
  staged_at timestamptz not null default now(),
  approved_by uuid references public."cmp_Users"("User_ID"),
  approved_at timestamptz,
  posted_by uuid references public."cmp_Users"("User_ID"),
  posted_at timestamptz,
  posting_batch_id uuid unique references public."FIN_PostingBatches"("FINPostBatch_ID") on delete restrict,
  unique(legal_entity_id,source_sha256)
);
create unique index fin_one_posted_opening_package on public."FIN_OpeningBalancePackages"(legal_entity_id) where status='posted';
create table public."FIN_OpeningBalanceRows" (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public."FIN_OpeningBalancePackages"(id) on delete restrict,
  source_row_number integer not null check(source_row_number>0),
  source_account_code text not null check(length(source_account_code) between 1 and 80),
  nominal_account_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  nominal_code_snapshot text not null,
  nominal_name_snapshot text not null,
  debit numeric(18,4) not null check(debit>=0),
  credit numeric(18,4) not null check(credit>=0),
  check((debit>0 and credit=0) or (credit>0 and debit=0)),
  unique(package_id,source_row_number),
  unique(package_id,source_account_code),
  unique(package_id,nominal_account_id)
);
create index on public."FIN_OpeningBalanceRows"(nominal_account_id);
alter table public."FIN_OpeningBalancePackages" enable row level security;
alter table public."FIN_OpeningBalanceRows" enable row level security;
revoke all on public."FIN_OpeningBalancePackages",public."FIN_OpeningBalanceRows" from public,anon,authenticated;
grant select,insert,update on public."FIN_OpeningBalancePackages" to service_role;
grant select,insert on public."FIN_OpeningBalanceRows" to service_role;

insert into public."sys_WorkflowRecordTypes"("WorkflowRecordType_Code","WorkflowRecordType_Name","WorkflowRecordType_SourceTable","WorkflowRecordType_Description")
values ('opening_balances','Opening balances','FIN_OpeningBalancePackages','Approved CargoWise trial balance and native ledger cutover')
on conflict ("WorkflowRecordType_Code") do nothing;

create function public._multideck_finance_opening_immutable() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_table_name='FIN_OpeningBalanceRows' or tg_op='DELETE' then
    raise exception 'Opening balance evidence is immutable.' using errcode='22023';
  end if;
  if (to_jsonb(new)-'status'-'approved_by'-'approved_at'-'posted_by'-'posted_at'-'posting_batch_id')
      is distinct from (to_jsonb(old)-'status'-'approved_by'-'approved_at'-'posted_by'-'posted_at'-'posting_batch_id')
    or not ((old.status='staged' and new.status='approved' and new.approved_by is not null and new.approved_at is not null)
      or (old.status='approved' and new.status='posted' and new.posted_by is not null and new.posted_at is not null and new.posting_batch_id is not null)) then
    raise exception 'Opening balance package cannot be changed after staging.' using errcode='22023';
  end if;
  return new;
end; $$;
create trigger opening_package_immutable before update or delete on public."FIN_OpeningBalancePackages"
for each row execute function public._multideck_finance_opening_immutable();
create trigger opening_row_immutable before update or delete on public."FIN_OpeningBalanceRows"
for each row execute function public._multideck_finance_opening_immutable();
revoke all on function public._multideck_finance_opening_immutable() from public,anon,authenticated;

create function public._multideck_finance_opening_check(p_package uuid)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare package public."FIN_OpeningBalancePackages"; row_record record; nominal public."FIN_NominalAccounts";
  debit_sum numeric:=0; credit_sum numeric:=0; row_count integer:=0; mode text; connected boolean; native_enabled boolean;
begin
  select * into package from public."FIN_OpeningBalancePackages" where id=p_package for update;
  if not found then raise exception 'Opening balance package not found.' using errcode='P0002'; end if;
  if exists(select 1 from public."FIN_PostingBatches" where "FINPostBatch_LegalEntityID"=package.legal_entity_id and "FINPostBatch_StatusCode"='posted') then
    raise exception 'Opening balances require an empty native ledger for this legal entity.' using errcode='22023';
  end if;
  select mirror_mode,active_connection,native_ledger_enabled into mode,connected,native_enabled
    from public._multideck_finance_mirror_state(package.legal_entity_id);
  if not native_enabled then raise exception 'Enable the native ledger before opening-balance cutover.' using errcode='22023'; end if;
  if mode='required' or connected then raise exception 'Reconcile the linked accounting package separately before opening-balance cutover.' using errcode='22023'; end if;
  if package.opening_date is distinct from package.closing_date+1 then raise exception 'Opening date must follow the CargoWise closing date.' using errcode='22023'; end if;
  if package.base_currency is distinct from (select upper("LegalEntity_BaseCurrencyCodeSnapshot") from public."cmp_LegalEntities" where "LegalEntity_ID"=package.legal_entity_id) then
    raise exception 'The legal entity base currency changed; stage a new package.' using errcode='22023'; end if;
  for row_record in select * from public."FIN_OpeningBalanceRows" where package_id=p_package order by source_row_number loop
    select * into nominal from public."FIN_NominalAccounts" where "FINNom_ID"=row_record.nominal_account_id for share;
    if not found or nominal."FINNom_LegalEntityID" is distinct from package.legal_entity_id or not nominal."FINNom_IsActive"
      or nominal."FINNom_Code" is distinct from row_record.nominal_code_snapshot then
      raise exception 'A staged nominal changed or is no longer active; stage a new package.' using errcode='22023'; end if;
    if nominal."FINNom_IsControlAccount" and nominal."FINNom_AccountTypeCode" in ('Receivable','Payable')
      and (row_record.debit<>0 or row_record.credit<>0) then
      raise exception 'Open AR/AP requires matched source documents; this GL-only cutover cannot import it.' using errcode='22023'; end if;
    debit_sum:=debit_sum+row_record.debit; credit_sum:=credit_sum+row_record.credit; row_count:=row_count+1;
  end loop;
  if row_count<2 or debit_sum<=0 or debit_sum is distinct from credit_sum
    or debit_sum is distinct from package.debit_total or credit_sum is distinct from package.credit_total then
    raise exception 'Staged trial balance no longer agrees with its approved totals.' using errcode='22023'; end if;
  return jsonb_build_object('rows',row_count,'debit',debit_sum,'credit',credit_sum,'currency',package.base_currency);
end; $$;
revoke all on function public._multideck_finance_opening_check(uuid) from public,anon,authenticated;
grant execute on function public._multideck_finance_opening_check(uuid) to service_role;

create function public.multideck_finance_opening_balances(p_actor uuid,p_entity uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare package public."FIN_OpeningBalancePackages"; nominal public."FIN_NominalAccounts"; entry jsonb;
  debit numeric; credit numeric; debit_sum numeric:=0; credit_sum numeric:=0; row_no integer:=0; row_count integer:=0;
  base_currency text; opening_date date; batch uuid; period_id uuid; line_no integer:=0; result jsonb;
begin
  perform public._multideck_journal_access(p_actor,p_entity,
    case when p_action='read' then 'Finance.Management.View'
      when p_action='stage' then 'Finance.Configuration.Manage' else 'Finance.Management.Post' end);
  if p_action='read' then
    return coalesce((select jsonb_agg(jsonb_build_object('package',to_jsonb(p),
      'rowCount',(select count(*) from public."FIN_OpeningBalanceRows" r where r.package_id=p.id),
      'rows',case when p.id=nullif(p_input->>'id','')::uuid then
        (select coalesce(jsonb_agg(to_jsonb(r) order by r.source_row_number),'[]'::jsonb) from public."FIN_OpeningBalanceRows" r where r.package_id=p.id)
        else '[]'::jsonb end) order by p.staged_at desc)
      from public."FIN_OpeningBalancePackages" p where p.legal_entity_id=p_entity
        and (nullif(p_input->>'id','') is null or p.id=(p_input->>'id')::uuid)),'[]'::jsonb);
  end if;
  if p_action not in ('stage','approve','post') then raise exception 'Unknown opening balance action.' using errcode='22023'; end if;
  perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for update;
  if p_action='stage' then
    if p_input->>'sourceSystem' is distinct from 'CargoWise' or coalesce(length(btrim(p_input->>'sourceFileName')),0) not between 1 and 240
      or coalesce(p_input->>'sourceSha256','') !~ '^[a-f0-9]{64}$' then
      raise exception 'Record the CargoWise source filename and SHA-256 hash.' using errcode='22023'; end if;
    if jsonb_typeof(p_input->'trialBalance')<>'array' or jsonb_array_length(p_input->'trialBalance') not between 2 and 10000 then
      raise exception 'Provide two to 10,000 closing-balance rows.' using errcode='22023'; end if;
    if jsonb_typeof(p_input->'openItems')<>'array' or jsonb_array_length(p_input->'openItems')<>0 then
      raise exception 'Open AR/AP and unapplied cash need source-document migration before this package can post.' using errcode='22023'; end if;
    if jsonb_typeof(p_input->'evidence')<>'object' or
      not (p_input->'evidence' ?& array['bank','tax','accrualWip','sourceReconciliation']) or
      exists(select 1 from jsonb_each_text(p_input->'evidence') e where e.value is null or length(btrim(e.value))<3) then
      raise exception 'Record bank, tax, accrual/WIP and source reconciliation evidence references.' using errcode='22023'; end if;
    opening_date:=(p_input->>'cutoffDate')::date+1;
    if (opening_date-1)::text is distinct from p_input->>'cutoffDate' then raise exception 'Choose an exact CargoWise closing date.' using errcode='22023'; end if;
    select upper("LegalEntity_BaseCurrencyCodeSnapshot") into base_currency from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
    if base_currency is null or base_currency!~'^[A-Z]{3}$' or p_input->>'baseCurrency' is distinct from base_currency then
      raise exception 'Use the legal entity base currency for opening balances.' using errcode='22023'; end if;
    if exists(select 1 from public."FIN_PostingBatches" where "FINPostBatch_LegalEntityID"=p_entity and "FINPostBatch_StatusCode"='posted') then
      raise exception 'Opening balances require an empty native ledger for this legal entity.' using errcode='22023'; end if;
    for entry in select value from jsonb_array_elements(p_input->'trialBalance') loop
      row_count:=row_count+1;
      row_no:=coalesce((entry->>'sourceRow')::integer,row_count);
      if coalesce(entry->>'accountCode','')='' or (entry->>'accountCode')<>btrim(entry->>'accountCode') then
        raise exception 'Source row % has no exact text account code.',row_no using errcode='22023'; end if;
      select * into nominal from public."FIN_NominalAccounts"
        where "FINNom_LegalEntityID"=p_entity and "FINNom_Code"=entry->>'accountCode' and "FINNom_IsActive" for share;
      if not found then raise exception 'Source row % has no active nominal in this legal entity.',row_no using errcode='22023'; end if;
      if coalesce(entry->>'debit','') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$' or coalesce(entry->>'credit','') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$' then
        raise exception 'Source row % needs exact non-negative four-decimal amounts.',row_no using errcode='22023'; end if;
      debit:=(entry->>'debit')::numeric; credit:=(entry->>'credit')::numeric;
      if not ((debit>0 and credit=0) or (credit>0 and debit=0)) then
        raise exception 'Source row % needs one closing balance side.',row_no using errcode='22023'; end if;
      if nominal."FINNom_IsControlAccount" and nominal."FINNom_AccountTypeCode" in ('Receivable','Payable') then
        raise exception 'Open AR/AP requires matched source documents; this GL-only cutover cannot import it.' using errcode='22023'; end if;
      debit_sum:=debit_sum+debit; credit_sum:=credit_sum+credit;
    end loop;
    if debit_sum<=0 or debit_sum is distinct from credit_sum then raise exception 'Closing trial balance must balance before staging.' using errcode='22023'; end if;
    insert into public."FIN_OpeningBalancePackages"(legal_entity_id,source_system,source_file_name,source_sha256,closing_date,opening_date,base_currency,evidence,debit_total,credit_total,staged_by)
      values(p_entity,'CargoWise',btrim(p_input->>'sourceFileName'),p_input->>'sourceSha256',opening_date-1,opening_date,base_currency,p_input->'evidence',debit_sum,credit_sum,p_actor)
      returning * into package;
    row_count:=0;
    for entry in select value from jsonb_array_elements(p_input->'trialBalance') loop
      row_count:=row_count+1;
      row_no:=coalesce((entry->>'sourceRow')::integer,row_count);
      select * into nominal from public."FIN_NominalAccounts"
        where "FINNom_LegalEntityID"=p_entity and "FINNom_Code"=entry->>'accountCode' and "FINNom_IsActive" for share;
      insert into public."FIN_OpeningBalanceRows"(package_id,source_row_number,source_account_code,nominal_account_id,nominal_code_snapshot,nominal_name_snapshot,debit,credit)
        values(package.id,row_no,entry->>'accountCode',nominal."FINNom_ID",nominal."FINNom_Code",nominal."FINNom_Name",(entry->>'debit')::numeric,(entry->>'credit')::numeric);
    end loop;
    result:=to_jsonb(package);
  else
    select * into package from public."FIN_OpeningBalancePackages" where id=(p_input->>'id')::uuid and legal_entity_id=p_entity for update;
    if not found then raise exception 'Opening balance package not found.' using errcode='P0002'; end if;
    if (p_action='approve' and package.status<>'staged') or (p_action='post' and package.status<>'approved') then
      raise exception 'Complete opening balance stages in order.' using errcode='22023'; end if;
    if p_actor=package.staged_by then raise exception 'A second finance operator must approve and post opening balances.' using errcode='42501'; end if;
    result:=public._multideck_finance_opening_check(package.id);
    if p_action='approve' then
      update public."FIN_OpeningBalancePackages" set status='approved',approved_by=p_actor,approved_at=now() where id=package.id returning * into package;
      result:=to_jsonb(package)||jsonb_build_object('reconciliation',result);
    else
      period_id:=public._multideck_finance_ensure_period(p_entity,to_char(package.opening_date,'YYYYMM'),p_actor);
      perform 1 from public."FIN_Periods" where "FINPeriod_ID"=period_id and "FINPeriod_StatusCode"='open' for update;
      if not found then raise exception 'Opening date must be in an open accounting period.' using errcode='22023'; end if;
      insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy")
        values('OPEN-'||left(package.id::text,8),'posted','FIN_OpeningBalancePackages',package.id,period_id,p_entity,package.debit_total,package.credit_total,package.base_currency,now(),p_actor,p_actor)
        returning "FINPostBatch_ID" into batch;
      for entry in select to_jsonb(r) from public."FIN_OpeningBalanceRows" r where r.package_id=package.id order by r.source_row_number loop
        line_no:=line_no+1;
        insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot")
          values(batch,line_no,(entry->>'nominal_account_id')::uuid,'CargoWise opening · source row '||(entry->>'source_row_number')||' · '||(entry->>'source_account_code'),(entry->>'debit')::numeric,(entry->>'credit')::numeric,package.base_currency);
      end loop;
      update public."FIN_OpeningBalancePackages" set status='posted',posted_by=p_actor,posted_at=now(),posting_batch_id=batch where id=package.id returning * into package;
      result:=to_jsonb(package)||jsonb_build_object('reconciliation',result);
    end if;
  end if;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_OpeningBalancePackages','opening_balances',package.id,p_action,'CargoWise opening balances '||p_action,true,1,jsonb_build_object('sourceSha256',package.source_sha256,'debit',package.debit_total,'credit',package.credit_total,'currency',package.base_currency,'postingBatchId',package.posting_batch_id));
  return result;
end; $$;
revoke all on function public.multideck_finance_opening_balances(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_opening_balances(uuid,uuid,text,jsonb) to service_role;

commit;
