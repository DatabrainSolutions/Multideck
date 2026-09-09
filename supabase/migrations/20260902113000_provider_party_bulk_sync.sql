-- Retain customer and supplier bulk-sync results as tenant-company finance
-- evidence. Provider master-data writes remain a deliberate register action;
-- Dexter can read the result and react to completed runs, but cannot initiate it.

begin;

alter function public.multideck_dexter_domain_finance(uuid,text,integer)
  rename to _multideck_dexter_domain_finance_before_provider_party_sync;
revoke all on function public._multideck_dexter_domain_finance_before_provider_party_sync(uuid,text,integer) from public,anon,authenticated;
grant execute on function public._multideck_dexter_domain_finance_before_provider_party_sync(uuid,text,integer) to service_role;

create function public.multideck_dexter_domain_finance(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with records as (
    select value,coalesce((value->'evidence'->>'updatedAt')::timestamptz,'2000-01-01'::timestamptz) updated_at
    from jsonb_array_elements(public._multideck_dexter_domain_finance_before_provider_party_sync(p_company_id,p_search,p_take)) value
    union all
    select jsonb_build_object(
      'recordId',run."ACCISR_ID",'recordKind','provider_party_sync','partyType',run."ACCISR_SettingsJSON"->>'partyType',
      'providerCode',connection."ACCIC_ProviderCode",'providerName',connection."ACCIC_Name",'externalCompany',connection."ACCIC_ExternalTenantName",
      'status',run."ACCISR_StatusCode",'processed',run."ACCISR_RecordsRead",
      'synced',run."ACCISR_RecordsCreated"+run."ACCISR_RecordsUpdated",'failed',run."ACCISR_RecordsFailed",
      'accountResults',coalesce((
        select jsonb_agg(jsonb_build_object(
          'organisationId',event."ACCISE_LocalID",'organisationName',event."ACCISE_ResponsePayloadJSON"->>'organisationName',
          'accountCode',event."ACCISE_ResponsePayloadJSON"->>'accountCode',
          'status',case when event."ACCISE_Severity"='error' then 'failed' else 'synced' end,
          'action',event."ACCISE_ResponsePayloadJSON"->>'action','providerPartyId',event."ACCISE_ExternalID",'message',event."ACCISE_Message"
        ) order by event."ACCISE_CreatedAt")
        from public."ACCI_SyncEvents" event
        where event."ACCISE_SyncRunID"=run."ACCISR_ID" and event."ACCISE_EventCode" in ('party_account_synced','party_account_sync_failed')
      ),'[]'::jsonb),
      'registerRoute',case when run."ACCISR_SettingsJSON"->>'partyType'='supplier' then '/suppliers' else '/customers' end,
      'evidence',jsonb_build_object('sourceTable','ACCI_SyncRuns','sourceId',run."ACCISR_ID",'connectionId',connection."ACCIC_ID",'updatedAt',coalesce(run."ACCISR_CompletedAt",run."ACCISR_CreatedAt"))
    ),coalesce(run."ACCISR_CompletedAt",run."ACCISR_CreatedAt")
    from public."ACCI_SyncRuns" run
    join public."ACCI_Connections" connection on connection."ACCIC_ID"=run."ACCISR_ConnectionID"
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=connection."ACCIC_LegalEntityID"
    where entity."Company_ID"=p_company_id and run."ACCISR_SettingsJSON"->>'kind'='party_master'
      and (nullif(btrim(p_search),'') is null or concat_ws(' ',run."ACCISR_SettingsJSON"->>'partyType',connection."ACCIC_ProviderCode",connection."ACCIC_Name",connection."ACCIC_ExternalTenantName",run."ACCISR_StatusCode",'account sync') ilike '%'||btrim(p_search)||'%')
  )
  select coalesce(jsonb_agg(value order by updated_at desc),'[]'::jsonb)
  from (select * from records order by updated_at desc limit greatest(1,least(coalesce(p_take,10),25))) limited;
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_finance(uuid,text,integer) to service_role;

create or replace function public._multideck_dexter_provider_party_sync_watch_change()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_company uuid; v_legal_entity uuid; v_old jsonb; v_new jsonb;
begin
  select entity."Company_ID",entity."LegalEntity_ID" into v_company,v_legal_entity
  from public."ACCI_Connections" connection
  join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=connection."ACCIC_LegalEntityID"
  where connection."ACCIC_ID"=new."ACCISR_ConnectionID";
  v_old:=jsonb_build_object('accountSyncStatus',old."ACCISR_StatusCode",'partyType',old."ACCISR_SettingsJSON"->>'partyType','processed',old."ACCISR_RecordsRead",'synced',old."ACCISR_RecordsCreated"+old."ACCISR_RecordsUpdated",'failed',old."ACCISR_RecordsFailed",'connectionId',old."ACCISR_ConnectionID",'legalEntityId',v_legal_entity);
  v_new:=jsonb_build_object('accountSyncStatus',new."ACCISR_StatusCode",'partyType',new."ACCISR_SettingsJSON"->>'partyType','processed',new."ACCISR_RecordsRead",'synced',new."ACCISR_RecordsCreated"+new."ACCISR_RecordsUpdated",'failed',new."ACCISR_RecordsFailed",'connectionId',new."ACCISR_ConnectionID",'legalEntityId',v_legal_entity);
  if new."ACCISR_SettingsJSON"->>'kind'='party_master' and new."ACCISR_StatusCode" in ('synced','failed') and v_old is distinct from v_new and v_company is not null and exists(
    select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=v_company and watch."AIDexterWatch_CapabilityCode"='finance' and watch."AIDexterWatch_StatusCode"='active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" in (new."ACCISR_ID",new."ACCISR_ConnectionID",v_legal_entity))
  ) then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(v_company,'finance','ACCI_SyncRuns',new."ACCISR_ID",v_old,v_new);
  end if;
  return new;
end; $$;
revoke all on function public._multideck_dexter_provider_party_sync_watch_change() from public,anon,authenticated;

drop trigger if exists "TR_ACCI_SyncRuns_dexter_party_watch" on public."ACCI_SyncRuns";
create trigger "TR_ACCI_SyncRuns_dexter_party_watch"
after update of "ACCISR_StatusCode","ACCISR_RecordsRead","ACCISR_RecordsCreated","ACCISR_RecordsUpdated","ACCISR_RecordsFailed"
on public."ACCI_SyncRuns" for each row execute function public._multideck_dexter_provider_party_sync_watch_change();

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Tenant-safe native finance, AR/AP, cash, charge profitability, external mirror state, compliance obligations and customer or supplier account-sync evidence.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='finance';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Event-driven finance documents, postings, charge profitability, external mirror delivery and completed customer or supplier account-sync runs.',
  "AIDexterWatchCapability_FieldsJSON"=(select coalesce(jsonb_agg(distinct value),'[]'::jsonb) from jsonb_array_elements(coalesce("AIDexterWatchCapability_FieldsJSON",'[]'::jsonb)||'["accountSyncStatus","partyType","processed","synced","failed"]'::jsonb)),
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='finance';

commit;
