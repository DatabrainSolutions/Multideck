begin;

-- Journals are an operational source, not a second ledger. Posting writes the
-- same batches/lines consumed by the statutory reporting snapshot.
create table public."FIN_Journals" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  number bigint generated always as identity unique,
  accounting_date date not null,
  reference text not null default '',
  description text not null,
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  lines jsonb not null check(jsonb_typeof(lines)='array'),
  status text not null default 'draft' check(status in ('draft','posted')),
  version integer not null default 1,
  batch_id uuid references public."FIN_PostingBatches"("FINPostBatch_ID"),
  created_by uuid not null references public."cmp_Users"("User_ID"),
  created_at timestamptz not null default now(),
  posted_by uuid references public."cmp_Users"("User_ID"),
  posted_at timestamptz,
  mirror_status text not null default 'not_required' check(mirror_status in ('not_required','queued','sending','failed','synced')),
  mirror_payload jsonb,
  mirror_connection_id uuid,
  mirror_token uuid,
  mirror_lease_until timestamptz,
  mirror_attempts integer not null default 0,
  mirror_error text,
  external_id text,
  mirrored_at timestamptz
);
create index on public."FIN_Journals"(legal_entity_id,accounting_date desc,number desc);
alter table public."FIN_Journals" enable row level security;
revoke all on public."FIN_Journals" from public,anon,authenticated;
grant select,insert,update on public."FIN_Journals" to service_role;
grant usage,select on sequence public."FIN_Journals_number_seq" to service_role;

create function public._multideck_journal_access(p_actor uuid,p_entity uuid,p_permission text)
returns void language plpgsql set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public."cmp_Users" u join public."cmp_LegalEntities" e on e."Company_ID"=u."Company_ID"
    where u."User_ID"=p_actor and u."User_AccessStatus"='active' and e."LegalEntity_ID"=p_entity and e."LegalEntity_IsActive")
    or not coalesce(public._multideck_dexter_has_permission(p_actor,p_permission),false) then
    raise exception 'You do not have access to this general ledger action.' using errcode='42501';
  end if;
end; $$;
revoke all on function public._multideck_journal_access(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public._multideck_journal_access(uuid,uuid,text) to service_role;

create function public.multideck_finance_journal(p_actor uuid,p_entity uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare j public."FIN_Journals"; n public."FIN_NominalAccounts"; l jsonb; debit numeric; credit numeric;
  dt numeric:=0; ct numeric:=0; idx integer:=0; period_id uuid; batch uuid; cur text; mode text; connected boolean; native_enabled boolean;
begin
  perform public._multideck_journal_access(p_actor,p_entity,case when p_action='save' then 'Finance.Management.Prepare' else 'Finance.Management.Post' end);
  if p_action not in ('save','post','claim','finish','delivery_error') then raise exception 'Unknown journal action.' using errcode='22023'; end if;
  select * into j from public."FIN_Journals" where id=(p_input->>'id')::uuid and legal_entity_id=p_entity for update;
  if not found and p_action<>'save' then raise exception 'Journal not found.' using errcode='P0002'; end if;
  if p_action='save' then
    if j.status='posted' then raise exception 'Posted journals cannot be edited.' using errcode='22023'; end if;
    if j.id is not null and j.version is distinct from (p_input->>'version')::integer then raise exception 'This journal changed. Refresh before saving.' using errcode='22023'; end if;
    if coalesce(length(trim(p_input->>'description')),0) not between 1 and 500 or length(coalesce(p_input->>'reference',''))>180
      or coalesce(jsonb_typeof(p_input->'lines'),'')<>'array' then raise exception 'Enter a description and journal lines.' using errcode='22023'; end if;
    if jsonb_array_length(p_input->'lines') not between 2 and 200 then raise exception 'Enter between 2 and 200 journal lines.' using errcode='22023'; end if;
    select upper("LegalEntity_BaseCurrencyCodeSnapshot") into cur from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
    if cur is null or cur!~'^[A-Z]{3}$' then raise exception 'Configure a base currency first.' using errcode='22023'; end if;
    -- Drafts may be out of balance, but must never reference another entity.
    for l in select value from jsonb_array_elements(p_input->'lines') loop
      select * into n from public."FIN_NominalAccounts" where "FINNom_ID"=(l->>'accountId')::uuid and "FINNom_LegalEntityID"=p_entity;
      if not found or not n."FINNom_IsActive" or n."FINNom_IsControlAccount" or not n."FINNom_AllowManualPosting" then raise exception 'Choose an active account allowed for manual posting; control accounts are excluded.' using errcode='22023'; end if;
      debit:=(l->>'debit')::numeric; credit:=(l->>'credit')::numeric;
      if debit is null or credit is null or debit<0 or credit<0 or debit>=1000000000000 or credit>=1000000000000 or debit<>round(debit,4) or credit<>round(credit,4)
        or (debit>0 and credit>0) or length(coalesce(l->>'description',''))>500 then raise exception 'Use a non-negative debit or credit with at most four decimal places on each line.' using errcode='22023'; end if;
    end loop;
    insert into public."FIN_Journals"(id,legal_entity_id,accounting_date,reference,description,currency,lines,created_by)
      values(coalesce((p_input->>'id')::uuid,gen_random_uuid()),p_entity,(p_input->>'accountingDate')::date,coalesce(p_input->>'reference',''),trim(p_input->>'description'),cur,p_input->'lines',p_actor)
      on conflict(id) do update set accounting_date=excluded.accounting_date,reference=excluded.reference,description=excluded.description,lines=excluded.lines,version="FIN_Journals".version+1
      where "FIN_Journals".legal_entity_id=p_entity and "FIN_Journals".status='draft'
      returning * into j;
    if j.id is null then raise exception 'Journal is not accessible.' using errcode='42501'; end if;
  elsif p_action='post' then
    if j.status='posted' then return to_jsonb(j); end if;
    if j.version is distinct from (p_input->>'version')::integer then raise exception 'This journal changed. Refresh and review before posting.' using errcode='22023'; end if;
    select mirror_mode,active_connection,native_ledger_enabled into mode,connected,native_enabled from public._multideck_finance_mirror_state(p_entity);
    if not native_enabled then raise exception 'Enable the native ledger before posting.' using errcode='22023'; end if;
    if mode='required' and not connected then raise exception 'An active accounts system connection is required.' using errcode='22023'; end if;
    select upper("LegalEntity_BaseCurrencyCodeSnapshot") into cur from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
    if cur is distinct from j.currency then raise exception 'The base currency changed. Recreate this draft.' using errcode='22023'; end if;
    period_id:=public._multideck_finance_ensure_period(p_entity,to_char(j.accounting_date,'YYYYMM'),p_actor);
    perform 1 from public."FIN_Periods" where "FINPeriod_ID"=period_id and "FINPeriod_StatusCode"='open' for update;
    if not found then raise exception 'Choose an open accounting period.' using errcode='22023'; end if;
    for l in select value from jsonb_array_elements(j.lines) loop
      perform 1 from public."FIN_NominalAccounts" where "FINNom_ID"=(l->>'accountId')::uuid and "FINNom_LegalEntityID"=p_entity and "FINNom_IsActive" and "FINNom_AllowManualPosting" and not "FINNom_IsControlAccount" for share;
      if not found then raise exception 'A journal account is no longer available for manual posting.' using errcode='22023'; end if;
      debit:=(l->>'debit')::numeric; credit:=(l->>'credit')::numeric;
      if not ((debit>0 and credit=0) or (credit>0 and debit=0)) then raise exception 'Each journal line must have a debit or a credit.' using errcode='22023'; end if;
      dt:=dt+debit; ct:=ct+credit;
    end loop;
    if dt<>ct or dt<=0 then raise exception 'Debits and credits must balance before posting.' using errcode='22023'; end if;
    insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy")
      values('JN-'||j.number,'posted','FIN_Journals',j.id,period_id,p_entity,dt,ct,j.currency,now(),p_actor,p_actor) returning "FINPostBatch_ID" into batch;
    for l in select value from jsonb_array_elements(j.lines) loop
      idx:=idx+1;
      insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot")
        values(batch,idx,(l->>'accountId')::uuid,coalesce(nullif(l->>'description',''),j.description),(l->>'debit')::numeric,(l->>'credit')::numeric,j.currency);
    end loop;
    update public."FIN_Journals" set status='posted',batch_id=batch,posted_at=now(),posted_by=p_actor,version=version+1,
      mirror_status=case when mode<>'disabled' and connected then 'queued' else 'not_required' end where id=j.id returning * into j;
  elsif p_action='claim' then
    if j.status<>'posted' or j.mirror_status='not_required' then raise exception 'This journal does not require delivery.' using errcode='22023'; end if;
    if j.mirror_status='synced' then return to_jsonb(j); end if;
    if j.mirror_lease_until>now() then raise exception 'Journal delivery is already in progress.' using errcode='22023'; end if;
    -- Pin the reviewed payload once an external attempt is possible. Changed
    -- mappings/companies must not create another journal on an uncertain retry.
    update public."FIN_Journals" set mirror_payload=coalesce(mirror_payload,p_input->'payload'),mirror_connection_id=coalesce(mirror_connection_id,(p_input->>'connectionId')::uuid),
      mirror_token=gen_random_uuid(),mirror_lease_until=now()+interval '5 minutes',mirror_status='sending',mirror_attempts=mirror_attempts+1,mirror_error=null
      where id=j.id returning * into j;
  elsif p_action='delivery_error' then
    if j.status<>'posted' or j.mirror_status in ('not_required','synced') or j.mirror_lease_until>now() then return to_jsonb(j); end if;
    update public."FIN_Journals" set mirror_status='failed',mirror_error=left(p_input->>'error',500) where id=j.id returning * into j;
  elsif p_action='finish' then
    if j.mirror_token is distinct from (p_input->>'token')::uuid or j.mirror_status<>'sending' then raise exception 'Delivery reservation expired. Refresh the journal.' using errcode='22023'; end if;
    update public."FIN_Journals" set mirror_status=case when p_input->>'status'='synced' then 'synced' else 'failed' end,
      external_id=coalesce(p_input->>'externalId',external_id),mirrored_at=case when p_input->>'status'='synced' then now() else mirrored_at end,
      mirror_error=left(p_input->>'error',500),mirror_lease_until=null,mirror_token=null where id=j.id returning * into j;
  end if;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_Journals','journal',j.id,p_action,'General ledger journal '||p_action,true,1,jsonb_build_object('number',j.number,'status',j.status,'version',j.version,'mirrorStatus',j.mirror_status));
  return to_jsonb(j);
end; $$;
revoke all on function public.multideck_finance_journal(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_journal(uuid,uuid,text,jsonb) to service_role;

create function public.multideck_finance_gl_enquiry(p_actor uuid,p_entity uuid,p_from text,p_to text,p_account uuid default null,p_offset integer default 0)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View');
  if p_from !~ '^[0-9]{6}$' or p_to !~ '^[0-9]{6}$' or p_from>p_to or p_offset<0 then raise exception 'Choose a valid period range.' using errcode='22023'; end if;
  if p_account is not null and not exists(select 1 from public."FIN_NominalAccounts" where "FINNom_ID"=p_account and "FINNom_LegalEntityID"=p_entity) then raise exception 'Account not found.' using errcode='P0002'; end if;
  with entries as (
    select l."FINPostLine_ID" id,b."FINPostBatch_ID" "batchId",b."FINPostBatch_Number" number,b."FINPostBatch_SourceTable" source,b."FINPostBatch_SourceID" "sourceId",
      p."FINPeriod_Code" period,b."FINPostBatch_PostedAt" "postedAt",a."FINNom_ID" "accountId",a."FINNom_Code" "accountCode",a."FINNom_Name" "accountName",
      l."FINPostLine_Description" description,l."FINPostLine_DebitAmount" debit,l."FINPostLine_CreditAmount" credit,l."FINPostLine_LineNo" "lineNo"
    from public."FIN_PostingLines" l join public."FIN_PostingBatches" b on b."FINPostBatch_ID"=l."FINPostLine_BatchID"
      join public."FIN_Periods" p on p."FINPeriod_ID"=b."FINPostBatch_PeriodID" and p."FINPeriod_LegalEntityID"=p_entity
      join public."FIN_NominalAccounts" a on a."FINNom_ID"=l."FINPostLine_NominalAccountID" and a."FINNom_LegalEntityID"=p_entity
    where b."FINPostBatch_LegalEntityID"=p_entity and b."FINPostBatch_StatusCode"='posted' and (p_account is null or a."FINNom_ID"=p_account) and p."FINPeriod_Code"<=p_to
  ), page as (select * from entries where period>=p_from order by period desc,"postedAt" desc,"batchId","lineNo" limit 100 offset p_offset)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
    'count',(select count(*) from entries where period>=p_from),
    'opening',coalesce((select sum(debit-credit) from entries where period<p_from),0),
    'debit',coalesce((select sum(debit) from entries where period>=p_from),0),
    'credit',coalesce((select sum(credit) from entries where period>=p_from),0),
    'closing',coalesce((select sum(debit-credit) from entries),0)) into result;
  return result;
end; $$;
revoke all on function public.multideck_finance_gl_enquiry(uuid,uuid,text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.multideck_finance_gl_enquiry(uuid,uuid,text,text,uuid,integer) to service_role;

-- A separate permission-scoped domain avoids exposing manual journals through
-- the broader sales/purchase-ledger read permission.
create function public.multideck_dexter_domain_general_ledger(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(record),'[]'::jsonb) from (
    select jsonb_build_object('recordId',j.id,'recordKind','general_ledger_journal','number','JN-'||j.number,'status',j.status,
      'accountingDate',j.accounting_date,'description',j.description,'reference',j.reference,'currency',j.currency,'lines',j.lines,
      'mirrorStatus',j.mirror_status,'mirrorError',j.mirror_error,'externalId',j.external_id,'route','/finance/general-ledger/journals',
      'evidence',jsonb_build_object('sourceTable','FIN_Journals','sourceId',j.id,'legalEntityId',j.legal_entity_id,'postingBatchId',j.batch_id,'updatedAt',coalesce(j.mirrored_at,j.posted_at,j.created_at))) record
    from public."FIN_Journals" j join public."cmp_LegalEntities" e on e."LegalEntity_ID"=j.legal_entity_id
    where e."Company_ID"=p_company_id and e."LegalEntity_IsActive" and (nullif(trim(p_search),'') is null or concat_ws(' ',j.number,j.reference,j.description,j.status,j.mirror_status) ilike '%'||trim(p_search)||'%')
    order by j.number desc limit greatest(1,least(coalesce(p_take,10),25))
  ) records;
$$;
revoke all on function public.multideck_dexter_domain_general_ledger(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_general_ledger(uuid,text,integer) to service_role;
insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON")
  values('general_ledger','General ledger journals','Manual journal drafts, posted entries and accounts system delivery evidence. Journal writes and delivery retries remain explicit manual controls in General ledger.','multideck_dexter_domain_general_ledger','["Finance.Management.View"]','["financial_record"]');
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON")
  values('general_ledger','General ledger journals','Journal posting and accounts system delivery changes. Open Finance > General ledger > Journals to act.','["status","mirrorStatus"]','["Finance.Management.View"]');
create function public._multideck_journal_watch() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare company uuid; previous jsonb; current_state jsonb;
begin
  select "Company_ID" into company from public."cmp_LegalEntities" where "LegalEntity_ID"=new.legal_entity_id;
  previous:=case when tg_op='INSERT' then '{}'::jsonb else jsonb_build_object('status',old.status,'mirrorStatus',old.mirror_status) end;
  current_state:=jsonb_build_object('status',new.status,'mirrorStatus',new.mirror_status);
  if previous is distinct from current_state and exists(select 1 from public."AI_DexterWatches" w join public."cmp_Users" u on u."User_ID"=w."AIDexterWatch_OwnerUserID"
    where w."AIDexterWatch_CompanyID"=company and u."Company_ID"=company and u."User_AccessStatus"='active'
      and public._multideck_dexter_has_permission(u."User_ID",'Finance.Management.View')
      and w."AIDexterWatch_CapabilityCode"='general_ledger' and w."AIDexterWatch_StatusCode"='active' and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=new.id)) then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
      values(company,'general_ledger','FIN_Journals',new.id,previous,current_state);
  end if;
  return new;
end; $$;
revoke all on function public._multideck_journal_watch() from public,anon,authenticated;
create trigger journal_watch after insert or update of status,mirror_status on public."FIN_Journals" for each row execute function public._multideck_journal_watch();

-- Recheck each watch owner at event delivery, including if another eligible
-- colleague caused a signal to be produced for the same company.
do $patch$
declare definition text; marker text;
begin
  definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker:=E'      and watch_row."AIDexterWatch_StatusCode" = ''active''';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review general ledger watch access guard before applying'; end if;
  definition:=replace(definition,marker,marker || $guard$
      and (watch_row."AIDexterWatch_CapabilityCode" <> 'general_ledger' or exists (
        select 1 from public."cmp_Users" u join public."FIN_Journals" j on j.id=new."AIDexterWatchSignal_SourceID"
          join public."cmp_LegalEntities" e on e."LegalEntity_ID"=j.legal_entity_id
        where u."User_ID"=watch_row."AIDexterWatch_OwnerUserID" and u."Company_ID"=e."Company_ID"
          and e."Company_ID"=watch_row."AIDexterWatch_CompanyID" and e."LegalEntity_IsActive" and u."User_AccessStatus"='active'
          and public._multideck_dexter_has_permission(u."User_ID",'Finance.Management.View')
      ))$guard$);
  marker:='if v_matches and (';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review journal watch repeat guard before applying'; end if;
  definition:=replace(definition,marker,marker || $repeat$
        (watch."AIDexterWatch_CapabilityCode"='general_ledger' and watch."AIDexterWatch_RuleJSON"->>'operator'='changed') or $repeat$);
  execute definition;
end $patch$;

create function public.multideck_dexter_can_read_journal_watch(p_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public."cmp_Users" u where u."Auth_User_ID"=auth.uid() and u."Company_ID"=p_company_id
    and u."User_AccessStatus"='active' and public._multideck_dexter_has_permission(u."User_ID",'Finance.Management.View'));
$$;
revoke all on function public.multideck_dexter_can_read_journal_watch(uuid) from public,anon;
grant execute on function public.multideck_dexter_can_read_journal_watch(uuid) to authenticated,service_role;
create policy "Journal watches require current ledger access" on public."AI_DexterWatches" as restrictive for select to authenticated
  using ("AIDexterWatch_CapabilityCode"<>'general_ledger' or public.multideck_dexter_can_read_journal_watch("AIDexterWatch_CompanyID"));
create policy "Journal watch history requires current ledger access" on public."AI_DexterWatchEvents" as restrictive for select to authenticated
  using (exists(select 1 from public."AI_DexterWatches" w where w."AIDexterWatch_ID"="AIDexterWatchEvent_WatchID"));
alter function public.multideck_dexter_list_watches() rename to _multideck_dexter_list_watches_before_journals_20260918;
create function public.multideck_dexter_list_watches() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb)
  from jsonb_array_elements(public._multideck_dexter_list_watches_before_journals_20260918()) with ordinality as rows(item,ordinal)
  where item->>'capability'<>'general_ledger' or exists(select 1 from public."AI_DexterWatches" w
    where w."AIDexterWatch_ID"=(item->>'id')::uuid and public.multideck_dexter_can_read_journal_watch(w."AIDexterWatch_CompanyID"));
$$;
revoke all on function public._multideck_dexter_list_watches_before_journals_20260918() from public,anon,authenticated;
revoke all on function public.multideck_dexter_list_watches() from public,anon;
grant execute on function public.multideck_dexter_list_watches() to authenticated,service_role;

commit;
