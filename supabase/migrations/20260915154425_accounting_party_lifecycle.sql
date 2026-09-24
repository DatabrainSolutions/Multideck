-- Durable customer/supplier intent. No provider network calls inside CRM transactions.
begin;
create table public."ACCI_PartySyncQueue" (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public."ACCI_Connections"("ACCIC_ID") on delete restrict,
 org_id uuid not null references public."Org_Master"("Org_id") on delete restrict,
 party_type text not null check(party_type in ('customer','supplier')),
 revision bigint not null default 1,
 status text not null default 'queued' check(status in ('queued','processing','synced','blocked','failed')),
 lease_token uuid, lease_until timestamptz, attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 provider_id text, verified_payload jsonb, evidence jsonb not null default '{}',
 last_error text, verified_at timestamptz, updated_at timestamptz not null default now(),
 unique(connection_id,org_id,party_type)
);
alter table public."ACCI_PartySyncQueue" enable row level security;
revoke all on public."ACCI_PartySyncQueue" from public,anon,authenticated;
grant select,insert,update on public."ACCI_PartySyncQueue" to service_role;
create index "ACCI_party_due" on public."ACCI_PartySyncQueue"(next_attempt_at) where status in ('queued','failed','processing');
create index "ACCI_party_org" on public."ACCI_PartySyncQueue"(org_id);

-- Serialise all mapping writers, including reviewed legacy workflows. Existing
-- unique indexes cover equal roles; this also prevents overlapping "both" links.
create function public._accounting_party_mapping_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if not new."ACCIPM_IsActive" or new."ACCIPM_PartyType" not in ('customer','supplier','both') then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new."ACCIPM_ConnectionID"::text,0));
 if exists(select 1 from public."ACCI_PartyMappings" m where m."ACCIPM_ID"<>new."ACCIPM_ID"
  and m."ACCIPM_ConnectionID"=new."ACCIPM_ConnectionID" and m."ACCIPM_IsActive"
  and m."ACCIPM_PartyType" in ('customer','supplier','both')
  and (m."ACCIPM_PartyType"=new."ACCIPM_PartyType" or m."ACCIPM_PartyType"='both' or new."ACCIPM_PartyType"='both')
  and (m."ACCIPM_OrgID"=new."ACCIPM_OrgID" or m."ACCIPM_ProviderPartyID"=new."ACCIPM_ProviderPartyID")
  and not (m."ACCIPM_OrgID"=new."ACCIPM_OrgID" and m."ACCIPM_PartyType"=new."ACCIPM_PartyType")) then
  raise exception 'Conflicting active customer/supplier mapping. Review the existing link.' using errcode='23505';
 end if;
 return new;
end $$;
revoke all on function public._accounting_party_mapping_guard() from public,anon,authenticated;
create trigger "TR_accounting_party_mapping_guard" before insert or update on public."ACCI_PartyMappings" for each row execute function public._accounting_party_mapping_guard();

-- Called by trusted triggers and worker catch-up. Trigger rights are needed for
-- ordinary permitted CRM writes; this has no browser-callable execution grant.
create function public.multideck_accounting_enqueue_parties(p_org uuid default null,p_refresh boolean default true)
returns void language sql security definer set search_path=pg_catalog,public as $$
 insert into public."ACCI_PartySyncQueue"(connection_id,org_id,party_type)
 select distinct c."ACCIC_ID",o."Org_id",lower(t."OrgType_Name")
 from public."Org_Master" o
 join public."CRM_AccountProfiles" p on p."CRMAccount_OrgID"=o."Org_id" and not p."CRMAccount_IsDeleted"
 join public."Org_Master_Type" ot on ot."Org_ID"=o."Org_id"
 join public."Org_Types" t on t."OrgType_ID"=ot."OrgType_ID" and lower(t."OrgType_Name") in ('customer','supplier')
 join public."cmp_LegalEntities" e on e."Company_ID"=p."CRMAccount_CompanyID" and e."LegalEntity_IsActive"
   and (p."CRMAccount_LegalEntityID" is null or p."CRMAccount_LegalEntityID"=e."LegalEntity_ID")
 join public."ACCI_Connections" c on c."ACCIC_LegalEntityID"=e."LegalEntity_ID" and c."ACCIC_StatusCode"='active'
 where p_org is null or o."Org_id"=p_org
 on conflict(connection_id,org_id,party_type) do update set
 revision="ACCI_PartySyncQueue".revision+1,
 status=case when "ACCI_PartySyncQueue".status='processing' then 'processing' else 'queued' end,
 attempts=0,next_attempt_at=now(),updated_at=now() where p_refresh;
$$;
revoke all on function public.multideck_accounting_enqueue_parties(uuid,boolean) from public,anon,authenticated;
grant execute on function public.multideck_accounting_enqueue_parties(uuid,boolean) to service_role;

create function public._accounting_party_changed() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r jsonb; old_id uuid; new_id uuid;
begin
 if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new;end if;
 if tg_table_name in ('ACCI_Connections','cmp_LegalEntities','Org_Types') then
  perform public.multideck_accounting_enqueue_parties(null);
  -- Revocation also invalidates previously green rows that no longer qualify
  -- for the active-connection enqueue query.
  update public."ACCI_PartySyncQueue" q set revision=q.revision+1,
   status=case when q.status='processing' then q.status else 'queued' end,next_attempt_at=now(),updated_at=now()
   where tg_table_name='Org_Types'
    or (tg_table_name='ACCI_Connections' and q.connection_id=(to_jsonb(new)->>'ACCIC_ID')::uuid)
    or (tg_table_name='cmp_LegalEntities' and q.connection_id in(select "ACCIC_ID" from public."ACCI_Connections" where "ACCIC_LegalEntityID"=(to_jsonb(new)->>'LegalEntity_ID')::uuid));
 else
  if tg_op<>'INSERT' then
   r:=to_jsonb(old); old_id:=coalesce(r->>'Org_id',r->>'Org_ID',r->>'CRMAccount_OrgID',r->>'CRMAccountOps_OrgID')::uuid;
   if tg_table_name='Org_AddressTypes' then select "Org_ID" into old_id from public."Org_Addresses" where "OrgAdd_ID"=(r->>'OrgAdd_ID')::uuid;end if;
   if old_id is not null then perform public.multideck_accounting_enqueue_parties(old_id);end if;
  end if;
  if tg_op<>'DELETE' then
   r:=to_jsonb(new); new_id:=coalesce(r->>'Org_id',r->>'Org_ID',r->>'CRMAccount_OrgID',r->>'CRMAccountOps_OrgID')::uuid;
   if tg_table_name='Org_AddressTypes' then select "Org_ID" into new_id from public."Org_Addresses" where "OrgAdd_ID"=(r->>'OrgAdd_ID')::uuid;end if;
   if new_id is not null and new_id is distinct from old_id then perform public.multideck_accounting_enqueue_parties(new_id);end if;
  end if;
 end if;
 -- Removed roles/deleted profiles must also wake existing jobs for scope checks.
 update public."ACCI_PartySyncQueue" set revision=revision+1,
 status=case when status='processing' then status else 'queued' end,next_attempt_at=now(),updated_at=now()
 where org_id in (old_id,new_id);
 return coalesce(new,old);
end $$;
revoke all on function public._accounting_party_changed() from public,anon,authenticated;
create trigger "TR_accounting_party_master" after insert or update on public."Org_Master" for each row execute function public._accounting_party_changed();
create trigger "TR_accounting_party_role" after insert or update or delete on public."Org_Master_Type" for each row execute function public._accounting_party_changed();
create trigger "TR_accounting_party_profile" after insert or update or delete on public."CRM_AccountProfiles" for each row execute function public._accounting_party_changed();
create trigger "TR_accounting_party_address" after insert or update or delete on public."Org_Addresses" for each row execute function public._accounting_party_changed();
create trigger "TR_accounting_party_address_roles" after insert or update or delete on public."Org_AddressTypes" for each row execute function public._accounting_party_changed();
create trigger "TR_accounting_party_preferences" after insert or update or delete on public."CRM_AccountOperationalProfiles" for each row execute function public._accounting_party_changed();
create trigger "TR_accounting_party_connection" after insert or update of "ACCIC_StatusCode","ACCIC_LegalEntityID","ACCIC_SettingsJSON","ACCIC_ExternalTenantName" on public."ACCI_Connections" for each row execute function public._accounting_party_changed();
create trigger "TR_accounting_party_type_definition" after update on public."Org_Types" for each row execute function public._accounting_party_changed();
create trigger "TR_accounting_party_entity" after update of "LegalEntity_IsActive","Company_ID" on public."cmp_LegalEntities" for each row execute function public._accounting_party_changed();

create function public.multideck_accounting_claim_parties(p_limit integer default 5)
returns setof public."ACCI_PartySyncQueue" language sql security invoker set search_path=pg_catalog,public as $$
 with due as (
 select id from public."ACCI_PartySyncQueue"
 where ((status in ('queued','failed') and next_attempt_at<=now() and attempts<8)
 or (status='processing' and lease_until<now()))
 order by next_attempt_at,id for update skip locked limit greatest(1,least(p_limit,10))
 ) update public."ACCI_PartySyncQueue" q set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1
 from due where q.id=due.id returning q.*;
$$;
revoke all on function public.multideck_accounting_claim_parties(integer) from public,anon,authenticated;
grant execute on function public.multideck_accounting_claim_parties(integer) to service_role;

-- Lease/revision fencing and audit finalisation are one transaction. Stale
-- responses never turn a newer CRM change green. Existing finance Dexter reads
-- and deterministic completed-run watch signals consume the same audit records.
create function public.multideck_accounting_finish_party(p_id uuid,p_token uuid,p_revision bigint,p_result jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare q public."ACCI_PartySyncQueue"; run_id uuid; s text; provider text; org_name text;
begin
 select * into q from public."ACCI_PartySyncQueue" where id=p_id for update;
 if not found or q.lease_token is distinct from p_token or q.status<>'processing' or q.lease_until<now() then return false;end if;
 s:=p_result->>'status';
 if s not in ('synced','blocked','failed') or s is null then raise exception 'Invalid result.' using errcode='22023';end if;
 if s='synced' and (nullif(p_result->>'providerId','') is null or jsonb_typeof(p_result->'verifiedPayload')<>'object') then
  raise exception 'Provider readback evidence is required.' using errcode='22023';end if;
 if q.revision<>p_revision then
  update public."ACCI_PartySyncQueue" set status='queued',lease_token=null,lease_until=null,next_attempt_at=now() where id=q.id;
  return false;
 end if;
 if s='synced' then
  perform pg_advisory_xact_lock(hashtextextended(q.connection_id::text,0));
  if exists(select 1 from public."ACCI_PartyMappings" where "ACCIPM_ConnectionID"=q.connection_id and "ACCIPM_IsActive"
    and "ACCIPM_PartyType" in(q.party_type,'both') and
    (("ACCIPM_ProviderPartyID"=p_result->>'providerId' and "ACCIPM_OrgID"<>q.org_id)
     or ("ACCIPM_OrgID"=q.org_id and ("ACCIPM_PartyType"='both' or "ACCIPM_ProviderPartyID"<>p_result->>'providerId')))) then
   raise exception 'Conflicting provider mapping.' using errcode='23505';end if;
  insert into public."ACCI_PartyMappings"("ACCIPM_ConnectionID","ACCIPM_OrgID","ACCIPM_PartyType","ACCIPM_ProviderPartyID","ACCIPM_ProviderPartyName","ACCIPM_LastSyncedAt","ACCIPM_IsActive")
  values(q.connection_id,q.org_id,q.party_type,p_result->>'providerId',p_result->>'providerName',now(),true)
  on conflict("ACCIPM_ConnectionID","ACCIPM_OrgID","ACCIPM_PartyType") do update set
    "ACCIPM_ProviderPartyID"=excluded."ACCIPM_ProviderPartyID","ACCIPM_ProviderPartyName"=excluded."ACCIPM_ProviderPartyName","ACCIPM_LastSyncedAt"=now(),"ACCIPM_IsActive"=true;
 end if;
 select "ACCIC_ProviderCode" into provider from public."ACCI_Connections" where "ACCIC_ID"=q.connection_id;
 select "Org_Name" into org_name from public."Org_Master" where "Org_id"=q.org_id;
 insert into public."ACCI_SyncRuns"("ACCISR_ConnectionID","ACCISR_DirectionCode","ACCISR_StatusCode","ACCISR_StartedAt","ACCISR_RecordsRead","ACCISR_SettingsJSON")
 values(q.connection_id,case when q.party_type='customer' then 'sales' else 'purchase' end,'processing',now(),1,
 jsonb_build_object('kind','party_master','partyType',q.party_type,'automatic',true,'scope','party_master','queueId',q.id,'revision',q.revision)) returning "ACCISR_ID" into run_id;
 insert into public."ACCI_SyncEvents"("ACCISE_SyncRunID","ACCISE_ConnectionID","ACCISE_Severity","ACCISE_EventCode","ACCISE_Message","ACCISE_LocalTable","ACCISE_LocalID","ACCISE_ExternalObjectType","ACCISE_ExternalID","ACCISE_ResponsePayloadJSON")
 values(run_id,q.connection_id,case when s='synced' then 'info' else 'error' end,case when s='synced' then 'party_account_synced' else 'party_account_sync_failed' end,
 left(coalesce(p_result->>'message','Account sync completed.'),500),'Org_Master',q.org_id,initcap(q.party_type),p_result->>'providerId',
 jsonb_build_object('organisationName',org_name,'partyType',q.party_type,'action',coalesce(p_result->>'action',s),'scope','party_master','evidence',p_result->'evidence'));
 update public."ACCI_SyncRuns" set "ACCISR_StatusCode"=case when s='synced' then 'synced' else 'failed' end,
 "ACCISR_CompletedAt"=now(),"ACCISR_RecordsUpdated"=case when s='synced' then 1 else 0 end,"ACCISR_RecordsFailed"=case when s='synced' then 0 else 1 end where "ACCISR_ID"=run_id;
 update public."ACCI_PartySyncQueue" set status=s,lease_token=null,lease_until=null,
 provider_id=coalesce(p_result->>'providerId',provider_id),
 verified_payload=case when s='synced' then p_result->'verifiedPayload' else verified_payload end,
 verified_at=case when s='synced' then now() else verified_at end,evidence=coalesce(p_result->'evidence','{}'),
 last_error=case when s='synced' then null else left(p_result->>'message',500) end,
 next_attempt_at=now()+least(3600,power(2,least(attempts,10))::integer*30)*interval '1 second',updated_at=now() where id=q.id;
 return true;
end $$;
revoke all on function public.multideck_accounting_finish_party(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_accounting_finish_party(uuid,uuid,bigint,jsonb) to service_role;


create function public.multideck_accounting_recheck_parties(p_connection uuid)
returns integer language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n integer;
begin
 -- Backfill all current accounts for the requested connection's company only.
 perform public.multideck_accounting_enqueue_parties(p."CRMAccount_OrgID")
 from public."CRM_AccountProfiles" p join public."cmp_LegalEntities" e on e."Company_ID"=p."CRMAccount_CompanyID"
 join public."ACCI_Connections" c on c."ACCIC_LegalEntityID"=e."LegalEntity_ID" where c."ACCIC_ID"=p_connection and not p."CRMAccount_IsDeleted";
 update public."ACCI_PartySyncQueue" set status=case when status='processing' then status else 'queued' end,
 revision=revision+1,attempts=0,next_attempt_at=now(),updated_at=now() where connection_id=p_connection;
 get diagnostics n=row_count; return n;
end $$;
revoke all on function public.multideck_accounting_recheck_parties(uuid) from public,anon,authenticated;
grant execute on function public.multideck_accounting_recheck_parties(uuid) to service_role;

create table public."ACCI_PartyWorkerSettings"(singleton boolean primary key default true check(singleton),endpoint text not null,enabled boolean not null default false,last_check_at timestamptz);
alter table public."ACCI_PartyWorkerSettings" enable row level security;
revoke all on public."ACCI_PartyWorkerSettings" from public,anon,authenticated;
grant select,insert,update on public."ACCI_PartyWorkerSettings" to service_role;

create function public.multideck_accounting_party_health(p_connection uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('scope','party_master','connectionId',p_connection,'checkedAt',now(),
 'workerEnabled',coalesce((select enabled from public."ACCI_PartyWorkerSettings" where singleton),false),
 'total',count(*),'synced',count(*) filter(where status='synced'),
 'queued',count(*) filter(where status in ('queued','processing')),
 'attention',count(*) filter(where status in ('blocked','failed')),
 'oldestVerification',min(verified_at),'fullLedgerReconciled',false,
 'issues',coalesce((select jsonb_agg(r) from (
 select q.id,q.org_id,o."Org_Name" as organisation_name,q.party_type,q.status,q.last_error,q.attempts,q.verified_at,q.provider_id from public."ACCI_PartySyncQueue" q join public."Org_Master" o on o."Org_id"=q.org_id
 where q.connection_id=p_connection and q.status<>'synced' order by q.updated_at limit 100) r),'[]'::jsonb))
 from public."ACCI_PartySyncQueue" where connection_id=p_connection;
$$;
revoke all on function public.multideck_accounting_party_health(uuid) from public,anon,authenticated;
grant execute on function public.multideck_accounting_party_health(uuid) to service_role;

create function public.multideck_accounting_party_settings(p_connection uuid,p_settings jsonb,p_actor uuid)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public."ACCI_Connections" set "ACCIC_SettingsJSON"=jsonb_set("ACCIC_SettingsJSON",'{partySync}',p_settings),"ACCIC_UpdatedAt"=now(),"ACCIC_UpdatedBy"=p_actor
 where "ACCIC_ID"=p_connection;
 if not found then raise exception 'Accounting connection not found.' using errcode='P0002';end if;
 insert into public."ACCI_SyncEvents"("ACCISE_ConnectionID","ACCISE_Severity","ACCISE_EventCode","ACCISE_Message","ACCISE_ResponsePayloadJSON")
 values(p_connection,'info','party_sync_settings_changed','Automatic account sync settings changed.',jsonb_build_object('actorId',p_actor,'settings',p_settings));
end $$;
revoke all on function public.multideck_accounting_party_settings(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.multideck_accounting_party_settings(uuid,jsonb,uuid) to service_role;

-- Deployment opts the intended tenant into its worker. Secrets stay in Vault;
-- the service-only setup RPC is called by the deployment operator, never a UI.
create function public.multideck_accounting_worker_secret() returns text
language sql security definer set search_path=pg_catalog,public as $$
 select decrypted_secret from vault.decrypted_secrets where name='multideck_accounting_party_worker_secret' limit 1;
$$;
revoke all on function public.multideck_accounting_worker_secret() from public,anon,authenticated;
grant execute on function public.multideck_accounting_worker_secret() to service_role;
create function public._accounting_party_kick() returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare endpoint text; secret text;
begin
 select s.endpoint into endpoint from public."ACCI_PartyWorkerSettings" s where s.enabled;
 if endpoint is null then return;end if;
 secret:=public.multideck_accounting_worker_secret(); if secret is null then return;end if;
 perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','x-multideck-accounting-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
end $$;
revoke all on function public._accounting_party_kick() from public,anon,authenticated;
grant execute on function public._accounting_party_kick() to service_role;
create function public.multideck_accounting_configure_worker(p_endpoint text,p_enabled boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if p_endpoint !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/accounting-party-worker$' then raise exception 'Use the intended tenant Supabase worker URL.' using errcode='22023';end if;
 if not exists(select 1 from vault.decrypted_secrets where name='multideck_accounting_party_worker_secret') then
  perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'multideck_accounting_party_worker_secret');end if;
 insert into public."ACCI_PartyWorkerSettings"(endpoint,enabled) values(p_endpoint,p_enabled)
 on conflict(singleton) do update set endpoint=excluded.endpoint,enabled=excluded.enabled;
 if p_enabled then perform cron.schedule('multideck-accounting-parties','* * * * *','select public._accounting_party_kick()');
 elsif exists(select 1 from cron.job where jobname='multideck-accounting-parties') then perform cron.unschedule('multideck-accounting-parties');end if;
end $$;
revoke all on function public.multideck_accounting_configure_worker(text,boolean) from public,anon,authenticated;
grant execute on function public.multideck_accounting_configure_worker(text,boolean) to service_role;

-- A single daily catch-up per tenant also detects provider edits without webhook
-- delivery. Row locking makes simultaneous cron invocations harmless.
create function public.multideck_accounting_party_catchup() returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform 1 from public."ACCI_PartyWorkerSettings" where enabled and (last_check_at is null or last_check_at<now()-interval '1 day') for update skip locked;
 if not found then return;end if;
 perform public.multideck_accounting_enqueue_parties(null,false);
 update public."ACCI_PartySyncQueue" set status='queued',revision=revision+1,attempts=0,next_attempt_at=now(),updated_at=now()
 where status='synced' and verified_at<now()-interval '1 day';
 update public."ACCI_PartyWorkerSettings" set last_check_at=now() where enabled;
end $$;
revoke all on function public.multideck_accounting_party_catchup() from public,anon,authenticated;
grant execute on function public.multideck_accounting_party_catchup() to service_role;
select public.multideck_accounting_enqueue_parties(null);
commit;
