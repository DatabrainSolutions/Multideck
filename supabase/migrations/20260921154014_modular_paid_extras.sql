-- Paid products are independent capabilities. Customer databases default to
-- no paid access; Cloud applies ordered, tenant-bound revisions after sale.
alter table private.cloud_product_state
  drop constraint if exists cloud_product_state_features_check;
alter table private.cloud_product_state
  add constraint cloud_product_state_features_check
  check (features <@ array['icustoms','rate_management']::text[]);

create or replace function public.multideck_cloud_apply_features(
  p_tenant_id uuid,
  p_revision bigint,
  p_features text[]
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s private.cloud_product_state%rowtype;
  normalized text[];
begin
  if p_revision is null or p_revision < 1 or p_revision > 9007199254740991
    or p_features is null
    or array_position(p_features, null) is not null
    or not (p_features <@ array['icustoms','rate_management']::text[]) then
    raise exception 'Invalid feature request' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct feature order by feature), '{}'::text[])
    into normalized from unnest(p_features) feature;
  select * into s from private.cloud_product_state where singleton for update;
  if not found or s.tenant_id is distinct from p_tenant_id then
    raise exception 'Customer identity is not configured or does not match' using errcode = '42501';
  end if;
  if p_revision < s.revision or (p_revision = s.revision and normalized <> s.features) then
    raise exception 'Feature revision conflict' using errcode = '40001';
  end if;
  if p_revision > s.revision then
    insert into private.cloud_product_events(tenant_id, revision, previous_features, features)
      values(s.tenant_id, p_revision, s.features, normalized);
    update private.cloud_product_state
      set features = normalized, revision = p_revision, updated_at = now()
      where singleton;
  end if;
  return jsonb_build_object('tenantId', s.tenant_id, 'revision', p_revision, 'features', normalized);
end;
$$;
revoke all on function public.multideck_cloud_apply_features(uuid,bigint,text[]) from public, anon, authenticated;
grant execute on function public.multideck_cloud_apply_features(uuid,bigint,text[]) to service_role;

create or replace function public.multideck_cloud_product_access(p_feature text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select case p_feature
    when 'icustoms' then 'icustoms' = any(features)
    when 'rate_management' then 'rate_management' = any(features)
    when 'jenkar_phone' then jenkar_phone_verified
    else false end
  from private.cloud_product_state where singleton), false)
$$;
revoke all on function public.multideck_cloud_product_access(text) from public, anon, authenticated;
grant execute on function public.multideck_cloud_product_access(text) to service_role;

-- The browser receives booleans only. The definer is needed solely to read the
-- private singleton, and an authenticated identity is mandatory.
create or replace function public.multideck_product_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'icustoms', public.multideck_cloud_product_access('icustoms'),
    'rateManagement', public.multideck_cloud_product_access('rate_management'),
    'jenkarPhone', public.multideck_cloud_product_access('jenkar_phone')
  );
end;
$$;
revoke all on function public.multideck_product_capabilities() from public, anon;
grant execute on function public.multideck_product_capabilities() to authenticated;

-- Disabling Rate Management preserves records but immediately pauses its
-- deterministic watches. Re-enabling never resumes watches without an operator.
create function private.cloud_product_pause_rate_watches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.multideck_cloud_product_access('rate_management') then
    update public."AI_DexterWatches"
      set "AIDexterWatch_StatusCode" = 'paused',
          "AIDexterWatch_IsArmed" = true,
          "AIDexterWatch_UpdatedAt" = now()
      where "AIDexterWatch_CapabilityCode" = 'rates'
        and "AIDexterWatch_StatusCode" = 'active';
  end if;
  return null;
end;
$$;
revoke all on function private.cloud_product_pause_rate_watches() from public, anon, authenticated, service_role;
create trigger cloud_product_rate_revocation
after insert or update or delete on private.cloud_product_state
for each statement execute function private.cloud_product_pause_rate_watches();

create function private.cloud_product_sync_rate_dexter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare enabled boolean := public.multideck_cloud_product_access('rate_management');
begin
  update public."sys_AIDexterDataDomains"
    set "AIDexterDomain_IsActive" = enabled
    where "AIDexterDomain_Code" = 'rates';
  update public."sys_AIDexterActions"
    set "AIDexterAction_IsActive" = enabled
    where "AIDexterAction_DomainCode" = 'rates';
  update public."sys_AIDexterWatchCapabilities"
    set "AIDexterWatchCapability_IsActive" = enabled
    where "AIDexterWatchCapability_Code" = 'rates';
  return null;
end;
$$;
revoke all on function private.cloud_product_sync_rate_dexter() from public, anon, authenticated, service_role;
create trigger cloud_product_rate_dexter_sync
after insert or update or delete on private.cloud_product_state
for each statement execute function private.cloud_product_sync_rate_dexter();

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_IsActive" = public.multideck_cloud_product_access('rate_management')
where "AIDexterDomain_Code" = 'rates';
update public."sys_AIDexterActions"
set "AIDexterAction_IsActive" = public.multideck_cloud_product_access('rate_management')
where "AIDexterAction_DomainCode" = 'rates';
update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_IsActive" = public.multideck_cloud_product_access('rate_management')
where "AIDexterWatchCapability_Code" = 'rates';

update public."AI_DexterWatches"
set "AIDexterWatch_StatusCode" = 'paused',
    "AIDexterWatch_IsArmed" = true,
    "AIDexterWatch_UpdatedAt" = now()
where "AIDexterWatch_CapabilityCode" = 'rates'
  and "AIDexterWatch_StatusCode" = 'active'
  and not public.multideck_cloud_product_access('rate_management');
