-- Durable receipt only: signed provider events never change approved books.
begin;

alter table public."ACCI_WebhookEvents"
  add column "ACCIWH_DeliveryKey" text,
  add column "ACCIWH_PayloadSHA256" text,
  add column "ACCIWH_RawPayloadText" text,
  add column "ACCIWH_ExternalCompany" text,
  add column "ACCIWH_ExternalModifiedAt" timestamp without time zone,
  add constraint "ACCI_WebhookEvents_receipt_evidence" check (
    "ACCIWH_DeliveryKey" is null or (
      "ACCIWH_DeliveryKey" ~ '^[a-f0-9]{64}$'
      and "ACCIWH_PayloadSHA256" is not null and "ACCIWH_PayloadSHA256" ~ '^[a-f0-9]{64}$'
      and "ACCIWH_RawPayloadText" is not null and octet_length("ACCIWH_RawPayloadText") between 1 and 262144
      and "ACCIWH_ExternalCompany" is not null and length("ACCIWH_ExternalCompany") between 1 and 240
      and "ACCIWH_ExternalModifiedAt" is not null and "ACCIWH_SignatureVerified"
    )
  );

-- Legacy receipts retain their original evidence. Never pretend they were scoped
-- or deduplicated by this new receiver, and never discard them to build an index.
create unique index "UX_ACCI_WebhookEvents_delivery"
  on public."ACCI_WebhookEvents" ("ACCIWH_ProviderCode", "ACCIWH_DeliveryKey");

alter table public."ACCI_WebhookEvents" enable row level security;
revoke all on table public."ACCI_WebhookEvents" from public, anon, authenticated;
grant select, insert, update on table public."ACCI_WebhookEvents" to service_role;

create or replace function public.multideck_erpnext_receive_webhook(p_raw_payload text)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
set datestyle = 'ISO, YMD'
as $$
declare
  v_payload jsonb;
  v_type text;
  v_name text;
  v_company text;
  v_event text;
  v_modified timestamp without time zone;
  v_key text;
  v_connection uuid;
  v_count integer := 0;
  v_candidate record;
  v_id uuid;
  v_existing jsonb;
begin
  -- Only the tenant Edge receiver calls this, after HMAC verification over the
  -- original bytes. The public browser roles have no EXECUTE or table grants.
  if p_raw_payload is null or octet_length(p_raw_payload) not between 1 and 262144 then
    raise exception 'Invalid webhook body size.' using errcode = '22023';
  end if;
  v_payload := p_raw_payload::jsonb;
  if jsonb_typeof(v_payload) is distinct from 'object' then
    raise exception 'Webhook payload must be an object.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_payload->'doctype') is distinct from 'string'
    or jsonb_typeof(v_payload->'name') is distinct from 'string'
    or jsonb_typeof(v_payload->'company') is distinct from 'string'
    or jsonb_typeof(v_payload->'modified') is distinct from 'string'
    or (v_payload ? 'event' and jsonb_typeof(v_payload->'event') is distinct from 'string') then
    raise exception 'Webhook identity and version must be strings.' using errcode = '22023';
  end if;
  v_type := v_payload->>'doctype';
  v_name := v_payload->>'name';
  v_company := v_payload->>'company';
  v_event := coalesce(v_payload->>'event', 'updated');
  if v_type not in ('Sales Invoice', 'Purchase Invoice', 'Payment Entry', 'Bank Account')
    or length(v_name) not between 1 and 240 or btrim(v_name) = ''
    or length(v_company) not between 1 and 240 or btrim(v_company) = ''
    or length(v_event) not between 1 and 120 or btrim(v_event) = ''
    or (v_payload->>'modified') !~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?$' then
    raise exception 'Invalid webhook identity or version.' using errcode = '22023';
  end if;
  v_modified := (v_payload->>'modified')::timestamp without time zone;

  for v_candidate in
    select connection."ACCIC_ID"
    from public."ACCI_Connections" connection
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID" = connection."ACCIC_LegalEntityID"
    where connection."ACCIC_ProviderCode" = 'erpnext'
      and connection."ACCIC_StatusCode" = 'active'
      and connection."ACCIC_ExternalTenantName" = v_company
      and entity."LegalEntity_IsActive" and entity."Company_ID" is not null
    for share of connection, entity
  loop
    v_count := v_count + 1;
    v_connection := v_candidate."ACCIC_ID";
  end loop;
  if v_count <> 1 then
    raise exception 'Webhook company must resolve to exactly one active ERPNext connection.' using errcode = 'P0002';
  end if;

  v_key := encode(sha256(convert_to(jsonb_build_array(v_company, v_type, v_name, v_event, v_modified)::text, 'UTF8')), 'hex');
  insert into public."ACCI_WebhookEvents" (
    "ACCIWH_ConnectionID", "ACCIWH_ProviderCode", "ACCIWH_EventType", "ACCIWH_ExternalObjectType", "ACCIWH_ExternalID",
    "ACCIWH_SignatureVerified", "ACCIWH_ProcessingStatusCode", "ACCIWH_RawPayloadJSON", "ACCIWH_RawPayloadText",
    "ACCIWH_DeliveryKey", "ACCIWH_PayloadSHA256", "ACCIWH_ExternalCompany", "ACCIWH_ExternalModifiedAt"
  ) values (
    v_connection, 'erpnext', v_event, v_type, v_name, true, 'queued', v_payload, p_raw_payload,
    v_key, encode(sha256(convert_to(p_raw_payload, 'UTF8')), 'hex'), v_company, v_modified
  ) on conflict ("ACCIWH_ProviderCode", "ACCIWH_DeliveryKey") do nothing
  returning "ACCIWH_ID" into v_id;

  if v_id is not null then
    return jsonb_build_object('accepted', true, 'duplicate', false, 'eventId', v_id);
  end if;
  select "ACCIWH_ID", "ACCIWH_RawPayloadJSON" into v_id, v_existing
    from public."ACCI_WebhookEvents"
    where "ACCIWH_ProviderCode" = 'erpnext' and "ACCIWH_DeliveryKey" = v_key;
  if v_id is null then
    raise exception 'Concurrent webhook receipt must be retried.' using errcode = '40001';
  end if;
  if v_existing is distinct from v_payload then
    raise exception 'Webhook version has conflicting payloads; original evidence retained.' using errcode = '23505';
  end if;
  -- Acknowledgement is idempotent: do not reset status or timestamps or overwrite
  -- original evidence when the provider retries, including after processing.
  return jsonb_build_object('accepted', true, 'duplicate', true, 'eventId', v_id);
end;
$$;

revoke all on function public.multideck_erpnext_receive_webhook(text) from public, anon, authenticated;
grant execute on function public.multideck_erpnext_receive_webhook(text) to service_role;
comment on function public.multideck_erpnext_receive_webhook(text) is
  'Service-only durable ERPNext receipt after Edge HMAC verification. No accounting mutations, customer-visible data or Dexter/watch capability. Queued is not reconciled.';

commit;
