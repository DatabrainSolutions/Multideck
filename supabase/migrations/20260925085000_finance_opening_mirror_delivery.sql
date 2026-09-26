begin;

create table public."FIN_OpeningMirrorDeliveries" (
  package_id uuid primary key references public."FIN_OpeningBalancePackages"(id) on delete restrict,
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  connection_id uuid not null references public."ACCI_Connections"("ACCIC_ID") on delete restrict,
  status text not null default 'queued' check(status in ('queued','leased','matched','failed')),
  payload jsonb check(payload is null or jsonb_typeof(payload)='object'),
  external_id text,
  readback_hash text check(readback_hash is null or readback_hash ~ '^[a-f0-9]{64}$'),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  attempt_count integer not null default 0 check(attempt_count>=0),
  queued_at timestamptz not null default now(),
  matched_at timestamptz,
  updated_at timestamptz not null default now(),
  check(status<>'matched' or (external_id is not null and readback_hash is not null and matched_at is not null))
);
create unique index fin_opening_mirror_provider_identity on public."FIN_OpeningMirrorDeliveries"(connection_id,external_id) where external_id is not null;
alter table public."FIN_OpeningMirrorDeliveries" enable row level security;
revoke all on public."FIN_OpeningMirrorDeliveries" from public,anon,authenticated;
grant select,insert,update on public."FIN_OpeningMirrorDeliveries" to service_role;

create function public.multideck_finance_opening_mirror_enqueue(p_actor uuid,p_entity uuid,p_package uuid,p_connection uuid)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare package public."FIN_OpeningBalancePackages"; connection public."ACCI_Connections"; delivery public."FIN_OpeningMirrorDeliveries"; new_queue boolean;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Post');
  select * into package from public."FIN_OpeningBalancePackages" where id=p_package and legal_entity_id=p_entity and status='posted' for share;
  select * into connection from public."ACCI_Connections" where "ACCIC_ID"=p_connection and "ACCIC_LegalEntityID"=p_entity
    and "ACCIC_ProviderCode"='erpnext' and "ACCIC_StatusCode"='active' and "ACCIC_ExternalBaseCurrencyCode"=package.base_currency for share;
  if package.id is null or connection."ACCIC_ID" is null or package.posting_batch_id is null or package.opening_date is null then
    raise exception 'A posted opening package and exact active ERPNext connection are required.' using errcode='22023';
  end if;
  insert into public."FIN_OpeningMirrorDeliveries"(package_id,legal_entity_id,connection_id)
    values(p_package,p_entity,p_connection) on conflict(package_id) do nothing;
  new_queue:=found;
  select * into delivery from public."FIN_OpeningMirrorDeliveries" where package_id=p_package;
  if delivery.connection_id<>p_connection or delivery.legal_entity_id<>p_entity then
    raise exception 'This opening package is pinned to another accounts system connection.' using errcode='22023';
  end if;
  if new_queue then
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
      values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_OpeningMirrorDeliveries','opening_balances',p_package,'mirror_enqueue','Opening balance accounts system delivery queued',jsonb_build_object('connectionId',p_connection,'sourceSha256',package.source_sha256));
  end if;
  return jsonb_build_object('packageId',p_package,'status',delivery.status,'connectionId',p_connection,'externalId',delivery.external_id);
end; $$;
revoke all on function public.multideck_finance_opening_mirror_enqueue(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_opening_mirror_enqueue(uuid,uuid,uuid,uuid) to service_role;

create function public.multideck_finance_opening_mirror_claim(p_actor uuid,p_entity uuid,p_package uuid,p_payload jsonb)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare delivery public."FIN_OpeningMirrorDeliveries"; package public."FIN_OpeningBalancePackages"; connection public."ACCI_Connections"; token uuid;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Integration.Manage');
  select * into delivery from public."FIN_OpeningMirrorDeliveries" where package_id=p_package and legal_entity_id=p_entity for update;
  if delivery.package_id is null then raise exception 'This opening package has not been queued for a linked mirror.' using errcode='P0002'; end if;
  select * into package from public."FIN_OpeningBalancePackages" where id=p_package and legal_entity_id=p_entity and status='posted';
  select * into connection from public."ACCI_Connections" where "ACCIC_ID"=delivery.connection_id and "ACCIC_LegalEntityID"=p_entity
    and "ACCIC_ProviderCode"='erpnext' and "ACCIC_StatusCode"='active' and "ACCIC_ExternalBaseCurrencyCode"=package.base_currency;
  if package.id is null or connection."ACCIC_ID" is null then raise exception 'The opening package or pinned ERPNext connection changed.' using errcode='22023'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'id' is distinct from package.id::text
    or p_payload->>'company' is distinct from connection."ACCIC_ExternalTenantName" or p_payload->>'currency' is distinct from package.base_currency
    or p_payload->>'date' is distinct from package.opening_date::text or p_payload->>'sourceSha256' is distinct from package.source_sha256
    or jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines')<2 then
    raise exception 'Opening journal source identity or balanced lines are incomplete.' using errcode='22023';
  end if;
  if delivery.payload is not null and delivery.payload is distinct from p_payload then
    raise exception 'The frozen opening journal changed. Review its provider identity before retrying.' using errcode='22023';
  end if;
  if delivery.status='matched' then return jsonb_build_object('status','matched','externalId',delivery.external_id,'readbackHash',delivery.readback_hash); end if;
  if delivery.status='leased' and delivery.lease_until>now() then raise exception 'Opening journal delivery is already in progress.' using errcode='55000'; end if;
  token:=gen_random_uuid();
  update public."FIN_OpeningMirrorDeliveries" set status='leased',payload=coalesce(payload,p_payload),lease_token=token,
    lease_until=now()+interval '2 minutes',attempt_count=attempt_count+1,last_error=null,updated_at=now()
    where package_id=p_package returning * into delivery;
  return jsonb_build_object('status','leased','packageId',p_package,'connectionId',delivery.connection_id,'token',token,'payload',delivery.payload,'externalId',delivery.external_id);
end; $$;
revoke all on function public.multideck_finance_opening_mirror_claim(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_opening_mirror_claim(uuid,uuid,uuid,jsonb) to service_role;

create function public.multideck_finance_opening_mirror_finish(p_actor uuid,p_entity uuid,p_package uuid,p_token uuid,p_status text,p_external_id text,p_readback_hash text,p_error text)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare delivery public."FIN_OpeningMirrorDeliveries";
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Integration.Manage');
  select * into delivery from public."FIN_OpeningMirrorDeliveries" where package_id=p_package and legal_entity_id=p_entity for update;
  if delivery.package_id is null or delivery.status<>'leased' or delivery.lease_token is distinct from p_token or delivery.lease_until<=now() then
    raise exception 'The opening journal delivery reservation expired or changed.' using errcode='55000';
  end if;
  if p_status='matched' then
    if p_external_id is null or length(btrim(p_external_id)) not between 1 and 240 or p_readback_hash is null or p_readback_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'Exact provider journal readback is required before a match.' using errcode='22023'; end if;
    if delivery.external_id is not null and delivery.external_id<>p_external_id then
      raise exception 'A different provider opening journal was retained.' using errcode='22023'; end if;
    update public."FIN_OpeningMirrorDeliveries" set status='matched',external_id=p_external_id,readback_hash=p_readback_hash,
      matched_at=now(),lease_token=null,lease_until=null,updated_at=now() where package_id=p_package returning * into delivery;
  elsif p_status='failed' then
    if length(btrim(coalesce(p_error,''))) not between 5 and 1000 then raise exception 'Record the provider delivery failure.' using errcode='22023'; end if;
    if delivery.external_id is not null and p_external_id is not null and delivery.external_id<>p_external_id then
      raise exception 'A different provider opening journal was retained.' using errcode='22023'; end if;
    update public."FIN_OpeningMirrorDeliveries" set status='failed',external_id=coalesce(external_id,p_external_id),
      last_error=btrim(p_error),lease_token=null,lease_until=null,updated_at=now() where package_id=p_package returning * into delivery;
  else raise exception 'Choose a matched or failed delivery result.' using errcode='22023';
  end if;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_OpeningMirrorDeliveries','opening_balances',p_package,'mirror_'||p_status,'Opening balance accounts system delivery',jsonb_build_object('status',p_status,'externalId',delivery.external_id,'readbackHash',delivery.readback_hash,'connectionId',delivery.connection_id));
  return jsonb_build_object('status',delivery.status,'externalId',delivery.external_id,'readbackHash',delivery.readback_hash,'attemptCount',delivery.attempt_count);
end; $$;
revoke all on function public.multideck_finance_opening_mirror_finish(uuid,uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_opening_mirror_finish(uuid,uuid,uuid,uuid,text,text,text,text) to service_role;

commit;
