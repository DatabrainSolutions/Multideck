-- Provider-authoritative catch-up supplements signed webhooks. Discovery never posts.
begin;

alter table public."ACCI_WebhookEvents"
  add column "ACCIWH_SourceCode" text not null default 'webhook';
alter table public."ACCI_WebhookEvents"
  add constraint "ACCI_WebhookEvents_source" check ("ACCIWH_SourceCode" in ('webhook','scan'));
alter table public."ACCI_WebhookEvents" drop constraint "ACCI_WebhookEvents_receipt_evidence";
alter table public."ACCI_WebhookEvents" add constraint "ACCI_WebhookEvents_receipt_evidence" check (
  "ACCIWH_DeliveryKey" is null or (
    "ACCIWH_DeliveryKey" ~ '^[a-f0-9]{64}$'
    and "ACCIWH_PayloadSHA256" ~ '^[a-f0-9]{64}$'
    and "ACCIWH_RawPayloadText" is not null
    and octet_length("ACCIWH_RawPayloadText") between 1 and 262144
    and "ACCIWH_ExternalCompany" is not null
    and length("ACCIWH_ExternalCompany") between 1 and 240
    and "ACCIWH_ExternalModifiedAt" is not null
    and ("ACCIWH_SourceCode" <> 'webhook' or "ACCIWH_SignatureVerified")
    and ("ACCIWH_SourceCode" <> 'scan' or not "ACCIWH_SignatureVerified")
  )
);

create table public."ACCI_ProviderScanCursors" (
  connection_id uuid not null references public."ACCI_Connections"("ACCIC_ID") on delete restrict,
  object_type text not null check (object_type in ('Sales Invoice','Purchase Invoice','Payment Entry')),
  revision bigint not null default 0 check (revision >= 0),
  watermark timestamp without time zone,
  upper_bound timestamp without time zone,
  cursor_modified timestamp without time zone,
  cursor_name text,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (connection_id,object_type),
  check ((upper_bound is null and cursor_modified is null and cursor_name is null)
    or (upper_bound is not null and (cursor_modified is null) = (cursor_name is null)))
);
alter table public."ACCI_ProviderScanCursors" enable row level security;
revoke all on public."ACCI_ProviderScanCursors" from public,anon,authenticated;
grant select,insert,update on public."ACCI_ProviderScanCursors" to service_role;

-- Each page and its checkpoint commit together. Revision fencing prevents two
-- overlapping cron calls from skipping a page. Repeated observations deduplicate.
create function public.multideck_erpnext_record_scan_page(
  p_connection uuid,p_type text,p_revision bigint,p_lower text,p_upper text,
  p_cursor_modified text,p_cursor_name text,p_rows jsonb,p_has_more boolean,p_site text
) returns boolean language plpgsql security invoker
set search_path = pg_catalog,public set datestyle = 'ISO, YMD' as $$
declare
  c public."ACCI_Connections";
  s public."ACCI_ProviderScanCursors";
  row_item jsonb;
  name_value text;
  modified_value timestamp without time zone;
  lower_value timestamp without time zone;
  upper_value timestamp without time zone;
  payload jsonb;
  raw_text text;
  key_value text;
  prior_modified timestamp without time zone;
  prior_name text;
begin
  if p_type not in ('Sales Invoice','Purchase Invoice','Payment Entry')
    or p_revision is null or p_revision < 0
    or p_has_more is null or jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) > 100
    or (p_has_more and jsonb_array_length(p_rows) = 0)
    or p_lower is null or p_upper is null
    or p_lower !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$'
    or p_upper !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$'
    or (p_cursor_modified is null) <> (p_cursor_name is null)
    or (p_cursor_modified is not null and p_cursor_modified !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$')
    or (p_cursor_name is not null and (length(p_cursor_name) not between 1 and 240 or btrim(p_cursor_name)='')) then
    raise exception 'Invalid ERPNext scan page.' using errcode='22023';
  end if;
  lower_value := p_lower::timestamp;
  upper_value := p_upper::timestamp;
  if lower_value > upper_value then raise exception 'Scan range is reversed.' using errcode='22023'; end if;
  select * into c from public."ACCI_Connections" where "ACCIC_ID"=p_connection for share;
  if not found or c."ACCIC_ProviderCode" <> 'erpnext' or c."ACCIC_StatusCode" <> 'active'
    or c."ACCIC_ExternalTenantName" is null
    or c."ACCIC_SettingsJSON"#>>'{partySync,siteOrigin}' is distinct from p_site
    or not exists (select 1 from public."cmp_LegalEntities" e
      where e."LegalEntity_ID"=c."ACCIC_LegalEntityID"
        and e."LegalEntity_IsActive" and e."Company_ID" is not null)
    or (select count(*) from public."ACCI_Connections" x
        join public."cmp_LegalEntities" e on e."LegalEntity_ID"=x."ACCIC_LegalEntityID"
        where x."ACCIC_ProviderCode"='erpnext' and x."ACCIC_StatusCode"='active'
          and x."ACCIC_ExternalTenantName"=c."ACCIC_ExternalTenantName"
          and x."ACCIC_SettingsJSON"#>>'{partySync,siteOrigin}'=p_site
          and e."LegalEntity_IsActive" and e."Company_ID" is not null) <> 1 then
    raise exception 'ERPNext scan connection scope is unavailable.' using errcode='42501';
  end if;
  insert into public."ACCI_ProviderScanCursors"(connection_id,object_type)
    values(p_connection,p_type) on conflict do nothing;
  select * into s from public."ACCI_ProviderScanCursors"
    where connection_id=p_connection and object_type=p_type for update;
  if s.revision <> p_revision
    or s.cursor_modified is distinct from p_cursor_modified::timestamp
    or s.cursor_name is distinct from p_cursor_name
    or (s.upper_bound is not null and s.upper_bound <> upper_value)
    or (s.watermark is not null and lower_value <> greatest(timestamp '1900-01-01',s.watermark-interval '1 hour'))
    or (s.watermark is null and lower_value <> timestamp '1900-01-01')
    or (s.watermark is not null and upper_value < s.watermark) then
    return false;
  end if;
  prior_modified := p_cursor_modified::timestamp;
  prior_name := p_cursor_name;
  for row_item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(row_item) is distinct from 'object'
      or jsonb_typeof(row_item->'name') is distinct from 'string'
      or jsonb_typeof(row_item->'modified') is distinct from 'string'
      or row_item->>'company' is distinct from c."ACCIC_ExternalTenantName"
      or (row_item->>'modified') !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$' then
      raise exception 'ERPNext scan row has invalid identity.' using errcode='22023';
    end if;
    name_value := row_item->>'name';
    modified_value := (row_item->>'modified')::timestamp;
    if length(name_value) not between 1 and 240 or btrim(name_value)=''
      or modified_value < lower_value or modified_value > upper_value
      or (prior_modified is not null and (modified_value < prior_modified
        or (modified_value = prior_modified and name_value <= prior_name))) then
      raise exception 'ERPNext scan row is outside the checked range.' using errcode='22023';
    end if;
    prior_modified := modified_value;
    prior_name := name_value;
    payload := jsonb_build_object('doctype',p_type,'name',name_value,
      'company',c."ACCIC_ExternalTenantName",'modified',row_item->>'modified','event','scanned');
    raw_text := payload::text;
    key_value := encode(sha256(convert_to(jsonb_build_array(
      c."ACCIC_ExternalTenantName",p_type,name_value,'scanned',modified_value)::text,'UTF8')),'hex');
    insert into public."ACCI_WebhookEvents"(
      "ACCIWH_ConnectionID","ACCIWH_ProviderCode","ACCIWH_EventType",
      "ACCIWH_ExternalObjectType","ACCIWH_ExternalID","ACCIWH_SignatureVerified",
      "ACCIWH_ProcessingStatusCode","ACCIWH_RawPayloadJSON","ACCIWH_RawPayloadText",
      "ACCIWH_DeliveryKey","ACCIWH_PayloadSHA256","ACCIWH_ExternalCompany",
      "ACCIWH_ExternalModifiedAt","ACCIWH_SourceCode"
    ) values (p_connection,'erpnext','scanned',p_type,name_value,false,'queued',payload,raw_text,
      key_value,encode(sha256(convert_to(raw_text,'UTF8')),'hex'),c."ACCIC_ExternalTenantName",
      modified_value,'scan') on conflict ("ACCIWH_ProviderCode","ACCIWH_DeliveryKey") do nothing;
  end loop;
  update public."ACCI_ProviderScanCursors" set revision=revision+1,
    upper_bound=case when p_has_more then upper_value else null end,
    cursor_modified=case when p_has_more then prior_modified else null end,
    cursor_name=case when p_has_more then prior_name else null end,
    watermark=case when p_has_more then watermark else upper_value end,
    completed_at=case when p_has_more then completed_at else now() end,
    updated_at=now()
    where connection_id=p_connection and object_type=p_type;
  return true;
end $$;
revoke all on function public.multideck_erpnext_record_scan_page(uuid,text,bigint,text,text,text,text,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.multideck_erpnext_record_scan_page(uuid,text,bigint,text,text,text,text,jsonb,boolean,text) to service_role;

create or replace function public.multideck_erpnext_claim_inbound(p_limit integer default 5)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_jobs jsonb;
begin
  with candidates as (
    select "ACCIWH_ID" from public."ACCI_WebhookEvents"
    where "ACCIWH_ProviderCode"='erpnext'
      and (("ACCIWH_SourceCode"='webhook' and "ACCIWH_SignatureVerified")
        or ("ACCIWH_SourceCode"='scan' and not "ACCIWH_SignatureVerified"))
      and "ACCIWH_DeliveryKey" is not null
      and (("ACCIWH_ProcessingStatusCode" in ('queued','failed') and "ACCIWH_Attempts" < 8 and "ACCIWH_NextAttemptAt"<=now())
        or ("ACCIWH_ProcessingStatusCode"='processing' and "ACCIWH_LeaseUntil"<now()))
    order by "ACCIWH_ReceivedAt", "ACCIWH_ID"
    limit greatest(1,least(coalesce(p_limit,5),10)) for update skip locked
  ), claimed as (
    update public."ACCI_WebhookEvents" e set "ACCIWH_ProcessingStatusCode"='processing',
      "ACCIWH_LeaseToken"=gen_random_uuid(), "ACCIWH_LeaseUntil"=now()+interval '5 minutes',
      "ACCIWH_Attempts"=least("ACCIWH_Attempts"+1,8)
    from candidates c where c."ACCIWH_ID"=e."ACCIWH_ID" returning e.*
  ) select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb) into v_jobs from claimed;
  return v_jobs;
end $$;
revoke all on function public.multideck_erpnext_claim_inbound(integer) from public,anon,authenticated;
grant execute on function public.multideck_erpnext_claim_inbound(integer) to service_role;

commit;
